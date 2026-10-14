# LO-FI AMF Fix testing

Only results that were actually produced are recorded here. Anything not listed as run is not tested.

## Source identity

- Imported from `sambanks/octabam` `modules/lofi-amf-fix` at `063a42626a40f863c0e1b056155b74f8b5666004` (Sam Banks's declaration; the module's files last changed in `7f6d9cc2`).
- Fix author's repository: `bryantysinger/octa-bt-pt` at `e970dd0f9841ce5f648c2a257342cb8a3a05b54a` (licence only is copied, as `upstream/LICENSE`).
- Every copied file, its source path, Git blob and SHA-256, and the two transformed files (`manifest.py`: guarded pokes; `upstream/README.md`: the stock word's hex elided) are recorded in `sdk/imports/lofi-amf-fix-063a426.json`.
- Modwerk branch `lofi-amf-fix` off `main` at `bc00c723b0d85fbdbe18ee5de938bad0f56aa0a6`.

## What upstream measured (not reproduced here)

- octabam: both sites disassembled against the stock image, `mpysu x0,y0,a` before and `mpyuu x0,y0,a` after, at P:0x01bef (payload A) and P:0x019af (payload B), resolved to image addresses with `tools/build/dsp_modmap.py`. Proof level `CHECK`; not flashed.
- octa-bt-pt: AMF 0-127 × fine 0-127 (16,384 points) through the DSP emulator with the fix, zero monotonicity violations; the eleven stock violations (AMF 8, 17, 23, 28, 32, 35, 37, 40, 42, 45, 48) resolved. That sweep exercised payload A only; payload B cannot be booted in `dsp_host`.

## Commands run in this repository

8 October 2026: Linux sandbox (Node 22.22.0), and Bryan Tysinger's Mac (Node 24.21.0) for the doctor and check.

| Command | Result |
| --- | --- |
| Import `manifest.py` with the vendored `remix.schema` (no firmware) | passes: `Kind.CF_PATCH`, two pokes at `0x400f4bbb` and `0x40107b0c`, 3-byte guards, write `cd2701` |
| `npm run licenses:generate`, `npm run licenses:check` | pass |
| `npm run module:doctor -- lofi-amf-fix` | see the last section |

Confirmed 8 October 2026 against an original OS 1.40C update (MAIN OS 1,112,560 bytes, SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`), in the sandbox and again on Bryan Tysinger's Mac:

| | payload A (tracks 5-8) | payload B (tracks 1-4) |
| --- | --- | --- |
| DSP address | P:0x1bef | P:0x19af |
| Image address via `tools/build/dsp_modmap.py` | `0x400f4bbb` (matches manifest) | `0x40107b0c` (matches manifest) |
| Stock word guard SHA-256 `7a4ab30f…3c9f10` | match | match |
| Enclosing P record starts at | P:0x1b58 (LO-FI) | P:0x1918 (LO-FI) |

Applying both pokes changes exactly two bytes of MAIN OS (one per payload); the result has SHA-256 `175989699c705de1434e03b23cf0615329da9af7db85a8c57ea2aea0a667cbbe` on both machines. Not confirmed here: that the stock word disassembles as `mpysu x0,y0,a` and the replacement as `mpyuu x0,y0,a` (upstream's and the author's disassembly; the DSP disassembler was not built for this check).

## OT UI captures

8 October 2026, Bryan Tysinger's Mac (Apple silicon). `ot_emu` built from this checkout's `sdk/octabam/tools/emu/ot_emu` (`bash scripts/vendor.sh mc68k dsp56300`, mc68k `4a6d0d1`, dsp56300 `8ccdd843`; `cmake -S tools/emu/ot_emu -B out/emu -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64`), emulator SHA-256 `1955bc62…37938d718`. Image: the original MAIN OS with only this module's two guarded pokes applied by a local script (`175989699c70…a667cbbe`); a standalone composition, not shared-builder output. `scripts/capture-module-ui.py` with the plan recorded in `media/capture.json`, MKII panel, empty scratch card. Both PNGs were reviewed (FX1 SETUP with LO-FI highlighted; LO-FI's page with AMF at 8) and their hashes match `media/capture.json`. They are stock screens and show nothing about the fix itself.

## Native comparison and packages

Not run. They need a local original OS 1.40C and the toolchain image:

```sh
docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .
image=$(docker image inspect modwerk-source-tools --format '{{.Id}}')
bash scripts/build-modules-isolated.sh . ../module-packages "$image"
npm run modules:import -- ../module-packages/packages --development
npm run module:verify -- lofi-amf-fix --os ~/path/to/OCTATRACK_OS1.40C.bin
```

## Sound quality

Not tested. The module changes the ring-modulator frequency only; aliasing, clipping, DC and idle behaviour of LO-FI are expected to match stock at unaffected AMF values. `npm run fx:audit` has not been run.

## Performance

8 October 2026, Bryan Tysinger's Mac. `sdk/octabam/tools/harness/benchmark_stock_dsp.py`, unmodified, default 4,096 blocks, one independent instance per DSP core, fixed and moving knobs, audio at X:0; `dsp_host` built from this checkout (`cmake --build sdk/octabam/vendor/dsp56300/build --target dsp_host`), SHA-256 `0f357c16bfa5db472ef0e40b3c37777bc2c5a74b0649b9d50891ab32d42aa499`. Run twice in the same tree, the only difference being the MAIN OS placed in `out/raw` (removed afterwards): the original 1.40C (`164f3122…af0a84e`) and the image with this module's two pokes (`175989699c70…a667cbbe`). Units are executed instructions per sample in the emulator, null stub subtracted, **not hardware cycles**.

| LO-FI | Stock image | Patched image |
| --- | ---: | ---: |
| Fixed knobs | 275.4375 | 275.4375 |
| Moving knobs, mean | 275.4022 | 275.4032 |
| Worst tested | 275.4375 | 275.4375 |
| Peak block, both cores (instructions / 16 samples) | 4,474 | 4,474 |

Every other stock effect's figures are identical between the two runs. Reference from the same runs: SPRING REV worst 257.5, dearest stock effect DJ EQ 293.375. LO-FI's moving-knob peak output differs between the runs (2,073,161 stock, 2,035,612 patched) while its fixed-knob output is identical (2,012,557), consistent with the moving pass reaching the changed multiply; which knobs that pass moves was not checked, so this is not a test of the fix.

Not produced: `evidence/performance.json`. Its DSP record asks for a static floor of the module's own per-sample loop (`cycle_count.py`) and a `pressure.py render` stress run over a remix's layouts; this module has no loop or effect of its own, and neither tool applies to a two-word rewrite inside stock LO-FI. The qualification record likewise asks for integer worst-case cycles per instance. See the open question in the pull request.

## Stock flows

Not run. The one intended change (LO-FI's AMF pitch at the affected values; see README, "Change to a stock flow") must be confirmed, and these flows compared with and without the module, before release:

- LO-FI on FX1 and on FX2, tracks 1-4 (payload B) and 5-8 (payload A): AMF 0-60 sweep, AMF 7 → 8.
- LO-FI's other parameters (DIST, SRR, BRR, AMD, AMPH): unchanged.
- AMF under LFO, scene (crossfader) and parameter-lock modulation.
- Part save / reload, project save / load, and a power cycle with LO-FI settings on several tracks.
- Every other stock effect on FX1 and FX2: unchanged.

## Hardware

### Functional check, 8 October 2026 (reported by Bryan Tysinger)

- Unit: Octatrack MKII (Bryan Tysinger's).
- Image: `LOFIAMF01.bin`, update-file SHA-256 `c568588155bb56e21ee3ef32b48ae20c2b16fad495586d6ebb9da6446b19ea43`, MAIN OS SHA-256 `175989699c705de1434e03b23cf0615329da9af7db85a8c57ea2aea0a667cbbe` (original 1.40C with only this module's two guarded pokes; packaged with Modwerk's `encodeFirmware`). Same hashes on the sandbox and on Bryan's Mac.
- Procedure: LO-FI with AMD high and DIST, SRR, BRR at 0 on a sustained source; AMF stepped one value at a time from 0 to 60 on T1 FX1 (payload B), T5 FX1 (payload A) and T1 FX2.
- Result, as reported: passed. The ring-modulator pitch rose at every step in all three cases, including 7→8, 16→17, 22→23 and 47→48.
- Not covered by this check: AMF above 60, modulation, persistence and load (see the stress run below).

### Stress run, 8 October 2026 (reported by Bryan Tysinger)

Same unit and image as the functional check above.

- Project: a disposable project (referred to here as AMFSTRESS), fingerprint `dcaa2e11b5a6faec43cc4e7ceedc37ba80f747ee7990429864ed10f71c8a6fce`, computed on the project folder copied from the card with `find . -type f -not -name .DS_Store -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256`. The project stays with the tester.
- Recipe, as reported: eight audio tracks playing a single-cycle sine; LO-FI on FX1 and FX2 of all eight tracks (16 instances, both DSP cores, both slots); every AMF value tried; three LFOs per track, all values tried; AMF parameter-locked on all tracks.
- Duration: about 10 minutes of audio (tester's estimate).
- Controls: passed. Transport (stop/start, tempo changes, Part switching while playing): passed. Audio continuity (no dropouts, clicks, hangs or screen lag): passed. Memory integrity (unsaved edits, then Part reload and project reload back to the saved state): passed. Recovery (power-cycle, project reload; all instances, settings and the corrected pitch back): passed.
- Context, not evidence for this image: the tester has run the same two-word fix, built with his own octa-bt-pt tool, for several months without issues.
- Limits: the duration is an estimate and below the 15 minutes first proposed; MIDI tracks, MIDI CC modulation and scenes were not part of the run.

## Release notes to add when the module is listed

The changelog check refuses notes for a module that is not yet in `sdk/catalog.json`. When it is listed, add `src/community/module-changelogs/lofi-amf-fix.json` with version `0.1.0-experimental`: the import and what the fix does; that saved projects at the affected AMF values play at the corrected pitch, with no runtime switch; that Modwerk declares the writes as guarded pokes with no change to the addresses or word; and which of the tests above were actually run.

## module:doctor, 8 October 2026

Red, as expected for an unlisted import without a local OS: catalog entry, native comparison, declaration checks and package fingerprint need the steps above. Notes: performance record absent; sound quality not tested.
