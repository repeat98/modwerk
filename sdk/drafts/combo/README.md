# Combo

Version 0.1.0-experimental · by @sebasprosala-sys · an experimental draft: rendered bit for bit in dsp_host; the build before page 2 ran on a unit; COMBO is a USB package only for now (no card id is free).

## Overview

COMBO puts a track through an amp and a speaker cabinet, miked. VOIC picks one of five amp voices, GAIN drives a soft curve that rounds off as it reaches full scale, BASS, MID and TREB shape the result, and CAB picks one of four cabinets, or none. It is an insert for FX1 or FX2 on any track. Like a guitar amp it is mono: it plays the sum of both sides through one amp and sends the result to both.

Signal chain: `(L + R)/2 -> the voice's high-pass (TGHT) and band-limit -> [2x: GAIN -> the voice's curve] -> level (1/√GAIN × LEV) -> BASS/MID/TREB at the voice's splits -> CAB (with PRES and the mic's AXIS) -> 10 Hz DC blocker -> the mic's DIST (early reflections, stereo) -> MIX with the dry L and R`.

- Each voice (VOIC) sets what reaches the drive (its low cut, and a band-limit whose resonance puts a bump where the voice bites), how hard GAIN drives, the curve's shape and its asymmetry, and the tone stack's splits and centre. They are styles of amp in Modwerk's own design, not models of any product.
- The band-limit keeps the curve's harmonics from aliasing as much.
- The curve is 0.75c - 0.25c³ on the gained signal, limited at full scale, so it flattens smoothly instead of clipping hard (SOLID: 0.9c - 0.1c³, which clips harder at the top). BOOST, ROCK and BASS shift it off centre, which adds even harmonics; the shift is taken off again, so silence stays silence. It runs at twice the sample rate (a polyphase half-band filter up and down, halfband.py), which keeps most of the harmonics it makes from folding back as tones that do not follow the note.
- After the curve the level comes down by the square root of GAIN's boost, so turning GAIN up adds drive, not volume: on a clean guitar DI the output stays within about 8 dB from GAIN 0 to 127. This also leaves the cabinet room, so nothing clips at LEV 64.
- The tone stack splits the sound in three bands at the voice's two splits. With BASS, MID and TREB at their centre each voice has its own curve (CLEAN scoops the mids, ROCK pushes them, SOLID is nearly flat, BASS keeps the lowest octave).
- Each cabinet is a resonant high-pass (its low thump), a resonant low-pass (its upper-mid bump and roll-off) and a second low-pass that steepens the top. They are Modwerk's own designs from textbook filter formulas, not impulse responses or models of any product.

## Controls

FX page (press FX1 or FX2):

| Knob | Range | Default | What it does |
| --- | --- | --- | --- |
| GAIN | 0 to 127 | 40 | Drive into the amp: +0 dB at 0 (clean on most material), +22 dB at 40 (crunch), +38 dB at 127. The output level is compensated, so GAIN changes the drive, not the volume. |
| BASS | -64 to +63 | 0 | Lows below 300 Hz: cut to silence at -64, flat at 0, +6 dB at +63. |
| MID | -64 to +63 | 0 | Mids, 300 Hz to 2.2 kHz: the same range. |
| TREB | -64 to +63 | 0 | Highs above 2.2 kHz: the same range. |
| CAB | OFF, 1X10, 1X12, 2X12, 4X12 | 1X12 | The speaker cabinet. 1X10 is the smallest and brightest at the top, 4X12 has the most low thump and the darkest top. OFF leaves the amp's own sound. |
| LEV | 0 to 127 | 64 | Output level, (LEV/64)²: silence at 0, 0 dB at 64, +12 dB at 127. |

SETUP page (hold FUNC and press FX1 or FX2; knobs A to F):

| Knob | Values | Default | What it does |
| --- | --- | --- | --- |
| VOIC | CLEAN, BOOST, ROCK, SOLID, BASS | BOOST | The amp voice. CLEAN: bright, scooped mids, breaks up late. BOOST: chiming upper mids, an early soft break-up with even harmonics. ROCK: tight lows, mids forward, the most drive. SOLID: flat and clean, clipping hard only at the top; put CHORUS on the other FX slot for a wide clean sound. BASS: for bass, the lowest octave kept, a darker top and some growl in the low mids. |
| TGHT | -64 to +63 | 0 | Tightness: the low cut before the drive. 0 is the voice's own (40 to 180 Hz), -64 a fifth of it (loose, boomy drive), +63 about 1.8 times it (tight, for fast palm-muted parts). |
| PRES | 0 to 127 | 0 | Presence: raises the cabinet's upper-mid bump to about +6 dB around 4 to 5 kHz. With CAB OFF it is a peak of up to +6 dB at 3.5 kHz. |
| AXIS | 0 to 127 | 0 | The mic's axis on the speaker: 0 on the cone's axis (the brightest), 127 off axis, its top rolled off an octave lower. Does nothing with CAB OFF. |
| DIST | 0 to 127 | 0 | The mic's distance: 0 near (the speaker alone), 127 far, where the room's early reflections (6 to 18 ms, different on each side, so the sound widens to stereo) come in and the direct sound drops by about 4 dB. A room, not a reverb: there is no tail. |
| MIX | 0 to 127 | 127 | Dry to amp. 127 is all amp, 0 the track untouched and in stereo; between, the dry and the driven sound together (parallel drive, good on bass and drums). |

