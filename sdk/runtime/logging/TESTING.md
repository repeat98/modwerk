# Core logger verification

Verified locally on 3 October 2026. Machine-readable fingerprints and numerical regions are in [evidence/verification.json](evidence/verification.json). That file contains no firmware, captured RAM, card image or extracted stock code. The local stock input is identified only by SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.

| Check | Result and scope |
| --- | --- |
| `sh sdk/runtime/logging/tests/run_host.sh` | Pass, Apple Clang/C99 with warnings as errors. Ring overflow, wraparound, header corruption, validated same-configuration recovery, strict text/CRC, bounded snapshots, deferred/error saves, concurrent append, failure backoff, all transport/recorder/USB/task gates, short writes/close/readback failures, file ownership, alternating preservation, full/prefix/shrinking writes. No firmware. |
| `python3 sdk/runtime/logging/package.py --output …` | Pass, m68k-elf GCC 16.2.0 / binutils 2.47. Original sources only; stock replay spans remain zero. Committed package inventory and placeholders are checked by the domain suite. |
| Native core-only probe vs browser composition functions | Byte-identical GNU-linked runtime, configuration identity, packed payload and native loader append. Runtime 66,204 bytes; total core reservation 98,304 bytes. The final 8,192 bytes are excluded from runtime/staging. Exact addresses are in the evidence. This is Node execution of the browser code, not an actual browser-worker full-image proof. |
| `node scripts/verify-core-logger-native.mjs <own-main-os> <new-private-output>` | Nine runtime link cases match GNU bytes and symbols: core only, Tape Echo, Euclid, Tape Echo+Euclid, Analog BD, Scale Quantizer, USB Audio, Quantizer+USB Audio and all five together. Three cases containing the existing uncompiled MIDI Scenes update refuse the stale version. Metadata/staging bounds checked. No DSP execution. |
| Isolated MKII emulator, core-only image and synthetic 64 MiB FAT16 card | M6a boot gate PASS. A real engine directory job wrote a complete 32,768-byte checkpoint with valid CRC and an empty module list. 65 sectors written, including metadata. A subsequent 2,000 ms idle interval wrote zero additional sectors. The unrelated sentinel file remained byte-identical. |
| No-card boot of the delivered `OCTALOG02` .bin | M6a gate PASS with no card attached. Continued for 2,000 ms, then panel inputs and another 2,000 ms. Mount kind stayed 0, the logger ring initialized with its BOOT record, and flushed-head stayed 0. Verified the delivered update and MAIN OS hashes before this check. This does not test physical insertion/removal or stock filesystem timeouts. |
| Earlier directed prefix-write probe, same file-writer source | Two first-use writes: 99 sectors (create) then 65 sectors. Reusing a slot with 1,318 meaningful text bytes added four sectors including metadata. Both checkpoints retained valid CRCs. Flush request and clock were explicitly driven by the test; this is not normal-workload timing evidence. |
| Website and API | Shared parser accepts C-generated v2 plus legacy v1 and rejects malformed/binary/torn/edited checkpoints. Service tests cover required-log escape reasons, GitHub creator mention, separate browser/device configurations, retry and signed webhook handling. |
| Browser report flow | Actual rendered desktop/mobile form checked with synthetic logs and a local fake backend. Attachment preview, 390 px layout, successful submission, focused confirmation and GitHub fallback link passed. The embedded test browser blocked the new tab, exercising the fallback. No real issue or upload was created. |
| Owner test report, 3 October 2026 | The owner reports successful testing of the stock OS plus logger build and supplied a v2 log showing stock chooser configuration, engine/track/card/USB activity and two boot sessions. Model, duration, worst-case timing and stress workload were not supplied. This is a functional owner report, not a completed stress qualification. |

The emulator/native checks were explicitly authorized logger-only exceptions to the ordinary firmware test restriction. They ran without network or credentials, with private-file reads restricted and writes confined to a disposable directory. Stock, linked runtime/loader images, emulator/card files and intermediate inherited USB descriptors must remain local and temporary.

