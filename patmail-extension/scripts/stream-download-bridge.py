"""Loopback durable download bridge. No credentials or business endpoints are stored."""
import argparse
import bisect
import copy
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import struct
import threading
import time
from urllib.parse import quote, urlsplit, parse_qs
import uuid

PORT = 42843
PROTOCOL = 'patmail-stream-v1'
CHUNK_LIMIT = 256 * 1024
READ_LIMIT = 64 * 1024
METADATA_LIMIT = 16 * 1024 * 1024
MAX_TASKS = 128
MAX_ITEMS = 100000
MAX_BYTES = 1 << 40
RETENTION_SECONDS = 7 * 86400
IDLE_LIMIT = 600
ORIGIN = re.compile(r'chrome-extension://[a-p]{32}$')
TOKEN = re.compile(r'[0-9a-f]{64}$')
TASK_ID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


class Problem(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def integer(value, maximum=MAX_BYTES):
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
        raise Problem(400, 'invalid_number')
    return value


def atomic_json(path, value):
    """Data fsync precedes replace; write-through replace on Windows, directory fsync on POSIX."""
    data = json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode()
    if len(data) > METADATA_LIMIT:
        raise Problem(413, 'metadata_limit')
    temp = path.with_suffix('.tmp')
    with temp.open('wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        move = ctypes.WinDLL('kernel32', use_last_error=True).MoveFileExW
        move.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
        move.restype = wintypes.BOOL
        if not move(str(temp), str(path), 0x1 | 0x8):
            raise ctypes.WinError(ctypes.get_last_error())
    else:
        os.replace(temp, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)


def new_blob():
    return {'receivedBytes':0, 'commits':[], 'complete':False, 'totalBytes':None, 'etag':None, 'lastModified':None}


class Session:
    def __init__(self, server, data):
        self.server = server
        self.data = data
        self.directory = server.cache_dir / data['taskId']
        self.condition = threading.Condition(threading.RLock())
        self.token = None
        self.sequence = 0
        self.cursor = 0
        self.authorized = False
        self.revocation = 0
        self.aborted = False
        self.corrupt = False
        self.consumers = set()
        self.touched = time.monotonic()

    @property
    def finished(self): return self.data['sealed']

    def path(self, index=None):
        return self.directory / ('archive.bin' if index is None else 'source-' + str(index) + '.bin')

    def persist(self):
        try: atomic_json(self.directory / 'task.json', self.data)
        except Problem as error:
            raise OSError('Metadata capacity exhausted') from error

    def revoke_readers(self):
        self.revocation += 1
        for connection in tuple(self.consumers):
            try: connection.shutdown(socket.SHUT_RDWR)
            except OSError: pass
        self.condition.notify_all()

    def info(self):
        return {'protocol':PROTOCOL, 'version':2, 'taskId':self.data['taskId'],
                'receivedBytes':self.data['archive']['receivedBytes'], 'sequence':self.sequence,
                'sealed':self.finished, 'manifest':self.data['manifest'],
                'paused':self.data['paused'], 'authorized':self.authorized, 'error':self.data.get('error')}

    def acknowledgement(self):
        return {'taskId':self.data['taskId'], 'receivedBytes':self.data['archive']['receivedBytes'],
                'sequence':self.sequence, 'sealed':self.finished, 'paused':self.data['paused']}

    def verify(self, path, blob):
        count = integer(blob['receivedBytes'])
        if not path.exists():
            if count: raise ValueError('Missing committed bytes')
            path.touch()
        with path.open('r+b') as stream:
            cursor = 0
            for commit in blob['commits']:
                offset, length, digest = commit
                if offset != cursor or not 0 < length <= CHUNK_LIMIT:
                    raise ValueError('Invalid commit')
                chunk = stream.read(length)
                if len(chunk) != length or hashlib.sha256(chunk).hexdigest() != digest:
                    raise ValueError('Corrupt committed bytes')
                cursor += length
            if cursor != count: raise ValueError('Invalid watermark')
            if stream.seek(0, 2) < count: raise ValueError('Short file')
            stream.truncate(count)
            stream.flush()
            os.fsync(stream.fileno())

    def rollback(self):
        """A failed metadata commit never advances the acknowledged watermark."""
        self.data = json.loads((self.directory / 'task.json').read_text('utf-8'))
        self.verify(self.path(), self.data['archive'])
        for key, blob in self.data['sources'].items(): self.verify(self.path(int(key)), blob)

    def read_verified(self, index, blob, offset, limit):
        output = bytearray()
        commits = blob['commits']
        position = max(0, bisect.bisect_right(commits, offset, key=lambda entry: entry[0]) - 1)
        with self.path(index).open('rb') as stream:
            while position < len(commits) and len(output) < limit:
                at, length, digest = commits[position]
                stream.seek(at)
                chunk = stream.read(length)
                if len(chunk) != length or hashlib.sha256(chunk).hexdigest() != digest:
                    self.corrupt = True
                    self.authorized = False
                    self.revoke_readers()
                    raise Problem(409, 'corrupt_cache')
                start = max(offset - at, 0)
                output.extend(chunk[start:start + limit - len(output)])
                position += 1
        return bytes(output)

    def append(self, index, blob, offset, body):
        count = blob['receivedBytes']
        if offset > count: raise Problem(409, 'offset_gap')
        end = offset + len(body)
        if end > MAX_BYTES: raise Problem(413, 'task_size_limit')
        if index is not None and blob['totalBytes'] is not None and end > blob['totalBytes']:
            raise Problem(409, 'source_length_exceeded')
        overlap = min(len(body), count - offset)
        with self.path(index).open('r+b') as stream:
            stream.seek(offset)
            if stream.read(overlap) != body[:overlap]: raise Problem(409, 'prefix_mismatch')
            tail = body[overlap:]
            if tail:
                if blob['complete'] or (index is None and self.finished): raise Problem(409, 'sealed')
                stream.seek(count)
                stream.write(tail)
                stream.flush()
                os.fsync(stream.fileno())
                blob['commits'].append([count, len(tail), hashlib.sha256(tail).hexdigest()])
                blob['receivedBytes'] = end
                self.persist()
        self.touched = time.monotonic()
        self.condition.notify_all()

    def abort(self):
        with self.condition:
            self.aborted = True
            self.authorized = False
            self.revoke_readers()


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def __init__(self, port, cache_dir=None):
        default = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'share'))) / 'PatMail' / 'download-cache'
        self.cache_dir = Path(cache_dir or default).resolve()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # A second bridge must not race metadata updates in the same cache.
        self.cache_lock = (self.cache_dir / '.bridge.lock').open('a+b')
        self.cache_lock.seek(0)
        self.cache_lock.write(b'\0')
        self.cache_lock.flush()
        self.cache_lock.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self.cache_lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.cache_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.cache_lock.close()
            raise RuntimeError('Download cache already in use') from None
        self.sessions, self.tasks = {}, {}
        self.lock = threading.RLock()
        self.last_sweep = 0
        for directory in self.cache_dir.iterdir():
            if not TASK_ID.fullmatch(directory.name) or not directory.is_dir() or directory.is_symlink(): continue
            try:
                raw = directory / 'task.json'
                if raw.stat().st_size > METADATA_LIMIT: continue
                data = json.loads(raw.read_text('utf-8'))
                if data['taskId'] != directory.name: continue
                session = Session(self, data)
                if not isinstance(data.get('manifest'), dict) or not isinstance(data.get('sources'), dict):
                    raise ValueError('Invalid metadata')
                if not isinstance(data.get('owner'), str) or not ORIGIN.fullmatch(data.get('origin', '')):
                    raise ValueError('Invalid owner metadata')
                if not isinstance(data.get('sealed'), bool) or not isinstance(data.get('paused'), bool):
                    raise ValueError('Invalid state metadata')
                session.verify(session.path(), data['archive'])
                for key, blob in data['sources'].items():
                    integer(int(key), MAX_ITEMS - 1)
                    session.verify(session.path(int(key)), blob)
                if not data['paused'] or data.get('retainedAt') is None: data['retainedAt'] = time.time()
                data['paused'] = True
                session.persist()
                self.tasks[data['taskId']] = session
            except (OSError, ValueError, KeyError, TypeError, Problem):
                continue  # Keep unreadable task directories quarantined; resume fails closed.
        self.sweep(force=True)
        try: super().__init__(('127.0.0.1', port), Handler)
        except BaseException:
            self.cache_lock.close()
            raise

    def sweep(self, force=False):
        with self.lock:
            if not force and time.monotonic() - self.last_sweep < 60: return
            self.last_sweep = time.monotonic()
            tasks = list(self.tasks.items())
        now = time.time()
        for task_id, session in tasks:
            with session.condition:
                if session.authorized and not session.data['paused'] and time.monotonic() - session.touched > IDLE_LIMIT:
                    session.data['paused'] = True
                    session.data['retainedAt'] = now
                    try: session.persist()
                    except OSError: pass
                expiry = session.data.get('retainedAt')
                if session.data['paused'] and expiry is not None and now - expiry > RETENTION_SECONDS:
                    session.abort()
                    if session.token: self.sessions.pop(session.token, None)
                    self.tasks.pop(task_id, None)
                    try: shutil.rmtree(session.directory)
                    except OSError: pass

    def service_actions(self): self.sweep()

    def abort_all(self):
        with self.lock:
            sessions = list(self.tasks.values())
        for session in sessions: session.abort()

    def server_close(self):
        super().server_close()
        self.cache_lock.close()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_args): pass

    def cors(self):
        origin = self.headers.get('Origin', '')
        if ORIGIN.fullmatch(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')

    def answer(self, status, data=None, headers=None, raw=False):
        body = data if raw else json.dumps(data or {}, ensure_ascii=True).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/octet-stream' if raw else 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        for key, value in (headers or {}).items(): self.send_header(key, value)
        self.end_headers()
        self.close_connection = True
        try: self.wfile.write(body)
        except OSError: pass

    def body(self, limit):
        length = self.headers.get('Content-Length', '')
        if not length.isdecimal() or int(length) > limit: raise Problem(413, 'body_limit')
        self.connection.settimeout(30)
        body = self.rfile.read(int(length))
        if len(body) != int(length): raise Problem(400, 'incomplete_body')
        return body

    def json_body(self):
        try:
            data = json.loads(self.body(METADATA_LIMIT))
            if not isinstance(data, dict): raise ValueError()
            return data
        except (ValueError, TypeError): raise Problem(400, 'invalid_json')

    def session(self, token):
        if not TOKEN.fullmatch(token): raise Problem(404, 'unknown_token')
        with self.server.lock: s = self.server.sessions.get(token)
        if s is None or s.aborted: raise Problem(404, 'unknown_token')
        s.condition.acquire()
        self.session_lease = s
        if s.token != token or s.aborted: raise Problem(404, 'unknown_token')
        if s.data['origin'] != self.headers.get('Origin'): raise Problem(403, 'origin_mismatch')
        if not s.authorized: raise Problem(403, 'reauthorization_required')
        if s.corrupt: raise Problem(409, 'corrupt_cache')
        return s

    def source(self, s, text, create=False, empty_info=False):
        if not text.isdecimal(): raise Problem(400, 'invalid_index')
        index = integer(int(text), MAX_ITEMS - 1)
        items = s.data['manifest'].get('items')
        if isinstance(items, list) and index >= len(items): raise Problem(400, 'invalid_index')
        key = str(index)
        if key not in s.data['sources']:
            if empty_info: return index, new_blob()
            if not create: raise Problem(404, 'unknown_source')
            s.path(index).touch()
            s.data['sources'][key] = new_blob()
            s.persist()
        return index, s.data['sources'][key]

    def guarded(self, method):
        self.current_session = None
        self.session_lease = None
        try:
            if method != 'GET' and not ORIGIN.fullmatch(self.headers.get('Origin', '')): raise Problem(403, 'origin_required')
            method_handler = getattr(self, 'handle_' + method)
            method_handler()
        except Problem as e: self.answer(e.status, {'error':e.code})
        except (OSError, ConnectionError) as e:
            s = self.current_session
            if s:
                with s.condition:
                    try:
                        s.rollback()
                        s.data.update(paused=True, retainedAt=time.time(), error='disk_io')
                        s.persist()
                    except (OSError, ValueError, Problem): s.corrupt = True
                    s.condition.notify_all()
            self.answer(507, {'error':'disk_io', 'paused':True})
        finally:
            if self.session_lease is not None: self.session_lease.condition.release()

    def do_OPTIONS(self):
        if not ORIGIN.fullmatch(self.headers.get('Origin', '')): return self.answer(403)
        self.answer(204, headers={'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers':'Content-Type, X-Patmail-Sequence, X-Patmail-Offset, Range, If-Range',
                                'Access-Control-Allow-Private-Network':'true'})

    def do_POST(self): self.guarded('POST')
    def do_PUT(self): self.guarded('PUT')
    def do_DELETE(self): self.guarded('DELETE')
    def do_GET(self): self.guarded('GET')

    def parts(self): return urlsplit(self.path).path.strip('/').split('/')

    def handle_POST(self):
        parts = self.parts()
        if parts == ['sessions']: return self.create_session()
        if len(parts) == 2 and parts[0] == 'discard-task':
            data = self.json_body()
            with self.server.lock: s = self.server.tasks.get(parts[1])
            if s is None: raise Problem(404, 'unknown_task')
            with s.condition:
                if s.data['origin'] != self.headers.get('Origin') or s.data['owner'] != data.get('owner'):
                    raise Problem(403, 'owner_mismatch')
                self.discard(s)
            return self.answer(200)
        if len(parts) < 2: raise Problem(404, 'unknown_endpoint')
        s = self.session(parts[1])
        self.current_session = s
        with s.condition:
            if parts[0] == 'status' and len(parts) == 2:
                self.json_body()
                return self.answer(200, s.info())
            elif parts[0] == 'cache-info' and len(parts) == 3:
                self.json_body()
                _, blob = self.source(s, parts[2], empty_info=True)
                return self.answer(200, {k:v for k,v in blob.items() if k != 'commits'})
            elif parts[0] == 'touch':
                s.touched = time.monotonic()  # A heartbeat deliberately leaves retainedAt untouched.
            elif parts[0] in ('pause', 'revoke'):
                s.data.update(paused=True, retainedAt=time.time())
                s.persist()
                if parts[0] == 'revoke':
                    s.authorized = False
                s.revoke_readers()
                s.condition.notify_all()
            elif parts[0] == 'finish':
                s.data['sealed'] = True
                s.data['archive']['complete'] = True
                s.persist()
                s.condition.notify_all()
            elif parts[0] == 'manifest':
                data = self.json_body()
                offset = integer(data.get('offset'), MAX_ITEMS)
                names = data.get('names')
                if not isinstance(names, list) or not names or len(names) > MAX_ITEMS or any(not isinstance(n, str) or len(n) > 4096 for n in names):
                    raise Problem(400, 'invalid_names')
                total = len(s.data['manifest'].get('items', [None] * MAX_ITEMS))
                if offset + len(names) > total: raise Problem(400, 'invalid_names_offset')
                cached = s.data['manifest'].setdefault('cachedNames', {})
                if str(offset) in cached and cached[str(offset)] != names: raise Problem(409, 'names_conflict')
                for old_offset, old_names in cached.items():
                    start = max(offset, int(old_offset))
                    end = min(offset + len(names), int(old_offset) + len(old_names))
                    for at in range(start, end):
                        if names[at-offset] != old_names[at-int(old_offset)]: raise Problem(409, 'names_conflict')
                cached[str(offset)] = names
                s.persist()
            elif parts[0] == 'cache' and len(parts) == 3:
                data = self.json_body()
                if data.get('read') is True:
                    index, blob = self.source(s, parts[2])
                    offset = integer(data.get('offset', 0))
                    limit = integer(data.get('limit', READ_LIMIT), READ_LIMIT)
                    if offset > blob['receivedBytes']: raise Problem(416, 'offset_out_of_range')
                    body = s.read_verified(index, blob, offset, min(limit, blob['receivedBytes'] - offset))
                    return self.answer(200, body, raw=True)
                index, blob = self.source(s, parts[2], create=True)
                if data.get('reset'):
                    # Commit zero watermark before truncation: interruption can only leave an uncommitted tail.
                    s.data['sources'][str(index)] = blob = new_blob()
                    s.persist()
                    with s.path(index).open('wb') as stream:
                        stream.flush()
                        os.fsync(stream.fileno())
                for field in ('etag', 'lastModified'):
                    if field in data:
                        value = data[field]
                        if value is not None and (not isinstance(value, str) or len(value) > 4096): raise Problem(400, 'invalid_validator')
                        if blob['receivedBytes'] and value != blob[field]: raise Problem(409, 'source_changed_reset_required')
                        blob[field] = value
                if 'totalBytes' in data:
                    total = integer(data['totalBytes']) if data['totalBytes'] is not None else None
                    if total is not None and total < blob['receivedBytes']: raise Problem(409, 'invalid_source_length')
                    blob['totalBytes'] = total
                if data.get('complete'):
                    if blob['totalBytes'] is not None and blob['receivedBytes'] != blob['totalBytes']: raise Problem(409, 'incomplete_source')
                    blob['complete'] = True
                    blob['totalBytes'] = blob['receivedBytes']
                s.persist()
                return self.answer(200, {k:v for k,v in blob.items() if k != 'commits'})
            else: raise Problem(404, 'unknown_endpoint')
            return self.answer(200, s.info())

    def create_session(self):
        data = self.json_body()
        name = data.get('fileName')
        if not isinstance(name, str) or not name.endswith('.zip') or len(name) > 120 or re.search(r'[\\/<>:"|?*\x00-\x1f]', name):
            raise Problem(400, 'invalid_filename')
        owner = data.get('owner', '')
        if not isinstance(owner, str) or len(owner) > 8192: raise Problem(400, 'invalid_owner')
        task_id = data.get('taskId')
        if task_id is not None and (not isinstance(task_id, str) or not TASK_ID.fullmatch(task_id)): raise Problem(400, 'invalid_task_id')
        manifest = data.get('manifest')
        if manifest is not None and (not isinstance(manifest, dict) or ('items' in manifest and (not isinstance(manifest['items'], list) or len(manifest['items']) > MAX_ITEMS))):
            raise Problem(400, 'invalid_manifest')
        if manifest is not None:
            if 'cachedNames' in manifest and not isinstance(manifest['cachedNames'], dict):
                raise Problem(400, 'invalid_cached_names')
            if 'zipCreatedAt' in manifest:
                try: datetime.fromisoformat(manifest['zipCreatedAt'])
                except (ValueError, TypeError): raise Problem(400, 'invalid_zip_timestamp')
        with self.server.lock:
            s = self.server.tasks.get(task_id)
            created = s is None
            if created:
                if len(self.server.tasks) >= MAX_TASKS: raise Problem(429, 'task_limit')
                task_id = task_id or str(uuid.uuid4())
                directory = self.server.cache_dir / task_id
                if directory.exists(): raise Problem(409, 'unreadable_task')
                directory.mkdir()
                (directory / 'archive.bin').touch()
                manifest = copy.deepcopy(manifest or {})
                manifest.setdefault('zipCreatedAt', datetime.now(timezone.utc).isoformat())
                manifest.setdefault('cachedNames', {})
                record = {'taskId':task_id, 'origin':self.headers['Origin'], 'owner':owner, 'fileName':name,
                          'manifest':manifest, 'archive':new_blob(), 'sources':{}, 'sealed':False,
                          'paused':False, 'retainedAt':None, 'error':None}
                s = Session(self.server, record)
                s.persist()
                self.server.tasks[task_id] = s
        with s.condition:
            if s.data['origin'] != self.headers['Origin'] or s.data['owner'] != owner: raise Problem(403, 'owner_mismatch')
            if s.corrupt: raise Problem(409, 'corrupt_cache')
            if s.data['fileName'] != name: raise Problem(409, 'manifest_conflict')
            if manifest is not None and not created:
                old = {k:v for k,v in s.data['manifest'].items() if k not in ('cachedNames','zipCreatedAt')}
                new = {k:v for k,v in manifest.items() if k not in ('cachedNames','zipCreatedAt')}
                if old != new or ('zipCreatedAt' in manifest and manifest['zipCreatedAt'] != s.data['manifest']['zipCreatedAt']): raise Problem(409, 'manifest_conflict')
            if s.token: self.server.sessions.pop(s.token, None)
            s.token = secrets.token_hex(32)
            s.sequence, s.cursor = 0, 0
            # Fixed-size disk receipts keep retry bookkeeping out of the application heap.
            with (s.directory / 'writer-receipts.bin').open('wb') as receipts:
                receipts.flush()
                os.fsync(receipts.fileno())
            s.authorized = True
            s.aborted = False
            s.revoke_readers()
            s.touched = time.monotonic()
            s.data.update(paused=False, retainedAt=time.time(), error=None)
            s.persist()
            self.server.sessions[s.token] = s
            result = s.info()
            result['token'] = s.token
            s.condition.notify_all()
            return self.answer(201 if created else 200, result)

    def handle_PUT(self):
        parts = self.parts()
        if len(parts) not in (2, 3) or parts[0] not in ('stream', 'cache'): raise Problem(404, 'unknown_endpoint')
        s = self.session(parts[1])
        self.current_session = s
        body = self.body(CHUNK_LIMIT)
        with s.condition:
            if not s.authorized: raise Problem(403, 'reauthorization_required')
            if s.data['paused']: raise Problem(409, 'paused')
            offset_header = self.headers.get('X-Patmail-Offset')
            if offset_header is not None and not offset_header.isdecimal(): raise Problem(400, 'invalid_offset')
            if parts[0] == 'cache' and len(parts) == 3:
                index, blob = self.source(s, parts[2], create=True)
                if offset_header is None: raise Problem(400, 'offset_required')
                s.append(index, blob, int(offset_header), body)
                return self.answer(200, {k:v for k,v in blob.items() if k != 'commits'})
            sequence = self.headers.get('X-Patmail-Sequence', '')
            if not sequence.isdecimal(): raise Problem(409, 'sequence_required')
            seq = int(sequence)
            digest = hashlib.sha256(body).hexdigest()
            if seq < s.sequence:
                with (s.directory / 'writer-receipts.bin').open('rb') as receipts:
                    receipts.seek(seq * 48)
                    encoded = receipts.read(48)
                receipt = struct.unpack('>QQ32s', encoded) if len(encoded) == 48 else None
                if not receipt or receipt[1] != len(body) or receipt[2].hex() != digest or (offset_header is not None and int(offset_header) != receipt[0]): raise Problem(409, 'sequence_conflict')
                return self.answer(200, s.acknowledgement())
            if seq != s.sequence: raise Problem(409, 'sequence_gap')
            offset = int(offset_header) if offset_header is not None else s.cursor
            s.append(None, s.data['archive'], offset, body)
            with (s.directory / 'writer-receipts.bin').open('r+b') as receipts:
                receipts.seek(seq * 48)
                receipts.write(struct.pack('>QQ32s', offset, len(body), bytes.fromhex(digest)))
                receipts.flush()
                os.fsync(receipts.fileno())
            s.sequence += 1
            s.cursor = offset + len(body)
            return self.answer(200, s.acknowledgement())

    def handle_DELETE(self):
        parts = self.parts()
        if len(parts) != 2 or parts[0] != 'stream': raise Problem(404, 'unknown_endpoint')
        s = self.session(parts[1])
        self.discard(s)
        self.answer(200)

    def discard(self, s):
        with self.server.lock:
            with s.condition:
                s.abort()
                self.server.sessions.pop(s.token, None)
                # Rename first, so a crash cannot resurrect a discarded task.
                tombstone = self.server.cache_dir / ('discard-' + secrets.token_hex(16))
                os.replace(s.directory, tombstone)
                self.server.tasks.pop(s.data['taskId'], None)
                shutil.rmtree(tombstone)

    def handle_GET(self):
        parts = self.parts()
        if parts == ['health']:
            return self.answer(200, {'protocol':PROTOCOL,'version':2,'features':['durable','range','source-cache','manifest','revoke']})
        if len(parts) == 2 and parts[0] == 'status':
            s = self.session(parts[1])
            with s.condition: return self.answer(200, s.info())
        if len(parts) == 3 and parts[0] in ('cache', 'cache-info'):
            s = self.session(parts[1])
            with s.condition:
                index, blob = self.source(s, parts[2], empty_info=parts[0] == 'cache-info')
                if parts[0] == 'cache-info': return self.answer(200, {k:v for k,v in blob.items() if k != 'commits'})
                try:
                    query = parse_qs(urlsplit(self.path).query)
                    offset = integer(int(query.get('offset', ['0'])[0]))
                    limit = integer(int(query.get('limit', [str(READ_LIMIT)])[0]), READ_LIMIT)
                except ValueError: raise Problem(400, 'invalid_range')
                if offset > blob['receivedBytes']: raise Problem(416, 'offset_out_of_range')
                body = s.read_verified(index, blob, offset, min(limit, blob['receivedBytes'] - offset))
                return self.answer(200, body, raw=True)
        if len(parts) != 2 or parts[0] not in ('stream', 'download'): raise Problem(404, 'unknown_endpoint')
        with self.server.lock:
            s = self.server.tasks.get(parts[1]) if parts[0] == 'download' else self.server.sessions.get(parts[1])
        if s is None or s.aborted: raise Problem(404, 'unknown_task')
        with s.condition:
            if not s.authorized: raise Problem(403, 'reauthorization_required')
            if s.corrupt: raise Problem(409, 'corrupt_cache')
            generation = s.revocation
            total = s.data['archive']['receivedBytes']
            etag = '"patmail-' + s.data['taskId'] + '"'
            range_header = self.headers.get('Range')
            if range_header and not s.finished: return self.answer(503, {'error':'not_sealed'}, headers={'Retry-After':'2'})
            start, end, partial = 0, total - 1, False
            if range_header and (self.headers.get('If-Range') in (None, etag)):
                match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header)
                if not match or not any(match.groups()): return self.answer(416, headers={'Content-Range':f'bytes */{total}'})
                a, b = match.groups()
                if a:
                    start, end = int(a), min(int(b) if b else total - 1, total - 1)
                else:
                    start = max(0, total - int(b))
                if start >= total or end < start or (not a and int(b) == 0): return self.answer(416, headers={'Content-Range':f'bytes */{total}'})
                partial = True
            self.send_response(206 if partial else 200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', "attachment; filename=download.zip; filename*=UTF-8''" + quote(s.data['fileName'], safe=''))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('ETag', etag)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            if partial:
                self.send_header('Content-Length', str(end - start + 1))
                self.send_header('Content-Range', f'bytes {start}-{end}/{total}')
            else: self.send_header('Transfer-Encoding', 'chunked')
            self.end_headers()
            self.wfile.flush()
            self.close_connection = True
            self.connection.settimeout(30)
            s.consumers.add(self.connection)
        offset = start
        try:
            while True:
                with s.condition:
                    if s.aborted or not s.authorized or s.revocation != generation or s.corrupt: return
                    available = s.data['archive']['receivedBytes']
                    if partial: available = min(available, end + 1)
                    if offset < available:
                        # Close the file handle before releasing the lease; Windows discard can then rename safely.
                        chunk = s.read_verified(None, s.data['archive'], offset, min(READ_LIMIT, available - offset))
                        offset += len(chunk)
                    elif s.finished:
                        if not partial: self.wfile.write(b'0\r\n\r\n')
                        self.wfile.flush()
                        return
                    else:
                        s.condition.wait(.5)
                        continue
                self.wfile.write(chunk if partial else f'{len(chunk):x}\r\n'.encode() + chunk + b'\r\n')
                self.wfile.flush()
                if partial and offset > end: return
        except (OSError, ConnectionError, Problem):
            pass  # A browser disconnect never destroys acknowledged source or ZIP bytes.
        finally:
            with s.condition: s.consumers.discard(self.connection)


def make_server(port=PORT, cache_dir=None): return BridgeServer(port, cache_dir)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--cache-dir')
    args = parser.parse_args()
    server = make_server(args.port, args.cache_dir)
    print(f'PatMail stream bridge: http://127.0.0.1:{server.server_port}', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        server.abort_all()
        server.server_close()
