"""COMBO -- an amp and speaker cabinet in one insert. Original Modwerk design.

A buffer-free stereo insert for FX1 or FX2 of any track (no allocator, no
bus role, no absolute Y). Per channel: a 90 Hz high-pass and a 7 kHz
band-limit into GAIN, a soft curve flat at full scale, a three-band tone
stack (BASS, MID, TREB, flat at 64), one of four speaker cabinets or OFF
(CAB, from the P table in tables.py) and LEV. verify.py holds the assembly
to reference.py's model bit for bit. Hardware operation is untested.

The FX2 id: the card's 32 ids are all taken (docs/OCTATRACK_MORE_EFFECT_IDS.md),
so this draft keeps 0x0a as the scaffold left it. Over USB the base assigns
the live id; a card build waits for the owner.
"""
from pathlib import Path
from runpy import run_path

from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
                          MenuEntry, Module, Param, YBase)

_T = run_path(str(Path(__file__).with_name("tables.py")))
P, S, B = Formatter.PLAIN, Formatter.STEPPED, Formatter.BIPOLAR
BLANK = Param(b"", 0, 128, active=False, formatter=P)

MODULE = Module(
    name="combo",
    key="COMBO",
    kind=Kind.DSP_EFFECT,
    doc="An amp and speaker cabinet: gain into a soft curve, a three-band tone stack and four cabinets.",
    category=Category.TRACK, author="sebasprosala-sys", author_url="https://github.com/sebasprosala-sys",
    proof=Proof.RENDER, proof_note="verify.py renders it in dsp_host bit for bit against the model; hardware untested",

    menu=MenuEntry(
        fx2_id=0x0a,                  # no card id is free; the base assigns the live one over USB
        donor_desc=0x400d58b8,        # DARK REV; every drawn slot is written below
        abbr=b"COMB",
        fullname=b"COMBO",
        build_tag=False,
    ),

    params=(
        Param(b"GAIN", 40, 128, active=True, formatter=P,
              doc="Drive into the amp: +0 dB at 0, +22 dB at 40, +38 dB at 127"),
        Param(b"BASS", 64, 128, active=True, formatter=B,
              doc="Lows below 300 Hz: cut to silence at -64, flat at 0, +6 dB at +63"),
        Param(b"MID", 64, 128, active=True, formatter=B,
              doc="Mids, 300 Hz to 2.2 kHz: cut to silence at -64, flat at 0, +6 dB at +63"),
        Param(b"TREB", 64, 128, active=True, formatter=B,
              doc="Highs above 2.2 kHz: cut to silence at -64, flat at 0, +6 dB at +63"),
        Param(b"CAB", 2, 5, active=True, formatter=S, labels=_T["CAB_NAMES"],
              doc="Speaker cabinet: OFF, one 10-inch, one 12-inch, two 12-inch or four 12-inch"),
        Param(b"LEV", 64, 128, active=True, formatter=P,
              doc="Output level (LEV/64)^2: silence at 0, 0 dB at 64, +12 dB at 127"),
        BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
    ),

    dsp=DspSection(
        asm="modules/combo/combo.asm",
        # BYTE-LOAD-BEARING: the donor region is packed in this order.
        priority=36,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        r7_latch_slot=None,
        gate_label=None,
        ptable=_T["TABLE"],
    ),

    harness=Harness(layout_char=None, is_server=False),

    gates=(Gate("modules/combo/verify.py", remix_arg=False),),
    # The sample loop's work is the same at every setting; the top of every
    # knob keeps the limit and the curve busy.
    dear={"GAIN": 127, "BASS": 127, "MID": 127, "TREB": 127, "CAB": 4, "LEV": 127},
)
