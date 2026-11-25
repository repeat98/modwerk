# Mackity testing

Every result below was observed on 25 November 2026, on the files with these
SHA-256 hashes:

| File | SHA-256 |
|---|---|
| mackity.asm | `34a4bb44e0cbe605c4ded1826fcb14190beef43d58a41875c9b2f4c1ea599614` |
| reference.py | `0b14a758aabd3fdff3b62b52db0918bfae8887c6fa1e31a2a258802357a47b0c` |
| verify.py | `edb488c3c991d47ffeb809d5a3d0c01967fab33def9384d54358ea788937333e` |
| test_reference.py | `5dae0f2d7b1321690957b372a38bebcc86b7123da90c0cfe6bc852786db56722` |

The DSP tools (dsp_asm, dsp_host, dsp56kDisassemble) were built from octabam
`f7d7290663135ff8bc4ea18aa45d2854a7b332c1`, in WSL2 on Windows 11. Upstream is
Airwindows `e718c9bcfcdd736deeddb08bffe6bce2aa8e0eea`,
`plugins/LinuxVST/src/Mackity`, kept in `upstream/`.

## On the unit

25 November 2026, the owner's development unit, on the released base 0.8.1
(`eb6679620d0c9ed7`), by an agent through the unit queue. Package
`5a58d4cc9ce2e5c2878ddafab9fa4437d4ded051066e1d0788307693330b39ac`, built from this
folder with `npm run module:dev -- mackity --build-only --cycles 226
--cycles-kind executed --state 32` (208 DSP words, 472 bytes).

- `npm run device -- try <package> --seconds 30`: the loader accepted it and
  ran it as a trial in RAM for 30 seconds. Verdict from the unit's log: no
  crash, stall, freeze or skipped track. Rolled back at the end; the unit was
  back on `eb6679620d0c9ed7`, generation 2.
- The base's refusal counter rose by about one every 4 seconds during the
  trial. It rose the same way with no module installed (9 to 14 in 20
  seconds, serve running): the session's requests to a release base, not the
  module.
- `npm run device:test` did not run on that base: the release base answers no
  development requests ("build it with --dev").

### Agent test on the unit (device:test), 2026-11-25

The same package, on the owner's MKII RAM-booted on development twin
`8fd6d456abf3865b` of base 0.8.1, through the unit queue. The project's banks
A-E play only patterns on Part 1, whose working copy differs from its saved
one; so, on the owner's choice, trigs were placed on T1 and T5 (steps 1, 5, 9,
13) of empty bank F pattern 1, whose Part 1 equals its saved copy, in the
twin's RAM only. Afterwards the release image (`eb6679620d0c9ed7`) was booted
back and the inventory read the same nine modules as before.

Command: `npm run device:test -- --share SOCK --testing-entry run.md mackity.mwrm`

- Installed as a trial in RAM and rolled back at the end: nothing was kept.
- Self-test with the package installed: passed; modules 1/1 intact, 1 with DSP
  effects; together 1/1 ran (last batch `- - - - 0x1a - - -`); peaks CPU 45.5 %,
  T1-4 33.8 %, T5-8 49.8 %; longest frame 406 us; card set 4, 0/1.
- MACKITY on FX2 alone: T1 peak 419 per mille of a frame, admitted in 118 ms;
  T5 peak 498 per mille, admitted in 117 ms.
- On all eight tracks at once, playing: CPU 458, T1-4 peak 663, T5-8 peak 743
  per mille.
- Part switches: 12 of 12 ran their own effects within 3 s.
- Crash test: not run (device:test has none).
- Inventory at the end: the same as before the run. Result: passed.

Bank F's Part has no samples on its tracks, so the effect ran on silence there:
this proves install, admission, CPU and stability, not the sound.

Not tested on the unit by an agent: listening, MIDI, scenes and recording, the
module beside the other installed modules, the Keep, a power cycle and what
survives it.

## Stock flows

Not tested. As a buffer-free insert with all its state in the track's own
block, it touches no stock flow; that is a reading of the code, not a test.

## Host test: the model against the original

`python3 -B test_reference.py` (no tools): 5 tests, OK.

- The coefficient words in mackity.asm are upstream's, derived again from
  MackityProc.cpp's formulas at 44.1 kHz.
- Against upstream's algorithm in double precision, with its output limited at
  full scale where it goes over: the level within 0.001 dB and everything else
  under −100 dB for nine cases. They cover TRIM 0, 5, 13, 40, 64 and 127, PAD 0, 100
  and 127, and tones from 100 Hz to 9.1 kHz at up to −1 dBFS.
- TRIM 13 and PAD 127 give exactly unity gain words.
- A noise burst's tail ends in exact silence at TRIM 13 and 127.
- After knob moves the glides settle exactly on their targets.

## Render gate: the assembly against the model

`python3 -B verify.py` (dsp_asm, dsp_host, disassembler): every gate PASS.

- All 20 products disassemble as the signed `mpy`/`mac x0,y1` form. There is no
  `rep`, `mpysu` or `macsu`. The state stays within X:(r7+$00..$1e).
- Bit for bit the model: stereo noise at the defaults; a −1 dBFS tone at
  TRIM 127; knob automation over both ranges (TRIM 0–127, PAD 0–127, a
  one-block step at block 60); a 5-frame trig split every block; a TRIM word
  carrying an LFO's fraction bits (`-pword 0:0=1eb700`); garbage in the state
  block before init (`-dirty 0x5a5a5a`); and two instances with their own knobs.
- Silence in gives exact silence out at TRIM/PAD 13/127, 127/127, 0/0 and
  64/64. A burst's tail at TRIM 127 ends in exact silence.

## Sound quality

`npm run fx:audit -- plan`, then each signal rendered through the assembled
module in dsp_host (mono in, both channels, 16-frame blocks), then
`fx:audit -- check`. The same signals went through upstream's algorithm in
double precision (reference.float_mackity, output limited at full scale) for
comparison.

| Setting | Aliasing, worst tone | Rails | DC | Idle | The original |
|---|---|---|---|---|---|
| TRIM 13, PAD 127 | −28.7 dBc (9.1 kHz, −1 dBFS); −73.2 at −12 dBFS | 0 | < −140 dBFS | digital silence | identical aliasing and harmonics; residual −132 dBc against the port's −110 |
| TRIM 40, PAD 100 | −6.7 dBc (9.1 kHz, −1 dBFS); −52.9 at 1.1 kHz, −12 dBFS | 0 | ≤ −121 dBFS | digital silence | identical in every column |
| TRIM 127, PAD 127 | −6.2 dBc (9.1 kHz, −1 dBFS) | up to 11,486 | ≤ −117 dBFS | digital silence | identical, rail counts included |

The audit's −60 dBc aliasing limit is not met above moderate levels, and it
is left that way on purpose. The original has exactly the same aliasing at
44.1 kHz: the clip and the v⁵ curve make harmonics that fold back, which is
part of Mackity's sound. Oversampling would change the algorithm being ported.
The samples on the rails at TRIM 127 are the original's own peaks over full
scale (+0.4 dB on these tones), limited by the 24-bit store. They are
deliberate and not a wrap: the original's output, limited the same way, has the
same counts. PAD 120 or lower keeps them.

## Performance

dsp_host's cycle meter reads 225.3 cycles a sample at the defaults and at
TRIM 127. The work is the same at every setting: the sample loop has no conditional
branches. Not measured on a unit; the CPU price (`resources.cpuPrice`) and
`evidence/performance.json` are still to do.
