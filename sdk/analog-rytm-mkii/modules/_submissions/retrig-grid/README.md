# Retrig Grid

An Analog Rytm MKII mod by @stigmagit. Version 0.2.0-experimental, for OS 1.74 with core-ar2 0.3. Tested in rytm-emu; on a unit, the author reports that the retrigs follow the swing (the other checks are not yet reported).

## Overview

Hold RTRG and play a pad: stock plays the pad at once, then retriggers it at the RETRIG menu's rate, counted from the moment you pressed. The rate follows the tempo, but the series keeps whatever offset the press had from the steps. Pressed between two steps, the whole roll plays between the steps.

With Retrig Grid, while the sequencer plays, the pad still sounds at the press, and the retrigs after it fall on the sequencer's grid. A 1/16 roll lands on the steps, 1/4 on the beats and 1/12 on the triplets, counted in bars from PLAY. The first grid point closer than half a period to the press is skipped, so the first gap is never shorter than half a retrig. The same applies to pads set to ALWAYS ON.

The grid swings with the pattern. Each retrig moves as the sequencer moves the pad's own track: a step whose swing trig is on comes late by the pattern's SWING, and a trig's micro timing moves its step. A 1/16 roll at 66 % falls with the track's own swung 16ths; faster rates (1/32, 1/80) and triplets are spaced evenly between the swung steps. With the sequencer stopped there is no grid, and pads retrigger from the press, as stock.

## Controls

| Control | Action |
| --- | --- |
| GLOBAL > RETRIG GRID ON / OFF | The last row of the GLOBAL menu, after SYSTEM. YES turns it over. ON (the default) puts pad retrigs on the grid; OFF leaves them as stock. Kept with the project. |

The RETRIG menu (hold RTRG) keeps its stock rows: RETRIG (the rate), LENGTH, VEL.CUR and ALWAYS ON all work as before.

## Usage

Play a pattern, hold RTRG and play pads: the rolls stay locked to the steps whenever you come in.

### Quick tutorial

1. Press PLAY with any pattern.
2. Hold RTRG and press the BD pad between two steps, then keep it held: BD sounds at once, and the retrigs after it fall on the steps.
3. Still holding RTRG, set RETRIG to 1/4, then to 1/12, and play the pad again: the roll lands on the beats, then on the triplets of the bar.
4. Set the pattern's SWING to 66 % and roll at 1/16 again: the retrigs on the off-beat 16ths come late, as the pattern's own trigs do.
5. To compare with stock, press GLOBAL, go down to RETRIG GRID ON and press YES: it reads RETRIG GRID OFF, and rolls follow the press again.

## How it works

Stock arms a pad's retrig series in the audio block that plays the press. It sets a tick counter to 960 (a whole note, 240 ticks a quarter note), and the next tick's deadline one tick after that block on the musical clock. Retrigs then fire on the ticks where the counter is a multiple of the rate's period. Stock arms the per-step retrigs set in the sequencer from the step itself, so those are already on the grid; only the pad path starts from the press.

Stock runs at most one tick an audio block, and a counter of 1 always fires. LENGTH and VEL.CUR run on time, not on ticks.

Retrig Grid subscribes to core-ar2's `ev_render_out`, which runs at the end of every audio block. There it follows the sequencer's 24 PPQN pulse: each pulse moves its time on by the same amount whatever the pattern's speed, so the module counts them to know the pulse's place in the bar. It sets that place from the master step and pulse only when the sequencer (re)starts; the master step counts from 1 at PLAY. For each retrig it sets the series' counter to 1 and its deadline to the retrig's time: the next grid point of the rate in the bar, moved as the sequencer moves the pad's track. The sequencer prepares each step a step ahead, and the module reads its track step counter, the pattern's SWING and the track's swing trigs and micro timing. A step's offset is SWING minus 50, over 50, of a track step when its swing trig is on, plus the micro timing (1/24 of a track step a unit) of a trig. Between two step starts the offset goes evenly from one to the next. The first retrig is the first grid point at least half a period after the press, once moved. Stock does everything else: LENGTH, VEL.CUR, the rate (read again for each retrig, so changing it while RTRG is held works), and stopping when the pad is released.

