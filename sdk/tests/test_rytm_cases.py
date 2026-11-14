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
        for folder in [TOOLS / "cases"] + [p for p in (TOOLS / "cases").iterdir() if p.is_dir()]:
            self.assertTrue(any(case.path.parent == folder for case in cases), folder)
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
        kept = [p for p in (TOOLS / "cases").rglob("*") if p.suffix in (".pbm", ".png", ".wav", ".snap")
                or p.name.endswith(".audio.json") or p.name == "refs"]
        self.assertEqual(kept, [])

    def test_references_live_under_the_refs_folder_by_case_folder(self):
        case = rytm_test.find_cases([TOOLS / "cases/link-global-menu.case"])[0]

        class Args:
            refs = "/refs"
        self.assertEqual(rytm_test.refs_dir(Args, case, "unit"), pathlib.Path("/refs/cases/link-global-menu/unit"))

    def test_midi_events_reads_nrpn_and_cc(self):
        data = bytes.fromhex("b06301 b06214 b00640 b02611 b007f864 f00102f7 0630 b06505 b06400 b00610")
        self.assertEqual(rytm_test.midi_events(data), [
            ("nrpn", 1, (1, 20), 64, 17),           # with its fine part
            ("cc", 1, 7, 100),                      # a clock byte inside a message is skipped
            ("cc", 1, 101, 5), ("cc", 1, 100, 0),   # SysEx ended running status; an RPN ends the NRPN
            ("cc", 1, 6, 16)])                      # so its data entry is a plain CC

    def test_nrpn_step_and_emu_steps(self):
        case = rytm_test.find_cases([TOOLS / "cases/link-midi-out.case"])[0]
        ccs = [op.values for op in case.ops if op.name == "cc"]
        self.assertIn((99, 1), ccs)
        self.assertIn((98, 20), ccs)
        self.assertIn((6, 64), ccs)
        self.assertTrue(any(op.only == "emu" for op in case.ops))
        self.assertFalse(any(op.only == "emu" and op.slot for op in case.ops))
        self.assertEqual(case.captures, {"turn": "midi", "quiet": "midi"})

    def test_emu_takes_steps_that_leave_nothing_held(self):
        path = pathlib.Path(self.id().replace(".", "_") + ".case")
        try:
            for bad in ("emu hold FUNC", "emu release all", "emu nudge A +1", "emu screen s"):
                path.write_text(bad + "\n")
                with self.assertRaises(rytm_test.CaseError, msg=bad):
                    rytm_test.Case(path)
        finally:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
