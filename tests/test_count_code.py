import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from count_code import evaluate_gates, main, normalize_repository_url, save_report_json, scan_project


class ProductionFileGateTest(unittest.TestCase):
    def test_checks_production_files_outside_the_report_top_five(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tests = root / "tests"
            tests.mkdir()
            for index in range(5):
                (tests / f"test_{index}.py").write_text("pass\n" * 12, encoding="utf-8")
            for index in range(10):
                (root / f"prod_{index}.py").write_text("pass\n" * 10, encoding="utf-8")

            result = scan_project(root, analyze_complexity=False)
            gate = evaluate_gates(result, prod_max_lines=9, test_ratio_min=None)
            self.assertFalse(gate["passed"])
            self.assertEqual(len(gate["failures"]), 9)
            self.assertEqual(gate["failures"][-1], "另有 2 个生产大文件超限")

            path = save_report_json(result, root / "code_report.json")
            largest = json.loads(path.read_text(encoding="utf-8"))["largest_files"]
            self.assertEqual(len(largest), 5)
            self.assertTrue(all(item["is_test"] for item in largest))


class ReportOutputTest(unittest.TestCase):
    def test_remote_address_omits_userinfo_and_query_from_both_reports(self):
        remote = "https://fixture-user:fixture-password@example.test/org/project.git?key=fixture-query"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            html, snapshot = root / "report.html", root / "snapshot.json"
            response = subprocess.CompletedProcess([], 0, stdout=remote)
            with patch("count_code.subprocess.run", return_value=response), redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--root", directory, "--html", str(html), "--json", str(snapshot)]), 0)
            for path in (html, snapshot):
                output = path.read_text(encoding="utf-8")
                self.assertTrue("https://example.test/org/project" in output, "sanitized link missing")
                self.assertFalse("fixture-password" in output or "fixture-query" in output, "credentials in report")
        self.assertEqual(normalize_repository_url("git@example.test:org/project.git"), "https://example.test/org/project")
        self.assertEqual(normalize_repository_url("ssh://git@example.test:2222/org/project.git"), "https://example.test/org/project")

    def test_default_report_and_custom_snapshot_do_not_pollute_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for branch in (root, root / "patmail-extension"):
                inventory = branch / "docs" / "architecture" / "dependency-inventory.json"
                inventory.parent.mkdir(parents=True)
                inventory.write_text("{}", encoding="utf-8")
            (root / "service.py").write_text("pass\n", encoding="utf-8")
            snapshot = root / "snapshot.json"
            caller = root / "caller"
            caller.mkdir()
            script = Path(__file__).resolve().parents[1] / "count_code.py"
            args = [sys.executable, str(script), "--root", directory, "--json", str(snapshot), "--no-complexity"]
            for _ in range(2):
                subprocess.run(args, cwd=caller, capture_output=True, check=True)
            self.assertTrue((root / "code_report.html").is_file())
            result = json.loads(snapshot.read_text(encoding="utf-8"))
            self.assertEqual(result["code_files"], 1)
            self.assertEqual(result["total_files"], 1)

    def test_invalid_history_and_colliding_outputs_fail_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "report.json"
            snapshot.write_text('{"totals": "invalid"}', encoding="utf-8")
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(main(["--root", directory, "--history", str(snapshot)]), 2)
                self.assertEqual(main(["--root", directory, "--html", str(snapshot), "--json", str(snapshot)]), 2)
            self.assertEqual(snapshot.read_text(encoding="utf-8"), '{"totals": "invalid"}')

    def test_architecture_modules_get_their_own_buckets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for layer in ("application", "infrastructure"):
                source = root / "patmail-extension" / "src" / layer / "billing" / "index.ts"
                source.parent.mkdir(parents=True)
                source.write_text("export {}\n", encoding="utf-8")
            result = scan_project(root, analyze_complexity=False)
            self.assertEqual(list(result["by_module"]), ["src/application", "src/infrastructure"])
