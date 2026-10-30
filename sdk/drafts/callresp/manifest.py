"""CALL & RESPONSE: Nordl3's call and response phrase generator on the audio tracks, as a track machine.

A C runtime module (engine.c, machine.c) that contributes one record to the base's ot_machines table
(sdk/machines/octatrack/HOOKS.md): SRC SETUP lists it, and an audio track running it gets the call's controls (MOTF,
DENS, REPT, SCAL, PHRS, ROLE) on the SRC page and the response's (ANSW, TGHT, END, MUT, TRNS) and VAR on SRC SETUP. A
track writes calls and responses (ROLE C+R), or a call track the calls and an answer track the responses to them
(Call / Response Generator, Nordl3, MIT), as the track's trigs with PTCH and VOL locks; the stock sequencer plays
them, so it keeps no clock, patches no stock site and holds no stock address beyond the Part and pattern records
stock's own editors use. It has no card form: its USB package is built from its row in
src/engine/assets/octatrack-module-packages.json, and verify.py checks it.
"""
from remix.schema import Category, Proof, Gate, Kind, Module

MODULE = Module(
    name="callresp", key="CALLRESP", kind=Kind.CF_PATCH,
    doc="Nordl3's call and response phrase generator on the audio tracks, on one track or two, as PTCH-locked trigs.",
    category=Category.MACHINES, author="semierendonmez-commits", author_url="https://github.com/semierendonmez-commits",
    proof=Proof.UNTESTED,
    proof_note="USB package only; host and package checks in verify.py, hardware results in TESTING.md.",
    gates=(Gate("modules/callresp/verify.py", remix_arg=False),),
)
