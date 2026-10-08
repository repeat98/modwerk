"""module_gates: once-per-run gates and the shared half's carrier choice;
reach: the port stamp decides staleness by content."""
import os
import pathlib
import sys
import tempfile
import types
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import module_gates  # noqa: E402
import reach  # noqa: E402
from remix.schema import Gate  # noqa: E402


def module(key, *gates):
    return types.SimpleNamespace(key=key, gates=gates)


class OnceGates(unittest.TestCase):
    def test_once_needs_remix_arg_and_the_isolated_stage(self):
        Gate("tools/verify/x.py", once=True)
        with self.assertRaises(ValueError):
            Gate("tools/verify/x.py", once=True, remix_arg=False)
        with self.assertRaises(ValueError):
            Gate("tools/verify/x.py", once=True, stage="image")

    def test_collect_splits_once_from_per_remix(self):
        per = Gate("tools/verify/per.py")
        once = Gate("tools/verify/once.py", once=True)
        shared = Gate("tools/verify/shared.py", remix_arg=False)
        mods = [module("A", per, once), module("B", shared)]
        self.assertEqual([g.script for _, g in module_gates.collect(mods, "isolated", once=True)], [once.script])
        self.assertEqual([g.script for _, g in module_gates.collect(mods, "isolated", True, False)], [per.script])
        self.assertEqual([g.script for _, g in module_gates.collect(mods, "isolated", remix_arg=False)], [shared.script])
        self.assertEqual(len(module_gates.collect(mods, "isolated")), 3)

    def test_carrier_is_the_smallest_remix_carrying_the_module(self):
        big = types.SimpleNamespace(name="big")
        small = types.SimpleNamespace(name="small")
        other = types.SimpleNamespace(name="other")
        sel = {"big": [module("K"), module("X"), module("Y")], "small": [module("K"), module("X")],
               "other": [module("X")]}
        pick = module_gates.carrier("K", [big, other, small], selected=lambda r: sel[r.name])
        self.assertIs(pick, small)


class PortStamp(unittest.TestCase):
    def test_stamp_matches_content_not_mtime(self):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            src = d / "src"; src.mkdir(); (src / "a.cpp").write_text("int main(){}\n")
            exe = d / "ot_emu"; exe.write_bytes(b"\0")
            stamp = d / "stamp"
            reach.stamp_port(src, stamp)
            (src / "a.cpp").touch()                       # newer than the binary, same bytes
            self.assertFalse(reach.port_is_stale(exe, src, stamp))
            (src / "a.cpp").write_text("int main(){return 1;}\n")
            self.assertTrue(reach.port_is_stale(exe, src, stamp))

    def test_without_a_stamp_mtime_decides(self):
        with tempfile.TemporaryDirectory() as d:
            d = pathlib.Path(d)
            src = d / "src"; src.mkdir(); (src / "a.cpp").write_text("x")
            exe = d / "ot_emu"; exe.write_bytes(b"\0")
            os.utime(exe, (0, 0))                          # an old binary; a touch can land in the same tick (CI)
            self.assertTrue(reach.port_is_stale(exe, src, d / "no-stamp"))


if __name__ == "__main__":
    unittest.main()
