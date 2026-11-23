# SPDX-License-Identifier: GPL-3.0-or-later
import unittest
from offline.bank_codec import Archive, CRC, EMPTY_PROJECT, HOLD, SIZE, STOP, Unsupported, crc32, decode


class OfflineBanks(unittest.TestCase):
    def setUp(self):
        self.a = Archive(b"A" * 16)
        self.rows = [list(bank) for bank in EMPTY_PROJECT]
        for i in (0, 1, 2, 7):
            self.rows[i][3] = [i, STOP, HOLD, 0, 1, 2, 3, 4]

    def test_round_trip_and_snapshot(self):
        self.a.save("working", self.rows)
        self.a.save("saved", self.rows)
        self.rows[0][4] = self.rows[0][3].copy()
        self.rows[0][4][0] = 15
        self.rows[0][4][0] = self.rows[7][3][0]
        self.assertEqual(self.rows[0][3][0], 0)
        self.a.save("working", self.rows)
        n, banks = decode(self.a.files["working"], self.a.identity)
        self.assertEqual((n, len(banks)), (2, 16))
        self.assertEqual([banks[i][3][0] for i in (0, 7, 0, 1, 2)], [0, 7, 0, 1, 2])
        self.assertEqual(banks[0][4], tuple(self.rows[0][4]))
        self.assertIsNone(banks[15][0])
        self.assertIsNone(decode(self.a.files["saved"], self.a.identity)[1][0][4])

    def test_failure_recovery(self):
        self.a.save("working", self.rows)
        original = self.a.files["working"]
        for cut in range(SIZE):
            with self.assertRaises(ValueError):
                self.a.save("working", self.rows, cut=cut)
            self.assertIs(self.a.files["working"], original)
        with self.assertRaises(ValueError):
            decode(original, b"B" * 16)
        for offset, error in ((5, Unsupported), (34, ValueError), (-1, ValueError)):
            corrupt = bytearray(original)
            corrupt[offset] ^= 1
            if offset == 34:
                corrupt[-4:] = CRC.pack(crc32(corrupt[:-4]))
            self.a.files["working"] = bytes(corrupt)
            with self.assertRaises(error):
                self.a.save("working", self.rows)
            self.assertEqual(self.a.files["working"], corrupt)


class ProjectFailure(unittest.TestCase):
    def test_late_abort_and_committed_identity(self):
        from offline.project_transition import Generation, Transition
        a_rows = list(EMPTY_PROJECT[0])
        b_rows = a_rows.copy()
        a_rows[3], b_rows[3] = (6,) * 8, (2,) * 8
        a = Generation(b"A" * 16, 0, tuple(a_rows), 6, 4)
        b = Generation(b"B" * 16, 0, tuple(b_rows))
        state = Transition(a)
        old = state.begin(b.project)
        self.assertIsNone(state.selected())
        state.finish(old, a.project)
        self.assertIs(state.selected(), a)
        current = state.begin(b.project)
        with self.assertRaises(ValueError):
            state.finish(old, b.project, b)
        state.finish(current, None)
        self.assertIsNone(state.selected())
        self.assertIs(state.committed, a)
        current = state.begin(b.project)
        with self.assertRaises(ValueError):
            state.finish(current, a.project, b)
        self.assertIsNone(state.selected())
        state.finish(current, b.project, b)
        self.assertIs(state.selected(), b)
