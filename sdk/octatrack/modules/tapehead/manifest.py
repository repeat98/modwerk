"""TAPEHEAD -- port of JClones_TapeHead.jsfx (MIT), a small analog tape
saturation: a 2-state coupled recursion driving two cubic smoothstep
waveshapers plus a fixed-gain term, summed and trimmed.

A buffer-free insert (no allocator, no bus role, no absolute Y), so it runs
on FX1 or FX2 of any track. State and scratch live in its own r7 block,
$00-$35. init zeroes the four persistent state words every time the effect
is (re)selected.

Brought over from octabam (modules/tapehead, 12 Sep 2026) for Octamod on
2 Oct 2026. The first render against the float JSFX found and fixed three
defects (see tapehead.asm's header): the min stages returned 2*min, the
|g3|*y3 term was limited on store, and COLOR's MEDIUM selected BRIGHT.
verify.py is the gate that measured them.

Octamod placement: fx2_id 0x1f (free: not a stock id, no Octamod module
claims it), priority 17 (after Euclid's 16), layout letter "4". `make
modules` remains the arbiter once this moves out of sdk/drafts.
"""

from remix.schema import (Category, Proof, BusRole, DspSection, Formatter, Gate, Harness, Kind,
                          MenuEntry, Module, Param, YBase)

MODULE = Module(
    name="tapehead",
    key="TAPEHEAD",
    kind=Kind.DSP_EFFECT,
    doc="Analog tape saturation: JClones TapeHead's recursion and cubic waveshapers.",
    category=Category.TRACK, author="devilfish707", author_url="https://github.com/devilfish707",
    proof=Proof.HARDWARE,
    proof_note="devilfish707's unit, image OCTABAM2 (tapehead-spring), 2 Oct 2026: "
               "listening test; verify.py and benchmark.py in the emulator",

    menu=MenuEntry(
        fx2_id=0x1f,
        donor_desc=0x400d5726,        # SPRING REV, as in octabam: all six page-1
                                      # slots are written below, so the donor's
                                      # own page-1 fields do not leak through
        abbr=b"TAPE",                 # 4 chars + NUL
        fullname=b"TAPEHEAD",         # 8 of 12
        build_tag=False,
    ),

    params=(
        # ---- page 1: DRIVE TRIM COLOR (the JSFX's sliders minus Clip) -------
        Param(b"DRIVE", 36, 128, active=True, formatter=Formatter.PLAIN,
              doc="tape drive, continuous: JSFX drive 1..10; 36 ~= the JSFX default 3.5"),
        Param(b"TRIM", 18, 128, active=True, formatter=Formatter.PLAIN,
              doc="output trim, 0 dB at 0 to -21 dB at 127; 18 = the JSFX default -3 dB"),
        # A select on page 1, drawn with the tick widget and its words, as
        # Mini Verb's RATE is. octabam drew it PLAIN, which Octamod's
        # verify_menu refuses for a count under 128.
        Param(b"COLOR", 0, 3, active=True, formatter=Formatter.STEPPED,
              labels=("NORM", "MED", "BRGT"),
              doc="filter corner of the recursion: 2100 / 3680 / 5000 Hz; JSFX default NORM"),
        Param(), Param(), Param(),
        # ---- page 2: none ----------------------------------------------------
        Param(), Param(), Param(), Param(), Param(), Param(),
    ),

    dsp=DspSection(
        asm="modules/tapehead/tapehead.asm",
        # BYTE-LOAD-BEARING: the donor region is packed in this order.
        # Character is 13, Modulation and Tape Echo 14, Mini Verb 15,
        # Euclid 16.
        priority=17,
        bus_role=BusRole.NONE,
        ybase=YBase.NEVER,            # no $30000 literal, no absolute Y
        r7_latch_slot=None,
        gate_label=None,
    ),

    harness=Harness(layout_char="4", is_server=False),

    gates=(Gate("modules/tapehead/verify.py", remix_arg=False),),
    # The cost does not depend on any knob: no stage is skipped at any
    # setting, and COLOR only swaps two constants. Maximum drive is the
    # hottest signal path.
    dear={"DRIVE": 127, "TRIM": 0, "COLOR": 2},
)
