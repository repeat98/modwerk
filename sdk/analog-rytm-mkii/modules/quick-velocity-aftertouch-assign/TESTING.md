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

Not tested: scene edit opened by a held SCENE on the unit (needs a person); 48 locks full; a scene pad or QPER holding the locker with SCENE in either order; a CHRO pad held through the first knob event; LIVE RECORDING; a kit save and reload of the new locks; the sound.
