# Analog Rytm MKII: SY RAVE (rave-stab) 0.1.0-experimental package — 27 November 2026

chevyone's SY RAVE (`rave-stab`) 0.1.0-experimental, a six-voice digital chord stab on slot 39, gets its first source-only OS 1.74 package. It is pinned in `sdk/imports/elekloader-rave-stab-2026-11-27.json` (commit `48ea9a2f4`) and recorded in `sdk/imports/rave-stab-0.1.0-2026-11-27.json`.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `81b0c4b6…`) from a clean checkout of `e6253a744`, the source the package commit carries (recipe sha256 `4c8660de…`, source tree `97f6f1ff…`). Exported with `package-elemod-recipe.mjs`.
- **Package:** `rave-stab-0.1.0-experimental-os1.74.elemod` `4cb65b06…c111`, the same bytes in `sdk/imports/packages/rave-stab/` and the vendored catalogue (`npm run elekloader:update -- --overlay`).
- **Checks:** host tests 31 pass (`tools/run_host_test.sh`); `module:doctor` green.
- **On a unit:** the author's MKII, RH06 (this source with HH Alloy, a local test module, on the development voices base `879c6c23`, RAM-booted, nothing flashed): the SYNTH page read over the link, one voice's CPU (6.76 % of a block), and the author's listening (module TESTING.md). This package has not run alone on a unit.
