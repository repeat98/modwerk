# Improved FLTR

## Overview

Improved FLTR adds a band type to the FILTER page: the Rytm's own analog filter as a high-pass and a low-pass in one, with FRQ setting the high-pass edge (the base) and RES setting the low-pass edge. It is all analog: the voice's 2-pole multimode filter runs as a band-pass whose resonance goes below stock's RES 0, which widens the band (measured on a unit). The two edges can sit from one semitone up to five octaves apart, with 6 dB/oct slopes on each side.

TYP turns past PK to **BND** (linked) and **BND+** (unlinked). Linked, the low-pass edge keeps its distance above the base, so FRQ, its locks, LFO, performance and the filter envelope move the whole band. Unlinked, RES is the low-pass cutoff itself and FRQ moves the high-pass edge alone. A tap of RES flips between the two and keeps the low-pass edge where it is.

Version **0.1.0-experimental** for Analog Rytm MKII OS **1.74**, on Modwerk's base (core-ar2 0.7). Written by Nathaniel Pavel.

## Controls

| Control | Action |
| --- | --- |
| FILTER TYP | Past PK: BND (band, linked) and BND+ (band, unlinked). The knob shows a band picture. |
| FILTER FRQ | In a band type: the high-pass edge (the base). Its scale is stock's: a semitone a step, 440 Hz at 60 (Filter Hz shows it in hertz). |
| FILTER RES | In a band type: the low-pass edge, shown in hertz. BND: its distance above FRQ, 0 to 127 for 0 to 59.5 semitones. BND+: the cutoff itself, on FRQ's scale. |
| Tap RES (press and let go) | In a band type: BND <-> BND+. The low-pass edge stays where it is; RES is converted. |
| FILTER ENV | Moves the analog cutoff, so it moves both edges, in either band type. |

The other FILTER knobs and every other type are stock's.

## Usage

Choose a band type on a track's FILTER page, then set the base with FRQ and the top with RES.

### Quick tutorial

1. Use a build containing Improved FLTR. On BD, press FILTER and turn TYP past PK: it reads BND and the knob shows a band.
2. Turn FRQ to about 220 Hz and RES up: the band opens upward from 220 Hz; RES shows where its low-pass edge is in hertz.
3. Turn FRQ: the whole band moves, keeping its width. Add filter envelope with ENV: the band sweeps.
4. Tap RES: the header reads LP FREE and TYP BND+. Now FRQ moves the high-pass edge alone and RES the low-pass edge alone. Tap again for LP LINKED.
5. Lock FRQ or RES on trigs as on any type, or turn TYP to BND on one trig only.

## How it works

Read in OS 1.74 and measured on a unit (the study's notes are private; the numbers that matter are here):

- **One filter, one cutoff.** Each voice has one resonant 2-pole filter, one cutoff word, one resonance word and a 3-bit type switch (the filter routine at 0x4010d0fc writes them each audio block). Two independent analog cutoffs are not possible on one voice.
- **Below RES 0.** The resonance word is signed: stock sends 0x0000..0x7f00, and words below 0 damp the filter further. On a unit, band-pass Q went from 0.62 at RES 0 to 0.24 at 0xf000 and 0.095 at 0xe000, the same at 220 Hz, 880 Hz and 3.5 kHz. A 2-pole band-pass with Q under 0.5 is a 1-pole high-pass and a 1-pole low-pass in series, with -3 dB edges at centre x (sqrt(1 + 1/4Q^2) -/+ 1/2Q).
- **Edges to words.** For edges w semitones apart the filter's cutoff is their midpoint (their geometric mean in hertz) and its Q is 1 / (2^(w/24) - 2^(-w/24)). `tools/width_table.py` turns the measured Q curve (`tools/calibration.json`) into the resonance word for each width (`src/width-table.h`). The filter routine's three stores are taken by one site (`src/band.s`): stock's types pass as stock's, the band types get the midpoint, the table's word and BP's switch code.
- **The page.** TYP's maximum in stock's id table is opened from 6 to 8, so stock's turn, setter, locks and MIDI take the band types. Stock's eighth TYP picture, blank in OS 1.74, points at the band picture. The FILTER graph draws a band type as stock's BP between the edges (a band wider than stock's widest BP shows at that width). TYP's and RES's texts come through the core's `core_params`; the tap through `ev_key` and `ev_enc`, as Audio In Routing's.

## Changes to stock flows

- **TYP's list gains BND and BND+ after PK.** Stock's seven types are unchanged; the new entries only act when chosen. Considered instead: a mode bit in mod storage, which cannot be locked per trig and needs a sound-load hook the plain base lacks.
- **In a band type, FRQ and RES mean the edges.** Only in BND and BND+; every other type is stock's.
- **A tap of RES on a band type flips the link.** Stock's press only shows the parameter; it still does. A press with a trig, FUNC or NO held, in live recording, or in scene or performance mode is stock's.
- Checked beside: Filter Hz (FRQ in hertz), Improved AMP (FILTER envelope times), stock's locks on FRQ, RES and TYP.

## Compatibility and limitations

Requires Modwerk's base (core-ar2 0.7) on OS 1.74. Use your own original stock OS 1.74 file.

- **Without the module** a kit with a band type plays it as PK (stock's own clamp) and draws a blank TYP picture; nothing else changes. Stock's MIDI CC 76 already stores values 7 to 127 unclamped, so such kits can come from stock too; the module treats only 7 and 8 as bands.
- **Widths.** 1 semitone to 5 octaves. Narrow bands are resonant (Q 17 at one semitone); past about 4.5 octaves the band flattens and drops in level.
- **Level.** A wider band is quieter: about 7 dB down at 4.5 octaves, 14 dB at 7 octaves. Set VOL by ear; there is no make-up gain.
- **Accuracy.** On a unit the edges landed within about 7 % of FRQ and RES (two runs; the analog filter itself moves a few percent from run to run), a 5-octave band's low edge up to 18 % high.
- **Slopes.** 6 dB/oct each side, the analog filter's own: a 2-pole band-pass split in two.
- **The graph** shows bands wider than stock's widest BP at that width.
- **The envelope** moves the analog cutoff: in BND+ it moves both edges too.
- **The tap** edits the sound, not a trig's lock. It writes RES and then TYP through stock's setter, so MIDI out sends CC 75 then CC 76 (the unit itself changes both at once).
- **RES carries over** when TYP moves between a band type and a stock type: its value keeps its number and takes the new type's meaning. A wide band's RES (an edge high up) read as stock resonance can self-oscillate loudly on LP2..PK; a stock RES 0 read in BND is the narrowest, most resonant band. Set RES after changing TYP.
- **At the top.** The analog cutoff stops at stock's top (FRQ 127, 21.1 kHz): a wide band with a high base then starts below FRQ. RES shows the low-pass edge as played, OPEN above 21.1 kHz.
- **TYP 9 to 127** (from MIDI CC 76 only) play and read as PK, as on stock, but show the band picture: stock draws its eighth picture for any type above 7.
- **A locked RES** shows its hertz in stock's 27-pixel lock box, which kHz values overrun (Filter Hz widens the box for FRQ only).

## Tests and measurements

See [TESTING.md](TESTING.md). Memory: under 1 KB of code and data. Audio: a few instructions a voice a block in the filter routine.

## Authorship and licences

Nathaniel Pavel wrote it; the core is irpina's Elekloader core-ar2. GPL-3.0-or-later, see [LICENSE](LICENSE). No firmware, extracted routines or tables are included: the patch sites are addresses, lengths and SHA-256s, and the band picture is original.

## Screens and audio

Not captured yet.
