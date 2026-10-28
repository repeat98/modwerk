# Testing: Pattern Sample Locks 0.1.6-experimental

29 October 2026 · twwwy · private fork prototype. A first MKII trial was attempted and undone; functional hardware qualification remains incomplete. No push, upstream PR, release or flash.

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

## First physical MKII trial: partial, self-test failed

29 October 2026 local time; receipt media/v016-mkii-first-trial.json. User confirmed a disposable project and backed-up CF. The unit ran base 9b7e0eb337a92378306a9b837f04adb3b93242a42f6113e418607ad8fe5dd57b, loader ABI 10, features 903, with 18 existing modules. Developer state/MEM/button requests are unavailable on that base; no RAM-base change was made.

The exact package above loaded as the nineteenth module, with the original eighteen still listed. The base self-test reported 19 intact, but failed with bit 32 (track/effect restoration), 4/9 progress, 4 DSP effects exercised, no named culprit and refusal 0. Its combined-set peaks were CPU 52.1%, DSP T1–4 81.7%, T5–8 68.3%; frame-gap counter 55,465. These are whole-set self-test readings, not Sample Locks operation cost. The cause has not been established.

The script stopped before the manual menu phase and requested no Sample Locks action. Undo returned to normal with the original active identity, exact eighteen-module inventory and whole-set identity b6ef21db9e718d147ea1e86cd323d8a9563da0667abbb03f80ccbbc790481967. USB responded and hardware frames advanced afterward. The user reported the unit responsive on its normal screen. Track-setting restoration was not verified: module rollback and project-data restoration are different checks. No Keep, flash or project save was performed. The user declined a baseline test of their eighteen modules and requested Sample Locks alone for ten minutes. A baseline-bound whole-set transaction removing those eighteen and adding Sample Locks was rejected during verification with loader refusal 7 (an effect is in use). Publication did not run; the original inventory, whole-set digest and normal/known active state were verified unchanged. After the user loaded a blank stock project, the isolated trial succeeded; see below. Do not count this attempt as a passed hardware stress or functional test.

## Isolated MKII trial and recorded CPU window

With the user-confirmed blank stock project, a 600-second RAM trial loaded Sample Locks as the sole active module. The isolated base self-test passed (state 2, failed 0, intact 1, DSP modules 0); this does not exercise the Sample Locks actions. The timed Undo then verified all original eighteen modules, normal/known active identity and the original whole-set identity. No Keep, flash or project save was performed. Receipt: media/v016-mkii-isolated-trial.json.

At the user's request, another isolated 600-second trial added cached CPU/DSP meter recording at roughly five reads per second on the same serialized USB connection. The first 579 readings span 20:24:05.679–20:26:03.384 UTC on 28 October (04:24–04:26 on 29 October in Taipei). Highest sampled whole-instrument CPU: 54.0%, at 20:25:25.456 UTC; sampled range 43.1–54.0%, mean 47.012%. Highest reported DSP peak-window fields: T1–4 37.8%, T5–8 42.8%; their maximum current-load fields were 36.7% and 41.8%. Exact timestamps, metric definitions, log hash and sample counts are in media/v016-mkii-cpu-window.json. The user then confirmed that Lock and Clear produced the expected sample-lock changes and playback stopped before each operation. These are user-reported passes, not independent memory comparisons. Individual operation timestamps were not supplied.

These cached whole-instrument readings cannot isolate module cost or establish the brief commit's true peak. There is no matched unloaded baseline, no precise operation markers and no hardware instruction/cycle timing; short spikes may be missed. The CPU-recording trial remains active at this snapshot, with automatic Undo scheduled for 20:34:05 UTC. Its restoration must be checked separately. Expected Lock/Clear changes and STOP-before-edit have separate user-reported passes. Manual-lock retention, byte-level/unselected-track preservation and audible behavior are not established by the meter readings.

## Remaining qualification

Independent memory verification of MKII SAMPLE edits, explicit manual-lock preservation, all MKI behavior, restarts, audible behavior, worst-case operation CPU/stack and unnamed companion combinations remain untested. Native card-build integration, parity, owner review and live download do not exist. The first hardware session is a bounded RAM trial on a backed-up disposable project; see DEVICE_TEST.md.

## History

TESTING-v015.md and PROTOTYPE_HISTORY.md preserve earlier exact-build results. Battery-backed ownership, the lifecycle dependency, history hooks and Retain manual control were deliberately removed from 0.1.6.
