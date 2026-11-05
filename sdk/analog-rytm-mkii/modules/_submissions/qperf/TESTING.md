# QPERF testing

Nothing here proves reboot persistence or the QPER knob itself. Hardware results below are the author's, each on the build named. QC13 is the 0.1.0 code; 0.2.0-experimental (the performance lane) has run only in rytm-emu, on QL02 and QL05 below. The code here is QL12 (sha256 6edc245edd79a9ceb22f57177884a84a650d5033afb1f2ee548a4259c90987fd; QT03 00ef4846e5d75fc5d097fd39c98a178798bbae3b5bd01af7479ebe0b8695f6ec with the trace). A second traced run on QT02 showed the stuck sound the author heard on pad 2: pad 2 was the linked performance, LIVE RECORDING had recorded it at the knob's steady 99, and that played back after the pad was let go; on the linked performance the pad's pressure also moved the knob's value (6 to 28 and back). QL12: the linked performance starts recording at the first knob turn or pad press of each LIVE RECORDING run, any drop to 0 counts as a release, and the messages are CLEAR QUICK PERF REC and APPLY QUICK PERF REC. rytm-emu: the steady SD hold recorded and replayed as on QL11, and QPER + NO showed CLEAR QUICK PERF REC. Before it, QL11 (sha256 cb917c2c910c91a89ebdccd7676c7f3221382a20ddc2529eade1a1b29315df4e), after the author's first traced run below. Before it, QL10 (sha256 1e6e06ce6529e74b0370621ae1798c203241a8915705102b491667b8fede3ca5), QL09 below after a second code review: the lock-row check counts the steps a track will have once lengthened, only tracks a move reaches are lengthened, and a copy that loses its trig loses its condition too. Rerun of the QL09 table on QL10: the same lengths, conditions and baked steps, and steps 7 and 13 to 15 of track 2 and 5 of track 5 kept no condition. QL06 (sha256 21fb67304cf99fed7ea792376e7d904e276bb65cb366b4a54c069d88e16d9e40) added PerformanceEditView, the FX track's PERF view, back to the held-pad check.

## Hardware

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

## Emulator

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

### Performance lane, 0.2.0-experimental

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

## Not tested

- Anything of 0.2.0-experimental on a unit, including how the panel reports a held pad's pressure and its release.
- Recording the QPER knob or MIDI performance CCs into the lane (rytm-emu has no pot input here).
- A pattern change or project load dropping the lane, LOCK MEM FULL! from the lane, a track at another speed, and a pattern with a master length.
- The one-step lead at other track speeds, swing, or with a master length; QL05 measured it at 1x with master length INF only.
- QPER + NO on stock.

- SysEx kit receive.
- Menus and dialogs other than those above: they count as not ours because their class is not on the list.
- Performance load.
