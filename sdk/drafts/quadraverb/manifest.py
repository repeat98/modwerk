"""Quadraverb: the Alesis Quadraverb's reverb programs, compiled to straight-line DSP code at a pick.

The release (0.1.0-experimental, not built yet): PROG (A) picks one of the 22 reverbs in REVERBS, MIX (F) sets dry and
wet. Its package requires the base's program areas and stream channel (BASE_FEATURES, loader ABI 9): the base writes
the picked program's code into one of the slot's two areas and moves the long delay lines to and from the ColdFire
every frame (ENGINE.md, "On the base"). The code, its tables and its stream plan are compiled from the owner's own ROM
image into gen/, which .gitignore ignores: no Alesis program enters the repository.

A development build (TESTING.md) is one program: engine/qvunit.py gen writes its engine.asm and gen/program.json, and
the manifest then names that build (QV DEV <program>, MIX on F; PROG does nothing). Without gen/ the manifest still
loads. engine/verify_unit.py holds that file to the integer model in dsp_host.
"""
import json
import pathlib

from remix.schema import (BusRole, Category, Claims, DspSection, Formatter, Harness, Kind, Linked, MenuEntry, Module,
                          Param, Proof, YBase)

# The release's programs, by their number on the original (user memory 0-89): the configuration-4 reverbs that are not
# gated (FIRMWARE.md, "The firmware"; the gate needs a detector the original has in hardware).
REVERBS = (1, 2, *range(10, 23), 52, 53, 66, 78, 79, 80, 81)
# Base features the release package requires (sdk/runtime/loader/abi9.py base_features): the program areas and the
# stream channel, both on the base 0.8.3 draft (#2246) only.
BASE_FEATURES = ("programs",)

_GEN = pathlib.Path(__file__).resolve().parent / "gen" / "program.json"
_P = json.loads(_GEN.read_text())["program"] if _GEN.exists() else None
_TAG = b"" if _P is None else str(_P).encode()

# The release: the shell (shell.asm, engine/qvarea.py) is the package's DSP code; the ColdFire half (runtime/qv_runtime.c
# with the programs' areas and stream plans, compiled by engine/qvcf.py into gen/) answers the base's ot_dsp_effects
# record (runtime.json). A development build: the one program's engine in gen/, no ColdFire half.
_RELEASE = _P is None
MODULE = Module(
    name="quadraverb", key="QUADRAVERB", kind=Kind.HYBRID if _RELEASE else Kind.DSP_EFFECT,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="engine/verify.py, verify_stream.py: bit-exact against the integer model in dsp_host; not on a unit yet",
    doc="The Alesis Quadraverb's reverb programs compiled to straight-line DSP code, own FX2 ring and a ColdFire stream.",
    # 0x0a as Midiverb: the USB base picks the effect id at install. No id is free for a pinned card build.
    menu=MenuEntry(fx2_id=0x0a, donor_desc=0x400d58b8,   # DARK REV
                   abbr=b"QVRB" if _P is None else b"QV" + _TAG[:2],
                   fullname=b"QUADRAVERB" if _P is None else b"QV DEV " + _TAG, build_tag=False),
    params=(
        # PROG on the dial, as Midiverb's: stock's stepped tick widget holds five positions (it crashed the owner's unit
        # with 24 on 25 Nov 2026).
        Param(b"PROG", 2, len(REVERBS), True, Formatter.WIDE_STEPPED, labels=tuple("%02d" % n for n in REVERBS),
              doc="the factory program, by its number on the original Quadraverb"),
        *(Param() for _ in range(4)),
        Param(b"MIX", 40, 128, True, Formatter.PLAIN, doc="dry/wet: 0 the dry alone, 127 the wet alone"),
        *(Param() for _ in range(6)),
    ),
    dsp=DspSection(asm="modules/quadraverb/shell.asm" if _RELEASE else "modules/quadraverb/gen/engine.asm", priority=15,
                   bus_role=BusRole.NONE, ybase=YBase.NEVER, r7_latch_slot=None, gate_label=None),
    linked=(Linked("quadraverb", "modules/quadraverb/gen/qv_runtime.s", cpu="5475", dram=True),) if _RELEASE else (),
    claims=Claims(stock_instance_buffer=True, buffer_words=15870),
    harness=Harness(layout_char=None, is_server=False),
    gates=(),
    dear={"MIX": 127},
)