## 0.3.0: the frame guard (28 October 2026)

Local runs on the stock input above (hashes only). None of this is hardware evidence.

| Check | Result and scope |
| --- | --- |
| `sh sdk/runtime/logging/tests/run_host.sh` | Pass, with the new `guard_test.c`: a POLY8 track rendering half a frame twice a frame is silenced on some renders while the stock track beside it renders every time; a light one never is; `FM` and `S2` are guarded, `AB`, an unsigned slot, a THRU track with stale bytes and an unloaded bank pointer are not. |
| `package.py` | Main's 0.2.0 sources rebuild byte-identical to the committed package (`09ff4b32…`) with the same toolchain; 0.3.0 compiles from original source, replay spans zero. |
| `node scripts/verify-core-logger-native.mjs` | 12 native link cases match GNU bytes and symbols. |
| `composeStaticOs`, ten selections | Core only, POLY8, FM Synth, VECTOR, the three together, USB Audio + POLY8, Mute Modes + FM Synth, Analog BD, Analog BD + POLY8 + FM Synth, and #1015's eight modules: every image composes with all four sites patched. Standalone MIDI Scenes too; the loader path still refuses POLY8 + FM Synth as before. |
| USB beta base (`npm run octatrack:base -- --beta --write`) | The base keeps its own guard: `build_core.py` skips `frame_guard.c` and the guard's hooks. Its code and data rebuild unchanged; only the identity strings move with the logger folder's hashes (`88c68eed` to `9b7e0eb3`); the browser `.bin` equals `build_core.py`'s; the five base-bound packages rebuild byte-identical (`test_base_bound`), only `requiredBase` moves. |
| `ot_emu --mkii --dsp --frame --interactive`, #1015's eight modules, no card | Frames run at 44.1 kHz / 16 through all four hooks (entry and first render hit every frame, the frame start advancing); idle after 4.9 s 21,978 against 21,979 for main's image of the same set. With `PL`,1 and FLEX poked into T1's Part slot, the mask read 1 and the guard's render ran every frame for 2 s with no fault; nothing was silenced (the render there is stock's silent source). |

Not tested: any unit, so no overload, dropout or recovery has been seen with this guard on hardware; an MKI; a card project with POLY8, FM Synth or VECTOR voices in the emulator; the `GRD` record on a card.

## Release gates still open

On 3 October 2026 the owner explicitly approved the current modules and logger for release, lifted this logger addition’s qualification restrictions, authorized local firmware/DSP tests and waived hardware testing. `DOWNLOADS_ENABLED` is true with the logger installed. This owner exception does not turn older module/full-image proofs into logger verification or supply missing measurements.

Deferred qualification work (not a release gate under this explicit owner exception): complete full native-remixer image/packaging parity and rejection coverage through the actual browser worker for supported configurations. Review the new memory reservation with every preboot payload. Measure worst-case interrupt-masked event cycles, task stack use, stopped-state checkpoint duration and real-time behavior under parameter modulation, mode changes and maximum load. Verify on real MKI/MKII hardware for at least 60 minutes with all eight audio tracks active, including independently running tracks/recorders, card errors, USB disk mode and crash/reset behavior. Warm-reset retention, hard-lockup capture and crash-tail durability remain unproven. No hardware run or cycle count is claimed by this PR.

The logger is core infrastructure and does not alter any catalog module folder, module version, qualification exemption or the frozen eleven-module baseline. Detailed per-module DSP traces would require separately bounded instrumentation and the usual module review/qualification.

Standalone MIDI Scenes reserves the first 12 pages at the stock arena base. The logger takes the top 16 pages of the arena, preserving all author base pointers, including its initializer pointers. Guarded count/clear updates reserve all 28 pages without overwriting either region. Public composition retains the pinned standalone reconstruction and adds logging; mixed selections remain refused.
