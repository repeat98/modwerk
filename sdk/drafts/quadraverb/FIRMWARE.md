# Quadraverb: the DSP and its firmware, as read (research notes)

Status: research, 26 November 2026. A model of the DSP plays every factory program except the gated ones on the developer's computer; the memory plan is decided; every sweep, pitch shift and Leslie is read as parameters and matches the firmware exactly, and the gate's algorithm is read (its signal detector is hardware). An engine prototype runs 89 of the 90 programs bit for bit in `dsp_host`, in the FX2 buffer at full rate, with the SDRAM stream's ColdFire side modelled: the 13 gated and onset programs in their open form, with the detector held at "signal"; 73 VERB SHIFTER not yet ([ENGINE.md](ENGINE.md)). Nothing here runs on an Octatrack yet.

**Development build (26 November 2026).** This folder is also a draft module, `quadraverb`, for measurement only: `engine/qvunit.py` compiles one factory program (5 STEREO FLANGE, 40 167 ms DELAY or 56 SKANK GUITAR) into a package named QV DEV <program>, with MIX on knob F and nothing else, to measure the compiled engine's DSP cost on a unit and listen to it. It is never published, and the generated engine stays outside Git (`gen/` is ignored). How to build, check and try it: [TESTING.md](TESTING.md).

The goal is an FX2 effect that plays the Alesis Quadraverb's reverbs (plate, room, chamber, hall, reverse, gated) the way Midiverb I/II plays the Midiverb's programs: the original programs on a model of the original DSP. The owner's decisions (25 November 2026):

- **Reverbs only** as the first module, one effect.
- **Firmware only:** no real Quadraverb is available, so the module and its notes must say plainly that the sound has not been checked against a real unit.

His decisions of 27 November 2026, which replace "Reverbs only":

- **The program sources in Git:** his 25 November firmware waiver also covers committing what the build compiles from the ROM (`gen/`: the areas, the ColdFire tables and their assembly), so the package builds without the ROM. The ROMs stay on his computer; the development engines (`gen/engine.asm`, `gen/program.json`) stay ignored.
- **More than the reverbs, one module:** the non-reverb programs join PROG under a one-effect waiver like Midiverb's.
- **Which ones:** of the 76 programs that play bit for bit in the open form, the 58 that fit. With all 76 the ColdFire side needed about 409 KiB of the 768 KiB pool, the pitch shifts' and Leslies' code (1,296-1,875 words an area, two a slot) left a core little room for a Part's stock effects, and seven programs with nothing to stream did not build as areas yet. Ten of the 58 did not match the model bit for bit as areas (`engine/verify_area.py`), so 0.1.0 has 48 (`manifest.py`, `NOT_EXACT`).

Nobody has published a reverse engineering of the Quadraverb's DSP (thement and Eric Brombaugh cover only the Midiverb, Midiverb II and Midifex). This draft does that work.

## How it works

The Quadraverb's controller is an 80C31. Its firmware turns each program's parameters into a 96-step DSP program and keeps rewriting parts of it, such as the LFO-swept delay reads. Instead of porting that maths by hand, `tools/` runs the original firmware in a small 8051 emulator and reads what it writes into the DSP. `tools/qv.mjs` then runs those programs on a model of the DSP.

The DSP's behaviour is not in any code: the firmware only writes instruction words, and the chip carries them out. The model was inferred from programs whose purpose is known (the graphic EQ, the delays, the allpass diffusers) and is checked against them by `tools/qv.check.mjs`.

The ROM stays on the developer's computer and never enters the repository. Use the address-unscrambled ("usemapped") image of version 1.07; `tools/machine.mjs` checks its md5.

```sh
node tools/i8051.check.mjs                      # the 8051 core's self-check
node tools/qv.check.mjs <rom>                   # the DSP model against the known programs
node tools/dump.mjs <rom> 10 15 17              # SMALL ROOM, Concert Hall 1, SML VOCALPLATE side by side
node tools/dump.mjs <rom> --sweep 10            # which record bytes change which DSP steps
node tools/dis8051.mjs <rom> 61f 40             # disassemble 8051 code (any 8051 image)
node tools/qvlfo.mjs <rom> [program ...]        # sweeps, pitch, Leslie, gate as parameters, checked against the firmware
node tools/mv2lfo.mjs <midiverb2-rom>           # the Midiverb II's chorus/flange LFOs, run from its firmware
```

