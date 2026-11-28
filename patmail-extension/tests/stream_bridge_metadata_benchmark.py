"""Synthetic metadata benchmark; only temporary data is used.

Run: python tests/stream_bridge_metadata_benchmark.py --chunks 100
Both modes fsync payload and metadata. The baseline uses the former full JSON
commit path; HTTP and writer-receipt overhead are excluded from both modes.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import uuid

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'scripts' / 'download' / 'bridge' / 'stream-download-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def benchmark(mode, chunks):
    with tempfile.TemporaryDirectory() as root:
        task_id = str(uuid.uuid4())
        directory = Path(root) / task_id
        directory.mkdir()
        blob = bridge.new_blob()
        digest = bridge.hashlib.sha256(b'x').hexdigest()
        blob['commits'] = [[n, 1, digest] for n in range(12546)]
        blob['receivedBytes'] = 12546
        record = {'taskId':task_id, 'manifest':{'items':[{'key':'x' * 440} for _ in range(1607)]},
                  'archive':blob, 'sources':{str(n):bridge.new_blob() for n in range(746)},
                  'sealed':False, 'paused':False}
        task = bridge.Session(SimpleNamespace(cache_dir=Path(root)), record)
        task.path().write_bytes(b'x' * 12546)
        task.persist()
        metadata = directory / 'task.json'
        initial = metadata.stat().st_size
        full_bytes = [0]
        if mode == 'full-json':
            def full_commit(patches=None, metadata_delta=None):
                bridge.atomic_json(metadata, task.data)
                full_bytes[0] += metadata.stat().st_size
            task.persist = full_commit
        durations = []
        body = b'a' * 65536
        start = time.perf_counter()
        for _ in range(chunks):
            tick = time.perf_counter()
            with task.condition:
                task.append(None, blob, blob['receivedBytes'], body)
            durations.append((time.perf_counter() - tick) * 1000)
        elapsed = time.perf_counter() - start
        durations.sort()
        return {'mode':mode, 'initial_metadata_bytes':initial, 'chunks':chunks,
                'chunk_bytes':len(body), 'seconds':round(elapsed, 4),
                'p50_ms':round(durations[min(chunks-1, int(chunks*.50))], 3),
                'p95_ms':round(durations[min(chunks-1, int(chunks*.95))], 3),
                'metadata_bytes_written':full_bytes[0] if mode == 'full-json' else (directory / 'task.log').stat().st_size}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chunks', type=int, default=100)
    args = parser.parse_args()
    if args.chunks < 1: parser.error('--chunks must be positive')
    for mode in ('full-json', 'journal'):
        print(json.dumps(benchmark(mode, args.chunks)), flush=True)
