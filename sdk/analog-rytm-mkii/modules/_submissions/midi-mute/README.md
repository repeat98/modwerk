# MIDI Mute

An Analog Rytm MKII mod by @michaelkollmann. Version 0.1.0-experimental, for OS 1.74 with core-ar2 0.7.

## Overview

On stock OS 1.74 a mute stops the sequencer only: a note from a keyboard or a DAW still plays the muted track. With **MUTE MIDI IN** checked, a muted track (or one left out of a solo) also ignores the notes that come in for it, over USB MIDI and DIN MIDI alike, on its track channel and on the AUTO channel. When a track is muted while it holds a note that came in over MIDI, the module releases that note as its Note Off would, so nothing is left hanging. Unmuting plays nothing by itself; the next Note On plays again.

It is unchecked by default, and unchecked it changes nothing.

## Controls

| Control | Action |
| --- | --- |
| MUTE MIDI IN | A checkbox, the last row of GLOBAL > MIDI CONFIG > PORT CONFIG, after RECEIVE CC/NRPN. YES toggles it, RIGHT checks it, LEFT unchecks it. Kept with the project (saved with SAVE PROJECT); a new project starts unchecked. |

Incoming notes follow the same rule as the sequencer. While any track is soloed (MIDI CC 93 on its channel), only the soloed tracks play, even a soloed track that is also muted. While no track is soloed, the muted tracks are silent: MUTE mode's pads, FUNC + pads in MUTE mode, or MIDI CC 94 on the track's channel. OS 1.74 keeps one mute and one solo per track for the project; there is no separate pattern mute. Below, "silenced" means muted, or left out of a solo.

## Usage

Play the Rytm's tracks from a keyboard, a sequencer or a DAW, and use MUTE mode (or CC 94 from the DAW) to take tracks out of what you play live, as you take them out of the pattern.

### Quick tutorial

1. Press GLOBAL, choose MIDI CONFIG, then PORT CONFIG, and go down to the last row, MUTE MIDI IN. Press YES to check it, then NO to leave the menus.
2. Play BD from a keyboard or DAW: on the AUTO channel (note 0), or on BD's own channel (notes 12-59), over USB or DIN.
3. Press MUTE, then the BD pad: BD is muted, and the same notes no longer play it. The other tracks still play.
4. Hold a note for BD and mute BD while you hold it: the note stops instead of hanging.
5. Unmute BD (the BD pad again in MUTE mode) and play: BD plays again.

## Message map

| Message | MUTE MIDI IN checked | Unchecked |
| --- | --- | --- |
| Note On (velocity 1-127) for a silenced track, on its track channel or the AUTO channel, USB or DIN | **Consumed**: the track does not play, no note is held, nothing is sent on MIDI OUT | stock |
| Note On for a track that is not silenced | passed to stock | stock |
| Note Off, and Note On with velocity 0 | passed to stock, except one whose Note On was consumed, or whose note the module already released, while nothing else holds that note on that track: that one is **consumed** | stock, except as on the left for notes consumed while checked |
| CC (including CC 94 mute), NRPN, poly and channel aftertouch, pitch bend, program change | passed to stock | stock |
| Clock, start, stop, continue, SysEx | passed to stock | stock |

**Sent:** nothing new on MIDI OUT. When a track is muted while MIDI holds a note on it, the module calls stock's own release for that note, exactly what that note's Note Off does; stock sends what it sends for a Note Off.

**SysEx:** none read or sent, so the module claims no SysEx id. It claims its PORT CONFIG row (`ui:GLOBAL > MIDI CONFIG > PORT CONFIG row after RECEIVE CC/NRPN`).

A note that comes in for several tracks at once (several tracks on one channel) is judged per track: silenced tracks drop it, the others play it.

## How it works

