# Testing: Pattern Sample Locks 0.1.6-experimental

29 October 2026 · twwwy · private fork prototype. No physical unit has been accessed for this version. No push, upstream PR, release or flash.

## Exact build

- Package SHA-256: 0cd6c725f6be493ea461b7a54231032416cab3cad77bf3327e644db212848961.
- Shared-SDK development base identity: 4ed92776e72c414298662fff20354848b833b161bdc47cb0363ed4ad634b77a7.
- MAIN SHA-256: 32e2480b5658c5b559884358b9925e8dbba92581b27a581745f232cb9b57ab43.
- Emulator SHA-256: b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363.
- Object SHA-256: 451978369121d0dd7a7339ac835769dd5c356a4599a7a968e4b2c46965bdc77d.
- Initialized code/data 8,620 bytes; BSS 6,992; 156 relocations, four standard UI hooks and three guarded Part Edit opener sites.

The module has no ownership database, retained storage, lifecycle contribution or edit-history hooks. It no longer requires the separate lifecycle base. The test base was built from the module worktree's unchanged shared SDK, without that extension.

## Actual software checks

- Node 24.22.1 and npm ci completed.
- Planner/UI and production native-commit host tests passed with ASan/UBSan, fail-fast sanitizer settings and strict warnings. Native-commit coverage includes mixed parameter-lock index bits, mirror updates and pre-write refusal. Lock preserves existing locks by default; replacement is explicit. Clear includes all selected SAMPLE locks, including equal-value and trigless-step locks. Other bytes/unselected tracks are preserved. Stale source/mirror, invalid/aliased inputs, missing assignments, cancellation, recording and STOP timeout are covered.
- UI tests cover eight tracks, disabled navigation/brackets, two columns, per-track counts, white header, framebuffer bounds and inert C in Clear.
- Pinned GCC 16.2.0, -mcpu=54455 -Os and the shared late-combine flag: compile/link passed without undefined helpers; MCF54455 object guard passed.
- Unchanged shared-SDK base compile, object guard, overlap and container round-trip passed.
- Draft module:doctor parses the manifest and passes category, thumbnail, UI claims and all-active-module/base cross-compatibility. Publication gates remain red for catalogue/package import, native parity and hardware qualification. They were not bypassed; this remains a private draft.

## Native emulator verification

The DSP-enabled combined UI/native run passed on this exact package (media/v016-native-ui.json):

- Playback stops before mutation and remains stopped. Creation preserves manual locks by default, including a repeated creation operation; explicit replacement works.
- Clear removes manual, module-created and same-value manually edited SAMPLE locks. Unselected tracks and all other audio-track bytes are preserved; the native battery mirror agrees.
- All three declared sites and the entire relocated initialized image match the package. The former ownership region is unchanged and the eight former history sites stay stock.
- Preview Vol coexists, remains installed after target removal, then removes successfully. Target removal with the popup open restores its three sites and execution continues.
- DSP frames advance from 42,842 to 118,009; the DSP error and stall counters remain zero.

The stress test first saves the disposable current Part through the stock menu on the same boot used for the editing/persistence checks. The original fixture had a working/saved Part mismatch. Preparation now initializes its Flex setup from stock defaults locally and requires the native Part validator to report zero repairs before saving. No extracted defaults are committed. The corrected stress test requires equal working/saved Parts and a matching working Part mirror before mutation, then verifies that the utility leaves the complete Part region unchanged.

Earlier direct engine-job fixtures bypassed stock preparation/completion callbacks and faulted after reload. They are not passing evidence. Save/reload now go through the actual Project menu; USB status polling waits until that menu closes. A separate harness error checked Project Reload after only the disk-restore job. Stock then posts a second LOAD PROJECT job, whose final GUI callback activates the bank and battery mirror. The corrected harness waits for both engine jobs and the reload-specific GUI callback return before inspecting data or closing menus. The corrected full 512-lock run passed with DSP disabled (media/v016-native-stress.json): write, Clear, recreate, native Project Save and full Reload, exact saved audio and complete Part-region preservation, Clear after reload, then removal with the track selector open and restoration of all three sites. CF flush errors were zero. The effect-map entries, magic, padding and checksum were verified; native reload deliberately advances its generation and reseals its checksum. The module leaves the raw map unchanged around each editing operation.

A DSP-enabled run passed the maximum write/Clear, full native save/reload, exact audio/Part checks and Clear after reload. Its script then stopped at an obsolete raw effect-map comparison; only the expected generation/checksum differed. The corrected semantic comparison passed offline on those snapshots. This is functional-prefix evidence (media/v016-dsp-functional-prefix.json), not a complete DSP-enabled stress-script pass: that run did not reach removal or final DSP diagnostics. The separate basic DSP run above covers those checks on its smaller fixture.

A separate fresh process running original stock 1.40C, with DSP enabled, passed native Project Reload without Modwerk, a module upload or a retained battery snapshot (media/v016-stock-reload.json). All eight saved audio tracks matched SHA-256 29746cc52b11ecc5dfc041dbe552473e63729f24c38786f5a5bc160a1adfd76e; the native battery mirror matched, the complete Part region was unchanged across reload, and all three Part openers remained stock. DSP frames advanced. The input card hash matches the complete stress run's output card hash. This is an emulator restart, not a physical power-cycle qualification.

## Performance

The DSP-enabled maximum-operation prefix measured 87,795 emulator instructions for Lock and 274,481 for Clear. At the configured 175,959 instructions per model millisecond, these are approximately 0.499 and 1.560 model milliseconds. Each operation had 36 fully masked publication spans, at most 203 emulator instructions each, totaling 7,244. These intervals cover the watched native commit; they exclude user interaction, STOP waiting and project disk I/O.

These are emulator instruction intervals, not chip cycles, hardware timing or CPU/DSP percentages. Earlier percentage meters saturated even without the module and are not used. The module has no DSP program or audio-frame callback. Physical CPU/stack, interrupt duration and audible continuity remain untested.

## Reproduction and fixture boundaries

Compile translation.c with pinned freestanding MCF54455 flags, reproduce unit.s, inspect undefined helpers and run sdk/runtime/m68k_codegen.py. Temporarily stage this draft under sdk/octabam/modules/, then use sdk/runtime/loader/build.py --octabam pattern-sample-locks --name 'SAMPLE LOCKS' --upstream <verified checkout> -o <private output>.

capture_emulator.py --exercise-ui --keep checks UI plus native behavior on disposable media. --stress-save saves the disposable Part first, then checks maximum edits and native Project menu save/reload; --no-dsp explicitly disables DSP and provides no audio-execution evidence; --profile-symbols supplies exact linked offsets for instruction watches. Keep is emulator-only. No physical USB surface exists in this container.

Fixtures inject held-step masks for the unchanged native SAMPLE writer, valid Flex defaults and existing trig/lock data for maximum edits. Part preparation uses the stock Part Save row. Project save/reload use the stock Project menu, with actual native preparation/begin/completion callbacks. No queued job packet or extra scratch region is used. UI/STOP use actual panel reports. Frozen source/package/base hashes bind each receipt.

## Remaining qualification

Physical MKII/MKI, restarts, audible behavior, worst-case CPU/stack and unnamed companion combinations remain untested. Native card-build integration, parity, owner review and live download do not exist. The first hardware session is a bounded RAM trial on a backed-up disposable project; see DEVICE_TEST.md.

## History

TESTING-v015.md and PROTOTYPE_HISTORY.md preserve earlier exact-build results. Battery-backed ownership, the lifecycle dependency, history hooks and Retain manual control were deliberately removed from 0.1.6.
