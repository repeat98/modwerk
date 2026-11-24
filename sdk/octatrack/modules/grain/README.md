# Grain

Version 0.1.3-experimental · by A Force Truly Evil (@AForceTrulyEvil). The author played an earlier build on an MKI. The [test record](TESTING.md) identifies the build for each result.

## Overview

Grain is a track machine that plays the track's Flex sample as a cloud of short grains. Each grain is a small piece of the sample, read from POS plus a random spread, shaped by a window and laid over the others; up to six sound at once. PTCH tunes the grains without changing their length. SCAN moves a read head through the sample, DIR sends a share of the grains backwards, PAN spreads them across the stereo field and SYNC puts them in time with the project.

The SRC page shows the sample's waveform with a line at POS and the grains as they play. A third page made for the Octatrack, a third press of PLAYBACK, shows the waveform much larger with the six knobs and their values beside their names, which makes precise work far more comfortable. The track's AMP, LFOs, effects, scenes and parameter locks follow as for any sample.

The grain engine started from Model-TG by TinyGregAudio (MIT) and is extended well beyond it: random pan per grain, SYNC, DIR, SCAN, POS in fine steps, many optimizations, and the screens. The connection to the Octatrack follows AMIGA by Jannik Aßfalg (MIT). See [Authorship and licences](#authorship-and-licences).

## Controls

SRC (knobs A to F):

| Knob | Range | What it does |
| --- | --- | --- |
| PTCH | -12 to +12 semitones | The pitch of the grains, in Flex's units, so CHROMATIC keys and MIDI notes play in tune. Their length does not change. One semitone a detent; FUNC + turn stops at -12, 0 and +12, so it always comes back to 0; a pressed knob moves seven semitones. |
| POS | 0 to 127.8 | Where the grains are read: 0 is the start of the sample, 127.8 the end. Turned slowly it moves in eighths (41.0, 41.1, 41.2, 41.3, 41.5, 41.6, 41.7, 41.8, 42.0) and speeds up as you turn faster; a pressed knob jumps by seven. |
| SIZE | 0 to 127 | The length of each grain, on an exponential scale: 0 is 10 ms, 64 about 100 ms, 127 one second. |
| DENS | 0 to 127 | How often a grain is born. Low values leave gaps; 64 puts the grains one after another; 127 overlaps four of them (up to six sound at once). With MODE SYNC it picks the division of the bar: 1, 2, 4, 6, 8, 12, 16, 24, 32, 48 or 64 grains. |
| SPRY | 0 to 127 | How far each grain strays from POS at random: 0 keeps them all on POS, 127 spreads them up to half the sample either way. The sample is a ring: a grain born or reading past the end carries on from the beginning, and one going back past the beginning carries on from the end. |
| SCAN | -2.00 to +2.00 | A read head that runs through the sample from POS: 1.00 is the sample's own speed, negative runs backwards, 0.00 holds. It wraps round the sample and starts again from POS at every trig. |

SRC SETUP (knobs A to D):

| Knob | Values | What it does |
| --- | --- | --- |
| SHAP | NORM, TRI, PERC, SQR | The window of each grain. NORM a smooth bell: the grains melt into one another. TRI a triangle, a little more present in the middle. PERC an instant attack and an exponential fall to about -40 dB, so each grain is a tick or a pluck. SQR almost square, with short ramps: the grain keeps the sample's transients, like a stutter. |
| DIR | 0 to 127 | The share of grains that play backwards: 0 none, 64 half, chosen at random, 127 all. |
| PAN | OFF, 1 to 127 | A random pan for each grain, independent of where it was born. OFF at 0, the widest spread at 127. |
| MODE | RAND, SYNC | RAND: the grains are born freely, as DENS says. SYNC: they follow the project's tempo, and DENS picks how many fall in a bar. |

## Usage

1. Double-tap a track key (or open SRC SETUP), move to GRAIN in the machine list and press YES.
2. Double-tap the track key again and pick a sample from the Flex list, as for a Flex track.
3. Press SRC: the waveform with the grains. Press SRC twice for SRC SETUP. Press SRC once more from SRC SETUP for the full-screen page; another press closes it.

## Quick tutorial

1. Double-tap a track key, choose GRAIN in the machine list and press YES, then double-tap again and pick a Flex sample.
2. Put a trig on the track and play. Press SRC and turn POS: the grains move through the sample, and the waveform shows where. Turn SIZE down for a fine mist and up for long overlapping grains.
3. Turn SPRY up to scatter the grains around POS, and DENS up to thicken the cloud. Turn SCAN to let the read head run through the sample by itself.
4. Press SRC twice for SRC SETUP: turn PAN for a spread across the stereo field, DIR for a share of backward grains, SHAP to change the grain window, and MODE to SYNC to lock the grains to the tempo.
5. Press SRC once more from SRC SETUP for the full-screen page, with a larger waveform and every value beside its name, for precise settings.
6. Press SRC again to leave the full-screen page. Press STOP to stop playback.

## Changes to stock flows

Grain changes these, and only while a track is on the GRAIN machine:

- **SRC page.** The six knob dials are replaced by the waveform view. *Why:* the grains and POS are easier to set against the sample than against six dials. *Seen:* the stock page's title bar, tempo, LEV and sample box are unchanged; the area of the dials shows the waveform and the six names, with the value of a knob shown in place of its name while you turn it. *Instead:* hold SCENE A or B to see stock's knobs. It applies only on a Grain track.
- **A third press of PLAYBACK from SRC SETUP** opens the full-screen page instead of going back to SRC. *Why:* a bigger view for precise work, reached without a new gesture. *Seen:* press PLAYBACK again, or open another page or track, to leave it. FUNC and PLAYBACK still open SRC SETUP. It stays open as you move between Grain tracks.
- **SRC SETUP** shows SHAP, DIR, PAN and MODE in place of stock's Flex setup; DIR and PAN are drawn by stock's own dial routine.

Everything else, menus, saving, loading, scenes, recording, MIDI and timing, is as stock.

## What a Part keeps

Everything Grain stores in a Part is a value stock's own power-on check accepts: PTCH as Flex's (64 is 0), SHAP and MODE in LOOP and RATE, POS's eighths in TSNS, and DIR and PAN in the track's unused NEIGHBOR bytes. A project opened without the module, or on a unit without it, keeps its banks and plays the track as Flex.

## Screens and audio

The author captured these screens on an MKII emulator during development.

- [Grain in the machine list](media/grain-machine-list.png)
- [SRC waveform and position](media/grain-src.png)
- [SRC SETUP controls](media/grain-src-setup.png)
- [Full-screen waveform](media/grain-full-screen.png)

The author supplied a 45-second recording of Grain on their Octatrack MKI. They made the sounds in the recording, some with Claude. The build used for the recording is unknown. [Listen to the audio preview](media/audio-preview.mp3) · [Recording details and rights](media/audio-preview.json)

## Compatibility and limitations

Grain uses a Modwerk base for Octatrack OS 1.40C and plays the selected track's Flex sample. Up to six grains can sound on each admitted track. An unreadable or loading sample plays silence. Replacing a sample during a note takes effect on the next trig. Sequencer trigs, trig keys, CHROMATIC keys and MIDI notes all play the grains, a note at its pitch (within PTCH's -12 to +12 semitones, as on Flex); only FUNC + YES in the sample pool plays the sample as a plain Flex, as a preview, until the track's next trig. POS parameter locks use whole numbers. Each grain plays 3 dB below full scale, so six long grains of a loud sample stay clean; raise the track volume if a single grain is too quiet. PTCH changed units in 0.1.3: Grain 0.1.2 stored semitones (-24 to +24), 0.1.3 reads Flex's units (5 a semitone), so a PTCH saved with 0.1.2 plays at a fifth of its transposition (+12 becomes +2.4): set it again. A SCALE in PROJECT > CONTROL > SEQUENCER (the scale quantizer that comes with FM Synth and Scale Quantizer) now steps in the same units as Grain; not tested on a unit.

## Tests and measurements

The host suite compares mono and stereo renders and checks the frame that a new grain reads, from a one-frame sample through the maximum Flex sample length. The author recorded CPU-meter values on an MKI with an earlier build. See [TESTING.md](TESTING.md) for the package hash, commands and outstanding measurements.

## Authorship and licences

- **Grain**: A Force Truly Evil (@AForceTrulyEvil), written together with Claude (Anthropic) as programming assistant.
- **Engine seed**: Model-TG by TinyGregAudio (MIT). Grain starts from its granular mode only. The window tables, the SIZE and DENS tables and the grain scheduling come from it.
- **Octatrack glue**: AMIGA by Jannik Aßfalg (@repeat98, MIT): the sample pool, the page descriptor handling, the packet of source frames and the START and render wiring.
- **Base and tools**: Modwerk.

## License

MIT, with the copyright and permission notices of Model-TG and AMIGA in [LICENSE](LICENSE).
