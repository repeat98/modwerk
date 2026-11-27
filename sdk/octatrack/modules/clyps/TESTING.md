# Testing the public source

Run `python3 -B sdk/octatrack/modules/clyps/test_renderer.py`. A host C compiler runs the actual input and display routines against synthetic adapter state. With m68k-elf-gcc installed the suite also compiles both translation units for MCF54455. There is no installable public module.

The frame oracle comes from transmitted MKII emulator frames on OS 1.40C. Two checks cover all 1,024 bytes of Panorama at home and following a T2 override. The third covers all six CLYPS-owned bands in SRC when T2 plays A01 with A03 queued. The synthetic fixture never embeds the stock screen. The input fixture checks down/up in both dispatch phases, track focus, row focus, explicit launch and stock routing after exit.

In Meta the proposed integration leaves TRACK edges available to stock and Track Solo. LEVEL focuses a column in CLIP or a row in ROW. ARR switches between the contexts. On ordinary SRC press ARR, then SRC in Meta to enter the selected track's list. LEVEL browses and YES requests the selected source. The sequencer and protected loader remain independent qualification gates.

Hardware: NOT TESTED. Rows are volatile, T8 Master is unsupported, and foreign-source editing remains interlocked.

## Track Solo comparison

On the same protected base donor, Track Solo 0.2.5 alone produced native track lamp levels 15 on T2 and 3 on the other tracks during a hold. Adding T3 changed both T3 levels to 15; releasing T3 retained the group. The previous CLYPS package swallowed TRACK in Meta, failed this comparison and moved the focus. The updated package reproduced the control levels while leaving Meta focused on T4 with all eight sources still at A01. LEVEL moved the row focus to R03, and Track Solo worked again after CLYPS removal. This case measures native input, group indication and display ownership. It does not measure eight audio stems.

[Track Solo held in Meta](media/meta-track-solo.png) · [Row navigation after release](media/meta-row-focus.png)

## Protected MKII results

The revised module (SHA-256 `887a0fa2cd1c1002fd127e7448d9a2e849fb90d34f89feee3c677ed0d60421a8`) rebuilt with SDK sources at `23dac9b85`. Native runs used an isolated protected sequencer twin based on donor `a9980c97c`. An altered package with the same ID was refused with status 259. The admission comparison retained 336 stock calls and 336 writes and rejected nine damaged records.

| Native comparison | Result |
| --- | --- |
| Original eight-lane replay vs independent stock | 624 ordered event calls and 608 timestamp writes matched. One of 219 sampled states differed. At tick 193 the first 1 ms observation differed and the following 19 agreed. |
| Revised eight-lane replay vs independent stock | All 624 calls, 608 writes and 219 samples matched. Three truncated streams failed. An additional replay with queue flag write instrumentation also passed the musical grader. Raw flag-write logs cover different numbers of writes and do not establish identical instruction-level execution. |
| Early request | Strict test passed, including the pending observation at 185. 576 ordered calls, 560 writes, 202 ticks. |
| Late request | Strict diagnostic check still fails at 187 vs expected 188. At +1 ms in tick 187 the request was accepted while the old selection played. At +10 ms, still in tick 187, the pending selection was visible. The sequence switched at wrap 282. All 848 ordered calls and 816 timestamp writes matched the stock composite across 298 ticks, including swing and negative microtiming. |
| Track Solo | Passed with either module loaded first. TRACK edges no longer move CLYPS focus. No launch was observed. |
| Panel and Grain | 17 panel frames and 21 Grain coexistence frames matched prior native witnesses. The panel fixture covers the T2 override, queued/playing SRC, row edit, crossfader and stock return. Grain 0.1.2 retained its native SRC, pool and FX paths. |

The tick observations distinguish UI/state publication from event scheduling on these fixtures. The musical scheduler and historical diagnostic expectations are unchanged. These comparisons do not establish sample-identical audio on all tracks.

LEVEL is owned by the modal navigator while Meta is active. FUNC+LEVEL there is suppressed. Outside Meta a stock/candidate master-gain probe returned the same constant word in both runs; a positive master gain response has yet to be demonstrated independently.

