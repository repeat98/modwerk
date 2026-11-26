# Combo

Version 0.1.0 · by @sebasprosala-sys · an experimental draft: rendered bit for bit in dsp_host, not yet run on a unit.

## Overview

COMBO puts a track through an amp and a speaker cabinet. GAIN drives a soft curve that rounds off as it reaches full scale, BASS, MID and TREB shape the result, and CAB picks one of four cabinets, or none. It is an insert for FX1 or FX2 on any track, in stereo: both channels run the same amp with their own state.

Signal chain, per channel: `in -> 90 Hz high-pass -> 7 kHz band-limit -> GAIN -> soft curve -> BASS/MID/TREB -> CAB -> LEV -> out`.

- The high-pass keeps the lowest lows from muddying the drive; the band-limit keeps the curve's harmonics from aliasing as much.
- The curve is 0.75c - 0.25c³ on the gained signal, limited at full scale, so it flattens smoothly instead of clipping hard. At full drive it peaks at half of full scale, which LEV's +12 dB brings back up.
- The tone stack splits the sound at 300 Hz and 2.2 kHz. With BASS, MID and TREB at their centre it is exactly flat.
- Each cabinet is a resonant high-pass (its low thump), a resonant low-pass (its upper-mid bump and roll-off) and a second low-pass that steepens the top. They are Modwerk's own designs from textbook filter formulas, not impulse responses or models of any product.

## Controls

FX page (FX1 or FX2):

| Knob | Range | Default | What it does |
| --- | --- | --- | --- |
| GAIN | 0 to 127 | 40 | Drive into the amp: +0 dB at 0 (clean on most material), +22 dB at 40 (crunch), +38 dB at 127. |
| BASS | -64 to +63 | 0 | Lows below 300 Hz: cut to silence at -64, flat at 0, +6 dB at +63. |
| MID | -64 to +63 | 0 | Mids, 300 Hz to 2.2 kHz: the same range. |
| TREB | -64 to +63 | 0 | Highs above 2.2 kHz: the same range. |
| CAB | OFF, 1X10, 1X12, 2X12, 4X12 | 1X12 | The speaker cabinet. 1X10 is the smallest and brightest at the top, 4X12 has the most low thump and the darkest top. OFF leaves the amp's own sound. |
| LEV | 0 to 127 | 64 | Output level, (LEV/64)²: silence at 0, 0 dB at 64, +12 dB at 127. |

GAIN, BASS, MID, TREB and LEV glide (about 1.5 ms), so turning them, locking them or modulating them with an LFO does not click. CAB switches at once.

## Usage

1. Install COMBO on a unit running the Modwerk USB base (`npm run module:dev -- combo` for a trial in RAM).
2. Select an audio track, hold FUNC and press FX1 (or FX2), turn LEVEL to COMBO and press YES.
3. Press FX1 (or FX2) for its knobs.

## Quick tutorial

1. Put a drum loop or a synth line on a track and pick COMBO on its FX1. At the defaults you hear a light crunch through a 1X12 cabinet.
2. Turn GAIN up past 90 for a fully driven sound, then turn CAB through 1X10 and 4X12 to hear the speaker change. Lower TREB if it gets fizzy, and raise LEV to match the level.
3. Set CAB to OFF and GAIN to 0 to hear the amp nearly clean, or pick another effect in the list to take COMBO off the track.

## Compatibility and limitations

- No free effect id is left for card builds: stock and the listed modules hold every id the card's tables have (docs/OCTATRACK_MORE_EFFECT_IDS.md). Over USB the base gives each installed effect its own id, so COMBO runs as a USB package only for now.
- It takes no key gesture and no stock screen, and patches no stock code: it is one entry in the base's FX list.
- Card builds refuse it beside Analog BD, as they refuse every effect not on Analog BD's reviewed list.
- CAB switches its filters at once, so turning it while audio plays can click.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: `verify.py` renders it in dsp_host bit for bit against [reference.py](reference.py), gives exact silence for silence, and measures 381.2 cycles a sample (stock SPRING REV: about 314). Nothing has run on a unit yet.

## Authorship and licences

Original code and filter design by @sebasprosala-sys, under the MIT licence in LICENSE. The filters use Robert Bristow-Johnson's Audio EQ Cookbook formulas. No impulse response, curve or voicing is taken from any product, and nothing comes from Elektron's firmware.

## Screens and audio

None yet.

## Develop

- Hear it: `npm run module:dev -- combo` builds it and tries it on your unit over USB; `--watch` does that again on every save.
- Gate: `python3 verify.py` (Python 3.12+, the vendored dsp56300 tools from `npm run upstream:tools`). `python3 tables.py` prints every cabinet's response.
- Check it: `npm run module:doctor -- --draft combo`.
