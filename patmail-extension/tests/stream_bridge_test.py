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

    def test_cumulative_metadata_limit_rejects_before_ack_and_remains_recoverable(self):
        original = bridge.METADATA_LIMIT
        bridge.METADATA_LIMIT = 2048
        try:
            s = self.create()
            accepted = 0
            for n in range(40):
                status = self.put(s,b'x',seq=n)
                if status == 507: break
                self.assertEqual(status,200)
                accepted += 1
            self.assertLess(accepted,40,'cumulative checkpoint size must be checked before ACK')
            task = self.server.tasks[s['taskId']]
            self.assertEqual(task.data['archive']['receivedBytes'],accepted)
            self.assertEqual(task.path().read_bytes(),b'x'*accepted)
            self.assertFalse(task.corrupt)
            self.stop()
            self.start()
            resumed = self.create(taskId=s['taskId'])
            self.assertEqual(resumed['receivedBytes'],accepted)
            self.assertEqual(self.request('POST','/finish/'+resumed['token'])[0],200)
        finally: bridge.METADATA_LIMIT = original

    def test_incremental_metadata_budget_matches_checkpoint_for_all_hot_operations(self):
        s = self.create(manifest={'items':[{},{}]})
        task = self.server.tasks[s['taskId']]
        def check():
            self.assertEqual(task.metadata_size,bridge.json_size({**task.data,'_journalSeq':task.journal_seq}))
        check()
        path = '/cache/'+s['token']+'/0'
        operations = [('POST',path,{'etag':'a','totalBytes':3},None),
                      ('PUT',path,b'abc',0),('POST',path,{'complete':True},None),
                      ('POST',path,{'reset':True,'etag':'longer validator','totalBytes':None},None),
                      ('PUT',path,b'abcd',0),
                      ('POST','/manifest/'+s['token'],{'offset':0,'names':['名字','two']},None),
                      ('POST','/manifest/'+s['token'],{'offset':0,'names':['名字','two']},None)]
        for method,url,body,offset in operations:
            self.assertEqual(self.request(method,url,body,offset=offset)[0],200)
            check()
        for n in range(12):
            self.assertEqual(self.put(s,b'x',seq=n),200)
            check()
        with task.condition: task.rollback()
        check()

    def test_source_directory_entry_is_durable_before_metadata_journal(self):
        s = self.create()
        task = self.server.tasks[s['taskId']]
        events = []
        original_replace, original_append = bridge.durable_replace, bridge.append_journal
        def replace(temp,path):
            result = original_replace(temp,path)
            if path.name == 'source-0.bin': events.append('source durable')
            return result
        def append(path,record):
            events.append('metadata')
            return original_append(path,record)
        bridge.durable_replace, bridge.append_journal = replace, append
        try: self.assertEqual(self.request('POST','/cache/'+s['token']+'/0',{})[0],200)
        finally: bridge.durable_replace, bridge.append_journal = original_replace, original_append
        self.assertEqual(events,['source durable','metadata','metadata'])

    def test_large_manifest_hot_writes_use_bounded_incremental_metadata(self):
        s = self.create(manifest={'items':[{'key':'x' * 1000} for _ in range(1607)]})
        task = self.server.tasks[s['taskId']]
        before = (task.directory / 'task.json').read_bytes()
        for n in range(20):
            self.assertEqual(self.put(s, b'x' * 65536, seq=n), 200)
        self.assertEqual((task.directory / 'task.json').read_bytes(), before,
                         'hot chunks must not rewrite the large manifest')
        self.assertLess((task.directory / 'task.log').stat().st_size, 20000)
        self.stop()
        self.start()
        self.assertEqual(self.create(taskId=s['taskId'])['receivedBytes'],20 * 65536)

    def test_journal_torn_tail_is_truncated_but_complete_corruption_fails_closed(self):
        s = self.create()
        self.assertEqual(self.put(s,b'abc'),200)
        taskdir = self.server.tasks[s['taskId']].directory
        self.stop()
        journal = taskdir / 'task.log'
        self.assertTrue(journal.exists())
        with journal.open('ab') as stream: stream.write(b'{"torn":')
        self.start()
        self.assertEqual(self.create(taskId=s['taskId'])['receivedBytes'],3)
        self.stop()
        with journal.open('ab') as stream: stream.write(b'{"corrupt":true}\n')
        self.start()
        self.assertEqual(self.request('POST','/sessions',{'fileName':'搜索模板.zip','taskId':s['taskId']})[0],409)

    def test_legacy_checkpoint_without_journal_migrates_and_preserves_sources(self):
        s = self.create()
        path = '/cache/' + s['token'] + '/0'
        self.assertEqual(self.request('POST',path,{'etag':'version-one'})[0],200)
        self.assertEqual(self.request('PUT',path,b'abc',offset=0)[0],200)
        task = self.server.tasks[s['taskId']]
        with task.condition: task.persist()
        directory = task.directory
        self.stop()
        record = json.loads((directory / 'task.json').read_text('utf8'))
        record.pop('_journalSeq', None)
        (directory / 'task.json').write_text(json.dumps(record),encoding='utf8')
        (directory / 'task.log').unlink()
        self.start()
        resumed = self.create(taskId=s['taskId'])
        self.assertEqual(self.request('GET','/cache/'+resumed['token']+'/0')[1],b'abc')

    def test_journal_fsync_failure_truncates_record_and_unconfirmed_payload(self):
        s = self.create()
        self.assertEqual(self.put(s,b'abc'),200)
        task = self.server.tasks[s['taskId']]
        log = task.directory / 'task.log'
        original = bridge.os.fsync
        failed = [False]
        def fail_metadata(fd):
            # Verify the real file descriptor, so payload fsync still runs normally.
            import os
            if not failed[0] and os.path.samestat(os.fstat(fd), log.stat()):
                failed[0] = True
                raise OSError('simulated metadata disk full')
            return original(fd)
        bridge.os.fsync = fail_metadata
        try: self.assertEqual(self.put(s,b'def',seq=1),507)
        finally: bridge.os.fsync = original
        self.assertTrue(failed[0])
        self.assertEqual(task.path().read_bytes(),b'abc')
        self.stop()
        self.start()
        self.assertEqual(self.create(taskId=s['taskId'])['receivedBytes'],3)

    def test_source_and_name_updates_do_not_rewrite_large_manifest(self):
        s = self.create(manifest={'items':[{'key':'x'*1000} for _ in range(1607)]})
        task = self.server.tasks[s['taskId']]
        before = (task.directory/'task.json').read_bytes()
        path = '/cache/'+s['token']+'/0'
        self.assertEqual(self.request('POST',path,{'totalBytes':3,'etag':'v1'})[0],200)
        self.assertEqual(self.request('PUT',path,b'abc',offset=0)[0],200)
        self.assertEqual(self.request('POST',path,{'complete':True})[0],200)
        self.assertEqual(self.request('POST','/manifest/'+s['token'],{'offset':0,'names':['synthetic']})[0],200)
        self.assertEqual((task.directory/'task.json').read_bytes(),before)
        self.stop()
        self.start()
        resumed = self.create(taskId=s['taskId'])
        info = json.loads(self.request('GET','/cache-info/'+resumed['token']+'/0')[1])
        self.assertTrue(info['complete'])
        self.assertEqual(info['etag'],'v1')
        self.assertEqual(resumed['manifest']['cachedNames']['0'],['synthetic'])

    def test_journal_checksum_mismatch_and_sequence_gap_fail_closed(self):
        for damage in ('checksum', 'sequence', 'patch'):
            with self.subTest(damage=damage):
                s = self.create()
                self.assertEqual(self.put(s,b'abc'),200)
                journal = self.server.tasks[s['taskId']].directory / 'task.log'
                self.stop()
                record = json.loads(journal.read_text('utf8'))
                if damage == 'checksum':
                    record['sha256'] = '0' * 64
                else:
                    payload = json.loads(record['payload'])
                    if damage == 'sequence': payload['seq'] += 1
                    else: payload['patches'] = [['set', [], 1]]
                    record['payload'] = json.dumps(payload)
                    record['sha256'] = bridge.hashlib.sha256(record['payload'].encode()).hexdigest()
                journal.write_text(json.dumps(record)+'\n',encoding='utf8')
                self.start()
                self.assertEqual(self.request('POST','/sessions',{'fileName':'搜索模板.zip','taskId':s['taskId']})[0],409)

    def test_checkpoint_sequence_prevents_duplicate_journal_replay(self):
        s = self.create()
        self.assertEqual(self.put(s,b'abc'),200)
        task = self.server.tasks[s['taskId']]
        journal = task.directory / 'task.log'
        self.assertTrue(journal.exists())
        old_log = journal.read_bytes()
        with task.condition: task.persist()
        journal.write_bytes(old_log)  # Crash between atomic checkpoint and log truncation.
        self.stop()
        self.start()
        self.assertEqual(self.create(taskId=s['taskId'])['receivedBytes'],3)
        self.assertEqual(len(self.server.tasks[s['taskId']].data['archive']['commits']),1)

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
        original = bridge.append_journal
        calls = [0]
        def fail_once(path, value):
            calls[0] += 1
            if calls[0] == 1: raise OSError('disk full')
            return original(path, value)
        bridge.append_journal = fail_once
        try:
            self.assertEqual(self.put(s, b'def', seq=1), 507)
        finally:
            bridge.append_journal = original
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

    def test_authority_revokes_other_owner_without_writer_token(self):
        s = self.create(owner='alice')
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=2)
        c.request('GET','/download/'+s['taskId'])
        response = c.getresponse()
        self.put(s,b'abc')
        self.assertEqual(response.read(3),b'abc')
        other_origin = 'chrome-extension://' + 'b' * 32
        self.assertEqual(self.request('POST','/authority',{'owner':'bob'},origin=other_origin)[0],200)
        self.assertTrue(self.server.tasks[s['taskId']].authorized)
        self.assertEqual(self.request('POST','/authority',{'owner':'bob'})[0],200)
        with self.assertRaises(http.client.IncompleteRead): response.read()
        c.close()
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[0],403)
        self.assertEqual(self.put(s,b'bad'),403)
        self.request('POST','/authority',{'owner':'alice'})
        self.assertFalse(self.server.tasks[s['taskId']].authorized)
        renewed = self.create(taskId=s['taskId'],owner='alice')
        self.assertEqual(self.put(renewed,b'abcdef',offset=0),200)
        self.assertEqual(self.request('POST','/authority',{'owner':''})[0],200)
        self.assertFalse(self.server.tasks[s['taskId']].authorized)
        self.assertEqual(self.request('POST','/authority',{'owner':1})[0],400)

    def test_authority_revokes_all_before_any_disk_failure(self):
        first = self.create(owner='alice')
        second = self.create(owner='alice')
        task = self.server.tasks[first['taskId']]
        original = task.persist
        def fail(): raise OSError('simulated disk full')
        task.persist = fail
        try:
            self.assertEqual(self.request('POST','/authority',{'owner':''})[0],507)
            self.assertFalse(self.server.tasks[first['taskId']].authorized)
            self.assertFalse(self.server.tasks[second['taskId']].authorized)
            self.assertEqual(self.request('GET','/download/'+second['taskId'])[0],403)
        finally: task.persist = original

    def test_completed_receipt_survives_restart_and_removes_payloads(self):
        s = self.create(owner='alice')
        token = s['token']
        endpoint = '/complete/' + token
        self.assertEqual(self.request('POST',endpoint,{'downloadId':42})[0],409)
        self.request('POST','/cache/'+token+'/0',{})
        self.request('PUT','/cache/'+token+'/0',b'source',offset=0)
        self.put(s,b'zip-bytes')
        self.request('POST','/finish/'+token)
        self.assertEqual(self.request('POST',endpoint,{'downloadId':42})[0],200)
        info = json.loads(self.request('POST','/status/'+token,{})[1])
        self.assertTrue(info['completed'])
        self.assertEqual(info['completedBytes'],9)
        self.assertEqual(info['completedDownloadId'],42)
        taskdir = Path(self.tmp.name)/s['taskId']
        self.assertEqual([path.name for path in taskdir.iterdir()],['task.json'])
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[0],410)
        # Simulate a crash after receipt commit but before payload deletion.
        (taskdir/'archive.bin').write_bytes(b'orphan')
        (taskdir/'source-0.bin').write_bytes(b'orphan')
        self.stop()
        self.start()
        resumed = self.create(taskId=s['taskId'],owner='alice')
        self.assertTrue(resumed['completed'])
        self.assertEqual(resumed['completedBytes'],9)
        self.assertEqual(resumed['completedDownloadId'],42)
        self.assertFalse((taskdir/'archive.bin').exists())
        self.assertFalse((taskdir/'source-0.bin').exists())
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[0],410)

    def test_pause_task_invalidates_writer_but_preserves_replay(self):
        s = self.create(owner='alice')
        self.put(s,b'abc')
        endpoint = '/pause-task/' + s['taskId']
        self.assertEqual(self.request('POST',endpoint,{'owner':'bob'})[0],403)
        self.assertEqual(self.request('POST',endpoint,{'owner':'alice'})[0],200)
        task = self.server.tasks[s['taskId']]
        self.assertTrue(task.authorized)
        self.assertEqual(task.path().read_bytes(),b'abc')
        self.assertEqual(self.put(s,b'def',seq=1),404)
        renewed = self.create(taskId=s['taskId'],owner='alice')
        self.assertEqual(self.put(renewed,b'abcdef',offset=0),200)

    def test_completion_receipt_stays_readable_when_payload_cleanup_is_blocked(self):
        s = self.create()
        self.put(s,b'zip')
        self.request('POST','/finish/'+s['token'])
        original = Path.unlink
        def blocked(path, *args, **kwargs):
            if path.name == 'archive.bin': raise OSError('temporarily locked payload')
            return original(path, *args, **kwargs)
        Path.unlink = blocked
        try:
            self.assertEqual(self.request('POST','/complete/'+s['token'],{})[0],200)
            self.assertTrue(self.create(taskId=s['taskId'])['completed'])
        finally: Path.unlink = original
        self.assertEqual(self.request('GET','/download/'+s['taskId'])[0],410)

if __name__ == '__main__': unittest.main()
