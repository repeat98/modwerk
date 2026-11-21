# Ghost Cut

Version 0.1.0-experimental · by @jacobphono · a draft: milestones A to C (the TAPE and GRAIN engines and the drift head), rendered in dsp_host. A private RAM trial ran on an Octatrack; full unit qualification and an emulator track run are still pending.

## Overview

Ghost Cut is a microlooper for an audio track's FX2 slot. It always keeps the last 353 ms of the track. GRAB freezes a piece of that, 1/64 to 1/4 of a note at the project's tempo, and loops it in place of the track. Let go and the track fades back. On the TAPE engine, RATE plays the loop from a quarter speed to almost four times, pitch and speed together, like tape. On the GRAIN engine, RATE only sets the speed, and PTCH sets the pitch on its own, up to two octaves either way. DRFT adds a second read head that drifts against the first over bars, so the loop phases against itself. Lock GRAB in a scene and the crossfader grabs and releases the loop.

Signal path: the track's mono sum, (L + R) / 2, goes into a ring of 15,870 samples in the FX2 slot's own buffer. GRAB loops a stretch of the ring. First it bakes a 256-sample crossfade over the seam into the ring: eight blocks (2.9 ms), with the track dry meanwhile, then the loop starts where it would be had it played since GRAB. Reads use linear interpolation. GRAIN moves a playhead through the loop at RATE. Two grains, GRN long and half a grain apart, each start at the playhead and read at PTCH's speed. Their triangular windows add up to one. While a loop plays (or fades out), the ring stops recording, so the loop and the 256 samples before it stay intact. The loop fades in and out over 256 samples, and MIX blends it over the dry track. Whenever no loop plays, the frames pass exactly as they came.

## Controls

| Page | Knob | Name | Range | Default | What it does |
| --- | --- | --- | --- | --- | --- |
| Main | A | LEN | 1/64, 1/32, 3/64, 1/16, 3/32, 1/8, 3/16, 1/4 | 1/16 | Loop length at the next GRAB, at the project's tempo. A length past 353 ms is halved until it fits (1/4 at 120 BPM loops 1/8), so it stays in time. |
| Main | B | GRAB | 0–127 | 0 | 96 or more grabs a loop, 32 or less lets it go; between them nothing changes. |
| Main | C | RATE | -64 to +63 | 0 | Speed: 0 as played, -64 a quarter, +63 almost 4 x (an octave every 32 steps). On TAPE the pitch follows it; on GRAIN it stretches time instead. FUNC + turn steps through -64, 0 and +63. |
| Main | D | PTCH | -24 to +24 (drawn -64 to +63) | 0 | GRAIN's pitch, a semitone a step; past ±24 it holds there. An LFO glides between semitones. TAPE ignores it. |
| Main | E | DRFT | 0–127 | 0 | A second read head, up to half the loop after the first at 127, swinging as a triangle over MOTN. On TAPE the first head plays left and the second right; on GRAIN the second grain reads at it. 0 is one head. |
| Main | F | MIX | 0–127 | 127 | The loop over the dry track. 0 is the dry track exactly, 127 the loop alone. |
| Setup | A | ENG | TAPE, GRAIN | TAPE | TAPE: pitch follows RATE. GRAIN: pitch from PTCH, speed from RATE. Changed while a loop plays, the loop ducks out (256 samples), swaps engine and fades back in. |
| Setup | B | CAPT | AUTO, MAN, OFF | AUTO | What GRAB loops: the last LEN (AUTO); the next LEN (MAN: the track plays dry while it records, then the loop starts); or the ring as it was when CAPT went OFF (OFF stops recording). |
| Setup | C | GRN | 0–127 | 40 | GRAIN's grain length, 10 ms at 0 to 79 ms at 127 (32 ms at 40), at most a quarter of the loop. TAPE ignores it. |
| Setup | D | MOTN | 1/4B, 1/2B, 1B, 2B, 4B, 8B, 16B, 32B | 4B | How slowly DRFT swings: one triangle over that many bars at the project's tempo, from no offset at each GRAB. |
| Setup | E | DIR | FWD, REV, PEND | FWD | Forwards, backwards, or forwards then backwards (PEND turns round at each end, so it has no seam). |

Setup knob F (FDBK in the plan) is blank: feedback into the loop is not built.

On a private draft package, ENG may show numbers rather than the engine names: 0 is TAPE and 1 is GRAIN. DRFT is the separate drift-head control on the main page.

## Usage

1. Select an audio track that plays something.
2. Hold FUNC and press FX2, turn LEVEL to GHOST CUT and press YES.
3. Press FX2 for the main page (LEN, GRAB, RATE, MIX); press FX2 again for SETUP (CAPT, DIR).

