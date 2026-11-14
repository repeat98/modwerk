"""The Analog Rytm MKII test runner's cases (sdk/machines/analog-rytm-mkii/tools/cases/): every case parses and compiles
to a timeline, as `rytm_test.py check` does, and no reference capture is kept in the repository. No unit or emulator."""
import importlib.util
import pathlib
import sys
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
TOOLS = APP / "sdk/machines/analog-rytm-mkii/tools"
sys.path.insert(0, str(TOOLS))
spec = importlib.util.spec_from_file_location("rytm_test", TOOLS / "rytm_test.py")
rytm_test = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rytm_test)


class RytmCases(unittest.TestCase):
    def test_every_case_parses_and_has_a_timeline(self):
        cases = rytm_test.find_cases([TOOLS / "cases"])
        self.assertGreaterEqual(len(cases), 40)
        for case in cases:
            self.assertTrue(case.ops, case.path)
            self.assertGreater(case.duration, 0, case.path)
            self.assertIn(case.head["state"], ("safe", "changes"), case.path)
            self.assertTrue(case.timeline(), case.path)

    def test_a_module_folder_is_named_by_a_rytm_module_id(self):
        modules = {p.name for p in (APP / "sdk/analog-rytm-mkii/modules").iterdir() if p.is_dir()}
        for folder in (p for p in (TOOLS / "cases").iterdir() if p.is_dir()):
            self.assertIn(folder.name, modules, folder)

    def test_no_reference_captures_in_the_repository(self):
        kept = [p for p in (TOOLS / "cases").rglob("*") if p.suffix in (".pbm", ".png", ".wav") or p.name == "refs"]
        self.assertEqual(kept, [])

    def test_references_live_under_the_refs_folder_by_case_folder(self):
        case = rytm_test.find_cases([TOOLS / "cases/link-global-menu.case"])[0]

        class Args:
            refs = "/refs"
        self.assertEqual(rytm_test.refs_dir(Args, case, "unit"), pathlib.Path("/refs/cases/link-global-menu/unit"))


if __name__ == "__main__":
    unittest.main()
