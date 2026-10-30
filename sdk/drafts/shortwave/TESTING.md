# SHORTWAVE testing

## Commands and exact revision

Source: this folder at the commit that adds MODE and the SSB detector (0.2.0-experimental, branch `module/shortwave`; `octamod.module.json` names it). Toolchain: octabam's vendored `dsp56300` at its pinned commit 8b731966 with `tools/patches/dsp56300.patch` (`npm run upstream:tools`, then octabam's `scripts/setup.sh` step 4), `dsp_asm` checked to emit the one-word displaced move (`0257de`).

```sh
python3 -B sdk/drafts/shortwave/verify.py                     # 33 gates, about 3 minutes
npm run fx:audit -- plan out/fx
python3 -B sdk/drafts/shortwave/verify.py --fx out/fx --audit-mode am --audit-driv 0     # renders out/fx-renders
npm run fx:audit -- check out/fx out/fx-renders
# and again with --audit-driv 127, and with --audit-mode usb at DRIV 0 and 127 (a fresh plan folder each time)
```

`verify.py` assembles `shortwave.asm` with `dsp_asm`, refuses a `rep`, a label that prefixes another, a second table literal and any multiply operand order outside the eight the chip encodes, disassembles the result and refuses an unsigned multiply, then runs the module in **fxhost** (`tools/fxhost.cpp`): the vendored dsp56kEmu with only this module's words and table loaded, called through octabam's recovered effect ABI (audio at X:0, `n7` frames, `r6` the parameter record, `r7` the state block, 16-frame blocks, trig splits on request). Every X and Y word outside the audio block, the state block and the parameter record holds a marker that is checked after every call; `init` is entered with `r1` set and must return it unchanged.

What fxhost cannot see: the dispatcher's real register state, the panel and its descriptor, the base's loader, the other tenants of the DSP, the chip's timing and anything audible on a unit. Nothing below is hardware evidence.

## Gates (fxhost, 30 Oct 2026)

```
PASS  assembles, no mpysu, no rep        487 program words + 522 table words
PASS  guard (MIX 0, split 0)             
PASS  guard (MIX 0, split 5)             
PASS  guard (MIX 0, split 0)             
PASS  guard (MIX 0, split 5)             
PASS  guard (MIX 0, split 0)             
PASS  guard (MIX 0, split 5)             
PASS  MIX 0 is the dry, bit for bit      largest difference 0 LSB
PASS  silence stays silent (AM, dirty)   peak 0 LSB
PASS  silence stays silent (USB, dirty)  peak 0 LSB
PASS  silence stays silent (LSB, dirty)  peak 0 LSB
PASS  idle settles (BAND 0)              tail peak -200.0 dBFS
PASS  idle settles (BAND 127)            tail peak -200.0 dBFS
PASS  idle settles (USB, BAND 127)       tail peak -200.0 dBFS
PASS  idle settles (LSB, BAND 0)         tail peak -200.0 dBFS
PASS  in-band level at DRIV 0            -0.34 dB against the dry
PASS  BAND narrows the receiver          4 kHz: -82.2 dBFS at 0, -17.1 at 127
PASS  whistle at TUNE 40                 184.0 Hz, want 184.4
PASS  whistle at TUNE 64                 461.4 Hz, want 461.3
PASS  whistle at TUNE 100                1825.6 Hz, want 1825.1
PASS  whistle level holds over 10 s      -25.49 dB then -25.49 dB
PASS  allpass pair (table words)         image -49.3 dB at 300 Hz-3 kHz, -49.2 dB at 170 Hz-4.3 kHz
PASS  shift, USB                         TUNE 48/90/127: +71.4/+71.4 +251.1/+251.1 +500.0/+500.0 Hz (got/want), worst 0.022 %
PASS  shift, LSB                         TUNE 48/90/127: -71.4/-71.4 -251.1/-251.1 -500.0/-500.0 Hz (got/want), worst 0.006 %
PASS  other sideband, 300 Hz-3 kHz       worst -50.5 dB; 300U -79, 300L -79, 500U -52, 500L -53, 1000U -51, 1000L -51, 2000U -50, 2000L -50, 3000U -51, 3000L -51
PASS  SSB keeps the level                -0.00 dB, the detector's gain
PASS  oscillator level holds (renormalised) +0.00 dB after the TUNE jumps against a fresh start
PASS  MODE moves without a step          largest step 0.0347
PASS  FADE moves the level               spread 0.00 dB at 0, 18.1 dB at 127
PASS  NOIS and CRAK sound                NOIS -26.6 dBFS, CRAK -48.2 dBFS
PASS  MIX moves without a step           largest step 0.0541
PASS  dearest settings stay bounded      peak -3.4 dBFS
PASS  instructions per frame             4906 a 16-frame call, 307 a frame (stock SPRING REV: 314 in octabam's benchmark)
all passed
```

