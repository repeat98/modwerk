# Euclidean Sequencing — test report

- Module: `euclidean` 1.1.5, for Digitakt I OS 1.53 and 1.54 on Elekloader Core 2.1.
- Source: https://github.com/sumedho/digirequests at `27432d5aa7281422e7f80467e7e848c7f5433f33`, `modules/euclidean`.

## 1.1.5: page keys leave Euclidean ([#662](https://github.com/repeat98/modwerk/issues/662))

With Euclidean open, TRIG, SRC, FLTR, AMP and LFO did nothing; only NO left
the page. FUNC + FLTR and FUNC + LFO changed the header underneath to Delay
or Compressor while the Euclidean controls stayed on screen. 1.1.5 closes
Euclidean on these keys and passes the same press to the parameter page, as
from any native page. FUNC + SRC has no native action and keeps Euclidean
open. Holding FUNC + AMP from Euclidean closes and reopens it. The only
source change is the Euclidean page's key handler (`src/release-*/page.c`).

**Emulator** ([evidence/page-keys-1.1.5.json](evidence/page-keys-1.1.5.json)):
on a MIDI and an audio track, each of the ten combinations is applied
natively from the Reverb page (the page under an open Euclidean) as a
reference, then pressed with Euclidean open; Euclidean must close and the
screen below the header must match. 1.1.4 fails at the first check. 1.1.5
passes all 233 checks on 1.53 and 1.54, standalone and with all six mods.
The earlier Euclidean UI, editing and playback regressions pass with the
same counts as 1.1.4, and both all-mods SysEx files cold-boot.

**Source parity** ([evidence/modwerk-source-parity.json](evidence/modwerk-source-parity.json)):
Modwerk's compile of this source links all 63 feature selections per OS
(126 in total) to the same MAIN as the native build, through Modwerk, in
reversed order, through the browser kit and with the native objects.

**Hardware** (sumedho, Digitakt 1, 2026-10-16, under 30 minutes): OS 1.53 and
1.54, with all six mods and with Euclidean alone. The page keys and FUNC
shortcuts leave Euclidean on audio and MIDI tracks, holding FUNC + AMP
reopens it, and settings survived project save/reload and a power cycle.
Reported working, with no failures. Tested SysEx:

| OS | All six mods | Euclidean alone |
| --- | --- | --- |
| 1.53 | `f84a7159a4c1054febb9aa566804bc5953507906625815b49fe55d9afabee6cb` | `b32f3bb8c7c56a7ff6d9e55b25e35895275d709d0c5ed9cd62ce958bd069aca0` |
| 1.54 | `4479e908e120e2ecb8890b62374355909303790208c8b83b17101704ea3e75fc` | `e7c3e4448a0fa42908756fe889957b3362e7eff97aa12223523583ec4c30c634` |

The sections below describe the 1.1.4 qualification; the rest of the
module is unchanged.
- All-mods SysEx used for the screenshots and the hardware test:
  - 1.53: `23503ca42478c1644dea5fd296893f628eafb6662d2ce5e291bfc591f045ae4e`;
  - 1.54: `257144e4a584172e470c3dde83d7ccda636eeb195b4e5ff0492b3ebc8bdfaba2`.
- All-mods MAIN: 1.53 `ce2c0bd03393ca5f7e9427874bad4f5daa32b7e5699ff003af5e6fc35573ab39`, 1.54 `14469be1cb112830aa283e034d90c9372135b3f6b3fb7d3b077202101f758017`.

## Core 2.1

This version runs on Core 2.1, the core Modwerk's catalogue ships. The code
is unchanged from the previous release, which used Elekloader Core 3.0; it now
names the firmware locations it uses itself instead of importing them from
Core 3.0. Core 2.1 patches the same 39 firmware sites as Core 3.0. The mods
now load at different addresses, so every image is new and was tested again.

## Emulator regressions

The 13 regression cases of the earlier 1.54 integration were run on both OS
releases against the Core 2.1 builds. Each run installs the build into a
booted stock snapshot and drives the native panel and sequencer. Records:
[evidence/regressions-core21.json](evidence/regressions-core21.json).