## Public engine checks

The README discovery command builds the donor C handlers, links with the repository SDK and verifies the required entry points. The checked build produced 5,452 linked bytes, 164 BSS bytes and 238 relocations. tests/shared_state.c drives SRC on every combination of eight lanes and 16 references, checks preserved SRC bands, tests popup and page ownership, and exercises row 16 with all eight lanes distinct. It covers stopped immediate selection, a request after wrap, commit at the next wrap, supersession, STOP cancellation, native TRACK handoff, bank reset, foreign-source edit lock, and explicit stopped YES recovery. The host calls wrap explicitly; it does not reproduce the native clock.

With independent native captures available, run tests/grade_wide.py CANDIDATE STOCK or tests/grade_boundary.py early|late CANDIDATE STOCK from this directory. In the archived protected captures the fixed eight-lane pair passes all three streams and the truncation controls; early passes; late passes its musical comparisons and still fails the strict pending-state diagnostic. Those are regrades of existing captures. New runs on the shared base require both callbacks and modal-input admission.

## First shared-development candidate (7419b7598)

The base candidate at 7419b7598 and the public source from c3c516e8a completed a fresh native A01/T2→A02 replay. Both executable identities are recorded in evidence/shared-base.json. The SRC key path reported QUEUED, then PLAY. Stock scheduled the change at wrap 90. All eight audio lanes were observed before and after that wrap. The other seven kept A01 and the MIDI builder kept its stock input. All 384 ordered audio/MIDI calls and 400 relative timestamp writes matched the stock global-pattern composite. STOP canceled a second pending request. ARR displayed the committed sources, bank and Part bytes matched, callback rows returned to their starting values and the largest free extent returned to 786432 bytes.

A native negative control on an earlier, equal-width development base without the required feature returned 259. Its active count, owner count and four observed rows stayed zero and the pool stayed at 786432 bytes. The first positive build before deferred reclamation retained 6416 bytes after OFF even though all musical comparisons passed. The final build includes the stopped-engine reachability recheck and rebuilt byte-for-byte from the candidate commit. NATIVE_REPLAY.md gives the reproduction commands.

The eight-track pair on the same public candidate matched all 624 ordered calls, 608 relative timestamp writes and 219 sampled states, including independently detected negative microtiming and swung T3. All three truncated stream controls failed as required. The matrix stored 16 rows, recalled them in reverse, observed all expected audio lane/source pairs and ordinary MIDI sources, and compared bank, Parts, project files, ownership and pool after OFF.

The late request met the unchanged strict diagnostic oracle on this candidate. RESTORE was pressed at 187. The linked requested state already contained 0x101 at +1 ms, with 0x111 still playing. At +16 ms the published diagnostic reported the request in tick 188. The native T2 builder selected home at tick 282. The same-build stock composite matched all 848 calls, 816 timestamp writes and 298 ticks. These observations supersede the earlier protected-base diagnostic for this build.

Outside Meta, FUNC+LEVEL moved native MAIN 64 → 56 → 64 on both stock and installed runs. CUE remained at 64. This measures the stock project settings. The same installed and empty instrument boot saw zero frame skips and zero sheds in the profiled windows. GCC reported 8 bytes for each sequencer callback's individual frame and 188 for module_draw. Total stack high-water and physical worst-case cycles remain unmeasured.

The early fixture passed its historical diagnostic and musical oracle too, with requests observed at 89 and 185, 576 ordered calls, 560 writes and 202 ticks.

Stock Arranger recovery after a foreign source was selected matched its pre-install two-row control. The playhead advanced from row 0 to row 1. Both signatures contained 336 ordered calls and 336 relative timestamp writes. Pool, callback heads, bank, Parts and disposable project files returned to their starting state.

