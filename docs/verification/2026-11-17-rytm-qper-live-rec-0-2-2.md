# Analog Rytm MKII: QPER Live Rec 0.2.2-experimental — 17 November 2026

Nathaniel Pavel's (@npp1993) QPER Live Rec (id `qperf`), 0.2.2: a shorter quick exit for the audio handler while nothing moves. What the quick exit reads sits in one aligned struct of four cache lines, and a word written after each whole block says whether anything is still in play; no behaviour change. Module RAM 15,881 to 16,233 B. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-qperf-2026-11-17.json` (commit `0562e6522`), replacing 0.2.1's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of the source the package commit carries, exported with `package-elemod-recipe.mjs` and checked with `verify-elemod-release-exports.mjs`.
- **Package:** `qperf-0.2.2-experimental-os1.74.elemod` `4ff5dfe4…7aa5`. Earlier source-only packages stay in `sdk/imports`.
- **Equivalence:** a host differential test ran 0.2.1's and 0.2.2's source block by block: 0 differences in 80 million blocks. An independent review found no behavioural difference.
- **Emulator:** rytm-emu 2ac0f1f, QL21 (this source alone on the plain base): both media frames byte-identical to 0.2.1's.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74, QPN2 (development base, this source and a private meter) against 0.2.1's QPO2, from RAM, run by the test rig: the audio handler took 470 ticks a block stopped (0.2.1: 850 to 854) and 902 playing (0.2.1: 1,269 to 1,286), and two rig cases gave the same screens and amounts on both. Details in the module's TESTING.md.
