# DROPOUT

Version: 0.1.0-experimental · author: @semierendonmez-commits · draft, not yet run on a unit

## Overview

DROPOUT makes the track drop out now and then, like a worn tape, a failing cable or a stream losing packets, and come back. Dropouts start at random (CHNC) and last around LEN, each one a little different; each fades in and out over EDGE. MODE says what the track drops to:

- **GAP**: silence, or a lower level with DPTH below 127. A worn tape or a loose cable.
- **HOLD**: the last 1.5 to 21 ms (SIZE), looped: a stuck buffer stuttering until the stream recovers.
- **CRSH**: the track held every 2 to 33 samples (SIZE) and reduced to 6 bits: a codec falling apart.

DPTH sets how far the track drops, and TONE darkens it while it is out (an 800 Hz low-pass blended in), like the high end a worn tape loses first.

Between dropouts the output is the input, bit for bit: the effect only touches the dropouts themselves. DPTH and TONE glide; CHNC, LEN and EDGE apply to the next dropout.

Signal path: `x → v = x + DPTH·e·(m − x) → out = v + TONE·e·(lowpass(v) − v)`, where `e` is the dropout's depth (0 outside a dropout, 1 inside, ramped by EDGE) and `m` is GAP's silence, HOLD's loop or CRSH's crushed copy.

## Controls

Main page (FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| CHNC | 40 | 0-127 | How often dropouts start: on average once in 20 s at 1, every 60 ms at 127. 0 = never. |
| LEN | 48 | 0-127 | How long a dropout lasts, 5 ms to 1 s on average; each one lasts 0.5 to 1.5 times that. |
| DPTH | 127 | 0-127 | How far the track drops; 127 = all the way to MODE's sound. |
| EDGE | 24 | 0-127 | How fast a dropout fades in and out: 0.1 ms (a hard cut) to 50 ms. |
| TONE | 0 | 0-127 | Darkens the track while it drops out. |

SETUP page (hold FUNC and press FX1 or FX2):

| Knob | Default | Range | What it does |
| --- | --- | --- | --- |
| MODE | GAP | GAP, HOLD, CRSH | What the track drops to: silence, a stuck loop, a crushed copy. |
| SIZE | 48 | 0-127 | HOLD: the loop, 1.5 to 21 ms. CRSH: the hold, 2 to 33 samples. |

## Usage

Drums show it best: GAP with a short EDGE cuts hits out like a dropout on tape; HOLD on a vocal stutters it; CRSH with TONE turns a pad into a failing stream.

## Quick tutorial

1. On an audio track that plays a sample, hold FUNC and press FX1, turn LEVEL to DROPOUT and press YES. Press FX1 for the main page: with CHNC 40 the track drops out every few seconds.
2. Turn CHNC to 100 and LEN to 40: short dropouts, several a second. Hold FUNC and press FX1, turn MODE to HOLD: each dropout now stutters a few milliseconds of the track; turn SIZE for a longer loop.
3. Turn CHNC to 0: no more dropouts, and the track plays exactly as before. To remove the effect, choose NONE in FX1 SETUP.

## Compatibility and limitations

- **Needs the Modwerk base loaded over USB (beta)** with an effect id of its own. The card builds' thirteen non-stock ids are all claimed but 0x07, which this draft holds as a placeholder in `manifest.py`.
- **Buffer.** HOLD keeps the last 1,024 frames in the first 2,048 words of the slot's buffer (`Claims(buffer_words=2048)`); an FX1 slot holds 3,072, so it runs on FX1 and FX2. A loop never reaches back past what it recorded since it was loaded.
- **Random, not in time.** Dropouts fall at random moments, not on steps: this effect follows no clock, the tempo or the track's trigs. The random sequence starts from the same seed whenever the effect is loaded.
- **HOLD and CRSH are deliberate glitches.** A HOLD loop jumps at its seam and CRSH aliases on purpose; EDGE softens the way in and out, not the loop.
- **DPTH 127** leaves the dry at 2^-23 (a few LSB, about -130 dBFS) under MODE's sound.
- **Not yet run on a unit, under the ColdFire port or in a built image.** The DSP code has run only in fxhost, the vendored DSP56300 emulator with the module alone (TESTING.md).

## Tests and measurements

See [TESTING.md](TESTING.md). `python3 -B sdk/drafts/dropout/verify.py` runs the gates on the vendored DSP56300 emulator: bit-exact output with no dropout and with DPTH and TONE at 0, from garbage state and buffer and with trig splits; the dropouts' rate and length against CHNC and LEN; GAP's depth; HOLD's loop period and that it never plays unrecorded memory; CRSH's grid and hold; TONE; EDGE's ramp; idle in every mode; a memory guard on every run (an FX1 slot not aligned to 2K, and an FX2 slot); the cost. 363 program words, a 387-word table, 31 state words and a 2,048-word buffer; 154 executed instructions a sample at the dearest settings.

## Authorship and licences

Design, DSP56300 code and tables by Semi Erendönmez, GPL-3.0-or-later ([LICENSE](LICENSE)). The effect ABI, schema and harness conventions are octabam's (Sam Banks, MIT); the noise generator uses the doubled-product LCG idiom of Analog BD's DSP code. No Elektron firmware, extracted routines, tables or samples.

## Screens and audio

Not captured yet: the effect has not run in a built image. The thumbnail is a diagram, not an LCD capture.
