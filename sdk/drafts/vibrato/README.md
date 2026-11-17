# Vibrato

A pitch vibrato for any audio track, on FX1 or FX2, by Bryan T (@bryantysinger). Version 0.1.0-experimental, a draft not yet tried on the Modwerk base.

## Overview

VIBRATO bends the pitch of its track with one short modulated delay per channel, wet only, with MIX blending the dry track back in. DEP is a pitch depth in cents and holds as SPD moves: the delay's swing is scaled by 1/rate, so a faster vibrato is not a deeper one. Each shape is a pitch trajectory and the delay is its integral:

- **SINE**: a sine in pitch.
- **TRI**: a triangle in pitch.
- **SQR**: a true two-note trill, the pitch jumping between +DEP and -DEP.
- **RND**: a new random pitch every half cycle, the square's step rate.

SLEW rounds whichever shape is selected. WID moves the right channel's vibrato ahead for stereo width, and on RND makes the right channel's random pitch independent of the left's. The delay lines are 1,024 samples long, so very slow and very deep settings run out of line first and stay shallower than DEP asks.

SPD and DEP glide: each knob word runs through two one-poles in a row, so a fast twist, a parameter lock or an LFO on either moves the pitch smoothly. An LFO on SPD or DEP faster than a few Hz is softened, and a square LFO's edge is rounded.

## Controls

| Page | Knob | Range, default | What it does |
|---|---|---|---|
| Main | SPD | 0–127, 80 | Rate, 0.25 Hz at 0 to 15.5 Hz at 127, exponential: 2 Hz at 64, 3.4 Hz at 80, 5.3 Hz at 94 |
| Main | DEP | 0–127, 48 | Peak pitch deviation, 100 × (DEP/127)² cents: 6 at 32, 14 at 48, 25 at 64, 100 at 127 (a whole tone between SQR's two notes) |
| Main | SLEW | 0–127, 0 | Rounds the shape, up to a quarter-cycle smoothing at 127. Turns SQR's steps into a glide and lowers the peak a little |
| Main | WID | 0–127, 0 | The right channel's lead, up to half a cycle (64 a quarter cycle, 127 opposite). On RND: 0 is mono, 127 independent |
| Main | MIX | 0–127, 127 | Dry/wet: 127 is the vibrato alone, 0 the dry track, bit for bit. Glides over about 3 ms |
| SETUP | SHP | SINE, TRI, SQR, RND; SINE | The pitch shape. A change fades the vibrato to dry, switches and fades back, without a click |

## Usage

Select an audio track, hold FUNC and press FX1 (or FX2) for its SETUP page, turn LEVEL to VIBRATO and press YES. SHP is on the SETUP page; press FX1 (or FX2) for SPD, DEP, SLEW, WID and MIX. It runs on FX1 or FX2, and on several tracks at once.

## Quick tutorial

1. On an audio track that plays a sustained sound (a pad, a held note), hold FUNC and press FX2, turn LEVEL to VIBRATO and press YES. (FX1 works the same way.)
2. Press FX2 for the main page. At the defaults the track has a gentle sine vibrato of about 14 cents at 3.4 Hz. Turn DEP (encoder B) to 80 for a deep, singing vibrato, and SPD (encoder A) to 100 for a faster one.
3. Hold FUNC and press FX2 again, turn SHP (encoder A) to SQR, then turn DEP to 127 on the main page: the track now trills a whole tone. Turn SLEW up to round the trill into a glide.
4. Turn MIX to 0 to hear the dry track again, or pick NONE in FX2 SETUP to take VIBRATO off the track.

## Compatibility and limitations

- An insert on its own effect id, so no stock effect is replaced. It patches nothing in the stock OS and claims no keys or screens.
- Runs on FX1 or FX2 of any audio track, on both DSP cores. It uses 2,048 words of its effect slot's own buffer (an FX1 slot gives 3,072).
- **Modwerk differs from octabam here:** octabam's SLOTS build setting chose between an FX1-only build (an FX2 instance a dry pass, so it could sit beside octabam's bus servers) and FX1+FX2. Modwerk has no bus servers and its base places an effect on either slot, so this port is the FX1+FX2 build, always.
- **One random seed for both cores:** octabam seeds the random generator per DSP core; a Modwerk USB package is one program for both cores, so this port uses core A's seed on both. Each instance's seed still mixes in its own state address, so every RND instance differs from every other except the same slot on the two cores (track 1 FX1 and track 5 FX1, say).
- A project that selects VIBRATO on a unit without it falls back to no effect on that slot.
- Not tried on the Modwerk base on a unit yet: see TESTING.md.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: the USB package builds from source (696 DSP words). The author's octabam render gate and his MKII measurement (4.5 % of a DSP frame a slot) are his results on octabam's build, quoted there; nothing has run on the Modwerk base yet.

## Authorship and licences

VIBRATO is Bryan T's work: the design (prototyped in Faust, `vibrato.dsp`), the DSP56300 code, the float reference `vibrato_ref.py` and its tables, the declaration and the render gate. He contributed it to octabam as pull request 1045 and added the SPD and DEP glide the same day (5 November 2026). This copy is octabam main at `e85f54e0`, under octabam's MIT licence (Copyright (c) 2026 Sam Banks), whose full text is in [LICENSE](LICENSE) and `upstream/LICENSE`. Sam Banks wrote the octabam SDK, schema and harness it is written against.

Modwerk's changes, recorded file by file in `sdk/imports/vibrato-e85f54e.json`:

- `vibrato.asm`: the FX2 flag's line is a `nop` (octabam's FX1+FX2 variant, fixed), and the seed placeholder is core A's seed.
- `manifest.py`: no SLOTS setting or settings store, no `fx1_only`, no text substitution, this SDK's proof fields in place of octabam's newer evidence record, the GitHub handle as the native author, the gate's path.
- `verify_vibrato.py`: moved into the module folder, builds its own scratch image (as Modwerk's LOFI2 gate does), and checks FX2 as live on the main build in place of octabam's FX1-only promise.

The author's README and usage page are kept unchanged in `upstream/`.

## Screens and audio

Headless emulator captures of a private native build (`media/`, provenance in `media/capture.json`), on FX2:

1. `media/ot-setup.png`: FX2 SETUP with VIBRATO chosen; SHP on encoder A.
2. `media/ot-main.png`: the main page, SPD, DEP and SLEW above WID and MIX.
3. `media/ot-deep.png`: DEP turned to 127.
4. `media/ot-shape-sqr.png`: SHP set to SQR, the trill.

The native build's FX2 list holds only NONE and VIBRATO; on the Modwerk base the list also holds the stock effects and the other installed modules. No audio preview yet.

## Develop

- Hear it: `npm run module:dev -- vibrato` builds it and tries it on your unit over USB; `--watch` does that again on every save.
- Check it: `npm run module:doctor -- --draft vibrato`.
