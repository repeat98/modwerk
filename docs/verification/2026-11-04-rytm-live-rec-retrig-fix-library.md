# Analog Rytm MKII: Live Rec Retrig Fix 0.2.0 in the library — 4 November 2026

npp1993's Live Rec Retrig Fix 0.2.0-experimental, with stigmagit's Retrig Grid folded in, moves from `_submissions/` into the library as a source-only OS 1.74 package, pinned in `sdk/imports/elekloader-live-rec-retrig-fix-2026-11-04.json` at commit `0e2e9bc4`. Downloads stay off (`DIGI_DOWNLOADS_ENABLED`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (`0d02f26d…`, from `sdk/build/Dockerfile`) from `2eb90150`. The same build reproduces Audio In FX's committed package byte for byte.
- **Package:** `d173fad9…c734`.
- **Same image as the source:** `scripts/link-image.mjs` with core-ar2 0.7 on a stock OS 1.74 file gives the same image from the package and from the module's source (LR20, `dc314a2a…`).
- **Linking together:** core-ar2 0.7 with the ten Rytm library packages (Audio In FX, Chromatic Aftertouch Fix, Control In Actions, Filter Hz, Live Rec Retrig Fix, Loop Sync, Pipo Loop, Quick Velocity+Aftertouch Assign, Sample RATE, Silent Pad+Trig) links on a stock OS 1.74 file (LR21, `290f5495…`). It boots in rytm-emu (`c5732f0`) to the kit screen with no fault. `planBuild` plans Live Rec Retrig Fix beside Pipo Loop, Sample RATE and Silent Pad+Trig (`src/engine/elekloader/digi-build.test.ts`).
- **On a unit:** the author's builds RC07 to RC11 and LD01, as TESTING.md records, beside other module sets. This package has not run on a unit.
