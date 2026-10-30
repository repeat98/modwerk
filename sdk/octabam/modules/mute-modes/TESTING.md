# Mute Modes measurements

Recorded 7 October 2026 for `0.1.0-experimental`; 0.2.0, 0.2.1 and 0.2.2 below, upstream `6f9e5bc9db0ae9fa99fa2f2a0f4de1fdb8e9a136` (0.2.2: sambanks/octabam `08bffd529c0f301708bcb2d48759e54e11f59858`).

## 0.2.2: SHADOW out of the stock timestretch task's SRAM (27 October 2026)

- **The change.** Hook 1 (`pre`) keeps a one-byte silenced set, SHADOW. Until 0.2.1 it was SRAM `0x80006c66`, inside the work area of a stock ColdFire task that runs the timestretch splice search and transient detection while tracks play, and refills that area with audio on every grain. In OTFX an audio byte read back as the previous frame's silenced set could swallow a newly muted track's note-off, so the mute did not take; and `pre`'s per-frame write landed in the task's search window. SHADOW is now a byte inside `mm_softmute`, right after KEYMASK (it takes KEYMASK's alignment pad, so the SC_KEY unit stays 1086 bytes). Every SHADOW operand is absolute long, so only those seven operands and, in the plain unit, the new byte and its pad (968 to 970 bytes) differ from 0.2.1. sambanks/octabam pins the same change at `a1e0288` (PR #928).
- **Source.** `patch_softmute.s`, `patch_mutemode.s`, `manifest.py` and `runtime.json` are the author's files byte for byte at Zac-Kyoti/octatrack-kyoti-fw `c5b24d0763698c6775757cce15b6971af952bfb3` (`modwerk-modules/mute-modes/`, the author's Modwerk copy: 0.2.1's sources with Modwerk's `MODWERK_EVENTS` blocks, plus this change). `sdk/imports/mute-modes-c5b24d0.json` records their Git blobs and SHA-256s. Assembled without `MODWERK_EVENTS`: plain softmute `ca7792be…` (970 bytes at 0x400d7400), SC_KEY softmute `9be6df77…` (1086 bytes at 0x400d74e4), menu `4c6702aa…` (unchanged), the `reference` hashes in `manifest.py`.
- **Native probe.** `qualification/run.py` with this version's references; `probe.cpp` now clears the unit's SHADOW byte before each frame case instead of the SRAM address. 3,170,412 cases pass, with the same instruction counts, model cycles, core-cycle bounds and stack peaks as 0.2.1 on every path (`evidence/probes.json` is unchanged; `evidence/source-identity.json` names the new references). Emulator build: this checkout's `sdk/octabam/tools/emu/ot_emu`, mc68k `4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`, in the reviewed container.
- **Tested image.** A static native octabam build of this module alone with every stock effect kept (`scripts/export-composition-proofs.py --select mute-modes:true --image-dir`, in the `modwerk-source-tools` container, from Modwerk commit `0d0566ff5d060a7f1272a2b0bdf7ee81a53f9ebb`): MAIN OS SHA-256 `446ece69c1fcf7d19a2c726d8fa1029f218e01780e3ac4c194d4c9a61e527573`, `mm_softmute` placed at 0x400d6b80 with SHADOW at 0x400d6f48, and no word of the image points into the stock task's area. Wrapped for the card with Elektron's firmware tool, OS VERSION `MW_MM022`: card file SHA-256 `ebc5c3e3bd95f15f13928338258cb4e5e511736507f54ea2a41c5bacebdcbbb4`. The captures and the hardware report below are on this image. Under the octabam port (route A, OT DEMO project) the author's logic check passes on it: OT keeps SHADOW at 0 and never writes the old address; OTFX with T2 muted gives one note-off for T2; with `0xff` poked into the old address (what the timestretch task can leave) a following mute of T3 still gets its note-off.
- **Screenshots.** Re-captured on the tested image with `scripts/capture-module-ui.py` and 0.1.0's plan (`media/capture.json`); the pages are unchanged.

### Hardware report (MKI, 27 October 2026)

The author flashed the card image above on his Octatrack MKI and used it for about ten minutes. He reported every step passing:

- PROJECT > SYSTEM > PERSONALIZE: MUTE MODE sits after PREVIEW WITHOUT FX and cycles OT, OTFX, OTFX-T and DT-T.
- In each mode, muting and unmuting audio tracks while a pattern plays behaves as described: OT the stock cut; OTFX the dry cut with FX tails; OTFX-T the same with new trigs suppressed; DT-T the sounding note playing out on its amp envelope.
- Solo in OTFX silences the other tracks the OTFX way.
- With timestretched loops (TSTR AUTO or NORM) on several tracks, 20 to 30 mutes and unmutes in OTFX of one of them all took.
- Part save and reload, and project save, load and reload, keep the behaviour and the MUTE MODE setting.
- MUTE MODE survives a power cycle.