Track Solo passed in both load orders, including native group LED states and stable CLYPS focus. The crossfader reached stock position 47. Grain retained its native SRC, page IDs, pool and FX routes. POLY8 and VECTOR restored their native SRC screens after leaving CLYPS. These peer checks cover panel coexistence. T1 FLEX's generated tone rose from 0 to 1930, with the seven other lane peaks unchanged. The T2 STATIC isolation test failed its prelaunch-silence assertion. It measured 2117 before and 2337 after. An independent stock global-pattern composite reproduced both readings and the other seven peaks. The cause of the nonzero baseline remains open.

The measured three-second dense window had all eight audio builders selecting A02. There were 192 source spans in the candidate, with maximum 160 retired emulator instructions per selection and 540 across the one observed wrap. The stock composite maxima were 16 and 12. In the light A01 case these were 31 and 28 with the module, 16 and 12 without. At rest both runs observed zero sequencer spans. Frame busy counts are accumulated as per-frame timer delta shifted right by eight. The stopped windows measured 443904 over 8364 frames without the module and 481832 over 8354 with it. This includes all frame work. The six windows recorded no frame skips or sheds. These samples describe the pinned emulator and workload.

The native HOME editing test inserted the T2 step-6 trig and held it while changing AMP encoder A. Stock and CLYPS produced identical hashes before and after the p-lock and after leaving the editor. Parts stayed intact. A separate boot confirmed stock popup priority. Editing a foreign source remains interlocked.

The scene-selection fixture changed A and B independently using each physical scene button and a trig, read the two active Part scene bytes after each gesture and restored both. The five pairs matched with and without CLYPS. Run native_rows.py with the same arguments as the Arranger check and use --scene-select in place of --arranger-recovery.

## Current candidate on cumulative 23f41e720

Candidate 18e28a172 merged the cumulative frame-budget update. Candidate b3184dd5e subsequently integrated the upstream pricing-curve and measurement-script changes through 23f41e720. Its freshly built MAIN, symbol map and configuration digest matched the tested executable byte for byte. The code/data size, BSS, relocations and CLYPS package digest are unchanged. The new MAIN and negative control identities are in evidence/shared-base-refresh.json. Both vertical-slice traces and the missing-feature receipt reproduced byte for byte. The 16-row sweep and the stock Arranger after OFF passed. Six profiling windows again had zero skips and zero sheds. The maxima at the two sequencer sites were unchanged.

The default eight-lane capture matched 624 ordered calls, 608 relative timestamp writes and 218 of 219 sampled states. At tick 193 the candidate snapshot retained queue entries for T2–T7 while stock retained only T3. The paired 1 ms near-boundary observer read the T3-only flag on both runs at 193. The same unmodified grader accepted the full refined pair and rejected each truncated stream. Keep both results.

The early boundary passed its strict grader. In the late case the stock and candidate musical comparison passed for all 848 calls, 816 writes and 298 ticks. The request entered module state at +1 ms of tick 187; the diagnostic published it at +5 ms of that same tick. The T2 builder first used home again at 282. The strict diagnostic expectation of 188 failed. The previous base's +16 ms result remains in the preceding evidence. The input, diagnostic and builder observations are separate.

Track Solo (both orders), panel, Grain, POLY8, VECTOR, stock popup priority, native Scene A/B parameter changes and the home trig/p-lock comparison repeated on the refreshed executable. The FLEX stem test passed. Both native STATIC controls again measured T2 peak 2117 before selection and 2337 after selection. The prelaunch-silence assertion failed in both. No physical test was performed.

## 23 November · contributor regressions

Run `python3.12 -B -m unittest discover -s sdk/octatrack/modules/clyps -v`. The host fixture compiles the production callbacks; lifecycle delivery follows the candidate subscription JSON. The bank fixture reads a one-byte grid marker from a temporary file and exercises a short read at EOF. On the previous implementation the popup path failed when ARR did not reopen, and the unrelated bank request removed an already confirmed R04. Both failed independently when linked to the previous handlers. The previous MKII package also reproduced the ARR re-entry failure after opening a real timed stock message during Row Edit. On the corrected candidate all four discovered host/ColdFire tests pass. Standalone linked image 5,596 bytes, BSS 176 bytes, 248 relocations.

