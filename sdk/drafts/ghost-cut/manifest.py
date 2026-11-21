"""GHOST CUT -- a microlooper on FX2: GRAB freezes a tempo-synced piece of the track and loops it.

Milestones A and B, the TAPE and GRAIN engines: a mono ring of 15,870 words in the FX2 slot
records the track's mono sum. GRAB (a knob, a scene or the crossfader) loops
the last LEN of it (CAPT AUTO), the next LEN (MAN) or what the ring held when
CAPT went OFF, at RATE (1/4 x to 4 x, pitch and speed together), forward,
reversed or as a pendulum. ENG GRAIN keeps that speed for the playhead
and reads two grains from it at PTCH (+-24 semitones), so pitch and time
part; GRN sets the grain length. LEN follows the tempo: 1/64 to 1/4 of a whole note,
halved until it fits the ring (353 ms at most). GRAB first bakes a 256-sample
crossfade over the seam into the ring (eight blocks), then loops; GRAB has hysteresis (on at 96, off at 32) and fades 256 samples in
and out. MIX 0, and every moment no loop plays, is the dry track bit for bit.
An FX1-sized slot passes dry.

ghost_cut_ref.py is the integer reference and the source of the P table;
DRFT puts a second head up to half the loop after the first, swinging as a
triangle over MOTN bars: TAPE plays it right (the first left), GRAIN reads its
second grain there. verify.py renders the DSP against the reference. FDBK is
not built (writing back into the loop would undo the baked seam); its slot
is blank. Not tested on hardware.
"""

import importlib.util
import pathlib

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness,
                          Kind, MenuEntry, Module, Param, Proof, YBase)

_spec = importlib.util.spec_from_file_location("ghost_cut_ref",
                                               pathlib.Path(__file__).with_name("ghost_cut_ref.py"))
_ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ref)

_PLAIN = Formatter.PLAIN
_STEP = Formatter.STEPPED
_BLANK = Param(b"", 0)

MODULE = Module(
    name="ghost-cut",
    key="GHOST CUT",
    kind=Kind.DSP_EFFECT,
    category=Category.TRACK, author="jacobphono", author_url="https://github.com/jacobphono",
    proof=Proof.UNTESTED,
    proof_note="Milestones A to C (TAPE, GRAIN, the drift head): rendered in dsp_host against ghost_cut_ref.py on OS 1.40C; "
               "not run on a unit or in ot_emu.",
    doc="Microlooper: GRAB loops a tempo-synced piece of the track at RATE, fwd, rev or pendulum.",
    menu=MenuEntry(
        fx2_id=0x0a,
        donor_desc=0x400d58b8,     # DARK REV: 12 active slots
        abbr=b"GCUT",
        fullname=b"GHOST CUT",
        build_tag=False,
    ),
    params=(
        # ---- page 1 ---------------------------------------------------------
        Param(b"LEN", 3, 8, active=True, formatter=Formatter.WIDE_STEPPED, labels=_ref.LEN_LABELS,
              doc="loop length at the next GRAB, synced to the tempo; halved until it fits 353 ms"),
        Param(b"GRAB", 0, active=True, formatter=_PLAIN,
              doc="96 or more grabs a loop, 32 or less lets it go; set it per scene for the crossfader"),
        Param(b"RATE", 64, active=True, formatter=Formatter.BIPOLAR,
              doc="loop speed: 0 is 1x, -64 a quarter, +63 almost 4x; on TAPE the pitch follows it"),
        Param(b"PTCH", 64, active=True, formatter=Formatter.BIPOLAR,
              doc="GRAIN's pitch in semitones, -24 to +24 (past them it holds), apart from RATE"),
        Param(b"DRFT", 0, active=True, formatter=_PLAIN,
              doc="a second head up to half the loop away, swinging over MOTN; 0 is one head"),
        Param(b"MIX", 127, active=True, formatter=_PLAIN,
              doc="the loop over the dry track; 0 is exact dry, 127 the loop alone"),
        # ---- page 2 ---------------------------------------------------------
        Param(b"ENG", 0, 2, active=True, formatter=_STEP, labels=_ref.ENG_LABELS,
              doc="TAPE: pitch follows RATE; GRAIN: two grains part pitch (PTCH) from speed (RATE)"),
        Param(b"CAPT", 0, 3, active=True, formatter=_STEP, labels=_ref.CAPT_LABELS,
              doc="AUTO loops the last LEN, MAN records the next LEN first, OFF keeps the ring as it is"),
        Param(b"GRN", 40, active=True, formatter=_PLAIN,
              doc="GRAIN's grain length, 10 to 79 ms (at most a quarter of the loop)"),
        Param(b"MOTN", 4, 8, active=True, formatter=Formatter.WIDE_STEPPED, labels=_ref.MOTN_LABELS,
              doc="how slowly DRFT swings: one triangle over 1/4 to 32 bars at the tempo"),
        Param(b"DIR", 0, 3, active=True, formatter=_STEP, labels=_ref.DIR_LABELS,
              doc="FWD, REV, or PEND (forwards then backwards, no seam)"),
        _BLANK,
    ),
    mode_slot=6,
    dsp=DspSection(
        asm="modules/ghost-cut/ghost_cut.asm",
        ptable=_ref.TABLE,         # RATE's 33 points (Q20), LEN's 8 dividends (high, low), PTCH's 50 points
        priority=33,
        bus_role=BusRole.NONE,     # an insert
        ybase=YBase.NEVER,
        r7_latch_slot=None,
        gate_label=None,
    ),
    # 15,870 words from the FX2 slot's base, ending at +$3DFD: Sidechain
    # Compressor's key window (+$3DFE..+$3FFF) stays out of the ring.
    claims=Claims(stock_instance_buffer=True, buffer_words=_ref.R),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/ghost-cut/verify.py", remix_arg=False),),
    # looping on GRAIN (two grains, each with its seam read), forwards, fastest
    dear={"LEN": 7, "GRAB": 127, "RATE": 127, "PTCH": 127, "DRFT": 127, "MIX": 127, "ENG": 1, "CAPT": 0,
          "GRN": 127, "MOTN": 0, "DIR": 0},
)
