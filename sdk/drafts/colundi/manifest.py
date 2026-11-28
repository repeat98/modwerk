"""Experimental track machine. The runtime recipe owns both table records."""
from remix.schema import Category, Gate, Kind, Module, Proof

MODULE = Module(
    name="colundi", key="COLUNDI", kind=Kind.CF_PATCH, category=Category.MACHINES,
    author="btzz5w8w5d-star", author_url="https://github.com/btzz5w8w5d-star",
    doc="One-shot absolute-frequency test voice for sequencer START.",
    proof=Proof.UNTESTED, proof_note="Source draft. Hardware qualification pending.",
    gates=(Gate("modules/colundi/test_pcm.py", remix_arg=False),),
)
