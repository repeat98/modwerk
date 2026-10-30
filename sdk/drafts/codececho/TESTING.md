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
PASS  assembles, no mpysu, no rep          533 program words + 206 table words
PASS  MIX 0 is the dry, bit for bit        largest difference 0 LSB
PASS  a garbage line is never heard        peak 0 LSB over 2 s
PASS  TIME 1/4 at 120.0 BPM                echo onset after 22060 samples, want 22050
PASS  TIME 1/8 at 96.5 BPM                 echo onset after 13718 samples, want 13708
PASS  TIME 1/2 at 200.0 BPM                echo onset after 26470 samples, want 26460
PASS  TIME 1/2 at 60.0 BPM                 echo onset after 44110 samples, want 44100
PASS  FDBK 127 decays each repeat          repeats -5.1 -5.7 -6.2 -6.8 -7.3 -7.9 dB
PASS  the line settles to silence          FDBK 64: last 0.5 s peak 0 LSB, 10 s after the burst
PASS  LOSS: ADPCM at 5, 4, 3, 2 bits       SNR 49/42/34/24 dB (-8 dBFS tone), 34/34/31/23 dB (-40 dBFS)
PASS  LOSS darkens the echo                2 kHz echo -9.9 dBFS at LOSS 0, -15.6 at 127
PASS  DROP holes of PKT 0                  160 holes, median 124 samples, want about 128 (full rate)
PASS  DROP holes of PKT 64                 15 holes, median 1084 samples, want about 1088 (full rate)
PASS  PLC RPT leaves no holes              0 silent samples
PASS  TIME moves without a click           largest step 0.0223
PASS  memory guard, every run              0 words written outside the state, audio and line
PASS  instructions per frame               3130 a 16-frame call, 196 a frame
all passed
```

What they pin: MIX 0 is the dry bit for bit from a garbage state block and line, with and without a trig split, at the defaults and with every knob at its dearest; with a garbage line, silence in and MIX 127, the output stays exact digital silence (the line is cleared before it is read); the echo of a 5 ms burst starts 10 samples after `clocks x (42,336,000 / tempo24) / 32` half-rate samples at 120, 96.5, 200 and 60 BPM (the decimation, the coder and the output poles; 1/2 at 60 BPM halves to fit the line); at FDBK 127 each repeat is about 0.5 dB below the last, and at FDBK 64 a burst's repeats reach exact digital silence within 10 s (the coder's prediction leaks to 0, the line truncates toward zero and the output poles carry their dropped bits, so nothing hangs on its last bit); LOSS's ADPCM: the echo's signal-to-noise ratio falls from 49 dB at 5 bits to 24 dB at 2 bits for a -8 dBFS tone and stays within 11 dB of that for a -40 dBFS tone (the step adapts to the level); LOSS 127 takes a 2 kHz echo 5.7 dB below LOSS 0; DROP 64 with PLC MUTE leaves holes of PKT's length (128 and 1,088 samples at PKT 0 and 64), and PLC RPT leaves none; a TIME change mid-tone steps no more than the tone itself; the memory guard over every run.

## Sound quality

`npm run fx:audit` on renders from fxhost, MIX 127 (the echoes alone, after their delay). The coder is lossy at every LOSS, by design, so no setting passes the audit's -60 dBc: what follows is a record of how lossy, not a defect list.

LOSS 0, FDBK 0, TIME 1/32 (one echo through 5-bit ADPCM at the half rate):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.3      -58.5     -50.4     -39.9    -117.9       0  FAIL
tone-1100hz-1db             -1.3      -60.6     -51.2     -39.8     -84.6       0  FAIL
tone-2701hz-12db           -13.5      -63.1     -38.9     -30.4     -97.3       0  FAIL
tone-2701hz-1db             -2.5      -58.8     -39.2     -30.1    -100.0       0  FAIL
tone-5301hz-12db           -17.0      -59.5     -32.3     -20.5     -94.7       0  FAIL
tone-5301hz-1db             -6.5      -44.0     -31.0     -18.2    -106.4       0  FAIL
tone-9102hz-12db           -24.4      -84.1     -16.2      -7.2     -99.3       0  FAIL
tone-9102hz-1db            -15.2      -82.2     -10.5      -5.1    -101.5       0  FAIL
idle                    after the input stops: digital silence  OK
```

At 5 bits the coder's noise sits 40 dB under a 1.1 kHz tone and closer to tones higher up, where the adaptive step has less time per cycle; a 9.1 kHz tone also leaves the half rate's image at 12.95 kHz. DC stays under -84 dBFS, nothing reaches the rails, and after the input stops the output is digital silence.

LOSS 127, FDBK 64, TIME 1/16 (2-bit ADPCM and the loop's low-pass on every pass, repeats piling up, no packets lost):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -18.2      -30.0     -27.7     -15.4     -83.9       0  FAIL
tone-1100hz-1db             -7.2      -28.4     -25.6     -15.8     -73.8       0  FAIL
tone-2701hz-12db           -23.3      -21.8     -14.8      -4.8     -57.8       0  FAIL
tone-2701hz-1db            -12.2      -21.7     -16.3      -4.6     -58.5       0  FAIL
tone-5301hz-12db           -20.0      -36.5      -6.1       5.9     -86.1       0  FAIL
tone-5301hz-1db             -9.7      -31.1     -15.5      -6.8    -105.4       0  FAIL
tone-9102hz-12db           -36.0      -43.3       6.3      17.2     -79.0       0  FAIL
tone-9102hz-1db            -23.9      -54.2       3.1      13.8     -57.5       0  FAIL
idle                    after the input stops: digital silence  OK
```

At 2 bits the coder cannot follow a high tone: the step oscillates and a 5 or 9 kHz tone comes back as noise and harmonics louder than the tone itself (a 2 kHz tone loses 5.7 dB to the loop's low-pass instead, as the gate shows). That is G.726 at 16 kbit/s on material it was never meant for, which is the sound LOSS 127 is for. DC stays under -57 dBFS (the loop's DC blocker keeps the coder's biases from piling up through the feedback); after the input stops the output is digital silence.

## Stock flows

Not tested: nothing has run in a built image or on a unit. The module adds an effect to the FX2 chooser through the base's effect list and claims no key gesture or screen.

## Performance

`evidence/performance.json` is not written: its static count (`cycle_count.py`), the benchmark against stock (`benchmark_stock_dsp.py`, which reads the user's own OS 1.40C) and the stress run (`dsp_host -guard -dirty`) all need a built image. Measured instead in fxhost: 3,130 executed instructions for a 16-frame call at the dearest settings, 196 a frame including the per-call setup (the tempo division's 24 `div` steps and up to 48 additions for the division run once a call). octabam's benchmark reports 314 instructions a sample for stock SPRING REV under its own cases; the two figures come from different harnesses and are not yet a comparison. The clearing calls cost 128 Y writes each, 124 times, once.

## Resources

533 program words and one 206-word P table (the divisions' MIDI clocks, the ADPCM's 89 step sizes and their 89 reciprocals, and four words for each of its four depths) per DSP core, from `dsp_asm`. 41 state words per instance in the instance's own r7 block (`$00`-`$28`), all cleared by `init`. 15,870 words of the allocator's FX2 Y buffer (`Claims(stock_instance_buffer=True, buffer_words=15870)`), as Mini Verb and E-Verb take it: the slot's last $202 words stay untouched. No stock table, no absolute address but `X:$213`.

## Hardware

Untested.

## OT UI capture evidence

None: the effect has not run in a built image.