## Quick tutorial

1. Play a drum loop on the track. Leave LEN at 1/16 and turn GRAB past 96: the last sixteenth repeats. Turn GRAB under 32 and the drums come back.
2. Grab again and turn RATE down for a slowed, lower loop, or up for a faster, higher one. Set DIR to PEND on the SETUP page for a back-and-forth loop.
3. Set ENG to GRAIN on the SETUP page. Now RATE only changes the speed: turn it down for a time-stretched loop at the same pitch. PTCH +12 plays it an octave up at the same speed.
4. Back on TAPE, turn DRFT to 40 and set MOTN to 8B on the SETUP page: the right side slowly slides away from the left and back over eight bars.
5. For the crossfader, hold scene B's key and turn GRAB to 127, and leave scene A's GRAB at 0. Slide across to grab, slide back to let go. GRAB locked on a trig grabs on that step.

## Timing

- LEN reads the project's tempo word (tempo24) every block, so a tempo change sets the length of the next GRAB. A loop that is already playing keeps its length.
- The loop starts at GRAB, which only changes at a knob event: a turn, a scene, the crossfader or a lock on a trig. It does not restart on the sequencer's steps. A loop is a whole number of samples (5,512 for 1/16 at 120 BPM, against an exact 5,512.5), so a held loop drifts by under a sample a repeat against the pattern.
- RATE changes glide over about 6 ms.
- Stop, play, a Part or pattern change don't touch the loop or the ring. They are runtime state, not saved with the project. Choosing the effect again clears the ring.

## Compatibility and limitations

- FX2 only. The ring takes 15,870 words of the FX2 slot's buffer and stops at +$3DFD, so Sidechain Compressor's key window on track 3 stays free. On an FX1-sized slot Ghost Cut passes the track dry.
- After the effect is chosen, the ring is cleared 128 words a block for 124 blocks (45 ms). The track passes dry meanwhile, and a grab before the ring has filled loops silence for the part never recorded.
- The loop is mono: one wet on both sides, except TAPE with DRFT, which plays its two heads left and right.
- The seam is baked into the ring. The loop's last 256 samples are blended toward the 256 before it, so near its end PEND turns round on that blend. With CAPT OFF, grabbing the same stretch again blends that tail a second time.
- After a GRAB the track stays dry for 2.9 ms while the seam is baked. The loop then starts 112 samples in, so it stays where it would be had it played since GRAB, and the 256-sample fade-in covers the start.
- At MIX 127 the loop is within 2 LSB of what was recorded (-138 dB): MIX times the full envelope is one step short of 1.
- RATE above 1 x has no anti-alias filter and reads with linear interpolation, so content high up aliases when sped up.
- The effect id (10) is refused beside Analog BD in card builds. USB sets have their own ids.
- GRAIN's two grains have triangular windows. Steady sounds keep their pitch, but drums smear a little and a slight flutter at the grain rate can be heard; GRN changes the balance.
- GRAIN costs 281 cycles a sample at worst (about 1.09 times stock SPRING REV's 257.5), TAPE 188.
- FDBK is not built. Writing the loop back into itself would undo the baked seam every pass, so it needs a design of its own.
- MOTN's triangle runs from GRAB on and does not follow PLAY or the pattern's position. A fast, deep drift also bends the right side's pitch while it moves, like a tape head sliding.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: 115 render gates in dsp_host pass, bit-exact against the integer reference [ghost_cut_ref.py](ghost_cut_ref.py). The static cost is 188 cycles a sample at worst on TAPE and 281 on GRAIN, both with the drift head (stock SPRING REV measures 257.5). Private RAM trials installed and rolled back on a unit; the developer reported that GHOST CUT appeared in FX2 and that GRAB and RATE worked in TAPE. Full hardware qualification remains open.

## Authorship and licences

Original code by @jacobphono under the MIT licence in [LICENSE](LICENSE). The table read `gcTB`, and the shape of the MIX run and of the FX1/FX2 decision, are adapted from Bryan T's VIBRATO (MIT; its notice is in LICENSE). The octabam SDK, schema and render harness are Sam Banks's. Techniques also learnt from Cam Jones's BBD Delay and Ilia Murzinov's STUTTR. No Elektron firmware, routines, tables or samples.

## Screens and audio

None yet.

## Develop

- Gates: from `sdk/octabam` with the native toolchain and your own OS 1.40C, `python3 -B modules/ghost-cut/verify.py` (the draft must be reachable as `modules/ghost-cut`).
- Hear it: `npm run module:dev -- ghost-cut` builds it and tries it on your unit over USB; `--emulator --socket SOCK` uses ot_emu's USB bench instead.
- Check it: `npm run module:doctor -- --draft ghost-cut`.
