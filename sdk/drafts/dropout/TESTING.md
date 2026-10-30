# DROPOUT testing

## Commands and exact revision

Source: this folder at the commit that adds it (branch `module/dropout`). Toolchain: octabam's vendored `dsp56300` at its pinned commit 8b731966 with `tools/patches/dsp56300.patch` (`npm run upstream:tools`, then octabam's `scripts/setup.sh` step 4), `dsp_asm` checked to emit the one-word displaced move (`0257de`).

```sh
python3 -B sdk/drafts/dropout/verify.py                     # the gates
npm run fx:audit -- plan out/fx
python3 -B sdk/drafts/dropout/verify.py --fx out/fx         # renders out/fx-renders at the audit settings
npm run fx:audit -- check out/fx out/fx-renders
```

`verify.py` assembles `dropout.asm` with `dsp_asm`, refuses a `rep`, a label that prefixes another, a second table literal and any multiply operand order outside the eight the chip encodes, disassembles the result and refuses an unsigned multiply, then runs the module in **fxhost** (`tools/fxhost.cpp`): the vendored dsp56kEmu with only this module's words and table loaded, called through octabam's recovered effect ABI (audio at X:0, `n7` frames, `r6` the parameter record, `r7` the state block, `X:$213` pointing at the allocator's buffer base, 16-frame blocks, trig splits on request). The buffer sits at Y:$1c00 (an FX1 slot, not 2K-aligned) or Y:$4000 (an FX2 slot), 2,048 words. Every X and Y word outside the audio block, the state block, the parameter record and that buffer holds a marker checked after every call; `init` is entered with `r1` set and must return it unchanged.

What fxhost cannot see: the dispatcher's real register state, the panel and its descriptor, the base's loader, the other tenants of the DSP, the chip's timing and anything audible on a unit. Nothing below is hardware evidence.

## Gates (fxhost, 30 Oct 2026)

```
PASS  assembles, no mpysu, no rep          363 program words + 387 table words
PASS  CHNC 0 is the dry, bit for bit       largest difference 0 LSB
PASS  DPTH 0 and TONE 0 change nothing     largest difference 0 LSB
PASS  CHNC 100, LEN 40                     23 dropouts, 26 ms long (want 27), 228 ms apart (want 208)
PASS  CHNC 120, LEN 70                     33 dropouts, 88 ms long (want 93), 89 ms apart (want 83)
PASS  GAP at DPTH 64 halves the level      level 0.5000 of the dry
PASS  HOLD loops 64 frames (SIZE 0)        11 held dropouts, largest repeat error 4 LSB
PASS  HOLD loops 400 frames (SIZE 48)      11 held dropouts, largest repeat error 5 LSB
PASS  HOLD loops 953 frames (SIZE 127)     11 held dropouts, largest repeat error 5 LSB
PASS  HOLD plays only what it recorded     peak -40.0 dBFS from a -40 dBFS input over a garbage buffer
PASS  CRSH holds 2 samples on 6 bits       122 dropouts, median hold 2, on the grid: True
PASS  CRSH holds 18 samples on 6 bits      46 dropouts, median hold 18, on the grid: True
PASS  TONE darkens a dropout               5 kHz -15.8 dB inside 11 dropouts
PASS  EDGE 0 ramps in 4 samples            median 4 samples from 90 % to 2 %
PASS  EDGE 127 ramps in 2205 samples       median 1942 samples from 90 % to 2 %
PASS  idle settles (MODE 0)                tail peak -118.5 dBFS
PASS  idle settles (MODE 1)                tail peak -118.5 dBFS
PASS  idle settles (MODE 2)                tail peak -118.5 dBFS
PASS  memory guard, every run              0 words written outside the state, audio and buffer
PASS  instructions per frame               2466 a 16-frame call, 154 a frame
all passed
```

What they pin: with CHNC 0 the output is the input bit for bit in every MODE, from a garbage state block and buffer, with and without a trig split; with DPTH 0 and TONE 0 dropouts come and go and change nothing; the dropouts' mean length against LEN's table (within 20 %) and their mean spacing against CHNC's chance (within 35 %, a random process over 6 s); GAP at DPTH 64 halves the level; HOLD's output inside a dropout repeats with the loop's period at SIZE 0, 48 and 127 (within 8 LSB: DPTH 127 is 1 - 2^-23, so a few LSB of the dry ride on the loop); HOLD over a garbage buffer never plays more than the quiet input it recorded; CRSH's values inside a dropout sit on the 6-bit grid and change every 2 + SIZE/4 samples; TONE 127 takes a 5 kHz tone 15.8 dB down inside dropouts; EDGE's ramp takes 4 samples at 0 and about 2,205 at 127 (measured 90 % to 2 %); after a burst, the last half second of three is under -90 dBFS in every MODE with dropouts running; the memory guard over every run.

## Sound quality

Between dropouts the effect is the identity, so fx:audit has nothing to measure there. Its nonlinear part is CRSH, a deliberate 6-bit sample-and-hold, and the dropouts themselves are deliberate discontinuities that the audit reads as residual. Rendered with CRSH dropouts as long and as close as they go (CHNC 127, LEN 127, DPTH 127, EDGE 0, SIZE 0), the audit reports what a bit crusher does:

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.0      -43.0     -30.2     -21.3    -115.1       0  FAIL
tone-1100hz-1db             -1.0      -55.4     -44.0     -22.0     -98.8       0  FAIL
tone-2701hz-12db           -12.1      -50.3     -29.7     -14.1     -91.6       0  FAIL
tone-2701hz-1db             -1.2      -59.6     -42.3     -14.2    -101.4       0  FAIL
tone-5301hz-12db           -12.6      -53.6     -28.9      -8.0    -138.9       0  FAIL
tone-5301hz-1db             -1.6      -59.5     -40.3      -8.0    -106.7       0  FAIL
tone-9102hz-12db           -13.9      -72.3     -28.2      -2.4    -115.9       0  FAIL
tone-9102hz-1db             -3.0      -78.5     -38.2      -2.4    -107.7       0  FAIL
idle                    after the input stops: digital silence  OK
```

That is the intended sound of CRSH (aliasing -28 to -44 dBc, the residual is the dropouts switching). DC stays under -91 dBFS, nothing reaches the rails, and after the input stops the output is digital silence. GAP and HOLD add no harmonics of their own; HOLD's loop seam and EDGE 0's 0.1 ms ramp are audible clicks by design.

## Stock flows

Not tested: nothing has run in a built image or on a unit. The module adds an effect to the chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 2,466 executed instructions for a 16-frame call at the dearest settings (HOLD, dropouts back to back, TONE 127), 154 a frame including the per-call setup. octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison.

## Resources

363 program words and one 387-word P table (P, L and E, 129 words each) per DSP core, from `dsp_asm`. 31 state words per instance in the instance's own r7 block (`$00`-`$1e`), all cleared by `init`. 2,048 words of the allocator's Y buffer (`Claims(stock_instance_buffer=True, buffer_words=2048)`), which fits an FX1 slot (3,072 words); no stock table, no absolute address but `X:$213`.

## Hardware

Untested.

## OT UI capture evidence

None: the effect has not run in a built image.
