# Analog Rytm MKII: Improved SMPL 0.4.0-experimental — 11 November 2026

Nathaniel Pavel's (@npp1993) Fine Tune + Sample Rate, renamed Improved SMPL (id `sample-rate`), 0.4.0: the SMPL key always shows SMPL WAVEFORM; the SAMPLE page's knob-only view is gone. RATE on every sound and TUN in cents are as in 0.3.0. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-11c.json` (commit `13a5029e`), replacing 0.3.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`) from a clean checkout of `c0721adf`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`; `verify-elemod-release-exports.mjs` reproduces the current exports from that build.
- **Package:** `sample-rate-0.4.0-experimental-os1.74.elemod` `028f3b0b…0369`. Earlier source-only packages stay in `sdk/imports`.
- **Emulator:** SR43 (vendored core-ar2 0.7 + this source, `0a12166c…`) in rytm-emu `c5732f0`: the SAMPLE page shows the waveform, a second SMPL press stays, SMPL + PLAY still clears; media captured in the waveform view.
- **On a unit:** SG04 (the author's private test base + this source), booted from RAM on the author's Analog Rytm MKII, flash untouched: the author's automated rig ran 7 cases, all passing twice. Details in the module's TESTING.md.
