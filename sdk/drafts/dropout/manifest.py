# SPDX-License-Identifier: GPL-3.0-or-later
"""DROPOUT -- codec and link failures, on the project's tempo.

A per-track INSERT: the cheap part of the developer's FRAMELOSS on the DSP. An ADPCM coder at 5 down to 2 bits a
sample (BITS: G.726's 40 to 16 kbit/s depths), transmission errors at RATE events a step (MODE: HOLD the last good
sample held, PCKT a lost packet replaced by the one before it, fading, CIRC a CD's concealment of a few bad samples
or the mute of a long burst; SIZE sets how long), and a frame freeze on the step grid (FRZ: a frozen step plays its
first FRM samples and loops them to the step's end). STEP is the step those count in, from the project's tempo
(stock's tempo24 at r6+$13, as octabam's BusDelay reads it; 120 BPM when the word reads 0). One job -- the track
passing a failing codec and link -- so one module (docs/module-guides/effects.md, one effect per module). GSM, MP3
and ATRAC are too heavy for the budget and stay out.

DEFAULTS ARE A PASSTHROUGH: with RATE 0, BITS off and FRZ 0 the output is the input bit for bit, and MIX 0 returns
the dry bit for bit whatever the rest. The buffer is 3,072 words, so it fits FX1 and FX2: a ring of the last 512
coded frames (PCKT), cleared over the first 8 calls, which pass the dry, and the frozen frame (up to 1,024 frames),
written before it is read.

Draft: the code has run only in fxhost (tools/fxhost.cpp, the vendored dsp56kEmu with no firmware); nothing has
run under the ColdFire port, in a built image or on a unit. The effect id is a placeholder for the base's USB id
allocation.
"""

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness, Kind, MenuEntry, Module,
                          Param, Proof, YBase)

# The ADPCM's 89 step sizes, IMA's progression (7 x 1.1^k of 32,768), as fractions of full scale (S), and their
# reciprocals over 8,192 (W = 1 / (8192 S)), which the quantiser multiplies by instead of dividing (CODEC ECHO's).
_STEPS = tuple(min(32767, round(7 * 1.1 ** k)) / 32768.0 for k in range(89))
S_TABLE = tuple(max(1, min(0x7fffff, round(s * 0x800000))) for s in _STEPS)
W_TABLE = tuple(min(0x7fffff, round(0x800000 / (8192.0 * s))) for s in _STEPS)
# Per depth (BITS' zones 1 to 4: 5, 4, 3, 2 bits): the quantiser's shift 12 - bits, the largest code
# 2^(bits-1) - 1, the dequantiser's shift 25 - bits, and half the codes 2^(bits-2).
DEPTHS = tuple(v for bits in (5, 4, 3, 2) for v in (12 - bits, 2 ** (bits - 1) - 1, 25 - bits, 2 ** (bits - 2)))


def events_a_step(k):
    """RATE k's mean error events a step: none at 0, 1/16 (one a bar of 1/16 steps) at 1 to 16 at 127."""
    return 0.0 if k == 0 else 16.0 * 256.0 ** ((k - 127) / 126.0)


# The chance an error starts a frame is R t / 2^STEP, t the tempo word as a fraction (tempo24 / 32,768). A 1/32
# step lasts 7,938,000 / tempo24 samples, so R = events_a_step x 32,768 / 7,938,000 in Q23.
R_TABLE = tuple(min(0x7fffff, round(events_a_step(min(k, 127)) * 32768.0 / 7938000.0 * 0x800000)) for k in range(129))

TABLE = W_TABLE + S_TABLE + DEPTHS + R_TABLE          # W at +0, S at +89, the depths at +178, R at +194
assert len(W_TABLE) == 89 and len(TABLE) - len(R_TABLE) == 0xc2

STEP_LABELS = ("1/32", "1/16", "1/8", "1/4")
_PLAIN = Formatter.PLAIN

MODULE = Module(
    name="dropout",
    key="DROPOUT",
    kind=Kind.DSP_EFFECT,
    doc="Codec and link failures on the tempo: ADPCM bits, held samples, lost packets, CD errors, frozen steps.",
    category=Category.TRACK, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED, proof_note="draft: rendered only in fxhost (dsp56kEmu alone, no firmware)",
    menu=MenuEntry(
        fx2_id=0x07,
        donor_desc=0x400d58b8,     # DARK REV; every slot below is written
        abbr=b"DROP",
        fullname=b"DROPOUT",
        build_tag=False,
    ),
    params=(
        Param(b"RATE", 0, active=True, formatter=_PLAIN,
              doc="error events a step: none at 0, one in 16 steps at 1, 16 a step at 127"),
        Param(b"SIZE", 7, active=True, formatter=_PLAIN,
              doc="an error's length: HOLD 4-512, PCKT 64/128/256, CIRC 1-8 hidden, 16-1024 muted"),
        Param(b"BITS", 0, active=True, formatter=_PLAIN,
              doc="the ADPCM codec: off, then 5, 4, 3 and 2 bits a sample"),
        Param(b"FRZ", 0, active=True, formatter=_PLAIN,
              doc="the chance a step freezes on its first frame; 127 = every step"),
        Param(b"FRM", 40, active=True, formatter=_PLAIN,
              doc="the frozen frame: 64 to 1016 samples (1.5 to 23 ms)"),
        Param(b"MIX", 127, active=True, formatter=_PLAIN,
              doc="the failures over the dry; 0 = the dry, bit for bit"),
        Param(b"MODE", 0, 3, active=True, formatter=Formatter.STEPPED, labels=("HOLD", "PCKT", "CIRC"),
              doc="the error: a held sample, a lost packet replayed, CD concealment"),
        Param(),
        Param(b"STEP", 1, 4, active=True, formatter=Formatter.STEPPED, labels=STEP_LABELS,
              doc="the step RATE and FRZ count in, at the project's tempo"),
        Param(), Param(), Param(),
    ),
    dsp=DspSection(
        asm="modules/dropout/dropout.asm",
        priority=25,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        # W at +0, S at +89, the depths at +178, R at +194, read through the build's base literal.
        ptable=TABLE,
    ),
    # A 512-frame ring (1,024 words) and the frozen frame (2,048): an FX1 slot holds 3,072.
    claims=Claims(stock_instance_buffer=True, buffer_words=3072),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/dropout/verify.py", remix_arg=False),),
    # Dearest: both coders, lost packets back to back, a frozen step on every 1/32, MIX gliding.
    dear={"RATE": 127, "SIZE": 127, "BITS": 127, "FRZ": 127, "FRM": 127, "MIX": 64, "MODE": 1, "STEP": 0},
)
