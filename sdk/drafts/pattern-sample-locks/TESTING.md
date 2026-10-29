# Testing: Pattern Sample Locks 0.1.8-experimental

30 October 2026 (Taipei) · twwwy · prototype hardware follow-up; no release approval.

## Current scope

Apply leaves playback in its current state. The native writer validates its source under a level-two task guard and atomically publishes each changed sequencer step (at most eight SAMPLE/mirror pairs plus one index byte), allowing interrupts between steps. It refuses live/sampler recording. Separate session-RAM profiles remember successful Lock/Clear selections and cursors, Lock replacement policy, and the last action. Cancellation/refusal preserves prior preferences; module reload resets them.

Portable planner, UI and production native-writer sanitizer tests pass. The full exact-build DSP-enabled emulator run passed, including CPU monitoring, native save/reload, live edits and preference reset on module reload. Current MKII results and the author’s listening report are recorded below; full lifecycle and cost qualification remain incomplete.

Retired reports and obsolete captures are consolidated in [PROTOTYPE_HISTORY.md](PROTOTYPE_HISTORY.md); they do not qualify this version.

## Exact local build

- Source checkpoint: 42525aa0064bd228b3ad8d0aa1a3dae7f9413622 (module implementation 481e78b6; later checkpoint changes the emulator harness only).
- Package SHA-256: 28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d.
- Object SHA-256: b8733f98963fcd1e8e1b85a49f4cff1f196c73ade9a3c9ee7be982bc9a9bffb2.
- Initialized code/data 8,748 bytes; BSS 1,328; 167 relocations; four standard UI hooks; the same three guarded opener sites. No DSP code, effect slot, frame callback, ownership ledger or private retained storage.
- GCC 16.2.0, freestanding MCF54455, strict warnings and late-combine disabled. Regenerated assembly reproduced byte-for-byte; undefined-symbol and ColdFire instruction guards passed. The profile linker independently reproduced the exact package image.
- Compiler stack-usage output reports 344 bytes for the native commit frame, 104 for its module-key caller and eight for the per-step helper. This does not bound stock callees, interrupts, or total hardware stack use.

Draft module:doctor passes category, thumbnail, manifest parsing, UI claims and declared compatibility with the base and all active modules. Catalogue/package import, native parity and hardware publication gates remain red for this unqualified draft; none is bypassed.

## DSP-enabled native emulator results

The complete run passed on a copied private card, with source hashes frozen throughout. Receipts: [capture](media/emulator-0.1.8.json), [CPU and operation measurements](media/emulator-0.1.8-performance.json). The entire relocated initialized image and all three live sites matched the exact package. The long test kept the module only on the disposable emulator card; no physical USB surface was available to the container.

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

## MKII functional and maximum-size trial — 30 October 2026 (Taipei)

The author authorized this USB session and named a disposable project. A reported fresh physical power cycle preceded the RAM boot. The flashed base `a542a515c1955b9264712073bb40c81a492f1a993bfa991640d111eb03aaa130`, eighteen module records, active identity and whole-set identity were recorded first. The base has no development controls, so the agent RAM-booted development base `9056dbbd2a84c80051eee33f97d6407ecf079c51f27bd682243d44c9344777d2`. This cached-module prototype is a named test environment, not qualification of the current public base or card build.

The exact 0.1.8 package above was installed alone and passed device self-test (one intact module, zero failures). Native panel controls prepared A03 at 120 BPM with 64 sample trigs on each of eight Flex/Static tracks. The disposable Part was saved natively; temporary changes made by native track paste were restored with Part Reload, and complete working/saved Part equality was verified before the tests. Original firmware, project snapshots, raw memory and packages stay private.

### Observed results

