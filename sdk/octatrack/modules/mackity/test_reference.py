"""MACKITY host test: the fixed-point model against upstream's algorithm.

    python3 -B test_reference.py      (no tools, no firmware)

What it proves: the model (reference.Model, which verify.py holds the
assembly to, bit for bit) computes Mackity: the double precision original's
level within 0.001 dB and everything else under -100 dB, with the
original's output limited at full scale where it goes over (a 24-bit
output cannot); the defaults
are exact; silence after a burst ends in exact silence. What it cannot see:
the assembly itself (verify.py), the unit, the sound.
"""
import math
import pathlib
import random
import re
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference as R  # noqa: E402

Q = R.Q


def tone(f, amp, n):
    return [round(amp * Q * math.sin(2 * math.pi * f * i / R.FS)) for i in range(n)]


def error_db(fixed, ref, skip=4410):
    """(gain error in dB, residual after that gain in dB to the signal), the
    original limited at full scale. The gain word's resolution at low TRIM
    (0.0006 dB at TRIM 5) is a level, not noise: it is measured apart."""
    ref = [max(-1.0, min(1.0 - 1 / Q, v)) for v in ref]
    fx = [v / Q for v in fixed]
    s = sum(v * v for v in ref[skip:])
    g = sum(fx[i] * ref[i] for i in range(skip, len(ref))) / s
    e = sum((fx[i] - g * ref[i]) ** 2 for i in range(skip, len(ref)))
    return 20 * math.log10(g), 10 * math.log10(max(e, 1e-30) / s)


class Mackity(unittest.TestCase):
    def test_constants_match_upstream_formulas(self):
        """The words in mackity.asm are upstream's coefficients, halved, in Q23."""
        asm = (HERE / "mackity.asm").read_text()
        chan = asm.split("\nmack_chan:")[1]
        words = [int(w, 16) for w in re.findall(r"#>\$([0-9a-f]{6}),y1", chan)]
        bq = [w & 0xffffff for w in (*R.BQ_A, *R.BQ_B)]
        expect = [R.K1, *bq[:5], R.KQ, *bq[5:], R.K2]
        self.assertEqual(words, expect)
        self.assertIn(f"#>${R.TRIMC:06x},y1", asm)

    def test_matches_the_original(self):
        for trim, pad, f, amp in ((13, 127, 1000, 0.5), (13, 127, 100, 0.9), (40, 127, 440, 0.5),
                                  (127, 127, 440, 0.5), (127, 127, 9100, 0.89), (5, 127, 1000, 0.9),
                                  (64, 100, 5300, 0.25), (0, 127, 1000, 0.5), (13, 0, 1000, 0.5)):
            with self.subTest(trim=trim, pad=pad, hz=f, amp=amp):
                x = tone(f, amp, 22050)
                out, _, _ = R.render(x, x, {0: (trim, pad)})
                ref, _ = R.float_mackity([v / Q for v in x], [0.0], R.trim_a(trim), R.pad_b(pad))
                if not any(ref[4410:]):
                    self.assertFalse(any(out[4410:]))
                    continue
                gain, residual = error_db(out, ref)
                self.assertLess(abs(gain), 0.001)
                self.assertLess(residual, -100)

    def test_defaults_are_exact(self):
        m = R.Model()
        self.assertEqual(m.knobs(13 << 16, 127 << 16), (0x010000, 0x400000))  # gain 1/128, pad 1/2

    def test_tail_ends_in_silence(self):
        rnd = random.Random(3)
        burst = [round(0.5 * Q * (rnd.random() * 2 - 1)) if i < 4410 else 0 for i in range(44100 * 3)]
        for trim in (13, 127):
            with self.subTest(trim=trim):
                out, _, _ = R.render(burst, burst, {0: (trim, 127)})
                self.assertFalse(any(out[-44100:]))

    def test_glide_settles_exactly(self):
        x = tone(1000, 0.25, 4096)
        _, _, m = R.render(x, x, {0: (127, 0), 8: (13, 127)})
        self.assertEqual((m.x[0x19], m.x[0x1c]), (m.x[0x18], m.x[0x1b]))


if __name__ == "__main__":
    unittest.main()
