# Quadraverb reverbs (draft)

Status: research, 25 November 2026. Nothing here runs on an Octatrack yet.

The goal is an FX2 effect that plays the Alesis Quadraverb's reverbs (plate, room, chamber, hall, reverse, gated) the way Midiverb I/II plays the Midiverb's programs: the original programs on a model of the original DSP. The owner's decisions (25 November 2026):

- **Reverbs only** as the first module, one effect.
- **Firmware only:** no real Quadraverb is available, so the module and its notes must say plainly that the sound has not been checked against a real unit.

Nobody has published a reverse engineering of the Quadraverb's DSP (thement and Eric Brombaugh cover only the Midiverb, Midiverb II and Midifex). This draft does that work.

## How it works so far

The Quadraverb's controller is an 80C31. Its firmware turns each program's parameters into a 96-step DSP program and keeps rewriting parts of it, such as the LFO-swept delay reads. Instead of porting that maths by hand, `tools/` runs the original firmware in a small 8051 emulator and reads what it writes into the DSP. The ROM stays on the developer's computer and never enters the repository. Use the address-unscrambled ("usemapped") image of version 1.07; `tools/machine.mjs` checks its md5.

```sh
node tools/i8051.check.mjs                      # the 8051 core's self-check
node tools/dump.mjs <rom> 10 15 17              # SMALL ROOM, Concert Hall 1, SML VOCALPLATE side by side
node tools/dump.mjs <rom> --sweep 10            # which record bytes change which DSP steps
```

`dump.mjs` prints each step as: index, op (5 bits), delay address, coefficient. The emulator boots the firmware (the display reads `PROGRAM 00 "BASIC PROGRAM"`), copies the 90 factory programs into user memory as RECALL ALL does, and recalls one with a MIDI program change.

## What is known

Read from QV 1.07 (usemapped image) and the emulator's runs.

**Controller memory map (external data space).** DSP program RAM 0x0000-0x017f, a DSP control register at 0x0180 (the timer interrupt writes it), the HD44780 display at 0x0200 (command) and 0x0201 (data), LED latches at 0x0400, 0x0600 and 0x0800, battery RAM at 0x8000-0xffff. User programs are 128-byte records at 0xce00 + 128 n; the edit buffer is at 0x8300 with the name at +0x6a. Factory programs are at ROM 0xd2fe + 128 n.

**Program format.** 96 steps of four bytes: address low, address high, coefficient high byte, op byte.

- **Op:** `byte3 & 0x1f`.
- **Coefficient:** unsigned 11 bits, `(byte2 << 3 | byte3 >> 5) / 2048`, from 0 to just under 1. The evidence:
  - DECAY runs from 0 to 0.972, monotonic.
  - DIFFUSION steps 0, 0.078 … 0.625.
  - Each damping filter's pair sums to exactly 2048/2048 (c and 1 − c).
  - The LFO's interpolation pair is f and ~f.
  - The lowest graphic-EQ band's coefficient is 2π·16 Hz/42 kHz.

  So signs and routing live in the op bits.
- **Op bits:**
  - Bit 3 writes memory.
  - Bit 0 accumulates, most likely: multi-tap sums start with 00000 and continue with 00001.
  - Bits 1, 2 and 4 are open. Candidates from the delay presets and the allpass pairs: a second register that latches the dry signal (00010 latches, 00011 adds it), a negated product, the accumulator instead of memory as the multiplier input, and the raw memory word added unscaled. The allpass is two steps, 10110 at the tail and 01010 at the head with the same coefficient. One single-line form that fits is y = d − g·x, v = x + g·y.

**Delay memory.** One circular buffer of 64K words with a pointer that counts down once a sample, so a value written at address A is read at A + d after d samples. The low addresses (up to about 0x41) serve as one-sample registers: written at A, read at A + 1 the next sample.

**Sample rate.** The firmware converts milliseconds at 42 samples each: 167, 250, 500 and 1500 ms delays sit 7015, 10501, 21001 and 63001 steps apart. So it runs at about 42 kHz.

**Input and output (hypothesis, unchecked).** The input seems to be written at 0xffff by step 0x5e, so it reads at 0x0000 in the next sample. Steps 0x00 and 0x5f read the two output words written a sample earlier: in configuration 4, 0x10 is written by step 0x54 and 0x11 by step 0x5d.

**Configurations.** Five base programs: a pointer table at ROM 0x8efa, programs at 0x8f04 + 0x180 n, loaded by 0x8edd. Blocks laid over them use the byte 0x22 for "leave unchanged":

| # | Configuration | Reverb memory |
| --- | --- | --- |
| 0 | EQ, pitch, delay, reverb | 0xa000-0xffff (24K words) |
| 1 | Leslie, delay, reverb | not read yet |
| 2 | graphic EQ, delay | none |
| 3 | 5-band EQ, pitch, delay | none |
| 4 | 3-band EQ, reverb | almost all 64K |

RAM 0x8392 holds the configuration and 0x8332 the reverb type (0 plate, 1 room, 2 chamber, 3 hall, 4 reverse). Every reverb factory program (1-3, 10-27, 52-53, 66, 78-81) uses configuration 4.

**Configuration 4, step by step (SMALL ROOM):**

| Steps | What |
| --- | --- |
| 00-04, 5d-5f | input and output |
| 05-12 | the 3-band EQ |
| 13-22 | pre-delay and the input diffusers, depending on the type |
| 23-4a | the tank: allpass, delay and decay-gain stages |
| 25-29, 37-3b | one-pole damping filters (complement coefficient pairs) |
| 35/36 | an interpolated, LFO-swept delay read, rewritten by the timer interrupt (0x0e60-0x0f27) |
| 4b-5c | output taps into the two output words |

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
| 0x00-0x0c | EQ and input |
| 0x34, 0x37, 0x38 | steps 12-14 |

## Next steps

1. **Settle op bits 1, 2 and 4.** The graphic-EQ presets 40-43 are the test bench: with every band at 0 dB the program must be flat, and a band's boost must peak at its centre (16 Hz to 16 kHz). Find the band-gain record bytes with `--sweep 40`. Then the tank's allpass pairs must be allpass and the damping filters lowpass with unity gain at DC.
2. Confirm the input and output steps, and choose the accumulator width and saturation (unknown; whatever is chosen is an assumption and is labelled as one).
3. Write the reference model in JavaScript and render every reverb program's impulse response: stable, with decay time rising with DECAY.
4. **Fit it on the Octatrack.** An FX2 slot has 16K words. Configuration 4's reverbs use nearly all 64K, so even at half the rate (21 kHz) they need about 32K. The options:
   - configuration 0's reverb (24K words, 12K at half rate: fits, a smaller tank);
   - configuration 4's at a quarter rate (lo-fi);
   - a second buffer from the base, if one exists;
   - shorter delays (no longer the original).
   The owner picks.
5. The module needs an FX2 id: none is left until the build takes ids past 0x1f (docs/OCTATRACK_MORE_EFFECT_IDS.md).
6. The other ROMs (QV+ 2.03, GT 1.03) need their factory-table and RAM addresses added to `ROMS` in `tools/machine.mjs`; the routines should be the same shape.

## Authorship

Alesis made the Quadraverb (1989), and its programs and firmware are theirs. The firmware's credits read: software by Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara), hardware by Keith Barr and Alan Zak. Shipping programs read from the ROM needs the owner's waiver, as Midiverb I/II had. The emulator and tools here are Modwerk's own, under the repository's MIT licence; they copy nothing from the firmware.
