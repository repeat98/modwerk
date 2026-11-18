"""Float reference for TAPEHEAD: JClones_TapeHead.jsfx (MIT, Copyright (c)
2026 JClones) line for line, plus the knob mapping tapehead.asm uses.

Ground truth for verify.py. SR is 44,100 Hz, the rate every Octamod effect
assumes. Clip is always on (the JSFX's default), as in the module. render() adds
the module's INPUT_GAIN; render_jsfx() is the plugin alone.
"""
import math

SR = 44100.0
COLOR_HZ = (2100.0, 3680.0, 5000.0)      # NORM / MED / BRGT

# The unit applies AMP VOL as (v/127)^2 before the FX chain: at the default
# VOL 64 a 0 dBFS sample arrives at 0.254 FS. The module runs the JSFX at
# x * INPUT_GAIN and divides its output by INPUT_GAIN, so a sample at the
# default VOL saturates as the same sample does in the JSFX in a DAW.
INPUT_GAIN = 4.0


class TapeHead:
    def __init__(self, drive_logical=3.5, trim_db=-3.0, color=0, sr=SR):
        self.drive_k = (10.0 ** ((drive_logical - 1.0) / 9.0)) * 0.8
        self.trim_k = (10.0 ** (trim_db / 20.0)) * 0.7
        self.k1 = 5.0 / 7.0
        self.k2 = 2.0 * math.sin(COLOR_HZ[color] * math.pi / sr)
        self.k3 = -1.4 * self.k2
        gain = 1.4 if sr < 88200.0 else 2.0
        self.g3 = -(10.0 ** (gain * 3.0 / 20.0)) * self.k1
        self.y1 = self.y2 = self.y3 = 0.0

    @staticmethod
    def clip(x):
        return -1.0 if x < -1.0 else (1.0 if x > 1.0 else x)

    @staticmethod
    def smoothstep(x):
        if x < -1.0:
            return -1.0
        if x > 1.0:
            return 1.0
        return x * 1.5 - x * x * x * 0.5

    def process(self, x):
        x = self.clip(x)
        self.y1 += self.y2 * self.k2
        self.y3 = self.y1 * self.k1 + self.y2 - x
        self.y2 += self.y3 * self.k3
        y1_sat = self.smoothstep(self.y1 * self.drive_k)
        y2_sat = self.smoothstep(self.y2 * self.drive_k)
        y = (self.clip(self.y3) * self.g3 + y1_sat + y2_sat) * self.trim_k
        return self.clip(y)


def from_knobs(drive, trim, color):
    """The panel's mapping: t = knob/128; JSFX drive 1 + 9t; trim -21t dB."""
    return TapeHead(1.0 + 9.0 * drive / 128.0, -21.0 * trim / 128.0, color)


def render_jsfx(drive, trim, color, xs):
    """The JSFX itself at the panel's knob mapping (no INPUT_GAIN)."""
    th = from_knobs(drive, trim, color)
    return [th.process(v) for v in xs]


def render(drive, trim, color, xs):
    """What the module renders: JSFX(INPUT_GAIN * x) / INPUT_GAIN."""
    th = from_knobs(drive, trim, color)
    return [th.process(v * INPUT_GAIN) / INPUT_GAIN for v in xs]
