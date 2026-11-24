"""RESONATOR -- eight tuned partials for one to four voices: chords, bodies, the Colundi sequence.

A buffer-free stereo insert for FX1 or FX2 of any track (no allocator, no
bus role, no absolute Y). The track's audio excites eight coupled-form
resonators shared by VOIC voices: TYPE gives each voice a body, CHRD its
note, COLUN snaps the notes to Aleksi Perälä's 128 Colundi frequencies,
SCALE into a key, TONE filters what excites them. P-lock PTCH or CHRD to
play the resonator from the sequencer. verify.py is its render gate.
"""
from pathlib import Path
from runpy import run_path

from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
                          MenuEntry, ModeView, Module, Param, YBase)

_T = run_path(str(Path(__file__).with_name("tables.py")))
P, W, S, B = Formatter.PLAIN, Formatter.WIDE_STEPPED, Formatter.STEPPED, Formatter.BIPOLAR

MODULE = Module(
    name="resonator",
    key="RESONATOR",
    kind=Kind.DSP_EFFECT,
    doc="Eight tuned partials for one to four voices: chords, bodies or Colundi frequencies.",
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.UNTESTED, proof_note="verify.py renders in dsp_host; a 15-minute RAM trial of 0.1.0 on the owner's unit",

    menu=MenuEntry(
        fx2_id=0x07,                  # a free non-stock id (MODULES.md)
        donor_desc=0x400d58b8,        # DARK REV; every drawn slot is written below
        abbr=b"RESO",
        fullname=b"Resonator",
        build_tag=False,
    ),

    params=(
        Param(b"PTCH", 57, 128, active=True, formatter=P,
              doc="Root: MIDI note (69 = A 440 Hz), or Colundi degree 0-127 with COLUN on (78 = 440 Hz)"),
        Param(b"CHRD", 4, len(_T["CHORD_NAMES"]), active=True, formatter=W, labels=_T["CHORD_NAMES"],
              doc="The voices' chord: OCT, 5TH, SUS2, SUS4, MAJ, MIN, MAJ7, MIN7, DOM7, DIM, AUG, ADD9, 5THS, 4THS"),
        Param(b"DCAY", 64, 128, active=True, formatter=P,
              doc="Ring time (T60), 25 ms at 0 to 10 s at 127; 64 is about half a second"),
        Param(b"TONE", 64, 128, active=True, formatter=B,
              doc="Exciter: left low-pass (only low partials ring), centre flat, right high-pass"),
        Param(b"GAIN", 32, 128, active=True, formatter=P,
              doc="Ring level: 32 is 0 dB (the ring about 4 dB under the dry on noise), 127 is +12 dB; loud rings soft-clip"),
        Param(b"MIX", 64, 128, active=True, formatter=P,
              doc="Dry/wet at constant power; 0 is exact passthrough, dry -26 dB at 100, 127 only the ring"),
        # The mode select names itself (mode_names.with_selfname): the switch reads NOTE or COLUN, which says what
        # PTCH is. OFF / ON read as a nameless switch on the unit (24 Nov 2026).
        Param(b"COLUN", 0, 2, active=True, formatter=S, labels=("NOTE", "COLUN"),
              doc="NOTE: PTCH is a MIDI note. COLUN: PTCH is a Colundi degree and each voice snaps to the nearest Colundi frequency"),
        Param(b"TYPE", 1, len(_T["TYPE_NAMES"]), active=True, formatter=W, labels=_T["TYPE_NAMES"],
              doc="Each voice's body: PURE, STRNG, TUBE, BAR, PLATE, DRUM or BELL partials"),
        Param(b"VOIC", 2, 4, active=True, formatter=S, labels=("1", "2", "3", "4"),
              doc="Voices sharing the 8 partials: 1 voice has all 8, 4 voices 2 each"),
        Param(b"SCALE", 0, len(_T["SCALE_LABELS"]), active=True, formatter=W, labels=_T["SCALE_LABELS"],
              doc="OFF, or a key and scale (CMAJ ... BPMI) the voices' notes snap to; COLUN off only"),
        Param(), Param(),
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
        ptable=_T["TABLE"],
    ),

    harness=Harness(layout_char=None, is_server=False),

    gates=(Gate("modules/resonator/verify.py", remix_arg=False),),
    # The sample loop's work is fixed; the dearest block retunes a voice of a
    # four-voice chord snapped to Colundi (the binary search), with a trig split.
    dear={"PTCH": 60, "CHRD": 6, "DCAY": 127, "TONE": 127, "GAIN": 127, "MIX": 127, "COLUN": 1, "TYPE": 6,
          "VOIC": 3, "SCALE": 0},
)
