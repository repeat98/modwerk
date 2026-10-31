# SPDX-License-Identifier: GPL-3.0-or-later
"""CODEC ECHO -- an echo whose repeats pass through a lossy codec.

A per-track FX2 effect with its own delay line in the allocator's buffer. The line runs at half the rate and
stores 12-bit samples two to a word, so 15,870 words hold 1.44 s; every repeat goes through the codec again --
an ADPCM coder at 5 down to 2 bits a sample (G.726's 40 to 16 kbit/s depths) and a low-pass (LOSS), packets lost at random (DROP, PKT) and concealed by silence or by the
packet before (PLC) -- so the echoes grow darker, coarser and more broken as they repeat.

TIME is a note division of the project's tempo, read from stock's tempo24 at r6+$13 as octabam's BusDelay reads
it (an FX2 instance's record; FX1's is not known to carry it), which is one reason this is FX2-only; the other is
the line, 15,870 words against an FX1 slot's 3,072.

DEFAULTS ARE A PASSTHROUGH at MIX 0 (the line keeps running). The first 124 calls after it is chosen clear the
line, 128 words each through a modulus of $3dfd, and pass the dry untouched; the slot's last $202 words
(Sidechain Compressor's key window on T3 and T7) are never written.

Draft: the code has run only in fxhost (tools/fxhost.cpp, the vendored dsp56kEmu with no firmware); nothing has
run under the ColdFire port, in a built image or on a unit. The effect id is a placeholder for the base's USB id
allocation.
"""

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness, Kind, MenuEntry, Module,
                          Param, Proof, YBase)

# MIDI clocks (24 a quarter note) per TIME step: 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T,
# 1/4D, 1/2.
CLOCKS = (3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48)
# The ADPCM's 89 step sizes, IMA's progression (7 x 1.1^k of 32,768), as fractions of full scale (S), and their
# reciprocals over 8,192 (W = 1 / (8192 S)), which the quantiser multiplies by instead of dividing.
_STEPS = tuple(min(32767, round(7 * 1.1 ** k)) / 32768.0 for k in range(89))
S_TABLE = tuple(max(1, min(0x7fffff, round(s * 0x800000))) for s in _STEPS)
W_TABLE = tuple(min(0x7fffff, round(0x800000 / (8192.0 * s))) for s in _STEPS)
# Per depth (LOSS / 32: 5, 4, 3, 2 bits): the quantiser's shift 12 - bits, the largest code 2^(bits-1) - 1, the
# dequantiser's shift 25 - bits, and half the codes 2^(bits-2).
DEPTHS = tuple(v for bits in (5, 4, 3, 2) for v in (12 - bits, 2 ** (bits - 1) - 1, 25 - bits, 2 ** (bits - 2)))
TIME_LABELS = ("1/32", "1/16T", "1/16", "1/8T", "1/16D", "1/8", "1/4T", "1/8D", "1/4", "1/2T", "1/4D", "1/2")

_PLAIN = Formatter.PLAIN

MODULE = Module(
    name="codececho",
    key="CODEC ECHO",
    kind=Kind.DSP_EFFECT,
    doc="An echo on the tempo whose repeats pass through a lossy codec: darker, coarser, packets lost.",
    category=Category.TRACK, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED, proof_note="draft: rendered only in fxhost (dsp56kEmu alone, no firmware)",
    menu=MenuEntry(
        fx2_id=0x07,
        donor_desc=0x400d58b8,     # DARK REV; every slot below is written
        abbr=b"CDEC",
        fullname=b"CODEC ECHO",
        build_tag=False,
    ),
    params=(
        Param(b"TIME", 8, 12, active=True, formatter=Formatter.WIDE_STEPPED, labels=TIME_LABELS,
              doc="the echo's time, a note division of the tempo"),
        Param(b"FDBK", 64, active=True, formatter=_PLAIN,
              doc="how much of each echo comes back, up to 0.95"),
        Param(b"LOSS", 48, active=True, formatter=_PLAIN,
              doc="the codec: ADPCM at 5, 4, 3 or 2 bits, and darker, every pass"),
        Param(b"DROP", 16, active=True, formatter=_PLAIN,
              doc="the chance a packet is lost, up to one in two"),
        Param(b"PKT", 40, active=True, formatter=_PLAIN,
              doc="a packet's length, 2.9 to 46 ms"),
        Param(b"MIX", 0, active=True, formatter=_PLAIN,
              doc="the echoes over the dry; 0 = the dry, untouched"),
        Param(b"PLC", 1, 2, active=True, formatter=Formatter.STEPPED, labels=("MUTE", "RPT"),
              doc="a lost packet: silence, or the packet before it again"),
        Param(), Param(), Param(), Param(), Param(),
    ),
    dsp=DspSection(
        asm="modules/codececho/codececho.asm",
        priority=26,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        # The divisions' clocks at +0, W at +12, S at +101, the depths at +190, through the build's base literal.
        ptable=CLOCKS + W_TABLE + S_TABLE + DEPTHS,
    ),
    # 15,870 words from the base: the slot's last $202 words stay Sidechain Compressor's key window.
    claims=Claims(stock_instance_buffer=True, buffer_words=15870),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/codececho/verify.py", remix_arg=False),),
    # Dearest: lost packets repeated, the codec and the feedback at work, the longest time.
    dear={"TIME": 11, "FDBK": 127, "LOSS": 127, "DROP": 127, "PKT": 0, "MIX": 127, "PLC": 1},
)
