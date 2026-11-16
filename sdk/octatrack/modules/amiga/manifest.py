"""AMIGA -- a track machine: the track's Flex sample as an 8-bit tracker plays it, with a cyclic stretch.

Stock's FLEX reader plays the sample; the machine's render reworks the source
PCM in the frame packet before the DSP repitches it (SRR: sample-and-hold,
BITS: 4 to 16, LED: a fixed lowpass) and restarts the reader every cycle where
the sample would be at speed SPD, as stock's retrig restarts a note, crossfading
out of the sample itself; a sliced note stretches inside its slice. SRC slots
4 and 5 hold SPD and GRN instead of stock RTRG and RTIM; slot 3 stays stock's RATE.

No stock code is patched: the machine joins the base's machine list and START
dispatch through runtime.json (ot_machines, ot_machine_starts).
"""

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

MODULE = Module(
    name="amiga",
    key="AMIGA",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="repeat98",
    author_url="https://github.com/repeat98",
    proof=Proof.HARDWARE,
    proof_note="Host gate on the engine; RAM trials of 0.1.0 on an MKII on a development base, 11 Nov 2026 (TESTING.md).",
    doc="Track machine: a Flex sample at 8 bits and a lower storage rate, with a cyclic time-stretch.",
    linked=(
        Linked("amiga", "modules/amiga/amiga_core.s", cpu="5475", dram=True),  # the filter uses the EMAC
    ),
    gates=(Gate("modules/amiga/verify.py", remix_arg=False),),
)
