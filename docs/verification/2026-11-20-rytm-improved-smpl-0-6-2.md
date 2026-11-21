# Analog Rytm MKII: Improved SMPL 0.6.2-experimental — 20 November 2026

Nathaniel Pavel's (@npp1993) Improved SMPL 0.6.2: PIPO's loop follower (`pipo_loop_audio`) returns after a look at the 8 voices' LOP while its last pass found LOP OFF on every voice, where such a pass would only write what is already there. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-16.json` (commit `ca64cbbc3`), replacing 0.6.1's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `313d08b94`. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports from that build, this one included.
- **Package:** `sample-rate-0.6.2-experimental-os1.74.elemod` `81271a17…36fd`; against 0.6.1's `67ed32bb…0f0a` the version, `.run` (6,815 to 6,891 bytes) and `.bss` (2,880 to 2,884) differ.
- **Same image as the local build:** linked with the vendored core-ar2 0.7, the package gives `3aee0d25…1491`, byte for byte the image the author's toolchain linked from the module folder (SX62), which ran in rytm-emu against 0.6.1 (SX61) with identical per-block state and audio over 144,552 blocks. The unit image SU62 (the author's development base + the same source) ran the rig's rest case on the author's unit: 30 checks passed (TESTING.md).
- **Linking:** `planBuild` plans it beside Silent Pad+Trig, Quick Mod Assign and Control In Actions (`src/engine/elekloader/digi-build.test.ts`).