It patches no stock code and writes no stock record but those two words of the series it times. Until a pad has retriggered, the audio block costs it the pulse word and three on-chip reads. After that, it reads the twelve deadlines' sum each block and looks at the tracks only when a retrig has fired or a press armed a series.

## Changes to stock flows

- **Pad retrigs while the sequencer plays** (RTRG held, or ALWAYS ON): the retrigs after the first hit move to the swung grid. The first hit, the rate, LENGTH and VEL.CUR are stock's. Turn RETRIG GRID OFF in GLOBAL to get stock's timing back. Checked beside it: the sequencer stopped (stock), and the switch OFF (stock).
- **GLOBAL menu**: one row, RETRIG GRID, after SYSTEM, through core-ar2's `ev_settings`. The other rows are untouched.

## Compatibility and limitations

- Analog Rytm MKII, OS 1.74, core-ar2 0.3. Events: `ev_render_out`, `ev_settings`, `ev_project`. One project storage bit (`retrig_grid_off`).
- The grid counts bars from PLAY in the sequencer's 24 PPQN pulses, through tempo, speed and pattern changes. The swing follows the pad's own track (its swing trigs, speed and length), as the pattern plays it. A track whose speed changed while playing can have its steps off the bar's grid; rates then fall on the bar's grid, swung by the steps around them.
- Micro timing moves only steps that hold a trig on the pad's track. Where micro timing moves a trig past the next step, the retrigs keep their order: the later one comes with the earlier, in the next audio block.
- The swing is read from the playing pattern; across a pattern change, the first retrigs of the new pattern may use the old one's swing.
- The first gap after the press is between half a period and one and a half periods. At 1/1 the first retrig can come up to a bar and a half after the press, on a bar line.
- Per-step retrigs from the sequencer are not changed: they already start on their step.
- Not tested: external MIDI clock.

## Tests and measurements

In rytm-emu on build RG08 (core-ar2 0.3 + this version), trig times read from the analog voice frame at 127 BPM, factory project:

- With the pattern's BD trigs poked on every step, a 1/16 roll on BD falls on the same audio frames as the pattern's own trigs at swing 50, 58 and 66 %. At 66 % it also does with micro timing on four trigs, in NORMAL scale and at 100 BPM, and at 58 % after a fresh PLAY. So do a 1/32 roll with the track at 2x, 1/12 with it at 3/4x, and 1/4 on BD trigs on the beats.
- On a BD track without trigs, at 1/16, 1/32, 1/12, 1/4 and 1/80, for four press positions, every retrig is within 19 samples (one 32-sample block) of the swung grid at 50, 58 and 66 %.
- Stopped and OFF retrigger from the press, as stock; ALWAYS ON follows the grid.

0.1.0 put 1/8, 1/4, triplet and slower rolls one step before the pattern's beats (rytm-emu, RG05 and this method); 0.2.0 fixes it. On the author's unit, 0.1.0 was reported good by ear, and with 0.2.0 (build MB04) the author reports that the retrigs follow the swing; micro timing and the slower rates were checked in rytm-emu only. Details and the method are in [TESTING.md](TESTING.md).

Load: about 16 instructions an audio block until a pad has retriggered, about 35 while it retriggers, and about 350 once for each retrig, counted from the compiled code. Not measured on a unit.

## Screens and audio

| | |
| --- | --- |
| ![GLOBAL menu, RETRIG GRID ON](media/settings-on.png) | ![GLOBAL menu, RETRIG GRID OFF](media/settings-off.png) |

Emulator captures, with the plans in [media/capture.json](media/capture.json). No audio recording.

## Authorship and licences

Original work by @stigmagit, GPL-3.0-or-later ([LICENSE](LICENSE)). It runs on elekloader's core-ar2 (irpina, GPL-2.0-or-later). The label callback follows core-ar2's store-check example. The firmware locations were found by disassembly of the owner-supplied OS 1.74 and measured in rytm-emu (trigcondition, MIT); no firmware bytes are included. Screens: [media/LICENSE.md](media/LICENSE.md).
