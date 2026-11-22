# Freeze testing

Only what was run and seen.

**Version 0.1.0.** Tested build: the engine and tests in commit `1d435dd80` (`freeze.c`, `freeze.h`,
`test_freeze.c`, `verify.py`), 22 November 2026, macOS host (Apple clang) and m68k-elf-gcc 16.2.0. Host
tests only. 0.1.0 has no USB package and has not run in `ot_emu` or on a unit: **not tested on hardware.**

## Host gate: `python3 -B sdk/drafts/freeze/verify.py`

Builds `test_freeze.c` (which includes `freeze.c`) with `-fsanitize=undefined,address -fno-sanitize-recover=all
-Werror`, runs it, then cross-compiles `freeze.c` with Tape Echo's ColdFire flags (`-mcpu=54454 -msoft-float -O3
-ffreestanding ...`) and refuses any undefined symbol. Result: **53 of 53 checks passed, no sanitizer report;
ColdFire object 6,242 bytes of text, no runtime-library calls.**

The harness models the adapter: a ring written 16 frames a block as the stock DMA does, and a sequencer whose tick
byte reaches 1 once per track step (the ticks per step of each track speed; swing delays the odd steps' tick).

| Test | Result |
| --- | --- |
| `lerp` and `mulq15` over INT32_MIN..INT32_MAX and every fraction edge (294 + 35 cases) | within 4 and 1 LSB, no UB |
| GRAB OFF, 20,000 blocks of noise | bit-exact dry; the ring receives the dry input |
| Period, low-passed noise, SPIN 0.5x: N = 1, 3, 5, 7, 8 at 120 BPM; 5 at 90 BPM; 5 at 2x and 3 at 1/2x track speed | each cycle against the next: correlation 1.000; at half the period 0.06 or less |
| A 5-step and a 7-step track at once, own state and ring | 7 and 5 cycles in 35 steps; both restart together there |
| SPIN 0, 64, 127 on 1 kHz | 250.6, 501.1, 999.6 Hz |
| JTR 127 on 1 kHz at 0.5x, 50 ms windows over 40 steps | 490.0-510.0 Hz; 10 cycles in 51 steps (period unchanged) |
| POSITION 0 vs 127 (input level encodes time) | 127 reads 2.87 s older audio |
| Full four-second history at 30 BPM, 8 steps, SPIN 0.25x, JTR 127, POSITION swept 0-127-0 | no read past the held history (deepest 84,298 of 176,272 frames); POSITION range 2.36 s; only held input levels heard |
| Swing 25 % of a step, N = 3 | 10 cycles in 30 steps |
| Tempo 120 to 90 while holding | next period 36,750 samples, as expected |
| Hold for 10 s (the write head laps the ring twice) | ring history bit-identical |
| Release, FADE 20 | back to bit-exact dry |
| GRAB on from entry | waits for 4,096 frames, then holds |
| STOP while holding | fades to dry |
| Dirty entry: state 0xa5, ring full of full-scale garbage, 0.5 s of history, DC 0.1 input | peak 0.137 (two equal heads in a seam: 0.1375); no garbage heard |
| 110 Hz sine through grab, seams, SPIN, POSITION and STEP moves, release, JTR 64 | largest sample step 0.0039 FS, the sine's own |

What these do not show: anything about the real sequencer bytes (the tick model is an assumption, see
DELAY_HOOK_PROPOSAL.md), the real ring or DMA, CPU time, or how it sounds. The audition render
(`verify.py --audition`) is synthetic: two copies of a synthetic pad, 5 and 7 steps, SPIN 0.5x, JTR 40.

A finding on the behavioural reference this brief came with (`polyspin_reference.py`, not in this repository): its
two heads half a period apart with sin² gains repeat every **half** period. Run on its own model, N = 5 at 120 BPM
gave correlation 1.000 at both P and P/2. Freeze repeats only at P.

## Sound quality

Not tested: no `npm run fx:audit` renders (aliasing, clipping, DC, mono sum, idle). They need the native
harness and a base with the hook. Known by design: linear interpolation loses top end at fractional SPIN, and the
seam lifts correlated audio up to 2.8 dB (README).

## On the unit

Not tested. Not runnable: no base carries the hook.

## Emulator

Not tested.

## Stock flows

Not tested.

## Performance

Not measured. No `evidence/performance.json` yet.