The gates, in order: MIX 0 is the dry bit for bit from a garbage state block (`-dirty`), with and without a trig split at frame 5, at the defaults and with every other knob at its end in AM and in LSB; the memory guard after every call; silence with the receiver's own noises off stays exact digital silence in AM, USB (DRFT 127) and LSB, from garbage state; after a burst through DRIV 127 the last half second of three is digital silence at BAND 0 and 127 in AM, in USB and in LSB; a 1 kHz tone comes out within 0.34 dB of the dry at DRIV 0; BAND 0 takes a 4 kHz tone 65 dB below BAND 127; the whistle's pitch at TUNE 40, 64 and 100 within 0.3 % of 40 Hz x 2^(7k/127), and its level unchanged over 10 s at the fastest step.

The SSB gates:

- **allpass pair (table words)**: the phase difference of the two chains, computed from the 24-bit coefficients the build loads, against -90 degrees; the other sideband it leaves is tan(error/2): -49.3 dB at worst over 300 Hz-3 kHz and over 170 Hz-4.3 kHz.
- **shift, USB / LSB**: a 1 kHz tone at -20 dBFS, TUNE 48, 90 and 127, in USB and LSB; the output's strongest component (Hann, parabolic peak) minus 1 kHz against 500 x (k/127)^2 Hz: within 0.022 % (the gate allows 1 %), up in USB and down in LSB.
- **other sideband**: tones at 300, 500, 1000, 2000 and 3000 Hz, TUNE 90 (251 Hz), USB and LSB; the level at the image frequency against the wanted one (Hann-windowed DTFT at each exact frequency), each corrected by the receiver's own gain at the two output frequencies after the detector (measured in AM, less the analytic 150 Hz high-pass that sits before the detector). -50.5 dB at worst; the analytic figures at those five frequencies are -81, -52, -51, -50 and -51 dB, so the measurement is the pair's own.
- **SSB keeps the level**: the detector's gain (the shifted tone against the input, less the high-pass at 1 kHz and the path after the detector at 1127 Hz) is 0.00 dB.
- **oscillator level holds**: one second of TUNE jumps (127, 3, 77, 20 every 7 blocks) with DRFT 127 in AM, then USB at TUNE 64: the shifted tone's level matches a fresh start within 0.00 dB. A control build with the per-call renormalisation removed reads +0.46 dB here (the gate allows 0.2), so the gate sees it.
- **MODE moves without a step**: MODE AM -> USB -> AM on a tone at TUNE 0 steps no more than the tone itself.

Then: FADE 127 moves an 800 Hz tone's short-time level over 18 dB, FADE 0 not at all; NOIS and CRAK sound on silence; a MIX jump 0 to 127 and back steps no more than the tone itself; the dearest settings (now with MODE at LSB) stay inside full scale; the cost.

