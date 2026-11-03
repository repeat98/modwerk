# Analog Rytm MKII: Audio In FX renamed Audio In Routing — 3 November 2026

Nathaniel Pavel's (@npp1993) Audio In FX 0.1.0-experimental, in the library since #1184, is renamed Audio In Routing, with the id `audio-in-routing`. The version stays 0.1.0-experimental: the code is unchanged.

- **Package:** built in the pinned toolchain (`build-elemod-isolated.sh`, image `a9c5e7d5…`, staging under the home folder for Colima) from `83e912e2` and exported by `package-elemod-recipe.mjs` as `sdk/imports/packages/audio-in-routing/audio-in-routing-0.1.0-experimental-os1.74.elemod` (`5b73803e…`), pinned at `ff09c1f6`. Against Audio In FX's package (`53d8e674…`) only the id, the title and the symbol names differ; every section's bytes and every symbol's offset are the same. The same build reproduces Pipo Loop's, Sample RATE's, Silent Pad+Trig's and Filter Hz's committed packages, and `verify-elemod-release-exports.mjs` reproduces all 32 current source-only exports.
- **Same image:** `scripts/link-image.mjs` with core-ar2 0.7 on a stock OS 1.74 file gives a byte-identical image from the old package, the new package and the module's source (`dd496d26…`). The unit runs the same code as AC20, AC21 and AF22.
- **Not carried over:** the library has no alias for a changed id, so a saved selection or link that names `audio-in-fx` no longer finds the module.