UI-01/02/03/04 cover the home case and three repeated interruptions with a foreign lane playing, a different confirmed row queued and an unconfirmed third source held down. Check encoder, modal query, stock YES, owned release, popup-owned ARR repeat/release, row bytes and next wrap. A separate stock YES/NO dialog handle used by Temp Save reproduced the same ownership failure before its addition to the stock-window check. UI-05 includes the existing TRACK and SRC ownership fixtures.

BANK-01/02/03 cover an unrelated bank return, failed read with original fixture bytes retained, and a successful relevant replacement that changes the saved source to an unsupported grid. Recall refuses it and the native source selector falls back to home. Restoring compatible grid bytes makes the same confirmed slot usable. BANK-04 exercises project initialization and a missing R04 on next recall. BANK-05 covers a failed reload event sequence without initialization. A failure after project initialization is unresolved. The tests inject no success argument into a module callback. During an A read the fixture calls the real tick, wrap and selector: current and requested state survive, and the selector leaves the stock pattern argument alone. During a B read the same selector continues redirecting T1.

The intermediate build that subscribed to project initialization alone was refused with 259 by the positive base: candidate B1 admission requires the bank pre-load subscription. The final contract keeps that subscription as the read guard and pairs it with bank-loaded; both the base and its admission rules are unchanged.

### Native build identities and comparisons

All 23 November runs use the existing MKII integration base b3184dd5e, MAIN SHA-256 `6a9d7518ba7707e3763215ecc50be1c7eec09628b1bdf45b86b3f207a02b434b`. The cumulative #1910 branch at c3706472b requires separate qualification. No hardware trial.

| Package SHA-256 | Scope |
|---|---|
| `7707f1199cd7595bf49d8974445acbfb0610a0f7fb12c2c86268d259826a1142` | Admitted implementation of both fixes, before adding the additional stock YES/NO window handle. |
| `32ebca98345840f4e107550683f4fd14f2be35e5355df3d8933b7132f324aea9` | Final implementation, also guards the YES/NO dialog. 5,600 bytes of linked package image, 176 BSS, 248 relocations. |

The first admitted package passed the native interrupted-editor replay. The independent stock T2 pair matched at wrap 90, 384 ordered calls and 400 relative writes. The stock Arranger matched its pre-install run after OFF (336 calls, 336 writes, complete 786432-byte pool). Track Solo, Grain and panel receipts matched the archived 9/21/17 observations respectively. POLY8 and VECTOR SRC returned correctly. Scene A/B selections matched stock on every step. In the fresh eight-lane pair, 624 events and 608 writes matched; strict default capture **FAIL**, with tick 193 the only mismatch among 219 samples. The historical 1 ms pair regraded PASS at 219/219; the historical late diagnostic still fails its 188 expectation after publication at 187. The musical and diagnostic graders retain their previous assertions.

On the final package the stock timed popup closed, ARR reopened CLYPS, R04 recalled its confirmed A01 and OFF returned the full pool. The equal-width base without the required capability refused this package with 259, zero installed owners and six empty observed hooks. Catalog compatibility on the public checkout: 44 active modules, 946 pairs, zero problems. The catalog excludes this draft. Module doctor in draft mode still fails because octamod.module.json is absent.


The final package also passed the matched T2 slice against the fresh, same-MAIN stock control. Wrap 90, 384 ordered calls, 400 relative writes, the seven unaffected lanes, SRC/ARR, STOP cancellation, bank and Part checks and pool recovery all passed.

On the same final package, the GATE4 project fixture selected bank B, observed project initialization and the bank pre/post callbacks, and found R04 undefined with CLYPS still installed. Waiting for the stock card task before OFF returned 786432 bytes. The initial short OFF timeout had expired while the stock operation was still running. A direct attempt to invoke the stock bank reader synchronously from emulator main timed out; it provides no native bank-only I/O result. The independent host short-read case covers that path. Fresh FLEX on the first admitted package went from 0 to 1930 on T1. STATIC T2 measured 2117 before and 2337 after, failing the pre-launch silence assertion as in the historical stock control. E1 remains locked.

