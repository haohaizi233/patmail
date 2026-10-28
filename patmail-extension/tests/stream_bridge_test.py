import importlib.util
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid

spec = importlib.util.spec_from_file_location('stream_bridge', Path(__file__).parents[1] / 'scripts' / 'stream-download-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
ORIGIN = 'chrome-extension://' + 'a' * 32


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.start()

    def start(self):
        self.server = bridge.make_server(0, cache_dir=self.tmp.name)
        self.port = self.server.server_port
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def stop(self):
        self.server.abort_all()
        self.server.shutdown()
        self.server.server_close()

    def tearDown(self):
        self.stop()
        self.tmp.cleanup()

    def request(self, method, path, body=b'', seq=None, offset=None, headers=None, origin=ORIGIN):
        if isinstance(body, dict):
            body = json.dumps(body).encode()
        h = {'Origin': origin, 'Content-Length': str(len(body)), 'Content-Type': 'application/json'}
        if seq is not None: h['X-Patmail-Sequence'] = str(seq)
        if offset is not None: h['X-Patmail-Offset'] = str(offset)
        h.update(headers or {})
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request(method, path, body, h)
        r = c.getresponse()
        result = r.status, r.read(), dict(r.getheaders())
        c.close()
        return result

    def create(self, **extra):
        status, data, _ = self.request('POST', '/sessions', {'fileName': '搜索模板.zip', **extra})
        self.assertIn(status, (200, 201))
        return json.loads(data)

    def put(self, session, body, seq=0, offset=None):
        return self.request('PUT', '/stream/' + session['token'], body, seq=seq, offset=offset)[0]

    def test_durable_replay_restart_and_range(self):
        s = self.create(owner='alice', manifest={'items': [{}, {}]})
        self.assertEqual(self.put(s, b'abc'), 200)
        self.assertEqual(self.put(s, b'abc'), 200)
        self.assertEqual(self.put(s, b'xyz'), 409)
        self.assertEqual(self.put(s, b'def', seq=1), 200)
        self.stop()
        self.start()
        url = '/download/' + s['taskId']
        self.assertEqual(self.request('GET', url)[0], 403)
        self.assertEqual(self.request('POST', '/sessions', {'fileName':'搜索模板.zip', 'taskId': s['taskId'], 'owner':'bob'})[0], 403)
        s2 = self.create(taskId=s['taskId'], owner='alice')
        self.assertEqual(s2['receivedBytes'], 6)
        self.assertNotEqual(s['token'], s2['token'])
        self.assertEqual(self.put(s2, b'ab', offset=0), 200)
        self.assertEqual(self.put(s2, b'cdefghi', seq=1, offset=2), 200)
        self.assertEqual(self.request('GET', url, headers={'Range':'bytes=3-'})[0], 503)
        self.assertEqual(self.request('POST', '/finish/' + s2['token'])[0], 200)
        status, body, h = self.request('GET', url, headers={'Range':'bytes=3-'})
        self.assertEqual((status, body), (206, b'defghi'))
        self.assertEqual(h['Content-Range'], 'bytes 3-8/9')
        self.assertEqual(h['Content-Length'], '6')
        self.assertEqual(self.request('GET', url, headers={'Range':'bytes=9-'})[0], 416)
        self.assertEqual(self.request('GET', url, headers={'Range':'bytes=3-', 'If-Range':'"wrong"'})[0], 200)

    def test_disconnect_preserves_producer_and_reconnect(self):
        s = self.create()
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request('GET', '/stream/' + s['token'])
        r = c.getresponse()
        self.assertEqual(r.getheader('Transfer-Encoding'), 'chunked')
        self.assertEqual(self.put(s, b'first'), 200)
        self.assertEqual(r.read(5), b'first')
        c.close()
        self.assertEqual(self.put(s, b'second', seq=1), 200)
        self.assertEqual(self.request('POST', '/finish/' + s['token'])[0], 200)
        self.assertEqual(self.request('GET', '/download/' + s['taskId'])[1], b'firstsecond')

    def test_cache_manifest_and_revoke(self):
        s = self.create(owner='alice', manifest={'items':[{}, {}]})
        token = s['token']
        path = '/cache/' + token + '/0'
        self.assertEqual(self.request('POST', path, {'totalBytes':6, 'etag':'v1'})[0], 200)
        self.assertEqual(self.request('PUT', path, b'abcd', offset=0)[0], 200)
        self.assertEqual(self.request('PUT', path, b'cdef', offset=2)[0], 200)
        self.assertEqual(self.request('PUT', path, b'xx', offset=2)[0], 409)
        self.assertEqual(self.request('POST', path, {'complete':True})[0], 200)
        self.assertEqual(self.request('GET', path + '?offset=1&limit=3')[1], b'bcd')
        cp = '/manifest/' + token
        self.assertEqual(self.request('POST', cp, {'offset':0,'names':['a','b']})[0], 200)
        self.assertEqual(self.request('POST', cp, {'offset':0,'names':['a','b']})[0], 200)
        self.assertEqual(self.request('POST', cp, {'offset':0,'names':['z','b']})[0], 409)
        self.assertEqual(self.request('POST', cp, {'offset':0,'names':['a']})[0], 409)
        self.assertEqual(self.request('POST', '/revoke/' + token)[0], 200)
        self.assertEqual(self.put(s, b'x'), 403)
        self.assertEqual(self.request('GET', '/download/' + s['taskId'])[0], 403)
        s = self.create(taskId=s['taskId'], owner='alice')
        self.assertEqual(s['manifest']['cachedNames']['0'], ['a','b'])
        self.assertEqual(self.request('GET', '/cache-info/' + s['token'] + '/0')[0], 200)

    def test_uncommitted_tail_truncated_committed_corruption_fails_closed(self):
        s = self.create()
        self.assertEqual(self.put(s, b'abc'), 200)
        self.stop()
        spool = Path(self.tmp.name) / s['taskId'] / 'archive.bin'
        with spool.open('ab') as f: f.write(b'garbage')
        self.start()
        self.assertEqual(spool.read_bytes(), b'abc')
        self.stop()
        spool.write_bytes(b'bad')
        self.start()
        self.assertEqual(self.request('POST', '/sessions', {'fileName':'搜索模板.zip','taskId':s['taskId']})[0], 409)

    def test_rejects_untrusted_paths_origins_sizes_and_discards(self):
        self.assertEqual(self.request('POST', '/sessions', {'fileName':'x.zip'}, origin='https://evil.test')[0], 403)
        self.assertEqual(self.request('POST', '/sessions', {'fileName':'../x.zip'})[0], 400)
        self.assertEqual(self.request('POST', '/sessions', {'fileName':'x.zip','taskId':'../x'})[0], 400)
        s = self.create()
        self.assertEqual(self.request('PUT', '/stream/' + s['token'], headers={'Content-Length':str(bridge.CHUNK_LIMIT+1)})[0], 413)
        self.assertEqual(self.request('DELETE', '/stream/' + s['token'])[0], 200)
        self.assertFalse((Path(self.tmp.name) / s['taskId']).exists())

    def test_pause_expiry_is_not_extended_by_touch(self):
        s = self.create()
        token = s['token']
        self.request('POST', '/pause/' + token)
        task = self.server.tasks[s['taskId']]
        with task.condition:
            task.data['retainedAt'] = bridge.time.time() - bridge.RETENTION_SECONDS - 1
            task.persist()
        self.request('POST', '/touch/' + token)
        self.server.sweep(force=True)
        self.assertFalse(task.directory.exists())

    def test_metadata_commit_failure_does_not_ack_or_keep_unconfirmed_bytes(self):
        s = self.create()
        self.assertEqual(self.put(s, b'abc'), 200)
        task = self.server.tasks[s['taskId']]
        original = bridge.atomic_json
        calls = [0]
        def fail_once(path, value):
            calls[0] += 1
            if calls[0] == 1: raise OSError('disk full')
            return original(path, value)
        bridge.atomic_json = fail_once
        try:
            self.assertEqual(self.put(s, b'def', seq=1), 507)
        finally:
            bridge.atomic_json = original
        self.assertEqual(task.data['archive']['receivedBytes'], 3)
        self.assertEqual(task.path().read_bytes(), b'abc')
        self.assertTrue(task.data['paused'])
        s = self.create(taskId=s['taskId'])
        self.assertEqual(self.put(s, b'abcdef', offset=0), 200)

    def test_revocation_interrupts_live_download(self):
        s = self.create(owner='alice')
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        c.request('GET', '/download/' + s['taskId'])
        r = c.getresponse()
        self.assertEqual(self.put(s, b'a'), 200)
        self.assertEqual(r.read(1), b'a')
        self.assertEqual(self.request('POST', '/revoke/' + s['token'])[0], 200)
        with self.assertRaises(http.client.IncompleteRead): r.read()
        c.close()

    def test_invalid_cache_metadata_cannot_change_confirmed_source(self):
        s = self.create(manifest={'items':[{}]})
        path = '/cache/' + s['token'] + '/0'
        self.request('POST', path, {'etag':'v1'})
        self.request('PUT', path, b'abc', offset=0)
        self.assertEqual(self.request('POST', path, {'etag':'v1','totalBytes':2})[0], 409)
        info = json.loads(self.request('GET', '/cache-info/' + s['token'] + '/0')[1])
        self.assertEqual(info['receivedBytes'], 3)
        self.assertEqual(info['totalBytes'], None)

    def test_metadata_limit_rolls_back_unconfirmed_tail(self):
        s = self.create()
        self.assertEqual(self.put(s, b'abc'), 200)
        task = self.server.tasks[s['taskId']]
        original = bridge.METADATA_LIMIT
        bridge.METADATA_LIMIT = 1
        try:
            self.assertEqual(self.put(s, b'def', seq=1), 507)
        finally: bridge.METADATA_LIMIT = original
        self.assertEqual(task.data['archive']['receivedBytes'], 3)
        self.assertEqual(task.path().read_bytes(), b'abc')

    def test_malformed_metadata_fails_closed_without_breaking_startup(self):
        s = self.create()
        self.stop()
        path = Path(self.tmp.name) / s['taskId'] / 'task.json'
        path.write_text(json.dumps({'taskId':s['taskId']}), encoding='utf8')
        self.start()
        self.assertEqual(self.request('POST','/sessions',{'fileName':'搜索模板.zip','taskId':s['taskId']})[0],409)
    def test_runtime_source_corruption_is_not_returned_as_valid_bytes(self):
        s = self.create()
        path = '/cache/' + s['token'] + '/0'
        self.request('POST', path, {})
        self.request('PUT', path, b'abc', offset=0)
        self.server.tasks[s['taskId']].path(0).write_bytes(b'bad')
        self.assertEqual(self.request('GET', path)[0], 409)

    def test_seal_and_resume_retain_etag_and_source_cache_after_restart(self):
        s = self.create(owner='alice', manifest={'items':[{}]})
        path = '/cache/' + s['token'] + '/0'
        self.request('POST', path, {'totalBytes':3})
        self.request('PUT', path, b'abc', offset=0)
        self.request('POST', path, {'complete':True})
        self.put(s,b'zip')
        self.request('POST','/finish/'+s['token'])
        before = self.request('GET','/download/'+s['taskId'])[2]['ETag']
        self.stop()
        self.start()
        new = self.create(taskId=s['taskId'],owner='alice')
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[2]['ETag'],before)
        self.assertEqual(self.request('GET','/cache/'+new['token']+'/0')[1],b'abc')
        info = json.loads(self.request('GET','/cache-info/'+new['token']+'/0')[1])
        self.assertTrue(info['complete'])
        self.assertEqual(self.put(s,b'wrong'),404)

    def test_task_discard_checks_origin_and_owner_without_writer_token(self):
        s = self.create(owner='alice')
        endpoint = '/discard-task/' + s['taskId']
        self.assertEqual(self.request('POST', endpoint, {'owner':'bob'})[0],403)
        self.assertTrue((Path(self.tmp.name)/s['taskId']).exists())
        self.assertEqual(self.request('POST', endpoint, {'owner':'alice'})[0],200)
        self.assertFalse((Path(self.tmp.name)/s['taskId']).exists())
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[0],404)
        self.assertEqual(self.request('POST', endpoint, {'owner':'alice'})[0],404)

    def test_manifest_server_timestamp_is_stable_iso_string(self):
        from datetime import datetime
        s = self.create(manifest={'items':[{}]})
        timestamp = s['manifest']['zipCreatedAt']
        self.assertIsInstance(timestamp, str)
        self.assertIsNotNone(datetime.fromisoformat(timestamp))
        resumed = self.create(taskId=s['taskId'], manifest={'items':[{}]})
        self.assertEqual(resumed['manifest']['zipCreatedAt'],timestamp)

    def test_uncached_source_info_is_empty_without_creating_file(self):
        s = self.create(manifest={'items':[{}]})
        token = s['token']
        status, body, _ = self.request('GET', '/cache-info/' + token + '/0')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'receivedBytes':0, 'complete':False,
                         'totalBytes':None, 'etag':None, 'lastModified':None})
        self.assertFalse(self.server.tasks[s['taskId']].path(0).exists())
        self.assertEqual(self.request('GET', '/cache/' + token + '/0')[0], 404)
        self.assertEqual(self.request('GET', '/cache-info/' + token + '/1')[0], 400)
        self.assertEqual(self.request('GET', '/cache-info/' + ('0' * 64) + '/0')[0], 404)

    def test_pause_truncates_live_download_and_preserves_authorized_bytes(self):
        s = self.create(owner='alice')
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=1)
        connection.request('GET', '/download/' + s['taskId'])
        response = connection.getresponse()
        self.assertEqual(self.put(s, b'abc'), 200)
        self.assertEqual(response.read(3), b'abc')
        self.assertEqual(self.request('POST', '/pause/' + s['token'])[0], 200)
        try:
            with self.assertRaises(http.client.IncompleteRead): response.read()
        finally: connection.close()
        task = self.server.tasks[s['taskId']]
        self.assertTrue(task.authorized)
        self.assertEqual(task.path().read_bytes(), b'abc')
        resumed = self.create(taskId=s['taskId'], owner='alice')
        self.assertEqual(self.put(resumed, b'abcdef', offset=0), 200)
        self.request('POST', '/finish/' + resumed['token'])
        status, body, _ = self.request('GET', '/download/' + s['taskId'], headers={'Range':'bytes=3-'})
        self.assertEqual((status, body), (206, b'def'))

    def test_authenticated_post_read_aliases_keep_get_origin_strict(self):
        s = self.create(manifest={'items':[{}]})
        token = s['token']
        status, body, _ = self.request('POST', '/status/' + token, {})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['taskId'], s['taskId'])
        info_path = '/cache-info/' + token + '/0'
        self.assertEqual(json.loads(self.request('POST', info_path, {})[1])['receivedBytes'], 0)
        path = '/cache/' + token + '/0'
        self.assertEqual(self.request('POST', path, {'read':True,'offset':0,'limit':65536})[0],404)
        self.request('POST',path,{'totalBytes':6})
        self.request('PUT',path,b'abcdef',offset=0)
        self.assertEqual(self.request('POST',path,{'read':True,'offset':2,'limit':3})[1],b'cde')
        self.assertEqual(self.request('POST',path,{'read':True,'offset':0,'limit':65537})[0],400)
        self.assertEqual(self.request('POST','/cache-info/'+token+'/1',{})[0],400)
        self.assertEqual(self.request('GET','/status/'+token,origin='')[0],403)
        self.assertEqual(self.request('POST','/status/'+token,{},origin='')[0],403)
        # Another thread acquiring the lease proves no nested session lock leaked.
        self.assertEqual(self.put(s,b'zip'),200)

if __name__ == '__main__': unittest.main()
