# Micro Timing

Version: `0.1.1-experimental` · author: [@jonathanwardle1992-beep](https://github.com/jonathanwardle1992-beep)

**TRACK TRIG EDIT gains a MICRO T row.** LEVEL sets the micro timing of every step on the selected track, in the stock fraction, as the pot turns.

**Experimental.** The author reported the LEVEL behaviour on a private MICRO T9 card. On 18 November 2026 package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292` was kept over USB on an MKII, and after a power cycle the person reported the footer on grid. The listed catalogue package `8958a66f2942e4e0c5692c0cf075bab3c07e4f3347d716ac57405b1792cb6c47` matches that ColdFire image; only the 16-byte title field differs (`Micro Timing`). It has not been flashed as a card image.

## Overview

While grid recording, FUNC+BANK opens TRACK TRIG EDIT (FUNCTION on MKI). MICRO T sits under TRIGS and above SLIDE. The window still shows four rows, so REC.TRG scrolls into view and TRIGS scrolls off the top.

LEVEL writes the stock per-trig micro timing of all 64 steps on the current track. MIDI button off writes the audio track. MIDI button on writes the MIDI track of the same number, and does not write the audio track. One byte is kept per bank, pattern and track. The pattern is the one on the screen. Audio and MIDI share that byte, and the pot writes only the side on screen.

The footer shows the stock fraction next to the track (`MT1:+1/384`, or `MT1:ON GRID`). The lane is sixteen dashes, a 0 fixed at the centre, and a cursor on that 0 when the value is on grid. Editing one trig in the MICRO TIMING page does not move the row. The next turn of LEVEL sets every step to the row's value.

The module does not run a clock of its own. Playback uses the trig words the stock writer stored, so tempo, track speed and swing stay the instrument's. The remembered number lives in this module's unit, one byte per bank, the pattern on the screen and the track. The loader clears it when the module loads, and a power cycle drops the unit, so the row starts on grid again. It is not battery RAM and it is not stored in the project. Trigs already rewritten stay in the pattern, including on a build that does not include this module.

No effect slot. Leaving the module out of the build removes the row and leaves the pattern as it was saved.

## Controls

| Control | Default | Values |
|---|---|---|
| MICRO T | on grid (0) | −23 to +23, the stock micro-timing steps |

LEVEL changes it only while MICRO T is the selected row. Other rows keep their own LEVEL behaviour.

## Usage

Anyone with the module can set a whole track's micro timing from TRACK TRIG
EDIT. Audio and MIDI stay separate. The same offset lands on every step
without opening MICRO TIMING once per trig. One extra row stays in the
four-row window; the fraction sits in the footer. Omit the module to stop
using it — there is no separate off switch; trig values already written
remain in the pattern. TRIGS, SLIDE, SWING and REC.TRG stay. Play Start and
Track Mutes use a different menu and can be chosen with this one.

## Quick tutorial

1. Grid record, then FUNC+BANK (FUNCTION on MKI). Highlight MICRO T, under TRIGS.
2. Turn LEVEL. The footer fraction moves, and every step on this track takes that micro timing.
3. Press the MIDI button and turn LEVEL again to set the MIDI track. The audio track keeps the value it already had.

## Compatibility and limitations

- OS 1.40C. The LEVEL behaviour was reported on a private MICRO T9 card. This package's USB Keep and power-cycle footer are in TESTING.md. The pictures are this package on a development twin, and they are not a unit result.
- One byte is kept per bank, the pattern on the screen, and track, in this module's unit. Audio and MIDI share it. A power cycle drops the unit, so the row starts on grid again. It is not battery RAM and it is not in the project file.
- An individual trig edit does not update the row. The next LEVEL turn overwrites all 64 steps, including empty ones.
- MKI opens the same menu with FUNCTION. That path is untested on this package.

## Tests and measurements

See [TESTING.md](TESTING.md). The LEVEL pass on a unit is the private card. This package's power-cycle footer was reported on a unit. On the emulator, one LEVEL step of this package moved the footer from `MT1:ON GRID` to `MT1:+1/384`. The linked image is 1,076 bytes, the remembered table is 2,048, and a LEVEL rewrite pushes 64 bytes on the UI stack.

## Authorship and licences

jonathanwardle1992-beep: behaviour, ColdFire source and documentation. MIT, [LICENSE](LICENSE). No firmware, stock code, built image or card is included.

## Screens and audio

Real LCD captures from the headless emulator on a private native build of this
source. They show the interface, not hardware behaviour or sound. The module
makes no sound of its own; it changes when notes and locks fall.

1. ![TRACK TRIG EDIT with MICRO T highlighted under TRIGS, a dashed lane and a cursor on the centre mark, footer MT1:ON GRID.](media/ot-micro-t.png)
   While grid recording, press FUNC+BANK (FUNCTION on MKI) and highlight MICRO T under TRIGS. The pictured row is still on grid.
2. ![TRACK TRIG EDIT with MICRO T highlighted, the cursor one step right of centre, footer MT1:+1/384.](media/ot-micro-t-step.png)
   With MICRO T highlighted, turn LEVEL one step. That fraction is what LEVEL on this row writes to the track.
3. ![MIDI TRIG EDIT with MICRO T highlighted; SLIDE is absent; footer still MT1:+1/384.](media/ot-micro-t-midi.png)
   Press MIDI. The page title becomes MIDI TRIG EDIT and SLIDE leaves the list. LEVEL was not turned again in this frame.
4. ![TRACK TRIG EDIT scrolled so MICRO T, SLIDE and SWING sit above a highlighted REC.TRG row.](media/ot-rec-trg.png)
   From MICRO T, press DOWN until the list scrolls. REC.TRG appears on the bottom row of the same four-row window.
