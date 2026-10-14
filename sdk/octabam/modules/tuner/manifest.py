"""TUNER: Tim Hastie's tuner window for the current audio track
(octatrick-modules v2.12, tuner/).

Hold UP and press TEMPO: a window the size of the stock TEMPO window opens
over the page with the note, octave, a +-50 cent needle, the cents and the
frequency of what the current audio track plays (its post-FX, pre-fader
signal from the read-back arena the stock eDMA fills every block), about
seven readings a second. TEMPO, YES, NO or UP + TEMPO again close it.
TEMPO alone, FUNC + TEMPO and UP alone stay stock. Nothing is saved.

Source: `upstream/` is the author's repository (timhastie/octatrick-modules,
tag v2.12, ca13ed85547790f788ceaaada5df3cdd31508441). `upstream/tuner/`
README.md and tuner.s are byte-identical to it; `upstream/tuner/manifest.py`
is the author's manifest with its three stock `expect`s written as
stock_guard(site, length, sha256) (sdk/imports/tuner-ca13ed8.json). The
tuner's code and manifest are unchanged since v2.8 (237d40b); since the v2.9
tag only one README line changed (it became three: the author's MKI hardware
note). This file only re-exports that MODULE with the fields octabam's wrapper
adds (category, author, proof).
"""

import dataclasses
import pathlib
import runpy

from remix.schema import Category, Proof

_UPSTREAM = pathlib.Path(__file__).resolve().parent / "upstream" / "tuner" / "manifest.py"

MODULE = runpy.run_path(str(_UPSTREAM), run_name="remix_manifest_tuner")["MODULE"]
MODULE = dataclasses.replace(
    MODULE, category=Category.MACHINES, author="timhastie/octatrick-modules",
    author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.HARDWARE,
    proof_note="The same tuner.s on the author's MKI (octabam test build 3.0 b40, the octatrick remix at BUILD 40, "
               "29 Sep 2026): UP + TEMPO opens the window and tunes, readings not compared with a reference there; "
               "this Modwerk export runs on the pinned ColdFire emulator and its own hardware report is pending (TESTING.md)")