On the final package, Track Solo and Grain both passed fresh native replays. OFF restored the same stock Arranger signature (336/336) and the complete pool. Every package and card used in these tests stayed local.

Both final native RELOAD fixtures passed. The stored B project cleared R04. Missing stored state kept bank A and its confirmed R04. OFF restored 786432 bytes in both cases.

The final package also ran a fresh eight-lane pair using the 1 ms queue observation near wrap. Both replay processes exited successfully. The unchanged strict grader **FAILS** at tick 193: the queue snapshot contained one entry on the candidate and six on stock. All 624 ordered events, 608 relative writes and 218 of 219 sampled states matched. The earlier 219/219 result belongs to the historical package. The cause and any audible consequence remain unresolved.

## Artist requirements checkpoint

Discovery now runs five tests. The added stopped popup/Bank H case injects both events into the production callbacks during a draft edit, then checks ARR re-entry, confirmed row, playback and pending state. The independent C clipboard fixture checks row and same-track cell snapshots, source isolation, overwrite refusal, cancellation/clear, invalid targets and cross-bank refusal. This fixture works on staging rows only. The firmware has no clipboard binding, sidecar writer or native duplication command. Hardware A–H: NOT TESTED.

### Matched cumulative-base qualification · 23 November

Candidate 5c32cbacd, module 32ebca98, emulator a1410ad4.
[Identities and suite results](evidence/nov23-reliability.json).
Both the default and 1 ms wide captures passed the unchanged strict grader,
including its three truncation controls. The shelf-disabled vs active-home
pair matched 624 events and 219 states. STOP at tick 190 matched 544 events
and 190 states. The missing-feature control refused the package with 259,
zero owners, six empty hooks and unchanged free pool.

On the earlier MAIN we repeated the original failure byte for byte, even
with the additional PC and absolute-sample witness. At the first tick-193
read stock had six entries. Its frame consumer at 0x4000bc22 cleared five
flags from +0.408 to +2.708 samples relative to the read. CLYPS had one
entry. Its same five clears spanned −23.745 to −21.345 samples. Both
reported one entry at the next poll. In both runs we observed eight audio
selector returns, eight audio builder entries and eight MIDI builder entries
during the tick. On the refreshed MAIN both first reads followed the five
clears. The instrumented ordered streams match their uninstrumented
counterparts. [Original samples](evidence/tick193-original-clock.json) ·
[refreshed samples](evidence/tick193-current-clock.json).

The original fixture samples after an emulator run quantum containing a tick.
That does not fix whether stock's frame consumer has run. This explains the
recorded 6:1 difference for these inputs. Neither a general permission for
callback jitter nor a change in the strict oracle follows from that finding.

The before-wrap boundary replay failed its diagnostic assertion. The request
was in RAM by tick 89 +1 ms; the queued-only diagnostic was still zero at
+15 ms, then the wrap committed at tick 90 +16 ms. The after-wrap replay
matched all 848 calls, 816 relative writes and 298 states, but the diagnostic
appeared at 187 instead of the expected 188. Both failures remain open.

### Audio and stock MIDI on the refreshed candidate

The disposable two-FLEX-voice fixture (generated kick and bass) sends six
channel-1 note 48 pairs and four channel-2 note 67 pairs with MIDI T2's
CC1 locks at 34 and 42. All 27 decoded messages match both independent
stock controls, including their order, channels and note lifetimes. The
candidate sent 69 UART bytes; both controls sent 70. The only byte edit is
an extra 0x90 status at zero-based index 38 in each control. MIDI running
status yields the same decoded note. Maximum relative message-end timestamp
deviation was 48.1 emulator samples against the stock global-pattern
composite and 64.1 against fixed A01. The exact wire/timing comparison
**fails** in both cases. The global-pattern control alone cannot explain
the extra status. Absolute device latency and physical clock are unmeasured.