`dump.mjs` prints each step as: index, op (5 bits), delay address, coefficient. The emulator boots the firmware (the display reads `PROGRAM 00 "BASIC PROGRAM"`), copies the 90 factory programs into user memory as RECALL ALL does, and recalls one with a MIDI program change. Program numbers here are those user-memory slots (0-89).

## The DSP

**Program format.** 96 steps of four bytes: address low, address high, coefficient high byte, op byte. The op is `byte3 & 0x1f`. The coefficient is unsigned 11 bits, `(byte2 << 3 | byte3 >> 5) / 2048`, from 0 to just under 1; signs live in the op.

**Delay memory.** One circular buffer of 64K words with a pointer that counts down once a sample, so a word written at address A is read at A + d after d samples. Low addresses serve as one-sample registers: written at A, read at A + 1 a sample later. A word written and read in the same sample is the same word, so programs use address 3 and similar as a dummy target when a step is wanted only for what it does to the registers.

**Registers.** An accumulator A and two latches, B and M.

**Op bits.**

| Bit | Meaning |
| --- | --- |
| 4 | negate the product |
| 3 | write (else read) |
| 2 | latch |
| 1-0 | select: what is added to the product |

- **Read:** A = ±K·mem + add. By select: 00 nothing, 01 A, 10 B, 11 M. With bit 2 set, selects 10 and 11 add A instead. (A is 0 at every unlatched 10 and 11 read in the factory programs, so "B" and "A + B" cannot be told apart.)
- **Write:** mem = A, then A = ±K·A + add. So a write scales the accumulator, as the Wavefront AL3201's `WZP` does. By select: 00 nothing, 01 A (nothing when bit 2 is set), 10 B, 11 M.
- **Latch (bit 2):** a read latches the memory word, a write the accumulator from before the step. The target is M when bit 0 is set, B when it is clear. An add in the same step sees the register's old value.

How each part was settled:

| Ops | Evidence |
| --- | --- |
| 00000, 00001, 10000, 10001, 01000, 11000, 01010, 01011, 01100 | The 11-band graphic EQ of the delay programs: exactly flat at 0 dB, and every band boosts and cuts 14 dB at its centre (16 Hz to 16 kHz) when the firmware asks for 14. |
| 01001 | Steps 20 and 21 of the same EQ double the sum of the four lowest bands, which are computed at a quarter of the level: without the doubling those bands fall 8 dB short. |
| 00101, 01011 | The low bands' state-variable filters: 00101 latches the old band-pass value into M, 01011 adds it back. |
| 10110 / 01010, 10111 / 01011 | Allpass pairs. The read at the tail keeps A (the input), subtracts g·tail and latches the tail. The write at the head stores that and adds g·A to the latched tail. SMALL ROOM's seven-stage diffuser comes out flat within 0.001 dB. Plates use the M form. |
| 01101 | The 3-band input EQ: it is exactly flat at its default settings only if 01101 adds nothing. |
| 00011, 00100 | The delay programs' output: the dry level, latched in M by 01101, is added to both outputs by 00011. |
| 00010 | STEREO SPREAD1 and STEREO PITCH feed their right-hand delay line from B with it; if it kept A instead, that line would only ever hold zeros. |
| 11100, 01111 | Damping filters, DC blockers and the tank's entry in the reverbs; consistent, but not tested on their own. |
| 00110, 00111, 01110, 11010, 11101 | Not tested on their own. Every factory program that uses them (chorus, flange, pitch, Leslie) runs finite on the model, with left and right within 3 dB. |

**Sample rate.** The firmware converts milliseconds at 42 samples each: 167, 250, 500 and 1500 ms delays sit 7015, 10501, 21001 and 63001 steps apart. So it runs at about 42 kHz.

**Input and output.** The write at step 0x5e stores the input sample, and its latch catches it too: the reverbs take their input from B (step 0x03), the delays from address 0. The words read at steps 0x00 and 0x5f are the left and right outputs, written a sample earlier: in SMALL ROOM by steps 0x54 and 0x5d. The pointer steps between 0x5e and 0x5f, so a frame runs 0x5f, 0x00 … 0x5e: the plates use address 0x12 for a filter state, which would otherwise overwrite the right output before step 0x5f reads it.

