# SPDX-License-Identifier: MIT
"""A project saved with Midiverb 0.1.0 opens on the same program (owner, 26 Nov 2026): every PROG value 0.1.0 could
store, in every bank, selects the program it selected then, from stream.h's mv_value as stream.c reads it."""
import json
import pathlib
import re
import unittest

HERE = pathlib.Path(__file__).resolve().parent
BANKS = ("MV1", "MV2", "FEX")
# 0.1.0 as released (its programs.json): each bank's programs in chart order less these, PROG 0-58, and past a bank's
# last program PROG stayed on the last.
V010_VALUES = 59
V010_OUT = {"MV1": {9, 10, 11, 13}, "FEX": {12, 23, 34, 35},
            "MV2": {1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 27, 30, 31, 32, 33, 34, *range(50, 70)}}
V010_LAST = {"MV1": 63, "MV2": 99, "FEX": 63}


def v010(bank, value):
    order = [n for n in range(1, V010_LAST[bank] + 1) if n not in V010_OUT[bank]]
    return order[min(value, len(order) - 1)]


class Values(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        header = (HERE / "stream.h").read_text()
        cls.count = int(re.search(r"#define MV_VALUES (\d+)", header).group(1))
        table = re.search(r"mv_value\[3\]\[MV_VALUES\] = \{(.*?)\n\};", header, re.S).group(1)
        cls.rows = [[int(v) for v in re.findall(r"\d+", row)] for row in re.findall(r"\{([^{}]*)\}", table)]
        cls.names = re.findall(r'"([^"]*)"', header[header.index("mv_names"):])
        cls.programs = json.loads((HERE / "programs.json").read_text())["programs"]

    def program(self, bank, value):
        p = self.programs[self.rows[BANKS.index(bank)][min(value, self.count - 1)]]
        return p["bank"], p["number"]

    def test_every_010_value_keeps_its_program(self):
        for bank in BANKS:
            for value in range(V010_VALUES):
                self.assertEqual(self.program(bank, value), (bank, v010(bank, value)), f"{bank} PROG value {value}")

    def test_every_program_has_a_value_in_its_bank(self):
        self.assertEqual([len(r) for r in self.rows], [self.count] * 3)
        for b, bank in enumerate(BANKS):
            self.assertEqual({self.programs[i]["bank"] for i in self.rows[b]}, {bank})
        reached = {self.program(bank, v) for bank in BANKS for v in range(self.count)}
        self.assertEqual(reached, {(p["bank"], p["number"]) for p in self.programs})
        self.assertEqual(len(self.programs), 225)

    def test_the_message_box_names_the_original_number(self):
        self.assertEqual(len(self.names), len(self.programs))
        for name, p in zip(self.names, self.programs):
            self.assertTrue(name.startswith(f"{p['number']} ") and len(name) <= 19, name)

    def test_prog_ends_at_each_banks_last_program(self):
        # stream.c mv_count: the value past which a bank holds its last program; PROG's count follows BANK.
        def count(row):
            n = len(row)
            while n > 1 and row[n - 2] == row[-1]:
                n -= 1
            return n
        self.assertEqual([count(r) for r in self.rows], [63, self.count, 63])
        for b, row in enumerate(self.rows):
            self.assertEqual(len({self.programs[i]["number"] for i in row[:count(row)]}), len({self.programs[i]["number"] for i in row}))

    def test_the_knob_has_every_value(self):
        controls = json.loads((HERE / "octamod.module.json").read_text())["controls"]
        prog = next(c for c in controls if c["name"] == "PROG")
        self.assertEqual((prog["count"], len(prog["labels"])), (self.count, self.count))


if __name__ == "__main__":
    unittest.main()
