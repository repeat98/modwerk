# Analog Rytm MKII: Improved SMPL 0.5.1-experimental — 16 November 2026

Nathaniel Pavel's (@npp1993) Improved SMPL (id `sample-rate`), 0.5.1: the sample preview (FUNC + YES in a sample list) plays at 1x again, whatever the track's RATE or an LFO on it (issue #1591). Stock plays a preview from its own slot 129; the module leaves any voice on slot 128 or above at 1x and never turns it backward. Everything else is as in 0.5.0. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-16.json` (commit `add6a0165`), replacing 0.5.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `9493ce476`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 67 current exports from that build, this one included.
- **Package:** `sample-rate-0.5.1-experimental-os1.74.elemod` `a0064aa6…1786`. Earlier source-only packages stay in `sdk/imports`.
- **Emulator:** rytm-emu: the preview reproduced silent on 0.5.0 (combo RC40, SO01) and at stock's speed on this source (SF02) at RATE 0 and -32; with an LFO on RATE (SV12) the step held at 1x, forward; pad play forward and backward unchanged against 0.5.0. Media captured on SV12.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74, SU02 (the author's private development base + this source) booted from RAM, as the author reports: previews at RATE 0, +63, -64 and with an LFO on RATE all at normal speed; pad play followed RATE. Details in the module's TESTING.md.
