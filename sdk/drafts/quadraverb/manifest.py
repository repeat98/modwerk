"""Quadraverb DEV: a development build of the compiled Quadraverb engine, one factory program built in.

For measuring the engine's cost on a unit (npm run device:price) and listening to it, before any base work
(TESTING.md). Not a release: one program, MIX on knob F and nothing else, never published.

engine/qvunit.py gen writes the program's engine.asm into gen/ (ignored by .gitignore: it carries an Alesis program),
and gen/program.json, which names the build here. Without gen/ the manifest still loads and names no program.
engine/verify_unit.py holds that file to the integer model in dsp_host.
"""
import json
import pathlib

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness, Kind, MenuEntry, Module,
                          Param, Proof, YBase)

_GEN = pathlib.Path(__file__).resolve().parent / "gen" / "program.json"
_P = json.loads(_GEN.read_text())["program"] if _GEN.exists() else None
_TAG = b"" if _P is None else str(_P).encode()

MODULE = Module(
    name="quadraverb", key="QUADRAVERB", kind=Kind.DSP_EFFECT,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="engine/verify_unit.py: bit-exact against the integer model in dsp_host; not on a unit yet",
    doc="Development build: one Quadraverb program compiled to straight-line DSP code, own FX2 ring.",
    # 0x0a as Midiverb: the USB base picks the effect id at install. No id is free for a pinned card build.
    menu=MenuEntry(fx2_id=0x0a, donor_desc=0x400d58b8,   # DARK REV
                   abbr=b"QV" + _TAG[:2], fullname=b"QV DEV " + _TAG, build_tag=False),
    params=(
        *(Param() for _ in range(5)),
        Param(b"MIX", 64, 128, True, Formatter.PLAIN, doc="dry/wet: 0 the dry alone, 127 the wet alone"),
        *(Param() for _ in range(6)),
    ),
    dsp=DspSection(asm="modules/quadraverb/gen/engine.asm", priority=15, bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    claims=Claims(stock_instance_buffer=True, buffer_words=15870),
    harness=Harness(layout_char=None, is_server=False),
    gates=(),
    dear={"MIX": 127},
)
