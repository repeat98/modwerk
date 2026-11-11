# Analog Rytm MKII: Fine Tune + Sample Rate 0.2.0-experimental — 11 November 2026

Nathaniel Pavel's (@npp1993) Sample Playback Rate, renamed Fine Tune + Sample Rate (id `sample-rate`), 0.2.0: TUN on the SAMPLE page turns 1 cent a step, a pressed turn whole semitones keeping the cents, shown with two places; switching SMP RATE no longer glides FIN through a stop or a semitone. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-11.json` (commit `21726bea`), replacing 0.1.1's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`, Dockerfile unchanged since 63f0814e) from a clean checkout of `1ed233ac`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`; `verify-elemod-release-exports.mjs` reproduces the 61 current exports from that build.
- **Package:** `sample-rate-0.2.0-experimental-os1.74.elemod` `115e4ff4…294e`. 0.1.x's source-only packages stay in `sdk/imports`.
- **Emulator:** SF09 (vendored core-ar2 0.7 + this source, `46124bc9…`) in rytm-emu `c5732f0`: the six media frames, replayed from `media/capture.json`, are byte-identical to SF07's. Rig cases pass on SF08 (the author's private test base + this source).
- **On a unit:** see the module's TESTING.md: the author's automated rig on the author's Analog Rytm MKII, booted from RAM, flash untouched.
