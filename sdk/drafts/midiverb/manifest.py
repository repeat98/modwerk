"""Midiverb: the Alesis Midiverb's own programs, run on the DSP from a table generate.mjs makes.

The original machine's arithmetic is kept bit-exact (generate.mjs proves the table against it; verify.py
proves this engine against the table). This first build carries 24 Midiverb I programs in its own P table;
loading every Midiverb, Midiverb II and Midifex program on demand needs a base feature not yet built.
Owner waiver for the Alesis programs, 25 Nov 2026 (PR #2179).
"""
import json
import pathlib

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Gate, Harness, Kind, MenuEntry,
                          Module, Param, Proof, YBase)

_TABLE = json.loads((pathlib.Path(__file__).resolve().parent / "programs.json").read_text())["programs"]
_INDEX = []
_BODY = []
for _p in _TABLE:
    _INDEX.append(len(_TABLE) + len(_BODY))
    _BODY += _p["words"]
_DEAREST = max(range(len(_TABLE)), key=lambda i: len(_TABLE[i]["words"]))

MODULE = Module(
    name="midiverb", key="MIDIVERB", kind=Kind.DSP_EFFECT,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="verify.py: bit-exact against the program table in dsp_host; not on a unit yet",
    doc="The Alesis Midiverb's programs at their original 16-bit arithmetic, half rate, own FX2 ring.",
    menu=MenuEntry(fx2_id=0x0e, donor_desc=0x400d58b8,   # DARK REV
                   abbr=b"MVRB", fullname=b"Midiverb", build_tag=False),
    params=(
        Param(b"PROG", 0, len(_TABLE), True, Formatter.WIDE_STEPPED, labels=tuple(p["label"] for p in _TABLE),
              doc="Midiverb program: decay in seconds, size, tone; gated and reverse"),
        Param(b"LEVL", 64, 128, True, Formatter.PLAIN,
              doc="input level into the 12-bit converter: unity at 32, 64 is +6 dB"),
        Param(), Param(), Param(),
        Param(b"MIX", 40, 128, True, Formatter.PLAIN, doc="dry/wet; 0 is exact dry, 127 wet only"),
        *(Param() for _ in range(6)),
    ),
    dsp=DspSection(asm="modules/midiverb/engine.asm", priority=15, bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None, ptable=tuple(_INDEX + _BODY)),
    claims=Claims(stock_instance_buffer=True, buffer_words=15870),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/midiverb/verify.py", remix_arg=False),),
    dear={"PROG": _DEAREST, "LEVL": 127, "MIX": 127},
)
