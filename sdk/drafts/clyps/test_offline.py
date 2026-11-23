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
        self.rows[0][4][0] = self.rows[7][3][0]
        self.assertEqual(self.rows[0][3][0], 0)
        self.a.save("working", self.rows)
        n, banks = decode(self.a.files["working"], self.a.identity)
        self.assertEqual((n, len(banks)), (2, 16))
        self.assertEqual([banks[i][3][0] for i in (0, 7, 0, 1, 2)], [0, 7, 0, 1, 2])
        self.assertEqual(banks[0][4], tuple(self.rows[0][4]))
        self.assertIsNone(banks[15][0])
        self.assertIsNone(decode(self.a.files["saved"], self.a.identity)[1][0][4])

    def test_independent_layout(self):
        # Build the expected wire bytes directly from the v1 specification.
        from struct import pack
        from zlib import crc32
        from offline.bank_codec import encode
        header = b"CLYP" + pack(">HH", 1, 2212) + self.a.identity + pack(">Q", 23)
        index = b"".join(pack(">BBHH", i, 16, 128 + 130 * i, 130) for i in range(16))
        payload = bytearray(2080)
        for i in (0, 1, 2, 7):
            payload[i*130 + 1] = 8
            start = i*130 + 2 + 3*8
            payload[start:start+8] = bytes([i, 16, 17, 0, 1, 2, 3, 4])
        expected = header + index + payload
        expected += pack(">I", crc32(expected))
        self.assertEqual(encode(self.a.identity, 23, self.rows), expected)
        self.assertEqual(decode(expected, self.a.identity)[0], 23)

    def test_reentry_and_stored_reload(self):
        self.assertEqual(self.a.load("saved"), (0, EMPTY_PROJECT))
        self.a.save("saved", self.rows)
        self.rows[1][3][0] = 9
        self.a.save("working", self.rows)
        # Recreate the host object using only the bytes that survived OFF.
        reopened = Archive(self.a.identity)
        reopened.files.update(self.a.files)
        self.assertEqual(reopened.load("saved")[1][1][3][0], 1)
        self.assertEqual(reopened.load("working")[1][1][3][0], 9)
        reopened.files["saved"] = reopened.files["saved"][:-1]
        with self.assertRaises(ValueError):
            reopened.load("saved")
        self.assertEqual(reopened.load("working")[1][1][3][0], 9)

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
        a = Generation(b"A" * 16, 0, tuple(a_rows), 7, 6, 4)
        b = Generation(b"B" * 16, 0, tuple(b_rows), 12)
        state = Transition(a)
        old = state.begin(b.project)
        self.assertIsNone(state.selected())
        state.finish(old, a.binding)
        self.assertIs(state.selected(), a)
        current = state.begin(b.project)
        with self.assertRaises(ValueError):
            state.finish(old, b.binding, b)
        state.finish(current, None)
        self.assertIsNone(state.selected())
        self.assertIs(state.committed, a)
        for unverified in ((a.project, 7, a.epoch), (a.project, 0, a.epoch + 1)):
            current = state.begin(b.project)
            state.finish(current, unverified)
            self.assertIsNone(state.selected())
            self.assertIs(state.committed, a)
        current = state.begin(b.project)
        with self.assertRaises(ValueError):
            state.finish(current, a.binding, b)
        self.assertIsNone(state.selected())
        state.finish(current, b.binding, b)
        self.assertIs(state.selected(), b)
