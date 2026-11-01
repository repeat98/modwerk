# Live Rec Retrig Fix testing

## Retrig Grid merged in (rytm-emu, 31 October 2026)

A local merge, not agreed with stigmagit. rytm-emu c5732f0, factory project, 127 BPM, swing 57 %, RETRIG set in the RTRG menu, BD empty, each roll about 14 steps, press stepped across about two steps. Emulator only; no pad pressure stream; nothing below ran on a unit.

Builds: RC03 (before, Retrig Grid 0.2.0 and this module as two), MG02 (this source with Silent Pad+Trig on core-0.7, sha256 of the build not kept for release), RC04 (RC03's set with the two modules as one, sha256 751e5fbcec605128…).

| Case | Before (RC03) | Merged (MG02) |
| --- | --- | --- |
| 1/16, press in the window where stock's step and the skip rule differ | one step empty after the press | no gap, 20 of 20 positions and modes |
| 1/32, quantize off, press 0.3-0.5 step late | a trig every two steps, micro +3/+9, live hits moved | a trig each step, 10 of 10 |
| 1/32, quantize on | first step empty for some presses | a trig each step, 10 of 10 |
| 1/12, quantize off | hits +7/-9/0, press as played | press on the same pattern: 15/-9 or 0/+0 |
| 1/12, 1/8, quantize on | a gap after the press for some presses | no gap, 20 of 20 |
| 1/8, quantize off | press as played | on the grid, 10 of 10 |

Playback against the live roll (1/16 and 1/12, quantize off): retrigs within 0.01 step; the press alone moves, by the snap (for example live +0.01, back +0.49 in steps from the press), as designed. RETRIG GRID unchecked: hits a step apart from the press with played micro, 15 of 15, at 1/16, 1/12, 1/32. The row: last in SEQUENCER CONFIG, beside Silent Pad+Trig's rows, YES, RIGHT and three reopens.

Not run: ALWAYS ON, a press again during a roll, a rate change during a roll, rates 1/20, 1/24, 1/40, 1/48, 1/64, 1/80 merged, the row across save and reload, swing 50 and 66, ADVANCED scale with other lengths, a unit.

### First unit run, and the emulator sweep after it

Unit, RC05 (RC04 with Pipo Loop 0.1.1), reported by npp1993: the row is last in SEQUENCER CONFIG and works beside Silent Pad+Trig's rows; 1/16 quantize on, 1/12 quantize off, 1/8 and 1/12 quantize on, 1/32 both modes and RETRIG GRID unchecked all passed. 1/32 quantize off showed the first trig off the step: the press went to a half step, the other trigs sit on whole steps.

RC06 (RC05 with the press on the nearest block start at rates that record a step retrig, sha256 63ad2bf5a6b09935…), rytm-emu c5732f0, set as above, RETRIG set in the RTRG menu. Five press positions unless noted.

| Case | Result |
| --- | --- |
| 1/16, 1/8, 1/12, 1/32, ten positions, both modes | no gaps; 1/32 quantize off first trig on the step, was +10 in RC05 |
| 1/20, 1/24, 1/40, 1/48, 1/64, 1/80, both modes | a trig every 4, 2, 2, 1, 1, 1 steps, none off the step; at 1/20 one press over a step from a block start stayed as played (15/-6) |
| 1/4, 1/2, 1/1, quantize off, eight positions | within a step of the grid the press snaps; further it stays as played (1/+7, 3/-4), the next grid point follows |
| ALWAYS ON (RTRG + YES, no RTRG held), 1/16, 1/12, 1/32, both modes | the same trigs as RTRG + pad |
| Press again during a roll, 1/16, 1/12, 1/32, both modes | no step lost; playback as played |
| Rate turned during a roll: 1/16 to 1/32, 1/32 to 1/16, 1/16 to 1/12, both modes | trigs follow; playback within about 0.1 step, more inside the two steps the rate passes through in-between values |
| Swing 50 and 66 (pattern poke), 1/16, 1/12, 1/32, both modes | no gaps. Swing 50: playback equals live |
| 1/32, swing 57 and 66, live against playback | not the same: live 0.59 1.16 1.73, back 0.59 1.09 1.59 1.73; a step retrig runs straight from its trig. Listed in the README |
| Row unchecked and checked, `--power-off`, cold boot on that card | the row comes back as it was, on the card |

Temp Save on RC06: TEMP SAVED shown. Not run in the emulator: audible checks, project save through the menu, a project switch, the row's bit on an older project.

Unit, RC07 (RC06 with Pipo Loop 2cd623f3, sha256 6ae42b7b717b63d7…), reported by npp1993: 1/32 quantize off, every trig on the grid; a press under half a step recorded one hit; RETRIG GRID unchecked, SAVE PROJECT AS, LOAD PROJECT: still unchecked. The same save showed random characters in the name entry screen on the tester's project, with the project's name as expected elsewhere. Not reproduced: rytm-emu's factory project shows a clean name on RC07 and on stock 1.74, existing and empty slots. Cause not known.

### Code review fixes, RC08

A code review of the merge found a gap, drift and eight smaller items. RC06 (before) and RC08 (RC07 with the fixes and Pipo Loop f48b95d9, sha256 6fe16a5d7ad580c6…), rytm-emu c5732f0, set as above.

| Case | RC06 | RC08 |
| --- | --- | --- |
| 1/16 and 1/12, press stepped 0.02 step across four steps, both modes | one step empty at 1/16, press 1 of 192 positions, both modes: the series skipped a point the snap kept | no gap, 384 of 384 |
| 1/12, quantize off, a roll past one loop | the second pass rewrote the trigs (2/-10, 3/-5), playback 0.2 step off | second pass as the first (1/+7, 3/-9), playback within 0.01 step |
| The 259 cases of the sweep above (rates, ALWAYS ON, a press during a roll, rate changes, swing) | | the same trigs on every step, and in the rate-change cases the same hit times as RC06, on the source one commit before Pipo Loop f48b95d9 |

The trace showed the recorder reading the press before the audio block arms the series, in rytm-emu; the source handles either order, a unit's order was not read. A press moved back a step no longer holds the wipe guard: not reproduced before the change, no case added. While LIVE RECORDING retrigs no longer follow trig micro timing, a change from Retrig Grid 0.2.0: listed in the README. Temp Save on RC08: run, screen not compared. `npm run module:doctor` could not run on this branch: it stops on a missing generated file, src/community/module-changelogs.json. Not run: RC08 on a unit.

### First hit lost after a press, RC09

Unit, RC08, swing 61, CH pad, quantize on, 1/16, reported by npp1993: a five-step roll recorded steps 9, 11, 12, 13; step 10 sounded and did not record. 1/12 quantize off held across two bars kept its steps (3, 7, 11, 15 empty) and sounded as triplets; a rate change during a roll played back as played.

Reproduced in rytm-emu on RC08 at swing 61 on CH and on BD, on narrow press timings: 1 of 50 at 8,000 instructions apart, 1 of 200 at 2,000. A traced build showed a hit from the press itself, before the series was rearmed: Retrig Grid leaves a count of 1 after a roll, so stock's 960 at the next press read as a fired retrig, ahead of the press's note event, and the first real hit was not recorded. RC06 lost none of 200 at the same spacing; that is not proof it was free of this.

RC09 (RC08 with the arming test and a press seen soon after its series treated as that series', sha256 a1d978964af8288e…): 0 of 200 on the fix's scratch build, 0 of 50 in each of four loops on RC09, 0 of 384 for the gap, the second pass of the long roll as the first, and the 259 sweep cases the same trigs as RC06. The same press timing on a unit is not known.

Unit, RC09, swing 61, CH pad, quantize on, 1/16, 10 to 15 short rolls, reported by npp1993: recorded as heard, except possibly one roll with a press very late, just before the next step, where a trig may have been missed. Whether that was a hole in the roll was not recorded.

## 0.1.0-experimental (rytm-emu, 31 October 2026)

Emulator results first; pad pressure there is a scripted stream, not a real pad. The unit's results, on RR09, are at the end.

### Builds

Owner-supplied OS 1.74 (stock sha256 cb0f99d6…e123), core-ar2 0.7 (`vendor/elekloader/catalog/core-ar2-0.7.elemod`), linked with `scripts/link-image.mjs`, `m68k-elf-` toolchain.

- RR05: this module alone, sha256 90a9f2e9d0b48134…
- RR06: this module and Retrig Grid 0.2.0-experimental, sha256 90a996197948a5cd…
- RR07: RR05 with the early-hit fix, sha256 bdc962d64cc82566…
- RR08: RR06 with the early-hit fix, sha256 c97bd28f65c01ab8…
- RR09: RR07 with the guard on the recorder track's step, kept past the release, sha256 56094153e36ac7e8…
- RR10: RR08 with the same, sha256 c36b3f55527005d6…
- RR11: RR09 with VEL.CUR cut to each trig's share, sha256 c6e0a9510d03991b…
- RR12: RR10 with the same, sha256 5b18868508563ba4…
- RR13: RR11 with quantize live rec applied to retrig hits, sha256 256743db1c92d0a1…
- RR14: RR13 with the review fixes (guard dropped outside LIVE RECORDING, the fade's end taken only once the velocity has stopped moving), sha256 16daec12a612e5fb…; the fade, early-roll and pre-rec cases matched RR11 and RR13, the end now zeroes from the second level trig
- RR15: RR12 with the same, sha256 f86752dc986c8f4e…
- RR16: RR14 with RTRG + YES turning ALWAYS ON over, sha256 d4b991ef3a9a630e…
- RF17: RR16 under the module's final name (id `live-rec-retrig-fix`), sha256 a67e4adb57cedfb9…; the two images differ only in the sysex header's version tag (`cmp`: four bytes, all before offset 64), so RR16's unit results hold for it.

Emulator: rytm-emu c5732f0.

### Diagnosis

- **Certain** (disassembly and rytm-emu): the RETRIG menu's pressure handler writes a trigless lock with retrig and velocity on each step. The LIVE RECORDING tick treats the hold as a held note and removes the lock trig under it, unless the lock came after that step's last tick.
- **Certain** (rytm-emu): disabling that one call in stock left a velocity lock on all 15 steps of a roll, against 5 of 15.
- **Certain** (disassembly): stock's retrig series fires in the audio block and queues no note event to the recorder, so a roll's hits never reach it.
- **Certain** (rytm-emu): live retrigs are not quantized. A press 0.23 of a step early or 0.15 late keeps the whole roll that far off the grid.
- **Certain** (disassembly and rytm-emu, RR05): a hit placed on the next step becomes the recorder's held note before the playhead gets there. A sequencer notification in that gap runs the held-note wipe on the playhead's step and removes the hit before it. Runs at micro -10 lost steps 5 and 11 (roll from before LIVE RECORDING) and step 0 (roll from inside it); with the wipe call disabled none were lost. Micro -6 and later lost none here, and the emulator's notifications came about 0.4 step before a step, one every 6 steps. What sends them was not identified, so a unit may lose hits at other timings without the fix.
- **Certain** (disassembly): the wipe's "current step" is the step of the track the recorder follows (recorder + 64, its index at + 8), the same for every track it loops over, and the tick clears the skip byte of every track each pass. A pad press sets that track to the pad's (rytm-emu: index 0, then 1 after an SD press). RR09 reads that step, and keeps the guard after a release until the step arrives or the track's held notes are gone.

### Method

Factory project (RYTMLINJE, 127 BPM, ADVANCED scale), BD at 1x, swing set to 50 %, quantize live rec on unless noted. The pad is pressed, held about 15 steps and sent a pressure message every 20 ms, a triangle wave across the pad's range. Trig words and locks are read from the pattern in memory. Hit times come from `DTEMU_FRAME_TRACE=160,162`, during recording and on the next loop with no keys held.

### Results

Hits closer than 100 samples count as one: a trigger's switch takes up to 64 samples. All on RR05 unless noted.

| Case | Recorded | Playback against live |
| --- | --- | --- |
| 1/16, press 0.15 step late | plain trigs on all 15 steps, press included | 1.00 step apart, within 0.02 step |
| 1/8 | a plain trig every 2 steps | 2.00 steps apart, within 0.02 step |
| 1/12 | a plain trig for each hit, micro timing kept | 1.29-1.38 steps apart |
| 1/32 | a trig a step, step retrig 1/32 | 0.50 step apart |
| 1/24, 1/20 | a trig every 2 and 4 steps, step retrig | 0.67 and 0.80 step apart, within 0.05 |
| ALWAYS ON, 1/16 | as RTRG + pad | as RTRG + pad |
| Track at 2x, 1/2x | rates follow the track's step | as played, within 0.02 step |
| 1/16 to 1/24 during the roll | plain trigs, then a trig with step retrig from the next hit | spacing as played |
| Press again during a roll, also with Retrig Grid | a new press trig at 0x7f, the roll goes on from it | as played, within 0.02 step |
| CHROMATIC, a second note during the roll | hits follow the new note | not measured |
| Hold of 30 steps, past the 16-step loop | second pass overwrites, no step lost | 1.00 step apart |
| Roll started before LIVE RECORDING (RR07), micro -10, +3, +10 | trigs from the first hit on, no step lost | 1.00 step apart, within 0.02 step |
| Roll inside LIVE RECORDING, hits early (RR07), micro -10 and -6, also ALWAYS ON | no step lost | within 0.02 step |
| Early hits at 1/8, 1/12, 1/32 (RR07) | every hit recorded, steps without one stay empty | spacing as played |
| Press again during a roll, hits early (RR07) | no step lost | as played |
| 1/16 pass, then a 1/8 pass over it (RR07) | the wipe still clears the steps between hits, same trig words as RR05 | not compared |
| Retrig Grid, early press and roll from before LIVE RECORDING (RR08) | no step lost | first hit at the press, rest on the grid |
| Retrig Grid beside it (RR06) | plain trigs on all 15 steps | first hit at the press, rest on the grid |
| RR09 rerun: roll from before LIVE RECORDING at micro -10, +3, +10; inside it at -10, -6, +7; ALWAYS ON early; re-press early; 1/10 early; 2x; 1/16 pass then a slower pass over it | trig words identical to RR07 in every case | identical to RR07 |
| RR10 rerun: Retrig Grid, roll from before LIVE RECORDING and early press inside it | identical to RR08 | identical to RR08 |

Velocity: the 1/16 velocity word at each playback hit equalled the recorded locks in order, on the prototype (PR12, 2026-10-31). Recorded velocities follow the scripted pressure at half its raw value.

VEL.CUR at 1/32, RR05 to RR10: each trig stored the menu's value in full and velocities followed the fade, not the pressure (stock's pressure path is off with VEL.CUR set). OFF stored 0. On the unit (below) that played back as a fade restarted inside every trig. **Certain** (disassembly): the engine runs a curve at the speed its length table (0x402907b0, 128 entries) gives for the length; the live series takes the menu's LENGTH, a recorded trig its own retrig LEN, which stock's note-off sets from the hold (0x400b43d8); the two differ (menu 1/4, trig 1/16 on the unit; emulator: default LENGTH 46, a one-step hold 14). RR11: VEL.CUR -10 with LENGTH at 54 and a 1/32 roll; live velocities (engine word per hit) 127, 126, 125 … 117 then level; recorded trigs 118, 117 … with curve -2 on the first and 0 once the fade's end (press + VEL.CUR) was reached, -1 on a shorter trig; playback pairs 123/121, 122/120, 118/116, 117/116 then level at 117, against RR09's -10 on every trig and pairs 123/117, 122/116 … 117/111. A roll without VEL.CUR and an early 1/16 roll on RR11 matched RR09.

A held pad without a retrig gave the same trig word on RR07 as on RR05. Other cases in the table ran on RR05 or RR06, not again on RR07 or RR09. A roll on a track other than the one the recorder follows was not produced: a pad press selects its track, and no other path to a retrig series was tried.

RTRG + YES on RR16: after one press, a plain BD hold in LIVE RECORDING recorded a trig on every step, the roll from the hold; after two presses, one trig, as a plain hold without the gesture. Stock's YES in the menu was not compared.

Quantize live rec on RR13: on (the project's default), rolls pressed 0.28 step late and 0.40 step early at 1/16, and one at 1/32, recorded every hit at micro 0 and played back on the grid, that far from the live roll; off, the same late press recorded micro +7 on every trig and played back within 0.02 step of live. Up to RR12 a retrig hit kept its micro timing with quantize on. Plain pad hits still quantize with quantize on. Against stock: a held pad without a retrig over plain trigs, identical trig words. NO + pad removes the roll's trigs. NO + SCNE reloads the pattern and removes the recording, as stock.

The release race, the note-off flags and the queue guard were changed from reading the code. No test reaches them.

### Not tested

External MIDI clock. Where hits land when the pattern changes during a roll (the live hits matched stock). Load was not measured. RR12, RR13 and RR15 have not run on a unit.

## On the unit: RR09 (Nathaniel Pavel, 31 October 2026)

Analog Rytm MKII, OS 1.74, flashed with RR09. Reported by the author from playing; velocities read from the trigs in GRID RECORDING.

| Case | Result |
| --- | --- |
| Plain pad hits, quantize off; a held pad without RTRG | as stock |
| RTRG + BD for a bar with varying pressure, quantize off | a trig on every step, off the grid as played, a velocity lock on each (100 with FIX on, as stock; the pressure with FIX off), note length 1/16 on each; playback as played |
| Roll started before LIVE RECORDING | recorded from entry, no gap |
| Several rolls started at random moments, some ahead of the beat | no gaps |
| RETRIG turned during the roll | 1/8: a trig every two steps, length 1/8; 1/12: plain trigs, micro-timed; 1/32: a trig a step with the step retrig; the trig before a change cut short (0.813); rolls sound as played across the change |
| ALWAYS ON pad | as RTRG + pad |
| Hold across the pattern end, release after a hit | all trigs survived |
| Lift and re-hit BD during a roll | the re-hit's trigs at the new velocity, roll continues |
| VEL.CUR +127 at 1/32 | each trig velocity 127 with RETRIG 1/32 and VEL.CUR 127, hits inside a trig equal (127 cannot rise) |
| VEL.CUR -127 at 1/32, LENGTH 1/4 | trigs 127, 95, 63, 31, 1, 1, each with VEL.CUR -127 and LEN 1/16; playback reported to differ from the live roll: the fade restarts inside each trig. Fixed in RR11, not yet on the unit |
| NO + BD in LIVE RECORDING | first reported as not erasing; ALWAYS ON was on for BD from the test before, so the press under NO started a roll the module recorded. On RR16 with ALWAYS ON off: trigs erase as the playhead passes. NO then BD plays each trig once and erases it; BD then NO records the press and erases silently from there. Read from code: with NO held in LIVE RECORDING the pad handler returns at once (0x400c7b58), and the erase is the recorder's own erase mode (kind 3 at recorder + 360, set from held keys, cleared at the step reached, 0x400c7f72); a pad pressed first opens a held note, whose wipe (0x400c81ec) clears each step before it sounds. rytm-emu: BD then NO equals a plain hold; NO then BD erases nothing there, its key poll is not modelled. The module touches neither path |

On RR11 (sha256 c6e0a9510d03991b…), same unit, same day:

| Case | Result |
| --- | --- |
| VEL.CUR -127 at 1/32, LENGTH 1/4, FIX off | playback one smooth fade, no restart inside a step. Trigs: 127, 95, 63, 31 each with RETRIG 1/32, LEN 1/16 and VEL.CUR -32; from the trig at velocity 1 on, VEL.CUR 0 |
| VEL.CUR OFF, 1/16 roll with pressure | velocities are the pad pressure, no curve on the trigs, as RR09 |

On RR14 (sha256 16daec12a612e5fb…), same unit, same day:

| Case | Result |
| --- | --- |
| Quantize live rec on, RTRG + BD pressed between steps, 1/16, slow tempo | live roll where played; trigs on the steps, playback on the grid |
| Quantize live rec off, same | trigs off the grid, as played |
| VEL.CUR -127 at 1/32, LENGTH 1/4, FIX off | one smooth fade; trigs 103, 71, 39, 7, 1, 1 with VEL.CUR -32 on the first five and 0 on the last |
| STOP during a roll, then RECORD + PLAY and a new roll | recorded normally |

On RR16 (sha256 d4b991ef3a9a630e…), same unit, same day: RTRG + YES turned ALWAYS ON over on the menu's row, on and off, on BD and on another track; a plain pad hit rolled with it on and hit once with it off.
