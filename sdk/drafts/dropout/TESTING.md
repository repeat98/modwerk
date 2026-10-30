# DROPOUT testing

## Commands and exact revision

Source: this folder at the commit named in `octamod.module.json` (`source.revision`, branch `module/dropout`). Toolchain: octabam's vendored `dsp56300` at its pinned commit 8b731966 with `tools/patches/dsp56300.patch` (`npm run upstream:tools`, then octabam's `scripts/setup.sh` step 4), `dsp_asm` checked to emit the one-word displaced move (`0257de`).

```sh
python3 -B sdk/drafts/dropout/verify.py                     # the gates
npm run fx:audit -- plan out/fx
python3 -B sdk/drafts/dropout/verify.py --fx out/fx         # renders out/fx-renders at the audit settings
npm run fx:audit -- check out/fx out/fx-renders
```

`verify.py` assembles `dropout.asm` with `dsp_asm`, refuses a `rep`, a label that prefixes another, a second table literal and any multiply operand order outside the eight the chip encodes, disassembles the result and refuses an unsigned multiply, then runs the module in **fxhost** (`tools/fxhost.cpp`): the vendored dsp56kEmu with only this module's words and table loaded, called through octabam's recovered effect ABI (audio at X:0, `n7` frames, `r6` the parameter record with tempo24 << 8 at `r6+$13`, `r7` the state block, `X:$213` pointing at the allocator's buffer base, 16-frame blocks, trig splits on request). The buffer sits at Y:$1c00 (an FX1 slot, not 2K-aligned) or Y:$4000 (an FX2 slot), 3,072 words. Every X and Y word outside the audio block, the state block, the parameter record and that buffer holds a marker checked after every call; `init` is entered with `r1` set and must return it unchanged.

What fxhost cannot see: the dispatcher's real register state, the frame builder's real tempo word (in particular whether an FX1 instance gets one), the panel and its descriptor, LFO and scene modulation as the firmware applies it, the base's loader, the other tenants of the DSP, the chip's timing and anything audible on a unit. Nothing below is hardware evidence.

## Gates (fxhost, 30 Oct 2026)

```
PASS  assembles, no mpysu, no rep          617 program words + 323 table words
PASS  neutral is the dry, bit for bit      defaults and MIX 0 (all else at 127), every MODE: largest difference 0 LSB
PASS  HOLD holds 32 samples (SIZE 7)       23 errors, 100% exactly 32 long, held at the last good: True
PASS  HOLD holds 256 samples (SIZE 63)     22 errors, 100% exactly 256 long, held at the last good: True
PASS  PCKT replays 64 samples, fading      23 lost packets, 23 exactly 64 long, largest model error 2 LSB
PASS  PCKT replays 256 samples, fading     22 lost packets, 22 exactly 256 long, largest model error 2 LSB
PASS  CIRC conceals 4 samples              23 bursts, 23 exactly 4 long, largest model error 2 LSB
PASS  CIRC conceals 8 samples              23 bursts, 23 exactly 8 long, largest model error 2 LSB
PASS  CIRC mutes bursts of 16              23 bursts, 100% exactly 16 long
PASS  CIRC mutes bursts of 1024            9 bursts, 100% exactly 1024 long
PASS  BITS: ADPCM at 5, 4, 3, 2 bits       SNR 51/45/37/25 dB (-8 dBFS tone), 51/45/38/25 dB (-40 dBFS)
PASS  FRZ steps of 5512, FX1 120.0 BPM     step starts 5512,5512,5512 apart; the frame loops within 3 LSB
PASS  FRZ steps of 6854, FX1 96.5 BPM      step starts 6854,6854,6854 apart; the frame loops within 3 LSB
PASS  FRZ steps of 1900, FX1 174.0 BPM     step starts 1900,1900,1900 apart; the frame loops within 3 LSB
PASS  FRZ steps of 5512, FX1 tempo 0 (120) step starts 5512,5512,5512 apart; the frame loops within 3 LSB
PASS  FRZ steps of 1900, FX2 174.0 BPM     step starts 1900,1900,1900 apart; the frame loops within 3 LSB
PASS  FRZ steps of 5512, FX2 tempo 20 (120) step starts 5512,5512,5512 apart; the frame loops within 3 LSB
PASS  FRZ steps of 5512, FX2 tempo 400 (120) step starts 5512,5512,5512 apart; the frame loops within 3 LSB
PASS  FRZ 64 freezes about half the steps  37 of 64 steps
PASS  RATE follows the tempo               62 errors in 2 s at 87 BPM (want 56), 112 at 174 (want 113)
PASS  a garbage buffer is never heard      peak -40.0 dBFS from a -40.0 dBFS input over a garbage buffer
PASS  idle is digital silence (HOLD)       last 0.5 s peak 0 LSB
PASS  idle is digital silence (PCKT)       last 0.5 s peak 0 LSB
PASS  idle is digital silence (CIRC)       last 0.5 s peak 0 LSB
PASS  memory guard, every run              0 words written outside the state, audio and buffer
PASS  instructions per frame               4378 a 16-frame call, 274 a frame (stock SPRING REV: 314)
all passed
```

What they pin:

- **Passthrough.** At the defaults (RATE 0, BITS off, FRZ 0, MIX 127) and at MIX 0 with every other knob at 127, in every MODE, the output is the input bit for bit, from a garbage state block and buffer, with and without a trig split (5 frames), on an FX1 and an FX2 buffer.
- **HOLD.** On a 997 Hz tone, each error is a run of exactly 4 + 4 SIZE equal samples (32 at SIZE 7, 256 at 63), at the value of the sample before it.
- **PCKT.** Each lost packet is exactly P samples long (64 at SIZE 0, 256 at 127), and sample k of it is the input P samples earlier times (1 − 2^-23 − k/P), within 2 LSB of that arithmetic.
- **CIRC.** On a 3 kHz tone, each concealed burst is exactly 1 + SIZE/8 samples long (4 and 8) and continues the last good sample by the last slope, within 2 LSB; from SIZE 64 each burst is a run of exactly 16 (SIZE − 63) samples within 2 LSB of zero (16 and 1,024).
- **BITS.** A 440 Hz tone's signal-to-noise ratio after the coder falls with each depth, 51/45/37/25 dB at 5/4/3/2 bits, the same at −8 and −40 dBFS (the step adapts).
- **Tempo lock.** With every step frozen and a 64-sample frame, the runs where the input passes start exactly one step apart and last exactly 64 samples, and the output then repeats with a period of 64 within 3 LSB: 5,512 samples a 1/16 step at 120 BPM, 6,854 at 96.5 BPM, 1,900 a 1/32 step at 174 BPM, each equal to `3 q 2^STEP / 16` with `q = 42,336,000 // tempo24`, and 5,512 again when the tempo word reads 0, 20 or 400 BPM (the 120 BPM fallback outside 30-300). The FX1 runs put tempo24 at r6+$19 and FX2's page-2 slots 8/9 (64, 1) at r6+$13; the FX2 runs put it at r6+$13. FRZ 64 froze 37 of 64 steps. RATE 100 made 62 errors in 2 s at 87 BPM and 112 at 174 against 56 and 113 from its chance a frame (within 25 %, and the ratio within 20 % of 2).
- **Buffer.** Over a garbage buffer, with PCKT and CIRC errors and every 1/32 step frozen on its longest frame, the output never exceeds a −40 dBFS input.
- **Idle.** After a 0.3 s burst, with the 2-bit coder, errors at RATE 100 and FRZ 64, the last 0.5 s of 3 s of silence is exactly 0 in every MODE.
- **Memory guard** over every run, and the **cost** below.

## Sound quality

The errors and the freezes are deliberate discontinuities, which the audit reads as residual, so it was rendered with them off and the codec at its coarsest (BITS 127: 2 bits; RATE 0, FRZ 0, MIX 127), the module's one nonlinearity:

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.0      -23.9     -25.8     -19.4     -78.8       0  FAIL
tone-1100hz-1db             -1.0      -24.9     -26.1     -19.2     -79.5     425  FAIL
tone-2701hz-12db           -11.8      -16.8     -20.7     -10.1     -84.8       0  FAIL
tone-2701hz-1db             -1.3      -19.6     -21.8     -10.8     -79.0    1652  FAIL
tone-5301hz-12db           -12.9      -14.6     -14.0      -3.3     -95.9       0  FAIL
tone-5301hz-1db             -0.4      -26.7     -12.0     -14.5    -108.2       0  FAIL
tone-9102hz-12db            -5.8      -58.2      -8.2      -8.6    -108.2       0  FAIL
tone-9102hz-1db             -0.6      -84.0      -7.6     -24.6    -130.0    3622  FAIL
idle                    after the input stops: digital silence  OK
```

And at 5 bits (BITS 26), rendered the same way:

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.0      -59.6     -54.5     -44.2     <-140       0  FAIL
tone-1100hz-1db             -1.0      -59.3     -55.0     -43.7    -108.7       0  FAIL
tone-2701hz-12db           -12.0      -53.9     -44.4     -35.0    -111.5       0  FAIL
tone-2701hz-1db             -1.0      -52.2     -46.0     -34.7     -87.1       0  FAIL
tone-5301hz-12db           -12.0      -55.5     -36.7     -28.8     -99.1       0  FAIL
tone-5301hz-1db             -1.0      -46.9     -33.3     -29.6    -106.9       0  FAIL
tone-9102hz-12db           -12.0      -62.5     -28.3     -25.3     -98.3       0  FAIL
tone-9102hz-1db             -1.2      -69.9     -24.2     -27.5     -90.4       0  FAIL
idle                    after the input stops: digital silence  OK
```

The verdicts are the audit's −60 dBc aliasing limit, which a 2-to-5-bit coder is not meant to meet: its coding noise is the sound, and it is reported here rather than the limit moved. The 2-bit coder's step lags a full-scale tone and its prediction overshoots onto the store's limit (425 to 3,622 samples at −1 dBFS): that is the coder's own `p` limited on purpose (its update is a limited add), not a wrap; at 5 bits nothing reaches the rails. DC stays under −78 dBFS. After the input stops the output is digital silence at both depths (the prediction leaks to exactly 0). HOLD, PCKT, CIRC and FRZ were not audited: they add no harmonics of their own beyond the steps at their edges, which are the effect.

## Not tested

- Anything in a built image, under the ColdFire port or on a unit: the chooser, the pages, the labels, parameter locks, LFO and scene modulation as the firmware applies them (fxhost feeds whole knob values; the LFO fraction path of RATE, FRZ and MIX is not exercised), stock flows, instances on both cores, `verify_knob_clicks.py`.
- Where an FX1 instance finds the tempo word. The code reads r6+$19 on FX1 (r6 six words below FX2's in the same record, from octabam's measurement of the page-2 bytes) and r6+$13 on FX2; fxhost models exactly that (`-fx1`: tempo24 at r6+$19, FX2's page-2 slots 8/9 at r6+$13), so the gates prove the code follows the model, not the model. The 30-300 BPM fallback is gated with words of 0, 20 and 400 BPM.
- A tempo change mid-render (the step countdown is clamped to the new step length; not gated).
- `dsp_host`'s stress run, `cycle_count.py` and `benchmark_stock_dsp.py`: they need a built image (Performance).

## Independent review

A second agent reviewed this rewrite's source, read-only, on 30 Oct 2026, without the authors' reasoning. It found one defect: on FX1 the code read the tempo at r6+$13, which on an FX1 record is FX2's page-2 slots 8/9 (knob << 16 | companion << 8), so the step and RATE followed FX2's knobs and some values overflowed the 24-step `div`. Fixed: init tells FX1 from FX2 by the buffer's base (below $4000, Character's idiom), FX1 reads r6+$19, and any word outside 30-300 BPM falls back to 120 BPM; fxhost's `-fx1` now models the FX1 record and three gates were added. Its two nits were also fixed: FRZ's draw masks the sign instead of `abs` (a word of $800000 made 1.0, so FRZ 127 missed one step in 2^24), and the error test draws a fresh word after FRZ's, so a frozen step no longer forces errors on its first frame. It checked the ring clear, the ring wrap, the frozen frame's bounds, the state slots, the coder's offsets and every compare and Tcc. It flagged `move x1,a0` and `move x0,a1` as forms without a module precedent (ordinary register moves). The ADPCM routine is CODEC ECHO's, reviewed there and copied with only its table offsets and state slots changed; the HOLD ring, noise, glide and init discipline come from the earlier DROPOUT draft, reviewed 30 Oct 2026. New forms in this source, each with a precedent in octabam: `lua (r7+8),r7` and `lua (r7-8),r7` (Output Matrix), `asl`/`asr` by a register count (the ADPCM routine), short-immediate `add`/`sub`/`cmp #<n` (RENDER-proven modules only, as the earlier review noted).

## Stock flows

Not tested: nothing has run in a built image or on a unit. The module adds an effect to the chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 4,354 executed instructions for the dearest 16-frame call (both coders at 2 bits, PCKT 256 with RATE 127, every 1/32 step frozen on the longest frame, MIX gliding, with and without a trig split), 272 a frame including the per-call setup. octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison. The coders are about half the cost: with BITS off the same call takes 2,278 instructions, 142 a frame.

## Resources

617 program words and one 323-word P table (W and S, 89 words each, four depths of four words, RATE's 129 points) per DSP core, from `dsp_asm`. 59 state words per instance in the instance's own r7 block (`$00`-`$3a`), all cleared by `init`. 3,072 words of the allocator's Y buffer (`Claims(stock_instance_buffer=True, buffer_words=3072)`), which fits an FX1 slot; no stock table, no absolute address but `X:$213`.

## Hardware

Untested.

## OT UI capture evidence

None: the effect has not run in a built image.
