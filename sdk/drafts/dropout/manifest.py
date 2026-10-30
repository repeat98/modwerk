# SPDX-License-Identifier: GPL-3.0-or-later
"""DROPOUT -- the track drops out now and then, like a failing tape or stream.

A per-track INSERT. Dropouts start at random (CHNC) and last around LEN; each fades in and out by EDGE. MODE says
what the track drops to: GAP (silence), HOLD (the last few milliseconds, looped: a stuck buffer) or CRSH (the track
held and reduced to 6 bits); DPTH sets how far, TONE darkens it. Three ways of doing one job -- the track dropping
out -- so one module with a MODE select (docs/module-guides/effects.md, one effect per module).

Outside a dropout the output is the input bit for bit, so the defaults leave the track untouched between dropouts.
HOLD keeps the last 1,024 frames in the first 2,048 words of the allocator's buffer, which an FX1 slot (3,072
words) holds, so it runs on FX1 and FX2. A loop is never longer than the frames written since init: the buffer's
old contents are never heard.

Draft: the code has run only in fxhost (tools/fxhost.cpp, the vendored dsp56kEmu with no firmware); nothing has
run under the ColdFire port, in a built image or on a unit. The effect id is a placeholder for the base's USB id
allocation.
"""

import math

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness, Kind, MenuEntry, Module,
                          Param, Proof, YBase)

FS = 44100.0


def _frac(v):
    return max(0, min(0x7fffff, round(v * 0x800000)))


def _chance(k):
    """The chance a sample that a dropout starts: none at 0, once in 20 s on average at 1, every 60 ms at 127."""
    if k == 0:
        return 0
    return _frac(1.0 / (20.0 * FS * (0.06 / 20.0) ** ((k - 1) / 126.0)))


def _length(k):
    """A dropout's mean length in samples: 5 ms at 0 to 1 s at 127."""
    return round(0.005 * FS * 200.0 ** (k / 127.0))


def _step(k):
    """The depth's ramp step a sample: a ramp of 0.1 ms at 0 to 50 ms at 127."""
    return _frac(1.0 / (4.0 * (2205.0 / 4.0) ** (k / 127.0)))


P_TABLE = tuple(_chance(min(k, 127)) for k in range(129))
L_TABLE = tuple(_length(min(k, 127)) for k in range(129))
E_TABLE = tuple(_step(min(k, 127)) for k in range(129))

_PLAIN = Formatter.PLAIN

MODULE = Module(
    name="dropout",
    key="DROPOUT",
    kind=Kind.DSP_EFFECT,
    doc="Random dropouts: the track drops to silence, a stuck loop or a crushed copy, and comes back.",
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
        Param(b"CHNC", 40, active=True, formatter=_PLAIN,
              doc="how often dropouts start: once in 20 s at 1 to every 60 ms at 127; 0 = never"),
        Param(b"LEN", 48, active=True, formatter=_PLAIN,
              doc="how long a dropout lasts, about 5 ms to 1 s (each one varies)"),
        Param(b"DPTH", 127, active=True, formatter=_PLAIN,
              doc="how far the track drops; 127 = all the way"),
        Param(b"EDGE", 24, active=True, formatter=_PLAIN,
              doc="how fast a dropout fades in and out, 0.1 ms to 50 ms"),
        Param(b"TONE", 0, active=True, formatter=_PLAIN,
              doc="darkens the track while it drops out"),
        Param(),
        Param(b"MODE", 0, 3, active=True, formatter=Formatter.STEPPED,
              labels=("GAP", "HOLD", "CRSH"),
              doc="what the track drops to: silence, a stuck loop, a crushed copy"),
        Param(),
        Param(b"SIZE", 48, active=True, formatter=_PLAIN,
              doc="HOLD: the loop, 1.5 to 21 ms; CRSH: the hold, 2 to 33 samples"),
        Param(),
        Param(),
        Param(),
    ),
    dsp=DspSection(
        asm="modules/dropout/dropout.asm",
        priority=25,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        # P at +0, L at +129, E at +258, read through the build's base literal.
        ptable=P_TABLE + L_TABLE + E_TABLE,
    ),
    claims=Claims(stock_instance_buffer=True, buffer_words=2048),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/dropout/verify.py", remix_arg=False),),
    # Dearest: HOLD's loop read and buffer write, the darkening, dropouts back to back.
    dear={"CHNC": 127, "LEN": 127, "DPTH": 127, "EDGE": 127, "TONE": 127, "MODE": 1, "SIZE": 127},
)
