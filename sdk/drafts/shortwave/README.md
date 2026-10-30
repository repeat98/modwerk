# SHORTWAVE

Version: 0.2.0-experimental · author: @semierendonmez-commits · draft; the developer reports it runs on their Octatrack MKI (card build)

## Overview

SHORTWAVE plays the track as a distant station heard on a shortwave receiver. The track's mono sum goes through a receiver of its own design and MIX blends it back over the stereo dry:

- **Fading (QSB).** At random moments the station's level picks a new target and glides to it: on average every 2 s at RATE 0, every 44 ms at RATE 127. FADE sets how deep it goes.
- **Static.** NOIS sets the static's level, and the static rises as the station fades, the way a receiver's gain climbs on a weak signal.
- **Crackle.** CRAK sets how often short bursts of noise strike.
- **The detector (MODE) and TUNE.** In **AM**, TUNE detunes the carrier: a beat whistle from 40 Hz to 5.1 kHz, silent at 0 (in tune). In **USB** and **LSB** the receiver is a mistuned single-sideband receiver: there is no carrier, so no whistle, and TUNE moves every partial of the station by the same number of Hz, up in USB and down in LSB, from 0 (in tune) to 500 Hz (500 x (TUNE/127)^2: 127 Hz at 64, 251 Hz at 90). Harmonics stop being harmonic, which is the "Donald Duck" voice of a badly tuned SSB station. In both, DRFT lets the pitch wander by up to 6 %.
- **The receiver.** A 150 Hz high-pass, then (USB, LSB) the SSB detector, then a state-variable low-pass from 300 Hz to 4 kHz (BAND), then DRIV into a soft clip worked at twice the rate, then a one-pole of the same bandwidth.

Signal path: `(L+R)/2 → fade + static + crackle + whistle (AM) → high-pass → SSB shift (USB, LSB) → low-pass (BAND) → drive and soft clip → one-pole → MIX over the dry`.

How the shift is made: the high-passed station goes through two chains of three first-order allpass filters whose outputs stay 90 degrees apart (within 0.4 degrees) from 170 Hz to 4.3 kHz, the analytic pair I and Q; the whistle's quadrature oscillator, run at the shift and backwards for LSB, gives cos and sin at one phase, and I cos - Q sin is the station moved by the oscillator's frequency. The other sideband stays about 50 dB down across 300 Hz-3 kHz. The coefficients are our own minimax fit (`manifest.py`); the oscillator's amplitude is renormalised once a block so the shift's level does not wander. Partials pushed below 0 Hz in LSB fold back, as on a real receiver.

MIX 0 returns the dry bit for bit; the receiver keeps running, so turning MIX up needs no warm-up. Every continuous knob glides to its new value (a one-pole of 1/32 a sample, about 0.7 ms), so turns, locks and LFOs do not step, and a MODE change crossfades between the plain and the shifted station over the same time. The receiver needs no buffer, so it runs on FX1 and FX2.

## Controls