The voices sit within about 1 dB of each other at GAIN 40 on a clean guitar DI, so switching them changes the character, not the volume.

GAIN, BASS, MID, TREB, LEV and MIX glide (about 1.5 ms), so turning them, locking them or modulating them with an LFO does not click. TGHT, PRES, AXIS and DIST move in 16-sample steps. CAB and VOIC switch at once.

## Usage

1. Install COMBO on a unit running the Modwerk USB base (`npm run module:dev -- combo` for a trial in RAM).
2. Select an audio track, hold FUNC and press FX1 (or FX2), turn LEVEL to COMBO and press YES.
3. Press FX1 (or FX2) for its knobs. Hold FUNC and press FX1 for its SETUP page: A turns VOIC, B TGHT, C PRES, D AXIS, E DIST and F MIX.

## Quick tutorial

1. Put a drum loop, a synth line or a guitar on a track and pick COMBO on its FX1. At the defaults you hear BOOST's light crunch through a 1X12 cabinet.
2. Hold FUNC, press FX1 and turn A through CLEAN, ROCK, SOLID and BASS to hear the five voices.
3. Turn GAIN up past 90 for a fully driven sound, then turn CAB through 1X10 and 4X12 to hear the speaker change. Lower TREB if it gets fizzy.
4. On the SETUP page turn D (AXIS) up to move the mic off axis, E (DIST) up to step it back into the room, and F (MIX) to about 60 to blend the dry track back in.
5. Set CAB to OFF and GAIN to 0 to hear the amp nearly clean, or pick another effect in the list to take COMBO off the track.

## Compatibility and limitations

- No free effect id is left for card builds: stock and the listed modules hold every id the card's tables have (docs/OCTATRACK_MORE_EFFECT_IDS.md). Over USB the base gives each installed effect its own id, so COMBO runs as a USB package only for now.
- It takes no key gesture and no stock screen, and patches no stock code: it is one entry in the base's FX list. It reads its slot's buffer from the allocator, like the stock CHORUS and FLANGER, and touches 2,048 words of it (`buffer_words`).
- Card builds refuse it beside Analog BD, as they refuse every effect not on Analog BD's reviewed list.
- CAB and VOIC switch their filters at once, so turning them while audio plays can click.
- Mono amp: a stereo sample (a stereo chorus, a wide pad) goes through the amp in mono, as it would through a guitar amp; at DIST 0 and MIX 127 both sides are the same. Put a stereo effect on the other FX slot after it for width; below 127 MIX brings back the dry stereo.
- DIST uses 1,024 words of the slot's own delay memory, which every FX1 and FX2 slot has; it reflects nothing for its first 23 ms after COMBO is picked, while that memory fills. A far mic on a steady tone can sit in a notch of the reflections, as in a real room.
- At a MIX between, the amp's filters shift its phase against the dry sound, which colours the blend like a real parallel chain.
- At high GAIN with loud, bright input some aliasing remains (2x oversampling halves the problem, not all of it), most in ROCK: see TESTING.md, Sound quality. Lowering TREB or GAIN reduces it.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: `verify.py` renders it in dsp_host bit for bit against [reference.py](reference.py), gives exact silence for silence in every voice, and measures 309.7 instructions a sample (stock SPRING REV: about 314). It installs and draws both pages in the emulator. The build before page 2 passed device:test on a unit; page 2 has not run on one yet.

## Authorship and licences

Original code and filter design by @sebasprosala-sys, under the MIT licence in LICENSE. The filters use Robert Bristow-Johnson's Audio EQ Cookbook formulas, and the oversampler Valenzuela and Constantinides' published polyphase half-band design, written here from the formulas. The five voices are general styles of amp built from these formulas; no impulse response, curve, circuit or voicing is taken from any product, and nothing comes from Elektron's firmware.

## Screens and audio

None yet.

## Develop

- Hear it: `npm run module:dev -- combo` builds it and tries it on your unit over USB; `--watch` does that again on every save.
- Gate: `python3 verify.py` (Python 3.12+, the vendored dsp56300 tools from `npm run upstream:tools`). `python3 tables.py` prints every cabinet's response.
- Hear any WAV through it: `python3 render.py IN.wav OUT.wav GAIN=90 CAB=4X12` (`--dir` for a folder), the assembled DSP in dsp_host.
- Emulator: `python3 tools/emu_session.py EMU TWIN PKG REPO OUT 11` installs the package on a scratch card and captures choosing COMBO and its page (TESTING.md).
- Check it: `npm run module:doctor -- --draft combo`.
