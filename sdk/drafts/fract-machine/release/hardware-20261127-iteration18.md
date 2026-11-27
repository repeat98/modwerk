# FRACT 0.1.7: two-reader hardware observations — 27 November 2026

Two-reader development125c completed the current format and active USB workloads without new guarded render skips. One FRACT owner was selected on each T1-T8, one at a time; the second owner was refused. This supports keeping two readers. It does not establish unrestricted workload capacity or release approval.

## Exact builds and scope

| Purpose | Package SHA-256 | Base |
| --- | --- | --- |
| Released-base candidate | f8063d691afc26ab4fe69a3fa709d2b12c68d93b203f0a84536d1755d33755c4 | 24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5 |
| Normal development | 125c0ab3c7ac9b5cf8afc45710bca68ef62f8e55b34c8bb6fa20e6ae2379a165 | 46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f |
| Private timing probe | 89411b02fd8ff18696d18427cb60120247b531d0ddacf6f43b6c923406c63c8f | 46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f |

Public macOS/Linux builds reproduce byte-identically. Development/probe audio and timing below do not qualify public-package audio. Probe reproduces the normal development image and preserves all eleven original executable units; its wrapper/tick instrumentation adds overhead. No Keep or NOR write occurred.

## Fixed procedure and actual machine admission

The first run failed its initial T1 pick with CPU FULL; T5 and all twelve settled Part transitions passed. The base retains played-load history until four seconds of sequenced playback. After six seconds of native playback the unchanged package passed the second run's mandatory T1/T5 checks (audition peaks34.4/31.5%) and all twelve Part transitions. Protections remained at Part allowance45 and render share80.

The control/MIDI soak completed 2400 operations in122seconds,272pattern changes and20operations/second. Its starting Parts contained native FLEX, so this is installed-module control soak, not FRACT audio stress.

The procedure's price step falsely succeeded: basename dev.mwrm resolved to IDdev, leaving a valid at-rest reading but curve.error="not an effect or a machine: no curve". It is excluded as cost qualification. Separate SDK PR2297 makes missing/error curves fail rather than exit successfully. A correctly named standalone single-owner repeat is recorded below.

A native A16 empty pattern played for six seconds before selection allowed all T1-T8 to render, each restored to native FLEX and the exact saved scratch Part. With T2 owning FRACT, a second T1 owner was refused without Part changes. Earlier picks after loaded/stopped audition were conservatively refused CPU FULL; they remain failed attempts, not universal-admission passes. The documented price tool uses the empty-pattern preparation too.

The correctly named `fract-machine.mwrm` repeat completed a single-owner curve on T1. Observed longest-frame addition28.3points; measured rest0; descriptor40 retained. Empty admission48.8%longest frame and medium96.3%,both admitted with0dropped/0stalls. An independent read-only Part observer saw three separated FR01 signature groups through curve/empty/medium placement (18observations). The corrected SDK validator returned no problems. The tool restored allowance45; scratch Part1 was reloaded and byte-checked exact. This does not test multiple simultaneous FRACT instances or qualify arbitrary loads. Scalar receipt: price-single-owner-20261127-iteration18.json.

## Normal development125c four-format workload

Own scratch project FR27M18, banks A-D: 44.1kHz,88200sample frames,16/24bit mono/stereo,120BPM,64T1trigs; native Part1 FLEX loop2/TSTRoff, FRACT defaultPart3/extremePart4. Twenty verified windows: three seconds warm and six seconds measure, with four-channel USB companion installed but recorder idle. Every window checks actual Part/machine/slot/voice/controls and no new guarded skips.

| Format | FLEX quiet / active mean % | FRACT quiet / default / extreme mean % | Largest active-minus-quiet |
| --- | --- | --- | --- |
| 16bit mono | 27.0 / 31.6 | 31.0 / 59.3 / 63.1 | 32.1 |
| 16bit stereo | 27.1 / 31.7 | 31.0 / 60.0 / 64.0 | 33.0 |
| 24bit mono | 27.1 / 31.7 | 31.0 / 59.7 / 63.3 | 32.3 |
| 24bit stereo | 27.1 / 31.7 | 31.0 / 60.1 / 64.5 | 33.5 |

Descriptor price40 is unchanged. These mean comparisons are not a peak/static headroom guarantee. Scalar record: matched-price-20261127-iteration18.json.

## Active MAIN+CUE USB audio

Normal development125c plus four-channel USB companion, FR27M18 A06/Part2:64native parameter locks,threeLFOs,22MAIN/PAN/SRNG control windows over122.0027seconds. Recorder actively running at both endpoints. Guard skips0 before,0 at the end including STOP; frames/ticks advanced and no new crash/stall. Historical base stall marker7 did not grow.

Recording:124.3545seconds/5484032frames at44.1kHz,all4channels nonzero. After trimming3seconds at both ends,118.3545seconds had no simultaneous exact-zero frame. Adjacent equal16-frame blocks3409(maxchain11);equal64-frame blocks3(maxchain2). This is digital inspection, not a complete dropout detector or listening approval. See audio-sanity-20261127-iteration18.json.

