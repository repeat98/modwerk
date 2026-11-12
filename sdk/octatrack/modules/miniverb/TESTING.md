# Mini Verb 0.2.3-experimental testing

This update keeps Mini Verb out of Sidechain Compressor's key window. Its delay
ring was modulo 16,384 (`m4 = m5 = $3fff`), so the write head passed over every
word of its FX2 slot although its lines end at ring position 13,749. On T3 and
T7 the last 514 words of that slot (+$3DFE..+$3FFF) are Sidechain's cross-core
key window, so a card build with both corrupted each other. The ring now wraps
at 15,870 words (`m4 = m5 = $3dfd`); FX2 slot bases are 16K-aligned, which the
16K ring already relied on. Start-up keeps 0.2.2's 128 dry calls: the first four
clear nothing, the last 124 clear 128 words each under the ring's modulus (the
first of them wraps two words to the ring start), and `m4` goes back to linear
before that path returns. `manifest.py` declares `buffer_words=15870`.

Six program words are added, all outside the sample loop (a compare and a
branch for the empty calls, and the restored `m4`). No line, tap, delay,
control, default, FX ID or X state changes. The exact published 0.2.2 source is
preserved as [upstream/miniverb-0.2.2.asm](upstream/miniverb-0.2.2.asm).

No physical device was flashed, played or rebooted for this source. Earlier
records keep their versions: [0.2.2](evidence/testing-0.2.2.md) (two redundant
coefficient reloads removed), [0.2.1](evidence/testing-0.2.1.md) (the mixer fix,
#428 and its owner approval) and [0.2.0](evidence/testing-0.2.0.md).

## Three cost measures, kept apart

| Measure | 0.2.0 | 0.2.1 | 0.2.2 | 0.2.3 | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| Modeled cycles/sample: static sample-loop word span (`tools/build/cycle_count.py`) | 411 | 415 | 411 | **411** | verify.py |
| Executed instructions/sample, worst matched single instance, both cores | 360.75 | 364.75 | 362.75 | **362.75** (loop unchanged, not re-run) | benchmark.py |
| Chip cycles/sample on hardware | 665 (core 1) | not measured | not measured | **not measured** | owner's MKII, 11 Oct 2026 |

The modeled figure counts words: a two-word instruction (a long immediate, an
absolute address) counts two, and memory contention and pipeline stalls are not
modeled. The Octatrack USB loader charges a modeled or executed claim at 7/4
until a hardware figure exists: 411 is charged 720 chip cycles, within the
smaller core's 726 left for one module beside seven stock slots of 342; 415
would be 727 and refused.

The hardware figure is the 0.2.0 row of "Measured on the owner's MKII
(11 October 2026)" in
[OCTATRACK_ELEKLOADER_MIGRATION.md](../../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md):
idle-pass meters, FX2 on T1 against NONE, the dearest of three knob settings.
It is 1.62 times 0.2.0's modeled 411 and 1.84 times its executed 360.75, so an
executed-instruction claim for Mini Verb would be undercharged by the 7/4 rule;
keep the modeled claim. It is not a measurement of 0.2.1, 0.2.2 or 0.2.3.

## Matched comparison with worst-case SPRING REV

[benchmark.py](benchmark.py) follows Air Chorus's matched protocol: one instance
on each core (positions 0 and 4), audio at X:0, 4,096 blocks of 16 frames,
identical tone/transient input, the null stub's peak subtracted per split and
core, trigger splits 0 to 15. SPRING REV runs fixed at defaults, at each TYPE,
and with the moving schedule (minima, maxima, ramps, endpoint jumps, every
TYPE); Mini Verb fixed at defaults, TONE 0 and TONE 127, and moving. Statistics
are in [evidence/stock-comparison-0.2.2.json](evidence/stock-comparison-0.2.2.json). It was not
re-run for 0.2.3: the sample loop is the same, and the eight-instance renders below
execute exactly 0.2.2's instructions per block.

| Effect | Unsplit worst | Worst over splits | Worst case | Ratio to SPRING |
| --- | ---: | ---: | --- | ---: |
| SPRING REV | 257.5 | **314.0** | TYPE 0, split 4 | 1.000 |
| Mini Verb 0.2.0 | 357.375 | 360.75 | TONE 0, split 1 | 1.149 |
| Mini Verb 0.2.1 | 361.375 | 364.75 | TONE 0, split 1 | 1.162 |
| Mini Verb 0.2.2 | 359.375 | **362.75** | TONE 0, split 1 | **1.155** |

Executed instructions/sample, identical on both cores. Splits cost SPRING up to
56.5 instructions/sample and Mini Verb 3.4. Its dark Tone path (TONE below 64)
is the dearest; TONE 64 skips the tone pole. On the owner's MKII the dearest
stock SPRING REV measured 299 / 288 chip cycles/sample (core 1 / core 0), so the
0.2.0 hardware ratio was about 2.2, not the emulator's 1.15: stock code runs
near one cycle per instruction and Mini Verb did not. That gap is unexplained
by these runs.

## Bit-identity with 0.2.2, the window and native DSP regression — 20 October 2026

All **76 checks passed** in [verify.py](verify.py); exact source hashes and
verdicts are in [evidence/dsp-regression-0.2.3.json](evidence/dsp-regression-0.2.3.json).
The identity gates compare 0.2.3 with the assembled published 0.2.2 program,
from the first block, start-up included:

- eight instances, four per core, moving controls, mixed splits 1/3/7/15:
  bit-identical;
- one instance per core with moving controls, every split 0 to 15: bit-identical;
- 0.9 FS 733 Hz input, MIX 32, TONE 0, 64 and 127, split 7, both cores:
  bit-identical.

The window: `dsp_host -guard 15870 -guard-shared` allows each instance to write
only the first 15,870 words of its allocation, in core-private Y and in the
shared window where T3's and T7's slots lie. Eight moving instances, the
dirty-memory start and the 30-second moving render write nothing past it (0
stray write regions on every instance). The same guard on published 0.2.2
reports 770 stray write regions on every instance, so the gate catches the
fault it is for. Over dirty memory, all eight instances stay silent after init,
so nothing reads the unused tail. Until this version the guard gates counted
the text `0 stray write regions`, which `770 stray write regions` also contains;
they now match the whole number.

Every earlier gate still passes with the same values as 0.2.2: exact dry at
MIX 0, neutral voice within 4 LSB of 0.2.0, the raw-wet mixer regression, Tone
endpoint spectra, eight-instance isolation and dirty X/Y state. Sound quality
(`npm run fx:audit`) was not tested; output is bit-identical to 0.2.2, which was
not audited either.

| Measurement | 0.2.3 | 0.2.2 |
| --- | ---: | ---: |
| Assembled program | 538 words | 532 |
| Eight moving instances, four per core, mixed splits | 23,488 instructions/core/block | 23,488 |
| Eight neutral instances | 21,220 instructions/core/block | 21,220 |
| 30-second moving eight-instance guarded render | 82,688 blocks, 23,488 peak; zero clipping or guard violations | 82,688 blocks, 23,488 peak |

Reproduce with the developer's private original MAIN OS, a disposable Octabam
tree (this checkout's `sdk/octabam` with the patched `vendor/` and
`out/raw/section_3_MAIN_OS.bin`) and a `dsp_host` built from this checkout's
`tools/harness/dsp_host/dsp_host.cpp` (SHA-256
`27257a3ee152d812629dc9880eb9abbb1d05b6df1dfb558f73d0d251bbf2d921`):

```sh
DSP_HOST=/abs/dsp_host python3 -B sdk/octabam/modules/miniverb/verify.py \
  --sdk /abs/disposable/octabam --stock /abs/private/section_3_MAIN_OS.bin \
  --output /abs/private/miniverb-0.2.3-results
DSP_HOST=/abs/dsp_host python3 -B sdk/octabam/modules/miniverb/benchmark.py \
  --sdk /abs/disposable/octabam --output /abs/private/miniverb-0.2.3-bench \
  --asm 'MINIVERB 0.2.0=/abs/upstream/miniverb-0.2.0.asm' \
  --asm 'MINIVERB 0.2.1=/abs/upstream/miniverb-0.2.1.asm' \
  --asm 'MINIVERB 0.2.2=/abs/upstream/miniverb-0.2.2.asm' \
  --asm 'MINIVERB 0.2.3=/abs/miniverb.asm'
```

The stock MAIN OS SHA-256 is
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`. Raw dumps,
inputs, meters and WAVs stay private; only statistics are committed.

## Software resource bounds

The audited loop is 411 modeled cycles/sample. Two split process calls per
16-sample block cost 6,576 loop cycles, plus twice all 127 outside-loop words,
twice 128 ring-clear stores, 32 initialization stores and a 256-cycle setup,
branch and return allowance: **7,374 modeled cycles**, rounded up to **8,192
modeled cycles/instance/block** as before. Four instances per core with the
inherited 1,415 cycles/sample stock reserve total 55,408 of the arithmetic
72,560/core/block. This conditional model excludes chip memory contention.

Per instance: 49,920 logical bytes (full inherited X block and the 16K Y
allocation, of which the ring uses 15,870 words). Shared: both programs 1,076
words (3,228 bytes) and the 384-byte hardware stack capacity. Eight instances:
**402,972 logical bytes**. No new ColdFire code,
table, CPU RAM or allocation.

## Not yet done for this source

- Native/browser composition parity (`npm run module:verify -- miniverb --os …`),
  the isolated Docker package build and its import, the USB package and the
  regenerated Analog BD companion proof.
- Owner approval of this exact source. Hardware, chip timing, played
  automation, Part/project persistence, physical reboot, maximum load and the
  original #428 noise remain unverified.
- Over USB the base still keeps Mini Verb off T3 and T7 while Sidechain
  Compressor is installed: it has no reviewed buffer size for any custom FX2
  effect, so it assumes the whole slot.

## Hardware steps for a private 0.2.3 build

1. Card build with Mini Verb and Sidechain Compressor. Put Mini Verb on T7's
   FX2 with T7 empty, play a loud sample on T5, and listen to T7 and MAIN: 0.2.2
   played a ghost of T5 there, 0.2.3 must not. Repeat with T3 and T1. Then set
   a COMPRESSOR keyed from another core and check the key still follows it.
2. Then follow the 0.2.1 steps in [evidence/testing-0.2.1.md](evidence/testing-0.2.1.md)
   with the 0.2.3 image. Report failures and untested steps.
