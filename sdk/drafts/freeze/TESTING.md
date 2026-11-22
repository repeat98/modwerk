# Freeze testing

Only what was run and seen.

**Version 0.1.0.** Tested build: the engine, header and tests in commit `8288f2b56`, with the unchanged
`verify.py` from `1d435dd80`, 22 November 2026, macOS host (Apple clang) and m68k-elf-gcc 16.2.0. Host
tests only. 0.1.0 has no USB package and has not run in `ot_emu` or on a unit: **not tested on hardware.**

## Host gate: `python3 -B sdk/drafts/freeze/verify.py`

Builds `test_freeze.c` (which includes `freeze.c`) with `-fsanitize=undefined,address -fno-sanitize-recover=all
-Werror`, runs it, then cross-compiles `freeze.c` with Tape Echo's ColdFire flags (`-mcpu=54454 -msoft-float -O3
-ffreestanding ...`) and refuses any undefined symbol. Result: **65 of 65 checks passed, no sanitizer report;
ColdFire object 6,116 bytes of text, no runtime-library calls.**

The harness models the adapter: a ring written 16 frames a block as the stock DMA does, and a sequencer whose tick
byte reaches 1 once per track step (the ticks per step of each track speed; swing delays the odd steps' tick).

| Test | Result |
| --- | --- |
| `lerp` and `mulq15` over INT32_MIN..INT32_MAX and every fraction edge (294 + 35 cases) | within 4 and 1 LSB, no UB |
| GRAB OFF, 20,000 blocks of noise | bit-exact dry; the ring receives the dry input |
| Period, low-passed noise, SPIN 0.5x: N = 1, 3, 5, 7, 8 at 120 BPM; 5 at 90 BPM; 5 at 2x and 3 at 1/2x track speed | each cycle against the next: correlation 1.000; at half the period 0.06 or less |
| A 5-step and a 7-step track at once, own state and ring | 7 and 5 cycles in 35 steps; both restart together there |
| STEP 5 to 2 after the first held step | first cycle ends at step 5; the next ends at step 7 (2 more steps) |
| STEP 2 to 5 after the first held step | first cycle ends at step 2; the next ends at step 7 (5 more steps) |
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
| Dirty entry: state 0xa5, ring full of full-scale garbage, 0.5 s of history, DC 0.1 input | peak 0.137 (two equal heads in a seam: 0.1375); no garbage reached the output |
| 110 Hz sine through grab, seams, SPIN, POSITION and STEP moves, release, JTR 64 | largest sample step 0.0039 FS, the sine's own |

What these do not show: anything about the real sequencer bytes (the tick model is an assumption, see
DELAY_HOOK_PROPOSAL.md), the real ring or DMA, CPU time, or how it sounds. The audition render
(`verify.py --audition`) is synthetic: two copies of a synthetic pad, 5 and 7 steps, SPIN 0.5x, JTR 40.

A finding on the behavioural reference this brief came with (`polyspin_reference.py`, not in this repository): its
two heads half a period apart with sin² gains repeat every **half** period. Run on its own model, N = 5 at 120 BPM
gave correlation 1.000 at both P and P/2. Freeze repeats only at P.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| STEP 5 to 2 after the first held step | The live knob used to end a five-step cycle at step two, before its planned seam. | `test_step_change(5, 2)` in the sanitized host gate; inspect both cycle boundaries and the new latched period. | **Pass, host:** boundaries at steps 5 and 7; the two-step setting applies only to the second cycle. |
| STEP 2 to 5 after the first held step | The live knob used to extend the current cycle beyond its planned seam. | `test_step_change(2, 5)` in the same gate. | **Pass, host:** boundaries at steps 2 and 7; the five-step setting applies only to the second cycle. |
| Short and long cycles, track speed and tempo | A changed length can exhaust the held ring or drift off the track grid. | Host period tests at 1, 3, 5, 7 and 8 steps, 90/120 BPM and 2x/0.5x track speed; full-ring test at 30 BPM. | **Pass, host:** consecutive cycles correlate at 1.000; the full-ring test stays in bounds. |
| STEP change with the real sequencer, swing and live tempo | The host fixture models the tick byte and swing; it cannot prove when the unit emits them. | After a shared delay hook and Freeze adapter exist, inspect the tick at the seam in `ot_emu`, then change STEP during a held loop on the unit at swung and changed tempo. | **Not run:** the base has no shared delay hook; there is no runnable Freeze package. |
| Two FX2 instances on opposite DSP cores beside stock effects and Tape Echo | State and the per-track ring must stay separate, while the stock site belongs to Tape Echo today. | Host test with simultaneous five- and seven-step instances; later use the shared hook for a unit trial on two tracks and check stock flows. | **Pass, host:** 7 and 5 cycles in 35 steps. **Not run on unit:** hook and adapter are absent. |
| GRAB release, STOP/PLAY, Part/project reload, Undo and power cycle | Runtime loop state and the base's package lifecycle may differ from the fixture. | Host release and STOP tests; after a package exists, run the test procedure and check the unit's actual playback and restoration. | **Pass, host:** release returns to exact dry and STOP fades out. **Not run on unit:** no package; Part/project, Undo and power cycle remain untested. |
| Maximum CPU load and real delay-ring bounds | Two read heads and ring preservation add work in the frame interrupt. | Host full-ring bounds test; later measure CPU and both cores on the unit at maximum modulation and two instances. | **Pass, host:** held-ring reads stay in bounds. **Not run on unit:** no adapter or CPU measurement. |

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
