# Testing: Pattern Sample Locks 0.1.8-experimental

30 October 2026 (Taipei) · twwwy · prototype hardware follow-up; no release approval.

## Current scope

Apply leaves playback in its current state. The native writer validates its source under a level-two task guard and atomically publishes each changed sequencer step (at most eight SAMPLE/mirror pairs plus one index byte), allowing interrupts between steps. It refuses live/sampler recording. Separate session-RAM profiles remember successful Lock/Clear selections and cursors, Lock replacement policy, and the last action. Cancellation/refusal preserves prior preferences; module reload resets them.

Portable planner, UI and production native-writer sanitizer tests pass. The full exact-build DSP-enabled emulator run passed, including CPU monitoring, native save/reload, live edits and preference reset on module reload. Current MKII results include a verified kept restart and removal/Undo on the named flashed base. Full publication and cost qualification remain incomplete; reported physical/UI/listening results are labelled below.

Retired reports and obsolete captures are consolidated in [PROTOTYPE_HISTORY.md](PROTOTYPE_HISTORY.md); they do not qualify this version.

## Sample-inclusive audio fixture — 31 October 2026

The private fixture now contains eight original generated stereo WAVs, four
Flex/four Static assignments and four saved 512-trig patterns. All sample files
are explicitly staged in its FAT image and verified by hash, with valid trim
markers and saved bank checksums. Fresh repeated generation is byte-identical.

An independent emulator process/card/socket ran package `3e13c46f…` on named base
`2e1a6128…`, with main level explicitly set to 64. Ten PCM windows passed the
main-mix and eight per-track expected-tone checks: with the module closed,
through maximum Lock/Clear on A01, before/through Clear on A02–A04, and after
native removal. Working/mirror records, lock-index flags and playback state
matched expectations. All 80 track-tone checks passed; native DSP errors/stalls
stayed zero. See [method, results and limits](AUDIO_FIXTURE.md) and the
[stock-free receipt](evidence/audio-fixture-20261031.json).

The older harness's `--main-level off` means its phase/DSP-counter runs establish
no main-output audio result. This follow-up supplies native emulator PCM evidence;
no physical listening, continuity/dropout, CPU or complete stack qualification
is inferred. One incomplete audio run hit the loader's stopped-transport rule
during teardown; it remains recorded separately from the completed run.

## Physical fixture preparation — 31 October 2026

On the author’s MKII, public base `2aa35c39…`, the new disposable set
`PSLTEST_261031` / project `PSL AUDIO TEST` was copied to the mounted card:
60 files / 23,780,482 bytes, including eight samples, all read back by SHA-256.
Existing module-set files were preserved and the card was safely ejected.
The author confirmed the fixture loaded on A01. No module was installed,
no Keep or flash was performed, and no owner project was saved.

Initially the author reported stalled playback and silent previews. Read-only
load queries confirmed frozen DSP frames while UI ticks advanced. After an
author-performed power cycle, DSP frames advanced on the same base. The initial
“Playing and audible” reply was later corrected: PLAY had not been pressed for
the first post-restart captures. Those recordings contain constant values via
both Swift HAL and FFmpeg AVFoundation, but do not establish a USB audio fault
or playback result. The author subsequently explicitly pressed PLAY and
confirmed advancing, audible playback. A new three-second USB capture then
passed: all eight expected tones were verified in the track stems and all
eight were present in Main. Expected-frequency energy fractions were
99.83–99.99% in the analysed one-second window. The earlier USB-fault inference
was retracted; the unconfirmed-transport captures remain in the receipt.

Four synthetic analyser checks accepted PCM16/PCM32 tones and rejected loud
constant channels, muted Main with active stems, and swapped tracks. This
validates the measurement path, not edit continuity. No Apply/Clear, dropout,
CPU or stack qualification is claimed. Inventory remained empty. See the
[stock-free preparation receipt](evidence/device-fixture-20261031.json).

## Normal public package builder — 31 October 2026