| Case | OS | Checks passed | Failed |
| --- | --- | --- | --- |
| cc-combined | 1.53 | 50 | 0 |
| euclidean-standalone | 1.53 | 54 | 0 |
| euclidean-combined | 1.53 | 59 | 0 |
| ram-standalone | 1.53 | 90 | 0 |
| ram-combined | 1.53 | 90 | 0 |
| accumulator-standalone | 1.53 | 31 | 0 |
| accumulator-combined | 1.53 | 41 | 0 |
| sample-standalone | 1.53 | 47 | 0 |
| sample-combined | 1.53 | 60 | 0 |
| playback-combined | 1.53 | 1 | 0 |
| editing-combined | 1.53 | 21 | 0 |
| accumulator-pattern-transitions | 1.53 | 6 | 0 |
| ram-allocation-failure | 1.53 | 31 | 0 |
| cc-combined | 1.54 | 50 | 0 |
| euclidean-standalone | 1.54 | 54 | 0 |
| euclidean-combined | 1.54 | 59 | 0 |
| ram-standalone | 1.54 | 90 | 0 |
| ram-combined | 1.54 | 90 | 0 |
| accumulator-standalone | 1.54 | 31 | 0 |
| accumulator-combined | 1.54 | 41 | 0 |
| sample-standalone | 1.54 | 47 | 0 |
| sample-combined | 1.54 | 60 | 0 |
| playback-combined | 1.54 | 1 | 0 |
| editing-combined | 1.54 | 21 | 0 |
| accumulator-pattern-transitions | 1.54 | 6 | 0 |
| ram-allocation-failure | 1.54 | 31 | 0 |

Both all-mods SysEx files also cold-boot to a live UI in the emulator.

## Screenshots

Captured on 2026-10-14 from the cold-booted all-mods SysEx files above, with a
cloned drive and native panel input; no runtime code or framebuffer
injection. Inputs, plans and PNG hashes are in `media/capture.json` and
`media/1.54/capture.json`. From the digiemu workspace:

```sh
.venv/bin/python tools/firmware/elemods/capture_submission.py \
  --firmware-dir <cold-booted all-mods directory> \
  --plan submissions/modwerk/plans/euclidean.txt --hle --out <new directory>
```


## CPU load

Measured in the emulator with `tools/firmware/elemods/measure_load.py`
(digiemu). Each run plays a fixed heavy pattern: 8 audio tracks trigger a
full-scale sample and 8 MIDI tracks send a note on every step, at 120 BPM.
Each mod's feature is switched on at its heaviest setting: retrig on all MIDI
tracks; Euclidean 16/16 on every track; ACC +1 on every audio track; RAM-R1
recording four steps of each pattern while RAM-P1 plays on seven tracks. The
audio render interrupt is timed for 3,000 blocks with the MCF5441x
instruction-timing model at 250 MHz. A block is 32 samples, 166,666 cycles.

| Build | OS | Average block | Worst block |
| --- | --- | --- | --- |
| Stock | 1.53 | 59.1% | 61.8% |
| Stock | 1.54 | 59.2% | 62.0% |
| MIDI Retrig | 1.53 | 59.5% | 68.4% |
| CC Assignment Names | 1.53 | 59.1% | 61.8% |
| Euclidean Sequencing | 1.53 | 59.1% | 61.9% |
| RAM Record and Playback 1.3.1 | 1.53 | 61.3% | 65.3% |
| Per-step Note Accumulator | 1.53 | 59.2% | 62.8% |
| Sample Snap and Crossfade | 1.53 | 59.9% | 62.6% |
| All six mods | 1.53 | 62.3% | 73.2% |
| All six mods | 1.54 | 62.4% | 73.3% |

These are relative estimates against stock under the same workload. Cache
misses, DDR latency and UI-task work are not included. They are not hardware
measurements. Per-run records: [evidence/cpu-load.json](evidence/cpu-load.json).

## Hardware

**Core 2.1 build, reported 2026-10-14.**

> ok fully tested on hardware and working

The author tested these Core 2.1 all-mods builds on a Digitakt 1, on OS 1.53
and 1.54, for about one to two hours in total, including project save and
reload and a power cycle. The SysEx files are the two listed at the top of
this report. Individual outcomes were not itemized, and standalone (single-mod)
hardware coverage is not claimed. Firmware was not read back from the device.
See [evidence/hardware-testing.json](evidence/hardware-testing.json).

An earlier session ran the same mod code on Elekloader Core 3.0, also with
all six mods on both OS releases: over five hours, including project save and
reload and a power cycle.

## Modwerk source build comparison

`scripts/build-elemod-packages.mjs` compiled this module, Machine Pages 1.2
and DT Support 1.0.1 for both OSes with GCC 16.2.0. `scripts/verify-elemod-matrix.mjs`
then checked them against the native Elekloader build of the same sources:
- every object matches semantically, apart from the non-executable `DT_OS154`
  selector and Sample Tools' added DIGISLICER conflict;
- all 63 feature selections per OS (126 in total), linked with the catalogue's
  Core 2.1, give the native MAIN byte for byte. That holds through Modwerk's
  linker, in reverse order, and through the vendored browser kit;
- the all-mods MAIN is `ce2c0bd03393ca5f…` on 1.53 and `14469be1cb112830…` on 1.54, the images in the SysEx
  files above.

See [evidence/modwerk-source-parity.json](evidence/modwerk-source-parity.json).

## Not tested

- Standalone (single-mod) hardware coverage was not itemized.
- Combinations with other catalogue modules were not checked.
- CPU load on hardware; the emulator figures exclude cache, DDR and UI-task work.
