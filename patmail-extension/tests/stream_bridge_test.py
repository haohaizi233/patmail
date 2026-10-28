import importlib.util
import http.client
import json
from pathlib import Path
import threading
import unittest

spec = importlib.util.spec_from_file_location('stream_bridge', Path(__file__).parents[1] / 'scripts' / 'stream-download-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
ORIGIN = 'chrome-extension://' + 'a' * 32


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.server = bridge.make_server(0)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.abort_all()
        self.server.shutdown()
        self.server.server_close()

    def request(self, method, path, body=b'', origin=ORIGIN, seq=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        headers = {'Origin': origin, 'Content-Length': str(len(body)), 'Content-Type': 'application/json'}
        if seq is not None:
            headers['X-Patmail-Sequence'] = str(seq)
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, data

    def create(self):
        status, data = self.request('POST', '/sessions', json.dumps({'fileName': '搜索模板.zip'}).encode())
        self.assertEqual(status, 201)
        return json.loads(data)['token']

    def test_native_consumer_receives_chunks_before_producer_finishes(self):
        token = self.create()
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.request('GET', '/stream/' + token)
        response = connection.getresponse()
        self.assertEqual(response.getheader('Transfer-Encoding'), 'chunked')
        self.assertIn("filename*=UTF-8''", response.getheader('Content-Disposition'))
        self.assertEqual(self.request('PUT', '/stream/' + token, b'first', seq=0)[0], 200)
        self.assertEqual(response.read(5), b'first')
        self.assertFalse(self.server.sessions[token].finished)
        self.assertEqual(self.request('PUT', '/stream/' + token, b'second', seq=1)[0], 200)
        self.assertEqual(self.request('POST', '/finish/' + token)[0], 200)
        self.assertEqual(response.read(), b'second')
        connection.close()

    def test_abort_truncates_instead_of_successfully_closing_download(self):
        token = self.create()
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.request('GET', '/stream/' + token)
        response = connection.getresponse()
        self.request('PUT', '/stream/' + token, b'partial', seq=0)
        self.request('DELETE', '/stream/' + token)
        with self.assertRaises(http.client.IncompleteRead):
            response.read()
        connection.close()

    def test_rejects_web_origins_invalid_names_and_oversized_chunks(self):
        self.assertEqual(self.request('POST', '/sessions', b'{"fileName":"x.zip"}', origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('POST', '/sessions', b'{"fileName":"../x.zip"}')[0], 400)
        token = self.create()
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.putrequest('PUT', '/stream/' + token)
        connection.putheader('Origin', ORIGIN)
        connection.putheader('Content-Length', str(bridge.CHUNK_LIMIT + 1))
        connection.endheaders()
        self.assertEqual(connection.getresponse().status, 413)
        connection.close()

    def test_rejects_duplicates_out_of_order_and_second_consumer(self):
        token = self.create()
        self.assertEqual(self.request('PUT', '/stream/' + token, b'x', seq=1)[0], 409)
        self.assertEqual(self.request('PUT', '/stream/' + token, b'x', seq=0)[0], 200)
        self.assertEqual(self.request('PUT', '/stream/' + token, b'x', seq=0)[0], 409)
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.request('GET', '/stream/' + token)
        response = connection.getresponse()
        self.assertEqual(response.read(1), b'x')
        self.assertEqual(self.request('GET', '/stream/' + token)[0], 409)
        self.request('POST', '/finish/' + token)
        response.read()
        connection.close()

    def test_queue_is_bounded_and_blocks_until_consumed(self):
        token = self.create()
        for index in range(bridge.QUEUE_LIMIT):
            self.assertEqual(self.request('PUT', '/stream/' + token, b'x', seq=index)[0], 200)
        completed = threading.Event()
        def write():
            self.request('PUT', '/stream/' + token, b'y', seq=bridge.QUEUE_LIMIT)
            completed.set()
        thread = threading.Thread(target=write, daemon=True)
        thread.start()
        self.assertFalse(completed.wait(.15))
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        connection.request('GET', '/stream/' + token)
        response = connection.getresponse()
        self.assertTrue(completed.wait(2))
        self.request('POST', '/finish/' + token)
        self.assertEqual(response.read(), b'x' * bridge.QUEUE_LIMIT + b'y')
        connection.close()


if __name__ == '__main__':
    unittest.main()
