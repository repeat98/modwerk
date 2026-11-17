# Analog Rytm MKII: Audio In FX in the library — 3 November 2026

npp1993's Audio In FX 0.1.0-experimental enters the library as a source-only OS 1.74 package, pinned in `sdk/imports/elekloader-audio-in-fx-2026-11-03.json` at commit `d6cd478a`. Downloads stay off (`DIGI_DOWNLOADS_ENABLED`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (`051b19e5…`, from `sdk/build/Dockerfile`) from `ca657d4d`. On the local Colima VM its staging folder was put under the home folder (`mktemp -d "$HOME/…"`), because Colima shares only the home folder; the script was otherwise unchanged. The export reproduces with `package-elemod-recipe.mjs --check`. The same build reproduces Pipo Loop's, Sample RATE's and Silent Pad+Trig's committed packages byte for byte.
- **Package:** `53d8e674…cc83`.
- **Same image as the source:** `scripts/link-image.mjs` with core-ar2 0.7 on a stock OS 1.74 file gives the same image from the package and from the module's source (AF22, `dd1c4b63…`). The screenshots were captured from that image.
- **Linking together:** core-ar2 0.7 with Filter Hz, Loop Sync, Pipo Loop, Sample RATE, Silent Pad+Trig and Audio In FX packages links on a stock OS 1.74 file, with the stock-byte guards checked (`d6a6be8a…`). It boots in rytm-emu (`c5732f0`) with no fault, and a tap of D on the DISTORTION page shows INPUT MONO. `planBuild` plans Audio In FX beside Pipo Loop, Sample RATE and Silent Pad+Trig (`src/engine/elekloader/digi-build.test.ts`).
- **On a unit:** the author's builds AC20 and AC21, as TESTING.md records, beside the RC12 and RC14 sets. This package has not run on a unit.
