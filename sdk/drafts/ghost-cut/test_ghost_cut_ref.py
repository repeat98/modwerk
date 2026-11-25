"""Host tests for ghost_cut_ref.py: no firmware, no DSP tools (npm run sdk:check runs them)."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).absolute().parent))
import ghost_cut_ref as REF  # noqa: E402


def knobs(**kw):
    names = {"LEN": 0, "GRAB": 1, "RATE": 2, "PTCH": 3, "DRFT": 4, "MIX": 5, "ENG": 6, "CAPT": 7, "GRN": 8,
             "MOTN": 9, "DIR": 10}
    v = [3, 0, 64, 64, 0, 127, 0, 0, 40, 4, 0, 0]
    for k, x in kw.items():
        v[names[k]] = x
    return v


class Table(unittest.TestCase):
    def test_shape(self):
        self.assertEqual(len(REF.TABLE), 33 + 16 + 50 + 8)
        self.assertTrue(all(0 <= w < 1 << 24 for w in REF.TABLE))
        self.assertTrue(all(0 < k < 1 << 23 for k in REF.MOTN_K))

    def test_rate_points(self):
        self.assertEqual(REF.RATE_T[16], 1 << 20)          # 64 is 1 x
        self.assertEqual(REF.RATE_T[0], 1 << 18)           # 0 is 1/4 x
        self.assertEqual(REF.RATE_T[32], 1 << 22)          # the table's last point is 4 x
        self.assertEqual(REF.rate_q20(64 << 16), 1 << 20)
        self.assertLess(REF.rate_q20(127 << 16), 1 << 22)
        self.assertTrue(all(a < b for a, b in zip(REF.RATE_T, REF.RATE_T[1:])))

    def test_len_dividends_are_doubled(self):
        for i, n in enumerate(REF.LEN_N):
            hi, lo = REF.TABLE[33 + 2 * i], REF.TABLE[34 + 2 * i]
            self.assertEqual((hi << 24) | lo, 2 * n)
            self.assertLess(hi, 720)                      # the div's high word stays under every divisor


class Pitch(unittest.TestCase):
    def test_points(self):
        self.assertEqual(REF.pitch_q20(64 << 16), 1 << 20)
        self.assertEqual(REF.pitch_q20(76 << 16), 1 << 21)      # +12: an octave up
        self.assertEqual(REF.pitch_q20(52 << 16), 1 << 19)
        self.assertEqual(REF.pitch_q20(127 << 16), 1 << 22)     # clamped at +24
        self.assertEqual(REF.pitch_q20(0), 1 << 18)             # clamped at -24
        self.assertEqual(REF.pitch_q20((39 << 16) | 0x8000), 1 << 18)  # a fraction under -24 stays there


def zero_cross_hz(x):
    t = [i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]) for i in range(1, len(x)) if x[i - 1] < 0 <= x[i]]
    gaps = sorted(b - a for a, b in zip(t, t[1:]))
    return 44100 / gaps[len(gaps) // 2]


class Grain(unittest.TestCase):
    def render(self, **kw):
        import math
        n = 1200 * REF.BLOCK
        sine = [int(0.5 * 0x7FFFFF * math.sin(2 * math.pi * 500 * i / 44100)) for i in range(n)]
        ol, _ = REF.render(sine, sine, {0: knobs(ENG=1, **kw), 600: knobs(ENG=1, GRAB=127, **kw)}, REF.tempo24(120))
        return ol[600 * REF.BLOCK + 2000:]

    def test_ptch_sets_pitch_and_rate_does_not(self):
        for ptch, rate, hz in ((64, 64, 500), (76, 64, 1000), (52, 64, 250), (76, 32, 1000), (64, 100, 500)):
            got = zero_cross_hz(self.render(PTCH=ptch, RATE=rate))
            self.assertAlmostEqual(got, hz, delta=hz * 0.03, msg=(ptch, rate))


class Drift(unittest.TestCase):
    def test_motn_cycle(self):
        # a 1 bar triangle at 120 BPM: 88,200 samples, 5,512.5 blocks
        per_block = 2 * REF.tempo24(120) * REF.MOTN_K[2]
        self.assertAlmostEqual(REF.PHASE_CYCLE / per_block, 88200 / 16, delta=0.5)

    def test_drift_zero_is_milestone_b(self):
        n = 900 * REF.BLOCK
        x, sig = 5, []
        for _ in range(n):
            x = (x * 1103515245 + 12345) & 0x7FFFFFFF
            sig.append((((x >> 7) & 0xFFFFFF) - 0x800000) >> 2)
        for eng in (0, 1):
            ol, orr = REF.render(sig, sig, {0: knobs(ENG=eng), 600: knobs(ENG=eng, GRAB=127)})
            self.assertEqual(ol, orr)                       # no drift: one head, both sides alike

    def test_drift_parts_the_sides_on_tape(self):
        n = 1400 * REF.BLOCK
        x, sig = 9, []
        for _ in range(n):
            x = (x * 1103515245 + 12345) & 0x7FFFFFFF
            sig.append((((x >> 7) & 0xFFFFFF) - 0x800000) >> 2)
        ol, orr = REF.render(sig, sig, {0: knobs(DRFT=127, MOTN=0), 600: knobs(DRFT=127, MOTN=0, GRAB=127)})
        tail = range(1000 * REF.BLOCK, 1400 * REF.BLOCK)
        self.assertGreater(sum(1 for t in tail if ol[t] != orr[t]), len(tail) // 2)


class Lengths(unittest.TestCase):
    def test_120_bpm(self):
        t = REF.tempo24(120)
        self.assertEqual(t, 2880)
        self.assertEqual(REF.loop_length(3, t), 5512)    # 1/16
        self.assertEqual(REF.loop_length(0, t), 1378)    # 1/64
        self.assertEqual(REF.loop_length(7, t), 11025)   # 1/4 is 22,050, halved once

    def test_every_length_fits(self):
        for bpm in (30, 45, 60, 90, 120, 133.33, 174, 240, 300):
            for i in range(8):
                L = REF.loop_length(i, REF.tempo24(bpm))
                self.assertGreater(L, REF.SEAM)
                self.assertLessEqual(L, REF.LMAX)

    def test_halving_keeps_time(self):
        exact = REF.LEN_N[7] / REF.tempo24(60)            # 44,100
        L = REF.loop_length(7, REF.tempo24(60))
        self.assertEqual(L * 4, int(exact))

    def test_no_tempo_word_is_120(self):
        self.assertEqual(REF.loop_length(3, 0), REF.loop_length(3, 2880))


class Behaviour(unittest.TestCase):
    N = 900 * REF.BLOCK

    def sig(self, seed):
        x, out = seed, []
        for _ in range(self.N):
            x = (x * 1103515245 + 12345) & 0x7FFFFFFF
            out.append(((x >> 7) & 0xFFFFFF) - 0x800000 >> 2)
        return out

    def test_idle_is_exact_dry(self):
        l, r = self.sig(1), self.sig(2)
        ol, orr = REF.render(l, r, {0: knobs(RATE=127, DIR=2, GRAB=95)})
        self.assertEqual((ol, orr), (l, r))

    def test_grab_loops_the_last_len_and_release_returns_dry(self):
        l, r = self.sig(1), self.sig(2)
        g0, rel = 600, 850
        ol, _ = REF.render(l, r, {0: knobs(), g0: knobs(GRAB=127), rel: knobs(GRAB=0)})
        mono = [(a + b) >> 1 for a, b in zip(l, r)]
        L, t0 = 5512, g0 * REF.BLOCK
        for t in range(t0 + 400, t0 + 2000):  # the loop starts 112 in, full after 368
            ph = (t - t0 + 1) % L
            self.assertLessEqual(abs(ol[t] - mono[t0 - L + ph]), 2)
        back = rel * REF.BLOCK + REF.SEAM + REF.BLOCK
        self.assertEqual(ol[back:], l[back:])

    def test_hysteresis(self):
        l, r = self.sig(3), self.sig(4)
        a, _ = REF.render(l, r, {0: knobs(), 600: knobs(GRAB=127), 700: knobs(GRAB=64)})
        b, _ = REF.render(l, r, {0: knobs(), 600: knobs(GRAB=127)})
        self.assertEqual(a, b)                            # 64 does not let go


if __name__ == "__main__":
    unittest.main()