- Twenty alternating live maximum-size operations passed: ten Lock and ten Clear, each changing 512 SAMPLE fields. Every complete eight-track record matched the expected result: only selected SAMPLE bytes changed, trigs and other bytes stayed intact, both Part copies stayed intact, and playback remained running before/after each Apply.
- Stopped Lock/Clear stayed stopped; repeated Lock with replacement OFF made zero changes. A T1-only operation preserved the other seven tracks. Separate successful Lock/Clear selections were recalled; cancelling a selection or replacement-policy change preserved the previous successful profile. Replacement ON was visually recalled after cancellation.
- A SAMPLE lock created through stock controls (slot 0 versus Part slot 3) survived Lock with replacement OFF. Replacement ON replaced it; Clear removed it. A native pitch lock at the same step and every non-SAMPLE track byte survived these operations.
- Live recording was verified through its actual native flag, then Apply refused without changing that flag, playback or track bytes. The development STATE reply’s recording byte covers sampler recording and was not suitable for the first harness assertion. Switching to A04 cancelled an armed confirmation; returning to A03 found its data unchanged.
- Native Save Project, Clear and Reload Project restored the exact saved track records with all 512 SAMPLE locks. The first fixed two-second comparison was premature; later complete comparisons, repeated after 250 ms, matched the settled saved result. No premature comparison is recorded as a pass.
- During the live test the author reported **“Playback sounds continuous.”** This remains an author listening report; no independent audio recording or sample-level dropout analysis was made.
- Undo was performed with track selection open. Readback matched the temporary base’s empty inventory, active/whole-set identities and all three original opener-site hashes. Saved SAMPLE edits remained. After the author’s final physical power cycle, readback verified the original flashed base, all eighteen original module records and the original active/whole-set identities. Those companions were not stress-tested.

### Timing method and limits

The host used a monotonic clock from sending the final YES press until DIAG first reported CLOSED. Completion was then checked against all track bytes and transport state. This gives an observed upper bound including USB transfers, UI scheduling, publication and telemetry latency, rather than isolated execution cycles.

| Operation | Repetitions | SAMPLE changes each | Largest observed host completion bound |
| --- | ---: | ---: | ---: |
| Live Lock | 10 | 512 | 18.433 ms |
| Live Clear | 10 | 512 | 18.304 ms |

The frame-gap read covering this repeat run and intervening menu/host work was 413.03 µs. Cached whole-instrument CPU readings taken after these operations ranged 70.1–72.7%; these do not isolate module cost or instantaneous spikes. Later project save/reload activity reached a cached 100% window, outside this timing run. No per-step hardware interrupt bound, full stock-callee/interrupt stack bound or universal worst-case guarantee is inferred.

An initial run completed seven verified operations before a separate status query interleaved with a MEM high/low read. The read was refused and the runner stopped playback; no failed firmware edit was observed. The twenty-operation run above used one memory reader. Its receipt retains the interruption and harness corrections rather than treating them as module failures or hiding them.

See the stock-free [hardware receipt](media/v018-mkii-qualification.json) and [actual MKII confirmation](media/v018-mkii-live512-confirm.png). Source/package/base identities, individual timing samples and exact observed scope are recorded there. **No Keep or flash occurred.** Kept restart lifecycle, module-reload preference reset on hardware, MKI, heavy streaming/USB/MIDI loads, tempo/speed extremes, companion runtime combinations, native stock-only card/browser parity and full cost bounds remain unqualified. The RAM base sees the flashed saved set as foreign; this trial makes no saved-set recovery or Keep attestation. Keep this PR in draft.

## Flashed-base companion trial — 30 October 2026 (Taipei)

On the unchanged flashed base `a542a515…`, an addition-only whole-set offer installed the same 0.1.8 package beside the original eighteen modules. Inventory readback preserved every original module record and found nineteen total. The base self-test found all nineteen intact and ran all seven DSP modules. It ended with only CPU load bit 256: peak CPU 90.2%, DSP T1–4 75.8%, T5–8 85.5%. The shared frontend policy treats this as a load advisory; there were no hard-fault bits. This is not a zero-failure stress pass or an isolated Sample Locks cost measurement.

The author selected **Undo the addition**. No Keep or flash was sent. Rollback and fresh readback verified the original eighteen records, normal/known active identity and original whole-set identity `04a677a407a662ce743d753c1e0464c7957525eb39440f7aee58a760c152a1fd`. USB was released. No kept-restart or hardware preference-reset result is claimed.

The first host attempt incorrectly asked for the whole-set digest while the base retained its trial journal; that read is deliberately refused. It rolled back and verified the original eighteen modules. The repeat bound the candidate to the acknowledged immutable offer identity and preserved inventory, as the frontend does. See the [companion-trial receipt](media/v018-mkii-companion-trial.json). This harness correction changes no module or shared SDK code.
