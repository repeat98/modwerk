# CODEC ECHO testing

## Commands and exact revision

Source: this folder at the commit that adds it (branch `module/codececho`). Toolchain: octabam's vendored `dsp56300` at its pinned commit 8b731966 with `tools/patches/dsp56300.patch` (`npm run upstream:tools`, then octabam's `scripts/setup.sh` step 4), `dsp_asm` checked to emit the one-word displaced move (`0257de`).

```sh
python3 -B sdk/drafts/codececho/verify.py                     # the gates
npm run fx:audit -- plan out/fx
python3 -B sdk/drafts/codececho/verify.py --fx out/fx         # renders out/fx-renders at the audit settings
npm run fx:audit -- check out/fx out/fx-renders
```

`verify.py` assembles `codececho.asm` with `dsp_asm`, refuses a `rep`, a label that prefixes another, a second table literal and any multiply operand order outside the eight the chip encodes, disassembles the result and refuses an unsigned multiply, then runs the module in **fxhost** (`tools/fxhost.cpp`): the vendored dsp56kEmu with only this module's words and table loaded, called through octabam's recovered effect ABI (audio at X:0, `n7` frames, `r6` the parameter record with tempo24 << 8 at `r6+$13`, `r7` the state block, `X:$213` pointing at the allocator's buffer base, 16-frame blocks, trig splits on request). The line sits at Y:$4000, an FX2 slot, and the guard allows exactly its 15,870 words: every X and Y word outside the audio block, the state block, the parameter record and the line holds a marker checked after every call, so a write into the slot's last $202 words (Sidechain Compressor's key window) would fail it. `init` is entered with `r1` set and must return it unchanged. Renders after the first 124 calls, which clear the line.

What fxhost cannot see: the dispatcher's real register state, whether the frame builder's tempo word really sits at `r6+$13` for this instance (octabam measured it for BusDelay), the panel and its descriptor, the base's loader, the other tenants of the DSP, the chip's timing and anything audible on a unit. Nothing below is hardware evidence.

## Gates (fxhost, 30 Oct 2026)

```
PASS  assembles, no mpysu, no rep          436 program words + 12 table words
PASS  MIX 0 is the dry, bit for bit        largest difference 0 LSB
PASS  a garbage line is never heard        peak 0 LSB over 2 s
PASS  TIME 1/4 at 120.0 BPM                echo after 22053 samples, want 22050
PASS  TIME 1/8 at 96.5 BPM                 echo after 13711 samples, want 13708
PASS  TIME 1/2 at 200.0 BPM                echo after 26463 samples, want 26460
PASS  TIME 1/2 at 60.0 BPM                 echo after 44103 samples, want 44100
PASS  FDBK 127 decays each repeat          repeats -5.1 -5.6 -6.1 -6.6 -7.1 -7.7 dB
PASS  the line settles to silence          FDBK 64: last 0.5 s peak 0 LSB, 10 s after the burst
PASS  LOSS darkens the echo                5 kHz echo -13.5 dBFS at LOSS 0, -27.0 at 127
PASS  DROP holes of PKT 0                  160 holes, median 124 samples, want about 128 (full rate)
PASS  DROP holes of PKT 64                 15 holes, median 1084 samples, want about 1088 (full rate)
PASS  PLC RPT leaves no holes              0 silent samples
PASS  TIME moves without a click           largest step 0.0214
PASS  memory guard, every run              0 words written outside the state, audio and line
PASS  instructions per frame               2517 a 16-frame call, 157 a frame
all passed
```

What they pin: MIX 0 is the dry bit for bit from a garbage state block and line, with and without a trig split, at the defaults and with every knob at its dearest; with a garbage line, silence in and MIX 127, the output stays exact digital silence (the line is cleared before it is read); the first echo of an impulse lands within 3 samples of `clocks x (42,336,000 / tempo24) / 32` half-rate samples at 120, 96.5, 200 and 60 BPM (1/2 at 60 BPM halves to fit the line); at FDBK 127 each repeat is 0.5 dB below the last, and at FDBK 64 a burst's repeats reach exact digital silence within 10 s (the codec truncates toward zero and the output poles carry their dropped bits, so nothing hangs on its last bit); LOSS 127 takes a 5 kHz echo 13.5 dB below LOSS 0; DROP 64 with PLC MUTE leaves holes of PKT's length (128 and 1,088 samples at PKT 0 and 64), and PLC RPT leaves none; a TIME change mid-tone steps no more than the tone itself; the memory guard over every run.

## Sound quality

`npm run fx:audit` on renders from fxhost, MIX 127 (the echoes alone, after their delay).

LOSS 0, FDBK 0, TIME 1/32 (one echo through the clean line: half rate, 12 bits):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.3      -68.5     -76.5     -55.8    -130.4       0  ok
tone-1100hz-1db             -1.2      -79.3     -86.6     -56.3    -130.4       0  ok
tone-2701hz-12db           -13.4      -75.2     -73.3     -39.5    -131.2       0  ok
tone-2701hz-1db             -2.4      -86.1     -84.6     -39.5    -133.3       0  ok
tone-5301hz-12db           -17.0      -87.8     -68.7     -24.3    -131.0       0  ok
tone-5301hz-1db             -6.0      -99.5     -79.3     -24.3    -132.0       0  ok
tone-9102hz-12db           -24.5     -110.0     -56.8      -7.7    -131.6       0  FAIL
tone-9102hz-1db            -13.5     -126.3     -68.9      -7.7    -129.8       0  ok
idle                    after the input stops: digital silence  OK
```

The line runs at 22.05 kHz: a tone near its top (9.1 kHz) leaves an image at 22.05 - 9.1 = 12.95 kHz that the two output poles only take down by about 8 dB, which the audit counts as residual (and, at -12 dBFS, the one aliasing figure past -60 dBc). Below 5.3 kHz every figure passes. DC stays under -129 dBFS; after the input stops the output is digital silence.

LOSS 127, FDBK 96, TIME 1/16 (the codec at work, repeats piling up; no packets lost):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -19.1      -38.2     -40.0     -33.2     -95.9       0  FAIL
tone-1100hz-1db             -8.0      -50.1     -53.9     -37.7     -79.9       0  FAIL
tone-2701hz-12db           -23.1      -40.2     -32.2     -28.3     -92.0       0  FAIL
tone-2701hz-1db            -11.7      -51.4     -49.4     -36.9     -94.8       0  FAIL
tone-5301hz-12db           -32.0      -51.0     -26.6     -18.7     -97.9       0  FAIL
tone-5301hz-1db            -20.2      -60.5     -36.5     -23.8     -86.1       0  FAIL
tone-9102hz-12db           -43.1      -79.1     -10.9      -6.4    -102.7       0  FAIL
tone-9102hz-1db            -30.8      -83.3     -23.3      -7.5     -91.2       0  FAIL
idle                    after the input stops: digital silence  OK
```

At full LOSS every repeat is cut to 8 bits and low-passed at about 1 kHz, again on every pass: the harmonics, aliasing and residual are the codec's grit, the sound LOSS is for. A quiet input still echoes (a -40 dBFS tone comes back at -54 dBFS). Nothing reaches the rails; after the input stops the output is digital silence.

## Stock flows

Not tested: nothing has run in a built image or on a unit. The module adds an effect to the FX2 chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 2,517 executed instructions for a 16-frame call at the dearest settings, 157 a frame including the per-call setup (the tempo division's 24 `div` steps and up to 48 additions for the division run once a call). octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison. The clearing calls cost 128 Y writes each, 124 times, once.

## Resources

436 program words and one 12-word P table (the divisions' MIDI clocks) per DSP core, from `dsp_asm`. 32 state words per instance in the instance's own r7 block (`$00`-`$1f`), all cleared by `init`. 15,870 words of the allocator's FX2 Y buffer (`Claims(stock_instance_buffer=True, buffer_words=15870)`), as Mini Verb and E-Verb take it: the slot's last $202 words stay untouched. No stock table, no absolute address but `X:$213`.

## Hardware

Untested.

## OT UI capture evidence

None: the effect has not run in a built image.
