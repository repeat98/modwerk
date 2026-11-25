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

### Test procedure on the unit, 2026-11-25

`npm run test:procedure -- mackity --package mackity.mwrm --pick-pattern 2
--measure-pattern 4 --soak-seconds 120` on the owner's MKII, RAM-booted on
development twin `8fd6d456` of base 0.8.1, through the unit queue. Build:
revision `ccbb96b6c06a`, package SHA-256
`5a58d4cc9ce2e5c2878ddafab9fa4437d4ded051066e1d0788307693330b39ac` (the same
package as above). Scene: the project's bank C, Part 1 reloaded in RAM to its
saved copy (on the owner's OK; the card kept its working copy, which the release
boot afterwards brought back), picks on the empty C02, readings on C04 (trigs on
steps 1/5/9/13 of T1-T4, T6, T7). The release image `eb6679620d0c9ed7` was booted
back afterwards and the inventory read the owner's nine kept modules, as before.

| # | Step | Result |
|---|---|---|
| 1 | Software checks (`module:doctor`) | passed |
| 2 | Beside every other module | not run by the procedure: the doctor's compatibility line (step 1) |
| 3 | Name the build | passed |
| 4 | DSP cost model (`cycle-scan check`) | passed |
| 5 | Emulator rehearsal | not run: no emulator session |
| 6 | Read the unit | passed |
| 7 | Scripted unit pass (`device:test`) | passed: alone on FX2 of T1 and T5, eight at once while playing, 12 Part switches, self-test passed, inventory unchanged |
| 8 | Soak, 120 s | passed: no crash, stall, freeze or skipped track; rolled back |
| 9 | Cost on the unit (`device:price` with `--curve T1,T3,T6,T7`) | passed: frame interrupt +0.1 points in use on T1 FX2, 0 at rest; CPU meter +0; DSP T1-4 +8.1 points; curve first 0.9, each 0.9; admitted on C02 and C04 with no dropped render and no stall |
| 10 | Put back | passed |
| 11 | Agent by hand | the screens below; the rest not run |
| 12 | Submitter's own stage | not run: the owner asked for it to be released without it ("you can merge and get it live yourself", 25 Nov 2026) |

Two attempts before it stopped short, and why: on C01 (eight busy tracks) the
pick was refused with CPU FULL ("MACKITY NEEDS +3 %", ColdFire CPU at 99 %), so
the picks moved to the empty C02; and the soak's first MIDI message was refused
until the Windows MIDI bridge was reopened after the RAM boot. Neither touched
the module.

The readings are in `evidence/cpu-price.json` and `evidence/frame-cost.json`.

#### Edge cases

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Eight instances at once | per-instance state in r7, DSP load | device:test, all eight tracks playing | pass: CPU 458, DSP peaks 663/743 per mille |
| A trig split | glide and snap per call | verify.py `-split 5`; perf.py splits 1-15 | pass (bit-exact; worst 228.2) |
| A full pattern (CPU FULL) | admission | the pick on C01 | refused cleanly with CPU FULL; no crash |
| Part switches | knob words change with the Part | device:test, 12 switches | pass: 12 of 12 within 3 s |
| Silence after audio | a 24-bit limit cycle | verify.py, host test | pass: exact silence |
| Part/project reload, power cycle | stored knob bytes | not run: no Keep | not run |

### Screens

Read off the unit's LCD with the development session's `png:` step during a RAM
trial of the same package, on the twin, bank F, T2: `media/mackity-chooser.png`
(FX1 SETUP, Mackity selected) and `media/mackity-main.png` (its FX1 page). Their
provenance and hashes are in `media/capture.json`.

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

`python3 -B perf.py` (and `--stress`), then `npm run perf:audit -- check
evidence/performance.json --stamp`:

| Check | Result |
|---|---|
| record | dsp record for mackity@0.1.0-experimental |
| cycles | 4 x 251 = 1,004 of 3,120 a sample per core (32 %); measured 228.2 per instance |
| stock benchmark | 228.2 vs LO-FI 290.06 (0.79x); the dearest stock effect is 330.94 |
| stress | 4 per core, eight tracks, 3 LFOs and 12 locked slots, 2 s, no clobber, no hang |

Unsplit, every case reads 225.30 executed instructions a sample: the sample loop
has no conditional branch. The stress run's instance at core 1 position 2 put out
samples from silence: the harness writes a word a block into that audio block, as
a do-nothing module in the same layout shows. On the unit: see the test procedure
above.
