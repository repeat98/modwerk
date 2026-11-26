"""__NAME__'s two references, imported by verify.py, perf.py and test_reference.py.

float_model: upstream/ (Airwindows __UPSTREAM__ at __REVISION__) in double precision at 44.1 kHz, less its
32-bit float dither and denormal noise: the Octatrack's path is 24-bit fixed point, where neither applies.
test_reference.py holds Model to it.

Model: engine.asm instruction by instruction, on 24-bit words and a 56-bit accumulator, so dsp_host's render
must match it to the bit (verify.py). As npm run module:new wrote it, engine.asm returns at once and Model
passes the audio through: port upstream's processReplacing into float_model, then write the assembly and this
model side by side, constant by constant. sdk/octatrack/modules/mackity/reference.py is a finished pair.
"""
import math  # noqa: F401  (the float model's)

FS = 44100.0
Q = 1 << 23

# Set True once float_model is upstream's algorithm and Model is what engine.asm computes; verify.py and
# test_reference.py fail until then, so a pass-through never passes for a port.
PORTED = False

# The knobs in manifest.py's slot order, their defaults and the dearest setting (manifest.py's `dear`).
KNOBS = ("P0", "P1")
DEFAULTS = (64, 0)
DEAREST = (127, 127)


def float_model(left, right, knobs):
    """Upstream's sample loop on floats in [-1, 1) at `knobs` (the knob values, 0-127, in slot order);
    returns (left, right) float lists. Map each knob to upstream's parameter (0.0-1.0) as the port does."""
    raise NotImplementedError("port upstream's processReplacing (upstream/*Proc.cpp) into float_model")


# ---- the fixed-point model -------------------------------------------------

def s24(v):
    v &= 0xffffff
    return v - (1 << 24) if v & 0x800000 else v


def w56(a):
    a &= (1 << 56) - 1
    return a - (1 << 56) if a >> 55 else a


def lim(a):
    """move a,x0 / move a,x:(..): the limiter."""
    return max(-0x800000, min(0x7fffff, a >> 24))


def hi(a):
    """move a1,x0: the middle word, unlimited."""
    return s24(a >> 24)


def ld(x):
    """A 24-bit word loaded into an accumulator's middle."""
    return x << 24


def mac(a, x, y):
    """mac x0,y1,a: the fractional product, doubled."""
    return w56(a + 2 * x * y)


class Model:
    """One instance of engine.asm. call(frames, words) runs one proc on [(left, right)] with the twelve knob
    words (value << 16, plus any fraction bits an LFO leaves) and returns [(left, right)]."""

    def __init__(self):
        self.x = [0] * 32   # X:(r7+$00..$1f), as init leaves it

    def call(self, frames, words):
        return list(frames)


def render(left, right, knob_rows, frames=16, split=0, pwords=None):
    """dsp_host's schedule in the model: blocks of `frames`, a knob row per block (block -> knob values from
    then on), and a split call first when split > 0. pwords: slot -> low 16 bits added to that knob word."""
    m = Model()
    out_l, out_r = [], []
    cur = knob_rows.get(0, DEFAULTS)
    pw = pwords or {}
    for blk in range((len(left) + frames - 1) // frames):
        cur = knob_rows.get(blk, cur)
        values = list(cur) + [0] * (12 - len(cur))
        words = [(v << 16) | pw.get(slot, 0) for slot, v in enumerate(values)]
        lo = blk * frames
        fr = list(zip(left[lo:lo + frames], right[lo:lo + frames]))
        for part in ([fr[:split], fr[split:]] if split else [fr]):
            for l, r in m.call(part, words):
                out_l.append(l)
                out_r.append(r)
    return out_l, out_r, m
