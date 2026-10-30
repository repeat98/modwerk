"""TB-3PO: a generative 303-style acid-line generator, a track machine for the sample tracks and a MIDI generator.

A C runtime module (engine.c, machine.c, generator.c) that contributes one record to the base's ot_machines table
(SRC SETUP lists it; a sample track running it gets its controls on the SRC page and SRC SETUP, like VECTOR) and one
to ot_midi_generators (MIDI NOTE SETUP lists it; a MIDI track running it gets its controls on the SRC and AMP pages)
(sdk/machines/octatrack/HOOKS.md). It writes the track's trigs and locks (PTCH, HOLD, VOL and FILTER DEPTH on a
sample track; NOTE, VEL and LEN on a MIDI track); the stock sequencer plays them, so it keeps no clock, patches no
stock site and holds no stock address beyond the Part and pattern records stock's own editors use. It has no card form: its USB package is built from its row in
src/engine/assets/octatrack-module-packages.json, and verify.py checks it. The line is the Phazerville Hemisphere
Suite TB_3PO applet's (djphazer and contributors, GPL-3.0) as Charles Vestal's Schwung port tb3po.c runs it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="tb3po", key="TB3PO", kind=Kind.CF_PATCH,
    doc="Generative 303-style acid lines on sample and MIDI tracks: density, accent, slide, scale, seed and mutation.",
    category=Category.MACHINES, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/tb3po/verify.py", remix_arg=False),),
)
