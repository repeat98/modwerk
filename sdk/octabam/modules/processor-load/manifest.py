"""PROCESSOR LOAD: Tim Hastie's ColdFire load meter in the stock TEMPO popup
(octatrick-modules v2.11, processor-load/).

The frame interrupt (every 16-sample block, 362.8 us at 44.1 kHz) is timed
from its first instruction to its return with DMA timer 3; the sum over a
quarter second, divided by the quarter second, is shown at the top left of
the TEMPO popup ("47%", "70%!" from 70 up, "--%" without a fresh reading).
With FUNC held the popup shows the longest single block of the last quarter
second as a percentage of one block ("W112"). Nothing is saved; there is no
setting and no OFF switch: the meter is chosen when the firmware is built.

Source: `upstream/` is the author's repository (timhastie/octatrick-modules,
tag v2.11, 5f3d7456a885d37c933b2f47fce2bed29176f3e6). `upstream/processor-load/`
README.md, loadmeter.s and tempo_popup.png are byte-identical to it;
`upstream/processor-load/manifest.py` is the author's manifest with every
stock `expect` written as stock_guard(site, length, sha256) and its
`conflicts` (CF METER, TEMPO BUS) moved to octamod.module.json, because
neither module is in Modwerk's catalogue (sdk/imports/processor-load-5f3d745.json).
This file only re-exports that MODULE with the Modwerk proof note.
"""

import dataclasses
import pathlib
import runpy

from remix.schema import Proof

_UPSTREAM = pathlib.Path(__file__).resolve().parent / "upstream" / "processor-load" / "manifest.py"

MODULE = runpy.run_path(str(_UPSTREAM), run_name="remix_manifest_processor_load")["MODULE"]
MODULE = dataclasses.replace(
    MODULE, author="timhastie/octatrick-modules", author_url="https://github.com/timhastie/octatrick-modules",
    proof=Proof.CHECK,
    proof_note="Modwerk export of the author's v2.11 (5f3d745) run on the pinned ColdFire emulator: arms after boot, "
               "reads stopped and playing, FUNC shows the longest block, '--%' by fault injection; "
               "the hardware report for this image is pending (TESTING.md)")
