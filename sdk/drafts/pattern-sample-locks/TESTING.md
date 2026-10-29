# Testing: Pattern Sample Locks 0.1.8-experimental

29 October 2026 · twwwy · local prototype. No push, upstream PR or release.

## Current scope

Apply leaves playback in its current state. The native writer validates its source under a level-two task guard and atomically publishes each changed sequencer step (at most eight SAMPLE/mirror pairs plus one index byte), allowing interrupts between steps. It refuses live/sampler recording. Separate session-RAM profiles remember successful Lock/Clear selections and cursors, Lock replacement policy, and the last action. Cancellation/refusal preserves prior preferences; module reload resets them.

Portable planner, UI and production native-writer sanitizer tests pass. The full exact-build DSP-enabled emulator run passed, including CPU monitoring, native save/reload, live edits and preference reset on module reload. Hardware and audible results are not recorded for this version.

Historical UI evidence remains in TESTING-v017.md. Earlier MKII results and the 54.0% whole-instrument reading belong to 0.1.6 in TESTING-v016.md and do not qualify this revision.

## Exact local build

- Source checkpoint: 42525aa0064bd228b3ad8d0aa1a3dae7f9413622 (module implementation 481e78b6; later checkpoint changes the emulator harness only).
- Package SHA-256: 28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d.
- Object SHA-256: b8733f98963fcd1e8e1b85a49f4cff1f196c73ade9a3c9ee7be982bc9a9bffb2.
- Initialized code/data 8,748 bytes; BSS 1,328; 167 relocations; four standard UI hooks; the same three guarded opener sites. No DSP code, effect slot, frame callback, ownership ledger or private retained storage.
- GCC 16.2.0, freestanding MCF54455, strict warnings and late-combine disabled. Regenerated assembly reproduced byte-for-byte; undefined-symbol and ColdFire instruction guards passed. The profile linker independently reproduced the exact package image.
- Compiler stack-usage output reports 344 bytes for the native commit frame, 104 for its module-key caller and eight for the per-step helper. This does not bound stock callees, interrupts, or total hardware stack use.

Draft module:doctor passes category, thumbnail, manifest parsing, UI claims and declared compatibility with the base and all active modules. Catalogue/package import, native parity and hardware publication gates remain red for this unqualified draft; none is bypassed.

## DSP-enabled native emulator results

The complete run passed on a copied private card, with source hashes frozen throughout. Receipts: [capture](media/v018-live-capture.json), [CPU and operation measurements](media/v018-live-performance.json). The entire relocated initialized image and all three live sites matched the exact package. The long test kept the module only on the disposable emulator card; no physical USB surface was available to the container.

- Lock preserved the manual SAMPLE lock with replacement OFF; repeated Lock made zero writes. Clear removed all selected SAMPLE locks while preserving other locks, unselected bytes, trig data and native mirrors.
- Live maximum Lock and Clear each changed 512 SAMPLE fields, with playback continuing. A second pattern passed the same operations; the other pattern remained unchanged. Pattern selection retired an armed confirmation before stock processed it.
- Independent successful Lock/Clear profiles, last action, cursor, cancellation/refusal preservation, first-session empty selection and replacement OFF passed. Native project reload retained the RAM preferences. Removal/reinstallation reset both profiles to safe defaults. Portable UI cases additionally cover changed eligibility and remembering All versus a custom subset.
- A real panel REC+PLAY gesture enabled live recording; Apply refused without changing recording, transport or pattern data. Stopped Lock/Clear remained stopped. No implicit transport commands are emitted by the module.
- Native Save Project and both Reload Project stages completed through the stock UI. The entire saved pattern and its canonical mirror matched after reload, including all 512 SAMPLE locks. Clear then removed those locks without unrelated pattern changes.
- Removal with track selection open restored all three original sites; playback and execution continued. Reinstallation and a second Undo/removal also passed.
- DSP execution advanced 232,521 frame interrupts overall (42,852 to 275,373); errors stayed 0 and stalls stayed 0. The dedicated native playback interval advanced 82,891 frames (over 30 model seconds). This is emulator execution evidence; no audio capture or listening verdict was recorded.

