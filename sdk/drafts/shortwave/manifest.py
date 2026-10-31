# SPDX-License-Identifier: GPL-3.0-or-later
"""SHORTWAVE -- the track as a distant station on a shortwave receiver.

A per-track INSERT (no bus, no buffer, no absolute Y): the track's mono sum goes through a receiver of our own
design -- a fading station (QSB), static that rises as it fades, crackle bursts, the beat whistle of a mistuned
AM carrier or the shifted voice of a mistuned single-sideband detector (MODE), the receiver's band limit and an
AGC-like soft clip -- and MIX blends it back over the stereo dry.
Every stage is per-sample arithmetic on the instance's r7 block, so it fits FX1 and FX2 alike.

DEFAULTS ARE A PASSTHROUGH: MIX 0 returns the dry bit for bit (the wet is still computed, so turning MIX up
needs no warm-up). The other defaults are a usable starting station.

Draft: the code has run only in fxhost (tools/fxhost.cpp, the vendored dsp56kEmu with no firmware); nothing has
run under the ColdFire port, in a built image or on a unit. The effect id is a placeholder for the base's USB
id allocation (the card builds' thirteen non-stock ids are all claimed but 0x07).
"""

import math

from remix.schema import (BusRole, Category, DspSection, Formatter, Gate, Harness, Kind, MenuEntry, Module, Param,
                          Proof, YBase)

FS = 44100.0


def _frac(v):
    """A Q23 word for 0 <= v < 1."""
    return max(0, min(0x7fffff, round(v * 0x800000)))


def _whistle(k):
    """The whistle's oscillator step 2 sin(pi f / fs): 40 Hz at 0 to 5.12 kHz at 127 (seven octaves)."""
    return _frac(2 * math.sin(math.pi * 40.0 * 2 ** (7.0 * k / 127) / FS))


def _band(k):
    """The receiver's low-pass f = 2 sin(pi fc / fs): 300 Hz at 0 to 4 kHz at 127. Higher, the state-variable
    filter's tuning runs away from fc and lets a 9 kHz tone through; an AM receiver's audio rarely goes past 4 kHz."""
    return _frac(2 * math.sin(math.pi * 300.0 * (4000.0 / 300.0) ** (k / 127) / FS))


def _shift(k):
    """The SSB detector's mistuning as the oscillator's step 2 sin(pi f / fs): 500 Hz * (k/127)^2, 0 at k = 0 (in
    tune), 127 Hz at 64, 500 Hz at 127. Squared so the first few hundred Hz, where a voice turns into a duck, get
    most of the knob."""
    return _frac(2 * math.sin(math.pi * 500.0 * (k / 127) ** 2 / FS))


def _chance(k):
    """The chance a sample of a new fade target: once in 2 s on average at 0, in 44 ms at 127."""
    return _frac(1.0 / (88200.0 * 2 ** (-5.5 * k / 127)))


def _q23(v):
    """A signed Q23 word for -1 <= v < 1, as the 24-bit two's complement the table holds."""
    return max(-0x800000, min(0x7fffff, round(v * 0x800000))) & 0xffffff


# 129 entries each: k = 0..127 and the interpolation's upper neighbour.
W_TABLE = tuple(_whistle(min(k, 127)) for k in range(129))
F_TABLE = tuple(_band(min(k, 127)) for k in range(129))
K_TABLE = tuple(_chance(min(k, 127)) for k in range(129))
S_TABLE = tuple(_shift(min(k, 127)) for k in range(129))

# The SSB detector's 90-degree pair: two chains of three first-order allpasses H(z) = (a + z^-1) / (1 + a z^-1).
# Our own minimax fit (Nelder-Mead on the p-th norm of the phase error, p up to 64, from random starts) of the
# phase difference to -90 degrees between 170 Hz and 4.3 kHz, the receiver's pass band: chain Q lags chain I by
# 90 +- 0.39 degrees there, which leaves the other sideband 49 dB down (tan(err/2)). verify.py recomputes the
# figure from the quantized words below. Chain I's three first, then chain Q's, in the order the code runs them.
HILBERT_I = (-0.96561573, -0.83037972, -0.11392239)
HILBERT_Q = (-0.99041577, -0.64074494, -0.92061814)
H_TABLE = tuple(_q23(a) for a in HILBERT_I + HILBERT_Q)

_PLAIN = Formatter.PLAIN
_STEP = Formatter.STEPPED

MODULE = Module(
    name="shortwave",
    key="SHORTWAVE",
    kind=Kind.DSP_EFFECT,
    doc="A shortwave receiver: fading, static, crackle, AM whistle or SSB detune, the band limit, over the dry.",
    category=Category.TRACK, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED, proof_note="draft: rendered only in fxhost (dsp56kEmu alone, no firmware)",
    menu=MenuEntry(
        fx2_id=0x07,
        donor_desc=0x400d58b8,     # DARK REV; every slot below is written
        abbr=b"SHWV",
        fullname=b"SHORTWAVE",
        build_tag=False,
    ),
    params=(
        Param(b"TUNE", 0, active=True, formatter=_PLAIN,
              doc="how far off the station is tuned: AM the whistle's pitch, SSB the shift; 0 = in tune"),
        Param(b"BAND", 64, active=True, formatter=_PLAIN,
              doc="the receiver's bandwidth, 300 Hz to 4 kHz"),
        Param(b"FADE", 48, active=True, formatter=_PLAIN,
              doc="how deep the station fades; the static rises as it fades"),
        Param(b"RATE", 40, active=True, formatter=_PLAIN,
              doc="how often the fading moves: every 2 s at 0 to 44 ms at 127"),
        Param(b"NOIS", 32, active=True, formatter=_PLAIN,
              doc="the static's level"),
        Param(b"MIX", 0, active=True, formatter=_PLAIN,
              doc="the receiver over the dry; 0 = the dry, untouched"),
        # MODE on slot 6, the knob field of r6+$c (the proven place for a select); DRIV beside it on slot 7, the
        # same word's companion field (bits 15-8), as Modulation's TONE.
        Param(b"MODE", 0, 3, active=True, formatter=_STEP, labels=("AM", "USB", "LSB"),
              doc="AM: TUNE is a beat whistle; USB/LSB: TUNE shifts the voice up/down"),
        Param(b"DRIV", 24, active=True, formatter=_PLAIN,
              doc="drive into the receiver's soft clip, +0 to +12 dB"),
        Param(b"CRAK", 16, active=True, formatter=_PLAIN,
              doc="how often the crackle bursts"),
        Param(),
        Param(b"DRFT", 0, active=True, formatter=_PLAIN,
              doc="the whistle's pitch wandering, up to 6 %"),
        Param(),
    ),
    dsp=DspSection(
        asm="modules/shortwave/shortwave.asm",
        priority=24,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        # W at +0, F at +129, K at +258, S at +387, the allpass coefficients at +516, read through the build's
        # base literal.
        ptable=W_TABLE + F_TABLE + K_TABLE + S_TABLE + H_TABLE,
    ),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/shortwave/verify.py", remix_arg=False),),
    # Dearest: every stage at full work (the loop has no branches and runs the SSB detector in every MODE; these
    # maximise the live arithmetic, LSB the per-call setup).
    dear={"TUNE": 127, "BAND": 127, "FADE": 127, "RATE": 127, "NOIS": 127, "MIX": 127,
          "MODE": 2, "DRIV": 127, "CRAK": 127, "DRFT": 127},
)
