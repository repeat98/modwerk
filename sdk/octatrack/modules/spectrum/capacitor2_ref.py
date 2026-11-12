"""Airwindows Capacitor2 (Chris Johnson, MIT) -- the float reference CAP is
proven against (tools/verify/verify_spectrum.py). A transcription of
Capacitor2Proc.cpp's processDoubleReplacing with the per-buffer parameter
chase held at its target (ours chases per block) and the dither dropped.
A = lowpass (0..1, 1 open), B = highpass (0..1, 0 off), C = NonLin (0 mild
.. 1 intense), wet = 1."""
import math


class Capacitor2:
    """octabam=False: the plugin's knob laws. octabam=True (the station's, 14
    Sep 2026): LOW never closes (0.004 + 0.996 A^2), HIGH never freezes nor
    kills (0.9 B^2 + 2^-12 -- a pole at amount 0 subtracts its last value
    forever), and the dielectric term is gained by 1 + 15 C because our
    signals sit a tenth of the plugin's full scale; scale is clipped at 2 (the
    port's halved word). The poles, the rotation and the trim are the author's."""
    def __init__(self, A, B, C, octabam=False):
        self.lp = A * A; self.hp = B * B; self.gain = 1.0
        if octabam:
            self.lp = 0.004 + 0.996 * A * A; self.hp = 2 ** -12; self.gain = 1.0 + 15.0 * C   # option B: no HIGH cut, B ignored
        self.octabam = octabam
        self.nonLin = 1.0 + ((1.0 - C) * 6.0)
        self.trim = 1.5 / (self.nonLin ** (1.0 / 3.0))
        self.h = [[0.0] * 6, [0.0] * 6]      # A..F per channel
        self.l = [[0.0] * 6, [0.0] * 6]
        self.count = 0

    PAIRS = ((1, 3), (2, 4), (1, 5), (2, 3), (1, 4), (2, 5))   # case 0..5: (B|C, D|E|F)

    def sample(self, ch, x):
        scale = abs(1.0 - self.gain * x / self.nonLin)
        if self.octabam: scale = min(scale, 2.0)
        lpA = self.lp * scale; hpA = self.hp * scale
        h, l = self.h[ch], self.l[ch]
        for k in (0,) + self.PAIRS[self.count]:
            h[k] = h[k] * (1.0 - hpA) + x * hpA; x -= h[k]
            l[k] = l[k] * (1.0 - lpA) + x * lpA; x = l[k]
        return x * self.trim

    def process(self, L, R):
        outL, outR = [], []
        for a, b in zip(L, R):
            self.count += 1
            if self.count > 5: self.count = 0
            outL.append(self.sample(0, a)); outR.append(self.sample(1, b))
        return outL, outR