**A fix on the way.** The first run of these gates left an 8 LSB DC (-120 dBFS) after the idle burst in every MODE. The state-variable low-pass has a fixed point on an exactly silent input: low = -1 LSB, band = 0, with low's dropped bits r > 0, because band's input x - low - band was formed from the low accumulator (-1 + r) and truncates to 0. The 0.1.0 draft escaped it only because the high-pass's own dropped bits reached the low-pass's input; the detector's blend now hands the low-pass a whole word. The difference is now formed from low as stored, which costs one instruction; the idle gates read digital silence again. Swapping the detector's dropped bits from `b0` through r1/r2 to `a0` at displaced addresses (lofi2's hardware-proven form) gave bit-identical output on three dirty-state renders in AM, USB and LSB.

## Sound quality

`npm run fx:audit` on renders from fxhost (30 Oct 2026, the same arithmetic as the committed source: the `a0` swap above renders bit for bit the same). The audit renders the processing at its dearest (MIX 127, BAND 127) with the receiver's own generators off (TUNE, FADE, NOIS, CRAK, DRFT 0): they add noise, a tone and level movement on purpose, which the audit would read as aliasing and residual. The SSB detector is audited in tune (USB, TUNE 0: the allpass pair, the oscillator stopped and the blend), because a shifted tone is not a harmonic of the input and the audit would read it all as residual; the shift itself is pinned by the gates above.

AM, DRIV 0 (the receiver clean):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.3      -46.6     <-140    -125.1    -133.6       0  ok
tone-1100hz-1db             -3.1      -22.8     <-140    -135.3    -133.6       0  ok
tone-2701hz-12db           -12.7      -48.6    -139.9    -124.6    -133.6       0  ok
tone-2701hz-1db             -3.6      -24.6     <-140    -135.0    -133.6       0  ok
tone-5301hz-12db           -17.0      -56.3    -132.0    -120.4    -133.6       0  ok
tone-5301hz-1db             -7.0      -33.3    -140.0    -131.0    -133.6       0  ok
tone-9102hz-12db           -27.5      <-140     -72.1    -109.9    -133.6       0  ok
tone-9102hz-1db            -16.6      <-140     -50.0    -120.7    -133.6       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-9102hz-1db aliasing: -50.0 dBc (limit -60)
```

USB in tune, DRIV 0:

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.3      -46.6    -138.2    -123.3    -127.1       0  ok
tone-1100hz-1db             -3.1      -22.8     <-140    -134.0    -129.0       0  ok
tone-2701hz-12db           -12.7      -48.6    -136.8    -123.0    -127.2       0  ok
tone-2701hz-1db             -3.6      -24.6     <-140    -133.7    -129.2       0  ok
tone-5301hz-12db           -17.0      -56.3    -129.9    -118.6    -127.1       0  ok
tone-5301hz-1db             -7.0      -33.3    -138.0    -129.7    -128.2       0  ok
tone-9102hz-12db           -27.5      <-140     -72.1    -108.1    -127.0       0  ok
tone-9102hz-1db            -16.6      <-140     -50.0    -119.0    -127.2       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-9102hz-1db aliasing: -50.0 dBc (limit -60)
```

The one failure in both is a full-scale 9.1 kHz tone: its third harmonic folds to 16.8 kHz at -50 dBc, -67 dBFS absolute after the band limit took the tone itself down 16 dB. The detector adds no harmonics or aliasing of its own (the columns match AM's); its residual is 1-2 dB higher and DC stays under -127 dBFS.

AM, DRIV 127 (the receiver overloaded, gain x8 into the clip):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db            -2.7      -20.3     <-140    -129.6    -132.2       0  ok
tone-1100hz-1db             -1.6      -10.2     -55.2     -82.2    -134.3       0  FAIL
tone-2701hz-12db            -3.2      -22.0     -73.6    -109.8    -132.4       0  ok
tone-2701hz-1db             -2.4      -13.6     -36.0     -71.0    -134.0       0  FAIL
tone-5301hz-12db            -6.3      -31.1    -135.4    -124.8    -131.7       0  ok
tone-5301hz-1db             -4.3      -18.2     -24.1     -75.8    -133.5       0  FAIL
tone-9102hz-12db           -15.7      <-140     -47.9    -113.3    -131.1       0  FAIL
tone-9102hz-1db             -7.8      <-140     -23.8     -83.9    -132.1       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-1100hz-1db aliasing: -55.2 dBc (limit -60)
  tone-2701hz-1db aliasing: -36.0 dBc (limit -60)
  tone-5301hz-1db aliasing: -24.1 dBc (limit -60)
  tone-9102hz-12db aliasing: -47.9 dBc (limit -60)
  tone-9102hz-1db aliasing: -23.8 dBc (limit -60)
```

USB in tune, DRIV 127:

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db            -2.7      -20.3    -138.5    -126.8    -122.8       0  ok
tone-1100hz-1db             -1.6      -10.2     -55.2     -82.2    -130.1       0  FAIL
tone-2701hz-12db            -3.2      -22.0     -73.6    -109.7    -123.2       0  ok
tone-2701hz-1db             -2.4      -13.6     -36.0     -71.0    -130.2       0  FAIL
tone-5301hz-12db            -6.3      -31.1    -132.7    -121.8    -120.6       0  ok
tone-5301hz-1db             -4.3      -18.2     -24.1     -75.8    -128.9       0  FAIL
tone-9102hz-12db           -15.7      <-140     -47.9    -110.2    -118.6       0  FAIL
tone-9102hz-1db             -7.8     -128.5     -23.8     -83.9    -124.2       0  FAIL
idle                    after the input stops: digital silence  OK
  tone-1100hz-1db aliasing: -55.2 dBc (limit -60)
  tone-2701hz-1db aliasing: -36.0 dBc (limit -60)
  tone-5301hz-1db aliasing: -24.1 dBc (limit -60)
  tone-9102hz-12db aliasing: -47.9 dBc (limit -60)
  tone-9102hz-1db aliasing: -23.8 dBc (limit -60)
```

At full drive a loud tone is clipped hard, and the clip's harmonics alias (up to -24 dBc for a full-scale 5.3 kHz or 9.1 kHz tone). The clip is worked at twice the rate (the midpoint and the sample, averaged), which took 5-8 dB off these figures, and a one-pole of the receiver's bandwidth follows it. DRIV is an overload control and this is intended; at -12 dBFS the overload stays under -60 dBc but for the 9.1 kHz tone. DC stays under -118 dBFS and nothing reaches the rails. After the input stops the output is digital silence in both modes. The audit's limits are its defaults; nothing was changed.

What the audit does not cover: the detector with a shift (by design, above), the static, crackle, whistle and fading, and LSB (the same chains and the oscillator run backwards; the LSB gates cover its shift, image, silence and idle).

## Independent review

0.2.0: a second agent reviewed the SSB detector, the allpass chains, the oscillator's level correction, the MODE crossfade and the rewritten glides, read-only, on 30 Oct 2026, and found nothing serious. It recomputed the Hilbert pair from the manifest (Q lags I by 90° ± 0.4° from 170 Hz to 4.3 kHz; USB shifts up and LSB down), checked the allpass form against H = (a + z⁻¹)/(1 + az⁻¹) and its state and error-feedback slots, the oscillator's invariant and the half Newton step (exactly 0 at init), and every glide store. Two nits, left as they are: `mac -y0,y0,a` (the level correction) has no module precedent, though bd909's `mpy y0,y0,a` uses the same operand field and the sign is the instruction's own bit; and the 150 Hz high-pass's input `y + x - x[n-1]` limits (the move to x1 saturates, it does not wrap) on a near-full-scale sum.

0.1.0: a second agent, without the author's reasoning, read the 0.1.0 source against octabam's trap list (30 Oct 2026): no condition-code, extension-byte, a0-remainder, Tcc-source, multiply-order, `lua`, label or init-clear defect, no write outside the state block, the audio block and the declared buffer, and the table literal once. Forms that carry hardware risk because no module proven on hardware uses them yet (their only precedents are RENDER-proven modules): the one-word displaced load into a0 and b0 (`move x:(r7+$nn),b0`, the error-feedback words; airwindows-chorus has the b0 form, lofi2 the a0 one on hardware). Every other form has a site in a module that has run on a unit. To be cleared on hardware or against the stock payload's disassembly.

0.2.0's new forms, by precedent (not reviewed independently): `move x:(r7+$nn),a0` / `move a0,x:(r7+$nn)` (the detector's dropped bits; lofi2 on hardware), `move p:(r5)+,y1` (lofi2 has `p:(r5)+,y0`), `mpy y0,x0,a x:(r4)+,x1` and `mac y1,x1,a x:(r4)+,x0` (the glides; lofi2's Hilbert sections use the same ALU-plus-X-load class), `mac -x0,y1,a x1,x:(r2)+` (lofi2 has `sub x0,a x1,x:(r2)-`, the same ALU-plus-X-store class), `tgt x1,a` (no precedent checked; the draft already used `tge` and `tlt`), `move x:(r7+$3e),r5` (the two-word form the draft already used for `$b`). Every multiply is one of the eight encodable orders and the disassembly holds no unsigned multiply (`verify.py`'s first gate). The glides were rewritten from current + (target - current)/32 to 31/32 current + target/32: both are exact in the accumulator and floor on the store, so they agree bit for bit (MIX 0 and every glide gate unchanged), and the loop costs 3 instructions a glide instead of 7.

## Untested

- Anything on a unit, under the ColdFire port or in a built image: the panel drawing MODE as a three-way select on slot 6 and DRIV on slot 7's companion field, the FUNC+turn behaviour of both, locks and LFOs on MODE, saving and reloading a project.
- The SSB detector on program material by ear: the gates use tones.
- The image below 170 Hz and above 4.3 kHz (outside the pair's design band), and the shift's accuracy with DRFT on (it is meant to wander).
- The MODE crossfade by ear: the gate bounds the largest step only.

## Stock flows

Not tested: the developer's report (Hardware) does not say which stock flows were compared. The module adds an effect to the chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 4,906 executed instructions for a 16-frame call at the dearest settings (MODE LSB), 307 a frame including the per-call setup (`verify.py`'s last gate, which now fails at 314). 0.1.0 measured 259: the SSB detector costs 62 a sample (two chains of three allpasses at 7 each, the combine and the blend), the oscillator's quadrature correction 3 and the low-pass fix 1, and rewriting the glides saved 24. The detector runs in every MODE (the loop has no branches, and AM keeps it warm for the crossfade), so AM costs the same. octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison.

## Resources

487 program words and one 522-word P table (W, F, K and S, 129 words each, and the six allpass coefficients) per DSP core, from `dsp_asm`. 64 state words per instance in the instance's own r7 block (`$00`-`$3f`, one-word displacements throughout); `init` clears the whole `$84`-word block. No allocator buffer, no Y memory, no stock table, no absolute address.

## Hardware

Reported by the developer, not observed by the reviewer. On 31 Oct 2026 @semierendonmez-commits reported that SHORTWAVE runs on their own Octatrack MKI from a card build: "Hepsi benim kendi octatrackimde çalışıyor" ("they all run on my own Octatrack"), covering this module with the rest of the set. This branch changed late on 30 Oct (0.2.0: MODE, the SSB detector, DRIV moved to slot 7), so the report may cover 0.1.0.

Not recorded, so not claimed: the exact source revision and the image's SHA-256 (the developer was not sure which push they built), how long it ran, how many tracks and instances, which controls, modes and settings were tried, both DSP cores, the stock flows, an MKII and the USB base. To turn this into the functional hardware report docs/MODULE_QUALIFICATION.md describes: build the pinned `evidenceRevision`, record the image's SHA-256, and write down what was played and for how long.

## OT UI capture evidence

None: the effect has not run in a built image.
