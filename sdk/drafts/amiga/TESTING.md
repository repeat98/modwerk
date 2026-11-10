# Amiga testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## Host (10 November 2026, source of this commit)

`python3 -B verify.py`: 34 checks pass. They cover the engine only:

- `amiga_crunch`: bypass at SRR 0 / BITS 16 / LED off, the word mask and rounding, full scale, the unsmoothed hold at SRR 16 and 127, the same output when a buffer is split across calls, a garbage state, clamped controls, and the lowpass (flat at 800 Hz, about -3 dB at 3.3 kHz, about -12 dB at 6.6 kHz, stereo, full scale, silence).
- `amiga_stretch`, against a model reader: no restart at speed 1 and pitch 0, a restart every cycle an octave up with the note keeping its length, half speed doubling it, speed 0 holding the first grain, looped notes wrapping, and stock's own loop left alone.
- `amiga_strt`: the STRT value for a frame, for samples from 200 frames to the longest.
- `amiga_core.s` is what `amiga.c` generates.

## Emulator

Not tested.

## On the unit

Not tested. Open, in this order:

- the machine list shows AMIGA, YES assigns it, and the Flex pool opens from its row;
- SRC shows SPD, GRN and SRR on D, E and F; SRC SETUP shows LED and STR as OFF/ON switches and BITS reading 4–16;
- the stretch: the reader restarts where the engine asks (it restarts a sounding note through stock's START with a moved STRT, as stock's retrig does, which nothing has shown to work yet), without a stuck or silent voice, at PTCH up and down, SPD 0, 32 and 127, GRN 0 and 127;
- a stretched note ends at the sample's end, and a looped one wraps;
- STR on with SPD 64 and PTCH 0, SRR 0, BITS 16, LED off plays as FLEX at the same level (`npm run fx:audit -- compare`);
- SRR, BITS and LED change the sound;
- a neighbouring Flex track with RTRG and RATE still retrigs and reverses;
- locks, LFOs and scenes on SPD, GRN and SRR;
- slices and loops on an Amiga track;
- Amiga to FLEX and back while playing; save and reload; the project without the module;
- Keep, Undo and removal;
- `npm run device -- guard` in a busy pattern with Amiga on all eight tracks, GRN 0 (the most restarts).

## Stock flows

Not tested.

## Performance

Not measured. A render call adds one pass over at most a frame's source samples, and at each cycle's end one division and one call of stock's START.
