"""Focused tests for start.py frontend readiness detection."""
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "patmail_launcher", Path(__file__).parents[2] / "start.py"
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class DelayedLines:
    def __iter__(self):
        yield "  VITE v6.4.3 ready in 300 ms\n"
        time.sleep(0.03)
        # This is Vite 6's bold("Local") output: the ANSI reset separates
        # Local from its colon in the raw line, though terminals render Local:.
        yield "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:5173/\x1b[39m\n"


class FakeProcess:
    stdout = DelayedLines()


class ExitedProcess:
    def poll(self):
        return 7


class ExitedAfterOutputProcess:
    def __init__(self):
        self.output_drained = threading.Event()
        self.stdout = self._lines()
        self.returncode = 7

    def _lines(self):
        yield "Error: Vite could not load its config\n"
        self.output_drained.set()

    def poll(self):
        return self.returncode if self.output_drained.is_set() else None


class FrontendReadinessTests(unittest.TestCase):
    def test_local_label_without_http_url_does_not_signal_ready(self):
        self.assertFalse(launcher.is_vite_local_url("  Local: server is starting\n"))
        self.assertFalse(launcher.is_vite_local_url("  Build docs: http://127.0.0.1:5173/\n"))

    def test_delayed_vite_local_line_with_ansi_reset_signals_ready(self):
        ready = threading.Event()
        launcher.recent_output.clear()

        with patch.object(launcher, "print"):
            reader = threading.Thread(
                target=launcher.pipe_output,
                args=(FakeProcess(), ready),
                daemon=True,
            )
            reader.start()
            self.assertFalse(ready.wait(0.01), "ready should wait for Vite's Local URL")
            reader.join(timeout=1)

        self.assertFalse(reader.is_alive(), "output reader should finish after fixture closes")
        self.assertTrue(ready.is_set(), "Vite's ANSI-colored Local URL should signal readiness")

    def test_wait_stops_promptly_when_frontend_exits(self):
        started = time.monotonic()

        is_ready = launcher.wait_for_ready_or_exit(
            ExitedProcess(), threading.Event(), timeout=10
        )

        self.assertFalse(is_ready)
        self.assertLess(time.monotonic() - started, 0.5)

    def test_early_exit_reports_return_code_and_recent_output(self):
        process = ExitedAfterOutputProcess()
        stderr = io.StringIO()
        stdout = io.StringIO()

        with (
            patch.object(launcher, "start_frontend", return_value=process),
            patch.object(launcher, "port_owners", return_value=[]),
            redirect_stderr(stderr),
            redirect_stdout(stdout),
        ):
            with self.assertRaises(SystemExit) as exit_error:
                launcher.start_frontend_with_recovery("pnpm")

        self.assertEqual(exit_error.exception.code, 1)
        self.assertIn("管理端启动失败，退出码 7。", stderr.getvalue())
        self.assertIn("Error: Vite could not load its config", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
