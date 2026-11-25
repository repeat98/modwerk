"""Midiverb: the Alesis Midiverb, Midiverb II and Midifex programs, run on the DSP at the originals' 16-bit arithmetic.

The ColdFire half (stream.s from stream.c) keeps every program and streams the one PROG and BANK pick to the DSP
through FX2's page 2, from its own detour once the frame records are final; the DSP part (engine.asm) keeps only the
engine and the one program. generate.mjs proves the programs against the original machine; verify.py the engine
against them. Owner waiver for the Alesis programs, 25 Nov 2026 (PR #2179).
"""
import re
import pathlib

from remix.schema import (BusRole, Category, Claims, Detour, DspSection, Formatter, Gate, Harness, Kind, Linked,
                          MenuEntry, Module, Param, Proof, YBase)
from remix.stock_guard import stock_guard

_COUNTS = [int(n) for n in re.search(r"mv_bank_count\[3\] = \{([^}]*)\}",
                                      (pathlib.Path(__file__).resolve().parent / "stream.h").read_text()).group(1).split(",")]
_PROGS = max(_COUNTS)

MODULE = Module(
    name="midiverb", key="MIDIVERB", kind=Kind.HYBRID,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="verify.py: bit-exact against the program table in dsp_host; not on a unit yet",
    doc="The Alesis Midiverb's programs at their original 16-bit arithmetic, half rate, own FX2 ring.",
    menu=MenuEntry(fx2_id=0x0a, donor_desc=0x400d58b8,   # DARK REV; the base picks the id at install (ids past 31 cannot pin)
                   abbr=b"MVRB", fullname=b"Midivrb I/II", build_tag=False),
    params=(
        # PROG on the dial: stock's stepped tick widget holds five positions, and forcing it to 24 crashed the
        # owner's unit on 25 Nov 2026 (it read the labels as an address, vector 11 at PC 0x524b00a2).
        Param(b"PROG", 0, _PROGS, True, Formatter.WIDE_STEPPED, labels=tuple(str(i + 1) for i in range(_PROGS)),
              doc="the bank's program; its name shows in a message box when it turns"),
        Param(b"LEVL", 64, 128, True, Formatter.PLAIN,
              doc="input level into the 12-bit converter: unity at 32, 64 is +6 dB"),
        Param(),
        Param(b"BANK", 0, 3, True, Formatter.STEPPED, labels=("MV1", "MV2", "FEX"),
              doc="Midiverb, Midiverb II or Midifex programs"),
        Param(),
        Param(b"MIX", 40, 128, True, Formatter.PLAIN, doc="dry/wet; 0 is exact dry, 127 wet only"),
        *(Param() for _ in range(6)),
    ),
    dsp=DspSection(asm="modules/midiverb/engine.asm", priority=15, bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    claims=Claims(stock_instance_buffer=True, buffer_words=15870),
    # The ColdFire half: the programs, their stream and their names (stream.s, runtime.json).
    linked=(Linked("midiverb", "modules/midiverb/stream.s", cpu="5475", dram=True),),
    # Only Midiverb needs this site, so it patches it (owner, 25 Nov 2026: release on base 0.8.1); Euclid's detour
    # six bytes before returns here, so the two meet without sharing a byte.
    detours=(
        Detour(0x4000d568, stock_guard(0x4000d568, 6, "6278a7a1be8884ed718ec324994f5cea79cea596a8382baa7c5df056a5864711"),
               "midiverb", "mv_frame_hook", "Stream the picked program once the frame records are final"),
    ),
    harness=Harness(layout_char=None, is_server=False),
    gates=(Gate("modules/midiverb/verify.py", remix_arg=False),),
    dear={"LEVL": 127, "MIX": 127},
)
