# SHORTWAVE testing

## Commands and exact revision

Source: this folder at the commit that adds it (branch `module/shortwave`). Toolchain: octabam's vendored `dsp56300` at its pinned commit 8b731966 with `tools/patches/dsp56300.patch` (`npm run upstream:tools`, then octabam's `scripts/setup.sh` step 4), `dsp_asm` checked to emit the one-word displaced move (`0257de`).

```sh
python3 -B sdk/drafts/shortwave/verify.py                     # 21 gates
npm run fx:audit -- plan out/fx
python3 -B sdk/drafts/shortwave/verify.py --fx out/fx         # renders out/fx-renders at the audit settings
npm run fx:audit -- check out/fx out/fx-renders
```

`verify.py` assembles `shortwave.asm` with `dsp_asm`, refuses a `rep`, a label that prefixes another, a second table literal and any multiply operand order outside the eight the chip encodes, disassembles the result and refuses an unsigned multiply, then runs the module in **fxhost** (`tools/fxhost.cpp`): the vendored dsp56kEmu with only this module's words and table loaded, called through octabam's recovered effect ABI (audio at X:0, `n7` frames, `r6` the parameter record, `r7` the state block, 16-frame blocks, trig splits on request). Every X and Y word outside the audio block, the state block and the parameter record holds a marker that is checked after every call; `init` is entered with `r1` set and must return it unchanged.

What fxhost cannot see: the dispatcher's real register state, the panel and its descriptor, the base's loader, the other tenants of the DSP, the chip's timing and anything audible on a unit. Nothing below is hardware evidence.

## Gates (fxhost, 30 Oct 2026)

```
PASS  assembles, no mpysu, no rep        340 program words + 387 table words
PASS  guard (MIX 0, split 0)             
PASS  guard (MIX 0, split 5)             
PASS  guard (MIX 0, split 0)             
PASS  guard (MIX 0, split 5)             
PASS  MIX 0 is the dry, bit for bit      largest difference 0 LSB
PASS  silence stays silent (dirty state) peak 0 LSB
PASS  idle settles (BAND 0)              tail peak -200.0 dBFS
PASS  idle settles (BAND 127)            tail peak -200.0 dBFS
PASS  in-band level at DRIV 0            -0.34 dB against the dry
PASS  BAND narrows the receiver          4 kHz: -82.2 dBFS at 0, -17.1 at 127
PASS  whistle at TUNE 40                 184.0 Hz, want 184.4
PASS  whistle at TUNE 64                 461.4 Hz, want 461.3
PASS  whistle at TUNE 100                1825.6 Hz, want 1825.1
PASS  whistle level holds over 10 s      -25.01 dB then -25.01 dB
PASS  FADE moves the level               spread 0.00 dB at 0, 18.1 dB at 127
PASS  NOIS and CRAK sound                NOIS -26.6 dBFS, CRAK -48.2 dBFS
PASS  MIX moves without a step           largest step 0.0541
PASS  dearest settings stay bounded      peak -3.2 dBFS
PASS  instructions per frame             4140 a 16-frame call, 259 a frame
all passed
```

The gates, in order: MIX 0 is the dry bit for bit from a garbage state block (`-dirty`), with and without a trig split at frame 5, at the defaults and with every other knob at its end; the memory guard after every call; silence with the receiver's own noises off stays exact digital silence; after a burst through DRIV 127 the last half second of three is digital silence at BAND 0 and 127 (the filters carry their dropped bits forward, so no truncation DC is left); a 1 kHz tone comes out within 0.34 dB of the dry at DRIV 0; BAND 0 takes a 4 kHz tone 65 dB below BAND 127; the whistle's pitch at TUNE 40, 64 and 100 within 0.3 % of 40 Hz x 2^(7k/127), and its level unchanged over 10 s at the fastest step; FADE 127 moves an 800 Hz tone's short-time level over 18 dB, FADE 0 not at all; NOIS and CRAK sound on silence; a MIX jump 0 to 127 and back steps no more than the tone itself; the dearest settings stay inside full scale; the cost.

## Sound quality

`npm run fx:audit` on renders from fxhost. The audit renders the processing at its dearest (MIX 127, BAND 127) with the receiver's own generators off (TUNE, FADE, NOIS, CRAK, DRFT 0): they add noise, a tone and level movement on purpose, which the audit would read as aliasing and residual.

DRIV 0 (the receiver clean):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.3      -46.6     <-140    -125.0    -129.8       0  ok
tone-1100hz-1db             -3.1      -22.8     <-140    -135.4    -131.0       0  ok
tone-2701hz-12db           -12.7      -48.6    -139.9    -124.7    -129.8       0  ok
tone-2701hz-1db             -3.6      -24.6     <-140    -134.8    -131.1       0  ok
tone-5301hz-12db           -17.0      -56.3    -132.2    -120.3    -129.8       0  ok
tone-5301hz-1db             -7.0      -33.3    -139.9    -131.1    -130.5       0  ok
tone-9102hz-12db           -27.5      <-140     -72.1    -109.8    -129.7       0  ok
tone-9102hz-1db            -16.6      <-140     -50.0    -120.7    -129.8       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-9102hz-1db aliasing: -50.0 dBc (limit -60)
```

The one failure is a full-scale 9.1 kHz tone: its third harmonic folds to 16.8 kHz at -50 dBc, -67 dBFS absolute after the band limit took the tone itself down 16 dB.

DRIV 127 (the receiver overloaded, gain x8 into the clip):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db            -2.7      -20.3     <-140    -129.7    -126.3       0  ok
tone-1100hz-1db             -1.6      -10.2     -55.2     -82.2    -132.0       0  FAIL
tone-2701hz-12db            -3.2      -22.0     -73.6    -109.8    -126.7       0  ok
tone-2701hz-1db             -2.4      -13.6     -36.0     -71.0    -131.9       0  FAIL
tone-5301hz-12db            -6.3      -31.1    -135.3    -124.7    -124.5       0  ok
tone-5301hz-1db             -4.3      -18.2     -24.1     -75.8    -130.9       0  FAIL
tone-9102hz-12db           -15.7      <-140     -47.9    -113.4    -122.7       0  FAIL
tone-9102hz-1db             -7.8     -134.0     -23.8     -83.9    -127.3       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-1100hz-1db aliasing: -55.2 dBc (limit -60)
```

At full drive a loud tone is clipped hard, and the clip's harmonics alias (down to -18 dBc for a full-scale 5.3 kHz tone). The clip is worked at twice the rate (the midpoint and the sample, averaged), which took 5-8 dB off these figures, and a one-pole of the receiver's bandwidth follows it. DRIV is an overload control and this is intended; at -12 dBFS the overload stays under -60 dBc but for the 9.1 kHz tone. DC stays under -122 dBFS and nothing reaches the rails. After the input stops the output is digital silence.

## Stock flows

Not tested: nothing has run in a built image or on a unit. The module adds an effect to the chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 4,140 executed instructions for a 16-frame call at the dearest settings, 259 a frame including the per-call setup (`verify.py`'s last gate). octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison.

## Resources

340 program words and one 387-word P table (W, F and K, 129 words each) per DSP core, from `dsp_asm`. 45 state words per instance in the instance's own r7 block (`$00`-`$2c`), all cleared by `init`. No allocator buffer, no Y memory, no stock table, no absolute address.

## Hardware

Untested.

## OT UI capture evidence

None: the effect has not run in a built image.
