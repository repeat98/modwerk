"""MACKITY -- Chris Johnson's Airwindows Mackity (MIT): the input stage of a
Mackie-style mixing desk, driven by IN TRIM.

A buffer-free stereo insert for FX1 or FX2 of any track (no allocator, no
bus role, no absolute Y). Upstream's whole algorithm at 44.1 kHz: two
one-pole high-passes, two 19.16 kHz biquads, the clip and v - 0.1768 v^5.
verify.py holds the assembly to reference.py's model bit for bit, and
test_reference.py holds the model to upstream. Hardware operation is untested.
"""
from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
                          MenuEntry, Module, Param, YBase)

BLANK = Param(b"", 0, 128, active=False, formatter=Formatter.PLAIN)

MODULE = Module(
    name="mackity",
    key="MACKITY",
    kind=Kind.DSP_EFFECT,
    doc="Chris Johnson / Airwindows Mackity: a Mackie-style desk input stage, IN TRIM into the console's clip.",
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="verify.py renders it in dsp_host bit for bit against the model; hardware untested",

    menu=MenuEntry(
        fx2_id=0x1a,                  # a free non-stock id (MODULES.md); the base assigns the live one
        donor_desc=0x400d58b8,        # DARK REV; every drawn slot is written below
        abbr=b"MACK",
        fullname=b"Mackity",
        build_tag=False,
    ),

    params=(
        Param(b"TRIM", 13, 128, active=True, formatter=Formatter.PLAIN,
              doc="In Trim: gain (TRIM/13)^2 into the desk; 13 is 0 dB, 127 is +39.6 dB, 0 is silence"),
        Param(b"PAD", 127, 128, active=True, formatter=Formatter.PLAIN,
              doc="Out Pad: output level PAD/128, 127 is exactly 0 dB"),
        BLANK, BLANK, BLANK, BLANK,
        BLANK, BLANK, BLANK, BLANK, BLANK, BLANK,
    ),

    dsp=DspSection(
        asm="modules/mackity/mackity.asm",
        # BYTE-LOAD-BEARING: the donor region is packed in this order.
        priority=35,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        r7_latch_slot=None,
        gate_label=None,
    ),

    harness=Harness(layout_char=None, is_server=False),

    gates=(Gate("modules/mackity/verify.py", remix_arg=False),),
    # The work is the same at every setting; TRIM at the top keeps the clip busy.
    dear={"TRIM": 127, "PAD": 127},
)
