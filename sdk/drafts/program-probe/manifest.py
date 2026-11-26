"""PROGRAM PROBE: a development fixture of the base's program areas (events.json ot_dsp_effects). Never published.

Knob A of FX2 picks one of eight programs. Each spends 100 + 500 * program cycles a call in one DO loop and leaves the
audio as it came, so the DSP meter of the slot's core tells which program runs (about 1.4 + 6.9 * program cycles a
sample above the dry proc). probe.asm's proc runs nothing until the base names an area in its slot record; probe.s gives
the base each program's code. The package requires the base's program areas: build it with module:dev, then
`abi9.py --requires programs` (README.md).
"""
from remix.schema import BusRole, Category, DspSection, Formatter, Harness, Kind, Linked, MenuEntry, Module, Param, Proof, YBase

MODULE = Module(
    name="program-probe", key="PROGPROBE", kind=Kind.HYBRID,
    category=Category.TRACK, author="repeat98", author_url="https://github.com/repeat98",
    proof=Proof.RENDER, proof_note="sdk/tests/test_dsp_programs.py (the contract's proc and the base's side); unit runs in README.md",
    doc="Development fixture: eight programs whose DSP cost tells which one runs.",
    menu=MenuEntry(fx2_id=0x0a, donor_desc=0x400d58b8,   # DARK REV; the base picks the id at install
                   abbr=b"PRGP", fullname=b"PROG PROBE", build_tag=False),
    params=(
        Param(b"PROG", 0, 128, True, Formatter.PLAIN, doc="the program: knob / 16, 0 to 7"),
        *(Param() for _ in range(11)),
    ),
    dsp=DspSection(asm="modules/program-probe/probe.asm", priority=15, bus_role=BusRole.NONE, ybase=YBase.NEVER,
                   r7_latch_slot=None, gate_label=None),
    linked=(Linked("program-probe", "modules/program-probe/probe.s", cpu="5475", dram=True),),
    harness=Harness(layout_char=None, is_server=False),
    gates=(),
)