On a subsequent transport after OFF, candidate and global stock control
matched all 69 bytes and 26 decoded messages; relative timing still differed
by up to 7.3 samples. Native independent MIDI source launching remains
unimplemented. See NATIVE_REPLAY.md for both control commands and the
separate stock MIDI builder.

The same-base peer replays passed for Track Solo, Grain, POLY8, VECTOR,
Panorama/Zoom and the foreign-edit interlock. Scene selection matched all
five stock A/B pairs. The master LEVEL probe and six load windows passed
with zero frame skips or sheds. FLEX T1 measured 0 before launch and 1930
after. STATIC T2 measured 2117 before and 2337 after, failing the required
pre-launch silence. The catalogue compatibility result covers 44 published
modules and 946 pairs. The candidate's 20 machine-event host checks passed.
One of 23 runtime-loader checks failed at USB Audio source reconstruction;
two checks were skipped.

The disposable GATE3-to-GATE4 change and stored reload selected bank B,
cleared the R04-defined flag and recovered the pool after OFF. Missing
stored files left bank A and R04 intact. The late EOF experiment and the
recovery contract model remain host-only. The native reload tests use
stock files; the offline CLYPS codec is absent from the module.

The dedicated crossfader replay (`native_rows.py --crossfader`, using the
same base and card arguments as --scene-select) drove the native panel ADC
and read position and all ten stock morph weights. The sequence 0, 64,
127, 0 matched with the module off and installed. All three positions had
different weight vectors and the return restored the original weights.
The stored-reload repeat exited 0 and reproduced its first receipt exactly;
the original scratch wrapper had failed to save the exit status.

## Official procedure on upstream main — 23 November 2026

Tested merge 613db9857006 (CLYPS 236294956e38, official procedure 6f31dd3c43ff). The plan printed all 12 steps. The host run and the connected MKII emulator run both **failed step 1**. Doctor could not read the staged draft's octamod.module.json. **Steps 2–12 did not run** in either procedure. The emulator session was available and received an explicit candidate package. Package selection does not skip the software check. The draft currently has proposed contracts and depends on shared base services missing from upstream. A build against upstream also failed at the modal-input ABI. See [records, logs, exact commands and hashes](evidence/procedure-nov23/README.md).

Separate checks passed on the same module source: ten host tests, ColdFire link and callback fixtures, and a byte-identical candidate MWRM on shared SDK 5c32cbacd (SHA-256 32ebca98345840f4e107550683f4fd14f2be35e5355df3d8933b7132f324aea9). The standalone Python 3.12 catalogue check passed for 44 active modules and 946 pairs; CLYPS is outside that catalogue. The standalone DSP scan found ten current records. Neither standalone result changes the official step statuses.

Edge cases

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Eight audio lanes and independent source selection | A source change could redirect a neighboring lane | Native MKII wide pair against independent stock composite and T2-only slice | Pass. All 624 events, 608 relative writes and 219 states matched. The separate T2 slice matched 384 calls and 400 writes at wrap 90. |
| Request just before wrap | Pending state could appear too late | Native early-boundary panel fixture | Fail. Requested by tick 89 +1 ms, pending diagnostic still zero at +15 ms, committed at wrap 90 +16 ms. |
| Request just after wrap | Restore could be reported on the wrong tick | Native late pair and strict boundary grader | Fail. All 848 events, 816 writes and 298 states matched, but pending restore appeared at tick 187; the oracle requires 188. |
| ARR after stock popup during Row Edit | Editor could keep the panel hidden or lose a row | Native popup fixture and host callback test | Pass. ARR reopened, R04 retained its definition and OFF recovered the full pool. |
| Unrelated bank, early EOF, popup during bank load | An already-defined R04 could be cleared | Host callbacks with an actual temporary-file EOF and an unrelated bank mask | Pass. R04 and its source survive. |
| Late interrupted project load | Destination initialization can clear the previous rows before completion | Host late-failure case with a short read after init | Fail. The characterization test passes by reproducing loss of R04. Native late-abort recovery remains unverified. |
| Missing versus completed stored reload | Rows could be kept or discarded for the wrong destination | Stock PROJECT menu in native emulator on disposable cards | Pass. Missing stored files preserved bank A and R04. Completed stored reload selected bank B and cleared R04. OFF recovered the full pool in both cases. |
| STOP, OFF and stock Arranger | Queued source changes or handlers could survive removal | T2 slice and Arranger recovery fixtures | Pass. STOP cancelled the queued change; OFF restored callback heads and all 786432 pool bytes. Stock Arranger playback matched before and after removal. |
| Shared hook interaction | Panel, source or wrap registration could conflict with base owners | Candidate build by named hooks, callback heads before/after OFF and upstream-only compile | Pass on the candidate for bindings and T2 unload. Blocked on upstream main for the three proposed bindings; catalogue-only compatibility excludes CLYPS. |
| Physical MKII | Audio, cost, USB trial and persistence require the real instrument | Separate authorization required | Not run. Trial, soak, pricing, rollback and inventory, MAIN/CUE listening and persistence remain open. |