**What the model does with the factory reverbs** (impulse response, 6 s):

| Program | RT60 | Output energy |
| --- | --- | --- |
| 10 SMALL ROOM | 0.60 s | 0.026 |
| 11 MEDIUM ROOM | 1.13 s | 0.018 |
| 12 LARGE ROOM | 2.00 s | 0.018 |
| 13 SMALL HALL | 1.38 s | 0.017 |
| 15 Concert Hall 1 | 2.22 s | 0.015 |
| 17 SML VOCALPLATE | 1.23 s | 0.071 |
| 19 LRG VOCALPLATE | 4.79 s | 0.030 |
| 20 LO DIFUZ CHMBR | 1.98 s | 0.039 |
| 21 RICH CHAMBER | 2.08 s | 0.042 |
| 66 HOLMES' Plate | 2.69 s | 0.082 |

All stay finite, decay, and have left and right at the same level and uncorrelated. Nobody has compared them with a real unit.

## Modulation

Read from the disassembly and checked by `tools/qvlfo.mjs`, which rebuilds every moving step from a few parameters and compares the result with the firmware's DSP program, byte for byte, after every update. **Fit: all 81 modulated programs match exactly over 10 s** (about 39,600 ticks each; 19,000 for the Leslies and VERB SHIFTER, whose ticks are longer). Facts are what the code does; what is assumed is marked.

