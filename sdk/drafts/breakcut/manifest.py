"""BREAKCUT: Livecut's break cutting on a sliced Flex track, as a track machine.

A C runtime module (engine.c, machine.c) that contributes one record to the base's ot_machines table
(sdk/machines/octatrack/HOOKS.md): SRC SETUP lists it, and a Flex track running it gets ALGO, SLCS, ACTV, ROLL, RAMP
and REV on the SRC page. It writes Livecut's cuts (CutProc11, WarpCut, SQPusher; Remy Muller, GPL-2.0-or-later, after
Nick Collins' BBCut) as the track's trigs with PTCH, STRT, RATE, RTRG and RTIM locks and micro-timing; the stock
sequencer plays them, so it keeps no clock, patches no stock site and holds no stock address beyond the Part and
pattern records stock's own editors use. It has no card form: its USB package is built from its row in
src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="breakcut", key="BREAKCUT", kind=Kind.CF_PATCH,
    doc="Livecut's break cutting on a sliced Flex track: CutProc11, WarpCut and SQPusher, rolls, pitch ramps, reverses.",
    category=Category.MACHINES, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/breakcut/verify.py", remix_arg=False),),
)
