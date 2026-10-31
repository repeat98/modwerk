"""DATAMATIC: data read as rhythm, a MIDI generator for the MIDI tracks.

A C runtime module (engine.c, tables.c, generator.c) that contributes one record to the base's ot_midi_generators
table (sdk/machines/octatrack/HOOKS.md): MIDI NOTE SETUP lists it, and a MIDI track running it gets SRCE, OFFS, BITS,
DENS, OCT and ROOT on the SRC page, SPRD, INTV, VDAT, JITR, VEL and LEN on the AMP page, and RULE, SEED and STEP on
its second. A bit stream (pi, e, phi, the square root of two, the Fibonacci word, the primes, Thue-Morse, an
elementary cellular automaton or an LFSR) read through a sliding window becomes the track's note trigs with NOTE and
VEL locks and micro-timing; the stock MIDI sequencer plays them, so it keeps no clock, patches no stock site and holds
no stock address beyond the Part and pattern records stock's own editors use. It has no card form: its USB package
is built from its row in src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="datamatic", key="DATAMATIC", kind=Kind.CF_PATCH,
    doc="Data as rhythm on a MIDI track: bit streams of pi, primes, automata and more, read through a sliding window.",
    category=Category.MIDI_USB, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/datamatic/verify.py", remix_arg=False),),
)
