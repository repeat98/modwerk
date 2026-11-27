# DigiReel — Digitone

Modwerk version: `0.2.0`, the author's released 0.2 files, unchanged.

## Overview

DigiReel, by irpina, is a time-warp pedal for the Digitone mk1's audio inputs. The inputs go onto a tape that always listens, and a head plays it back at -2x to +2x, backwards included, in windows in time with the Digitone's tempo. The pitch follows the speed (TAPE) or stays apart from it (STRETCH); HOLD loops a window, TAPE STOP brings the tape to a stop, random events change the speed, the pitch or the direction or stutter on the beat, and a step slicer gates the result.

- Speed from -2x through a stop to +2x, reverse included.
- TAPE ties the pitch to the speed; STRETCH keeps them apart.
- HOLD loops a window in time with the tempo; TAPE STOP stops the tape.
- Random speed, pitch, reverse and stutter events, and a step slicer.

## Controls

| Control | What it does |
| --- | --- |
| Mod Menu (hold a track key) | Open DigiReel: it takes the audio engine and its page shows. Its Mod Menu entry also brings the page back after MIDI. |
| SYN1, SYN2, FLTR | Its three pages: page 1 Reel (SPED, PTCH, TIME, BLND), page 2 Secondary (grains, crossfade, random weights, width), page 3 Modes (TAPE or STRETCH, direction, HOLD, capture). Pushing a knob sets it back to its default. |
| AMP | The mixer: the inputs' levels and pans, balance, volume and width. |
| LFO | Two LFOs on the stock LFO page; DEST aims them at its controls or the mixer. |
| RECORD | LOCK mode: hold a trig and turn a control to lock it on that step; FUNC + a trig clears the step. |
| MIDI | The stock UI for the MIDI tracks while it keeps playing. |
| NO | Turn it off: the synths and the Digitone's own effects come back. |
| T1 | HOLD: loop a window (momentary or latching, the window just played or the next, set on page 3). |

## Usage

Use the access steps below after installing a compatible build. The tutorial gives a first practical pass through the module.

### Where to find it

Location: Mod Menu: hold a track key.

1. Use a build containing DigiReel for the Digitone mk1 on OS 1.43 or 1.44; fxkit comes with it.
2. Hold a track key: the Mod Menu opens. Pick DIGIREEL and press YES.
3. Play into the inputs; NO turns it off and gives the synths back.

These instructions assume the module is already installed in a compatible build. For selecting and building it in Modwerk, see the [Digitone guide](../../../machines/digitone/README.md).

### Quick tutorial: reverse and hold a phrase

1. Hold a track key, pick DIGIREEL in the Mod Menu and press YES.
2. Play into the inputs and turn SPED on page 1 (SYN1) left of the middle to play backwards.
3. Press T1 to HOLD the window that just played.
4. Press NO to turn DigiReel off and get the synths back.

## Compatibility and limitations

- Original Digitone (Mk1, and the Digitone Keys), OS 1.43 and 1.44. Digitone II is not declared compatible.
- While it is the active effect it owns the audio engine: the synths are silent and the Digitone's own effects are off. NO gives them back; the sequencer keeps running.
- Its MIDI CCs follow the Red Panda Tensor's published CC chart, so a controller set up for that pedal works with it. It is not affiliated with Red Panda and uses none of its code.
- A beta from its author; not yet run on a Digitone Keys.
- Its buffers use 2 MB of the Digitone's bulk memory (0x47700000-0x47900000), apart from the other effect pedals'.
- Needs fxkit (it comes with it) and core 4.1 or newer, so on OS 1.44 it does not build beside KitBank 0.2.0, which builds only on the older core.

## Tests and measurements

The evidence tier is `author-hardware`: the author tested DigiReel 0.2 on a Digitone mk1 (release v0.2, 18 October 2026; built before the effects' rename, which changed only names) and checked it in digikit's emulator on OS 1.43 and 1.44. It is still a beta. This module pins the released files. Modwerk builds it with core 4.4, which has not run on a unit here. [TESTING.md](TESTING.md) records the identities, what was linked and captured, and what was not tested.

DigiReel holds **27,397 B** (code, data and state) in the mods' RAM, excluding the core and linker alignment. Runs in the audio render while it is the active effect, nothing while it is off; no CPU figure was measured.

## Authorship and licences

- irpina — DigiReel design and code, fxkit and core-dn1

The module is licensed under [GPL-2.0-or-later](LICENSE). Imported source: [irpina/digireel at `71b6aad`](https://github.com/irpina/digireel/tree/71b6aad5746fd5f6f6b56e8e7923c33975f0815f). The library builds the author's released `.elemod` files. The header `src/digitakt-mk1/core3.h` is irpina's, from elekloader, under GPL-2.0-or-later. The author's README is in [upstream/](upstream/README.md).

## Screens and audio

Real firmware-rendered emulator captures on OS 1.54. The [capture record](media/capture.json) includes source and build identities, panel inputs, timestamps and PNG hashes. [Capture rights](media/LICENSE.md) preserve the underlying interface rights. The [thumbnail](media/thumbnail.svg) is an illustration. No audio demonstration is claimed.

![DIGIREEL in the Mod Menu (hold a track key)](media/menu.png)

![DigiReel's page 1 after YES](media/page.png)
