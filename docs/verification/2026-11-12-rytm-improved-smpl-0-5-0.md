# Analog Rytm MKII: Improved SMPL 0.5.0-experimental — 12 November 2026

Nathaniel Pavel's (@npp1993) Improved SMPL (id `sample-rate`), 0.5.0: SMPL WAVEFORM shows one row of values (TUN, RATE, BR, LOP, LEV) over a taller waveform, with the module's own lock boxes, and the waveform appears by itself once the sample has loaded after boot. RATE on every sound, TUN in cents and the SMPL key's waveform view are as in 0.4.0. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-12.json` (commit `7e16b7c50`), replacing 0.4.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `5aeb56af…`) from a clean checkout of `6e2e609fb`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 63 current exports from that build, this one included.
- **Package:** `sample-rate-0.5.0-experimental-os1.74.elemod` `2f92c932…7d7f`. Earlier source-only packages stay in `sdk/imports`.
- **Emulator:** SV02 to SV05 (vendored core-ar2 0.7 + this source's builds) in rytm-emu `c5732f0`: every knob's turn, the sample list, no sample, held-trig locks, BD's playhead, Ping Pong Loop's marks, the slot follow; media captured on SV02.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74, the author's private combo images flashed by hand, as the author reports: RC38 (the row, knobs, LOOP, playhead, sound), RC39 (lock boxes), RC40 (this source; the waveform after boot, three boots). Details in the module's TESTING.md.