**What paces the updates.**
- Fact: timer 0 runs in 16-bit mode and its vector (0x000b) reloads it to 0xff06, 250 machine cycles before the next overflow. Each interrupt runs one handler, chosen per configuration through internal RAM 0x60/0x61, unless the main loop has set bit 2ah.0 while it rewrites the program. Call one handler run a *tick*. Before the handler, the interrupt writes 1 to bytes 0x17f and 0x180; the main loop does the same after its own rewrites, so it looks like a "program changed" strobe (not tested).
- Fact: on the emulator a tick is 252.4 machine cycles. The Leslie and VERB SHIFTER handlers reload the timer at their end (0xff80, 0xff64), so their ticks are about 528 and 508 cycles.
- Fact: the crystal is 12 MHz, 1 µs a machine cycle: MIDI's 31,250 baud needs it with the firmware's timer 1 setting (mode 2, reload 0xff, SMOD 0; PCON stays 0 in all 90 recalls).
- Assumed: 3 more cycles a tick for the 8051's interrupt response, which the emulator does not count: 255 µs a tick (3.92 kHz), 531 µs for the Leslie.
- Assumed: the DSP runs at 42 samples a millisecond (the firmware's own delay conversion) on a clock not locked to the 8051's. That gives 10.7 samples a tick. Nothing in the firmware ties the two clocks together.
- Open: the pitch programs' detune parameter maps one to one onto the pitch rate (record byte 0x21 = 99 + detune; rate = −detune/256 sample a tick). With the time base above, "DETUNE +12" is +7.5 cents. If the unit is meant to be cents, the time base is off by 1.6.

**The kinds** (`node tools/qvlfo.mjs <rom>` prints every program's parameters):

| Kind | Programs | What moves |
| --- | --- | --- |
| Reverb sweep, one pair | 1-3, 10-13, 15-27, 52, 53, 66, 78-81 | an interpolated delay read |
| Stereo sweep, two pairs | 0, 4, 28, 29, 32-36, 44, 46-50, 54, 55, 57, 58, 61-65, 68, 69, 71, 72, 74, 75, 83-85, 87-89 (steps 13/14 and 17/18); 5, 9, 30, 31, 45 (steps 28/29 and 2c/2d) | left and right reads, 180° apart |
| Pitch shift | 7, 37, 51, 59, 60, 70, 86 | two taps sawing across a 256-sample window, and their crossfade |
| Leslie | 8, 38, 39, 67, 82 | two rotors: a swept pair and two gains each |
| Coefficient sweep | 73 VERB SHIFTER | eight coefficients |
| Gate | 3, 23-29, 73, 86, 87 | output tap gains, from the main loop (below) |

Static: 6, 14 (MEDIUM HALL), 40-43, 56, 76, 77.

**The sweep** (handlers 0x0e04 for the reverbs, 0x0bb0 and 0x0a3e for the stereo pairs; the same arithmetic):
- A 16-bit phase P moves by the rate r (8 bits, 16-87 in the factory programs) every tick. It turns at both ends with exact reflection, and a flag H flips at the top. P and H together make one cycle of four sweeps, 4 × 65536 / r ticks: 0.77-4.19 s with the assumed time base.
- The shape X is 0xffff − P (triangle) or 0xffff − P²/65536 (parabolic: arcs of 1 − p², within 6 % of depth of a sine). The firmware squares P in 8-bit pieces; `qvlfo.mjs` has the exact rounding.
- Displacement = X × depth / 65536 samples (depth 21-254), positive while H is 0. Over a cycle it goes +depth, 0, −depth, 0.
- A pair is two steps reading centre ± n and ± (n + 1), with weights (255 − f)/256 and f/256 in the coefficients' high byte, f the 8-bit fraction. The low three coefficient bits stay as built.
- In the stereo layouts, the second pair sits 0x200 (512 samples) above the first and moves the opposite way.
- Record bytes: 0x1c bit 0 is the waveform (1 = triangle), 0x1d the speed, 0x1e the depth. The firmware maps them through its own curves: rate from speed, depth from depth scaled by a curve of speed. Both can take a MIDI modulation offset (0x7c25 and 0x7c9c add it and clamp). The centre comes from the reverb type, or 0x1900 (0x0200 in configuration 3) for the stereo pairs, plus depth and a delay setting in some programs.
- Fact: a recall does not reset the phase. It runs on from the program before. 28, 29, 31, 32 and 88 restart it at a signal onset instead (P = 0, rising, H set), from the same detector as the gate.

**Pitch shift** (handler 0x0d22):
- A 16-bit saw P advances by a signed rate every tick (−15 to +15 in the factory programs; negative raises the pitch).
- Tap A reads 0x1800 + P/256 (steps 0x14 and 0x15, one sample apart, fraction P & 0xff at step 0x16). Tap B reads half a window away (steps 0x18/0x19, fraction at 0x1a). Steps 0x16 and 0x1a hold the fractions, not the crossfade.
- Steps 0x1b and 0x1c crossfade the taps by a curve of the distance from mid-window, in 128 steps. The curve is a quarter sine within 2/255 (the tool reads the exact one from the ROM).
- Quirk: tap A's second read leaves the window at P/256 = 0xfe and 0xff (0x19ff and 0x1800, where 0x18ff and 0x1900 would follow); tap B's is right. Both happen at the window's edge, where the crossfade should have faded that tap out (not checked).
- Pitch ratio = 1 − rate / (256 × samples a tick).

**Leslie** (handler 0x0660):
- Two rotors: drum (steps 0x0b/0x0c around 0x1900, gains at 0x0f and 0x11) and horn (0x13/0x14 around 0x1b00, gains at 0x17 and 0x19).
- Each rotor is a 16-bit triangle with a 16-bit rate, reflected as 0xffff − P at both ends, a flag H flipped at the top and B at the bottom. It sweeps its pair as above (parabolic).
- Its gains are 127 − AM, plus (255 − P/256)/2 while H is 0, then ± P/256 × AM/256, opposite at the two steps, the sign by B. AM is an edit-buffer byte (0x8662: 16-33 in the factory programs).
- Every 256 ticks each rate moves a fixed step toward the selected speed's target and stops there. The depth follows the rate through a short curve, 32 samples at rest falling to 16 at fast.
- Periods with the assumed time base: drum 1.58 s slow and 0.25 s fast, horn 1.31 s and 0.14 s. 38 and 82 are set to fast, 8, 39 and 67 to slow.
- The speed (stop, slow, fast) is two bits the main loop sets, 2ch.0 and 2ah.4; the names say aftertouch, pitch bend and sustain pedal switch it. Not traced.

**VERB SHIFTER** (handler 0x96ee):
- A 16-bit triangle, the rate (43) added twice a tick, reflected to −P at both ends, a flag flipped at the bottom; one cycle is 1,524 ticks (0.78 s, assumed).
- P/256 picks a value from one of two 256-entry curves, one for each half of the cycle (read from the ROM).
- The value, scaled by depth, moves four coefficient pairs (steps 13/15, 16/17, 18/19, 1a/1b) around fixed centres. The two steps of a pair get the same magnitude with opposite signs. On the second curve the offset changes sign where P/256 passes 0x99.

## The gate

The gate is the main loop's work, not the interrupt's: every 16 ticks (4.04 ms) it reads a one-bit signal detector and rewrites the output taps' gains. It is on in 11 factory programs (record byte 0x3e). Read from the disassembly (0x9fef-0xa0f2, settings from 0x6de7-0x6e5d) and from driving the pin in the emulator.

- **The input.** Pin P3.2 of the 8051 (INT0, used as a plain input). The interrupt samples it every tick and counts the ticks it reads high in internal RAM 0x52. A routine at 0x02c2 zeroes the count every 16 ticks; it also pulses bits 5 and 6 of the latch at 0x0600, which may reset a detector in the hardware (not known).
- **Polarity, inferred:** low means signal. The gate opens only on a window in which the pin read low on all 16 ticks, so the detector must hold its output across the waveform's zero crossings (a peak hold or an envelope).
- **Open.** On a window with no high reading, the gate jumps to its open level at once and arms the hold.
- **Hold.** Every window with fewer than 6 high readings re-arms the hold. Then the hold counts down one window for each window with 6 or more. At zero, the release starts.
- **Release.** Each window, level = level × (2 × decay + 57)/256, down to the closed level; a level below it jumps to it.
- **Settings.** Open level from record byte 0x4a; closed level from record byte 0x41, scaled by the open level; hold = record byte 0x3f + 1 windows; decay = record byte 0x40. They are written into the coefficient high byte of two runs of steps (for GATED REVERB, 10 steps from 0x46 and 10 from 0x52). `qvlfo.mjs` prints them for each program.
- **Why 3, 23 and 26 are silent.** The emulator reads every port pin as 1, which is "no signal" here, so the gate closes, and those three close to 0. The others close to a level above 0 and stay audible. With P3.2 held low, all of them stay open.
- **Quirk.** A recall writes the open level into the taps but does not set the gate's own level variable (0x83a0). So whether a freshly recalled gate closes without a signal depends on the program before.
- **What the module needs.** A signal-present bit every tick from the input, which no emulator supplies. The firmware sets no threshold: during a gated program it writes nothing but the tap gains and the latch. So the detector, its threshold and its time constant are in the hardware (or the DSP chip; the firmware cannot tell). The module can compute the bit on the DSP from an envelope of the input; its threshold and time constant will be assumptions, labelled as such. The same bit restarts the triggered sweeps (28, 29, 31, 32, 88): after a window of 6 or more high readings, the next window with none.
- Not followed: pin P3.3, counted the same way in 0x75; the gate does not read it.

## Memory

Midiverb's relocation (`generate.mjs`: every read becomes a delay line and a delay, dead reads dropped, lines packed head to tail) applied to all 90 programs, with each sweep's full range: they need 0.5K-63K words at 42 kHz. One FX2 instance gets at most 15,870 words (16,384 if it gives up block 3; `elekloader/dsp.c`, `FX2_BUFFER`). The dynamic loader does not change that: it loads code, and every FX2 instance still reads its own track's 16K block. At half rate, 29 programs fit untouched; with the longest line shortened by up to 15 %, about 18 more. The plates and gated programs need about 24K, the 1.5 s delays 31.5K.

**The owner's decision (26 November 2026): a hybrid.** Shortening delays, storing samples in fewer bits, and giving one instance a second block were all turned down. Instead, the short lines stay in the DSP buffer and the long ones live in SDRAM, moved by the ColdFire once a 16-sample frame. A line can move when every read from it lags its head by more than the round trip (assumed 64 samples, four frames). With that, all 90 programs fit untouched in 16-bit:

| | Programs | Words crossing per frame, per instance, each way |
| --- | --- | --- |
| Half rate (21 kHz) | 90 / 90 | median 32, worst 160 (HOLMES' Plate) |
| Full rate (42 kHz) | 90 / 90 | median 224, worst 560 |

For scale, stock DELAY moves about 100 words a frame for each of the eight tracks. The engine's own split (ENGINE.md, [The SDRAM stream](ENGINE.md#the-sdram-stream-26-november-2026)) needs less: at full rate a median of 96 and at most 352 halfwords a frame to the DSP, 64 and at most 144 from it, because reads of a line less than 16 samples apart share one run and a line keeps its short reads in the DSP. This needs a new base feature, a module's own DSP↔SDRAM stream: see [RESEARCH-2026-11-26.md](RESEARCH-2026-11-26.md).

## The firmware

Read from QV 1.07 (usemapped image) and the emulator's runs.

**Controller memory map (external data space).** DSP program RAM 0x0000-0x017f, a DSP control register at 0x0180 (1 is written there and to 0x017f after every update), the HD44780 display at 0x0200 (command) and 0x0201 (data), LED latches at 0x0400, 0x0600 and 0x0800, battery RAM at 0x8000-0xffff. User programs are 128-byte records at 0xce00 + 128 n; the edit buffer is at 0x8300 with the name at +0x6a. Factory programs are at ROM 0xd2fe + 128 n.

**Configurations.** Five base programs: a pointer table at ROM 0x8efa, programs at 0x8f04 + 0x180 n, loaded by 0x8edd. Blocks laid over them use the byte 0x22 for "leave unchanged". RAM 0x8392 holds the configuration and 0x8332 the reverb type (0 plate, 1 room, 2 chamber, 3 hall, 4 reverse). The record's byte 0x32 uses other numbers: 0-3 among the reverbs, 3 for the delays.

| # (RAM 0x8392) | Configuration | Reverb memory |
| --- | --- | --- |
| 0 | EQ, pitch, delay, reverb | 0xa000-0xffff (24K words) |
| 1 | Leslie, delay, reverb | not read yet |
| 2 | graphic EQ, delay | none |
| 3 | 5-band EQ, pitch, delay | none |
| 4 | 3-band EQ, reverb | almost all 64K |

**A reverb program, step by step (SMALL ROOM):**

| Steps | What |
| --- | --- |
| 00-01, 5c-5f | output reads and writes, input |
| 02-12 | the 3-band input EQ: low shelf, mid peak, high shelf (record bytes 0x00-0x0c) |
| 13-14 | pre-delay |
| 15-22 | seven input allpasses, g 0.625, 192 to 1077 samples |
| 23-4a | the tank: entry, decay gains, allpasses whose output overwrites their own tail cell to continue the delay line, one-pole damping and a DC blocker per half |
| 35/36 | an interpolated, LFO-swept delay read, rewritten by the timer interrupt (0x0e60-0x0f27) |
| 4b-5b | seven output taps per side |

The gate's settings are written by 0x6de7-0x6e5d, the gate itself runs from the main loop at 0x9fef (see The gate).

**Record bytes (configuration 4, from the sweep):**

| Byte | What it drives |
| --- | --- |
| 0x39 | decay (steps 24, 2d, 31, 3f, 43, 47) |
| 0x3a | diffusion (the tank's allpass coefficients) |
| 0x3b, 0x3c | the two damping filters |
| 0x3d | the input section (15-22) |
| 0x3e, 0x47 | output taps |
| 0x44 | reverb type: the whole program is rebuilt |
| 0x32 | configuration |
| 0x45 | steps 53 and 5c |
| 0x00-0x0c | the input EQ: low 0x00-0x03, mid 0x04-0x08, high 0x09-0x0c |
| 0x34, 0x37, 0x38 | steps 12-14 |

In the graphic-EQ configuration, bytes 0x01-0x0b are the eleven band gains: 14 is 0 dB, one step is 1 dB.

## Next steps

1. **The base stream channel** (owner's decision, 26 November 2026), on a branch of the cumulative base draft (#2079); plan in [RESEARCH-2026-11-26.md](RESEARCH-2026-11-26.md). Run on the owner's MKII on 26 November 2026, RAM-booted dev twins, each stopped and playing a heavy pattern (CPU meter about 700). Probe A (ColdFire to DSP core 0) at 64, 128 and 160 halfwords a frame, with a 5-minute soak at 160: every block intact, no stall. Probe B (core 0 to ColdFire) at 64, 128, 160 and 256: every block intact (none bad, missing, out of order or stale), no stall, no late frame entry; transfers of 4.8, 9.1, 11.2 and 17.7 µs, the same as writes. Both together at 160 each, a 5-minute soak playing: 869,002 blocks out and 868,587 back, all intact, no stall, no late entry; the frame interrupt's unmask came 228 µs (stopped) and 244 µs (playing) into the frame on average, against stock's 197-217, and at worst at 328 µs of the 363 µs frame (90 %). At 256 alone the worst was already 319 µs (88 %), mostly stock's own jitter (its baseline peaked at 299 µs). So 160-256 halfwords each way per core is the proven range; 384, 560 and both ways at 560 were not run (the owner's call), as larger blocks risk running into the next frame. The frame interrupt, not memory or DMA, limits the channel, and its budget is per core, shared by every instance on that core. What the engine needs is in [ENGINE.md](ENGINE.md#what-the-base-must-provide): per instance a median of 96 halfwords in and 64 out a frame, at most 352 and 144; one instance fits 160 each way (proven both ways) in 59 of the 76 programs and 256 (proven for reads only) in 68, and the 8 plates (17-19, 52, 53, 66, 78, 79) need 336-352 in. Next: core 1, one mailbox per FX2 position, a fixed latency, an SDRAM echo, and how much more than 256 a frame can carry, or a channel that spreads its transfers over the frame.
2. **The sweeps on the DSP.** Done in the prototype (26 November 2026, [ENGINE.md](ENGINE.md#modulation-on-the-dsp-26-november-2026)): the sweeps, pitch shift and Leslie step on the DSP as the firmware steps them, a tick every 10.73 samples (samples a tick as on the original), and rewrite the engine's tables; the tables match the firmware's tick by tick and the code runs bit-exact against the model. Only 5 STEREO FLANGE and 30 MONO FLANGE fit the buffer; the rest need the stream. Still open: the Leslie's speed switching (its MIDI sources, bits 2ch.0 and 2ah.4, not traced; the engine plays each Leslie's default speed), the MIDI offsets on rate and depth, and VERB SHIFTER (only in gated 73).
3. **The gate's detector.** The algorithm is read (The gate). Missing: the detector itself, which is hardware. Choose an envelope, threshold and time constant for the module's own detector, label them as assumptions, and drive P3.2 from it in the emulator to render the gated programs.
4. **The engine** (owner's decisions, 26 November 2026: full rate with the programs untouched, about 400 cycles a sample at most): each program compiled to straight-line DSP code when it is picked, the sweeps rewriting its tables. Design and prices in [ENGINE.md](ENGINE.md). With the SDRAM stream every program but the gated ones fits the FX2 buffer, and each runs bit for bit in `dsp_host` with the stream's ColdFire side modelled: reverbs, delays, sweeps, pitch shifts and Leslies, a swept tap through the stream too. With the stream every program costs 207-310 cycles a sample on average, 316 in the dearest block (BALLAD SNARE 2), of which the copies are 6-57. Next: the base's channel (step 1), cheaper ticks (about 125 cycles for a sweep, 367 for a Leslie), the ring clear spread over calls, and code switched at a pick.
5. **Word width** (owner, 26 November 2026): 24-bit words in the DSP ring, floored to 16 bits only where a word crosses SDRAM; an assumption, labelled as one. The numbers behind it are in [ENGINE.md](ENGINE.md#word-width-the-input-to-the-owners-decision).
6. **Listen.** Render the programs and judge them by ear; compare with published recordings of the Quadraverb where they exist, labelled as such.
7. An FX2 id: the USB base gives each installed effect module its own of 109 ([docs/OCTATRACK_MORE_EFFECT_IDS.md](../../../docs/OCTATRACK_MORE_EFFECT_IDS.md)), so the module needs no pinned one.
8. The other ROMs (QV+ 2.03, GT 1.03) need their factory-table and RAM addresses added to `ROMS` in `tools/machine.mjs`; the routines should be the same shape.

## Authorship

Alesis made the Quadraverb (1989), and its programs and firmware are theirs. The firmware's credits read: software by Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara), hardware by Keith Barr and Alan Zak. Shipping programs read from the ROM, and their compiled sources, has the owner's waiver (25 and 27 November 2026), as Midiverb I/II had. The emulator, the DSP model and the tools here are Modwerk's own, under the repository's MIT licence; they copy nothing from the firmware. The idea that a write scales the accumulator came from Wavefront's application notes for the AL3201 (AN3201-04 and AN3201-06), a later Keith Barr design.
