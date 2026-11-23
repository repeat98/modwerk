"""The Analog Rytm MKII test runner's cases (sdk/machines/analog-rytm-mkii/tools/cases/): every case parses and compiles
to a timeline, as `rytm_test.py check` does, and no reference capture is kept in the repository. No unit or emulator."""
import importlib.util
import pathlib
import sys
import tempfile
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

    def test_midi_events_reads_notes_and_poly_pressure(self):
        data = bytes.fromhex("9d2464 ad241e 2400 9d2400 8d2400 b00740")
        self.assertEqual(rytm_test.midi_events(data), [
            ("note", 14, 36, 100), ("polyat", 14, 36, 30),
            ("polyat", 14, 36, 0),                  # running status; a pressure of 0 is kept
            ("cc", 1, 7, 64)])                      # a note on with velocity 0 and a note off are no notes

    def test_midi_checks_count_by_kind(self):
        got = [("note", 14, 36, 100), ("polyat", 14, 36, 30), ("cc", 14, 74, 3)]
        check = lambda field, op, want, how='count': rytm_test.check_midi(
            {"field": field, "op": op, "want": (how, want)}, got)[0]
        self.assertTrue(check("count", "==", 1))    # .count: parameter messages only, as before notes were read
        self.assertTrue(check("notes", "==", 1))
        self.assertTrue(check("polyat", "==", 1))
        self.assertTrue(check("", "has", ("polyat", 36, 30, None), how="has"))
        self.assertTrue(check("", "lacks", ("polyat", 60, None, None), how="lacks"))

    def test_pad_steps(self):
        path = pathlib.Path(self.id().replace(".", "_") + ".case")
        try:
            path.write_text("pad BD down 100\npad SD pressure 255\npad BD up\nmidi m begin\nmidi m end\n"
                            "expect m has polyat 36 30\nexpect m.polyat > 1\n")
            case = rytm_test.Case(path)
            self.assertEqual([op.values for op in case.ops if op.name == "pad"], [(0, 1, 100), (1, 2, 255), (0, 0, 0)])
            for bad in ("pad BD down 0", "pad BD down 128", "pad BD pressure 256", "pad BD up 5", "pad BD down",
                        "pad XX up", "midi m begin\nmidi m end\nexpect m has note 128",
                        "target: emu\nemu press LFO 500\npad BD down 100"):
                path.write_text(bad + "\n")
                with self.assertRaises(rytm_test.CaseError, msg=bad):
                    rytm_test.Case(path)
        finally:
            path.unlink(missing_ok=True)

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


    def test_emu_press_holds_a_panel_key_on_the_emulator_alone(self):
        path = pathlib.Path(self.id().replace(".", "_") + ".case")
        try:
            path.write_text("target: emu\nwait 500\nemu press LFO 800\nwait 100\nscreen s\n")
            case = rytm_test.Case(path)
            press = [op for op in case.ops if op.name == "press"]
            self.assertEqual([(op.values, op.only) for op in press], [(("LFO", 800), "emu")])
            release = [op for op in case.ops if op.name == "release"][-1]
            self.assertGreaterEqual(release.t, press[0].t + 800 + rytm_test.PANEL_QUIET_MS)   # the link takes it again
            path.write_text("target: emu\nemu press LFO 1200 &\nwait 200\nemu press AMP 100\n")
            case = rytm_test.Case(path)
            at = [op.t for op in case.ops if op.name == "press"]
            self.assertEqual(at[1] - at[0], 200)        # `&`: AMP pressed during LFO's hold
            for bad in ("emu press LFO 800",                            # no target: emu
                        "target: emu\nemu press NOPE 80",               # unknown key
                        "target: emu\nemu press LFO",                   # no length
                        "target: emu\nemu press LFO 80\nkey FLTR"):    # a link key inside the quiet window
                path.write_text(bad + "\n")
                with self.assertRaises(rytm_test.CaseError, msg=bad):
                    rytm_test.Case(path)
        finally:
            path.unlink(missing_ok=True)


    def test_a_channel_on_cc_nrpn_and_midi_expectations(self):
        text = ("name: chan\nstate: changes\n\ncc 74 100 ch2\nmidi a begin\nnrpn 1:20 64 ch3\nwait 100\nmidi a end\n"
                "expect a has nrpn 5:0 1 ch2\nexpect a lacks nrpn 5:0 ch1\n")
        with tempfile.TemporaryDirectory() as d:
            path = pathlib.Path(d) / "chan.case"
            path.write_text(text)
            case = rytm_test.find_cases([path])[0]
            ccs = [op for op in case.ops if op.name == "cc"]
            self.assertEqual(ccs[0].values, (74, 100, 2))
            self.assertEqual(rytm_test.note_bytes(ccs[0], 14), bytes([0xB1, 74, 100]))   # its own channel
            self.assertEqual([op.values for op in ccs[1:]], [(99, 1, 3), (98, 20, 3), (6, 64, 3)])
            has, lacks = (e for e in case.expects if e["name"] == "a")
            self.assertTrue(rytm_test.check_midi(has, [("nrpn", 2, (5, 0), 1, None)])[0])
            self.assertFalse(rytm_test.check_midi(has, [("nrpn", 1, (5, 0), 1, None)])[0])    # another channel
            self.assertTrue(rytm_test.check_midi(lacks, [("nrpn", 2, (5, 0), 1, None)])[0])
            for bad in ("cc 74 100 ch17\n", "nrpn 1:20 64 ch0\n", "midi b begin\nwait 10\nmidi b end\nexpect b has nrpn 5:0 ch17\n"):
                path.write_text("name: chan\nstate: changes\n\n" + bad)
                with self.assertRaises(rytm_test.CaseError):
                    rytm_test.find_cases([path])
        plain = rytm_test.find_cases([TOOLS / "cases/link-midi-out.case"])[0]
        self.assertTrue(all(len(op.values) == 2 for op in plain.ops if op.name == "cc"))   # no channel: as before

    def test_screen_compares_skip_the_old_armed_mark(self):
        lit = [[1] * 128 for _ in range(64)]
        marked = [row[:] for row in lit]
        for y in range(2, 7):
            marked[y][126] = marked[y][127] = 0
        self.assertEqual(rytm_test.screen_diff(marked, lit, None), (0, None))
        marked[1][127] = 0                                  # a pixel beside it still counts
        self.assertEqual(rytm_test.screen_diff(marked, lit, None), (1, (127, 1, 1, 1)))


if __name__ == "__main__":
    unittest.main()
