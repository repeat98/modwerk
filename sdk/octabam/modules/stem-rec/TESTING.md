# Stem Rec: tests and measurements

Version 0.1.0-experimental, source `yvesrosius/octabam` `00a23502a9e3ce8264888026a2b6764e7f52a3be` (`modules/stems`), card build only. Every result names the build it ran on. "Not tested" is a result.

## 1. Hardware (functional report)

Yves Rosius, Octatrack MKII, 5 November 2026. Image STEMMW1: Stem Rec alone on the original OS 1.40C, built natively from this source with the vendored octabam toolchain and packed with `elektron-firmware-tool` and `tools/build/make_bin.py`:

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `OCTATRACK_STEMMW1.bin` (flashed) | 454,608 | `6618b45173de86d012fda10d1868aaec1001c281a5c93fc18024a504f56e4caa` |
| `OCTATRACK_OS1.40C_STEMMW1.syx` | 635,010 | `f4c6eb3b884975a91f014d71fda99307eb5416f1f20cf05834cdffafc8b3ae83` |
| MAIN OS image inside both | 1,121,128 | `9a7e1784f9613a66d4957b01911bcc89f24d6a6638a6e29765a90adc923045b2` |

The `.syx` unpacks (`-d 3`) to that MAIN OS image byte for byte, and the decoded `.bin` holds the same container.

Two takes, eleven files each at 24 bits (T1 to T7, MAIN, CUE, AB and CD, both pairs stereo), on Yves's project of Static tracks playing from the card, both ended by stopping the sequencer:

| Take | Length | Status | Ring peak | Card while recording | Hook mean, longest | Hook and stock frame routine, longest |
| --- | --- | --- | --- | --- | --- | --- |
| `261105-1722` | 32,588 frames, 11.8 s | OK | 2,317 of 7,922 frames (29%) | 274 µs a KB | 28, 53 µs | 102 µs |
| `261105-1723` | 8,492 frames, 3.1 s | OK | 2,539 of 7,922 frames (32%) | 237 µs a KB | 29, 53 µs | 104 µs |

- Every WAV's header is right and its length is the log's frame count (16 samples a frame); each has its `.ot`, and each take its `STATS.TXT` log.
- STEMS opened with UP + REC, and YES on STEM REC armed the take. A double YES on the main page did stock's ARM ALL only.
- The track files weren't checked against MAIN. Every take of this project leaves T8 out, which STEM REC does when MASTER TRACK is on; then MAIN is T8's output and the tracks can't sum to it (inferred, not confirmed). A take of the same sources on the upstream build (STEMS13) differs from MAIN the same way.

Limitations: two short takes; the maximum configuration (fourteen files), a take of T1 alone and a reboot were not run on the unit; MKII only.

## 2. The card build under the emulator (`verify.py`)

5 November 2026, this branch, the vendored octabam toolchain and the emulator from `npm run upstream:tools` (octabam `5f8e779`, `make emu-cf`). Native builds as `scripts/export-composition-proofs.py` makes them (static stock, the stock FX2 entries kept, fallback NONE), on the original MAIN OS (SHA-256 `164f31224bf6…`).

| Check | Result |
| --- | --- |
| Stem Rec alone builds | PASS |
| It boots to the handoff: the loader's entry once, its fatal hang never | PASS |
| Its DRAM runtime, 23,210 bytes at `0x40a955e0`, reads back equal to the link | PASS, 0 bytes differ |
| `stems_gtab` (`0x40a97750`) holds the OS's gain table, 774 bytes at `0x400ea18a` | PASS, SHA-256 `9d1ffe6a1d21…`, the OS table's |
| The ring, stack and buffer lie in the reserve, clear of the runtime and its BSS | PASS |
| It builds beside APPLY SCENE | PASS |
| It builds beside TUNER | PASS |
| It builds beside USB AUDIO OUT TRACKS MAIN CUE | PASS |
| That pair boots to the handoff | PASS |

Run once with the stock copies removed from the manifest, the gain-table check alone failed (the table read zero, SHA-256 `c12a5472cf30…`): the builder doesn't refuse an unfilled placeholder, so this check guards it.

What the emulator can't see: a take. It has no cache, no memory timing and no card speed. Recording, the menu and the card writer are covered by the pinned source's own gates (`verify_stems`, `verify_stems_units`, `verify_stems_menu`) and by section 1.

## 3. Worst-case ColdFire cycles

Per audio block: 16 samples at 44,100 Hz, 362.8 µs, 95,782 cycles of the 264 MHz core. One instance.

- **Measured (section 1), eleven files at 24 bits:** the frame hook's longest frame was 53 µs, **13,992 cycles**. With the stock frame routine that follows it in the same interrupt, 104 µs (27,456 cycles) at most.
- **The maximum configuration, every source at 24 bits (fourteen files), estimated:** the emulator counts the hook at 4,468 instructions a frame there and 4,032 for the eleven measured files (the source's cost gate, `verify_stems.py` `hook_cost`, at `00a23502`, 400 frames each, faders at rest). Scaled by that ratio, 58.7 µs, **15,505 cycles**, 16% of the block; with the stock frame routine, about 110 µs. This is an estimate from the measured case, not a measurement.
- **The idle hook** (STEM REC loaded, not recording): 396 instructions a frame (the gain mirror).
- **Branches:** a fader that moves takes its track's ramp path, about 100 instructions more on that frame; a track whose gain can exceed unity takes the limited loop (one compare a sample on the common path). the source's unit tests drive every loop form, rails included (`verify_stems_units`).
- **Not in the block:** the writer task streams the rings to the card outside the interrupt, waiting on the card; its sleeps and writes are in each take's log.

## 4. Exact memory

From the card build's `layout.json` and the runtime's link (`m68k-elf-size`, `m68k-elf-nm`), every allocation in SDRAM, in bytes:

| Region | Bytes | Where |
| --- | --- | --- |
| The DRAM unit: code, state, gain queue and gain table (`.text`; no BSS) | 23,210 | `0x40a955e0`..`0x40a9b08a` |
| `stems_ring`: the take's per-file rings | 8,388,608 | `0x40c95de0`, top of the reserve |
| `stems_stack`: the writer task's stack (peak seen 1,560) | 8,192 | `0x40c93de0` |
| `stems_buf`: fourteen 512-byte sector-0 copies, 512-aligned | 7,168 | `0x40c92000` |
| Padding between `stems_buf` and `stems_stack` | 480 | |
| The platform loader and packed unit appended to the image | 8,568 | `0x4010fdf0` |
| The four rewritten hook sites in stock code | 28 | |
| **Stem Rec's own** | **8,436,254** | |
| The rest of the platform reserve, given up from Flex sample RAM | 2,060,150 | `0x40a9b08a`..`0x40c92000` |
| **In all** | **10,496,404** | |

The platform reserve is 10,487,808 bytes (`0x40a955e0`..`0x41495de0`), created by any DRAM module and shared with the others. During boot the packed stage (8,336 bytes at `0x40a9c000`) sits in its unused part and is freed after depacking. No heap. The stack peak is from emulator runs of the source (8 October 2026); no canary was measured on hardware.

## 5. Native and browser builds compared (`npm run module:verify`)

PENDING.

## Not tested

- The fourteen-file maximum configuration, a take of T1 alone and a reboot, on the unit.
- An MKI.
- USB install, Keep, Undo and removal: not offered (card build only).