### Physical MKII admission recheck after #1910 merged — 23 November 2026

**BLOCKED before opening a device session.** macOS enumerated an Elektron Octatrack DPS-1 over USB. The artist identified the intended instrument as MKII / OS 1.40C. Its revision, running base, module inventory and saved Part were not read from the unit. No transport, trial, project or card command was sent. There was no physical rollback to verify.

The draft was recovered at 188bda33a5d71f2001b941b80bcd1f6b724b8d41. The current upstream SDK tested was 4035fdfa857d1c83929bd9b2776871ab17432559, after #1910 merged. With that main merged locally at 2949c6f87cb59aa48394cabaad48888b35bce4a7, the CLYPS source tree was identical. The plan printed twelve steps. The host-only procedure reproduced step 1 FAIL on both checkouts. The draft doctor could not open the staged octamod.module.json. Compiling the draft against the new upstream SDK separately failed on the incomplete modwerk_modal_input struct and undefined MODWERK_MODAL_INPUT_ABI. The upstream Octatrack registry and SDK lack the candidate wrap, per-track audio source and modal-input bindings.

| Official step | Status | Observation |
| --- | --- | --- |
| 1 Software checks | FAIL | Draft manifest missing during staging |
| 2 Compatibility | BLOCKED | Runner stopped at 1. Standalone catalogue check passed for 44 active modules and 946 pairs. It excludes the CLYPS draft. |
| 3 Identify build | BLOCKED | No official CLYPS build |
| 4 DSP cost model | BLOCKED | Runner stopped at 1 |
| 5 Emulator rehearsal | BLOCKED | Runner stopped at 1 |
| 6 Read unit | NOT TESTED | USB enumeration only |
| 7 Scripted trial | NOT TESTED | No eligible package |
| 8 Soak | NOT TESTED | No trial |
| 9 Cost | NOT TESTED | No CPU, frame or guard samples |
| 10 Restore | NOT TESTED | No device-state change initiated |
| 11 Manual cases | NOT TESTED | Physical playback, isolated T2 launch, early/late timing, ARR/popup, STOP and removal all unmeasured |
| 12 Artist stage | NOT TESTED | No physical session |

Two local builds with the contributor SDK at 5c32cbacd2b1efea3d70e9b543a9a43cfe634651 produced identical MWRM SHA-256 32ebca98345840f4e107550683f4fd14f2be35e5355df3d8933b7132f324aea9. Both used the draft's candidate builder. All ten host tests passed.

To unblock admission, land the shared wrap callback, exclusive audio source selector and modal-input opt-in with loader capability enforcement in the supported development base, then bind the staged module manifest and SDK builder to that contract. Restart the procedure at step 1. The existing integration proposal uses slots 63–65 and feature 0x4000, pending allocation. Before a device trial, independently identify the running base, inventory, saved scratch Part and supported rollback route.

## Private performance overlay · 25 November 2026

See [PERFORMANCE_SPRINT01.md](PERFORMANCE_SPRINT01.md) for the exact package, positive and negative scope and independent stock-composite replay.
