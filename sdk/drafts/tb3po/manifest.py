"""TB-3PO: a generative 303-style acid-line generator on the MIDI tracks.

A C runtime module (engine.c, generator.c) that contributes one record to the base's ot_midi_generators table
(sdk/machines/octatrack/HOOKS.md): MIDI NOTE SETUP lists it, and a MIDI track running it gets its controls on the
SRC and AMP pages. It writes the track's note trigs and NOTE, VEL and LEN locks; the stock MIDI sequencer plays them,
so it keeps no clock, patches no stock site and holds no stock address beyond the Part and pattern records every
MIDI setup writer uses. It has no card form: its USB package is built from its row in
src/engine/assets/octatrack-module-packages.json, and verify.py checks it. The line is the Phazerville Hemisphere
Suite TB_3PO applet's (djphazer and contributors, GPL-3.0) as Charles Vestal's Schwung port tb3po.c runs it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="tb3po", key="TB3PO", kind=Kind.CF_PATCH,
    doc="Generative 303-style acid lines on the MIDI tracks: density, accent, slide, scale, octaves, seed and mutation.",
    category=Category.MIDI_USB, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/tb3po/verify.py", remix_arg=False),),
)
