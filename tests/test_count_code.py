import json
import tempfile
import unittest
from pathlib import Path

from count_code import evaluate_gates, save_report_json, scan_project


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