The retained normal+USB trial lasted1440seconds including idle time, not24minutes of active audio. It logged no crash/stall/freeze/late/guard-skip fault but retained four CPU notes:two over-limit and two >=90%for1second. Standard Undo returned normalgen10; independent readback showed empty inventory/missing and original set87f28.

## Private probe89411 observations

Twelve valid series:fourformats times nativeFLEX/default/extreme. Three seconds warm, GUARDreset,three seconds settle,then five seconds collection. GUARD resets frame count as well as maxima; the initial flags5 capture crossing that reset was rejected and retained separately. All accepted series had4-6complete windows,consistent clocks and zero new guarded skips. Maximum timer/frame relative error0.000157642 (allowed0.05).

Observed inclusive callback block peak168.7955us; call peak131.2121us; at most2calls/block. These lifetime maxima include native FLEX and timer/call overhead, exclude trailing probe bookkeeping, and are not an exclusive/static WCET. Nominal frame362.8118us; whole-ISR guard share290.2424us also pays base/other work and is not module headroom.

Matched24bitstereo at PTCH64: native whole-frame maximum219.1376us,idle57.4420%; FRACTdefault322.1758us,idle34.4313%. Guard maxima cover post-reset settling plus capture, not since boot. Extreme presets use PTCH127, so they are not same-pitch native comparisons. A separate high-pitch native attempt failed its stored-value assertion; no timing result is claimed and the own scratch Part was restored byte-exact. All12valid series remain intact. See probe-observations-20261127-iteration18.json.

## Tool fixes and retained failures

SDK PR2295 checks panel ACKs, retries explicit queue-full refusals with a bound and attempts all chord releases. Its scripted and GitHub checks passed; the old missed Part4 transition's cause was not proved. Current settled12transition tests pass. SDK PR2297 fixes false-success curve runs; neither fix is mixed into the module-only source PR2296. Existing SDK corrections2283/2294 remain separate; unchanged main has stale3reader/9copy assumptions, so module-only CI remains blocked pending those merges.

Two unchanged development-base RAM boots lost USB before FRACT upload. User manually recovered; a third unchanged boot after133seconds stable succeeded. Timing correlation is not a proved fix. Recovery/readback and the failed attempts remain local. This predates module installation and does not erase the shared base issue1985.

## Restoration before the final released-base trial

Original PRESETS/PROJECT261111 A01/Part1 was loaded without SAVE/RELOAD. All eight current/saved Part copies matched initial snapshots; original Part1 working/saved difference was preserved. The CF volume UUID was freshly checked, all28original control files matched before and after archiving/removing only FR27T18/FR27M18, and checked disk eject completed before leaving USB DISK MODE. This is a28control-file comparison, not a hash of the whole audio library. Released24e returned over RAM successfully, normal/empty inventory/missing/set87f28, with original confirmed NOR slots1/gen10 and0/gen8,no fallback. Part memory comparison is the last development-base observation before this boot; public MEM driving is unavailable.

## Exact released-base install-only trial and final state

The exact public-candidate packagef806 on released24e ran a45-second RAM trial on the original native project. SELF TEST passed with1/1modules intact. No crash/stall/freeze/skipped-track fault was logged. Standard automatic Undo returned normalgeneration2; independent readback confirmed exact24e,emptyinventory/missing,originalset87f28,confirmedNORslot1/gen10 andslot0/gen8,no fallback. This was install/integrity/Undo only: no released-base audio control or musical test. See public-install-20261127-iteration18.json. The owned server/bridge/trials/recorder are closed, the unit queue is free, and the temporary build VM was stopped.

## Remaining qualification

Exact released-base audio, the remaining full companion/lifecycle matrix, human listening and exact-version Keep/reboot are pending. Static CPU cycles remain null with reasons. The owner's accepted timing method is issuecomment6705531953 on PR1274; any waiver and first-release decision are still theirs. Catalogue/package rows remain inactive and PR2296 remains draft. No first-release approval is claimed.

The metadata recheck initially stopped before API on an outdated offline-report sentence assertion. The sentence was restored with its correct offline-only scope; a subsequent install-only receipt requires the separately updated SDK check in PR2283. No failed check is counted as passed.

Jev is advisory and partial: module scope used10/12API calls,0flags,8uncertain locations independently investigated,29deferred including one C parser blocker and7static-only fragments. Source/binary tests supplement those gaps; this is not complete diff coverage. Panel review8/12,0flags/8uncertain/42deferred/1static-only; price review6/10,0flags/6uncertain/1deferred/1static-only. Deterministic checks passed in their scopes. Full SDK PR checks passed; module-only CI blockers are retained.

The scoped-receipt update to SDK PR2283 was reviewed separately:2/8API calls,0flags,2uncertain,0deferred,1static-only changelog,attention omitted0. Both uncertain functions were independently checked against builder/callers and actual current/legacy receipts; five inconsistent receipt mutations were rejected. No confirmed defect; model uncertainty remains recorded.
