# Mono Synth

## Overview

SY MONO, a digital voice machine for the Analog Rytm MKII (OS 1.74) by @chevyone, in the spirit of a small monosynth's oscillator section. Version 0.1.0-experimental.

One oscillator gives a saw and a pulse. A sub divides it down one or two octaves, white noise joins them, and a triangle LFO of the machine's own bends the oscillator's pitch for vibrato, trills and wobbles. There is no filter and no envelope in the machine: the voice's stream goes through the track's own analog filter, AMP and OVR, as Analog BD's does, so the Rytm's FLTR and AMP pages shape it.

The saw, pulse and sub are band-limited (polyBLEP), so high notes stay clean. The sources mix at half scale each: two at full make full scale, and with everything up the sum clips hard before the analog filter, by design, to drive it. The oscillator and the LFO run free from hit to hit, as an analog voice's do; the LFO is not tied to the tempo.

## Controls

The SYNTH page:

| A TUN | B LFO | C MOD | D PLS |
| --- | --- | --- | --- |
| **E SAW** | **F SUB** | **G NSE** | **H LEV** |

- **TUN**, Tune: centred at 64, 3/8 of a semitone a step, ±24 semitones (96 is +12, 32 is −12, 72 is +3). The trig's note adds to it.
- **Range** (16', 8', 4', 2'): tap encoder A to step it. A's label shows it (T16, T8, T4, T2), and it saves with the sound. 8' plays the note as it is, 16' an octave down, 4' and 2' one and two up.
- **LFO**, LFO Rate: 0.1 Hz at 0, about 1.8 Hz at 64, 30 Hz at 127, evenly on a log scale.
- **MOD**, Pitch Mod: how far the LFO bends the pitch, each way. The curve is fine at the bottom for vibrato (20 is about ±0.9 semitones) and reaches ±3 octaves at 127.
- **PLS**, Pulse Level: a pulse of fixed width, a little under half (47.7 %).
- **SAW**, Saw Level.
- **SUB**, Sub Osc: 0 is off, 1..63 raise a square one octave down from silent to full, 64..127 the same two octaves down.
- **NSE**, Noise Level: white noise.
- **LEV**, Level: the voice's level into the filter, as every Rytm machine has.

Every level and TUN, MOD and the range glide to a new value over about 5 ms, so parameter locks and turns do not click.

## Usage

The machine lists of the tracks on pads 1 to 8 (BD, SD, RS, CP, BT, LT, MT, HT), in the SY section (FUNC + SRC).

### Quick tutorial

1. Select the BD track, press FUNC + SRC, choose SY MONO (the last of the SY section) and press YES.
2. Play a few notes in CHROMATIC mode: you hear the saw. Turn FLTR's frequency and AMP's decay to shape it.
3. Turn SUB to 40 for a sub an octave down, or to 100 for one two octaves down.
4. Turn MOD to 20 for a vibrato, then LFO up for a fast trill; MOD at 100 and LFO at 20 wobble.
5. Tap encoder A to step the range (T16, T8, T4, T2).

## Compatibility and limitations

Built for OS 1.74 on the Modwerk base's digital voices (the voices variant; send-bus when the set also holds a send effect). It takes machine slot 40 and nothing else: no stock site, no key gesture. To know when the AMP has closed it follows the base's `ev_amp_record` at order 80, after every module that rewrites the amp's record, and only reads it, so it plays beside Improved AMP and other amp modules.

It is offered on six of the Rytm's eight voices: RS and CP share one, as do MT and HT, so only one track of a pair plays at a time; the hi-hats and cymbals stay stock. Each voice costs about 4 % of the audio block at its dearest, so six together fill the room the digital voices have. A voice stops once its AMP's decay has surely reached silence, so a track left on SY MONO costs nothing between notes; with AMP DEC at INF it keeps playing, and costs its share, until the next note or another machine.

## Tests and measurements

Host tests of the oscillators, sub, noise, LFO, smoothing, clipping and the AMP gate (`tools/run_host_test.sh`), and runs on the author's MKII from RAM: the page, the voices it takes and its cost with the base's `mw_voice_meter` (3.3 % of the block a voice on average, 4.3 % at its dearest). [TESTING.md](TESTING.md) has every result and what is not tested yet.

## Authorship and licences

Original work by @chevyone, with Claude Code: no code, samples or tables from any instrument. GPL-3.0-or-later ([LICENSE](LICENSE)). The thumbnail is original art; the screenshots are the author's captures of the Rytm's screen ([media/LICENSE.md](media/LICENSE.md)).

## Screens and audio

- [The machine list](media/machine-list.png): SY MONO last in the SY section of BD's list.
- [The SYNTH page](media/synth-t16.png) at the 16' range.
- [After a tap of A](media/synth-t8.png): the range at 8'.

No audio recordings yet.