## CPU / DSP observations

Five windows each contain ten cached readings, spaced by 50 model milliseconds. Each Apply also records before/during/after readings. CPU read 1,000 per mille in every window, including matched playback after removing the module. The cached DSP fields likewise showed T1–4 at 1,000 and T5–8 at zero with and without the module. These saturated/asymmetric emulator values cannot resolve added CPU or DSP load or short spikes. They are not evidence of zero added cost.

| State | Cached CPU | Cached DSP T1–4 / T5–8 |
| --- | --- | --- |
| Closed, with module, before edits | 100% | 100% / 0% |
| Lock confirmation | 100% | 100% / 0% |
| Closed after live edits | 100% | 100% / 0% |
| Closed with module after all checks | 100% | 100% / 0% |
| Matched playback without module | 100% | 100% / 0% |

Exact-object PC watches measured elapsed emulator instruction intervals. Commit intervals include any intervening interrupt work; they are neither ColdFire cycles nor physical CPU percentages. The saved task mask was observed as level two in its saved register; the level-seven publication mask and restoration instructions were verified in the exact assembly. Hit records do not expose the current SR directly.

| Operation | SAMPLE changes | Commit interval, emulator instructions | Guards | Longest guard, emulator instructions |
| --- | ---: | ---: | ---: | ---: |
| Live T1 Lock | 63 | 13,638 | 63 | 23 |
| Live T1 Clear | 64 | 55,185 | 64 | 23 |
| Live maximum Lock | 512 | 73,255 | 64 | 86 |
| Live maximum Clear | 512 | 308,108 | 64 | 86 |
| Stopped maximum Clear | 512 | 314,791 | 64 | 86 |

No changed step publishes more than eight SAMPLE/mirror pairs plus its index byte. Maximum-size operations used 64 guards; the longest guard across all measured operations was 86 emulator instructions. No-change success and stale/recording refusals used zero publication guards. Sequencer-entry watches recorded zero ticks inside the measured commit intervals; instruction-mask analysis establishes which interrupts remain enabled, rather than treating those short observations as an interrupt stress test.

The module adds no DSP program or audio-frame callback. Its new CPU work is bounded, explicit editing and UI work. Ordinary SAMPLE locks still use the instrument's existing playback path; these observations do not establish a physical utilization tier or worst-case streaming/voice budget.

## Remaining qualification

On 29 October the author confirmed the MKII connected, outside disk mode, on the disposable test project with playback stopped. Fresh read-only preflight verified base 9b7e0eb337a92378306a9b837f04adb3b93242a42f6113e418607ad8fe5dd57b, ABI 10/features 903, normal/known state and the original eighteen-module inventory/whole-set identity. The reviewed whole-set RAM transaction retained that exact baseline and loaded only SAMPLE LOCKS 0.1.8 (module 4bdbfbf9). Physical self-test passed: state 2, zero failures, one live/intact module and no DSP modules. It did not exercise the Lock/Clear functions or qualify audible behavior.

The author-requested untimed trial is active at the recorded observation; it has no host deadline or scheduled Undo. Continuous cached CPU/DSP and sampled UI-phase logging is running over the same serialized USB owner. No competing MCP/device client is connected. The original eighteen modules were not stress-tested, and their kept files were not replaced. This start snapshot was followed by the author-requested verified Undo recorded below. No Keep, flash, project save, push, PR or release occurred. See [start receipt](media/v018-mkii-untimed-start.json); its active-state snapshot is not evidence of a later Undo or ongoing liveness.

Manual functional/audio results are not reported yet. The hardware meter is a cached whole-instrument measurement; this trial has no matched unloaded hardware baseline or exact per-operation hardware timing.

