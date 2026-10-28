"""PatMail 本机流桥接。只绑定回环地址、只中转有界字节流，不访问业务源或读写文件。"""
import argparse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import socket
import threading
import time
from urllib.parse import quote

PORT = 42843
PROTOCOL = 'patmail-stream-v1'
CHUNK_LIMIT = 256 * 1024
QUEUE_LIMIT = 4
IDLE_LIMIT = 600
ORIGIN = re.compile(r'chrome-extension://[a-p]{32}$')


class Session:
    def __init__(self, filename, origin):
        self.filename = filename
        self.origin = origin
        self.condition = threading.Condition()
        self.chunks = deque()
        self.sequence = 0
        self.finished = False
        self.aborted = False
        self.claimed = False
        self.completed = False
        self.touched = time.monotonic()

    def abort(self):
        with self.condition:
            self.aborted = True
            self.chunks.clear()
            self.condition.notify_all()


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def __init__(self, port):
        self.sessions = {}
        self.lock = threading.Lock()
        super().__init__(('127.0.0.1', port), Handler)

    def abort_all(self):
        with self.lock:
            for session in self.sessions.values():
                session.abort()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_args):
        pass  # 不记录能力令牌、文件名称或内容。

    def cors(self):
        origin = self.headers.get('Origin', '')
        if ORIGIN.fullmatch(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')

    def answer(self, status, data=None):
        body = json.dumps(data or {}, ensure_ascii=True).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def authorized_origin(self):
        return bool(ORIGIN.fullmatch(self.headers.get('Origin', '')))

    def do_OPTIONS(self):
        if not self.authorized_origin():
            return self.answer(403)
        self.send_response(204)
        self.cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Patmail-Sequence')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def get_session(self):
        token = self.path.rsplit('/', 1)[-1]
        if not re.fullmatch(r'[0-9a-f]{64}', token):
            return None
        with self.server.lock:
            return self.server.sessions.get(token)

    def owned_session(self):
        session = self.get_session()
        return session if session and session.origin == self.headers.get('Origin') else None

    def body(self, limit):
        length = self.headers.get('Content-Length', '')
        if not length.isdecimal() or int(length) > limit:
            self.answer(413)
            return None
        self.connection.settimeout(30)
        body = self.rfile.read(int(length))
        if len(body) != int(length):
            raise ConnectionError('Incomplete request')
        return body

    def do_POST(self):
        if not self.authorized_origin():
            return self.answer(403)
        if self.path == '/sessions':
            body = self.body(2048)
            if body is None:
                return
            try:
                data = json.loads(body)
                name = data['fileName']
                if not isinstance(name, str) or not name.endswith('.zip') or len(name) > 120 or re.search(r'[\\/<>:"|?*\x00-\x1f]', name):
                    raise ValueError('Invalid name')
            except (ValueError, KeyError, TypeError):
                return self.answer(400)
            with self.server.lock:
                stale = [token for token, session in self.server.sessions.items()
                         if session.completed or session.aborted or time.monotonic() - session.touched > IDLE_LIMIT]
                for token in stale:
                    self.server.sessions.pop(token).abort()
                if len(self.server.sessions) >= 2:
                    return self.answer(429)
                token = secrets.token_hex(32)
                self.server.sessions[token] = Session(name, self.headers['Origin'])
            return self.answer(201, {'protocol': PROTOCOL, 'token': token})
        if self.path.startswith('/touch/'):
            session = self.owned_session()
            if not session:
                return self.answer(404)
            with session.condition:
                if session.aborted:
                    return self.answer(409)
                session.touched = time.monotonic()
            return self.answer(200)
        if self.path.startswith('/finish/'):
            session = self.owned_session()
            if not session:
                return self.answer(404)
            with session.condition:
                if session.aborted or session.finished:
                    return self.answer(409)
                session.finished = True
                session.touched = time.monotonic()
                session.condition.notify_all()
            return self.answer(200)
        self.answer(404)

    def do_PUT(self):
        if not self.authorized_origin():
            return self.answer(403)
        session = self.owned_session() if self.path.startswith('/stream/') else None
        if not session:
            return self.answer(404)
        body = self.body(CHUNK_LIMIT)
        if body is None:
            return
        sequence = self.headers.get('X-Patmail-Sequence', '')
        with session.condition:
            if not sequence.isdecimal() or int(sequence) != session.sequence:
                return self.answer(409)
            while len(session.chunks) >= QUEUE_LIMIT and not session.aborted:
                if time.monotonic() - session.touched > IDLE_LIMIT:
                    session.abort()
                    break
                session.condition.wait(.5)
            if session.aborted or session.finished:
                return self.answer(409)
            # 另一个写请求可能在等待期间消费同一个序号。
            if int(sequence) != session.sequence:
                return self.answer(409)
            if body:
                session.chunks.append(body)
            session.sequence += 1
            session.touched = time.monotonic()
            session.condition.notify_all()
        self.answer(200)

    def do_DELETE(self):
        if not self.authorized_origin():
            return self.answer(403)
        session = self.owned_session() if self.path.startswith('/stream/') else None
        if not session:
            return self.answer(404)
        session.abort()
        self.answer(200)

    def do_GET(self):
        if self.path == '/health':
            return self.answer(200, {'protocol': PROTOCOL})
        session = self.get_session() if self.path.startswith('/stream/') else None
        if not session:
            return self.answer(404)
        with session.condition:
            if session.claimed or session.aborted:
                return self.answer(409)
            session.claimed = True
        self.send_response(200)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', "attachment; filename=download.zip; filename*=UTF-8''" + quote(session.filename, safe=''))
        self.send_header('Transfer-Encoding', 'chunked')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.flush()
        self.close_connection = True
        try:
            while True:
                with session.condition:
                    while not session.chunks and not session.finished and not session.aborted:
                        if time.monotonic() - session.touched > IDLE_LIMIT:
                            session.abort()
                            break
                        session.condition.wait(.5)
                    if session.aborted:
                        return  # 不写结束chunk，浏览器必须判中断。
                    if session.chunks:
                        chunk = session.chunks.popleft()
                        session.condition.notify_all()
                    else:
                        self.wfile.write(b'0\r\n\r\n')
                        self.wfile.flush()
                        session.completed = True
                        return
                self.wfile.write(f'{len(chunk):x}\r\n'.encode() + chunk + b'\r\n')
                self.wfile.flush()
                session.touched = time.monotonic()
        except (OSError, ConnectionError):
            session.abort()


def make_server(port=PORT):
    return BridgeServer(port)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=PORT)
    args = parser.parse_args()
    server = make_server(args.port)
    print(f'PatMail stream bridge: http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.abort_all()
        server.server_close()
