# Amiga

Version 0.1.0-experimental · by Jannik Aßfalg (@repeat98) · a draft: the engine passes its host test, the machine has not run in the emulator or on a unit yet.

## Overview

Amiga is a track machine modelled on how a home computer's 8-bit sound chip and its tracker software played samples. It plays the track's Flex sample, reduces its word length and its storage rate before the Octatrack repitches it, and stretches it in cycles, as the samplers of that time did: every few milliseconds the sample restarts a little further on, faded into what is already sounding. PTCH then changes the pitch and STCH the length, each without the other, with that metallic flutter.

The track's filter, AMP, LFOs and effects follow as for any sample.

## Controls

On the SRC page. PTCH, STRT and LEN (knobs A–C) are stock FLEX's.

| Knob | Control | Shows | Default | What it does |
| --- | --- | --- | --- | --- |
| D | STCH | 50–2100, HOLD | 100 | The note's length in percent of its own: 200 is twice as long, 50 half. HOLD keeps the sound where it is. Steps of about 2 below 100, 5 up to 255, 10 up to 570, 50 above. |
| E | CYL | 100–4132 | 1000 | Cycle length in samples: about 2 ms (a buzz) through 23 ms at 1000 to 94 ms (a stutter). |
| F | RATE | 4143–31388, FULL | FULL | Storage rate in Hz for a 44.1 kHz sample, on the 36 note rates of a tracker's three octaves. Each stored sample is the average of those it replaces, then held. It moves one step every few detents. |

On SRC SETUP. LOOP, SLIC and LEN (knobs A–C) are stock FLEX's.

| Knob | Control | Shows | Default | What it does |
| --- | --- | --- | --- | --- |
| D | LED | OFF, ON | OFF | A fixed lowpass (two poles, about 3.3 kHz at PTCH 0) on the stored sample. It moves with PTCH. |
| E | STR | OFF, ON, PCH | ON | The stretch. OFF plays as FLEX does: pitch changes the length, and STCH and CYL do nothing. PCH turns it into a pitch shift: the length stays and STCH moves the pitch instead, 200 an octave up, 50 an octave down, no further, and never past PTCH's own range. |
| F | BITS | 4–16 | 8 | Word length. 16 leaves the sample untouched. It moves one step every few detents. |

STCH, CYL and RATE take parameter locks, LFOs and scenes. A turn of RATE is heard at once; STCH and CYL act from the next cycle.

With STR on, STCH 100 and PTCH 0 nothing is restarted. With RATE FULL, BITS 16 and LED off as well, the track plays exactly as FLEX.

## Usage

1. Double-tap a track key (or open SRC SETUP), move to AMIGA in the machine list and press YES.
2. Pick a sample from the Flex pool, as for a Flex track.
3. Open SRC: knob D is STCH, E is CYL, F is RATE.

## Quick tutorial

1. Put a drum loop on an Amiga track and play it. At the defaults it is the loop at 8 bits.
2. Turn PTCH up a few semitones: the loop keeps its length and starts to flutter. Turn CYL for the size of the flutter.
3. Turn STCH up to 200 for half speed at the same pitch, or all the way to HOLD to keep the sound where it is.
4. Put an LFO on STCH or CYL.
5. Turn RATE down to about 10000 for a grainy, folded top end.

## Compatibility and limitations

- No stock RATE, RTRG or RTIM on an Amiga track, so no reverse play: STCH, CYL and RATE take their knobs.
- Stock's own time-stretch (TSTR) is off on an Amiga track.
- The SRC page's title reads A500: the title holds four letters.
- A sliced track (SLIC on) is not stretched; RATE, BITS and LED still work.
- The cycle length is in milliseconds, not tied to the tempo.
- The fade between cycles works when the next cycle starts behind the playing one: slowing down, or pitching up at the same speed. Speeding up past the pitch, long cycles at high pitch, and a loop's wrap restart with a short fade-out of the step instead.
- A stretched note that is not looped ends when STCH has carried it to the end of the sample, even if LEN would stop a FLEX note sooner by time.
- A project opened without the module plays Amiga tracks as FLEX and reads STCH, CYL and RATE as stock's RATE, RTRG and RTIM. Leave the tracks for FLEX before you go back to the stock OS.
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
