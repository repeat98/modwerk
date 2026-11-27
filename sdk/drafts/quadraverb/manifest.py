"""Quadraverb: the Alesis Quadraverb's factory programs, compiled to straight-line DSP code at a pick.

The release (0.1.0-experimental, not built yet): PROG (A) picks one of the 48 programs in PROGRAMS, MIX (F) sets dry and
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

# The release's programs, by their number on the original (user memory 0-89; owner, 27 Nov 2026): of the 76 that play
# bit for bit in the open form, the 58 whose area fits beside a Part's stock effects and streams static lines, less the
# ten not bit-exact in the release form yet (engine/verify_area.py). Left out: the gated ones and the sweeps a signal
# onset restarts (FIRMWARE.md, "The gate": the detector is hardware), 73 VERB SHIFTER (gated, no tick for its
# coefficient sweep), the pitch programs and the Leslies (areas of 1,296-1,875 words: two a slot leave a core little
# room for stock effects; with them the ColdFire side is about 409 KiB), the programs with nothing to stream (an area's
# fade words come from its stream so far) and NOT_EXACT.
GATED = (3, 23, 24, 25, 26, 27, 28, 29, 31, 32, 73, 86, 87, 88)
PITCH, LESLIE, NO_STREAM = (7, 37, 51, 59, 60, 70), (8, 38, 39, 67, 82), (5, 30, 40, 41, 56, 76, 77)
NOT_EXACT = (6, 9, 42, 43, 45, 55, 57, 68, 69, 72)
LEFT_OUT = GATED + PITCH + LESLIE + NO_STREAM + NOT_EXACT
PROGRAMS = tuple(p for p in range(90) if p not in LEFT_OUT)
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
    doc="The Alesis Quadraverb's factory programs compiled to straight-line DSP code, own FX2 ring and a ColdFire stream.",
    # 0x0a as Midiverb: the USB base picks the effect id at install. No id is free for a pinned card build.
    menu=MenuEntry(fx2_id=0x0a, donor_desc=0x400d58b8,   # DARK REV
                   abbr=b"QVRB" if _P is None else b"QV" + _TAG[:2],
                   fullname=b"QUADRAVERB" if _P is None else b"QV DEV " + _TAG, build_tag=False),
    params=(
        # PROG on the dial, as Midiverb's: stock's stepped tick widget holds five positions (it crashed the owner's unit
        # with 24 on 25 Nov 2026).
        Param(b"PROG", PROGRAMS.index(10), len(PROGRAMS), True, Formatter.WIDE_STEPPED, labels=tuple("%02d" % n for n in PROGRAMS),
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
