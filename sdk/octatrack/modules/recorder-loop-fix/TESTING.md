# Recorder Loop Fix measurements

Recorded 7 October 2026. Version `0.1.0-experimental`, upstream `6f9e5bc9db0ae9fa99fa2f2a0f4de1fdb8e9a136`.

## Source identity

`evidence/source-identity.json` records source-only GNU assembly checks. The assembler is GNU Binutils 2.47.20260726. No stock image was read by the source oracle. All eight patches match their current declared pins at three ROM origins (24 comparisons); seven retain authored bytes and spacing has an independently tested Modwerk correction. The import record `../../../imports/recorder-loop-fix-6f9e5bc.json` binds the original and vendored source bytes; the original draft remains intact at `../../../drafts/recorder-loop-fix`; the released spacing correction changes the code and its declared pin.

## Reproduce the source-only measurements

Run the probe in the reviewed toolchain container with its network disabled, read-only root, dropped capabilities and a private temporary directory. Mount this checkout read-only at `/repo`, the SDK emulator CMake build at `/native`, and its pinned vendor directory at `/vendor`. Use `--tmpfs /tmp:rw,exec,nosuid,nodev,size=128m` for the temporary compiled probe. Mount a new private output parent at `/results`. The inner command is:

```sh
python3 /repo/sdk/octabam/modules/recorder-loop-fix/qualification/run.py \
  --emulator-build /native --vendor /vendor --output /results/recorder-loop-fix
```

The CMake build uses this checkout's `sdk/octabam/tools/emu/ot_emu`, with mc68k revision `4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`. GNU source checks read manifest literals with AST and never import the declaration. The runner compiles `qualification/probe.cpp`, loads only authored instructions and deletes all binaries automatically. It writes sanitized `source-identity.json` and `probes.json`. Exit 0 is a behavioral pass; exit 2 preserves a measured qualification failure. A nonzero exit must not be hidden by a shell pipeline. No firmware is needed for these probes.

Before measuring, four port regressions passed: `emac`, `periph`, `mc68kColdFireTimingTest`, `mc68kColdFireDivideTest` (4/4 via CTest).

## Native execution measurements

`qualification/probe.cpp` executes the actual assembled instructions in the reviewed ColdFire port, not a reimplementation of the algorithms. It loads only authored assembly bytes. `evidence/probes.json` records the assertions and path maxima.

| Path | Cases | Instructions max | Model cycles max | V4 core bound | Extra stack bytes max |
|---|---:|---:|---:|---:|---:|
| hold_copy.s | 108 | 34 | 59 | 544 | 12 |
| hold_guard.s | 108 | 29 | 40 | 464 | 12 |
| hold_xfade_a.s | 108 | 34 | 60 | 544 | 20 |
| hold_xfade_b.s | 108 | 34 | 59 | 544 | 20 |
| hold_xguard.s | 108 | 39 | 57 | 624 | 12 |
| seek-counter | 2 | 5 | 13 | 80 | 0 |
| seekbind | 2 | 5 | 10 | 80 | 0 |
| spacing | 555008 | 128 | 1007 | 2400 | 44 |
| spacing-late-arm | 13279 | 128 | 1007 | 2400 | 44 |
| spacing-fractional-and-uint32 | 1244352 | 128 | 1007 | 2400 | 44 |
| spacing-outside-supported | 6 | 21 | 91 | 358 | 40 |

Model cycles use mc68k `4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`, its MCF5206E timing model, cache-hit and zero-wait assumptions. They are not MCF5445x wall-clock measurements. V4 core bounds charge 16 cycles per ordinary instruction and 38 per long divide: a deliberately conservative envelope over the actual supported forms, branch misprediction, return prediction and up to three pipeline stalls per instruction. Sources use aligned data except documented stock accesses. The basis is [MCF54455 Reference Manual](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf), section 3.3.5, tables 3-12 through 3-20 (long divide <=35, return <=9, conditional branch <=8, MOVEM at most six registers in these hooks). External stock function bodies, their stack, cache misses, memory-bus waits, interrupt nesting and allocation contention are excluded, so the bound must not be presented as a complete interrupt deadline measurement.

