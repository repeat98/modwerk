"""__NAME__ host test: the fixed-point model against upstream's algorithm.

    python3 -B test_reference.py      (no tools, no firmware)

What it proves once ported: the model (reference.Model, which verify.py holds the assembly to, bit for bit)
computes upstream's __UPSTREAM__: the level within 0.001 dB of the double precision original and everything
else under -100 dB, the original limited at full scale where it goes over (a 24-bit output cannot); silence
stays silence. Tighten or loosen the limits to what the port achieves, and say why in TESTING.md. What it
cannot see: the assembly itself (verify.py), the unit, the sound.
"""
import math
import pathlib
import random
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference as R  # noqa: E402

Q = R.Q


def tone(f, amp, n):
    return [round(amp * Q * math.sin(2 * math.pi * f * i / R.FS)) for i in range(n)]


def error_db(fixed, ref, skip=4410):
    """(gain error in dB, residual after that gain in dB to the signal), the original limited at full scale."""
    ref = [max(-1.0, min(1.0 - 1 / Q, v)) for v in ref]
    fx = [v / Q for v in fixed]
    s = sum(v * v for v in ref[skip:])
    g = sum(fx[i] * ref[i] for i in range(skip, len(ref))) / s
    e = sum((fx[i] - g * ref[i]) ** 2 for i in range(skip, len(ref)))
    return 20 * math.log10(g), 10 * math.log10(max(e, 1e-30) / s)


class Reference(unittest.TestCase):
    def test_ported(self):
        self.assertTrue(R.PORTED, "reference.py still models the scaffold's pass-through: port upstream into "
                                  "float_model and Model, then set PORTED = True")

    def test_matches_the_original(self):
        for knobs, f, amp in ((R.DEFAULTS, 1000, 0.5), (R.DEFAULTS, 100, 0.9), (R.DEAREST, 440, 0.5),
                              (R.DEAREST, 9100, 0.89)):
            with self.subTest(knobs=knobs, hz=f, amp=amp):
                x = tone(f, amp, 22050)
                try:
                    ref, _ = R.float_model([v / Q for v in x], [0.0] * len(x), knobs)
                except NotImplementedError as error:
                    self.fail(str(error))
                out, _, _ = R.render(x, x, {0: knobs})
                if not any(ref[4410:]):
                    self.assertFalse(any(out[4410:]))
                    continue
                gain, residual = error_db(out, ref)
                self.assertLess(abs(gain), 0.001)
                self.assertLess(residual, -100)

    def test_silence_stays_silence(self):
        z = [0] * 4096
        for knobs in (R.DEFAULTS, R.DEAREST):
            with self.subTest(knobs=knobs):
                out_l, out_r, _ = R.render(z, z, {0: knobs})
                self.assertFalse(any(out_l + out_r))

    def test_tail_ends_in_silence(self):
        rnd = random.Random(3)
        burst = [round(0.5 * Q * (rnd.random() * 2 - 1)) if i < 4410 else 0 for i in range(44100 * 2)]
        for knobs in (R.DEFAULTS, R.DEAREST):
            with self.subTest(knobs=knobs):
                out_l, out_r, _ = R.render(burst, burst, {0: knobs})
                self.assertFalse(any(out_l[-22050:] + out_r[-22050:]))


if __name__ == "__main__":
    unittest.main()
