# Chromatic Aftertouch Fix

## Overview

On stock Analog Rytm MKII OS 1.74, a pad played in CHROMATIC mode sends its MIDI aftertouch (poly
pressure) 24 semitones above the note it sent. Hold the BD pad in CHROMATIC mode and MIDI out reads
note on 36, then poly pressure for note 60, then note off 36. A synth or a MIDI monitor that follows
the held note sees no aftertouch.

Chromatic Aftertouch Fix sends that poly pressure on the note the pad played. Nothing else changes:
note on, note off, the MIDI channel and the pressure values are as stock, the Rytm's own sound gets
its aftertouch as before, and pads outside CHROMATIC mode, which already sent pressure on their
note, are left alone. It has no menu row and stores nothing: installed, it is on.

| Held CHROMATIC pad | Stock 1.74 | With the fix |
| --- | --- | --- |
| BD, default octave | `9d 24 7f`, `ad 3c pp`, `8d 24 00` | `9d 24 7f`, `ad 24 pp`, `8d 24 00` |
| SD, default octave | `9d 25 7f`, `ad 3d pp`, `8d 25 00` | `9d 25 7f`, `ad 25 pp`, `8d 25 00` |

Bytes from rytm-emu on the AUTO channel (14, `d`); `pp` is the pressure.

Version **0.1.0-experimental** for Analog Rytm MKII OS **1.74**, with core-ar2 0.7. Written by
Nathaniel Pavel (@npp1993); not a port.

## Controls

| Control | What it does |
| --- | --- |
| A pad held in CHROMATIC mode | Sends MIDI poly pressure on the note its note on sent. Stock sends it 24 semitones higher. |

There is nothing to set. To get stock's bytes back, build without the module.

Messages: the module changes one field of one message, the note number of the poly pressure
(`An note value`) a held CHROMATIC pad sends, on the channel and port stock picks (PAD DEST,
PRESSURE DST, AUTO or per-track channel). It reads no MIDI, consumes nothing, adds no message and
moves none in time; every other message, MIDI in and MIDI thru are as stock.

## Usage

Install a build that contains the module, let the pads reach MIDI out, press CHRO and play. A synth
whose patch uses poly aftertouch now responds to holding a pad harder.

### Quick tutorial

1. In GLOBAL > MIDI CONFIG > PORT CONFIG, check that PAD DEST and PRESSURE DST are INT+EXT (the default) so the pads reach MIDI out. Connect a MIDI monitor to MIDI OUT or USB.
2. Press CHRO. Strike the BD pad and hold it: the monitor shows a note on for note 36.
3. Press harder while holding: poly pressure for note 36 follows, then the note off for note 36 on release. Stock sent that pressure for note 60.
4. Press DOWN or UP to change the octave and repeat: note on and pressure stay on one note.

![PORT CONFIG with PAD DEST and PRESSURE DST at INT+EXT](media/port-config.png)

### How it works

ChromPadsView keeps a note for each pad. Its note on and note off take 24 off that note before they
go out, and its pressure handler passes the kept note to the poly pressure sender as it is. The
module replaces that one call (OS 1.74, `0x400c628e`, 6 bytes) with a call to its own nine
instructions, which take 24 off the note and pass it on. A note that would fall outside 0 to 127
sends no pressure, as the note on sender drops such a note; stock's octave range keeps CHROMATIC
notes inside it (rytm-emu: note 12 at the bottom, 48 at the top for BD). The pressure the sound
receives is set per track, with no note, and is not touched.

## Compatibility and limitations

- OS 1.74 only, with core-ar2 0.7.
- One stock site, `0x400c628e`. No other module or the base patches it. Silent Pad+Trig Settings
  patches the call 32 bytes before it (`0x400c626e`), which gates the same pressure message on a
  muted track: with both installed an unmuted pad sends its pressure on the right note
  (rytm-emu), and a muted one still sends nothing, since that gate skips this call (read in the
  code).
- Declares the claim `midi:CHROMATIC pad poly pressure note on MIDI out`; no key gesture or screen.
  No `requires` and no conflicts.
- Changes only what CHROMATIC pads send to MIDI out. MIDI in, pads outside CHROMATIC mode and the
  Rytm's own aftertouch modulation are untouched.
- A receiver set up around stock's bytes, listening for pressure 24 semitones above the note, sees
  it move to the played note.
- Not yet run on a unit.

## Tests and measurements

rytm-emu on OS 1.74, MIDI out bytes: a held CHROMATIC pad sends note on, poly pressure and note off
on one note in the lowest, default and top octave, alone and beside Silent Pad+Trig; core-ar2 alone
keeps stock's bytes; pads outside CHROMATIC are as stock. Details, builds and the unit steps are in
[TESTING.md](TESTING.md). Memory: 28 bytes of the shared mod area. Load: nine instructions per poly
pressure message from a held CHROMATIC pad, nothing otherwise (static count, not measured).

## Authorship and licences

Original code by Nathaniel Pavel (@npp1993), GPL-3.0-or-later ([LICENSE](LICENSE)). Builds with
irpina's core-ar2 and Elekloader, as every Rytm module here. The OS 1.74 addresses were read by the
author from their own stock firmware; the build carries an address, a length and a SHA-256 guard
only, no stock bytes. Screens show Elektron's interface solely to document the modification
([media/LICENSE.md](media/LICENSE.md)). No Elektron firmware is included.

## Screens and audio

The screenshot is a rytm-emu capture of build CA01 ([media/capture.json](media/capture.json)). The
module has no screen of its own and makes no sound of its own.
