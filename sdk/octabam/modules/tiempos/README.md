# Tiempos

Version: 0.1.0-experimental · author: @imdantelo

## Overview

Tiempos shows the time left on all eight audio tracks on one screen. It is meant for playing long samples (whole tracks on Static machines) the way a DJ does: you see at a glance which track ends when, without opening each track's pages.

Each track gets one 8-pixel row:

| Area | What it shows |
| --- | --- |
| Track number | Filled: playing. Outline: loaded and stopped. Dotted: empty, or a machine with no length (Thru, Neighbor, Pickup). |
| Mark beside the number | The active track. |
| Bar | Solid: what is left to play. Thin line: what has played. A stop mark at the end. |
| Time left | Real time, m:ss. Flashes inverted in the last 30 seconds while the track plays. |
| Right column | Total length or time played, both at the current speed. |

The time left is real time, not sample time. Tiempos measures how fast each voice's play position moves against the unit's 132 MHz timer, every half second. That speed already includes timestretch, repitch and project tempo changes, so a 126 BPM track in a 128 BPM project shows 7:22 left where the sample length alone would say 7:29. After a tempo change the figure settles within two seconds. Tiempos does not need to know a sample's tempo or which slot a track uses.

Tiempos only reads memory and draws. It takes no effect slot, adds no knob and changes nothing in the project.

## Controls

Tiempos has no knobs. While its screen shows:

| Key | Action |
| --- | --- |
| CUE + MIDI | Open or close the screen. Tiempos takes this MIDI press, so the unit does not switch to MIDI tracks. |
| NO | Close the screen. |
| LEFT or RIGHT | Switch the right column between total length and time played. A notice names the column (TOTAL or ELAPSED) for one second. |
| SRC, AMP, LFO, FX1, FX2, BANK, PATTERN | Close the screen and reach the unit as usual. |
| A track key | Selects the track as usual; the screen stays. |
| The same track key twice within 0.4 s | Closes the screen. Both presses reach the unit, so it opens QUICK ASSIGN for that track, as a double press does on stock. |
| Everything else | Reaches the unit as usual: PLAY, STOP, REC, trig keys, encoders, the crossfader. The screen stays. |

Closing the screen redraws the page that was underneath.

## Usage

Load whole tracks into Static slots on tracks 1 to 8 and start playback. Hold CUE and press MIDI from any page. Mix with the crossfader and the track keys as usual while the screen shows the time left. Close it with NO or CUE + MIDI when you need to edit, or press a track key twice to close it and open that track's QUICK ASSIGN.

## Quick tutorial

1. **Open it.** Load a sample on track 1, press PLAY, hold CUE and press MIDI. Row 1 shows a filled number, a bar and the time left.
2. **Read the speed.** Change the project tempo. Within two seconds the time left on track 1 changes with it; with timestretch on, a faster tempo leaves less time.
3. **Switch the column and close.** Press RIGHT: the notice says ELAPSED and the right column shows the time played. Press NO: the page you were on comes back.

### What changes in a stock flow

One stock gesture changes:

- **What changes and for whom.** On stock, CUE + MIDI switches to the MIDI tracks, as MIDI alone does. With Tiempos installed it opens and closes the Tiempos screen instead, for everyone who has the module.
- **Why.** The screen has to open from any page with keys a DJ-style player reaches without looking. The MKI has no PROJ key, so CUE + PROJ is not available, and CUE + MIDI adds nothing on stock that MIDI alone does not do.
- **What you see and do differently.** To switch to the MIDI tracks, press MIDI without holding CUE. While the Tiempos screen shows, LEFT, RIGHT and NO act on it; every other key reaches the unit.
- **Turning it off.** Remove Tiempos from the module set. There is no setting.
- **Neighbouring flows checked** (emulator, MKI panel, with and without the module): MIDI alone switches tracks; SRC closes the screen and the page is redrawn. Not checked on a unit.

## Compatibility and limitations

- USB only. Tiempos runs only on the Modwerk base, loaded over USB, on an Octatrack MKI or MKII with OS 1.40C. It uses the base's tick, draw, key and encoder events, and card firmware has no base, so card firmware cannot include it: take it out of a set before building card firmware.
- Changes one stock gesture: CUE + MIDI opens Tiempos instead of switching to the MIDI tracks (see [What changes in a stock flow](#what-changes-in-a-stock-flow)).
- Declares one UI claim, the gesture CUE + MIDI on every page (`key:CUE+MIDI`). LEFT, RIGHT and NO act on its own screen only while it shows, which no other module draws, so they are not declared.
- No effect slot, no DSP code, no stock-code sites.
- It reads each voice's play position (voice record + 0x44) and its trim start and end (+ 0x28, + 0x2c). On one MKI the totals of a whole Static, a trimmed Static and a Flex track matched the expected times, and followed a tempo change (reported by the author, see TESTING.md); the fields were not read directly on hardware.
- The voice copies the trim only when it starts, so a track that has not played since the project loaded shows as empty (dotted, `--:--`) until it plays.
- The time played and the total length count from the sample's trim start, so a trimmed sample shows its trimmed length.
- A looping track shows the time to the end of the sample, not to the end of the loop.
- Until a track has played for half a second, its time is shown at the sample's original speed.

## Tests and measurements

See [TESTING.md](TESTING.md). Host tests only; no hardware, cycle or memory measurements yet.

## Authorship and licences

Design, specification and screen layout by Diego Antelo Barba. Code written with Claude (Anthropic) for the author. GPL-3.0-or-later, see [LICENSE](LICENSE). The 3x5 font in `deck_font.h` is original. No Elektron firmware, extracted routines or tables.

## Screens and audio

No captures yet: they must come from the headless emulator or the unit's LCD (docs/MODULE_UI_CAPTURES.md). Tiempos makes no sound, so it has no audio preview.
