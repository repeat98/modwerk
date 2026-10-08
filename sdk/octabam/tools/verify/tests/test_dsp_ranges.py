"""DSP data claims: resolution per payload and the port census check."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from remix import dsp_ranges  # noqa: E402
from remix.schema import BusRole, Claims, DspHook, DspRange, DspSection, Kind, Module  # noqa: E402


def _mod(name, *ranges, payloads=frozenset({"A"}), role=BusRole.NONE):
    return Module(name=name, key=name.upper(), kind=Kind.HYBRID, doc="fixture",
                  dsp=DspSection(asm="does/not/exist.asm", priority=20, payloads=payloads,
                                 bus_role=role, hooks=(DspHook(0x88, (0, 0), "x"),)),
                  claims=Claims(dsp_ranges=ranges))


class ResolveTests(unittest.TestCase):
    def test_half_relative_follows_the_payload(self):
        r = DspRange("y", 0x0800, 0x100, "buf", half_relative=True)
        self.assertEqual(r.resolve("A"), ("shared", 0x30800, 0x30900))
        self.assertEqual(r.resolve("B"), ("shared", 0x38800, 0x38900))

    def test_private_range_is_per_payload_and_space(self):
        self.assertEqual(DspRange("x", 0x6000, 0x10, "t").resolve("B"), ("B:x", 0x6000, 0x6010))


class CensusTests(unittest.TestCase):
    CENSUS = ("cmd 1 tx 0 0X30000:72 0Y30800:5 0Y36000:9 1X38000:16\n"
              "cmd 2 tx 1 0Y30800:3 0Y31000:2 1Y3a000:4\n")

    def test_parse_sums_frames(self):
        c = dsp_ranges.parse_census(self.CENSUS)
        self.assertEqual(c[(0, "y", 0x30800)], 8)
        self.assertEqual(dsp_ranges.runs(c, 0, "y"), [(0x30800, 0x30900), (0x31000, 0x31100), (0x36000, 0x36100)])

    def test_declared_and_stock_writes_pass(self):
        c = dsp_ranges.parse_census(self.CENSUS)
        mods = [_mod("verb", DspRange("y", 0x0800, 0x1000, "buf", half_relative=True), role=BusRole.SERVER),
                _mod("dly", DspRange("y", 0x0000, 0x8000, "line", half_relative=True),
                     payloads=frozenset({"B"}))]
        self.assertEqual(dsp_ranges.violations(c, mods), [])

    def test_undeclared_write_is_named(self):
        c = dsp_ranges.parse_census(self.CENSUS)
        mods = [_mod("verb", DspRange("y", 0x0800, 0x100, "buf", half_relative=True), role=BusRole.SERVER)]
        got = dsp_ranges.violations(c, mods)
        self.assertEqual(len(got), 2)
        self.assertIn("core 0 (A) wrote Y:0x31000-0x310ff (2 non-zero writes)", got[0])
        self.assertIn("core 1 (B) wrote Y:0x3a000-0x3a0ff", got[1])

    def test_stock_mailbox_is_core_1s_at_0x38000_only(self):
        self.assertEqual(dsp_ranges.violations(dsp_ranges.parse_census("cmd 1 tx 0 1X38000:16\n"), []), [])
        self.assertEqual(len(dsp_ranges.violations(dsp_ranges.parse_census("cmd 1 tx 0 1X37f00:16\n"), [])), 1)
        self.assertEqual(len(dsp_ranges.violations(dsp_ranges.parse_census("cmd 1 tx 0 0X38000:16\n"), [])), 1)

    def test_scratch_needs_a_bus(self):
        c = dsp_ranges.parse_census("cmd 1 tx 0 0Y36000:9\n")
        self.assertEqual(len(dsp_ranges.violations(c, [_mod("plain")])), 1)


if __name__ == "__main__":
    unittest.main()
