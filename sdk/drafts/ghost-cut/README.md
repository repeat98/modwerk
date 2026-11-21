# Ghost Cut

Version 0.1.0-experimental · by @jacobphono · a draft: milestone A (the TAPE engine), rendered in dsp_host, not yet run on a unit or in the emulator.

## Overview

Ghost Cut is a microlooper for an audio track's FX2 slot. It always keeps the last 353 ms of the track. GRAB freezes a piece of that, 1/64 to 1/4 of a note at the project's tempo, and loops it in place of the track. Let go and the track fades back. RATE plays the loop from a quarter speed to almost four times, pitch and speed together, like tape. Lock GRAB in a scene and the crossfader grabs and releases the loop.

Signal path: the track's mono sum, (L + R) / 2, goes into a ring of 15,870 samples in the FX2 slot's own buffer. GRAB loops a stretch of the ring with a 256-sample crossfade over the seam, read with linear interpolation. While a loop plays (or fades out), the ring stops recording, so the loop and the 256 samples before it stay intact. The loop fades in and out over 256 samples, and MIX blends it over the dry track. Whenever no loop plays, the frames pass exactly as they came.

## Controls

| Page | Knob | Name | Range | Default | What it does |
| --- | --- | --- | --- | --- | --- |
| Main | A | LEN | 1/64, 1/32, 3/64, 1/16, 3/32, 1/8, 3/16, 1/4 | 1/16 | Loop length at the next GRAB, at the project's tempo. A length past 353 ms is halved until it fits (1/4 at 120 BPM loops 1/8), so it stays in time. |
| Main | B | GRAB | 0–127 | 0 | 96 or more grabs a loop, 32 or less lets it go; between them nothing changes. |
| Main | C | RATE | -64 to +63 | 0 | Speed and pitch together: 0 as played, -64 a quarter, +63 almost 4 x (an octave every 32 steps). FUNC + turn steps through -64, 0 and +63. |
| Main | F | MIX | 0–127 | 127 | The loop over the dry track. 0 is the dry track exactly, 127 the loop alone. |
| Setup | B | CAPT | AUTO, MAN, OFF | AUTO | What GRAB loops: the last LEN (AUTO); the next LEN (MAN: the track plays dry while it records, then the loop starts); or the ring as it was when CAPT went OFF (OFF stops recording). |
| Setup | E | DIR | FWD, REV, PEND | FWD | Forwards, backwards, or forwards then backwards (PEND turns round at each end, so it has no seam). |

Main knobs D and E and Setup knobs A, C, D and F are blank: they are kept for the later milestones (PTCH, DRFT, ENG, GRN, MOTN, FDBK).

## Usage

1. Select an audio track that plays something.
2. Hold FUNC and press FX2, turn LEVEL to GHOST CUT and press YES.
3. Press FX2 for the main page (LEN, GRAB, RATE, MIX); press FX2 again for SETUP (CAPT, DIR).

## Quick tutorial

1. Play a drum loop on the track. Leave LEN at 1/16 and turn GRAB past 96: the last sixteenth repeats. Turn GRAB under 32 and the drums come back.
2. Grab again and turn RATE down for a slowed, lower loop, or up for a faster, higher one. Set DIR to PEND on the SETUP page for a back-and-forth loop.
3. For the crossfader, hold scene B's key and turn GRAB to 127, and leave scene A's GRAB at 0. Slide across to grab, slide back to let go. GRAB locked on a trig grabs on that step.

## Timing

- LEN reads the project's tempo word (tempo24) every block, so a tempo change sets the length of the next GRAB. A loop that is already playing keeps its length.
- The loop starts at GRAB, which only changes at a knob event: a turn, a scene, the crossfader or a lock on a trig. It does not restart on the sequencer's steps. A loop is a whole number of samples (5,512 for 1/16 at 120 BPM, against an exact 5,512.5), so a held loop drifts by under a sample a repeat against the pattern.
- RATE changes glide over about 6 ms.
- Stop, play, a Part or pattern change don't touch the loop or the ring. They are runtime state, not saved with the project. Choosing the effect again clears the ring.

## Compatibility and limitations

- FX2 only. The ring takes 15,870 words of the FX2 slot's buffer and stops at +$3DFD, so Sidechain Compressor's key window on track 3 stays free. On an FX1-sized slot Ghost Cut passes the track dry.
- After the effect is chosen, the ring is cleared 128 words a block for 124 blocks (45 ms). The track passes dry meanwhile, and a grab before the ring has filled loops silence for the part never recorded.
- The loop is mono on both sides.
- At MIX 127 the loop is within 2 LSB of what was recorded (-138 dB): MIX times the full envelope is one step short of 1.
- RATE above 1 x has no anti-alias filter and reads with linear interpolation, so content high up aliases when sped up.
- The effect id (10) is refused beside Analog BD in card builds. USB sets have their own ids.
- Milestone A only: grain pitch (PTCH, GRN), the drifting second head (DRFT, MOTN), ENG and FDBK are not built.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: 67 render gates in dsp_host pass, bit-exact against the integer reference [ghost_cut_ref.py](ghost_cut_ref.py), and the static cost is 188 cycles a sample at worst (stock SPRING REV measures 257.5). Not run on a unit or in the emulator.

## Authorship and licences

Original code by @jacobphono under the MIT licence in [LICENSE](LICENSE). The table read `gcTB`, and the shape of the MIX run and of the FX1/FX2 decision, are adapted from Bryan T's VIBRATO (MIT; its notice is in LICENSE). The octabam SDK, schema and render harness are Sam Banks's. Techniques also learnt from Cam Jones's BBD Delay and Ilia Murzinov's STUTTR. No Elektron firmware, routines, tables or samples.

## Screens and audio

None yet.

## Develop

- Gates: from `sdk/octabam` with the native toolchain and your own OS 1.40C, `python3 -B modules/ghost-cut/verify.py` (the draft must be reachable as `modules/ghost-cut`).
- Hear it: `npm run module:dev -- ghost-cut` builds it and tries it on your unit over USB; `--emulator --socket SOCK` uses ot_emu's USB bench instead.
- Check it: `npm run module:doctor -- --draft ghost-cut`.
