# Analog Rytm MKII: Ping Pong Loop retired, Improved SMPL 0.6.1-experimental — 16 November 2026

Nathaniel Pavel's (@npp1993) Ping Pong Loop (`pipo-loop`) leaves the library: since Improved SMPL 0.6.0 (#1649) its code lives there unchanged. Its folder, import records, packages, vendored package and release notes go. Improved SMPL 0.6.1 drops `pipo-loop` from `compatibility.conflicts` and changes nothing else. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-16.json` (commit `f5b1c269d`), replacing 0.6.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `3d0d46b0…`) from a clean checkout of `b20bd793d`. Exported with `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 66 current exports from that build, this one included.
- **Package:** `sample-rate-0.6.1-experimental-os1.74.elemod` `67ed32bb…0f0a`; against 0.6.0's `f749f249…d2c8` only `version` and `conflicts` differ. Earlier source-only packages stay in `sdk/imports`.
- **Same images as 0.6.0:** linked, 0.6.1 gives MS01 (vendored core-ar2 0.7 + the module) `5ecfe9cb…ed0d` and MSU1 (the author's development base, RB08's lockfile) `a34e9ec9…0579`, byte for byte as 0.6.0. MSU1 is the image the author ran on the unit for 0.6.0, so that evidence holds unchanged.
- **Linking:** `planBuild` plans it beside Silent Pad+Trig, Audio In FX, Live Rec Retrig Fix, Euclid Accents, Velocity Humanise and Compressor Preview (`src/engine/elekloader/digi-build.test.ts`).
