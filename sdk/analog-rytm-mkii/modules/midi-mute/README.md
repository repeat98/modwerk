# MIDI Mute

An Analog Rytm MKII mod by @michaelkollmann. Version 0.1.0-experimental, for OS 1.74 with core-ar2 0.7.

## Overview

On stock OS 1.74 a mute stops the sequencer only: a note from a keyboard or a DAW still plays the muted track. With **MUTE MIDI IN** checked, a muted track also ignores the notes that come in for it, over USB MIDI and DIN MIDI alike, on its track channel and on the AUTO channel. When a track is muted while it holds a note that came in over MIDI, the module releases that note as its Note Off would, so nothing is left hanging. Unmuting plays nothing by itself; the next Note On plays again.

It is unchecked by default, and unchecked it changes nothing.

## Controls

| Control | Action |
| --- | --- |
| MUTE MIDI IN | A checkbox, the last row of GLOBAL > MIDI CONFIG > PORT CONFIG, after RECEIVE CC/NRPN. YES toggles it, RIGHT checks it, LEFT unchecks it. Kept with the project (saved with SAVE PROJECT); a new project starts unchecked. |

A track counts as muted when its mute is set: MUTE mode's pads, FUNC + pads in MUTE mode, or MIDI CC 94 on its channel. OS 1.74 keeps one mute per track for the project; there is no separate pattern mute.

## Usage

### Quick tutorial

1. Press GLOBAL, choose MIDI CONFIG, then PORT CONFIG, and go down to the last row, **MUTE MIDI IN**. Press YES to check it, then NO to leave the menus.
2. Play BD from a keyboard or DAW on the AUTO channel (note C0, or the track's note), over USB or DIN.
3. Press MUTE, then the BD pad: BD is muted. The same notes no longer play it; the other tracks still play.
4. Hold a note for BD and mute BD while you hold it: the note stops at once instead of hanging.
5. Unmute BD (BD pad again in MUTE mode) and play: BD plays again.

## Message map

| Message | MUTE MIDI IN checked | Unchecked |
| --- | --- | --- |
| Note On (velocity 1-127) for a muted track, on its track channel or the AUTO channel, USB or DIN | **Consumed**: the track does not play, no note is held, nothing is sent on MIDI OUT | stock |
| Note On for an unmuted track | passed to stock | stock |
| Note Off, and Note On with velocity 0 | passed to stock, except one whose Note On was consumed, or whose note the module already released, while nothing else holds that note on that track: that one is **consumed** | stock, except as on the left for notes consumed while checked |
| CC (including CC 94 mute), NRPN, poly and channel aftertouch, pitch bend, program change | passed to stock | stock |
| Clock, start, stop, continue, SysEx | passed to stock | stock |

**Sent:** nothing new on MIDI OUT. When a track is muted while MIDI holds a note on it, the module calls stock's own release for that note, exactly what that note's Note Off does; stock sends what it sends for a Note Off.

**SysEx:** none read or sent, so the module claims no SysEx id. It claims its PORT CONFIG row (`ui:GLOBAL > MIDI CONFIG > PORT CONFIG row after RECEIVE CC/NRPN`).

A note that comes in for several tracks at once (several tracks on one channel) is judged per track: muted tracks drop it, the others play it.

## How it works

The DIN and USB MIDI ports feed one MIDI task, which passes a Note On to stock's note-on routine and a Note Off to its note-off routine. Each routine works out the tracks the note is for and then plays or releases each one through a per-track call. The module replaces those two per-track calls inside the MIDI routines (two declared sites, 26 and 14 bytes, OS 1.74 only): a muted track's Note On is not played, and everything else goes to stock unchanged. Pads, TRIG keys and the sequencer play tracks through their own paths, which are not touched. The module's `ev_tick` handler (the core's UI tick, about 20 times a second) compares the mute mask with the last one it saw and releases the notes MIDI holds on each newly muted track.

## Compatibility and limitations

- OS 1.74 with core-ar2 0.7, Analog Rytm MKII only.
- Solo is not followed: a track that is only soloed out still plays incoming notes.
- A note held when its track is muted is released within one UI tick, up to about 50 ms after the mute.
- Up to 128 held notes per track are tracked (one per MIDI note number); a note held more than eight times on one track is released at most eight times.
- Its row is added by a third site, the end of PORT CONFIG's constructor (6 bytes), through the core's `core_additem`; a later module that wants a row there would share it through a core hook.
- No other module patches these sites today. A second module that wants to change incoming MIDI notes would share them through a core hook.

## Credits

Original work by @michaelkollmann. Stock addresses were found by reading the owner's own OS 1.74 with GNU binutils and running it in [rytm-emu](https://github.com/trigcondition/rytm-emu); no stock code is included.
