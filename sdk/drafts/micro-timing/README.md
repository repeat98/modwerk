# Micro Timing per track

Version: `0.1.0-experimental` · author: [@jonathanwardle1992-beep](https://github.com/jonathanwardle1992-beep)

**TRACK TRIG EDIT gains a MICRO T row.** LEVEL sets the micro timing of every step on the selected track, in the stock fraction, as the pot turns.

**Experimental.** The author reported this behaviour on a private MICRO T9 card. This module package has not been built, flashed or tried over USB.

## Overview

While grid recording, FUNC+BANK opens TRACK TRIG EDIT (FUNCTION on MKI). MICRO T sits under TRIGS and above SLIDE. The window still shows four rows, so REC.TRG scrolls into view and TRIGS scrolls off the top.

LEVEL writes the stock per-trig micro timing of all 64 steps on the current track. MIDI button off writes the audio track. MIDI button on writes the MIDI track of the same number, and does not write the audio track. One remembered number is kept per track number and shown for both views; the pot writes only the side on screen.

The footer shows the stock fraction next to the track (`MT1:+1/384`, or `MT1:ON GRID`). The lane is sixteen dashes, a 0 fixed at the centre, and a cursor on that 0 when the value is on grid. Editing one trig in the MICRO TIMING page does not move the row. The next turn of LEVEL sets every step to the row's value.

The module does not run a clock of its own. Playback uses the trig words the stock writer stored, so tempo, track speed and swing stay the instrument's. The remembered number is battery RAM and is lost at power-off. It is not stored in the project. Trigs already rewritten stay in the pattern, including on a build that does not include this module.

No effect slot. Leaving the module out of the build removes the row and leaves the pattern as it was saved.

## Controls

| Control | Default | Values |
|---|---|---|
| MICRO T | on grid (0) | −23 to +23, the stock micro-timing steps |

LEVEL changes it only while MICRO T is the selected row. Other rows keep their own LEVEL behaviour.

## Usage

### Quick tutorial: offset every step on this track

1. Grid record, then FUNC+BANK (FUNCTION on MKI). Highlight MICRO T, under TRIGS.
2. Turn LEVEL. The footer fraction moves, and every step on this track takes that micro timing.
3. Press the MIDI button and turn LEVEL again to set the MIDI track. The audio track keeps the value it already had.

To stop using it, leave the module out of the build. There is no separate off switch: while it is installed, LEVEL on that row writes.

### What changes in a stock flow

- **What changes and for whom.** Anyone with the module can set a whole track's micro timing from TRACK TRIG EDIT. Audio and MIDI stay separate.
- **Why.** The same offset on every step, without opening MICRO TIMING once per trig.
- **What you see and do differently.** One extra row. Four rows on screen. The fraction sits in the footer.
- **Turning it off.** Omit the module. Trig values already written remain in the pattern.
- **Neighbouring flows.** TRIGS, SLIDE, SWING and REC.TRG stay. Play Start and Track Mutes use a different menu and can be chosen with this one.

## Compatibility and limitations

- OS 1.40C. The reported pass is a private MICRO T9 card, not a build of this package. USB Keep/Undo is untested. Headless `ot_emu` captured TRACK TRIG EDIT only, from a private image built before commit `13d33940`.
- The remembered number does not survive power-off and is not in the project file.
- An individual trig edit does not update the row. The next LEVEL turn overwrites all 64 steps, including empty ones.
- MKI opens the same menu with FUNCTION. That path is untested on this package.

## Tests and measurements

See [TESTING.md](TESTING.md). The reported pass is the private card. This package is untested.

## Authorship and licences

jonathanwardle1992-beep: behaviour, ColdFire source and documentation. MIT, [LICENSE](LICENSE). No firmware, stock code, built image or card is included.

## Screens and audio

`media/ot-micro-t.png` is TRACK TRIG EDIT with MICRO T highlighted, still on grid (`MT1:ON GRID`). `media/ot-rec-trg.png` is the same window after scrolling: REC.TRG is on the bottom row and TRIGS has left the top. Both are headless `ot_emu` LCD pixels. LEVEL was not turned, so neither frame shows an offset. The module makes no sound of its own; it changes when notes and locks fall.
