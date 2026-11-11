# Quick Mod Assign testing

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
| LFO held on the LFO page, WAV turned three steps | NOT AN LFO TARGET, WAV unmoved |
| Plain LFO tap with Loop Sync: SMPL, LFO tap, FUNC + knob A | stock's SPD step (before the replay through `core_key`: Loop Sync's box) |
| Plain LFO taps with LFO RND | the second tap reaches LFO RND's page, the third returns |
| FX track, LFO held, TIM turned | TIM becomes the FX LFO's destination |
| FIX + FRQ, FUNC + LFO, FLTR then LFO tap then a turn | as 0.1 / as stock |

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
| LFO held on the LFO page, WAV turned: NOT AN LFO TARGET, WAV unmoved | pass | fails (WAV moves) |
| FIX held, FRQ turned: velocity link +21, FRQ unmoved; a knob press sets it to 0 | pass | fails, as it should |
| Plain LFO taps (FILTER, LFO, SAMPLE pages), then FUNC + knob A steps SPD (Loop Sync saw the replayed tap) | pass | pass (same screens) |

Not covered by the rig: how the LFO sounds, pads, the FX track's LFO, kit save and reload, a power cycle. Seen in the run: during the hold the box rounds DEP down (+1.93 shows +1, -1.93 shows -2).

**0.2.0 on the author's unit, by hand, reported by the author, 10 Nov 2026 (QL05 from RAM, before the depth box showed hundredths and before the DEST wording):** pass: the LFO moves the filter after LFO + FRQ and the LFO page shows DST FRQ and the depth; LFO + TUN and LFO + DEC take the LFO at depth 0, more turns set the depth, a knob press sets it to 0; on the FX track LFO + a delay or reverb knob takes the FX LFO; an LFO tap opens the LFO page on the release and FUNC + LFO is stock's. Not tried yet: pads with velocity and aftertouch links, PERF and SCNE pad locks during an LFO hold. Asked for: the depth in the box at the LFO page's resolution (it showed whole numbers), DEST rather than TARGET in the popups (both in 5fd99549d).

**0.2.0 final (depth box and DEST), the test rig on the author's unit (not by a person), 11 Nov 2026.** QL10 (the depth box at the LFO page's resolution on label knobs, DEST popups, the review fixes) and QL13 (this source: the box also on widget knobs, one width, (0) at depth 0), each with Loop Sync 0.3.2, RAM-booted over the flashed OS, scratch project. The same six cases as above: on each build run 1 differed only on the screens changed on purpose (the depth boxes, the DEST popup; on QL10 also the SAMPLE page's TUN dial, turned by another session, so that case now checks the page by its labels), `--record` 6 pass, plain 6 pass. QL10 came back armed from a project saved under another storage layout: the development base's arm at boot.

**0.2.0 final, by hand, reported by the author, 11 Nov 2026:** on QL10, FIX and SAMPLER links and aftertouch work as before; PERF mode with LFO held and a knob turned assigns the LFO; while a scene or performance lock is being set (its pad held) the LFO key is stock's and a tap opens the LFO page, as intended. The depth box missed knobs drawn as widgets (OVR, DEL, REV, PAN, VOL: whole numbers), fixed in QL12, which looked good apart from the box widening with the digits, fixed in QL13. On QL13: the one-width box is good; with LFO held, a PERF pad held makes performance locks (stock's), and LFO assigns again once the pad is let go.

**0.2.0 package on the author's unit, by hand, reported by the author, 11 Nov 2026 (asked for in review).** The package's own image on the plain base 1c14b6b0 beside LFO RND 1.2.0, both from their pinned packages, flashed (not RAM-booted). QP01 (`d32502dc…`, the package before the LFO page was left to stock): FIX on FILTER shows FRQ and RES at 0, a turn counts FRQ's box up while FRQ's stored value stays; SAMPLER + DEC, pad pressure changes the decay; LFO + FRQ shows the depth in hundredths, (0) at 0, the page stays on FILTER; LFO taps go LFO page, LFO RND's page, LFO page; FIX key as before; kit saved and power cycled, the velocity, aftertouch and LFO links kept. All pass. Asked for: the LFO key stock's on the LFO page, so holding it shows the page's values. QP02 (`dd4a9e66…`, this package, `26c6dce9…`): holding LFO on the LFO page shows the values; two taps from there go to LFO RND's page and back; LFO + FRQ on FILTER, depth in hundredths, the page stays; FIX and SAMPLER assign as before; power cycle, the destinations kept. All pass. (LFO RND's DS1 and DS2 showed an error on the scratch project: LFO RND's own page, not this mod.) Steps for a unit run of it, alone or in a combined image:

1. FILTER page, hold FIX: FRQ and RES shown as `0` boxes, nothing in the corner. Turn FRQ: its box counts up, FRQ itself does not move. Soft and hard pad hits differ. SOUND SETTINGS, VELOCITY MOD shows FILT FRQ.
2. AMP page, hold SAMPLER, turn DEC: pad pressure changes the decay. Tap SAMPLER alone: the recorder opens; hold it with a turn: it does not.
3. Fill four slots, try a fifth: VELOCITY MODS FULL (AFTERTOUCH MODS FULL for SAMPLER). Turn one back to 0, the fifth now fits.
4. FIX tap: fixed velocity toggles on the release. FUNC + FIX: stock's popup. Hold SAMPLER and tap FIX: nothing.
5. PERF mode: hold FIX and turn a knob (the box), then with FIX still held press a pad and turn (a performance lock, as stock).
6. Save the kit, power cycle: the links are kept.
7. FX track: FIX tap toggles fixed velocity at once, FIX held with a knob turned edits the knob, SAMPLER opens the recorder. On a sound page hold FIX, select the FX track: its knobs edit as normal.
