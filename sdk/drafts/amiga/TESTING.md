# Amiga testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## Host (10 November 2026, source of this commit)

`python3 -B verify.py`: 49 checks pass. They cover the engine only:

- `amiga_crunch`: bypass at SRR 0 / BITS 16 / LED off, the word mask and rounding, full scale, the averaged hold at SRR 16 and 127, the same output when a buffer is split across calls, a garbage state, clamped controls, and the lowpass (flat at 800 Hz, about -3 dB at 3.3 kHz, about -12 dB at 6.6 kHz, stereo, full scale, silence).
- `amiga_stretch`, `amiga_blend` and `amiga_declick`, against a model reader: no restart and an untouched sample at speed 1 and pitch 0, a restart every cycle an octave up with the note keeping its length, half speed doubling it, speed 0 holding the first grain, looped notes wrapping, stock's own loop left alone, a cycle longer than the memory, and no step in the frames handed on where the restarts were.
- `amiga_strt` and `amiga_frame`: the STRT value for a frame and back, for samples from 200 frames to the longest.
- `amiga_percent`, `amiga_cycle`, `amiga_hz`, `amiga_rate` and `amiga_shift`: what STCH, CYL, RATE and PCH read and do, end to end of each range.
- `amiga_core.s` is what `amiga.c` generates.

## Against the Amigo plug-in (10 November 2026, host only)

The owner's installed Amigo 1.0.2 Audio Unit, hosted offline as a black box (no code or preset inspection beyond pointing its saved state at a test sample), against a host model of this draft: the engine above, a model reader and a linear-interpolation repitch standing in for the Octatrack's. One synthetic chord stab, 1.5 s.

| Clip | Amigo | Draft model | Note lasts (Amigo / model) | Energy by band, largest difference |
| --- | --- | --- | --- | --- |
| 8 bit at 22168 Hz, no stretch | S.RATE 22168 | RATE 22168, BITS 8 | 1.49 s / 1.49 s | 0.6 dB |
| Stretch to 200 % | LEN 200 %, CYL 1000 | STCH 200, CYL 1000 | 2.97 s / 2.99 s | 2.0 dB |
| Stretch to 400 % | LEN 400 % | STCH 400 | 5.92 s / 5.98 s | 2.4 dB |
| An octave up at the same length | LEN 200 %, PCH on | STCH 200, STR PCH | 1.48 s / 1.49 s | 8.2 dB less below 250 Hz, 1.5 dB above |

Bands: 0-250 Hz, 250 Hz-1 kHz, 1-4, 4-8, 8-11, 11-16 and 16-22 kHz, each against the clip's total. Both stretches put sidebands about 39 Hz apart around each partial. In the last clip the model has 8.2 dB less below 250 Hz, where such a sideband of the lowest partial (262 Hz) falls; why is not found. What the plug-in showed and the draft took over: the cycles are faded into each other, not cut, the default cycle of 1000 samples, the tracker note rates, the length in percent and the PCH mode. Not compared: by ear, on other material, or anything on the instrument. The Octatrack's repitch is not linear interpolation, so its aliasing will differ from the model's.

## Emulator

Not tested.

## On the unit

An earlier build (commit c5543f12, controls SPD, GRN and SRR, no PCH) ran as a 30-minute RAM trial on the owner's MKII on 10 November 2026, on development twin `9fb63bca` (main da373d10 plus the STATIC render entry of `improvement/static-machine-render`), package 6,656 bytes of code and data, 67,116 of bss:

- The trial ran 15 minutes with the loader reporting no refusal, until the owner ended it.
- Reported by the owner, who played it: everything worked. No list of what was tried; treat every item below as open.
- A first package with 16 KB of memory a voice (139 KB in all) was refused at verify as malformed (loader refusal 1): a module's image and bss may take 128 KiB.
- Ending the trial was refused as needs-recovery, and the unit then left USB; whether a track still named the machine was not read. The guide warns of exactly this (docs/OCTATRACK_DRIVING.md).

This build's controls have not run on a unit. Open, in this order:

- the machine list shows AMIGA, YES assigns it, and the Flex pool opens from its row;
- SRC shows STCH (percent, HOLD), CYL (samples) and RATE (Hz, FULL) on D, E and F, each readable in the knob's field; SRC SETUP shows LED as an OFF/ON switch, STR reading OFF, ON, PCH and BITS reading 4–16;
- RATE's value in the lane, with a lock and an LFO on it, stays 0–36 as the page counts it;
- PCH: STCH 200 sounds an octave up and 141 a tritone, at the note's own length (the shift assumes five SRC units of PTCH a semitone);
- the stretch: the reader restarts where the engine asks (it restarts a sounding note through stock's START with a moved STRT, as stock's retrig does, which nothing has shown to work yet), without a stuck or silent voice, at PTCH up and down, STCH 50, 200 and HOLD, CYL 100 and 4132;
- a stretched note ends at the sample's end, and a looped one wraps;
- STR on with STCH 100 and PTCH 0, RATE FULL, BITS 16, LED off plays as FLEX at the same level (`npm run fx:audit -- compare`);
- RATE, BITS and LED change the sound;
- a neighbouring Flex track with RTRG and RATE still retrigs and reverses;
- locks, LFOs and scenes on STCH, CYL and RATE;
- slices and loops on an Amiga track;
- Amiga to FLEX and back while playing; save and reload; the project without the module;
- Keep, Undo and removal;
- `npm run device -- guard` in a busy pattern with Amiga on all eight tracks, CYL 100 (the most restarts).

## Stock flows

Not tested.

## Performance

Not measured. A render call adds up to three passes over at most a frame's source samples, and each cycle two divisions and one call of stock's START. The eight voices' memories take 66 KB of RAM (the loader allows a module 128 KiB; 16 KB a voice was refused on the unit as malformed).
