# FX Track testing

Module version 0.1.0-experimental, Digitakt I OS 1.54 (stock file SHA-256 `f78ba80f…3cf6`), Core 2.1. Firmware, linked images and emulator state stay on the developer's computer; none of it is committed.

## Evidence tier

Emulator only so far. Hardware steps for the author are in section 5; no hardware result is recorded yet.

## How it works (OS 1.54)

**Stock.** The MIDI input's interrupt parses each message and posts it to the MIDI task's queue (one for MIDI IN, one for USB) as a length and a pointer, then wakes the task. For a control change the task checks RECEIVE CC/NRPN and calls the parameter handler once for the effects when the channel equals FX CONTROL CH, and once for every audio or MIDI track whose TRACK CHANNEL matches.

The MIDI tracks build what they send in an output buffer: every control change, pitch bend and aftertouch is added by one function (0x400e0dac), and the buffer is then sent to MIDI OUT and USB as PORT CONFIG says.

**The module.** A 6-byte `jsr` at the start of that function takes a 3-byte control change when FX TRACK is ticked, its channel equals FX CONTROL CH and its controller is one of the effects' (24-31, 85-92, 102-109, 111-119). The message is copied into a 128-entry ring and the function returns to its caller without adding it to the buffer. Any other message replays the replaced instruction and continues into the stock function. The `ev_render_out` handler posts the waiting messages to the MIDI IN queue (or the USB queue when INPUT FROM takes only USB) and wakes the MIDI task, as the input's interrupt does. Posting them straight from the MIDI tracks' context was tried first; in the emulator the panel then stopped answering, so posting moved to the audio interrupt, which is where the stock parser posts from.

## 1. The stock effects map (pinned digiemu c1b5735)

FX CONTROL CH set to 16 through the panel, then every controller 1-127 (except bank select, data entry, NRPN/RPN and channel mode) sent at 0, 127 and 64 through digiemu's MIDI IN, reading the render's effects words after each:

| CC | Moves |
| --- | --- |
| 24-29, 31 | Reverb PRE, DECAY, FREQ, GAIN, HPF, LPF, VOL (0x7f00 at 127) |
| 30 | Reverb after the compressor, on/off |
| 85, 87-92 | Delay TIME, WIDTH, FEEDBACK, HPF, LPF, REVERB, VOL |
| 86 | Delay X (ping-pong), on/off |
| 102-109 | External Mixer IN L/R LEV, PAN, DEL, REV |
| 111-119 | Compressor (115 and 116 have 8 and 11 steps) |

No other controller moved an effects word. Those 33 numbers are the module's allow-list.

## 2. Running firmware (pinned digiemu c1b5735, firmware-native drawing)

MIDI track A, CHAN switched on with FUNC + knob A (channel 1), CC1 SEL set to 24 (reverb PRE) with real knob turns, FX CONTROL CH 1. MIDI OUT captured with digiemu's MidiOut; reverb PRE read from the render's word.

| Build and phase | MIDI OUT | Reverb PRE |
| --- | --- | --- |
| Stock, VAL1 turned 1-7 | `b0 18 01` … `b0 18 07` | unchanged (8) |
| Stock, the same CC sent into MIDI IN (`b0 18 50`) | — | 0x50: the stock FX CONTROL CH path |
| Module, FX TRACK unticked, VAL1 turned | `b0 18 01` … `b0 18 07` | unchanged (8) |
| Module, unticked, playing locks (step 1 +30, step 9 -30) | notes and `b0 18 20`, `b0 18 00` per step | unchanged (8) |
| Module, ticked, playing the same locks | notes only | 32 on steps 1-8, 0 on steps 9-16, every bar |
| Core 2.1 + Input Pre-Fader Sends 0.2.0 + Digi Health 1.0 (FAST AUDIO on) + Digi EQ 1.0.2-experimental + this module, ticked, playing | notes only | 33 / 0 per half bar |

Build `.syx` SHA-256: module alone `a2ba6e80…3eccd8`; combined `de7fb751…35f896`. No halt.

Emulator note: in pinned digiemu the panel stops redrawing once the MIDI task has applied a received control change, on the stock OS too (same symptom with a CC sent into MIDI IN). The tests therefore set every lock before the first message comes back in. It is not seen on the hardware, where CCs are received all the time.

## 3. Build and rules

- Memory: 640 bytes of code and allow-list, 2,058 bytes of BSS (mostly the 128-entry ring) in DDR; no fast SRAM.
- Load (emulator, [cpu-load.json](evidence/cpu-load.json)): CycleClock at 250 MHz, zero-wait memory, the audio interrupt from entry to `rte`. Idle with FX TRACK ticked: 100,514 mean / 101,315 worst over 3,000 blocks, against stock's 100,448 / 101,241 (+66 / +74, under 0.05% of a block). Playing the locks above: worst block 103,843 with the module ticked, 103,942 for stock playing the same pattern unticked. Not a hardware measurement.

## 4. Screens

[capture.json](media/capture.json): the SETTINGS row unticked and ticked, from the module-alone build in the pinned emulator.

## 5. Hardware steps (for the author)

Not yet tested. Builds: module alone `a2ba6e80…3eccd8`, and combined with Input Pre-Fader Sends, Digi Health and Digi EQ `de7fb751…35f896`.

1. FX TRACK appears in SETTINGS, unticked.
2. Setup as in the README tutorial (TRACK H CHANNEL OFF, FX CONTROL CH 16, MIDI track H CHAN 16, SEL1 85, SEL2 88). Unticked: turning VAL1 does not change the delay, and the CC leaves MIDI OUT (if something is connected to see it).
3. Ticked: turning VAL1 and VAL2 changes the delay TIME and FEEDBACK, and those CCs no longer leave MIDI OUT.
4. Parameter locks on VAL1 (lock trigs or normal trigs) change the delay per step while playing.
5. The MIDI track's LFO on VAL1 modulates the delay TIME.
6. SEL to 106/108 (IN L DEL/REV): sequenced send throws on the external inputs.
7. Untick: stock again.
8. Pattern change and project reload with the row ticked.
9. Combined build: steps 1-4 with Input Pre-Fader Sends ticked.

## Stock flows compared

| Flow | Result |
| --- | --- |
| MIDI output with FX TRACK unticked | Stock (section 2) |
| Messages on other channels, notes, other CCs | Sent out unchanged in both modes |
| SETTINGS menu | Stock rows and order unchanged; one row added at the end |
| Power cycle | Row unticked again |
| Pattern change, project load, sampling | Not tested |

## Still to test

- Everything in section 5 on hardware.
- USB as the only INPUT FROM port.
