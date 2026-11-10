"""AMIGA -- a track machine: the track's Flex sample as an 8-bit tracker plays it, with a cyclic stretch.

Stock's FLEX reader plays the sample; the machine's render reworks the source
PCM in the frame packet before the DSP repitches it (RATE: sample-and-hold,
BITS: 4 to 16, LED: a fixed lowpass) and restarts the reader every cycle where
the sample would be at the length STCH asks, as stock's retrig restarts a note. SRC slots
3 to 5 hold STCH, CYL and RATE instead of stock RATE, RTRG and RTIM.

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
    proof=Proof.UNTESTED,
    proof_note="Host gate on the engine only; not run in the emulator or on a unit.",
    doc="Track machine: a Flex sample at 8 bits and a lower storage rate, with a cyclic time-stretch.",
    linked=(
        Linked("amiga", "modules/amiga/amiga_core.s", cpu="5475", dram=True),  # the filter uses the EMAC
    ),
    gates=(Gate("modules/amiga/verify.py", remix_arg=False),),
)
