# Analog Rytm MKII: Quick Mod Assign 0.2.0-experimental — 11 November 2026

Nathaniel Pavel's (@npp1993) Quick Mod Assign 0.2.0 (id `quick-velocity-aftertouch-assign`, renamed from Quick Velocity+Aftertouch Assign) adds the LFO: holding LFO and turning a knob makes that parameter the sound's LFO destination at depth 0, and further turns set DEP with stock's DEP steps, shown in the knob's box as the LFO page writes it. A plain LFO tap is played through `core_key` on its release. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-quick-velocity-aftertouch-assign-2026-11-11.json` (commit `cadeb70c`), replacing 0.1.0's pin.

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`) from a clean committed checkout of this branch. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`.
- **Package:** `quick-velocity-aftertouch-assign-0.2.0-experimental-os1.74.elemod` `26c6dce9…b50c`, copied into the vendored catalogue (same bytes as the pinned file). 0.1.0's source-only package stays in `sdk/imports`.
- **Emulator:** QM21 (vendored base `73f3668c` + this source, `bbf9d4e5…`) in rytm-emu `2ac0f1f`: the six media plans in `media/capture.json` replay to the committed captures.
- **On a unit:** the author's Analog Rytm MKII, OS 1.74: Modwerk's private test rig ran six screen cases on QL13 (this source beside Loop Sync on a development base, RAM-booted), all passing; the author's hand checks on QL10 to QL13 pass (TESTING.md). This package itself has not run on a unit, alone or flashed.
