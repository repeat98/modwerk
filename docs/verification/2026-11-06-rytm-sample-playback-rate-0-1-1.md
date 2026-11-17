# Analog Rytm MKII: Sample Playback Rate 0.1.1-experimental — 6 November 2026

Nathaniel Pavel's (@npp1993) Sample Playback Rate 0.1.1 makes its block handler before stock's sample prefetch return at once when no track has RATE on and no voice is still going down; 0.1.0 walked all eight voices every block. RATE plays as before. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-sample-rate-2026-11-06.json` (commit `e8e6f467`), replacing 0.1.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `8f3b70d4…`) from a clean checkout of `44944e17`, the source the package commit carries. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`; `verify-elemod-release-exports.mjs` reproduces the 41 current exports from that build.
- **Package:** `sample-rate-0.1.1-experimental-os1.74.elemod` `35b50704…57d3`. 0.1.0's source-only package stays in `sdk/imports`.
- **Emulator:** SR07 (vendored core-ar2 0.7 + this source, `59efe414…`) in rytm-emu `c5732f0`: the five media frames are byte-identical to 0.1.0's SR06, replayed from timed plans now recorded in `media/capture.json`.
- **On a unit:** measured on the author's Analog Rytm MKII with a private telemetry base (audio block timed on DTIM0, sent over USB MIDI), sequencer stopped: removing 0.1.0 from the author's 16-module set lowered the idle block from 72.9 % to 72.1 %; LF01 (that set with this source and Ping Pong Loop's and QPERF's idle fixes) idles at 71.1 %, and RATE still slows, stops and reverses, as reported. Not run alone on a unit.
