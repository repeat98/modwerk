# Analog Rytm MKII: BD ANALOG 0.2.2-experimental package — 21 November 2026

Nathaniel Pavel's (@npp1993) BD ANALOG (`analog-bd`) 0.2.2 drops the type's name (808 / 909) from the SYNTH page's bottom bar: `mw_voice.names` is 0, so the base draws nothing there, and knob B's label (TON / SWT) says the type. No sound code changes. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-analog-bd-2026-11-21.json` (commit `8b0d14396`), recorded in `sdk/imports/analog-bd-0.2.2-2026-11-21.json`, replacing 0.2.1's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `12f774a06`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`.
- **Package:** `analog-bd-0.2.2-experimental-os1.74.elemod` `d268d583…6f11`, the same bytes in `sdk/imports/packages/analog-bd/` and the vendored catalogue.
- **Image:** the published voices base dd771eae with this source links to BA23 `0504d80a…d3d7`; the three media plans in `media/capture.json` replay on BA23 to the committed captures.
- **Checks:** `tools/emu_check.py` all pass, meter unchanged; `module:doctor` green.
- **On a unit:** the author's automated rig on the author's MKII, CD02 (`3ea8d38b…`, this source on a development base with a USB test link), flashed: no type name in the bottom bar for the 808 or the 909, B's label switching, the type coming back (module TESTING.md). This package has not run alone on a unit.