Audible continuity, MKI, heavy streaming/USB/MIDI loads, tempo/speed extremes, companion runtime combinations, stock-only card integration, hardware stack/timing and physical restart remain unqualified. A real module reload was tested in the emulator; no power-cycle persistence is claimed for the session preferences. Hardware qualification and owner review remain required before publication.

## Physical CPU test 1: baseline — 29 October 2026

The author labelled the current state baseline and was asked to leave the screen and playback unchanged for 30 seconds, 04:06:18.952–04:06:48.952 UTC. The module reported phase CLOSED throughout; transport was not independently readable. Only Sample Locks 0.1.8 was active.

Across 148 cached meter requests, CPU averaged **52.84%**, range **51.6–55.1%**. DSP current means were **34.49%** on T1–4 and **47.04%** on T5–8. Fifteen readings selected at two-second offsets gave CPU mean 52.50%, range 52.3–52.7%; this spaced subset does not include the whole capture’s 55.1% maximum. Requests repeat approximately half-second meter windows and are not instantaneous independent samples.

This is a baseline of the whole instrument with the module loaded, not an unloaded comparison or isolated module cost. No functional/audio result or exact operation timestamp is inferred. At the end of this window the untimed trial and logging continued; no Undo or Keep had been requested yet. The later verified Undo is recorded below. See [baseline receipt](media/v018-mkii-cpu-test01-baseline.json).

## Physical CPU test 2: Clear operation — 29 October 2026

The author was cued after logging was confirmed live, then reported Done. The cue-to-acknowledgement interval was 04:08:49.760–04:09:51.867 UTC. Sampled module telemetry showed track selection, confirmation with **15 planned changes** and all eight tracks selected, then CLOSED. The last confirmation sample was 04:09:39.453 and first closed sample 04:09:39.657. This associates the capture with the reported Clear operation; it is not an exact button timestamp or independent pattern-memory check.

- Entire menu/operation interval: 305 cached requests; CPU mean **53.91%**, range **49.8–56.8%**. The 56.8% maximum occurred at 04:09:37.826, before the first confirmation sample, so it is not attributed to execution.
- One second before through one second after the first closed sample: CPU mean **54.77%**, maximum **56.2%**. This vicinity includes confirmation, the reported Apply/close and the next cached windows; no isolated Clear cost or instantaneous spike is inferred.
- Five seconds after the Done acknowledgement: 24 cached requests, closed throughout; CPU mean **50.88%**, range **49.8–52.3%**. DSP current means were **34.60%** (T1–4) and **47.19%** (T5–8).
- Test 1 baseline CPU mean was 52.84%. Transport/project state was requested unchanged but not independently verified; UI states differ, and the operation can change which samples play. These values cannot be subtracted to establish module-only utilization.

See [Clear receipt](media/v018-mkii-cpu-test02-clear.json). The logger’s frames field is the DIAG counter rather than the native load-frame field; CPU/DSP fields are unaffected, and no frame-progress conclusion uses it. The author reported completion only; playback continuity, audible behavior and exact lock-memory changes remain unreported. At the end of this window the untimed trial/logging remained active with no Undo or Keep. The later verified Undo is recorded below.

## Physical trial ended: verified Undo — 29 October 2026

At the author’s request, the existing serialized USB owner held and rolled back the trial, then left upload mode normally. Readback verified all eighteen original module records exactly, the original known active identity and the original whole-set identity b6ef21db9e718d147ea1e86cd323d8a9563da0667abbb03f80ccbbc790481967. No other modules were stress-tested. No Keep, flash or explicit project save was commanded. Undo restores module code and does not revert SAMPLE edits made by the author.

The untimed session and CPU logger have ended. See [final lifecycle receipt](media/v018-mkii-untimed-undo.json). The global CPU maximum includes unmarked actions and is not the labelled Clear-operation peak. Physical upload/self-test/Undo passed on the exact 0.1.8 package; manual functional/audio acceptance, hardware worst-case timing and publication qualification remain incomplete. This is a prototype submitted for owner review, not release approval.
