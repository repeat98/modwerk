"""RESONATOR -- four tuned modes that ring at a note or a Colundi frequency.

A buffer-free stereo insert for FX1 or FX2 of any track (no allocator, no
bus role, no absolute Y). The track's audio excites four coupled-form
resonators; TUNE picks whether PTCH counts semitones (NOTE) or steps
through Aleksi Perälä's 128 Colundi frequencies (COLUNDI). P-lock PTCH to
play the resonator from the sequencer. verify.py is its render gate.
"""
from pathlib import Path
from runpy import run_path

from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
                          MenuEntry, ModeView, Module, Param, YBase)

TABLE = run_path(str(Path(__file__).with_name("tables.py")))["TABLE"]
P, W, S = Formatter.PLAIN, Formatter.WIDE_STEPPED, Formatter.STEPPED

MODULE = Module(
    name="resonator",
    key="RESONATOR",
    kind=Kind.DSP_EFFECT,
    doc="Four tuned resonant modes at a note or a Colundi frequency, excited by the track.",
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.UNTESTED, proof_note="verify.py renders in dsp_host; not on hardware",

    menu=MenuEntry(
        fx2_id=0x07,                  # a free non-stock id (MODULES.md)
        donor_desc=0x400d58b8,        # DARK REV; all twelve slots are written below
        abbr=b"RESO",
        fullname=b"Resonator",
        build_tag=False,
    ),

    params=(
        Param(b"PTCH", 57, 128, active=True, formatter=P,
              doc="Root pitch: MIDI note (69 = A 440 Hz) or Colundi degree 0-127 (78 = 440 Hz)"),
        Param(b"INTV", 7, 25, active=True, formatter=W, labels=("UNI",) + tuple(str(i) for i in range(1, 25)),
              doc="Steps between the four modes: semitones or Colundi degrees; UNI is one mode"),
        Param(b"DCAY", 64, 128, active=True, formatter=P,
              doc="Ring time (T60), 25 ms at 0 to 10 s at 127; 64 is about half a second"),
        Param(b"DAMP", 32, 128, active=True, formatter=P,
              doc="Shortens the upper modes' ring: 0 rings all four equally"),
        Param(b"GAIN", 32, 128, active=True, formatter=P,
              doc="Ring level: 32 is 0 dB, 127 is +24 dB; loud rings soft-clip"),
        Param(b"MIX", 64, 128, active=True, formatter=P,
              doc="Dry/wet; 0 is exact passthrough, dry -26 dB at 100, 127 only the ring"),
        Param(b"TUNE", 0, 2, active=True, formatter=S, labels=("NOTE", "COLUN"),
              doc="NOTE: PTCH and INTV in semitones; COLUN: in Colundi degrees"),
        Param(), Param(), Param(), Param(), Param(),
    ),
    mode_slot=6,
    mode_views=(
        ModeView(0, names={0: b"PTCH"}),
        ModeView(1, names={0: b"DEG"}),
    ),

    dsp=DspSection(
        asm="modules/resonator/resonator.asm",
        # BYTE-LOAD-BEARING: the donor region is packed in this order.
        priority=34,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,
        r7_latch_slot=None,
        gate_label=None,
        ptable=TABLE,
    ),

    harness=Harness(layout_char=None, is_server=False),

    gates=(Gate("modules/resonator/verify.py", remix_arg=False),),
    # No knob changes the per-sample work: every mode runs at every setting.
    dear={"PTCH": 127, "INTV": 24, "DCAY": 127, "DAMP": 0, "GAIN": 127, "MIX": 127, "TUNE": 1},
)
