"""GRAIN -- a track machine: a granular engine on the track's Flex sample, six grains at a time.

The engine is based on Model-TG's granular mode (TinyGregAudio, MIT) and extended: random pan per grain, a SYNC mode,
DIR as a share of backward grains, a SCAN read head, POS in fine steps. Stock's FLEX reader runs a neutral note (PTCH 0,
RATE forward, no retrig or stretch) so the voice stays live; the machine's render replaces the source PCM in the frame
packet with up to six windowed grains read from the Flex sample in stock's pages, before the DSP takes it. The engine
applies the pitch itself. A page with the waveform and the grains is drawn over SRC, and a full-screen page over the
third press of PLAYBACK.

No stock code is patched: the machine joins the base's machine list and START dispatch through runtime.json
(ot_machines, ot_machine_starts) and draws through module_draw. Everything GRAIN keeps in a Part passes stock's own
power-on check. The connection to stock follows AMIGA (Jannik Assfalg, MIT).
"""

from remix.schema import Category, Gate, Kind, Linked, Module, Proof

MODULE = Module(
    name="grain",
    key="GRAIN",
    kind=Kind.CF_PATCH,
    category=Category.MACHINES,
    author="AForceTrulyEvil",
    author_url="https://github.com/AForceTrulyEvil",
    proof=Proof.HARDWARE,
    proof_note="Host gate on the engine; played on one MKI on a base built from this repository's sources (TESTING.md).",
    doc="Track machine: six-grain granular on the Flex sample, with a waveform view and a full-screen page.",
    linked=(
        Linked("grain", "modules/grain/grain_core.s", cpu="5475", dram=True),
    ),
    gates=(Gate("modules/grain/verify.py", remix_arg=False),),
)
