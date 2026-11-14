# Analog Rytm MKII: BD ANALOG 0.2.0-experimental package — 13 November 2026

Nathaniel Pavel's (@npp1993) port of repeat98's Analog BD (id `analog-bd`) to the Analog Rytm MKII: Analog BD's 808 and 909 (0.1.7) as a digital voice machine on the Modwerk base's digital voices (repeat98/modwerk#1447). Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-analog-bd-2026-11-13.json` (commit `ed2b771e`), recorded in `sdk/imports/analog-bd-0.2.0-2026-11-13.json`.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from a clean committed checkout of this branch; exported with `scripts/package-elemod-recipe.mjs`.
- **Package:** `analog-bd-0.2.0-experimental-os1.74.elemod` `85d42e77…403a`, the same bytes in `sdk/imports/packages/analog-bd/` and the vendored catalogue.
- **Emulator:** BA21 (the published base 3ece243b + this source, `692962ff…1b39`) in rytm-emu `2ac0f1f`: `tools/emu_check.py` all pass; `tools/asm_check.py` 0 differences on its four passes; the three media plans in `media/capture.json` replay to the committed captures.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74, by hand on the published base (VB01, 12 November 2026) and under the author's automated rig on a development base (BL01, 11 November 2026): TESTING.md and `docs/verification/2026-11-12-rytm-base-digital-voices.md`. This package has not run alone on a unit.
