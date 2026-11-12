"""MIDISC2.0 owner-approved standalone build.

Fixed-address author release, rather than the old 8.2 relocatable port. It
requires original local stock for inherited spans. Fixed ROM regions overlap
other remixer allocations; arbitrary mixed configurations are not qualified.
"""
from pathlib import Path
import importlib.util
from remix.schema import Category, Kind, Module, Proof

spec = importlib.util.spec_from_file_location('midisc20_patch', Path(__file__).with_name('patch.py'))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

MODULE = Module(
    name='midi-scenes', key='MIDI SCENES', kind=Kind.CF_PATCH,
    category=Category.PARTS, author='bkkbrls-del/midisc',
    author_url='https://github.com/bkkbrls-del/midisc',
    proof=Proof.HARDWARE,
    proof_note='Owner accepts the reported standalone MIDISC2.0 hardware test; no measured timing or memory qualification supplied.',
    doc='MIDISC2.0 standalone source recipe with guarded runtime stock reconstruction; standalone only.',
    pokes=patch.native_pokes(),
)
