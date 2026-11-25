# Analog Rytm MKII: Temp Save 0.1.0 in the library — 5 November 2026

Nathaniel Pavel's (@npp1993) Temp Save, in `_submissions/` since #1116, moves into the library as 0.1.0-experimental (same version, same code). FUNC + YES temp-saves the active pattern and its kit with stock's own save; FUNC + NO reloads both. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-temp-save-2026-11-05.json` (commit `5a700aff`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `8f3b70d4…`, from `sdk/build/Dockerfile`) from a clean checkout of `dcc1208f`, the source of the pinned commit. The export reproduces with `package-elemod-recipe.mjs --check`.
- **Package:** `temp-save-0.1.0-experimental-os1.74.elemod` `b7ce860c…7e86`, fetched into the vendored catalogue through its pin by `npm run elekloader:update -- --overlay`. Compiled with the default `-O2`: 1,092 bytes of code and 8 of `.bss`; `resources.memoryBytes` is 1,100 (the two 4-byte event words are not counted).
- **Code:** unchanged from the submission. The library move adds the measured memory and the release notes only.
- **Linking:** `planBuild` plans it beside Quick Trig Conditions and Silent Pad+Trig (`src/engine/elekloader/digi-build.test.ts`).
- **On a unit:** the author's Analog Rytm MKII passed build TS09, Temp Save alone, as [TESTING.md](../../sdk/analog-rytm-mkii/modules/temp-save/TESTING.md) records. This package's bytes have not been flashed from the site, and no browser build from a stock OS file ran here.
