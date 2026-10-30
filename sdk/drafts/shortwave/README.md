# SHORTWAVE

Version: 0.1.0-experimental · author: @semierendonmez-commits · draft, not yet run on a unit

## Overview

SHORTWAVE plays the track as a distant station heard on a shortwave receiver. The track's mono sum goes through a receiver of its own design and MIX blends it back over the stereo dry:

- **Fading (QSB).** At random moments the station's level picks a new target and glides to it: on average every 2 s at RATE 0, every 44 ms at RATE 127. FADE sets how deep it goes.
- **Static.** NOIS sets the static's level, and the static rises as the station fades, the way a receiver's gain climbs on a weak signal.
- **Crackle.** CRAK sets how often short bursts of noise strike.
- **The beat whistle.** TUNE detunes the carrier: a whistle from 40 Hz to 5.1 kHz, silent at 0 (in tune). DRFT lets its pitch wander by up to 6 %.
- **The receiver.** A 150 Hz high-pass, then a state-variable low-pass from 300 Hz to 4 kHz (BAND), then DRIV into a soft clip worked at twice the rate, then a one-pole of the same bandwidth.

Signal path: `(L+R)/2 → fade + static + crackle + whistle → high-pass → low-pass (BAND) → drive and soft clip → one-pole → MIX over the dry`.

MIX 0 returns the dry bit for bit; the receiver keeps running, so turning MIX up needs no warm-up. Every continuous knob glides to its new value (a one-pole of 1/32 a sample, about 0.7 ms), so turns, locks and LFOs do not step. The receiver needs no buffer, so it runs on FX1 and FX2.

## Controls

Main page (FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| TUNE | 0 | 0-127 | How far off the station is tuned: the beat whistle's pitch, 40 Hz to 5.1 kHz; 0 = in tune, no whistle. The whistle fades in over the first 8 steps. |
| BAND | 64 | 0-127 | The receiver's bandwidth, 300 Hz to 4 kHz. |
| FADE | 48 | 0-127 | How deep the station fades; 0 = no fading. |
| RATE | 40 | 0-127 | How often the fading moves: every 2 s on average at 0, every 44 ms at 127. |
| NOIS | 32 | 0-127 | The static's level (it rises further as the station fades). |
| MIX | 0 | 0-127 | The receiver over the dry. 0 = the dry, untouched; 127 = the receiver alone. |

SETUP page (hold FUNC and press FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| DRIV | 24 | 0-127 | Drive into the receiver's soft clip, +0 to +12 dB. At 0 a station comes out at the dry's level. |
| CRAK | 16 | 0-127 | How often the crackle bursts; 0 = none. |
| DRFT | 0 | 0-127 | The whistle's pitch wandering, up to 6 %. |

## Usage

A drum loop or a vocal works well: the fading and the narrow band read clearly on material with a steady level.

## Quick tutorial

1. On an audio track that plays a sample, hold FUNC and press FX1, turn LEVEL to SHORTWAVE and press YES. Press FX1 for the main page. Nothing changes yet: MIX is 0.
2. Turn MIX to 127. The track now comes through the receiver: narrower (BAND 64 is about 1.1 kHz), with a little static and a slow fade. Turn FADE to 100 and RATE to 90 for a station that comes and goes; turn TUNE to 40 for a whistle under it.
3. To compare with the dry, turn MIX back to 0: the track is exactly as before. To remove the effect, choose NONE in FX1 SETUP.

## Compatibility and limitations

- **Needs the Modwerk base loaded over USB (beta)** with an effect id of its own. The card builds' thirteen non-stock ids are all claimed but 0x07, which this draft holds as a placeholder in `manifest.py`.
- **Mono receiver.** The wet is the same on both channels; MIX blends it over the stereo dry.
- **DRIV overloads on purpose.** At DRIV 0, every fx:audit tone but a full-scale 9.1 kHz one stays under -60 dBc of aliasing; at DRIV 127 a loud tone aliases (down to -18 dBc for a full-scale 5.3 kHz tone): that is the receiver overloading, the sound the control is for. Figures in TESTING.md.
- **Deterministic noises.** The static, crackle and fading start from the same seed whenever the effect is loaded, so a project sounds the same after a reload.
- **Scenes and locks.** Every knob is a continuous 0-127 knob; locks and scenes move them like any stock knob. Not yet tried on a unit.
- **Not yet run on a unit, under the ColdFire port or in a built image.** The DSP code has run only in fxhost, the vendored DSP56300 emulator with the module alone (TESTING.md).

## Tests and measurements

See [TESTING.md](TESTING.md). In short: `python3 -B sdk/drafts/shortwave/verify.py` runs 21 gates on the vendored DSP56300 emulator (MIX 0 bit-exact from garbage state and with trig splits, a memory guard, init keeps r1, silence and idle, the whistle's pitch and level, fading, bandwidth, noise, glides, the dearest settings and the cost). 340 program words, a 387-word table, 45 state words, no buffer; 259 executed instructions a sample at the dearest settings.

## Authorship and licences

Design, DSP56300 code and tables by Semi Erendönmez, GPL-3.0-or-later ([LICENSE](LICENSE)). The effect ABI, schema and harness conventions are octabam's (Sam Banks, MIT); the noise generator uses the doubled-product LCG idiom of Analog BD's DSP code. No Elektron firmware, extracted routines, tables or samples.

## Screens and audio

Not captured yet: the effect has not run in a built image. The thumbnail is a diagram, not an LCD capture.
