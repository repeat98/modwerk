"""SY DRUM: Tim Hastie's analog-style drum machine for FLEX tracks (octatrick 2.14).

The engine, its PLAYBACK and PLAYBACK SETUP pages and the per-step locks of the
setup LFO are the author's pinned source (upstream/sy-drum, with the one file it
reads from his synth/ directory, upstream/synth/engine_abi.inc). It runs on FM
Synth's engine and machine list (key SYNTH MACHINE): the author's manifest
requires that module, so native octabam refuses SY DRUM without it, and
Modwerk's configurator refuses the same selection (src/catalog/selection-
conflicts.ts). With SY DRUM selected, FM Synth's two engine units are the
variants assembled with HAVE_SYDRUM 1 (its machine-list row and the engine's
calls into this unit); without it they are FM Synth's ordinary objects.

This wrapper adds only the Modwerk fields. Every stock span the author's
manifest names is a stock_guard (site, length and SHA-256 of the user's own
1.40C), checked against the literal it replaces when it was imported
(sdk/imports/sy-drum-39dc5d8.json). The author's conflicts name octabam modules
Modwerk does not carry (KITS, PLOCKS P2, STEM REC); they are left out of the
native declaration, and README.md names them.
"""
import dataclasses
import pathlib
import runpy
from remix.schema import Category, Proof

_HERE = pathlib.Path(__file__).resolve().parent
_UP = runpy.run_path(str(_HERE / 'upstream/sy-drum/manifest.py'))

MODULE = dataclasses.replace(_UP['MODULE'],
    category=Category.MACHINES, author='timhastie', author_url='https://github.com/timhastie',
    doc='SY DRUM in the machine list (the row after FM SYNTH): an analog-style drum voice, one voice a track, with a '
        'dedicated LFO / S&H lockable per step. Needs FM Synth (SYNTH MACHINE).',
    proof=Proof.UNTESTED,
    proof_note='Octatrick 2.14 SY DRUM; emulator-qualified on the Modwerk image, hardware report for this build pending',
    conflicts=())