The DIN and USB MIDI ports feed one MIDI task, which passes a Note On to stock's note-on routine and a Note Off to its note-off routine. Each routine works out the tracks the note is for and then plays or releases each one through a per-track call. The module replaces those two per-track calls inside the MIDI routines (two declared sites, 26 and 14 bytes, OS 1.74 only): a silenced track's Note On is not played, and everything else goes to stock unchanged. Pads, TRIG keys and the sequencer play tracks through their own paths, which are not touched. The module's `ev_tick` handler (the core's UI tick, about 20 times a second) works out the silenced tracks from the mute and solo masks, compares them with the last ones it saw, and releases the notes MIDI holds on each newly silenced track.

## Compatibility and limitations

- OS 1.74 with core-ar2 0.7, Analog Rytm MKII only.
- A note held when its track is muted is released on the module's next UI tick (nominally every 50 ms). On a unit the sound had stopped 50 and 130 ms after a CC 94 mute was sent, the sound's own fade included. Checking MUTE MIDI IN also releases the notes MIDI holds on tracks that are already muted.
- Up to 128 held notes per track are tracked (one per MIDI note number); a note held more than eight times on one track is released at most eight times.
- Its row is added by a third site, the end of PORT CONFIG's constructor (6 bytes), through the core's `core_additem`; a later module that wants a row there would share it through a core hook.
- No other module patches these sites today. A second module that wants to change incoming MIDI notes would share them through a core hook.

## Changes to stock flows

- **Incoming MIDI notes for a silenced track** (only while MUTE MIDI IN is checked): stock plays them; the module drops them, and releases a note MIDI holds on a track when that track is muted or left out of a solo. This is the module's purpose, so there is no other way to do it; it is off until checked, and unchecking it gives stock's behaviour back at once. Checked beside it on a unit and in the emulator: unmuted tracks, other channels, pads and TRIG keys on muted tracks, the sequencer's own trigs, RECEIVE NOTES off, CC and clock.
- **PORT CONFIG**: one checkbox row, MUTE MIDI IN, after RECEIVE CC/NRPN. The other rows, their order and their behaviour are unchanged.

## Tests and measurements

See [TESTING.md](TESTING.md). In short:

- **On the author's Rytm MKII** (OS 1.74, build MM03, MIDI over USB, judged from the Rytm's USB audio of BD's voice): checked, notes for a muted BD stayed silent on the AUTO and track channels, a held note stopped 50 and 130 ms after a CC 94 mute, and a 60 s flood of about 870 messages a second left nothing sounding; unchecked, the same tests heard the muted BD and the held note rang on, as stock. By hand: the setting survives a project reload and a power cycle, CREATE NEW starts unchecked, and pad mutes drop notes and release a held one.
- **In rytm-emu 3c4c42c:** DIN and USB, CC 94 and pad mutes, toggling the box mid-note, the sequencer's trigs on the same frames with and without the module, a 60 s wire-rate flood on DIN with no note left held, and a build beside Filter Hz and Loop Sync.
- **Cost:** about 55 instructions per incoming note that plays and 35 per dropped note, counted from the compiled code, and nothing per audio block. Unchecked, the emulator's idle time under the flood stayed within 0.004 % of the core alone. Not timed on a unit.
- **Not tested:** DIN MIDI on a unit, a pattern or kit change during a flood.

## Screens and audio

The PORT CONFIG row unchecked ([port-config-off.png](media/port-config-off.png)) and checked ([port-config-on.png](media/port-config-on.png)), captured in rytm-emu `3c4c42c` from the firmware's own framebuffer; [media/capture.json](media/capture.json) records the build and the key presses. No audio is included.

## Authorship and licences

Original work by @michaelkollmann, GPL-3.0-or-later ([LICENSE](LICENSE)). Stock addresses were found by reading the owner's own OS 1.74 with GNU binutils and running it in [rytm-emu](https://github.com/trigcondition/rytm-emu); the module refers to OS 1.74 by addresses and hashes only, and no stock code or table is included. The PORT CONFIG row is added through core-ar2's `core_additem` (elekloader, irpina, GPL-2.0-or-later). Screenshots: see [media/LICENSE.md](media/LICENSE.md).
