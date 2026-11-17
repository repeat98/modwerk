# Analog Rytm MKII: QPER Live Rec 0.2.1-experimental — 16 November 2026

Nathaniel Pavel's (@npp1993) QPER Live Rec (id `qperf`), 0.2.1: 35 functions reached only from the key, tick and project handlers are marked cold and built for size; the audio handler, the lockers, the pad gate and every stock-site entry are unchanged and the module stays at -O2. Module RAM 17,805 to 15,881 B; no behaviour change. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-qperf-2026-11-16.json` (commit `5eeb9ab15`), replacing 0.2.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of the source the package commit carries. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 67 current exports from that build, this one included.
- **Package:** `qperf-0.2.1-experimental-os1.74.elemod` `98127e16…f0c0`. Earlier source-only packages stay in `sdk/imports`.
- **Review:** an independent review compiled 0.2.0 and 0.2.1 with the build's flags: every function the audio interrupt or a stock site reaches disassembles identically.
- **Emulator:** rytm-emu 2ac0f1f, QL20 (this source alone on the plain base): both media frames byte-identical to 0.2.0's.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74, QR01 (development base + this source alone) booted from RAM, as the author reports: the tutorial and every gesture passed. Details in the module's TESTING.md.
