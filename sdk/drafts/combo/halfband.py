"""COMBO's 2x oversampler: a polyphase IIR half-band filter, two paths of first-order all-passes in z^-2.

The design is the published one by Valenzuela and Constantinides ("Digital signal processing schemes for
efficient interpolation and decimation", IEE Proceedings, 1983), as the elliptic-function closed form for the
all-pass coefficients. Written here from the formulas; no code is taken from any implementation.

    python3 halfband.py      prints the coefficients, the stop-band attenuation and the pass-band edge

coefficients(n, tbw): n all-pass coefficients (even ones on path 0, odd ones on path 1) for a transition
band of tbw (a fraction of the 2x rate, from 0.25 - tbw to 0.25 + tbw).
"""
import cmath
import math


def coefficients(n, tbw):
    k = math.tan((1 - 2 * tbw) * math.pi / 4) ** 2
    kk = (1 - k * k) ** 0.25
    e = 0.5 * (1 - kk) / (1 + kk)
    e4 = e ** 4
    q = e * (1 + e4 * (2 + e4 * (15 + 150 * e4)))
    order = 2 * n + 1
    out = []
    for c in range(1, n + 1):
        num, i, sign = 0.0, 0, 1
        while True:
            t = q ** (i * (i + 1)) * math.sin((2 * i + 1) * c * math.pi / order) * sign
            num += t
            if abs(t) <= 1e-100:
                break
            sign, i = -sign, i + 1
        den, i, sign = 0.0, 1, -1
        while True:
            t = q ** (i * i) * math.cos(2 * i * c * math.pi / order) * sign
            den += t
            if abs(t) <= 1e-100:
                break
            sign, i = -sign, i + 1
        ww = num * q ** 0.25 / (den + 0.5)
        x = math.sqrt((1 - ww * ww * k) * (1 - ww * ww / k)) / (1 + ww * ww)
        out.append((1 - x) / (1 + x))
    return out


def response(coefs, f):
    """|H| of the half-band low-pass at f (a fraction of the 2x rate): (A0(z^2) + z^-1 A1(z^2)) / 2."""
    z = cmath.exp(-2j * math.pi * f)
    z2 = z * z
    paths = [1.0, 1.0]
    for i, a in enumerate(coefs):
        paths[i & 1] *= (a + z2) / (1 + a * z2)
    return abs(paths[0] + z * paths[1]) / 2


class Up:
    """x at the base rate -> (first, second) at 2x."""
    def __init__(self, coefs):
        self.c, self.x, self.y = coefs, [0.0] * len(coefs), [0.0] * len(coefs)

    def __call__(self, v):
        s = [v, v]
        for i, a in enumerate(self.c):
            p = i & 1
            t = (s[p] - self.y[i]) * a + self.x[i]
            self.x[i], self.y[i], s[p] = s[p], t, t
        return s[0], s[1]


class Down:
    """(first, second) at 2x -> one sample at the base rate."""
    def __init__(self, coefs):
        self.c, self.x, self.y = coefs, [0.0] * len(coefs), [0.0] * len(coefs)

    def __call__(self, first, second):
        s = [second, first]
        for i, a in enumerate(self.c):
            p = i & 1
            t = (s[p] - self.y[i]) * a + self.x[i]
            self.x[i], self.y[i], s[p] = s[p], t, t
        return 0.5 * (s[0] + s[1])


if __name__ == "__main__":
    for n, tbw in ((4, 0.06), (6, 0.06), (6, 0.04), (8, 0.04)):
        c = coefficients(n, tbw)
        stop = max(response(c, 0.25 + tbw + i * (0.25 - tbw) / 400) for i in range(401))
        edge = (0.25 - tbw) * 88200
        print(f"n={n} tbw={tbw}: stop-band {20 * math.log10(stop):.1f} dB, pass-band to {edge:.0f} Hz, "
              f"ripple {20 * math.log10(min(response(c, i * (0.25 - tbw) / 200) for i in range(201))):.4f} dB; "
              + ", ".join(f"{a:.6f}" for a in c))
