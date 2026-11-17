# Analog Rytm MKII: BD ANALOG 0.2.1-experimental package — 16 November 2026

Nathaniel Pavel's (@npp1993) BD ANALOG (`analog-bd`) 0.2.1 stores the knob tables it reads once per knob change as 16-bit steps above their smallest word and works three of them out: 5,024 bytes less module RAM, with the per-sample code unchanged. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-analog-bd-2026-11-16.json` (commit `964de8716`), recorded in `sdk/imports/analog-bd-0.2.1-2026-11-16.json`, replacing 0.2.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `f755c95fb`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 65 current exports from that build.
- **Package:** `analog-bd-0.2.1-experimental-os1.74.elemod` `7644a293…64b1`, the same bytes in `sdk/imports/packages/analog-bd/` and the vendored catalogue. Against 0.2.0's `85d42e77…403a`: the version, `.run`, its symbols and relocations.
- **Image:** the published base 3ece243b with the vendored package links to BA22 `b5b06ee1…0e75`, byte for byte the image linked from the source; `ramSpare` 76,272 (0.2.0: 71,248). The three media plans in `media/capture.json` replay on BA22 to the committed captures.
- **Checks:** `tools/asm_check.py` 0 differences on its four passes; `tools/emu_check.py` all pass, meter unchanged; host and emulator comparisons with 0.2.0 in the module's TESTING.md.
- **On a unit:** by hand in the author's private 17-module combo image RC42 (16 November 2026): works, sounds as before; three voices playing make the unit laggy. This package has not run alone on a unit.
