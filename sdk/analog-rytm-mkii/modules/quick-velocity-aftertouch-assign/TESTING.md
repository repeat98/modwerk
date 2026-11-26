# Improved Modulation testing

The module was called Quick Mod Assign up to 0.3.1 and Improved Mod Assign in 0.4.0; since 0.5.0 it holds QPER Live Rec (`qperf`), whose own records follow at the end. The records keep the names they were written with.

## 0.7.0: several QPER links, FIX, CHRO and LFO + PLAY, quantized scene changes (25 and 26 Nov 2026)

QPER + a pad links and unlinks again (any number), and the PERF hold acts on every linked performance: a knob locks all, PLAY clears all, STOP pastes onto all, YES applies their sum, each with one undo. FIX + PLAY and CHRO + PLAY set the sound's velocity or aftertouch links to 0, PLAY again undoes. LFO + RECORD, STOP, PLAY held from another page copy, paste and clear the LFO page with stock's page routines. Scene changes recorded in LIVE RECORDING follow its quantize switch.

rytm-emu (2ac0f1f, ramboot build), Q701 to Q708 on the plain base 1c14b6b0; not hardware evidence. The default kit links performances 1 and 10 and a new project has LIVE REC quantized:

| Check | Result |
| --- | --- |
| On the LFO page (stock's key), LFO + PLAY | CLEAR PAGE LFO; PLAY again in the hold: CLEAR PAGE LFO again, no undo |
| On the SYNTH page with 0.6.0 (Q610), LFO + PLAY | the sequencer starts, nothing clears |
| LFO linked to DEC from the SYNTH page; LFO + PLAY | CLEAR PAGE LFO, the box gone, the LFO page then shows DST with no destination; the page stays, the sequencer stopped |
| LFO + RECORD, then PLAY, then STOP | COPY PAGE LFO, CLEAR PAGE LFO (box gone), PASTE PAGE LFO (box back at +1.03) |
| FIX + DEC linked at +3; FIX + PLAY; PLAY again | CLEAR VELOCITY MODS, the box at 0; UNDO CLEAR, the box at +3 |
| FIX + PLAY with every amount at 0 | NOTHING TO CLEAR |
| QPER + SD (1, 2 and 10 linked); PERF + SWT | one box at +5; with performance 1 unlinked the box is still there |
| The same; PERF + PLAY; PLAY again | CLEAR PERFORMANCES; UNDO CLEAR, the box back |
| The same, amount set; PERF + YES; YES again; then a plain PERF hold | PERFORMANCES APPLIED; UNDO APPLY; performance edit's screen byte-identical to never applying (LOCKS: 14) |
| 2 and 10 linked; PERF + RECORD, PLAY, STOP; STOP again | COPY PERFORMANCE 2, CLEAR PERFORMANCES, PASTE PERFORMANCES (box back); UNDO PASTE (cleared again) |
| 1, 2 and 10 linked; copy performance 1 (14 locks), PLAY, STOP | LOCK MEM FULL!, everything as the clear left it (three copies do not fit the 48 slots) |
| Nothing copied; PERF + STOP with several linked | NOTHING TO PASTE |
| One linked (10 unlinked first): PERF + knob, YES and its undo in a new hold, PLAY and its undo | PERFORMANCE 1 APPLIED, UNDO APPLY, CLEAR PERFORMANCE, UNDO CLEAR, as 0.6.0 |
| A scene change at six offsets around a step boundary, quantized and unquantized, RECORD + YES, the first step with the scene's locks | unquantized: the step the change fell in; quantized: that step when it came in its first part, the next one after that |
| 0.6.0's ten scene checks (apply, undo in a new hold, relock, empty apply, RECORD held, one and two changes in a take) | byte-identical to Q610's screens |

Rig cases, rytm-emu, the development base 25f2c915: 32 of 33 on R705 and R706; the one failure is the private case for the old SAMPLER hold, as on 0.6.0. The unit cases below ran on R706 in rytm-emu first.

Screenshots: Q708's captures. The ten earlier files are byte-identical to 0.6.0's (perf-lock.png with a plan that no longer presses QPER + BD); `fix-clear.png` and `lfo-page-clear.png` are new. Memory: Q708 leaves 84,908 bytes of the shared mod area (the base alone 118,836), so the module takes 33,928.

Two independent code reviews, both before the unit run. The first found LFO + STOP passing the clear's kind to stock's page undo (so it undid a clear and never undid a paste), the several-performance undo running over a lock made since by a pad, a paste onto several with no room check that left stock's own undo armed, FIX and CHRO + PLAY reaching track 12's slots with the FX track selected, two linked performances' offsets clamped one by one where the engine sums them, and a pending quantized start ignored by two fills; fixed in Q706. The second found the fixes sound and two faults in the new paste (a full-table message with nothing pasted, and a paste cut short evenly on every performance going unseen) and a weak fingerprint for the undo; fixed in Q707, whose paste path has had no further review. Q708 is Q707's source with this version's records.

On the author's unit, 25 Nov 2026, R707 (image CRC `8b6c1d98`) RAM-booted over the flashed FXCJ, scratch project, track 9 (CH) selected, by the test rig:

- PERF + RECORD: COPY PERFORMANCE 1 (performance 1 linked).
- FIX + D, then FIX + PLAY: CLEAR VELOCITY MODS; PLAY again: UNDO CLEAR. The sequencer stayed stopped.
- CHRO + D: AFTERTOUCH MODS FULL (the sound's four slots were in use). CHRO + PLAY: CLEAR AFTERTOUCH MODS; PLAY again: UNDO CLEAR; CHRO + D then AFTERTOUCH MODS FULL again, so the four amounts were back.
- LFO + D from the SYNTH page: DEC's box. LFO + PLAY: CLEAR PAGE LFO, the box gone, the SYNTH page and the stopped sequencer as they were; PLAY again: CLEAR PAGE LFO again.
- LFO + RECORD: COPY PAGE LFO (the box at +0.12); PLAY: CLEAR PAGE LFO, the box gone once the message closed; STOP: PASTE PAGE LFO, the box back at +0.12. A second STOP pasted again (PASTE PAGE LFO), no undo.
- QPER + SD (1 and 2 linked), PERF + D: DEC's box. With 1 unlinked the box stayed and PERF + RECORD said COPY PERFORMANCE 2; with only 1 linked the box stayed and it said COPY PERFORMANCE 1: both took the lock.
- 1 and 2 linked, amount by MIDI CC 35: PERF + PLAY: CLEAR PERFORMANCES; PLAY again: UNDO CLEAR; YES: PERFORMANCES APPLIED; YES again: UNDO APPLY.
- Scene mode: SCENE + A locked TUN in scene 9. RECORD + PLAY: LIVE REC: QUANTIZED. Scene 2 then scene 9 engaged, RECORD + YES: APPLY PERF/SCENE REC; RECORD + NO: NOTHING TO CLEAR.
- SCENE + knob, SCENE + YES and YES again in the same and in a new hold: SCENE 9 APPLIED, UNDO APPLY, as on 0.6.0.

Not tested: 0.7.0 by hand or by ear; this package's own image on a unit; on the unit, which step a quantized scene change lands on, a paste onto several performances, a full lock table, and a pad's lock made between a clear and its undo (rytm-emu and code review); FIX and CHRO + PLAY's undo after a sound load; the FX track's LFO page keys.

## 0.6.0: PERF and CHRO holds, SCENE + YES, scene changes in the quick perf rec (25 and 26 Nov 2026)

The PERF hold takes the gestures QPER held (QPER keeps its link), CHRO holds the aftertouch assign (SAMPLER is stock's again), SCENE + YES writes a scene into the kit, and the quick perf rec keeps scene changes. The undo of an apply now also accepts the value it expected to write, so it does not depend on when stock's setter lands.

rytm-emu (2ac0f1f, ramboot build), Q602 to Q610 on the plain base 1c14b6b0, against stock QS00 where stock does something; not hardware evidence:

| Check | Stock | 0.6.0 |
| --- | --- | --- |
| CHRO held, DEC turned on AMP | a plain edit | DEC's box at +11, as SAMPLER's hold gave |
| SAMPLER held, DEC turned | | a plain edit: stock's again |
| CHRO tapped, then SD | chromatic mode: SD plays a note, the track stays BD | the same (rig case look-chro-150) |
| CHRO held 0.8 s, then SD | | no toggle: SD selects its track (look-chro-800) |
| PERF held, nothing | performance edit opens 0.2 s in | performance edit opens on the release (PERF: 1, LOCKS: 13) |
| QPER + BD (link), PERF held, B turned | | SWT's box at +5 |
| ...PLAY | | CLEAR PERFORMANCE |
| ...YES (amount poked to half), YES again | | PERFORMANCE 1 APPLIED; UNDO APPLY, the box back |
| QPER held, B turned | a plain edit | a plain edit: stock's again |
| SCENE held, YES | | SCENE 1 APPLIED, the boxes gone; DEC then reads the lock's value (23 after one click, kit 98 before) |
| ...YES again in the same hold | | UNDO APPLY, the boxes back |
| ...YES in a new hold | | no undo: nothing left to apply |
| Scene mode, LIVE RECORDING, BD pad (scene 1), RECORD + YES | | the take applies (1 TRACK LEFT OUT, as a performance 1 take through this pattern also says); a trig held inside the recorded stretch shows DEC 22, MOD 6, LEV 127 as locks, a trig before it none |
| The same with no scene change | | NOTHING TO APPLY |
| Scene engaged while stopped, then LIVE RECORDING | | NOTHING TO APPLY: no take from a change made while stopped |
| Scene 2 recorded, LIVE RECORDING off, scene 2 disengaged by hand, a pass later | | scene 2 engaged again by the lane (scene edit shows SCENE: 2; before the pass came round, SCENE: 1) |
| Scene 2 engaged in LIVE RECORDING, RECORD + YES | | scene 2 is disengaged by the apply (scene edit shows SCENE: 1, none active), so its locks play only on the steps that got them |

The nine gesture screens are byte-identical between Q602 and Q604 (before and after the review fixes). Screenshots: Q610's captures (byte-identical to Q608's); seven earlier files are byte-identical with the new plans (CHRO for SAMPLER, PERF for QPER's knob), the two quick perf rec captures show the new messages, `perf-lock.png` is new. Memory: Q610 leaves 87,728 bytes of the shared mod area (the base alone 118,836), so the module takes 31,108.

Rig cases, rytm-emu, R605 (`9a2af68e…`) and R606 (`002b19ad…`), the development base 25f2c915: 32 of 33 pass. The one failure is the private case look-sampler-800, which tested the old SAMPLER hold: SAMPLER now opens the recorder as stock does. The two new CHRO look cases pass.

An independent code review of 0.6.0 found five faults in SCENE + YES and the scene lane (an undo that outlived its hold, a scene the lane had engaged that a hand could not record again, a take armed by a change made while stopped, no new scene take after RECORD + NO, a scenes-only take not following a longer loop) and smaller ones (the first change after a gap not played back, a quick CHRO tap losing its toggle, recording running on after LIVE RECORDING went off, the audio block and the UI tick both writing the lane). All are fixed in Q604/Q605: the lane now lives in the UI tick alone. A second review of those fixes found RECORD + YES leaving the take's scene engaged, the tick recording one point where it had passed several, a cut position read ending a take early, the lane's period not following a shorter loop, and a pending wipe ignored by RECORD + YES; fixed in Q606, where the seven lane checks above give the same screens as on Q604. A third review, after the hand test's changes, found a take recorded from another kit's scene at the loop's wrap, a gap at a second change in one take, an undo that could replace a lock made since, and three smaller faults; fixed in Q608. A fourth review of Q608's fixes found them sound and one fault beside them: SCENE + YES on a scene with no locks (NOTHING TO APPLY) left the undo of a scene applied before armed but emptied, so YES on that scene showed UNDO APPLY and brought nothing back. Fixed in Q609 with one line (an apply that finds nothing leaves no undo, as PERF + YES already did): in rytm-emu, scene 1 applied, YES on the empty scene 2, YES on scene 1 again shows UNDO APPLY on Q608 and NOTHING TO APPLY on Q609; the ten checks of the next paragraph and the ten screenshots are byte-identical between Q608 and Q609. A fifth review, of both apply and undo paths, found the bounds and pointers sound and two gaps: a project load did not forget the undos, and a scene undo with the 48-lock table filled since put back what fitted and said UNDO APPLY. Fixed in Q610: the project event forgets both undos, and a scene undo with no room for every lock applies afresh, as PERF + YES already did (a slot is free when its track byte is above 12, read from stock's finder at 0x400b8558). A sixth review found nothing in those two fixes. The eleven checks and ten screenshots are byte-identical between Q609 and Q610; the two new paths themselves have no emulator plan (code review only).

After the hand test (below), Q607 and Q608, rytm-emu: SCENE + YES and SCENE + PLAY 0.05 s into a hold act at once (SCENE 1 APPLIED, CLEAR SCENE); a second SCENE + YES in a new hold shows UNDO APPLY, and so does PERF + YES; after the apply, DEC locked again and SCENE + YES pressed applies afresh (SCENE 1 APPLIED, no undo); RECORD held, SCENE touched, YES leaves the scene alone (20 locks still); a take with scene 2 then scene 1 writes no locks on a step in scene 2's stretch and scene 1's on a step in its own; RECORD + YES and NO show APPLY PERF/SCENE REC and CLEAR PERF/SCENE REC. Rig cases: 32 of 33 on R608 (`5686e0f6…`) on R609 (`d2c5ff83…`) and on R610 (`4e8da936…`), the same expected failure.

On the author's unit, 25 Nov 2026, each image RAM-booted over the flashed FXCJ, scratch project:

- The test rig, R606 (image CRC `2d8393fe`): PERF + B drew SWT's box at +4 on the linked performance, PLAY showed CLEAR PERFORMANCE and PLAY again UNDO CLEAR; CHRO + DEC on AMP drew DEC's box and left DEC at INF; SCENE + YES showed SCENE 10 APPLIED and YES again UNDO APPLY with the box back; QPER + B was a plain edit; SCENE + knob and SCENE + pad + knob as on 0.5.0.
- By hand, reported by the author, R606: CHRO's assign and tap passed; SAMPLER opened the recorder at once, as stock; QPER + pad moved the link; SCENE + YES applied. PERF + YES said NOTHING TO APPLY (the QPER knob had not moved since the restart, so its amount was 0). In PERF mode PERF + pad played the pad, which the author then chose to keep. A second SCENE + YES after letting go said NOTHING TO APPLY, and the keys needed the hold to be under way: both changed in R607 at the author's request, with the messages.
- The test rig, R607 (`8594ba68`) and R608 (`be8b1c96`): SCENE + YES pressed at once showed SCENE n APPLIED, and YES in a new hold UNDO APPLY with the boxes back; PERF + YES with the amount set by MIDI CC 35 showed PERFORMANCE 1 APPLIED and YES in a new hold UNDO APPLY; in scene mode with LIVE RECORDING on, scene 2 then scene 9 engaged, RECORD + YES showed APPLY PERF/SCENE REC and RECORD + NO then NOTHING TO CLEAR (a take with scene 2 alone, which has no locks there, gave NOTHING TO APPLY).

- The test rig, R610 (`474a8330`, the final source): the six cases above again, with the same screens' messages (SCENE 1 APPLIED and UNDO APPLY in the same and a new hold, PERFORMANCE 1 APPLIED and UNDO APPLY, APPLY PERF/SCENE REC, NOTHING TO CLEAR), and a seventh: scene 9 applied (SCENE 9 APPLIED), SCENE + YES on scene 2, which has no locks (NOTHING TO APPLY), then on scene 9 again: NOTHING TO APPLY, no false UNDO APPLY.

Not tested: this package's own image on a unit; a project load after an apply, and an undo with the lock table full (code review only); scene playback from the take and the written locks by ear on the unit; a scene take across a loop length change; scene changes by MIDI; R607's and R608's changes by hand.

## 0.5.0: QPER Live Rec folded in (25 Nov 2026)

QPER Live Rec 0.3.0's source moved in unchanged as `src/qperf.c` (only its header's name changed), with its hooks, three stock sites and claims; its tick still runs before this module's own, as when the two were separate (the linker orders equal orders by module id). Since then: a second QPER + YES in the same hold undoes the apply, and SCENE + REC, STOP and PLAY act at once in scene edit and after 3 ticks (0.1 to 0.15 s) on a page; see QF03, QF04 below.

rytm-emu (revision 2ac0f1f, ramboot build of `dtboot`), not hardware evidence:

| Check | Result |
| --- | --- |
| QB01 (the published Improved Mod Assign 0.4.0 and QPER Live Rec 0.3.0 packages linked side by side, plain base 1c14b6b0) against QF01 and QF02 (this folder, the same base) | 13 screens byte-identical: the seven FIX/SAMPLER/LFO/SCENE captures, SCENE + REC, QPER held with a knob, QPER + YES, QPER + PLAY, and the two quick perf rec captures (cold boot, LIVE RECORDING, RECORD + YES and RECORD + NO) |
| Free shared mod RAM | QB01 and QF02 both 94,136 bytes; the base alone 118,836, so the fold itself takes 24,700; QF04 (with the undo record) 93,084, so the module takes 25,752 |
| The screenshots | QF02's nine captures are byte-identical to the committed files (QM46 and QX07) |
| Rig cases (31, the SCENE and earlier cases) | pass on QS11 and QS12 (the development base 25f2c915 with the link) |

On the author's unit, by the test rig with the author's go, 25 Nov 2026: QS11 (this source before the tick-order fix, RAM-booted over FXCJ, image CRC `aaf0e7a3`, scratch project). SCENE + knob, SCENE + pad + knob and the scene-mode pad as on 0.4.0; QPER + BD linked performance 1, QPER + A drew its lock box, QPER + PLAY showed CLEAR PERFORMANCE and PLAY again UNDO CLEAR with the box back. Not on a unit: QS12 and this package's own image.

QF03/QF04 and QS13/QS14 (the undo and the SCENE timing), rytm-emu: QPER held, BD linked, SWT's lock raised, performance 1's amount poked to half: YES showed PERFORMANCE 1 APPLIED, a second YES UNDO APPLY with SWT's lock box back, and the screen after the release is byte-identical to one where YES was never pressed. In scene edit SCENE + REC 0.05 s into the hold showed COPY SCENE 1; on a page REC 0.05 s in toggled record as stock, 0.15 s in COPY SCENE 1. Rig cases: 31 pass on QS13. On the author's unit by the test rig (QS13, CRC `72809630`, scratch project): SCENE + knob, SCENE + pad + knob, the scene-mode pad, SCENE + REC at once in scene edit (COPY SCENE 1), and, with performance 1's amount set by MIDI CC 35, QPER + YES (PERFORMANCE 1 APPLIED) and YES again (UNDO APPLY, the boxes back). An independent review of the undo and timing: correct; its fixes are in QF04/QS14 (a value changed since the apply is left alone, a link move forgets the undo, 3 ticks for the page wait). QF04/QS14 themselves: rytm-emu only.

An independent code review of the fold: no symbol or section clash between the two parts; its fixes are in (the retired id kept readable in saved sets, the capture record, the library test, the tick order, the memory figure).

The rytm-emu runs below were observed on the named build; the emulator is not hardware evidence. The unit results are the author's reports, labelled as reported.

- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Base: Modwerk base for core-ar2 0.7, `0c92aa45`.
- Build QM03 (core + Quick Velocity+Aftertouch Assign, FIX and RTRG, amount popups): `.syx` `13a7016fb97323374f1a1a8e422f0c9c5d0d52c393c23fd675f11feff9a76c7a`.
- Build QM04 (after a review: any turn during a FIX hold keeps fixed velocity; a missed release frees the knobs; a pad held in PERF or SCNE leaves the turn to stock): `.syx` `d8d093d9624e2be570ee157265f35e2bdfd1c8c63eeea3472c9a7642705da395`.
- Build QM05 (after a second review: a fresh press always starts a new hold; slot matching uses the stored index; top_view stops at the list's end): `.syx` `1091da0e3fb555d566bf8ae0c8f50d8a8e1bb6f1f7768fe469e1010e12e692bf`.
- Build QM06 (one pad scan per knob event): `.syx` `14eb5448616b9fc2622591f653f994260713396f442ba57570e5fe0bb6511606`. In combo RC17 (`b1179a85…`).
- Build QM09 (SAMPLER replaces RTRG for aftertouch; stock's lock-style display with a V or A marker instead of the amount popup; PERF and SCNE edit screens; the other key ignored during a hold; the locker kept with the hold by the tick): `.syx` `c94a8b7b160764343861aec67fc08f65a631cf4f200f3b79d5ce93fe184921f4`.
- Build QM10 (QM09 compiled with `-Os`, so the full set fits the shared mod RAM): `.syx` `a66959671562940659007d03adfd0f1f37345c9012b33c98a25994baaefe2059`. The links, display, SAMPLER, SLOTS FULL, PERF and FIX-key checks below rerun on it with the same results.
- Build QM11 (QM10 without the V/A marker; popups read VELOCITY MODS FULL, AFTERTOUCH MODS FULL, NOT A VELOCITY TARGET, NOT AN AFTERTOUCH TARGET): `.syx` `7ef00e24371b1d572da3ec60ca21be4d059b32decfe15f3a334c75486788e3f9`.
- Build QM12 (after a code review of the PR: on the FX track FIX and SAMPLER are left to stock, and selecting the FX track during a hold ends the lock-style display so its knobs edit): `.syx` `35686f80e0676a7d7e86fb66c30d706e7f8637f7c97891562e68902882b3739f`.
- Build QM13 (QM12 with the default `-O2` instead of `-Os`, at the author's request; 3,540 bytes of code and data, 44 of `.bss`, against QM12's 2,820): `.syx` `5411d03afe652f441b6cc30a80746c6be85759faa0971cad2a0224f91f90076a`. Every QM12 row below reruns on it with the same screens, pixel for pixel, and the same fixed-velocity readings, 0 faults.
- Emulator: rytm-emu `2ac0f1f`, headless `dtboot`, a fresh card, the default kit (BD PLASTIC on track 1), the SYNTH page unless named. Events off the `--every` grid. Slots read on stock's MODULATION SETUP screen; fixed velocity read from stock's flag in RAM.

## rytm-emu (QM09, rerun on QM10; QM11 rows marked)

| Check | Result |
| --- | --- |
| Boot | to the main screen, 0 faults in every run |
| FIX held, SWT turned 10 detents | V at the top left; SWT drawn as stock's lock box `+8`; SWT's own value unchanged; MODULATION SETUP VEL slot 1 BDPL SWT 8 |
| FIX released, held again | SWT still shown `+8` |
| SAMPLER held, SWD turned | A at the top left; SWD `+8`; aftertouch slot written |
| FIX + TUN, 6 detents (a fine parameter) | TUN `+5` |
| AMP page, FIX + ATK, 12 detents | ATK `+10`; the envelope graphic draws the longer attack |
| FIX + SWT, SWD, DEC, TUN, then MOD | four boxes `+2`; MOD gives `VELOCITY MODS FULL` (QM11) and changes nothing |
| SAMPLER + SWT, SWD, DEC, then TUN (QM11) | three boxes; the new kit's FRQ +16 holds the fourth slot, so TUN gives `AFTERTOUCH MODS FULL` |
| FILTER page, SAMPLER held (QM11) | FRQ `+16`: the new kit's aftertouch link |
| FILTER TYPE with SAMPLER (QM11) | `NOT AN AFTERTOUCH TARGET`, fits the popup |
| No marker (QM11) | nothing drawn in the corner |
| SAMPLER tap | stock's recorder opens |
| SAMPLER held with a turn, released | no recorder; a later tap opens it |
| SAMPLER held 3 s with turns (key repeat) | no recorder during or after |
| FUNC + FIX | stock's FIXED VELOCITY popup, fixed velocity unchanged |
| PERF, FIX + SWT | V, SWT `+5` |
| PERF, FIX held, BD pad + SWT | stock's performance lock (LOCKS 13 to 14); after the pad, V comes back and SWD turns as a velocity link |
| SCNE, SAMPLER + DEC | A, DEC `+3` |
| SAMPLER held, FIX tapped | fixed velocity unchanged, nothing else |
| FIX held, SAMPLER tapped | no recorder |
| FIX tap / two taps / held past repeat | toggles on release / on then off / toggles |
| FIX held with a turn, with LEVEL turned, on the TRIG page with a turn | fixed velocity unchanged |
| TRIG page, FIX + VEL | VEL unchanged (stock's lock edit refuses TRIG parameters) |
| A trig held with FIX, either order | the knob does nothing |
| FIX + LFO DST | nothing |
| FILTER page, FIX held | the new kit's FRQ and RES links at 0 shown as `0` boxes |

Earlier builds (QM03 to QM06, RTRG and popups): the same slot writes, TUN, SLOTS FULL, FIX key, LFO DEP accumulation and popup throttling checks passed; QM01 left fine knobs at 0 and QM02 never toggled FIX (both fixed).

Not tested: kit save, reload and power cycle on QM07 or later; SOUND MANAGER; the sequencer running; MUTE and CHRO screens; a sample machine; beside Ctrl All and Velocity Humanise; a missed key release (the emulator always delivers it).

## rytm-emu (QM12, compared with QM11; rerun on QM13)

Fixed velocity read from stock's flag every 100M instructions; screens compared pixel for pixel.

| Check | QM11 | QM12 |
| --- | --- | --- |
| The four screenshots in `media/` (FILTER + FIX, AMP + SAMPLER, MODS FULL, MODULATION SETUP) | identical to `media/` | identical to QM11 |
| FIX tap / two taps / held past repeat / held with a turn, on a sound track | toggles on release / on then off / toggles / unchanged | the same |
| FX track, FIX tap | toggles on the release | toggles on the press, as stock |
| FX track, FIX held, FDB turned | fixed velocity unchanged; FDB edits | toggles on the press, as stock; FDB edits |
| FX track, SAMPLER held, FDB turned, released | no recorder | recorder opens, as stock |
| FILTER page, FIX held, FX track selected, FDB turned | FDB does not move | FDB edits as without FIX |
| Faults | 0 | 0 |

## rytm-emu (0.2.0, LFO assign; QL02 to QL05 and QM20)

| Check | Result |
| --- | --- |
| FLTR, LFO held, FRQ turned | FRQ boxed at 0 (DST FRQ, DEP 0); further turns move the box; the page stays on release |
| DEP through the hold against stock's DEP knob, same raw turns | equal: +1.96 and -1.96 |
| Fast turns, another knob, the destination's knob pressed | +127; DST moves to the new knob at 0; DEP back to 0 |
| LFO held on the LFO page, WAV turned three steps | NOT AN LFO TARGET, WAV unmoved (until QL13; from QL14 the LFO page's key is stock's: the hold shows the values and WAV moves, as on stock, on a sound's and on the FX track's LFO page, QL16) |
| Plain LFO tap with Loop Sync: SMPL, LFO tap, FUNC + knob A | stock's SPD step (before the replay through `core_key`: Loop Sync's box) |
| Plain LFO taps with LFO RND | the second tap reaches LFO RND's page, the third returns |
| FX track, LFO held, TIM turned | TIM becomes the FX LFO's destination |
| FIX + FRQ, FUNC + LFO, FLTR then LFO tap then a turn | as 0.1 / as stock |

## rytm-emu (0.3.0, LFO depth from a locker set without an encoder event)

IQ01 (0.2.0) and IQ02 (the MIDI depth change alone, before the look), each with a private MIDI-to-locker test module (the author's), Filter Hz and QPER
Live Rec on the plain base, BD FILTER page, LFO held 8000M-8400M:
- An NRPN FRQ sweep from 127 to 42 (NRPN 1:20 through that module, which calls stock's locker
  interface): 0.2.0 makes FRQ the destination at depth (0) and the depth never moves; IQ02
  makes it the destination and sets the depth to -85.00, kept when LFO is held again, the sound's
  FRQ unchanged after the release.
- Knob E turned ten times (+12 counts, 6.67M apart) with LFO held and no MIDI: 0.2.0 and IQ02 give
  the same screen, pixel for pixel (the encoder path is unchanged).
- FIX and QPER holds with the sweep: same screens on both.

After a review, IQ03 (the encoder flag cleared at the top of every locker set and on every key
event, and set only for knobs A-H): the same screens as IQ02 for the MIDI depth (-85.00) and as
0.2.0 for the encoder-only run, FIX and QPER.

Not tested on a unit.

## Hardware

**RC17 (QM06 inside), reported by the author, 3 Nov 2026:**
- FIX + knob: the link works (popup build); `VEL SLOTS FULL` shown.
- RTRG + knob for aftertouch: first did not seem to work (the RETRIG popup appears), later reported working; the author found RTRG a poor key and SAMPLER replaces it from QM07.
- FIX tap, FIX held with a turn, FUNC + FIX: pass.
- FIX on the FX track: edits as normal.
- Kit save and power cycle: the links were kept. Sound normal.

**RC18 (QM10 inside), reported by the author, 3 Nov 2026:**
- Envelope graphics follow the amount while assigning.
- New links take the slots of the new kit's FRQ and RES at 0, left to right.
- FIX shows the velocity links, SAMPLER the aftertouch links; FRQ and RES at 0 shown as `0`.
- SAMPLER tap opens the recorder. `VEL SLOTS FULL` and `AT SLOTS FULL` shown. FUNC + FIX: stock's popup.
- Aftertouch modulates the sound as linked.
- Power cycle, kit save and kit reload: the links are kept.
- Asked for: no V/A marker, MODS instead of SLOTS in the popups (both in QM11), and the performance-lock box kept as the display.

**RC19 (QM11 inside), reported by the author, 3 Nov 2026:** all looks good. Stock's default aftertouch link to FILT FRQ (+16) stays as stock sets it.

**QM12 alone, reported by the author, 3 Nov 2026:** all pass:
- FX track: a FIX tap toggles fixed velocity on the press; FIX held with FDB turned edits FDB and toggles; SAMPLER held with a turn, and a SAMPLER tap, open the recorder.
- FILTER page, FIX held, FX track selected: FDB edits, no boxes shown.
- FILTER page FIX links, AMP page SAMPLER links and the recorder tap, the FIX key and FUNC + FIX, VELOCITY MODS FULL, kit save and power cycle, as before.

**0.2.0 LFO assign, run by the test rig on the author's unit (not by a person), 10 Nov 2026.** Build QL02: this branch's 0.2.0 code with Loop Sync 0.3.2, RAM-booted over the flashed OS, scratch project. Six screen cases, each also run on QS02 (the same set without this mod):

| Case | QL02 (with the mod) | QS02 (stock) |
| --- | --- | --- |
| LFO held, FRQ turned on the FILTER page: FRQ boxed at 0, the page stays, LFO page shows DST FRQ | pass | fails, as it should |
| Further turns set DEP as the same turns of stock's DEP knob: +1.96 and -1.96 both ways | pass | fails, as it should |
| Fast turn to +127, another knob takes the LFO at 0, a knob press sets DEP to 0; FRQ and RES themselves unmoved | pass | fails, as it should |
| LFO held on the LFO page, WAV turned: NOT AN LFO TARGET, WAV unmoved (replaced from QL14 by qma-lfo-on-lfo-page: the hold is stock's, WAV moves, the same screens as on QS02) | pass | fails (WAV moves) |
| FIX held, FRQ turned: velocity link +21, FRQ unmoved; a knob press sets it to 0 | pass | fails, as it should |
| Plain LFO taps (FILTER, LFO, SAMPLE pages), then FUNC + knob A steps SPD (Loop Sync saw the replayed tap) | pass | pass (same screens) |

Not covered by the rig: how the LFO sounds, pads, the FX track's LFO, kit save and reload, a power cycle. Seen in the run: during the hold the box rounds DEP down (+1.93 shows +1, -1.93 shows -2).

**0.2.0 on the author's unit, by hand, reported by the author, 10 Nov 2026 (QL05 from RAM, before the depth box showed hundredths and before the DEST wording):** pass: the LFO moves the filter after LFO + FRQ and the LFO page shows DST FRQ and the depth; LFO + TUN and LFO + DEC take the LFO at depth 0, more turns set the depth, a knob press sets it to 0; on the FX track LFO + a delay or reverb knob takes the FX LFO; an LFO tap opens the LFO page on the release and FUNC + LFO is stock's. Not tried yet: pads with velocity and aftertouch links, PERF and SCNE pad locks during an LFO hold. Asked for: the depth in the box at the LFO page's resolution (it showed whole numbers), DEST rather than TARGET in the popups (both in 5fd99549d).

**0.2.0 final (depth box and DEST), the test rig on the author's unit (not by a person), 11 Nov 2026.** QL10 (the depth box at the LFO page's resolution on label knobs, DEST popups, the review fixes) and QL13 (this source: the box also on widget knobs, one width, (0) at depth 0), each with Loop Sync 0.3.2, RAM-booted over the flashed OS, scratch project. The same six cases as above: on each build run 1 differed only on the screens changed on purpose (the depth boxes, the DEST popup; on QL10 also the SAMPLE page's TUN dial, turned by another session, so that case now checks the page by its labels), `--record` 6 pass, plain 6 pass. QL10 came back armed from a project saved under another storage layout: the development base's arm at boot.

**0.2.0 final, by hand, reported by the author, 11 Nov 2026:** on QL10, FIX and SAMPLER links and aftertouch work as before; PERF mode with LFO held and a knob turned assigns the LFO; while a scene or performance lock is being set (its pad held) the LFO key is stock's and a tap opens the LFO page, as intended. The depth box missed knobs drawn as widgets (OVR, DEL, REV, PAN, VOL: whole numbers), fixed in QL12, which looked good apart from the box widening with the digits, fixed in QL13. On QL13: the one-width box is good; with LFO held, a PERF pad held makes performance locks (stock's), and LFO assigns again once the pad is let go.

**0.2.0 package on the author's unit, by hand, reported by the author, 11 Nov 2026 (asked for in review).** The package's own image on the plain base 1c14b6b0 beside LFO RND 1.2.0, both from their pinned packages, flashed (not RAM-booted). QP01 (`d32502dc…`, the package before the LFO page was left to stock): FIX on FILTER shows FRQ and RES at 0, a turn counts FRQ's box up while FRQ's stored value stays; SAMPLER + DEC, pad pressure changes the decay; LFO + FRQ shows the depth in hundredths, (0) at 0, the page stays on FILTER; LFO taps go LFO page, LFO RND's page, LFO page; FIX key as before; kit saved and power cycled, the velocity, aftertouch and LFO links kept. All pass. Asked for: the LFO key stock's on the LFO page, so holding it shows the page's values. QP02 (`dd4a9e66…`, this package, `26c6dce9…`): holding LFO on the LFO page shows the values; two taps from there go to LFO RND's page and back; LFO + FRQ on FILTER, depth in hundredths, the page stays; FIX and SAMPLER assign as before; power cycle, the destinations kept. All pass. (LFO RND's DS1 and DS2 showed an error on the scratch project: LFO RND's own page, not this mod.) QP03 (`07e4454d…`, this package after the review fixes, `301a4618…`): on the FX track's LFO page holding LFO shows the values and LFO + a knob on the FX track's pages assigns the FX LFO; on a sound's LFO page with PERF opened over it, LFO held is the module's (NOT AN LFO DEST on the LFO page's knobs), and LFO assigns while a performance is being edited; LFO + FRQ on FILTER assigns; two taps reach LFO RND's page. All pass. Steps for a unit run of it, alone or in a combined image:

1. FILTER page, hold FIX: FRQ and RES shown as `0` boxes, nothing in the corner. Turn FRQ: its box counts up, FRQ itself does not move. Soft and hard pad hits differ. SOUND SETTINGS, VELOCITY MOD shows FILT FRQ.
2. AMP page, hold SAMPLER, turn DEC: pad pressure changes the decay. Tap SAMPLER alone: the recorder opens; hold it with a turn: it does not.
3. Fill four slots, try a fifth: VELOCITY MODS FULL (AFTERTOUCH MODS FULL for SAMPLER). Turn one back to 0, the fifth now fits.
4. FIX tap: fixed velocity toggles on the release. FUNC + FIX: stock's popup. Hold SAMPLER and tap FIX: nothing.
5. PERF mode: hold FIX and turn a knob (the box), then with FIX still held press a pad and turn (a performance lock, as stock).
6. Save the kit, power cycle: the links are kept.
7. FX track: FIX tap toggles fixed velocity at once, FIX held with a knob turned edits the knob, SAMPLER opens the recorder. On a sound page hold FIX, select the FX track: its knobs edit as normal.

## rytm-emu (0.3.0, a long hold is a look)

RL24 (4335ec13…, a private combined image with Filter Hz, QPER Live Rec and a private MIDI module of the author's), FILTER page of BD, keys held on
the emulator's panel. The hold is counted in ev_tick calls (10). LFO held 150, 350 or 450 ms opens the LFO page;
500, 550 or 650 ms leaves the FILTER page. LFO held 1.2 s with AMP tapped 0.2 s in: the AMP page stays (counted by
stock's key repeat, as first built, the repeat moved to AMP and the LFO page opened: a review found it). SAMPLER held
150 ms opens the recorder, 800 ms does not. FIX: its toggle shows nothing on the screen, so not seen; it takes the
same check. On a unit: not tested.

## Hardware (0.3.0)

**RL26 (a private combined image with this main.c), RAM-booted from RB08, by the author's hand, 15 Nov 2026:**
- FIX tap: fixed velocity toggles; FIX held about a second, no turn: unchanged.
- LFO tap: the LFO page opens; LFO held about a second: the page stays.
- SAMPLER tap: the recorder opens; SAMPLER held about a second: no recorder.
- LFO held, AMP tapped, LFO let go after about a second: the AMP page stays.
- LFO held in scene edit, a knob turned: that parameter becomes the LFO's destination at a depth, the page stays.

**Test rig (Rytm and a MIDI controller over USB, with the author's go), RL26 to RL31, 15 Nov 2026:** the LFO hold's
destination and depth from MIDI through stock's locker (eight slow controller ticks: DEP +8.00, the page stays), FIX
and SAMPLER amounts from MIDI. All pass. This exact package has not run on a unit.

## 0.3.1 (UI-task-only functions cold)

The change: functions that run only in the UI task are marked `__attribute__((cold))` (built for size, out of the hot
code); no behaviour change. 1,832 bytes less of the shared mod RAM. Old and new objects compared with every function
at `-O2`: the instructions are byte-identical apart from relocation offsets. An independent code review found no defect.

Images (OS 1.74, private, never committed): a development base `8e336c94` (Modwerk's send-bus base with the dev link,
from a private tree that leaves out the send bus) with this module, Control In Actions, Improved AMP and Filter Hz, each
cold-marked the same way.

**rytm-emu (`2ac0f1f` with a private RAM-boot model), 16 Nov 2026:** CB00 (the old sources) recorded the reference
screens; CA01 (the new sources) gave identical screens and measures in every case: qma-fix-velocity, qma-lfo-depth,
qma-lfo-grab, qma-lfo-on-lfo-page, qma-lfo-regrab, qma-lfo-tap and the look cases look-lfo-150, look-lfo-650,
look-lfo-amp, look-sampler-150, look-sampler-800. All pass.

**Test rig on the unit (Modwerk's rig, with npp1993's go), 16 Nov 2026:** CA02 (CA01's sources on RB08's store lock;
they differ from this folder's source only in the macro's comment text), RAM-booted on the author's Analog Rytm MKII
(flash RB08) over the dev link. Screens compared with the repository's unit references:
- qma-fix-velocity, qma-lfo-depth, qma-lfo-grab, qma-lfo-regrab, qma-lfo-tap: pass.
- qma-lfo-on-lfo-page: not checked (no unit reference for its screen).
- The look cases: rytm-emu only.

Not tested: this package's own image on a unit, and no hand test on the unit.

**Screenshots:** re-captured in rytm-emu from this version (QM31, `55a50da7…`: plain base `1c14b6b0` and this folder's
0.3.1 source, linked by Modwerk's linker against stock OS 1.74) with `media/capture.json`'s plans. All six PNGs are
byte-identical to 0.3.0's (QM30).

## rytm-emu (0.4.0, SCENE + knob; QS01 against stock QS00)

Observed in rytm-emu (ramboot build of `dtboot`), not hardware evidence. QS01: the Modwerk development base (send-bus, `25f2c915`) from the author's tree and this folder's Quick Mod Assign 0.4.0 source, `ddca9904aa424173f85ac1a4930a5e18689d6898154c782f4e4b91e4149fada2`. QS00: the same base without the module, `9c5249d7edc3…`, for stock's behaviour. The default kit, BD's SYNTH page unless named; keys and knobs through the test link, except where "panel" says the emulator's own key scan held the key (the link's held keys never repeat, so only a panel hold reaches stock's scene edit).

| Check | QS00 (stock) | QS01 |
| --- | --- | --- |
| SCENE + B with scene 1 engaged | SWT itself moves to 105 | SWT drawn as stock's lock box 105, the scene's other locks (DEC 22, MOD 6, LEV 127) boxed; SWT itself unchanged; a further turn 111 |
| SCENE let go after the turn, BD tapped, SCENE + B again | | the box comes back at 111: scene mode was not toggled by the release, scene 1 still engaged |
| SCENE + press B | | SWT's lock removed (plain 99), the other boxes stay |
| SCENE + B with no scene engaged | SWT moves | popup `NO ACTIVE SCENE`, SWT unchanged |
| FX track, scene 1 engaged, SCENE + A | | TIM boxed at 30; after the release TIM reads 1/8. as before |
| Panel SCENE held 1.5 s, screen at 1 s | scene edit's footer (SCENE: 1, LOCKS: 20) | the page; scene edit opens on the release |
| Panel SCENE held 1.5 s, then BD held | scene 1's locks boxed, footer SCENE: 1 | the same |
| Panel SCENE tap, BD, then SCENE + B | | scene mode toggled on as stock: BD engaged scene 1 and the turn locks |
| FIX held, SCENE tapped, BD tapped, SCENE + B | | `NO ACTIVE SCENE`: SCENE did not toggle scene mode during the FIX hold |
| FUNC + SCENE | PATTERN menu | the same |
| The 11 earlier rig cases (qma-fix-velocity, the LFO cases, the look cases) against the repository's references | | all pass |

After an independent code review (a trig held after the first knob makes its p-lock; with no scene active the release stays stock's; a stale scene locker is cleared on the next key), QS02 `c8d79660d71bc554fa1151e0e517acf6799f64f8fe0d830b332b29d5b529ae90` gives the same screens as QS01 in every case above, the 11 earlier cases pass, and:

| Check | QS02 |
| --- | --- |
| Scene 1 engaged, SCENE + A, then trig 1 held + B | the scene's boxes go; B shows 105 as trig 1's lock; after the trig, the scene's boxes are back and SWT is not scene-locked |

## Hardware (0.4.0, QS02; run by the test rig, not by a person)

On the author's Analog Rytm MKII, OS 1.74: QS02 (above) booted from RAM over the development link (image CRC `c9250fbe`; the flash kept the author's own build), a scratch project open, 24 Nov 2026. Keys and knobs came from the rig's link, screens from the unit; nobody touched the unit. The rig does not reset the unit between cases, so each case started from the scene state the one before left: where that changed what a case meant, the row says so.

| Check | Seen on the unit |
| --- | --- |
| FX track, scene engaged, SCENE + A | THR drawn as a lock box at 108; after the release THR reads 102 as before |
| SCENE + A, then trig 1 held + B | TUN boxed at -2.95 and SWT at 96 (an earlier lock); with the trig held, no boxes and TUN at -3.00 (the trig's view); after the trig, both boxes back |
| SCENE + B, then SCENE + press B | SWT boxed at 108, then removed (plain 96); TUN's box stays |
| SCENE + B, let go, BD tapped, SCENE + B | the box comes back: the release did not toggle scene mode |
| Scene mode by a tap, BD, SCENE + B | SWT boxed at 102 |
| SCENE + B with no scene active (the case before had disengaged it) | popup `NO ACTIVE SCENE`, SWT unchanged afterwards |
| FUNC + SCENE | PATTERN menu |
| SCENE held 1.5 s and let go (the link's hold) | the page: the link's held keys never repeat, so this is a tap to stock and to the module; scene edit by a hold was not seen on the unit |
| The 6 earlier qma- rig cases against their unit references | same boxes, values and popups; the only differences are the scratch kit's own sound (the filter envelope's shape, SMP OFF against 52), plus the next row |
| LFO held on the LFO page, WAV turned, scene mode on (left on by the cases before) | `NOT AN LFO DEST`: the module took the LFO key. After a SCENE tap (scene mode off) the same gesture moved WAV, as on stock. This is 0.2.0's LFO-page check (it needs the pages on top, and scene mode's view sits above them), not new in 0.4.0 |

## LFO on the LFO page in a pad mode (0.4.0, QS03)

0.2.0 left the LFO key stock's on the LFO page only with the pages on top, so in PERF, SCNE, MUTE and CHRO, which draw the page as it is, LFO held there was the module's and every knob said `NOT AN LFO DEST` (QP03 above recorded that as intended). 0.4.0 leaves the key stock's in those modes too; scene edit and performance edit (a pad held) are unchanged. QS03 `9ce1326ab922c353afeca61cb181f8d9a73a93c7bb76a922339a6897d1f8d82f`: QS02's base and this folder's source (built before a comment-only reflow).

| Check | QS00 (stock), rytm-emu | QS02, rytm-emu | QS03, rytm-emu | QS03, the author's unit (rig, 25 Nov 2026, image CRC `4510c911`, scratch project) |
| --- | --- | --- | --- | --- |
| BD's LFO page, PERF, SCNE, MUTE or CHRO on, LFO held, WAV turned | header LFO while held, WAV moves to EXP | `NOT AN LFO DEST`, WAV stays | identical to stock, every screen, all four modes | header LFO while held, WAV moves to EXP, all four modes |
| SCNE on, FILTER page, LFO held, FRQ turned | | | FRQ shown as the depth box (0) | the same; FRQ reads 64 after the release |
| qma-lfo-on-lfo-page (pages on top) | | | pass | WAV moves as on stock (no unit reference recorded yet) |
| The other 30 rig cases above | | | pass, scene cases' screens identical to QS02 | qma-lfo-tap: only the scratch kit's own sound differs, as on QS02 |

## The author's hand test of QM40, and what changed after it (0.4.0, QM41/QM42, QS04/QS05)

Reported by the author, 25 Nov 2026, QM40 (the plain-base package image, flashed): a SCENE hold with nothing touched opened scene edit on the release, as designed. Inside scene edit, SCENE + knob did nothing, also as designed (stock's scene edit locks only with a scene pad held). With no scene engaged, SCENE + FILTER locked nothing; in rytm-emu QM40 showed `NO ACTIVE SCENE` there, so the unit screen was most likely still scene edit (not confirmed). The author asked for: locks with no scene engaged going to the scene engaged last, and pads during a SCENE hold switching tracks (AUTO TRK SWITCH on), not engaging scenes, with no scene edit after.

rytm-emu, QM41 (`44d63b99…`) and QM42 (`7990c1ee…`, after the review fixes, every screen identical to QM41's), plain base 1c14b6b0, against stock QS00 where stock does something:

| Check | QS00 (stock) | QM40 | QM41 / QM42 |
| --- | --- | --- | --- |
| SCENE + B, no scene ever engaged | | `NO ACTIVE SCENE` | SWT locked at 105 in scene 1, its other locks (DEC, MOD, LEV) boxed |
| Scene 2 engaged, then disengaged, scene mode left, SCENE + B | | `NO ACTIVE SCENE` | SWT locked at 105, the only box: scene 2 (no other locks) |
| SCENE held, SD tapped | scene edit open (0.2 s), the pad picks scene 2 | SD selected | SD selected |
| ...SCENE let go | scene edit | scene edit opens (the pad did not count) | the SD page, no scene edit |
| Scene mode, SCENE held, SD tapped, B turned | scene edit, scene 2 | scene 2 engaged, BD stays | SD selected, SWT box; let go: no scene edit |
| ...then SCENE held alone and let go | | | scene edit on SCENE 1: the pad engaged no scene |
| Scene mode, SD tapped (no SCENE) | scene 2 engaged | | scene 2 engaged, as stock |
| SCENE held, B turned on BD, SD tapped, B turned | | | SWT box on SD |

Rig cases, rytm-emu, QS04 (`e03614c6…`, dev base 25f2c915) and QS05 (`a2e4afd7…`): all 31 pass; s3-noscene now locks into scene 1 instead of the popup.

An independent code review: no serious bug; its three small points are in (a foreign locker held: the pad stays stock's; a redraw after the select; the README says the last scene is kept across kit loads) with the stale comments.

## Pads on the unit, scene edit locks, copy and clear (0.4.0, QS06 to QS10, QM43 to QM45)

On the author's unit, 25 Nov 2026 (debug image QS06, RAM-booted over FXCJ, scratch project): after some use every SCENE press was declined with `DBG PAD`. The link's memory read showed stock's key table (0x40081c28's bitmap at 0x418d1340, bits 0x48..0x53) reporting all 12 pads held with none touched, and a tap of BD and SD did not clear them; in rytm-emu those bits stay 0. From QS07 the module counts held pads from its own pad events (and drops a pad when the table says it is up). Two of the author's earlier tries ran another session's RAM image, not this module (image CRCs `6777a391`, `9312221b`); the unit was held in the queue from then on.

rytm-emu, QM43/QM44/QM45 (plain base 1c14b6b0), against stock QS00 where stock does something:

| Check | QS00 (stock) | QM43 to QM45 |
| --- | --- | --- |
| SCENE held 0.2 s, nothing else | | scene 1's boxes (DEC 22, MOD 6, LEV 127) |
| SCENE tapped | | no boxes flash |
| Scene edit, SD pad (scene 2), SCENE + B | SCENE + B is a plain edit | SWT box, `SCENE: 2 LOCKS: 1`, scene edit stays |
| Scene edit, SCENE tapped | closes scene edit | closes scene edit |
| Scene edit, SCENE held with nothing | stays open | stays open |
| Scene edit, FUNC + REC | `COPY SCENE 1` | (stock's) |
| SCENE held, REC | | `COPY SCENE 1` |
| Scene 2 engaged, SCENE held, STOP | | `PASTE SCENE`; scene 2 then shows scene 1's boxes |
| SCENE held, PLAY; PLAY again | | `CLEAR SCENE`, no boxes after; `UNDO CLEAR`, boxes back; the sequencer stays stopped |
| SCENE rolled into PLAY (50 ms) | the sequencer starts | the sequencer starts (QM45) |

Rig cases, rytm-emu: all 31 pass on QS08, QS09 and QS10.

On the author's unit, reported by the author, 25 Nov 2026: QS07 (pads from events) "everything seemed to work"; QS09 (scene edit locks, early boxes, copy, paste, clear) "all that looks good". Not on the unit: QS10's later changes (the transport keys wait 0.2 s; a pad's bit clears when the table says up), the exact package image.

An independent code review of the whole of 0.4.0: nothing that leaves a key or the locker taken. Its two medium points are in QS10 (the transport keys taken only once the hold shows; pads_down self-clearing), and its README points are fixed.

Not tested: scene edit opened by a held SCENE on the unit (needs a person); 48 locks full; a scene pad or QPER holding the locker with SCENE in either order; a CHRO pad held through the first knob event; LIVE RECORDING; a kit save and reload of the new locks; the sound.

## QPER Live Rec (`qperf`) up to 0.3.0, before the fold

The records of QPER Live Rec as a module of its own, moved here unchanged when it became part of this module in 0.5.0. Builds, cases and paths are as they were then.

QPER Live Rec was called QPERF until 10 November 2026; the builds below ran under that name.

Nothing here proves reboot persistence or the QPER knob itself. Hardware results below are the author's, each on the build named. QC13 is the 0.1.0 code. 0.2.0-experimental ran on the author's unit on QT01 to QT08 (each QL build named below with the trace added) and, as the code before the idle early return (see Idle CPU), on QL19 (sha256 a8a2dea0238e0630958f4ca18645db5ddcad3930b50aa2bbc9a8b28d23a8b40b): QL18's source linked alone on the plain Modwerk base `e558ad22`, the same image the published package links to. Reported by the author on QL19, Analog Rytm MKII, 6 November 2026: with no recording mode on, RECORD + YES showed NOTHING TO APPLY and RECORD + NO NOTHING TO CLEAR, and GRID RECORDING did not stay on; in GRID RECORDING the same, and after a take RECORD + YES showed APPLY QUICK PERF REC and RECORD + NO then NOTHING TO CLEAR; in LIVE RECORDING a pad take in PERF looped, RECORD + NO showed CLEAR QUICK PERF REC and NO again UNDO CLEAR, and RECORD + YES applied; a track with no trigs got lock trigs (yellow) on the steps the take moved. A first look found locks only on trig steps: that was another track than the one the performance locks. rytm-emu, QL18 against a debug build that counted them: an apply on track 2 wrote 12 steps and made 4 lock trigs, all kept, and the grid showed step 13 yellow afterwards. QPERF's gestures and the FX track (rytm-emu, a debug build naming the top view, QD22): with the FX track selected, PERF mode's view is the pad tracks' 0x401e26c4, whether FX or PERF is pressed first, and RECORD + NO cleared there. 0x401e2a54 and 0x401e2ee8 are the views stock opens while a pad is pressed in PERF or SCNE mode on any track (PerformanceView's key handler, vtable + 8 = 0x400ce17e, and SceneView's, 0x400d1798, construct them on pad keys 0x90 to 0x9b); with one on top, QPER and RECORD + YES/NO stay stock's. Before QL19, the code was QL18 (sha256 813d2c4a2222eebeeccd2bb09c99a84d68f20babb2db242ec0d9220664b11a9a; QT09 with the trace), QL17 after a final code review: RECORD's hold comes from its own key events rather than stock's key table, and the record state is saved at every RECORD press. rytm-emu: the RECORD chord run gave the same result as on QL16, and a lone YES after RECORD's release did nothing. Before it, QL17 (sha256 997cdaa3ee84f9c9ec6a86ac8527087de1c1afea6ef555a34839146bdfb16ec4; QT08 34e69bcc43cff972af402708aee79f41edda1339e424978787926c300b8c282f with the trace): applied locks stop at the parameter's own maximum and are whole values where the parameter has no fine part. Reported by the author on QT08, Analog Rytm MKII, logged: FX track, performance locking distortion AMT and SYM far past their range, applied: held trig showed 127 and +63, no ERR; pad track, DEC and COLOR pushed past their range: shown at their maximum. SCALE per track, master length 32, CH 16 steps with 1:2 on steps 5 to 8 (playing on the first of the two passes): after RECORD + YES CH was 32 steps, page 1's trigs had no condition and page 2 had none at those steps, the timing they played with before; the take applied; a pattern reload brought back 16 steps and the 1:2 trigs. CH at 24 steps under master 32 became 32 steps. Master INF with CH at 24: RECORD + YES showed 1 TRACK LEFT OUT. Reported by the author on QT07: a pattern change dropped an unapplied take; an FX track take applied, but its locks on distortion AMT and SYM showed ERR when their trig was held (an applied lock could reach the maximum plus 0xff, past what stock's value formatter, 0x400a864c, accepts; not yet retested); with SCALE per track, master length 32 and a 16-step CH track, a 32-step take applied and made CH 32 steps; a 64-step take on master 32 looped every 32, as designed. Before it, QL16 (sha256 3f28f5fa09be4a394c44a216013acb79c7b880df961c23731bc12bc000ede80c; QT07 with the trace): the quick perf rec is applied with RECORD + YES and cleared with RECORD + NO in any recording mode, and QPER + YES only applies the knob to the kit. rytm-emu, record state bytes + 360/+ 361 read with DTBOOT_PEEK: with no recording mode on, RECORD's press set GRID RECORDING and RECORD + NO put it back; RECORD + PLAY still started LIVE RECORDING; with GRID RECORDING on, RECORD + YES showed APPLY QUICK PERF REC and GRID RECORDING stayed on. Reported by the author on QT07, Analog Rytm MKII, logged: RECORD + NO with no recording mode on showed NOTHING TO CLEAR and the RECORD light stayed off (it flashed and the grid trigs showed while RECORD was held, and stayed off on release); in LIVE RECORDING and in GRID RECORDING, RECORD + NO cleared (CLEAR QUICK PERF REC), the mode stayed, NO again undid; RECORD + YES applied (APPLY QUICK PERF REC, locks on the steps with moves) in LIVE RECORDING, GRID RECORDING, no mode and STEP RECORDING, and again showed NOTHING TO APPLY; in STEP RECORDING, RECORD + NO cleared and STEP RECORDING's blink stayed; QPER + NO did nothing; QPER + YES applied the knob to the kit (PERFORMANCE 1 APPLIED) in every mode. A pad that looked held after a clear was performance 1, linked to QPER with the knob at full: the log showed its amount at the knob's 127 with nothing touching or playing it, as on stock. Before it, QL15 (sha256 454ce43320a2086f58000e07a68bf2a4c93c3ddd567f043cecac0099141a2ae7; QT06 9ae04586501fffda99fad7190c74182c39bd88dc2a9b1ded7da890248efd2689 with the trace). Reported by the author, logged: on QT04 a knob take recorded the landing level over the start of the turn (each move restarted the pass); on QT05 a knob take over steps 9 to 12 wiped an earlier take on 1 to 4 (a pass ran a full loop); on QT06 (a take runs from the turn to the loop's end) the 9 to 12 overdub kept the 1 to 4 take. Linked pad in LIVE RECORDING overdubbed like a pad. An earlier reading of the logs, that the linked pad's pressure moved the QPER knob's value, was wrong: stock sends a performance's CC whatever moves its amount, the knob included, and the code feeds the knob's value only from the panel's knob message (0x40081b4a, panel header 4x). Part C on QT06: QPER + NO cleared and undid; QPER + YES in LIVE RECORDING applied (steppier, locks on the steps, the rec emptied, QPER + NO then NOTHING TO CLEAR); QPER + YES with LIVE RECORDING off applied the knob to the kit; a pattern reload removed the applied locks and kept the kit apply. Before it, QL13 (sha256 bb12106f73e243f901b007ba49ad505f9b9b83746db87cfdc978f9cc4096d6f9; QT04 with the trace). Reported by the author on QT03, Analog Rytm MKII, logged, pattern length 16, CH locked by performances 1 to 3: pad takes on 2 and 3 replayed as played, a third pad added without disturbing them, a pad overrode its take while held and the take came back after, QPER + NO showed CLEAR QUICK PERF REC and again UNDO CLEAR; the log showed no pad held at zero. Knob: a take was left alone until the first touch, the knob overrode playback while turning, unlinking kept the take; a sweep was recorded over on the next pass by the still knob (continuous until LIVE RECORDING ended, as built), and playback came back a little late after the knob stopped. QL13 takes one pass from each knob touch and lets go 0.05 s after the knob stops; not yet on the unit. Before it, QL12 (sha256 6edc245edd79a9ceb22f57177884a84a650d5033afb1f2ee548a4259c90987fd; QT03 00ef4846e5d75fc5d097fd39c98a178798bbae3b5bd01af7479ebe0b8695f6ec with the trace). A second traced run on QT02 showed the stuck sound the author heard on pad 2: pad 2 was the linked performance, LIVE RECORDING had recorded it at the knob's steady 99, and that played back after the pad was let go; on the linked performance the pad's pressure also moved the knob's value (6 to 28 and back). QL12: the linked performance starts recording at the first knob turn or pad press of each LIVE RECORDING run, any drop to 0 counts as a release, and the messages are CLEAR QUICK PERF REC and APPLY QUICK PERF REC. rytm-emu: the steady SD hold recorded and replayed as on QL11, and QPER + NO showed CLEAR QUICK PERF REC. Before it, QL11 (sha256 cb917c2c910c91a89ebdccd7676c7f3221382a20ddc2529eade1a1b29315df4e), after the author's first traced run below. Before it, QL10 (sha256 1e6e06ce6529e74b0370621ae1798c203241a8915705102b491667b8fede3ca5), QL09 below after a second code review: the lock-row check counts the steps a track will have once lengthened, only tracks a move reaches are lengthened, and a copy that loses its trig loses its condition too. Rerun of the QL09 table on QL10: the same lengths, conditions and baked steps, and steps 7 and 13 to 15 of track 2 and 5 of track 5 kept no condition. QL06 (sha256 21fb67304cf99fed7ea792376e7d904e276bb65cb366b4a54c069d88e16d9e40) added PerformanceEditView, the FX track's PERF view, back to the held-pad check.

### 0.3.0: the take repeats when the loop gets longer (21 November 2026)

Stock's pulse handler (OS 1.74, 0x4009bbe2) reads the pattern's length word (pattern + 0x14eb3) at every step and, when the next step reaches it, takes the length off once; a length of 1 (INF) never wraps there. Tracks in NORM mode read the same word (0x4009c0c4), so it is the loop in both modes. In rytm-emu's SCALE menu (FUNC + PAGE) UP and DOWN step the value one at a time and each value is written at once: NORM takes the master length, held between 2 and 64, and ADV keeps NORM's length as the master length. 0.3.0 compares that loop with the take's at each whole audio block. Grown, it copies the take over the new steps at the take's period, the loop it was last recorded at; shortened, it cuts nothing until a whole pass has played at the shorter length, from one coming round to the next. The quick exit is unchanged: its code is the same instruction for instruction as 0.2.2's. Package `qperf-0.3.0-experimental-os1.74.elemod` `9b7b8801…1011`, 16,553 B (`.run` 9,437, `.bss` 7,116), 320 B more than 0.2.2; its code is byte-identical to the module in QU02 below. A length change copies at most 63 steps for each of the 12 performances once, in one audio block, never on the idle path.

- Host differential test (private, as for 0.2.2): 0.2.2 against this source with one pattern length a run: 0 differences in 32 million blocks (8 seeds), each quick exit where 0.2.2's was, so a knob take's end, recomputed from the loop's end, matches 0.2.2's countdown. With the length changing at random, ASan and UBSan found nothing in 18 million blocks, and the loop and period stayed between 2 and 64.
- An independent code review found three gaps, fixed before the runs below, each with a host scenario that fails on the code before the fix: a first take after an emptying at a longer loop repeated nothing when lengthened, a take cleared and brought back counted a pass from before the clear, and a knob take that came round in the block the loop grew ran a second pass.
- Host scenarios on this source, 32 checks, all passed: 16 to 32 in one jump and one step at a time, 16 to 24 then 32, 24 to 16 and back within a pass (the older steps return) and after whole passes (steps 1 to 16 are copied over them), an interrupted pass, 32 scrolled down to 2 and on to INF while playing (nothing cut, steps 33 to 64 hold 1 to 32), 32 to 4 and back while stopped (nothing changes), a recording at 32 then 64, a take cleared with RECORD + NO while the loop grew (copied only once NO brings it back), a new take over a cleared one at another length, a QPER knob take that runs to the new loop's end when the loop grows or shrinks ahead of it and ends when the loop is cut short of it, and the three review cases.
- rytm-emu 2ac0f1f, QX06 (this source alone on the Modwerk base with the development link, private test rig, the take read from RAM), 13 checks, all passed: a NORM 16-step take from performance 1 by MIDI, then ADV with master 32 set in the SCALE menu one step at a time: steps 17 to 32 held steps 1 to 16, and RECORD + YES showed APPLY QUICK PERF REC, emptied the take and made track 1 32 steps; a new take at 16 after it, then 32: 17 to 32 held 1 to 16. 16 to 24: 17 to 24 held 1 to 8; back to 16 changed nothing; a new take at 16 for a whole pass, then 32: 17 to 32 held the new 1 to 16; 32 scrolled down to INF in one go: the loop became 64 and 33 to 64 held 1 to 32. A take cleared with RECORD + NO stayed as it was while master went 16 to 32, and NO again brought it back filled to 32.
- rytm-emu 2ac0f1f: QX07 (this source alone on the plain Modwerk base `1c14b6b0`, sha256 `295cc426…b39f`) replays both media plans; both frames are byte-identical to 0.2.2's.
- The author's Analog Rytm MKII, OS 1.74, 21 November 2026, run by the test rig over the USB link (no hand on the unit): QU02 (this source alone on the Modwerk base with the development link, dev send-bus `0b33f8ec`, sha256 `dccd518a…ceb1`), RAM-booted over the flashed CD02, scratch project, the take read from RAM at QU02's addresses. QU01, the source before the final review's knob-take change, gave the same results in the same cases. The same three cases as on QX06, run one after another on one pattern: 16 to 32 one step at a time repeated steps 1-16 on 17-32, and a new take at 16 after RECORD + YES did the same; 16 to 24 repeated steps 1-8 exactly; back to 16 changed nothing; a new take at 16 for a whole pass, then 32, repeated it on 17-32; 32 scrolled down to INF in one go kept the take and repeated it on 33-64; a cleared take stayed as it was while master went 16 to 32 and came back filled to 32. Two checks that assumed empty steps past the loop failed on moves the previous case had left there (on the unit the cases do not start from a fresh boot), not on the copy. RECORD + YES on track 1 showed NOTHING TO APPLY: track 1 of the scratch kit was BD ANALOG, which QU01 does not hold, so its page had no parameter to lock. A fourth case on track 2 (SD): a lock on its first SRC parameter in performance 1, a NORM 16-step take, master 32 (17-32 held 1-16), then RECORD + YES showed APPLY QUICK PERF REC, emptied the take and made track 2 32 steps.
- Not run: the QPER knob take on a length change (the rig has no knob message for it), pads and pressure, LEDs and sound, and the tutorial by hand on 0.3.0.

### 0.2.2: a shorter quick exit for the audio block (17 November 2026)

`qperf_render` runs every audio block. Up to 0.2.1 its idle test looped over all 12 performances (amount, touch and recording point each) and read 14 of the module's data cache lines; stock's audio work evicts module data every block, so each is a miss. In 0.2.2 what the quick exit reads sits in one 16-byte aligned struct of four lines, a word written after each whole block says whether a knob turn or take, a held pad, a driven performance, a touch or a recording point is still in play, another holds the knob value that changes nothing, and the 12 amounts are compared two at a time. The whole block is 0.2.1's handler without its early return, which the quick exit replaces: in that state the whole block changes only the play position, as 0.2.1's comment says. No behaviour change is intended. Package `qperf-0.2.2-experimental-os1.74.elemod` `4ff5dfe4…`, 16,233 B (`.run` 9,133, `.bss` 7,100): 352 B more than 0.2.1.

- Host differential test (private, outside the repository): 0.2.1's and 0.2.2's `main.c` compiled for the host with the OS's memory as arrays, run block by block from the same start through the same sequencer (tempo, pulse and step, a pulse handler cut between its pulse and step, odd speeds and lengths, pattern changes), pads and MIDI, the QPER knob (turns, wobble, rest, a take with nothing linked), LIVE RECORDING and the UI's writers (project load, RECORD + NO, RECORD + YES's end, link changes, the busy flag held across blocks). After every block both left the same module state and the same amounts in memory: 0 differences in 80 million blocks (8 seeds), 13.2 million of them quick exits, each where 0.2.1 took its early return. Of 12 deliberate faults 8 were caught; the 4 not caught remove terms that cannot matter after a whole block (a pad held means a touch, a knob turn means `knob_was`, the first block after a project is always whole, or the change only skips the quick exit). `position()`'s arithmetic was left as it was.
- rytm-emu 2ac0f1f, core 0.7 with this source alone and a private meter module that reads DTIM0 at `ev_render_out` orders 49 and 51, around QPERF's 50 (instruction time only: the emulator has no cache model, so this is no unit measurement). 7,500 blocks each, after boot: sequencer stopped 139.9 ticks a block (0.2.1) to 35.0 (0.2.2); playing 180.2 to 77.9.
- rytm-emu 2ac0f1f: QL21 (this source alone on the plain Modwerk base `1c14b6b0`, sha256 `1b9ea783…`) replays both media plans; both frames are byte-identical to 0.2.1's.
- The author's Analog Rytm MKII, OS 1.74, 17 November 2026, run by the test rig over the USB link (no hand on the unit), each image from RAM with the flash left on RB08, scratch project, kit and pattern as left by earlier tests: QPO2 (0.2.1, sha256 `72693bc6…dd4d`) and QPN2 (this source, `3c6578d8…a93b`), each alone on the Modwerk base with the development link (dev send-bus `0b33f8ec`) and a private meter module that reads DTIM0 at `ev_render_out` orders 49 and 51, around QPERF's 50 (132 MHz, 88,000 ticks an audio block). Booted QPO2, QPN2, then QPO2 again; each read twice over about 20 s (some 30,000 blocks a reading). The audio handler: stopped 851 to 854 ticks a block, then 850 to 851 (0.2.1), against 470 to 471 (0.2.2); playing 1,285 to 1,286, then 1,269 to 1,272, against 902 to 903. So 0.2.2 saves about 380 ticks (2.9 us, 0.43 % of the block) stopped and playing. The whole block moved by 0.1 to 0.45 points between images, but also by 0.2 points between two boots of QPO2, so only the handler's own time is a clean comparison.
- Same run, two private rig cases run on both images and compared capture by capture (0 differences): RECORD + YES and RECORD + NO with no recording mode and nothing recorded, and a QPER hold (screens, performance amounts); performance 1's amount by MIDI CC 35 stopped, playing and in LIVE RECORDING, RECORD + NO clearing the take and NO undoing it, stopped, and RECORD + NO again (screens and the 12 amounts read at fixed times). Both images played the recorded 100 back on the next pass, cleared it to 0 with RECORD + NO, and showed the same screens. Not covered: pads and pressure, the QPER knob, QPER + YES, PLAY, RECORD and STOP, RECORD + YES with a take, LEDs and sound; the tutorial was not repeated by hand on 0.2.2.

### 0.2.1: UI-only code built for size (16 November 2026)

35 functions reached only from `qperf_key`, `qperf_tick` and `qperf_project` (the gestures, popups, the quick perf rec's bake and clear) are marked `__attribute__((cold))`; the module stays at -O2, and `qperf_render`, the lockers and the pad gate are not marked. Built in Modwerk's isolated toolchain: 17,805 B (`.run` + `.bss`) for 0.2.0, 15,881 B (`.run` 8,741, `.bss` 7,140) for this source. No behaviour change is intended.

- rytm-emu 2ac0f1f: QL20 (this source alone on the plain Modwerk base `d6ee1eed`, sha256 `e77e4cd9…`) replays both media plans; both frames are byte-identical to 0.2.0's QL19 captures.
- On the author's Analog Rytm MKII (OS 1.74), this exact source (the same code, the comment above the attribute reworded since) ran in the author's private combined images RC37 to RC40 (17 modules on a private base; RC40 `5d5241e0…`, on the unit since 12 November 2026). That is a combined-image observation, not a run of this package alone.
- Alone on the author's unit, 16 November 2026: QR01 (`b5ad3b25…`, the Modwerk base with the development link `0b33f8ec` and this source), RAM boot over the flashed build, scratch project. Reported by the author, all passed: QPER + pad 1 links and a FLTR turn while QPER is held locks; the QPER knob sweeps the move; QPER + YES shows PERFORMANCE 1 APPLIED and keeps the sound; QPER + PLAY clears and PLAY again undoes; QPER + RECORD, pad 2, STOP copies and pastes; in PERF with LIVE RECORDING, squeezed pads 1 and 2 loop on the next pass, RECORD + NO clears (CLEAR QUICK PERF REC) and NO again undoes, RECORD + YES writes the moves into the pattern (APPLY QUICK PERF REC).

### Idle CPU (6 November 2026)

The audio handler now returns after one check when nothing is to be done: no knob turn or take, no pad held, nothing driven or touched, no quick perf rec to play back and every performance amount unchanged. In that case the full handler changed nothing but the play position it keeps for the next block, which the early return still sets. An independent review traced every branch and found no change in behaviour.

Measured on the author's Analog Rytm MKII (OS 1.74) with a private telemetry base that times each audio hook on DTIM0 and sends it over USB MIDI, sequencer stopped, in the author's 16-module set: `qperf_render` 8.7 us a block before, 5.1 us after (LF01, `a6d85a85…`, this source with Ping Pong Loop's and Sample Playback Rate's idle fixes); removing QPERF from the set lowered the idle block from 72.9 % to 70.9 %. Reported by the author on LF01: the QPER knob, pad locks and the quick perf rec still work. The QL19 rows above ran the code before this change.

### Hardware

Reported by the author on build QP01, Analog Rytm MKII, OS 1.74:

- PLAY alone counted as a clear, with no QPER held.
- No sound.
- The message boxes did not match stock's popups.

Reported by the author on build QP02:

- QPER + clear worked. A +30 turn with 3 linked split to +10 each. QPER + YES at full applied a lock, and +10 split across 2 then applied to one gave +5.
- QPER + YES showed NOTHING with the knob at full after relinking, until the knob was moved: stock only writes the amount to performances linked when it moves.
- The offset toast was not what a held performance shows.

Build QP03 changes all of this. 

Reported by the author on build QP05:

- Link 3, overdrive +30, relink to one, QPER + YES with the knob untouched: PERFORMANCE 5 APPLIED, overdrive +10. The knob position reached the apply.
- Half knob added about half the offset. Fine tune stopped at its maximum of 63 on repeated applies, still showing APPLIED.
- Locked knobs inverted while QPER held. Hold again and turn from +30 to +40 with 3 linked.
- QPER + PLAY cleared; PLAY again showed UNDO CLEAR. Whether undone locks follow the knob: unsure.
- After a restart, QPER + YES showed PERFORMANCE 12 APPLIED. The value was not reported.
- LOCK MEM FULL! appeared. Linking on FX track and LFO pages seemed fine. FUNC + QPER muted. Linking by pads worked. Kit reload seemed right.
- At full knob, QPER + YES stacks the offset on what the performance still adds, so the sound jumps.
- Unsure or not run: release back to stock, unequal locks, undo across kits, the NO PERFORMANCE LINKED turn, QPER + YES with FX locks, power cycle.

### Emulator

rytm-emu c5732f0, `dtboot`, stock OS 1.74, Modwerk base 0c92aa45 with QPERF source on branch `claude/rytm-qperf`, factory kit K001 RYTMLINJE (31 performance locks, QPER linked to performances 1 and 10). Lock table and effective parameters read from snapshots with `dtpeek`.

| Check | Result |
| --- | --- |
| QPER held, turn SWD 6 times | Performances 1 and 10 each got a lock of 2816 (total 5632, 8.8); SWD unchanged; total shown |
| QPER + PLAY | Both linked performances cleared (31 locks to 18); sequencer did not start |
| QPER + YES, performance 1's amount poked to half | Effective parameters rose by half each lock (track 2 param 41: 11305 to 22396 for a lock of 22272); locks kept (31); APPLIED shown |
| QPER + YES, amount 0 | Lock table unchanged |
| Turn without QPER | Table unchanged |
| FUNC + QPER | Stock's mute flag set |
| QPER + pads | Stock's link mask changed (0x201 to 0x3) |
| 47 locks used, a new parameter with 2 linked | Nothing written, parameters unchanged |
| PLAY held, then QPER (key repeats) | Table unchanged |
| QPER, then FUNC + PLAY | Table unchanged |
| TRIG page, QPER + turn | No lock written |

Build QP02 (sha256 008f2f89), key release read from bit 0 as stock does, messages through stock's popup:

| Check | Result |
| --- | --- |
| QP01: QPER + pad, release, then PLAY | Reproduced: QPER stayed held, PLAY was taken, output peak 0 |
| QP02: same steps, four trigs placed | QPER released, sequencer started, output peak 11229 |
| PLAY alone | Sequencer started, output peak 11229 |
| QPER + pad + PLAY | CLEARED popup; sequencer did not start, output peak 0 |
| QPER + YES, then PLAY while the popup is open | Sequencer started |
| QPER held, turn 30 steps | Total popup, closes after release; no fault |

Build QP03 (sha256 093064d6), base 0c92aa45, factory kit K001:

| Check | Result |
| --- | --- |
| QPER held, 2 linked, turn SWD | Knob inverted, reads +34; 17.0 in each linked performance |
| Turn back | +28, 14.0 in each |
| QPER released, turn the knob | No lock written (31 locks) |
| QPER + YES, knob poked to 127 | APPLIED TO KIT |
| QPER + YES, knob poked to 0 | QPER KNOB AT ZERO |
| QPER + YES, knob not moved since boot | MOVE THE QPER KNOB FIRST |
| QPER + PLAY twice | CLEARED (31 locks to 18), then NO LOCKS TO CLEAR |
| Links removed, QPER + YES | NO PERFORMANCES LINKED |
| FUNC + QPER, then QPER + YES | QPER IS MUTED |

The emulator has no QPER knob, so the position was poked: the site that reads it (0x400a4994) is patched but has not run.

Build QP04 (sha256 ad915f44), same setup:

| Check | Result |
| --- | --- |
| QPER + YES, 2 linked, knob poked to 0 | PERFORMANCES APPLIED |
| FUNC + QPER to mute, then QPER + YES | PERFORMANCES APPLIED |
| QPER + pad, QPER + YES | PERFORMANCE 1 APPLIED |
| Links removed, QPER + YES | NOTHING TO APPLY |
| QPER + PLAY twice | 31 locks to 18, then UNDO CLEAR and the same 31 locks |
| QPER + PLAY three times | 18 locks: the third clears again |
| QPER + PLAY, relink to another pad, PLAY | That pad's locks cleared, no undo of the first |

Build QP05 is QP04 with one message changed. Links removed, QPER held, turn a knob: NO PERFORMANCE LINKED, no lock written.

Build QP06 (sha256 3305266d), same setup:

| Check | Result |
| --- | --- |
| Hold QPER on a kit linked to 2 | Mask drops to the lowest one |
| QPER + SD, knob poked to full | Link moves; new performance's amount 0x7f80, old 0 |
| QPER + SD twice | Unlinked, amount 0 |
| QPER + trig 3 | Link moves to performance 3 |
| QPER + YES, knob full | Locks read 0, 31 slots kept, PERFORMANCE 1 APPLIED |
| QPER + YES, knob about half | Locks halved (22272 to 11180) |
| QPER + PLAY twice | Stock's clear, then undo: 31 locks back |
| RECORD, link SD, STOP, STOP | COPY PERFORMANCE 1; pasted (35 locks); undone (31 locks) |

FX apply was not reached: the emulator did not select the FX track.

Reported by the author on build QP06:

- Single link works. Holding several pads in performance mode still works as on stock.
- Overdrive +12, QPER + YES at full: overdrive 12, lock +0, second YES NOTHING TO APPLY, knob down changed nothing.
- Pan +40 at about half: kit +21, lock +18. Repeated YES crept closer until NOTHING TO APPLY.
- Clear and undo, copy, paste and undo paste all worked.
- FX track volume +53, QPER + YES at full: APPLIED, but the lock stayed and the sound still followed the knob. Cause: wrong stock id table. Fixed in QP07.
- Pad 1 stays dim green, brighter when linked.

Reported by the author on build QP07:

- Pad 1's dim green went out after CLEAR PERFORMANCE: stock's marker for a performance with locks.
- Clear in kit 1, load kit 2, QPER + PLAY: CLEAR PERFORMANCE, no undo, and kit 1's locks did not appear.
- +127 at half knob, saved, power cycled, kit reloaded: applied value and reduced lock both back.
- After power on, QPER + YES before moving the knob: APPLIED, no crash, value unchanged. After moving the knob it followed the position.

Build QP07 (sha256 95ef219d): a +40 lock poked into the FX track at index 22, QPER + YES at full: lock 0, kit byte 78 to 118. Index 34 also went to 0 and its kit value moved. The FX track was not selected on screen.

Build QP08 (sha256 951dade2): QPER + YES at full removed all 13 of performance 1's locks (31 slots to 18); at about half all 13 stayed.

Reported by the author on build QP08: FX track threshold +127, QPER + YES at full: PERFORMANCE 4 APPLIED, the lock went away, the sound held. Locks set on BD, snare and RS show as red pads on the performance page, as stock.

Combined build QC01 (sha256 493d5fa2): core 0.7 base 0c92aa45, Filter Hz 1.2.0, Pipo Loop 0.1.0-experimental, QPERF, Silent Pad+Trig 0.5.1-experimental. Linked with no overlap and booted in rytm-emu:

| Check | Result |
| --- | --- |
| Any key on a kit linked to 2 | Mask drops to the lowest one on the next tick |
| Mask poked to 2 links | Drops to the lowest one |
| QPER + SD, turn SWD | Lock in performance 2, knob inverted, reads +28 |
| FLTR page, turn FRQ | Reads 21.1kHz |
| Trigs placed, PLAY | Sequencer ran, output peak 11229 |

Pipo Loop and Silent Pad+Trig were not exercised, only booted beside it.

Reported by the author on QC01: Filter Hz, Silent Pad+Trig, Pipo Loop and QPERF's knob and YES looked good. LFO depth +30, QPER + YES at half knob: the sound moved up. Half knob leaves half the lock, which adds a quarter more at that position, so this is the expected step, not shown to be LFO-specific.

QC02 (sha256 562c8c76): the link check now starts from `ev_project`. Booted with no key pressed, the factory kit's two links dropped to one. QPER + SD and a knob turn wrote a lock.

Combined build QC03 (sha256 a19cccb3): QPER + YES writes what the locks add into the kit and removes them. Amount poked to half (0x3f80) and full (0x7f80): 13 locks removed (31 slots to 18), and the audio engine's parameter words were identical before and after. Amount 0: all locks stayed. The first build scaled by 0x7f80 and landed up to a quarter step off; stock's scale is 0x8000, measured here.

Reported by the author on QC03: LFO depth +30 at half knob and at full held the sound. Normal and FX track parameters at full held, and moving the knob after changed nothing. Knob zero said APPLIED with no change. Tune locked to +127, past its +32 limit: YES changed the sound.

Combined build QC04 (sha256 ade8229a): knob stops at the parameter's limit (tune from -7.5 stops at +39.5); knob zero says NOTHING TO APPLY with locks kept; YES reads stock's amount, the value the engine plays, not the knob. After YES at half the audio engine's parameter words were identical.

Reported by the author on QC04: knob turns under QPER did nothing. Cause: stock starts a lock at 0 and adds to it, and QC04 refused a new +0 lock. Removed in QC05.

Combined build QC05 (sha256 dff83fad): QPER + knob writes locks on knobs A, B, D and F again. Tune still stops at +39.5 from -7.5. SWD, already at its top, stays at +0 turning up.

Reported by the author on QC05: knob turns work. Tune stopped at +32 and QPER + YES held the sound. Knob zero showed NOTHING TO APPLY. Clear, a new lock, QPER + PLAY: CLEAR PERFORMANCE, so stock's undo does not replace later locks.

Also on QC05: lock at full knob, PERF mode, press and release the linked pad: on release the lock stopped sounding and stayed off with the knob still at full. QPER + YES then said NOTHING TO APPLY and the sound held. Not compared with stock, but the pad path is stock's own.

Combined build QC06 (sha256 a25ee0f4): the link check runs after stock's routine at 0x400a65a4, which every kit change reaches (load, reload, SysEx and restores), through a flag read on the UI tick. Boot, KIT RELOADED! and KIT LOADED! each left one link. A first build acted directly in that routine and in `ev_project` and left the kit blank at boot; which of the two did it was not separated. Both now only set the flag. Knob lock, QPER + YES at half (engine words identical) and playback passed.

Reported by the author on QC06: normal boot, kit load and reload, and pattern changes that bring a kit all passed. Resonance +54 at full knob, QPER + YES: 53, because full knob is 99.6%.

Build QC07 applied the whole lock at full knob; the author chose to keep the played sound instead, so that was reverted. The source is QC06's again.

Reverted at the author's request: QPER + knob no longer stops at a parameter's range, so it matches stock's performance edit.

Combined build QC08 (sha256 14de2dcc): boot and knob lock passed; QPER + YES at half left the engine words identical. Linked with `link-image.mjs` after #1094.

Reported by the author on QC08: tune locked to +127 under QPER, QPER + YES set it to +32 as expected.

Combined build QC09 (sha256 4bbc13f1): the tick clears its flag before reading the link, so a kit change at that moment asks again. Boot, reload, load and a knob lock passed in rytm-emu. Reported by the author on QC09: it boots and kits load.

Combined build QC11 (sha256 442158cb8db538ec09239dbaf41dc3fff0e73425f878b8c2b677733781c818a6): core 0.7 base 0c92aa45, Filter Hz, Pipo Loop, QPERF, Silent Pad+Trig. After the owner's review, a kit's links stay until a press with QPER held, and the gestures read what is on screen. rytm-emu, factory kit K001 (31 locks, performances 1 and 10 linked).

| Check | Result |
| --- | --- |
| Boot | Mask stays 0x201, 31 locks |
| QPER + YES with 2 linked | MORE THAN ONE LINKED; nothing changed |
| QPER + PLAY, QPER + knob with 2 linked | Nothing changed; the sequencer did not start |
| QPER + BD, knob D | Mask 0x1, one new lock (32) |
| Kit reload after that | Mask 0x201 back, 31 locks: the saved kit's own |
| QPER + PLAY | 32 locks to 18, sequencer did not start |
| PLAY again while the message shows | 32 locks back |
| RECORD, QPER + SD, STOP | Mask 0x2, pasted (37 locks) |
| STOP again | 32 locks |
| QPER + BD on the linked one | Mask 0 |
| QPER + YES, amount poked to full | 14 locks removed (32 to 18) |
| QPER + SD in PERF | Mask 0x2 |
| FUNC + QPER, then YES | Nothing changed |
| GLOBAL menu open, QPER held, YES, PLAY, knob D | Mask and locks unchanged, the menu kept YES, PLAY started the sequencer as stock's |
| GLOBAL menu open, QPER + BD, then SD | Mask 0x2: the one link moved, and stock's link did not run |
| QPER held, GLOBAL, then SD, YES, PLAY | Mask 0x2, no QPERF message, locks unchanged, PLAY started the sequencer |
| QPER + T3 | Mask 0x4 |

The view classes were read from the stack on the main screen, a sound page, PERF, SCNE, MUTE, CHRO, TEMPO, the RECORDER, the GLOBAL menu and two FUNC menus. The GLOBAL menu lets stock's QPER view open above it, so a site in that view would not keep the gestures out, and they check the top view instead. Linking has its own site in that view, at stock's pad test, so it follows stock's reach and stays one link.

Reported by the author on QC11, the build above, Analog Rytm MKII: QPER + pad moved the link and the same pad unlinked it. QPER + knob inverted and showed the offset. QPER + YES held the sound and removed the locks. QPER + PLAY cleared and PLAY again undid it. QPER + RECORD showed COPY PERFORMANCE 8, and after linking another pad, paste and undo paste worked.

Also reported on QC11: a kit with two linked, QPER + YES showed MORE THAN ONE LINKED. QPER + pad left one link. Reloading the kit brought both links back, and YES showed the message again. GLOBAL menu open with QPER held: YES acted as the menu's, PLAY started the sequencer, and a knob changed nothing, with no message. Two pads over the menu could not link two: pad A then pad B stayed linked to B.

Combined build QC12 (sha256 0e66ceb6913f054f17e6de15bf2debcd2d5fe6440efba4bd2a0d8c9e5ba51ce6), after code review, on rytm-emu. A QPER view left open by a screen that took QPER's release closed on the UI tick, and several linked no longer shows one performance's offset on the knob.

| Check | Result |
| --- | --- |
| QC11 hold QPER, FUNC + TRK, release QPER, NO | QPER view stayed open; SD with QPER up moved the link; the next QPER + PLAY started the sequencer |
| QC12, same steps | QPER view closed |
| QC12, then SD with QPER up | Mask unchanged |
| QC12, then QPER + PLAY | 32 locks to 18, sequencer did not start |
| QC12, every row of the QC11 table except QPER held then GLOBAL | Same results |

Reported by the author on QC12, Analog Rytm MKII: link and unlink, a knob with nothing linked shows NO PERFORMANCE LINKED, QPER + knob, YES, clear and undo, copy, paste and undo. A kit with two linked: YES and a knob show MORE THAN ONE LINKED, the knob shows no offset, and QPER + pad leaves one link. Hold QPER, FUNC + TRK (the save kit screen), release both, NO: an unlinked pad then played its sound. Same steps again, the first QPER press being QPER + PLAY: CLEAR PERFORMANCE, the sequencer stayed stopped, PLAY again showed UNDO CLEAR.

Combined build QC13 (sha256 2acc65d9f5faeff7162d1e0aa682ea756c1897fa1bfc3c687317c4b5117932c7), rytm-emu: the same view now closes on QPER's release, from the key hook, in place of QC12's check on every tick. Every row of the QC11 table and the QC12 steps gave the same results. With the save kit screen still open after QPER's release, the QPER view was already gone from the stack. A quick second QPER press still cleared and undid.

Reported by the author on QC13, Analog Rytm MKII: QPER + pad linked, QPER + knob inverted and showed the offset, QPER + PLAY cleared and PLAY again undid it, and the same held on a quick second QPER hold. Hold QPER and FUNC, tap TRK (the save kit screen opens on a tap, not on a held TRK), release both, NO: an unlinked pad played its sound and the link stayed. Same steps, then QPER + PLAY: CLEAR PERFORMANCE, UNDO CLEAR, sequencer stopped. GLOBAL menu with QPER held: PLAY started the sequencer, and two pads left the second linked.

Also reported on QC13, reflashed: QPER + YES at about half showed PERFORMANCE 1 APPLIED. RECORD showed COPY PERFORMANCE 1, and after moving to a second pad, paste and undo paste worked. A kit with two links showed MORE THAN ONE LINKED on YES, QPER + pad left one link, and a kit reload brought both back.

#### Performance lane, 0.2.0-experimental

Build QL02 (sha256 8463a7fef6aa8b81a1e843a77b3e3fa8eb6da2c7ff8375bb48abaf04a6a476d6): core 0.7 on Modwerk base e558ad22 with QPERF alone, rytm-emu 2ac0f1f (`~/.cache/modwerk-upstream/rytm-emu`), stock OS 1.74, factory project K001 RYTMLINJE on a card image, boot popups closed with NO. That pattern runs per track with master length INF, so the lane loops every 64 steps. Pad pressure was sent as raw panel bytes (`--raw 90vv`, pad BD) with BD held by `--press`; amounts and engine words were read with `DTBOOT_PEEK` every 20M, screens with `DTBOOT_STEPS`.

| Check | Result |
| --- | --- |
| PERF, RECORD held + PLAY, BD held with pressure 0x10, 0x30, 0x50, 0x70, 0x7f, 0x40, 0x00 over steps 11 to 23 | Performance 1's amount followed: 0x0800, 0x1800, 0x2800, 0x3800, 0x3f80, 0x2000, 0 |
| RECORD (LIVE RECORDING off), next pass | Steps 75 to 88 (lane steps 11 to 24) replayed the same amounts, and the locked engine words matched the recorded pass (track 2 word 41: 0x066f, 0x114f, 0x1c30, 0x270f, 0x2c26, 0x16c1 against 0x066d, 0x1150, 0x1c2f, 0x2710, 0x2c29, 0x16c0) |
| RECORD held + PLAY, QPER + YES | PERF MOVES APPLIED; the amount stayed 0 from then on, and the same words followed the step locks on the next pass (0x0670, 0x1c30, 0x2710, 0x2c29, 0x16c0). Track 2 is 16 steps long, so the moves past step 15 landed on its steps 0 to 7 |
| QPER + NO after a take, next pass | PERF MOVES CLEARED, no playback |
| QPER + NO again, next pass | UNDO CLEAR, playback back |
| RECORD alone while playing | Not LIVE RECORDING: it toggles the byte before it (grid recording, by its behaviour); QPER + YES then acted on the kit (MORE THAN ONE LINKED with this kit) |

Build QL05 (sha256 e4af066b66cccc1b5763d8f0b225b87408847d4b068de798338960744fe4acd2), same setup, after a code review: the written lock is the step's first recorded value, the step after a move gets its value back even with no recorded zero, the row check counts only parameters the moves change, and the trig tests read stock's byte answer. Two one-step moves on BD, 0x7f on step 10 and 0x40 on step 13, then QPER + YES in LIVE RECORDING:

| Check | Result |
| --- | --- |
| Lane, next pass | Tracks 5, 7 and 9's locked words moved during counter steps 74 and 77 (lane steps 10 and 13) |
| Baked, the pass after | The same words moved during counter steps 138 and 141, and came back the step after each move |
| Track 2 (SD), whose steps 11 to 15 hold trigs with conditions | The step-10 lock (an empty step, so a lock trig) played; the return on step 11 and the step-13 lock did not on that pass, as stock plays a conditional trig's locks only when the trig plays |

Before QL05 the locks landed a step late: the pattern's step counter runs one step ahead of what plays (a lock on step 4 acted while the counter read 5). The lane takes moves at the counter's step, so the bake now writes each step's moves on the step before.

Reported by the author on QL06, Analog Rytm MKII, a pattern with SCALE per track and a master length set: pad moves recorded, but the lane did not loop with the track's length. With QPER linked to a pad and LIVE RECORDING left on, that performance kept recording over itself while its pad was not touched.

Build QL07 (sha256 cb589aa0ecba7cf9fc43fff2b4493e5083ee5757ed60b7ca40d2fef882e23e63) answers both: with a length per track the lane loops on the selected track's length and position, the bake gives each track the lane where it plays, and the QPER knob counts as moving only past 2 knob steps from where it last moved, so its wobble writes no move. rytm-emu, same setup as QL05 (BD selected, 16 steps; master INF):

| Check | Result |
| --- | --- |
| BD moves on steps 10 and 13, LIVE RECORDING off | Replayed on master steps 10, 26, 42, 58 and 13, 29, 45, 61: every 16 steps, on BD's step 10 and 13 |
| QPER + YES | Tracks 5 and 9 (16 steps) and track 7 (64 steps) moved on steps 10 and 13 of every 16 and came back after |
| The knob's wobble | Not tested: rytm-emu has no pot input |

Build QL09 (sha256 a861699f3b70a7aa009576e9e8371fe00a74b2805b016b203e4f0f99e947ebe0): the lane loops on the master length again (64 for INF or longer), as the author chose; QPER + YES lengthens tracks shorter than the lane and rewrites their loop-counting conditions; the QPER knob starts a turn only past 2 steps from rest, then counts every value until it stops. rytm-emu, same setup, master length poked to 32 (pattern + 0x14eb3):

| Check | Result |
| --- | --- |
| Master length 32, 18-step track 10 | Every track's step went to 0 when the master step wrapped, track 10 from its step 13. Its loop count rose at its step 18 and not at the wrap |
| BD moves on steps 10 and 20, QPER + YES | PERF MOVES APPLIED. Tracks 2, 5 and 9 (16 steps) and 10 (18) became 32 steps; tracks 7 (64) and the rest kept theirs. The locked words of tracks 5, 7, 9 and 10 moved on steps 10 and 20 of every 32-step cycle |
| Track 2's conditions (5:5 on 11, NEI on 12, 6:6 on 7, 13, 14, 15) | 11 became 3:5 and its copy 27 5:5; the 6:6 trigs lost their trig on steps 7 and 13 to 15 and became 3:3 on 23 and 29 to 31; NEI stayed; steps 4 and 5 were copied to 20 and 21 |
| Track 5 (4:4 on 5, 3:3 on 10) | 5 lost its trig and 21 became 2:2; 10 became 2:3 and 26 3:3 |
| The knob's turn gate | Not tested: rytm-emu has no pot input |

Reported by the author on QT01 (QL10 with the trace, `-DQPERF_TRACE`), Analog Rytm MKII, logged over USB MIDI with the trace logger: recording on a 64-step master was hard to follow, a 16-step master felt better, and a take on performance 1 did not play back. The log showed why: from the first pad presses, stock's key table kept pads 1 and 2 held for the rest of the run, sequencer stopped included, so both counted as touched and never played back; the QPER knob recorded only while it turned. The CCs stock sent showed a pad's pressure only on change, about half a second of silence while held at full, and a 0 on release.

QL11 drops the key table: a performance a pad or MIDI left above zero counts as held until its 0. The linked performance records the knob's value all the time during LIVE RECORDING. rytm-emu, master length 16, SD pressure 0x50 sent once on step 10 and 0 on step 0: the lane recorded steps 10 to 15 and replayed them the next pass. QT02 (sha256 76313726ff872c74b1acc320dcf55509cd182c400b4fbae6fe9dc836ed3b23ff) is QL11 with the trace.

An earlier run with pressure bytes and no held pad recorded only the 0.1 s after each byte, as designed: a pad counts as moving while it is held or its amount changes.

### Not tested

- Recording MIDI performance CCs into the quick perf rec.
- A project load dropping the quick perf rec, LOCK MEM FULL! from it, and a track at another speed than the pattern.
- QPER and RECORD + YES/NO while a pad is held in PERF or SCNE mode (stock's edit view on top), on a unit.
- The one-step lead at other track speeds, swing, or with a master length; QL05 measured it at 1x with master length INF only.
- QPER + NO on stock.

- SysEx kit receive.
- Menus and dialogs other than those above: they count as not ours because their class is not on the list.
- Performance load.
