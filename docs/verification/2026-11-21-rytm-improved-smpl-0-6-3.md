# Analog Rytm MKII: Improved SMPL 0.6.3-experimental — 21 November 2026

Nathaniel Pavel's (@npp1993) Improved SMPL 0.6.3. PIPO's loop follower (`pipo_loop_audio`) now rests whenever its last pass found no voice in PIPO, with LOP OFF or ON; 0.6.2 rested only with LOP OFF everywhere. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-16.json` (commit `6e5f74e08`), replacing 0.6.2's pin, and vendored with `npm run elekloader:update -- --overlay`.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `318b16fcd`. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports from that build, this one included.
- **Package:** `sample-rate-0.6.3-experimental-os1.74.elemod` `2d0bf205…99e7`.
- **Same image as the local build:** linked with the vendored core-ar2 0.7, the package gives `b9729b9e…6cd1`, byte for byte the image the author's toolchain linked from the module folder (SX63). SX63 ran in rytm-emu against 0.6.2 (SX62), with identical per-block state and audio over 146,802 blocks. The unit image SU63 (the author's development base + the same source) ran the rig's rest case on the author's unit and passed all 30 checks (TESTING.md).
- **Linking:** `planBuild` plans it beside Silent Pad+Trig, Quick Mod Assign and Control In Actions (`src/engine/elekloader/digi-build.test.ts`).