Main page (FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| TUNE | 0 | 0-127 | How far off the station is tuned; 0 = in tune. AM: the beat whistle's pitch, 40 Hz to 5.1 kHz (it fades in over the first 8 steps). USB/LSB: the shift of every partial, 0 to 500 Hz. |
| BAND | 64 | 0-127 | The receiver's bandwidth, 300 Hz to 4 kHz. |
| FADE | 48 | 0-127 | How deep the station fades; 0 = no fading. |
| RATE | 40 | 0-127 | How often the fading moves: every 2 s on average at 0, every 44 ms at 127. |
| NOIS | 32 | 0-127 | The static's level (it rises further as the station fades). |
| MIX | 0 | 0-127 | The receiver over the dry. 0 = the dry, untouched; 127 = the receiver alone. |

SETUP page (hold FUNC and press FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| MODE | AM | AM, USB, LSB | The detector. AM: TUNE is a beat whistle. USB: TUNE shifts the station up. LSB: TUNE shifts it down. No whistle in USB and LSB. |
| DRIV | 24 | 0-127 | Drive into the receiver's soft clip, +0 to +12 dB. At 0 a station comes out at the dry's level. |
| CRAK | 16 | 0-127 | How often the crackle bursts; 0 = none. |
| DRFT | 0 | 0-127 | The whistle's pitch, or the SSB shift, wandering by up to 6 %. |

On the SETUP page MODE, DRIV and CRAK are the top row and DRFT sits under DRIV.

## Usage

A drum loop or a vocal works well: the fading and the narrow band read clearly on material with a steady level. For the SSB voice, put a vocal or a melodic loop through USB or LSB and turn TUNE slowly from 0: up to about TUNE 40 (50 Hz) the pitch only sours, past it the voice turns into a duck. DRFT on top makes the receiver hunt for the station.

## Quick tutorial

1. On an audio track that plays a sample, hold FUNC and press FX1, turn LEVEL to SHORTWAVE and press YES. Press FX1 for the main page. Nothing changes yet: MIX is 0.
2. Turn MIX to 127. The track now comes through the receiver: narrower (BAND 64 is about 1.1 kHz), with a little static and a slow fade. Turn FADE to 100 and RATE to 90 for a station that comes and goes; turn TUNE to 40 for a whistle under it.
3. Hold FUNC and press FX1 for SETUP and turn MODE to USB. TUNE (back on the main page) now shifts the track up instead of whistling: at TUNE 64 every partial moves up by 127 Hz. LSB moves it down.
4. To compare with the dry, turn MIX back to 0: the track is exactly as before. To remove the effect, choose NONE in FX1 SETUP.

## Compatibility and limitations

- **Needs the Modwerk base loaded over USB (beta)** with an effect id of its own. The card builds' thirteen non-stock ids are all claimed but 0x07, which this draft holds as a placeholder in `manifest.py`.
- **Mono receiver.** The wet is the same on both channels; MIX blends it over the stereo dry.
- **Saved projects from the 0.1.0 draft.** 0.2.0 puts MODE on SETUP slot 6 and moves DRIV to slot 7, so a project saved with 0.1.0 reads its DRIV value as MODE (any value above 1 is LSB) and DRIV reads whatever that project stored in slot 7. Set MODE and DRIV again. 0.1.0 was never released.
- **SSB detector limits.** The 90-degree pair is designed for 170 Hz-4.3 kHz, the receiver's pass band: below about 150 Hz (where the high-pass already cuts) the other sideband comes up. A shift is a frequency shift, not a pitch shift: harmonics stop being harmonic, as on a real receiver.
- **DRIV overloads on purpose.** At DRIV 0, every fx:audit tone but a full-scale 9.1 kHz one stays under -60 dBc of aliasing; at DRIV 127 a loud tone aliases (up to -24 dBc for a full-scale 5.3 kHz or 9.1 kHz tone): that is the receiver overloading, the sound the control is for. The SSB detector adds no aliasing of its own (audited in tune). Figures in TESTING.md.
- **Deterministic noises.** The static, crackle and fading start from the same seed whenever the effect is loaded, so a project sounds the same after a reload.
- **Scenes and locks.** Every knob is a continuous 0-127 knob; locks and scenes move them like any stock knob. Not yet tried on a unit.
- **One unit, by report.** The developer reports it runs on their own Octatrack MKI from a card build (31 Oct 2026; the exact revision was not recorded). Otherwise the DSP code has run only in fxhost, the vendored DSP56300 emulator with the module alone (TESTING.md).

## Tests and measurements

See [TESTING.md](TESTING.md). In short: `python3 -B sdk/drafts/shortwave/verify.py` runs 33 gates on the vendored DSP56300 emulator (MIX 0 bit-exact from garbage state and with trig splits in every MODE, a memory guard, init keeps r1, silence and idle in AM, USB and LSB, the whistle's pitch and level, the SSB shift's accuracy in USB and LSB (within 0.03 %), the other sideband (50.5 dB down at worst over 300 Hz-3 kHz), the detector's gain and the oscillator's level, fading, bandwidth, noise, glides of MIX and MODE, the dearest settings and the cost). 487 program words, a 522-word table, 64 state words, no buffer; 307 executed instructions a sample at the dearest settings.

## Authorship and licences

Design, DSP56300 code and tables by Semi Erendönmez, GPL-3.0-or-later ([LICENSE](LICENSE)). The effect ABI, schema and harness conventions are octabam's (Sam Banks, MIT); the noise generator uses the doubled-product LCG idiom of Analog BD's DSP code. The SSB detector is the textbook phasing method (an allpass 90-degree pair and a quadrature oscillator); octabam's LOFI2 shifter (MIT) was read for technique, and SHORTWAVE's chains, coefficients and code are its own. No Elektron firmware, extracted routines, tables or samples.

## Screens and audio

Not captured yet: the effect has not run in a built image. The thumbnail is a diagram, not an LCD capture.