The local host-wrapper integration builds and checks the reconstructed candidate
through the normal CLI in a disposable catalogue fixture. Both strict scanners
pass; its complete package equals the emulator-tested `3e13c46f…` candidate.
Five negative CLI probes are refused. This changes packaging only, preserving
the initialized runtime, BSS, relocations, callbacks and sites. The real
catalogue remains unchanged; no physical device was accessed. See
[method and reproduction](RECONSTRUCTION.md#normal-package-path--31-october-2026).

The author then selected a USB-only first beta. The candidate declares
`usbOnly: true`; production components refuse card downloads, block classic
library additions without USB access and permit beta USB selection. Card
compiler source/version scope stays unchanged. Normal USB build/check and five
rejection probes pass with the exact emulator-tested package; add/removal Undo
preflight passes on all seven public base identities and preflight accepts all
29 packages. These are private fixtures, not publication or concurrent runtime
qualification. See [scope and method](USB_BETA.md) and the
[stock-free receipt](evidence/usb-beta-scope-20261031.json).

## Apply phase profiling — 30 October 2026

An independent DSP-enabled MKII emulator process used its own copied card and
socket, with shared inputs mounted read-only. The unchanged package
`28766a01…` ran on base `2e1a6128…`; this is a separate named emulator base,
not qualification of current public main. Symbol-only assembly annotations
reproduced the linked package image byte-for-byte. See
[reproduction and phase definitions](APPLY_PROFILING.md) and the
[stock-free receipt](evidence/apply-profile-20261030.json).

All ten native panel operations passed (Lock and Clear for five fixtures).
Complete track-byte comparisons preserved every non-SAMPLE byte; canonical
battery mirrors and every audio lock-index byte matched. Transport remained
running during Apply. Removal restored the declared stock sites and image
attestation matched all 8,748 initialized bytes and three opener sites. DSP
frames advanced from 42,798 to 97,219; errors and stalls stayed zero. No listening
or physical hardware result is inferred.

| Clear fixture | Changed fields | Total elapsed emulator instructions | Index-planning interval |
| --- | ---: | ---: | ---: |
| Two steps, no other locks | 2 | 10,483 | 2,228 |
| One full track, no other locks | 64 | 29,890 | 18,286 |
| Eight full tracks, no other locks | 512 | 307,630 | 246,660 |
| Eight full tracks, other lock in first slot | 512 | 77,046 | 16,116 |
| Eight full tracks, other lock in last other slot | 512 | 278,686 | 244,004 |

Each row is one operation. Index planning includes mirror checks and mask
preparation, not only scanning. All phase intervals include any intervening
interrupt execution: the first-slot case includes 32,989 instructions in final
revalidation, versus 6,741 in the other maximum Clear cases. These observations
are not isolated chip cycles, repeat-run maxima or universal bounds. The
no-other-lock maximum spent 80.2% of its observed interval in index planning;
the first/last-slot comparison supports investigating the scan before changing
transaction semantics. Full-pattern Lock totals ranged from 72,748 to 98,996
elapsed instructions. Maximum publication-mask spans were 86 instructions,
with 64 short guards per full operation; guard timer maxima are cumulative and
exclude some boundary instructions.

The phase run deliberately omitted the legacy cached-meter baseline experiment.
Its raw completion metadata inherited a `performanceBaselineAfterRemoval` label;
that label does not establish a measured unloaded baseline. The helper now
reports removal completion instead. The receipt preserves the actual executed
helper hash and explains this metadata-only correction. An earlier private
startup was stopped before measurements to freeze the helper revision; it is
not a module failure or a completed timing run.

No native C/assembly or transaction behavior changed. Deferred flag cleanup and
cooperative batches remain unimplemented. A subsequent local
[scheduling test](SCHEDULING_TEST.md) observed task exclusion and resumption on
the unchanged emulator package. Physical phase timing, complete interrupt/stack
bounds and release qualification remain unqualified.

## Local beta preparation — 30 October 2026

Fresh C compilation matches the committed assembly and exact tested package.
The unchanged public wrapper also builds and rebuilds that package byte-for-byte,
but both stock-byte scans reject it; this remains a publication blocker.
Authored stack paths sum to at most 500 bytes, excluding stock callees, the caller
and interrupts. Full system stack safety and physical worst-case cycles remain
unqualified.

The production browser USB preflight passes standalone addition/removal/Undo
for all seven current base identities, all 29 candidate-plus-published packages,
and corruption/capability rejection. GNU/browser object-link bytes, exports and
BSS end match at three addresses. These private component fixtures do not prove
full card integration: its native UI subscriptions remain unfinished. Portable
and production native-writer sanitizer tests pass; 91 existing package/linker
tests pass. No physical device was accessed and no new work was pushed.

See [methods, limits and blockers](BETA_PREPARATION.md), the
[stock-free receipt](evidence/beta-preparation-local-20261030.json) and the
[future supervised MKII checklist](MKII_BETA_CHECKLIST.md). Publication gates
remain active and this module stays a draft.

The [stock-scan investigation](SCANNER_INVESTIGATION.md) subsequently reproduced
the encoder prologue and signed-remainder matches with a 60-byte independent
compiler probe. A separate compilation container had no private stock or
reference package mounted. All 15 rejecting seed starts are classified into
eight groups of compiler output, font calls and authored action labels. The
unchanged scans still reject the original reference; the subsequent private
reconstruction candidate below evaluates the existing guarded packaging route.
No scanner, runtime or public package changed during that investigation.

## Private reconstruction candidate — 30 October 2026

Candidate `3e13c46f…` is 10,048 bytes, with nine hash-guarded copies restoring
107 bytes. Both unchanged strict stock scans pass. Fresh C/assembly and complete
reconstruction preserve the original 8,748-byte image, 1,328-byte BSS allocation
and 167 relocations. Twelve malformed recipe cases are refused. All copy source
hashes match in seven actual public-base builds; production browser preflight
and source comparisons against 541 declared patch spans pass.

On named emulator base `2e1a6128…`, the real loader refused six malformed
packages without changing active identity/generation or the opener sites, then
installed the valid package in the same session. Four complete live-image/site
attestations passed, including all nine source guards. Live 512-field Lock/Clear,
non-SAMPLE bytes and canonical mirrors, pattern switching, recording refusal,
stopped-state preservation, native project save/reload, RAM preference retention,
removal, reinstallation/default reset and Undo passed. DSP frames advanced
44,149 → 276,660; errors and stalls stayed zero. The unloaded baseline's cached
CPU meter also saturated, so it provides no isolated CPU estimate.

An initial eight-copy package was refused for a source in protected bootloader
storage. Splitting that source into two permitted eight-byte copies corrected
the candidate without changing loader rules or runtime bytes. Two intermediate
attempts stopped on harness transaction-number errors; only the final complete
run qualifies this local lifecycle result. No physical device was accessed.

See [reproduction and limitations](RECONSTRUCTION.md), the
[candidate declaration](evidence/reconstruction-candidate-recipe-20261030.json)
and [combined receipt](evidence/reconstruction-local-20261030.json). Public adapter
admission/short-title support, card UI integration, physical cost/complete stack
bounds and first-release qualification remain pending. Nothing has been pushed.

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

See the stock-free [hardware receipt](media/v018-mkii-qualification.json) and [actual MKII confirmation](media/v018-mkii-live512-confirm.png). Source/package/base identities, individual timing samples and exact observed scope are recorded there. **No Keep or flash occurred during this singleton trial.** The later flashed-base Keep/restart result is separate below. Hardware module-reload preference reset without a restart, MKI, heavy streaming/USB/MIDI loads, tempo/speed extremes, companion runtime combinations, native stock-only card/browser parity and full cost bounds remain unqualified. The RAM base sees the flashed saved set as foreign; this trial makes no saved-set recovery or Keep attestation. Keep this PR in draft.

## Flashed-base companion trial — 30 October 2026 (Taipei)

On the unchanged flashed base `a542a515…`, an addition-only whole-set offer installed the same 0.1.8 package beside the original eighteen modules. Inventory readback preserved every original module record and found nineteen total. The base self-test found all nineteen intact and ran all seven DSP modules. It ended with only CPU load bit 256: peak CPU 90.2%, DSP T1–4 75.8%, T5–8 85.5%. The shared frontend policy treats this as a load advisory; there were no hard-fault bits. This is not a zero-failure stress pass or an isolated Sample Locks cost measurement.

The author selected **Undo the addition**. No Keep or flash was sent. Rollback and fresh readback verified the original eighteen records, normal/known active identity and original whole-set identity `04a677a407a662ce743d753c1e0464c7957525eb39440f7aee58a760c152a1fd`. USB was released. This earlier Undo trial makes no kept-restart or hardware preference-reset claim; the subsequent explicitly approved Keep trial follows below.

The first host attempt incorrectly asked for the whole-set digest while the base retained its trial journal; that read is deliberately refused. It rolled back and verified the original eighteen modules. The repeat bound the candidate to the acknowledged immutable offer identity and preserved inventory, as the frontend does. See the [companion-trial receipt](media/v018-mkii-companion-trial.json). This harness correction changes no module or shared SDK code.

## Kept restart and removal/Undo — 30 October 2026 (Taipei)

The author requested a new Keep test on disposable **PROJECT 261029**. The unchanged flashed `a542a515…` base received the exact same 0.1.8 package beside its original eighteen modules. Every original inventory record was preserved. The nineteen-module self-test found all nineteen intact and ran all seven DSP modules, ending with only load bit 256: CPU 90.3%, DSP T1–4 75.2%, T5–8 78.3%, with no hard-fault bits. As above, the shared frontend accepts this load advisory; it does not establish isolated module cost or a zero-failure stress pass.

Before Keep, the author reported successfully applying T1 with Replace existing ON while stopped, then explicitly confirmed **“Profile set—Keep 0.1.8.”** Keep completed and readback verified saved status 7, nineteen saved and nineteen live. The canonical whole-set identity was `3d66fbdb220385aef4959ad2aa8d589c9b4082ccdfd29d046574839d75390b77`.

After the author reported switching the unit off and on, fresh USB readback verified the same flashed base, all nineteen exact inventory records, the original eighteen companions and the same canonical whole-set identity. Saved status was 1 (present/valid), saved/live counts were both nineteen. The boot correctly began in normal/known state at generation zero with the base as its active status identity; the earlier upload-offer digest is not expected to survive as that status identity. No new self-test run is inferred from the reset counters.

The author reported **“Both actions return; defaults reset”** after checking both Part Edit actions and opening Lock without turning knobs: selection empty and Replace existing OFF. Agent diagnostics independently observed the Lock selector open and selection empty; the visible replacement control is author-reported. This qualifies the reported physical-restart reset on this build, not module reload without a restart.

With that selector open and playback reported stopped, a removal-only trial temporarily left the exact original eighteen live records while the saved nineteen-module set remained unchanged. Undo restored all nineteen exact records, normal/known status and the same kept canonical identity; saved/live counts both read nineteen. The removal was not kept. USB was then released, leaving **nineteen modules kept**, including exact Sample Locks 0.1.8. No flash was performed.

See the stock-free [Keep/restart/removal receipt](media/v018-mkii-kept-reboot.json). No new listening or audio-recording result is claimed for this companion cycle. Full runtime companion coverage, heavy streaming/USB/MIDI loads, tempo/speed extremes, MKI, complete stack/interrupt bounds and native stock-only card/browser parity remain unqualified. A newer public base was merged into this source branch afterward; the hardware result remains bound to `a542a515…`, not that untested base. This PR remains draft.
