"""CLYPS private performance draft. Runtime events carry all stock-site ownership."""
import os
from pathlib import Path

from remix.schema import Category, Kind, Linked, Module, Proof

HERE = Path(os.path.relpath(Path(__file__).resolve().parent))
MODULE = Module(
    name='clyps', key='CLYPS', kind=Kind.CF_PATCH, category=Category.MACHINES,
    author='btzz5w8w5d-star', author_url='https://github.com/btzz5w8w5d-star',
    doc='Launch track sequences and recall volatile performance rows on MKII.',
    proof=Proof.UNTESTED,
    proof_note='New candidate has no hardware qualification. Needs the private sequencer and panel capability.',
    linked=(Linked('clyps_performance', str(HERE/'performance_core.s'), dram=True),),
)
