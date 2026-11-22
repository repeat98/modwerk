# Testing the public source

Run `python3 -B sdk/drafts/clyps/test_renderer.py`. A host C compiler runs the actual input and display routines against synthetic adapter state. With m68k-elf-gcc installed the suite also compiles both translation units for MCF54455. There is no installable public module.

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
