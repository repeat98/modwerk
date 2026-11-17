# Analog Rytm MKII: Euclid Accents 1.2.0 in the library — 7 November 2026

Euclid Accents, in `_submissions/` as 1.1.0, moves into the library as 1.2.0: Iced-Cream's rytm2_mods v1.3 source (`e029f75`), where OP on the EUCLIDEAN page gains OR\*, XOR\*, AND\* and SUB\*, which accent the grid's trigs on euclid hits. 1.2 reaches that parameter's turn and text through core-ar2's parameter table (`core_params`, core-ar2 0.4 and later) instead of the two detours 1.1 made at param_apply_delta and param_value_text, which core-ar2 0.4 and later own. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-euclid-accents-2026-11-07.json` (commit `81851b94`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `e9fc4df5…`, from `sdk/build/Dockerfile`) from a clean checkout of `79062f53`, the source of the pinned commit. The export reproduces with `package-elemod-recipe.mjs --check`.
- **Package:** `euclid-accents-1.2.0-os1.74.elemod` `5c61e6c2…8b49`, vendored through its pin by `npm run elekloader:update -- --overlay`. `.run` is 1,424 bytes, no `.bss`.
- **Parity:** linked with elekloader's released core-ar2 0.7 on stock OS 1.74, the package gives a main OS byte-identical to rytm2_mods v1.3's release object linked with the same core ([source-parity.json](../../sdk/analog-rytm-mkii/modules/euclid-accents/evidence/source-parity.json)).
- **Linking:** `planBuild` plans it beside Pipo Loop and Silent Pad+Trig on the plain base (`src/engine/elekloader/digi-build.test.ts`).
- **Emulator:** captures retaken on the Modwerk base's plain variant with this package (EA12), in analog-emu `4c07ed3`.
- **On a unit:** the author's Analog Rytm MKII passed this source's page entry in P4A4 (core-ar2 0.4, 21 October 2026), as [TESTING.md](../../sdk/analog-rytm-mkii/modules/euclid-accents/TESTING.md) records. This package on the Modwerk base has not been flashed, and no browser build from a stock OS file ran here.
