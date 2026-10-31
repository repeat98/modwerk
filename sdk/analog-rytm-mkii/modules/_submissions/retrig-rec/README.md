# Retrig Rec

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.1.0-experimental, for OS 1.74 with core-ar2 0.7. Tested in rytm-emu only; it has not run on a unit.

## Overview

Hold RTRG and a pad in LIVE RECORDING, or play a pad set to ALWAYS ON, and vary the pressure. Stock records one trig for the press and tries to add a trigless lock on the steps after it. Its held-note erase removes most of those again, so the recording is sparse and the velocities do not follow what you played.

With Retrig Rec, every retrig hit records a real trig, with the velocity it sounded at and the timing it sounded at. Stop recording and the pattern plays the roll back as you played it.

## Controls

One gesture. The RETRIG menu keeps its stock rows, and what they do to a recording is below.

| Control | Action |
| --- | --- |
| RTRG + YES | Turns ALWAYS ON over for the track the RETRIG menu shows (the selected track, or the TRIG key pressed while RTRG is held), whichever row is lit. The row shows the new state. |

| Stock control | With Retrig Rec |
| --- | --- |
| RETRIG | The rate played and recorded. Change it while you hold a roll and the trigs follow. |
| VEL.CUR | Any value but OFF turns pad pressure off, as on stock, so the roll fades from the press over LENGTH, and each recorded trig takes the velocity the fade had at its hit. Trigs that carry a step retrig (rates faster than a step) also get the slice of the curve that falls inside them, so played back in a row they follow the one fade you heard. OFF: one velocity for the hits of a trig. |
| ALWAYS ON | Records like RTRG + pad. |
| Quantize live rec | As for any note: on, every retrig hit and the press record on their step; off, they keep the timing you played. The live roll sounds where you played it either way, as stock. |

## Usage

Set a retrig rate, record, hold a pad and lean on it. Slower rolls and ones on the grid become ordinary trigs you can edit one by one in GRID RECORDING.

### Quick tutorial

1. Hold RECORD and press PLAY to enter LIVE RECORDING.
2. Hold RTRG and hold the BD pad for a bar, pressing harder and softer.
3. Let go, and press PLAY to leave LIVE RECORDING with the sequencer running.
4. The roll plays back at the velocities you played.
5. Press RECORD: BD now has a trig on each step of the roll.

## How it works

A step holds one trig, so the rate decides what is recorded.

| Rate | What is recorded |
| --- | --- |
| 1/16 and slower (at 1x) | One trig for every hit, with its velocity and micro timing. |
| 1/32, 1/48, 1/64, 1/80 | A trig on each step, with a step retrig that plays the other hits of that step. |
| 1/20, 1/24, 1/40 | Their hits do not fit one step, so a trig every 2 or 4 steps carries the step retrig. |

The rates follow the track's speed: at 2x, 1/32 is one trig a hit.

Stock's pad retrig series runs in the audio block and reaches no recorder. The module subscribes to core-ar2's `ev_render_out`, follows each pad's tick counter and, for each hit, queues to the sequencer task the note-off and note-on a press and release would queue. Stock's recorder writes the trig. The count is read before Retrig Grid sets it for the next tick (order 40 against 50), and a count that did not step down is not taken for a hit. The module follows each press in stock's note ring, so pressing again during a roll, or a new note in CHROMATIC mode, starts from that press.

A hit that lands just before a step is recorded on that step while the playhead is still on the step before. Stock's held-note wipe would then remove the hit before it, so until the playhead arrives the module sets the byte stock's own note-off sets for that case. The playhead it watches is the one stock's wipe runs on, the track the recorder follows (a pad press makes it that pad's track), and the guard outlives the release: it ends when that step arrives or the recorder lets the note go.

The module patches five stock sites, all its own: the RETRIG menu's writes to steps in LIVE RECORDING are off, and its YES turns ALWAYS ON over through the kit's own getter and setter; the recorder records a retrig press as a plain trig at rates that fit the steps (its quantize branch, left as stock has it); the recorder's call that sets a step's retrig rate also sets the kit's VEL.CUR; and its note-off call that sets the trig's retrig LEN from the hold cuts that curve to the trig's share. Stock's engine runs a curve at a speed set by its length, so the share is VEL.CUR times the ratio of the engine's speeds at the trig's LEN and the menu's LENGTH, and 0 once the fade has reached its end. No hook or other module is involved.

## Changes to stock flows

- **LIVE RECORDING with pad retrigs** (RTRG held, or ALWAYS ON): real trigs replace the trigless locks. That is the mod's job. To get stock's behaviour, leave the mod out.
- **RETRIG menu in LIVE RECORDING**: turning RETRIG or pressing a pad no longer writes the rate or a lock to the current step. The RETRIG menu's values still apply to what you play.
- **YES in the RETRIG menu**: turns ALWAYS ON over on every row, in place of the lit row's own YES action (on stock the ALWAYS ON row's YES does the same; the other rows' YES is not used by the module's author). LEFT, RIGHT, UP, DOWN and the TRIG keys are as stock. Needed so a roll can be armed without taking a hand off the pads; considered a new page, which would not be reachable with RTRG held.
- **Quantize live rec**: applies to retrig hits as to any note. Plain pad hits and TRIG keys are as stock.
- **Everything else**: NO + pad, RELOAD PATTERN, a held pad without a retrig and plain pad hits matched stock in the tests. The module does not touch GRID RECORDING, per-step retrigs set with TRIG + RTRG or rolls outside LIVE RECORDING; those were not exercised.

## Compatibility and limitations

- Analog Rytm MKII, OS 1.74, core-ar2 0.7. Event: `ev_render_out`. Five stock sites, 0x400e29ac, 0x400e2b3e, 0x400b4692, 0x400b470e and 0x400b43d8, which no other module patches. Key gesture: RTRG + YES.
- Beside Retrig Grid the retrigs after the first hit fall on its grid, and they record there.
- Rates faster than a step: the hits of a trig share its velocity, or follow VEL.CUR. Pressure changes land once a trig.
- A rate change during a roll starts a new trig at the next hit.
- Micro timing has 24 units a step, so a hit can land up to 1/48 of a step from where it sounded.
- A roll over a step that already has a retrig keeps that step's retrig.
- A roll started before LIVE RECORDING records from the first hit after it starts, with no press trig. Stock records nothing there.
- If the sequencer task falls more than 30 events behind, hits are dropped rather than recorded wrongly.
- Not tested: a unit, external MIDI clock, and what lands in the next pattern when the pattern changes during a roll.

## Tests and measurements

In rytm-emu only, with scripted pad pressure: [TESTING.md](TESTING.md). A real pad's pressure stream decides how closely velocity follows on a unit, so hardware results may differ.

## Screens and audio

The module draws no screens. No audio recording.

## Authorship and licences

Original work by Nathaniel Pavel (@npp1993), GPL-3.0-or-later ([LICENSE](LICENSE)). It runs on elekloader's core-ar2 (irpina, GPL-2.0-or-later). The firmware locations were found by disassembly of the owner-supplied OS 1.74 and measured in rytm-emu (trigcondition, MIT); some come from Retrig Grid (stigmagit). No firmware bytes are included.
