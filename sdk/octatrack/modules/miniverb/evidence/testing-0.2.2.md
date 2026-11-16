# Mini Verb 0.2.2-experimental testing

This update only lowers DSP cost. Two `move #>…,y1` coefficient reloads in the
input diffusers (173 and 449 samples) loaded the value `y1` already held from
the diffuser before them, with only reads of `y1` in between. They are removed.
Disassembly of both programs differs in exactly those two instructions (four
words); the sample loop's `do` end word moves by four and every relative branch
keeps its encoding. No new instruction form is used. Controls, defaults, the
native manifest, FX ID 0x17, the 16K ring and the X:(r7+$20..$3f) block are
unchanged. The exact published 0.2.1 source is preserved as
[upstream/miniverb-0.2.1.asm](../upstream/miniverb-0.2.1.asm).

No physical device was flashed, played or rebooted for this source. Earlier
records keep their versions: [0.2.1](testing-0.2.1.md) (the mixer fix,
#428 and its owner approval) and [0.2.0](testing-0.2.0.md).

## Three cost measures, kept apart

| Measure | 0.2.0 | 0.2.1 | 0.2.2 | Source |
| --- | ---: | ---: | ---: | --- |
| Modeled cycles/sample: static sample-loop word span (`tools/build/cycle_count.py`) | 411 | 415 | **411** | verify.py |
| Executed instructions/sample, worst matched single instance, both cores | 360.75 | 364.75 | **362.75** | benchmark.py |
| Chip cycles/sample on hardware | 665 (core 1) | not measured | **not measured** | owner's MKII, 11 Oct 2026 |

The modeled figure counts words: a two-word instruction (a long immediate, an
absolute address) counts two, and memory contention and pipeline stalls are not
modeled. The Octatrack USB loader charges a modeled or executed claim at 7/4
until a hardware figure exists: 411 is charged 720 chip cycles, within the
smaller core's 726 left for one module beside seven stock slots of 342; 415
would be 727 and refused.

The hardware figure is the 0.2.0 row of "Measured on the owner's MKII
(11 October 2026)" in
[OCTATRACK_ELEKLOADER_MIGRATION.md](../../../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md):
idle-pass meters, FX2 on T1 against NONE, the dearest of three knob settings.
It is 1.62 times 0.2.0's modeled 411 and 1.84 times its executed 360.75, so an
executed-instruction claim for Mini Verb would be undercharged by the 7/4 rule;
keep the modeled claim. It is not a measurement of 0.2.1 or 0.2.2.

## Matched comparison with worst-case SPRING REV

[benchmark.py](../benchmark.py) follows Air Chorus's matched protocol: one instance
on each core (positions 0 and 4), audio at X:0, 4,096 blocks of 16 frames,
identical tone/transient input, the null stub's peak subtracted per split and
core, trigger splits 0 to 15. SPRING REV runs fixed at defaults, at each TYPE,
and with the moving schedule (minima, maxima, ramps, endpoint jumps, every
TYPE); Mini Verb fixed at defaults, TONE 0 and TONE 127, and moving. Statistics
are in [evidence/stock-comparison-0.2.2.json](stock-comparison-0.2.2.json).

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

## Bit-identity with 0.2.1 and native DSP regression — 13 October 2026

All **75 checks passed** in [verify.py](../verify.py); exact source hashes and
verdicts are in [evidence/dsp-regression-0.2.2.json](dsp-regression-0.2.2.json).
The new gates compare 0.2.2 with the assembled published 0.2.1 program:

- eight instances, four per core, moving controls, mixed splits 1/3/7/15:
  bit-identical;
- one instance per core with moving controls, every split 0 to 15: bit-identical;
- 0.9 FS 733 Hz input, MIX 32, TONE 0, 64 and 127, split 7, both cores:
  bit-identical.

Separately, Modwerk's builder-path bench (`sdk/machines/octatrack/elekloader/dspbench`,
Elekloader's `dsp_assemble`, scratch X:$20-$FF clobbered before every call)
found both builds bit-identical over 6,000 blocks of noise with every knob
moving, at splits 0, 1, 7 and 15.

Every earlier gate still passes with the same values as 0.2.1: exact dry at
MIX 0, neutral voice within 4 LSB of 0.2.0, the raw-wet mixer regression
(0.9 FS: 468.25 LSB against 0.2.0's 1,737,799.75), Tone endpoint spectra,
eight-instance isolation, dirty X/Y state and the 30-second guarded moving
render. Sound quality (`npm run fx:audit`: aliasing, DC, clipping, idle) was not
tested for this source; its output is bit-identical to 0.2.1, which was not
audited either.

| Measurement | 0.2.2 | 0.2.1 |
| --- | ---: | ---: |
| Assembled program | 532 words | 536 |
| Eight moving instances, four per core, mixed splits | 23,488 instructions/core/block | 23,616 |
| Eight neutral instances | 21,220 instructions/core/block | 21,348 |
| 30-second moving eight-instance guarded render | 82,688 blocks, 23,488 peak; zero clipping or guard violations | 23,616 |

Reproduce with the developer's private original MAIN OS, a disposable Octabam
tree (this checkout's `sdk/octabam` with the patched `vendor/` and
`out/raw/section_3_MAIN_OS.bin`) and a `dsp_host` built from this checkout's
`tools/harness/dsp_host/dsp_host.cpp` (SHA-256
`27257a3ee152d812629dc9880eb9abbb1d05b6df1dfb558f73d0d251bbf2d921`):

```sh
DSP_HOST=/abs/dsp_host python3 -B sdk/octabam/modules/miniverb/verify.py \
  --sdk /abs/disposable/octabam --stock /abs/private/section_3_MAIN_OS.bin \
  --output /abs/private/miniverb-0.2.2-results
DSP_HOST=/abs/dsp_host python3 -B sdk/octabam/modules/miniverb/benchmark.py \
  --sdk /abs/disposable/octabam --output /abs/private/miniverb-0.2.2-bench \
  --asm 'MINIVERB 0.2.0=/abs/upstream/miniverb-0.2.0.asm' \
  --asm 'MINIVERB 0.2.1=/abs/upstream/miniverb-0.2.1.asm' \
  --asm 'MINIVERB 0.2.2=/abs/miniverb.asm'
```

The stock MAIN OS SHA-256 is
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`. Raw dumps,
inputs, meters and WAVs stay private; only statistics are committed.

## Software resource bounds

The audited loop is 411 modeled cycles/sample. Two split process calls per
16-sample block cost 6,576 loop cycles, plus twice all 121 outside-loop words,
twice 128 ring-clear stores, 32 initialization stores and a 256-cycle setup,
branch and return allowance: **7,362 modeled cycles**, rounded up to **8,192
modeled cycles/instance/block** as before. Four instances per core with the
inherited 1,415 cycles/sample stock reserve total 55,408 of the arithmetic
72,560/core/block. This conditional model excludes chip memory contention.

Per instance: 49,920 logical bytes (full inherited X block and the 16K Y ring).
Shared: both programs 1,064 words (3,192 bytes) and the 384-byte hardware stack
capacity. Eight instances: **402,936 logical bytes**. No new ColdFire code,
table, CPU RAM or allocation.

## Not yet done for this source

- Native/browser composition parity (`npm run module:verify -- miniverb --os …`),
  the isolated Docker package build and its import, and the regenerated Analog BD
  companion proof.
- The USB loader package: once the package import carries 0.2.2, set Mini Verb's
  `cycles` in `src/engine/assets/octatrack-module-packages.json` (and the
  elekloader README command) from 0.2.1's 415 to 411 and run
  `npm run octatrack:module-packages`.
- LCD captures: the committed ones are from 0.2.1; 0.2.2 changes no page.
- Owner approval of this exact source. Hardware, chip timing, played
  automation, Part/project persistence, physical reboot, maximum load and the
  original #428 noise remain unverified.

## Hardware steps for a private 0.2.2 build

Follow the 0.2.1 steps in [evidence/testing-0.2.1.md](testing-0.2.1.md)
with the 0.2.2 image, and in addition: load Mini Verb over USB with seven
stock effects on the other slots of core 0 (T5–T8 FX1/FX2) and check it is
admitted; read PROJ > MODWERK > MODULE LOAD and the LOAD meters with TONE 0 on
T1 and T5 and record the measured chip cycles per sample. Report failures and
untested steps.
