"""启动器在下载间桥接退出后恢复服务；使用独立端口，不碰用户下载。"""
import importlib.util
import json
from pathlib import Path
import socket
import threading
import time
import unittest
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('patmail_launcher', Path(__file__).parents[2] / 'start.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherBridgeTests(unittest.TestCase):
    def test_recovers_bridge_lost_between_downloads(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        stop = threading.Event()
        with patch.object(launcher, 'STREAM_BRIDGE_PORT', port, create=True):
            monitor = threading.Thread(target=launcher.monitor_stream_bridge,
                                       args=(stop, .05), daemon=True)
            try:
                launcher.start_stream_bridge()
                first = launcher.processes[-1]
                monitor.start()
                first.terminate()
                first.wait(timeout=3)
                deadline = time.monotonic() + 8
                restored = False
                while time.monotonic() < deadline:
                    try:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=.3) as response:
                            restored = json.load(response)['protocol'] == 'patmail-stream-v1'
                        if restored:
                            break
                    except (OSError, ValueError):
                        pass
                    time.sleep(.05)
                self.assertTrue(restored, '桥接退出后应恢复，下一次下载无需手动重启')
                self.assertIsNot(launcher.processes[-1], first)
            finally:
                stop.set()
                if monitor.is_alive():
                    monitor.join(timeout=8)
                for process in launcher.processes:
                    if process.poll() is None:
                        process.terminate()
                    process.wait(timeout=3)
                launcher.processes.clear()


if __name__ == '__main__':
    unittest.main()
