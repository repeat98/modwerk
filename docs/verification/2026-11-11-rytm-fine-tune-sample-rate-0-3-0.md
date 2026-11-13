# Analog Rytm MKII: Fine Tune + Sample Rate 0.3.0-experimental — 11 November 2026

Nathaniel Pavel's (@npp1993) Fine Tune + Sample Rate 0.3.0 makes FIN's knob RATE on every sound: the SMP RATE row, the tap of encoder B and the per-sound storage bit are gone; FIN's parameter row names it RATE (Rate in the LFO destination list) and defaults to +63 (1x). A sound saved with FIN at +0 now loads stopped. Fine TUNE is unchanged. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-11b.json` (commit `edbb477c`), replacing 0.2.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`) from a clean checkout of `19eb4682`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`; `verify-elemod-release-exports.mjs` reproduces the current exports from that build.
- **Package:** `sample-rate-0.3.0-experimental-os1.74.elemod` `5d7a9f6b…bed9`. 0.1.x and 0.2.0's source-only packages stay in `sdk/imports`.
- **Emulator:** SR32 (vendored core-ar2 0.7 + this source, `6c18cead…`) in rytm-emu `c5732f0`: RATE speeds, names (knob, header, SAMP:Rate) and the +63 default after a page clear; media captured from timed plans in `media/capture.json`.
- **On a unit:** SG02 (the author's private test base + this source), booted from RAM on the author's Analog Rytm MKII, flash untouched: the author's automated rig ran 6 cases, all passing twice. Details in the module's TESTING.md.
