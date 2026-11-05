# Analog Rytm MKII: QPERF 0.2.0 in the library — 5 November 2026

Nathaniel Pavel's (@npp1993) QPERF, in `_submissions/` since #1105 (0.1.0-experimental), moves into the library as 0.2.0-experimental with the quick perf rec: performance moves recorded in LIVE RECORDING, applied to the pattern with RECORD + YES and cleared with RECORD + NO. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-qperf-2026-11-05.json` (commit `9670de2d`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `8f3b70d4…`, from `sdk/build/Dockerfile`) from a clean checkout of `3485d5e3`, whose module source the pinned commit carries unchanged. The same run reproduces Temp Save's committed package (`b7ce860c…`). The export reproduces with `package-elemod-recipe.mjs --check`.
- **Package:** `qperf-0.2.0-experimental-os1.74.elemod` `b6254d36…fa2d`, fetched into the vendored catalogue through its pin by `npm run elekloader:update -- --overlay`.
- **Same image as the source:** `scripts/link-image.mjs` with the plain Modwerk base (`e558ad22`) on a stock OS 1.74 file gives the same image from the package and from the module's source (QL19, `a8a2dea0…`).
- **Memory:** 17,876 bytes of the shared mod area by the linker's `ramSpare` (base alone 119,288, with QPERF 101,412); the quick perf rec's arrays are 6,912 of them.
- **Linking:** `planBuild` plans it beside Live Rec Retrig Fix and Temp Save (`src/engine/elekloader/digi-build.test.ts`).
- **On a unit:** the author's Analog Rytm MKII passed the quick perf rec's test plan on QT07 and QT08 (QPERF alone, with a debug trace over USB MIDI, since removed from the source), as [TESTING.md](../../sdk/analog-rytm-mkii/modules/qperf/TESTING.md) records. This package's bytes have not been flashed from the site, and no browser build from a stock OS file ran here.