### Not tested in 0.2.2

- An MKII; the USB package on a unit; Mute Modes beside Sidechain Compressor or other modules on a unit.
- Chip timing, frame-interrupt load or a stress run. The cycle figures in `tests.qualification` are conservative V4 core-path bounds from the probe, not wall-clock measurements.
- `sdk/machines/octatrack/module-adapters/loader_mute_keep_fixture.cpp` still seeds and reads SHADOW at `0x80006c66`; its test runs only with a private stock image and the native emulator archives, and was not run for this version.

## 0.2.1: ev_mute_keep and the install-time MUTE MODE restore (prepared 14 October 2026, not released)

- **Native builds unchanged.** Every addition is under `MODWERK_EVENTS`. Assembled without it (`m68k-elf-as -mcpu=54455`, GNU Binutils 2.46) and linked at the author's addresses: plain softmute `d56d848e…` (0x400d7400; also `-mcpu=5407`), SC_KEY softmute `8814aa2c…` (0x400d74e4), menu `4c6702aa…` (0x400d7800), the `reference` hashes in `manifest.py`.
- **One package for every combination.** The events form always assembles the SC_KEY exemption (Session 116), and `p1_key` takes its tracks from `modwerk_raise_ev_mute_keep()` (sdk/machines/octatrack/EVENTS.md) instead of scanning for COMPRESSOR's KEY: whichever installed module reads a track's audio answers. Its `runtime.json` raises `ev_mute_keep`: the package asks for the base's entry by the event's hook index (order 255, `RUNTIME_RAISE`) and the loader writes it into the zero word `raise_ev_mute_keep` at install, so the same bytes install on any base that has the event.
- **MUTE MODE after a power cycle.** The kept set is reinstalled from the card after boot, when boot's 'ANDY' restore (0x4001fb24, inside the boot routine) has already run with stock's length 0x64, so `GATE` (0x800000dc) was never restored. `mm_restore` (`module_tick` in `runtime.json`) copies it once per install from its battery shadow 0x100fff6c. By then the block is valid: boot checks its checksum and writes the defaults (GATE 0) when it fails, and while the module is absent stock only clears 0x100fff6c with the rest of the block (defaults), after which GATE 0 is what boot would restore. The three pokes stay: they keep the other mirror paths (0x4001f322 defaults, 0x4001f3be validate) covering GATE while the module is installed.
- **PERSONALIZE roots, cursor and widgets** (read from a private disassembly of the user's 1.40C; addresses only). The three arrays are read only inside 0x40068e00..0x4006907c (renderer, count function, key handler). The menu descriptor at 0x400cbe9c (index 12 of the table at 0x400cbdac) is entered only through 0x40064e20, which calls its init first; init (0x40068fa8 → 0x4007ec60) sets the row count and clears the list's top, cursor and scroll (0x460e4668..0x460e4678). Opening the SYSTEM window starts at index 1. So a cursor left on the inserted row or on LED BRIGHTNESS is never read after removal until the next open resets it. Install and removal are refused while the window is open on index 12 and while a paused task holds an address in the arrays, the consumer range or the old image (table_admission.c, TABLE_MUTES; loader_table_fixture.cpp).
- **Removal.** The pokes go back to 0x64; GATE keeps its last value in RAM, which stock never reads; the battery shadow keeps the setting for the next install.
- **Emulator comparison** (`sdk/tests/test_mute_modes_runtime.py`, `loader_mute_keep_fixture.cpp`, 14 October 2026; synthetic mute/solo/mode words, per-track DSP records, battery shadow and a note-off stub at 0x40008f84): 405 scenarios, 5,314 checks, 0 failures. For MUTE MODE OT, OTFX-T, DT-T and OTFX, five mute/solo states and four KEY layouts, hook 1 (frame word, SHADOW, REL_STATE, note-offs, VOL words of both record halves) and every single- and all-track fresh-voice bind match the raw plain build when nothing answers `ev_mute_keep`, and the raw SC_KEY build when a provider running Sidechain's KEY scan does, in either install order, KEYMASK included. The first tick after an install restores GATE from the shadow once (3, then unchanged by a later shadow change; a value set afterwards stays). The raw plain packet built here is `d45a1b21…`, the held 0.1.0 packet; the subscriber packet `a48be767…` (2,706 bytes, image 1,516, 14 sites) is the same whether built for the fixture's base or prepared against a private `--site-events` base (native/base guards pass; the strict run scan passes with the hook-word array zeroed, see the lane report). Receipts: private.
- Not run: hardware, audio, a physical power cycle, a real Sidechain package answering the event.

## 0.2.0: the fresh-voice-bind event (prepared 14 October 2026, not released)

- **Native builds unchanged.** `patch_softmute.s` assembled without `MODWERK_EVENTS` (`m68k-elf-as -mcpu=54455` and `-mcpu=5407`) gives the same `.text` bytes and relocations as 0.1.0; linked at the author's addresses the plain unit is `d56d848e…` (0x400d7400) and the SC_KEY unit `8814aa2c…` (0x400d74e4), the `reference` hashes in `manifest.py`.
- **Runtime package.** `runtime.json` replaces the `fresh_bind` detour with `mm_voice_bind`: it enters `fresh_bind` on the stock function's own frame, and `FB_BACK`/`FB_EPILOGUE` become two returns (0 pass, 1 drop) that pop its displaced pushes as stock's epilogue would. The package has 14 sites (was 15) and one hook word; a base without site events refuses it. Its build needs the runtime-unit adapter to assemble with `MODWERK_EVENTS` after the native reference check (loader-integration `runtime_units.py`).
- **Emulator comparison** (loader-integration `loader_events_fixture.cpp`, 14 October 2026; synthetic mute/solo and MUTE MODE words): for MUTE MODE OT, OTFX-T, DT-T and OTFX, two muted tracks, single-track and all-track resets, the 0.1.0 raw package on a base without events and this package on an events base start exactly the same voices. Beside POLY8's subscribers, in either install order, a muted track's reset is dropped and POLY8's extension voices are kept, as in the native POLY8 + Mute Modes composition. The 0.1.0 package is refused on an events base (`RUNTIME_EVENT`).
- Not run: hardware, audio.

## Source identity

`evidence/source-identity.json` records source-only GNU assembly checks. The assembler is GNU Binutils 2.47.20260726. No stock image was read by the source oracle. The plain softmute, SC_KEY variant and menu hashes all match the author references. The import record `../../../imports/mute-modes-6f9e5bc.json` binds the original and vendored source bytes; only guard handling and attribution change in the declaration.

## Reproduce the source-only measurements

Run the probe in the reviewed toolchain container with its network disabled, read-only root, dropped capabilities and a private temporary directory. Mount this checkout read-only at `/repo`, the SDK emulator CMake build at `/native`, and its pinned vendor directory at `/vendor`. Use `--tmpfs /tmp:rw,exec,nosuid,nodev,size=128m` for the temporary compiled probe. Mount a new private output parent at `/results`. The inner command is:

```sh
python3 /repo/sdk/octabam/modules/mute-modes/qualification/run.py \
  --emulator-build /native --vendor /vendor --output /results/mute-modes
```

The CMake build uses this checkout's `sdk/octabam/tools/emu/ot_emu`, with mc68k revision `4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`. GNU source checks read manifest literals with AST and never import the declaration. The runner compiles `qualification/probe.cpp`, loads only authored instructions and deletes all binaries automatically. It writes sanitized `source-identity.json` and `probes.json`. Exit 0 is a behavioral pass; exit 2 preserves a measured qualification failure. A nonzero exit must not be hidden by a shell pipeline. No firmware is needed for these probes.

Before measuring, four port regressions passed: `emac`, `periph`, `mc68kColdFireTimingTest`, `mc68kColdFireDivideTest` (4/4 via CTest).

## Native execution measurements

`qualification/probe.cpp` executes the actual assembled instructions in the reviewed ColdFire port, not a reimplementation of the algorithms. It loads only authored assembly bytes. `evidence/probes.json` records the assertions and path maxima.

| Path | Cases | Instructions max | Model cycles max | V4 core bound | Extra stack bytes max |
|---|---:|---:|---:|---:|---:|
| dispatch | 57344 | 21 | 37 | 336 | 12 |
| frame-mode-0 | 131072 | 13 | 26 | 208 | 16 |
| frame-mode-1 | 131072 | 118 | 210 | 1888 | 24 |
| frame-mode-2 | 131072 | 30 | 52 | 480 | 16 |
| frame-mode-3 | 131072 | 127 | 170 | 2032 | 24 |
| fresh-bind | 57344 | 22 | 33 | 352 | 8 |
| menu-get | 54 | 12 | 26 | 192 | 0 |
| menu-set | 54 | 24 | 46 | 384 | 0 |
| mt-trig | 57344 | 21 | 34 | 336 | 4 |
| rebind | 57344 | 20 | 32 | 320 | 0 |
| sidechain-frame-mode-0 | 65536 | 13 | 26 | 208 | 16 |
| sidechain-frame-mode-1 | 65536 | 200 | 382 | 3200 | 24 |
| sidechain-frame-mode-2 | 65536 | 136 | 232 | 2176 | 20 |
| sidechain-frame-mode-3 | 65536 | 209 | 342 | 3344 | 24 |
| sidechain-fresh-bind | 2097152 | 17 | 35 | 272 | 8 |
| trig-flag | 57344 | 19 | 30 | 304 | 0 |

Model cycles use mc68k `4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`, its MCF5206E timing model, cache-hit and zero-wait assumptions. They are not MCF5445x wall-clock measurements. V4 core bounds charge 16 cycles per ordinary instruction and 38 per long divide: a deliberately conservative envelope over the actual supported forms, branch misprediction, return prediction and up to three pipeline stalls per instruction. Sources use aligned data except documented stock accesses. The basis is [MCF54455 Reference Manual](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf), section 3.3.5, tables 3-12 through 3-20 (long divide <=35, return <=9, conditional branch <=8, MOVEM at most six registers in these hooks). External stock function bodies, their stack, cache misses, memory-bus waits, interrupt nesting and allocation contention are excluded, so the bound must not be presented as a complete interrupt deadline measurement.

Plain frame probes cover every combination of eight-bit mute and solo masks, all four modes and both SOLO_FLAG states. They assert preserved CUE bits and d0-d3, balanced stack and the exact OTFX dry-gain words in both frame banks. Dispatch/rebind tests cover every mute mask, seven solo edge masks and every audio track, including the caller d3 preservation fix. Setter tests cover valid/corrupt values, both deltas, clamp/wrap, label translation and battery-shadow writes. Sidechain probes cover every key/mute mask in all modes and 2,097,152 fresh binds. Stock note-off and per-machine callbacks are synthetic returning fixtures; real envelopes and FX-tail audio still need full-project rendering.

## Memory

Authored code: 1176 bytes; relocated tables: 204 bytes. No extra DSP code or owned audio pool is declared. Probe stack peaks cover the module and synthetic callback return frames; they exclude stock callback stack and the surrounding caller. Reused state includes the 4-byte PERSONALIZE gate, 4-byte battery shadow, 1-byte frame shadow and existing release mask. The SC_KEY variant adds a key-mask byte to its ROM unit, writable after load. These counts are not a complete placement/lifetime inventory. `evidence/local-image.json` identifies the locally composed standalone image used for captures; it does not assert common-builder parity.

The locally composed image's exact range ledger is [evidence/memory-layout.json](evidence/memory-layout.json): 1380 bytes of code/tables plus 224 bytes of alignment gaps, 1604 bytes from first allocation to last end. These are exact for that local layout; complete stock lifetimes and callback stack remain null.

## Upstream hardware reports

Upstream records author MKI use of the standalone and KYOTI builds, and an octabam SIDECHAIN_COMPRESSOR build on 4 October 2026. These reports describe upstream images, not hardware testing of this Modwerk import. Current-image physical hardware testing is not claimed. A read-only CoreMIDI inventory returned no exposed sources or destinations on this machine.

## Current release limits

Hardware frame timing, full-project audio/stress, persistence/recovery and physical canaries have not been measured. Model bounds cover added source paths and stack changes; inherited stock callback timing and stack remain outside those bounds. Publication uses the owner's exact-source approval for absent hardware evidence. The frozen baseline is unchanged. Native/browser composition is recorded separately in `../../../native-comparisons/mute-modes.json`.

Native source and firmware execution ran in a disposable Docker container, with network disabled, read-only root, no credentials, dropped capabilities and private scratch inputs. Only sanitized JSON, original probes and reviewed LCD PNGs may enter the repository.

## Published software integration, 7 October 2026

The original staged source and its historical measurements remain under sdk/drafts/mute-modes. This module folder contains the released adaptation. The current native probe is `evidence/probes.json`; its source-only runner exits 0. Both native and browser builders support the module, with stock guards, ROM-space refusal and native composition comparisons. Existing LCD captures retain their original image provenance; the release uses the same stock pages and controls. No new physical evidence or audio result is claimed.

Both plain and SC_KEY variants retain their author hashes. Menu insertion preserves LED BRIGHTNESS as the final MKII-only row. The shared builder selects the sidechain variant automatically. Maximum observed path: 382 model cycles; conditional path bound 3344; additional stack peak 24 bytes.

`evidence/performance.json` preserves conditional/model event costs. Stock frame-load measurements, physical flood stress, full callback/audio behavior and current hardware remain absent. The exact-source owner approval waives missing hardware evidence only.
