"""cycle_count.bank_worst prices an insert at its declared max_per_core."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import toolpath  # noqa: E402,F401
from build import cycle_count  # noqa: E402
from remix.schema import DspSection  # noqa: E402

ROWS = [{"name": "ins", "cycles": 1000}]


def mod(**kw):
    return dict(stem="ins", key="INS", server=False, fx1_only=False, **kw)


class CeilingTests(unittest.TestCase):
    def test_undeclared_is_four_copies(self):
        worst, picks = cycle_count.bank_worst(ROWS, [mod()])
        self.assertEqual((worst, picks), (4000, [("ins", 4)]))

    def test_declared_two_is_two_copies(self):
        worst, picks = cycle_count.bank_worst(ROWS, [mod(max_per_core=2)])
        self.assertEqual((worst, picks), (2000, [("ins", 2)]))

    def test_declared_above_four_slots_is_four(self):
        self.assertEqual(cycle_count.bank_worst(ROWS, [mod(max_per_core=4)])[0], 4000)

    def test_schema_range(self):
        for bad in (0, 5, -1):
            with self.assertRaises(ValueError):
                DspSection(asm="x.asm", priority=1, max_per_core=bad)
        for ok in (None, 1, 4):
            DspSection(asm="x.asm", priority=1, max_per_core=ok)


if __name__ == "__main__":
    unittest.main()

class MixedCeilings(unittest.TestCase):
    def test_a_capped_insert_leaves_slots_for_the_next_insert(self):
        rows = [{"name": "ins", "cycles": 1000}, {"name": "cheap", "cycles": 500}]
        expensive = mod(max_per_core=1)
        cheap = {**mod(), "stem": "cheap", "key": "CHEAP"}
        self.assertEqual(cycle_count.bank_worst(rows, [expensive, cheap])[0], 2500)

    def test_a_dearer_insert_can_fill_the_core_without_a_server(self):
        rows = [{"name": "ins", "cycles": 1000}, {"name": "server", "cycles": 100}]
        server = {**mod(), "stem": "server", "key": "SERVER", "server": True}
        self.assertEqual(cycle_count.bank_worst(rows, [mod(), server])[0], 4000)
