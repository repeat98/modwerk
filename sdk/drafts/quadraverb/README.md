# Quadraverb reverbs (draft)

Status: research, 26 November 2026. A model of the DSP plays the factory reverbs on the developer's computer. Nothing here runs on an Octatrack yet.

The goal is an FX2 effect that plays the Alesis Quadraverb's reverbs (plate, room, chamber, hall, reverse, gated) the way Midiverb I/II plays the Midiverb's programs: the original programs on a model of the original DSP. The owner's decisions (25 November 2026):

- **Reverbs only** as the first module, one effect.
- **Firmware only:** no real Quadraverb is available, so the module and its notes must say plainly that the sound has not been checked against a real unit.

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

The firmware rewrites parts of the running program, about 3,000 times a second per step (every 14 samples or so). 81 of the 90 factory programs are modulated:

| Kind | Programs | What moves |
| --- | --- | --- |
| Swept tap | every reverb (one pair), chorus, flange and echo programs (two pairs, left and right) | an interpolated read: two steps at addresses a and a + 1 with coefficients 1 − f and f, f in 1/256 |
| Pitch shift | 7, 37, 51, 59, 60, 70, 86 | two taps sawing across a 256-sample window, crossfaded by steps 0x16 and 0x1a |
| Leslie | 8, 38, 39, 67, 82 | two swept pairs, and the gains at steps 0x0f, 0x11, 0x17 and 0x19 |
| Gate | 3, 23, 26 (silent on the model) | driven at run time (0x6ff4-0x70bd); not read yet |
| Other | 73 VERB SHIFTER | several steps, rarely |

The static ones: the four delays (40-43), PINGPONG DELAY, SKANK GUITAR, the VELOCITY ECHOs and MEDIUM HALL.

Sweeps measured on the emulator (6 s runs): STEREO CHORUS moves 356 samples over 4.1 s as a triangle, STEREO FLANGE 198 samples over 3.9 s, the reverbs 262 samples over 2.45 s, close to a sine. So a sweep is a few numbers (range, period, waveform, phase), which the DSP can generate itself, as Air Chorus and Vibrato do, instead of the ColdFire streaming updates.

## Memory

Midiverb's relocation (`generate.mjs`: every read becomes a delay line and a delay, dead reads dropped, lines packed head to tail) applied to all 90 programs, with each sweep's full range: they need 0.5K-63K words at 42 kHz. One FX2 instance gets at most 15,870 words (16,384 if it gives up block 3; `elekloader/dsp.c`). At half rate, 29 programs fit untouched. With the longest line shortened by up to 15 %, about 18 more. The plates and gated programs need about 24K, the 1.5 s delays 31.5K.

## The firmware

Read from QV 1.07 (usemapped image) and the emulator's runs.

**Controller memory map (external data space).** DSP program RAM 0x0000-0x017f, a DSP control register at 0x0180 (the timer interrupt writes it), the HD44780 display at 0x0200 (command) and 0x0201 (data), LED latches at 0x0400, 0x0600 and 0x0800, battery RAM at 0x8000-0xffff. User programs are 128-byte records at 0xce00 + 128 n; the edit buffer is at 0x8300 with the name at +0x6a. Factory programs are at ROM 0xd2fe + 128 n.

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

Gate types are written by 0x6ff4-0x70bd.

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

1. **The LFO.** The timer interrupt rewrites the swept delay reads (0x0e60-0x0f27). The model sees one snapshot. Port the update rule or record it from the emulator.
2. **The gate.** The gated programs (23-27) stay silent: the firmware drives the gate at run time (0x6ff4-0x70bd). Same approach as the LFO.
3. **Word width and saturation.** Unknown. Whatever is chosen is an assumption and is labelled as one.
4. **Listen.** Render the reverbs and judge them by ear; compare with published recordings of the Quadraverb where they exist, labelled as such.
5. **Fit it on the Octatrack.** An FX2 slot has 16K words. The reverbs use nearly all 64K, so even at half the rate (21 kHz) they need about 32K. The options:
   - configuration 0's reverb (24K words, 12K at half rate: fits, a smaller tank);
   - the full reverbs at a quarter rate (lo-fi);
   - a second buffer from the base, if one exists;
   - shorter delays (no longer the original).
   The owner picks.
6. The module needs an FX2 id: none is left until the build takes ids past 0x1f (docs/OCTATRACK_MORE_EFFECT_IDS.md).
7. The other ROMs (QV+ 2.03, GT 1.03) need their factory-table and RAM addresses added to `ROMS` in `tools/machine.mjs`; the routines should be the same shape.

## Authorship

Alesis made the Quadraverb (1989), and its programs and firmware are theirs. The firmware's credits read: software by Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara), hardware by Keith Barr and Alan Zak. Shipping programs read from the ROM needs the owner's waiver, as Midiverb I/II had. The emulator, the DSP model and the tools here are Modwerk's own, under the repository's MIT licence; they copy nothing from the firmware. The idea that a write scales the accumulator came from Wavefront's application notes for the AL3201 (AN3201-04 and AN3201-06), a later Keith Barr design.