Spacing tests cover every integer BPM 30..300, RLEN 1..64, all eight track indices and 32 successive arm phases: 555,008 cases. An independent next-arm oracle asserts each of the first 32 ideal phases, balanced stack and restored scratch registers. Each hold path runs 108 cases covering END-1/END/END+1, forward/zero/reverse counts, recorder/ordinary buffers, mapped/empty fetches and successful/unmapped/zero-count fallback callbacks. Seek and counter tests exercise both same/different sample paths. The fetch callback is a synthetic fixture; actual stock fetch cost and audio continuity are separate full-project tests. A further 1,244,352 cases cover every tempo24 tick 720..7200, every RLEN 1..64, and consecutive phases immediately below uint32 overflow. Six unsupported-range cases preserve the displaced stock length. Post-wrap continuity, swing/speed/scale, memory reallocation, repeated restart and audio output remain unmeasured.

## Long-run spacing correction

The original draft failed 953 of 13,279 ideal consecutive-arm cases. Its original failed report remains in `../../../drafts/recorder-loop-fix/evidence/probes.json`. The released code replaces the drifting `arm/q` phase estimate with an overflow-safe constant-time inverse. All 13,279 long-run cases now pass (including all 1,897 RLEN-16 cases), as do all 555,008 early-arm cases. Supported fixed RLEN is 1..64 at 30..300 BPM. Outside this range the original length is retained. This oracle result establishes arithmetic behavior for consecutive arms; physical audio continuity remains unmeasured.

## Memory

Authored and corrected code: 858 bytes; relocated tables: 0 bytes. No extra DSP code or owned audio pool is declared. Probe stack peaks cover the module and synthetic callback return frames; they exclude stock callback stack and the surrounding caller. Recorder state and audio blocks are stock-owned. The eight patches read existing voice/recorder metadata and invoke the original fetch routine; eleven pool-base literals must follow the common builder allocation. These counts are not a complete placement/lifetime inventory. `evidence/local-image.json` identifies the locally composed standalone image used for captures; it does not assert common-builder parity.

The locally composed image's exact range ledger is [evidence/memory-layout.json](evidence/memory-layout.json): 718 bytes of code/tables plus 424 bytes of alignment gaps, 1142 bytes from first allocation to last end. These are exact for that local layout; complete stock lifetimes and callback stack remain null.

## Upstream hardware reports

Upstream reports Sam Banks on MKII image OCTABAM83 for the first three fixes on 12 September 2026, and Bryan T on MKII sos-capture build 95 for all eight patches on 3 October 2026. They do not qualify this newly composed Modwerk image. Current-image physical hardware testing is not claimed. A read-only CoreMIDI inventory returned no exposed sources or destinations on this machine.

## Current release limits

Hardware frame timing, full-project audio/stress, persistence/recovery and physical canaries have not been measured. Model bounds cover added source paths and stack changes; inherited stock callback timing and stack remain outside those bounds. Publication uses the owner's exact-source approval for absent hardware evidence. The frozen baseline is unchanged. Native/browser composition is recorded separately in `../../../native-comparisons/recorder-loop-fix.json`.

Native source and firmware execution ran in a disposable Docker container, with network disabled, read-only root, no credentials, dropped capabilities and private scratch inputs. Only sanitized JSON, original probes and reviewed LCD PNGs may enter the repository.

## Published software integration, 7 October 2026

The original staged source and its historical measurements remain under sdk/drafts/recorder-loop-fix. This module folder contains the released adaptation. The current native probe is `evidence/probes.json`; its source-only runner exits 0. Both native and browser builders support the module, with stock guards, ROM-space refusal and native composition comparisons. Existing LCD captures retain their original image provenance; the release uses the same stock pages and controls. No new physical evidence or audio result is claimed.

Corrected spacing: all 555,008 early and 13,279 long-run cases pass, with zero ideal-gap mismatches. The corrected code uses 44 additional stack bytes and peaks at 128 executed instructions / 1007 MCF5206E model cycles / 2400 conditional V4 cycles per spacing event. The seven other cave sources retain author bytes. The original failed oracle report describes the draft snapshot, not this corrected source.

`evidence/performance.json` preserves conditional/model event costs. Stock frame-load measurements, physical flood stress, full callback/audio behavior and current hardware remain absent. The exact-source owner approval waives missing hardware evidence only.
