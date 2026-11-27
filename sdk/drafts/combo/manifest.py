"""COMBO -- an amp and speaker cabinet in one insert. Original Modwerk design.

An insert for FX1 or FX2 of any track (no bus role, no absolute Y; DIST's
1,024-word ring sits in the slot's own allocator buffer), mono like a guitar amp: (L + R)/2 through a 90 Hz
high-pass and a 7 kHz band-limit, then at 2x (halfband.py) GAIN into a soft
curve flat at full scale, a level that follows GAIN, a three-band tone stack
(BASS, MID, TREB, flat at 64), one of four speaker cabinets or OFF (CAB, from
the P table in tables.py), a DC blocker and LEV, to both sides. VOIC (SETUP page,
slot 6) picks one of five amp voices from the same table; TGHT, PRES, AXIS, DIST and MIX
(slots 7 to 11) move the low cut, the cabinet's presence, the mic's axis and distance, and the dry mix. verify.py holds the assembly
to reference.py's model bit for bit. Hardware operation is untested.

The FX2 id: the card's 32 ids are all taken (docs/OCTATRACK_MORE_EFFECT_IDS.md),
so this draft keeps 0x0a as the scaffold left it. Over USB the base assigns
the live id; a card build waits for the owner.
"""
from pathlib import Path
from runpy import run_path

from remix.schema import (Category, Claims, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
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
              doc="Lows below the voice's low split (250 to 400 Hz): cut to silence at -64, flat at 0, +6 dB at +63"),
        Param(b"MID", 64, 128, active=True, formatter=B,
              doc="Mids between the voice's two splits: the same range"),
        Param(b"TREB", 64, 128, active=True, formatter=B,
              doc="Highs above the voice's high split (1.6 to 3 kHz): the same range"),
        Param(b"CAB", 2, 5, active=True, formatter=S, labels=_T["CAB_NAMES"],
              doc="Speaker cabinet: OFF, one 10-inch, one 12-inch, two 12-inch or four 12-inch"),
        Param(b"LEV", 64, 128, active=True, formatter=P,
              doc="Output level (LEV/64)^2: silence at 0, 0 dB at 64, +12 dB at 127"),
        Param(b"VOIC", 1, 5, active=True, formatter=S, labels=_T["VOICE_NAMES"],
              doc="Amp voice: CLEAN, BOOST (chiming crunch), ROCK (tight high gain), SOLID (flat, hard clip) or BASS"),
        Param(b"TGHT", 64, 128, active=True, formatter=B,
              doc="Tightness: the low cut before the drive, looser below 0, the voice's own at 0, tighter above"),
        Param(b"PRES", 0, 128, active=True, formatter=P,
              doc="Presence: the cabinet's 4-5 kHz bump, up to about +6 dB; with CAB OFF a peak at 3.5 kHz"),
        Param(b"AXIS", 0, 128, active=True, formatter=P,
              doc="Mic axis: on the cone's axis at 0 (brightest), off axis and darker at 127; with CAB OFF a gentle roll-off from 4.5 kHz"),
        Param(b"DIST", 0, 128, active=True, formatter=P,
              doc="Mic distance: near at 0, far at 127, the room's early reflections in stereo"),
        Param(b"MIX", 127, 128, active=True, formatter=P,
              doc="Dry to amp: 0 the dry track in stereo, 127 all amp; between, parallel drive"),
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

    # DIST's ring: Y base + $400..$7ff of the slot's own allocator buffer, which fits an FX1 slot's 3,072.
    claims=Claims(stock_instance_buffer=True, buffer_words=2048),
    harness=Harness(layout_char=None, is_server=False),

    gates=(Gate("modules/combo/verify.py", remix_arg=False),),
    # The sample loop's work is the same at every setting; the top of every
    # knob keeps the limit and the curve busy.
    dear={"GAIN": 127, "BASS": 127, "MID": 127, "TREB": 127, "CAB": 4, "LEV": 127, "VOIC": 2,
          "TGHT": 127, "PRES": 127, "AXIS": 127, "DIST": 127, "MIX": 64},
)
