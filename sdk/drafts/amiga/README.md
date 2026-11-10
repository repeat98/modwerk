# Amiga

Version 0.1.0-experimental · by Jannik Aßfalg (@repeat98) · a draft: the engine passes its host test, the machine has not run in the emulator or on a unit yet.

## Overview

Amiga is a track machine modelled on how a home computer's 8-bit sound chip and its tracker software played samples. It plays the track's Flex sample, reduces its word length and its storage rate before the Octatrack repitches it, and stretches it in cycles, as the samplers of that time did: every few milliseconds the sample restarts a little further on, faded into what is already sounding. PTCH then changes the pitch and SPD the speed, each without the other, with that metallic flutter.

The track's filter, AMP, LFOs and effects follow as for any sample.

## Controls

On the SRC page. PTCH, STRT and LEN (knobs A–C) are stock FLEX's.

| Knob | Control | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| D | SPD | 0–127 | 64 | Stretch speed. 0 holds the sample where it is, 32 is half speed, 64 its own speed, 127 about twice. |
| E | GRN | 0–127 | 64 | Cycle length, from about 2 ms (a buzz) through 25 ms at 64 to 94 ms (a stutter). |
| F | SRR | 0–127 | 0 | Storage rate. 0 keeps every sample; 16 stores every second one, 127 about one in nine (near 5 kHz for a 44.1 kHz sample). Each stored sample is the average of those it replaces, then held. |

On SRC SETUP. LOOP, SLIC and LEN (knobs A–C) are stock FLEX's.

| Knob | Control | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| D | LED | OFF, ON | OFF | A fixed lowpass (two poles, about 3.3 kHz at PTCH 0) on the stored sample. It moves with PTCH. |
| E | STR | OFF, ON | ON | The stretch. OFF plays as FLEX does: pitch changes the length, and SPD and GRN do nothing. |
| F | BITS | 4–16 | 8 | Word length. 16 leaves the sample untouched. It moves one step every few detents. |

SPD, GRN and SRR take parameter locks, LFOs and scenes. A turn of SRR is heard at once; SPD and GRN act from the next cycle.

With STR on, SPD 64 and PTCH 0 nothing is restarted. With SRR 0, BITS 16 and LED off as well, the track plays exactly as FLEX.

## Usage

1. Double-tap a track key (or open SRC SETUP), move to AMIGA in the machine list and press YES.
2. Pick a sample from the Flex pool, as for a Flex track.
3. Open SRC: knob D is SPD, E is GRN, F is SRR.

## Quick tutorial

1. Put a drum loop on an Amiga track and play it. At the defaults it is the loop at 8 bits.
2. Turn PTCH up a few semitones: the loop keeps its length and starts to flutter. Turn GRN for the size of the flutter.
3. Turn SPD down to 32 for half speed at the same pitch, or to 0 to hold the sound where it is.
4. Put an LFO on SPD or GRN.
5. Turn SRR up to about 30 for a grainy, folded top end.

## Compatibility and limitations

- No RATE, RTRG or RTIM on an Amiga track, so no reverse play: SPD, GRN and SRR take their knobs.
- Stock's own time-stretch (TSTR) is off on an Amiga track.
- The SRC page's title reads A500: the title holds four letters.
- A sliced track (SLIC on) is not stretched; SRR, BITS and LED still work.
- The cycle length is in milliseconds, not tied to the tempo.
- The fade between cycles works when the next cycle starts behind the playing one: slowing down, or pitching up at the same speed. Speeding up past the pitch, long cycles at high pitch, and a loop's wrap restart with a short fade-out of the step instead.
- A stretched note that is not looped ends when SPD has carried it to the end of the sample, even if LEN would stop a FLEX note sooner by time.
- A project opened without the module plays Amiga tracks as FLEX and reads SPD, GRN and SRR as RATE, RTRG and RTIM. Set them to 127, 0 and 64 before you go back to the stock OS.
- Leaving Amiga for another machine puts the track's SRC settings back to FLEX defaults.
- It needs a base with `ot_machine_starts` (the START dispatch) and patches no stock code. It takes no key gesture and no stock screen.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

Original code by Jannik Aßfalg, MIT ([LICENSE](LICENSE)). No firmware, stock routines or tables, samples or third-party code. The machine-list and sample-pool glue is the S950 draft's, by the same author.

"Amiga" names the discontinued home computer whose sound this models. The module is not affiliated with or endorsed by the owners of that name.

## Screens and audio

None yet.

## Develop

- Edit `amiga.c`, then `python3 -B generate.py` writes `amiga_core.s`, the unit the build links. `python3 -B verify.py` tests the engine on the host.
- Hear it: `npm run module:dev -- amiga` builds it and tries it on your unit over USB.
- Check it: `npm run module:doctor -- --draft amiga`.
