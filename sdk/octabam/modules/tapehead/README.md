# TapeHead

Version: 0.1.2-experimental · author: @devilfish707 · algorithm: JClones (MIT)

![TapeHead: the smoothstep curve, and a sine before and after](presentation/thumbnail.svg)

Experimental module. 0.1.2 changes one thing from 0.1.1: the level the tape
model is driven at, so TapeHead on an Octatrack saturates as much as the JSFX
does in a DAW. Heard on an MKII by the author (2 Oct 2026; about three minutes
on seven tracks with p-locks and scenes). Native render, cycles, memory and
browser/native parity evidence are in TESTING.md.

## Overview

TapeHead is a DSP56300 port of `JClones_TapeHead.jsfx`, a small tape-style
saturator. The input drives a two-state coupled recursion whose corner
frequency COLOR sets. Both states go through a cubic smoothstep curve
(`1.5v - 0.5v³`, flat beyond ±1) at the DRIVE gain. A clipped copy of the
recursion's third term is added at a fixed negative gain, and TRIM sets the
output level. The output store limits at full scale, as the JSFX does with
its Clip switch on.

At low DRIVE it rounds peaks gently and tilts the tone slightly. At high
DRIVE it flattens peaks, thickens the low end and adds edge on transients.
It suits drum buses, bass and anything that sounds too clean.

It is a buffer-free insert: no allocator memory, no bus role and no absolute
Y addresses, so it runs on FX1 or FX2 of any track.

The Octatrack applies AMP VOL before the FX chain, so at the default VOL 64 a
normalized sample reaches the effect about 12 dB below where it reaches the
JSFX in a DAW. TapeHead therefore runs the JSFX at +12 dB in and −12 dB out
(`JSFX(4x) / 4`): a normalized sample at VOL 64 saturates as it does in the
JSFX, and the wet level relative to dry is the JSFX's. 0.1.1 lacked this and
saturated far less than the JSFX at the same DRIVE (22 dB less distortion at
the default DRIVE 36).

The module was written and heard on hardware in octabam (12 Sep 2026). The
first native render against the float JSFX, made for this port, found three
defects in that build. This version fixes them, so **it sounds different from
the octabam build**. Details are under [Tests and measurements](#tests-and-measurements).

## Controls

All three controls are on the FX main page. The SETUP page has no TapeHead
controls.

| slot | control | default | range | what it does |
|---|---|---|---|---|
| 0 | DRIVE | 36 | 0–127 | Drive into the smoothstep curves. 0–127 maps to the JSFX drive 1–10, a gain of 0.8× to 8×. 36 is about the JSFX default 3.5. AMP VOL also drives it (see Overview). |
| 1 | TRIM | 18 | 0–127 | Output trim. 0 is 0 dB, 127 is −21 dB, linear in dB. 18 is the JSFX default −3 dB. Higher values are quieter. |
| 2 | COLOR | NORM | NORM / MED / BRGT | Corner of the recursion: 2100, 3680 or 5000 Hz. Higher corners let more top end into the saturator. |

DRIVE and TRIM are continuous where the JSFX has 10 and 22 integer steps.
The ranges and formulas are the JSFX's; each knob is a degree-5 polynomial
fit of the formula, within 4.7e-4 of it over the whole knob.

The JSFX Clip switch is not exposed: Clip is always on, which is the JSFX
default. Q1.23 cannot carry the unclipped mode's values above 1.

## Usage

1. Select an audio track that plays a sample.
2. Hold FUNC and press FX2 (or FX1) to open its SETUP. Turn LEVEL to
   TAPEHEAD and press YES.
3. Press FX2 (or FX1) for the main page.

A useful start on drums: DRIVE 70, TRIM 30, COLOR NORM. Raise DRIVE until the
transients round off, then use TRIM to match the level with the effect
bypassed.

## Quick tutorial: saturate a drum loop

1. **Set up.** On a track playing a drum loop, hold FUNC and press FX2, turn LEVEL to TAPEHEAD and press YES. Press FX2 to see DRIVE 36, TRIM 18 and COLOR NORM.
2. **Drive it.** Turn DRIVE to 100: the peaks flatten and the kick thickens. Turn TRIM to about 40 to bring the level down. Switch COLOR to BRGT for more top end, NORM for a darker tone.
3. **Compare.** Choose NONE in FX2 SETUP to compare with the dry track. Re-selecting TAPEHEAD clears its internal state.

## Compatibility and limitations

- Location: FX1 or FX2, any of the eight tracks. Effect ID 0x1f, which is
  not a stock ID and no Octamod module claims. Build priority 17 (after
  Euclid's 16) and harness letter `4`. The ledger check found no clash with
  the eleven Octamod modules; `make modules` stays the arbiter.
- OS 1.40C only, as for every Octamod module. MKI and MKII use the same DSP
  code; the MKII panel has been captured in the emulator only.
- 44.1 kHz is assumed for the COLOR corners.
- AMP VOL is part of the drive. At VOL 64 a 0 dBFS sample just reaches the
  JSFX's input clip; above it, full-scale peaks are hard-clipped at the
  input, as a signal hotter than 0 dBFS would be in a DAW. Turn VOL down
  for a softer result at high DRIVE.
- The cost is 295 cycles/sample per instance by the static counter,
  whatever the settings. Eight instances on one core (FX1 and FX2 on four
  tracks) price at 2,360 of the 3,120 cycles/core modules may use, leaving
  760 for everything else on that core. Selections that also carry
  heavy modules on the same tracks may not fit; the build's cycle check
  decides.
- Projects saved with 0.1.1 or the octabam build keep working: the ID (0x1f) and the
  slot layout (DRIVE, TRIM, COLOR on slots 0–2, COLOR a 3-way select) are
  unchanged.
- The octabam build heard on 12 Sep 2026 had different arithmetic (see below).
  If you liked that sound, it is not this one.

## Tests and measurements

See [TESTING.md](TESTING.md) for commands and numbers. In short:

- **Against the JSFX (emulator):** `verify.py` assembles `tapehead.asm`,
  runs it in `dsp_host` and compares it with `reference.py`. Peak error is
  5.4e-4 (in the JSFX's units) over COLOR × DRIVE {0, 36, 127} × TRIM
  {0, 18, 127} × six signals at two levels: −2 dBFS, and 0.22 FS (a
  normalized sample at VOL 64). Silence in gives silence out, COLOR 1
  renders MEDIUM, the stereo channels are independent, the sample routines
  are straight-line and no `mpysu` remains. At DRIVE 36 a normalized 100 Hz
  sine at the unit's level has −11.0 dB THD against the JSFX's −11.1 dB at
  0 dBFS (0.1.1: −33.7 dB). In the composed test image it renders within
  6.0e-5 of the reference at the defaults.
- **Against SPRING REV (emulator, `benchmark.py`):**

  | | TapeHead | Spring Reverb |
  |---|---:|---:|
  | one instance, instructions per sample | 274 | 262 |
  | four per core, worst peak per 16-sample block | 18,000 | 20,376 |
  | DSP program | 422 words | 1,063 words |
  | FX2 instance buffer | none | 16,384 words |
  | state | 31 words of its r7 block | — |

- **Fixed in this port**, each found by the first render (the octabam build
  measured a peak error of 1.6):
  1. The branchless MIN stages returned 2 × min. Smoothstep ran at twice the
     drive and evaluated past ±1, where the cubic folds back, and the clipped
     y3 term was doubled.
  2. The `|g3| · y3` term reaches 1.16 and was stored at full scale, which
     limits it at 0.99999. The half is now stored.
  3. Page-1 values arrive as value << 16, but COLOR was compared with 1, so
     MED selected BRGT.
- **Fixed in 0.1.2** (after the 0.1.1 hardware listen, "saturates less than
  the JSFX"): the input level. AMP VOL's (v/127)² ahead of the FX left a
  normalized sample 12 dB short of the JSFX's drive. The fixed +12 dB in /
  −12 dB out above restores it; the 12 extra instructions were won back in
  the recursion with bit-identical output, so 0.1.2 costs 7 cycles/sample
  more than 0.1.1.
- **Composed build:** `tapehead-spring` builds, packs into
  `OCTATRACK_OCTABAM7.bin` with a valid checksum. `verify_menu`,
  `verify_initregs`, `verify_replaces --image` and `label_fmt` pass.
- **On hardware (MKII, 2 Oct 2026):** after 0.1.1 under-saturated, the level
  fix (OCTABAM6) was compared with the JSFX and reported working. This
  source's image (OCTABAM7) sounded the same over about three minutes with
  TapeHead on seven tracks under p-lock automation and scenes. A listening
  test, not a stress run.
- **Hardware coverage:** author-reported operation and parameter locks, accepted by the owner. Model, duration and maximum tested load are unknown. The owner removed the mandatory one-hour stress run; the complete record is in [hardware evidence](evidence/hardware.md).

## Authorship and licences

- TapeHead port, manifest, gate, reference model and documentation:
  @devilfish707, MIT ([LICENSE](LICENSE)).
- Algorithm: `JClones_TapeHead.jsfx`, Copyright (c) 2026 JClones, MIT. The
  full notice is in [LICENSE](LICENSE) and
  [`../../licenses/jsfxclones.txt`](../../licenses/jsfxclones.txt).
- Built and verified with the octabam SDK, Copyright (c) 2026 Sam Banks, MIT.
- The thumbnail is original, drawn from `reference.py`'s output. It is an
  illustration, not an Octatrack screenshot.
- No Elektron firmware, extracted routines or tables are included.

## Screens and audio

Captured from the MKII panel of the Octamod emulator running the 0.1.2
hardware test image (`hardware-test-remix.py`, BUILD=7): real LCD pixels, not
a reconstruction. They are byte-identical to the 0.1.1 captures: 0.1.2 does
not change the menu, controls or labels.

![TAPEHEAD assigned in FX2 SETUP](media/ot-location.png)

![TAPEHEAD's main page: DRIVE, TRIM, COLOR](media/ot-controls.png)

![COLOR set to MED](media/ot-color.png)

**Audio preview.** [Listen](media/audio-preview.mp3). One 909 drum loop, played three times through TapeHead: DRIVE 10, then DRIVE 70, then DRIVE 115 with COLOR set to BRGT. Each pass is level-matched to the first, so only the character changes. It is an offline render on a computer through the module's own code, not a recording of an Octatrack. The sample, settings and method are in [audio-preview.json](media/audio-preview.json); rights are in [media rights](media/LICENSE.md).

## Files

| file | what it is |
|---|---|
| `tapehead.asm` | the DSP56300 source |
| `manifest.py` | the native declaration: ID, menu, controls, gate |
| `verify.py` | the render gate (standalone `dsp_host`, no firmware) |
| `reference.py` | the float JSFX and the knob mapping |
| `gen_constants.py` | prints every hex constant in `tapehead.asm` |
| `benchmark.py` | instruction counts against stock SPRING REV (needs your local 1.40C) |
| `hardware-test-remix.py` | the remix the OCTABAM2 test image was built from |
| `media/` | emulator LCD captures and their provenance |
| `octamod.module.json` | website metadata |
| `evidence/` | cycles, exact memory, benchmark and attributed hardware reports |
| `presentation/thumbnail.svg` | the card illustration |


## Publication evidence, 2 October 2026

The owner accepted the author-reported listening/parameter-lock test and removed
the mandatory 60-minute, eight-track stress requirement. This version includes
the exact same DSP instructions as the reported hardware image; its hash was
reproduced locally. Model, duration and maximum hardware workload remain unknown.
See [the actual report](evidence/hardware.md), [worst-case code-cycle model](evidence/cycles.md),
[exact memory inventory](evidence/memory.md) and [reproduced full benchmark](evidence/benchmark.md).
The static model prices eight inserts per core, including split/reselection
overhead; it is not a chip wall-clock measurement or a hardware maximum-load pass.
Fresh actual monochrome LCD captures were reviewed in the MKII emulator.
The [native/browser integration record](evidence/parity.md) includes complete
composition and packaging identities, refusal coverage and reproduction steps.

The algorithm is the **JClones VladG TapeHead clone**, pinned to JSFXClones
`88a1503d668c378ced4c166e772378272f3b72ea`, [original JSFX](https://github.com/JClones/JSFXClones/blob/88a1503d668c378ced4c166e772378272f3b72ea/jsfx/JClones_TapeHead.jsfx).
JClones is credited for the original implementation, devilfish707 for the port,
and Sam Banks for the SDK. Full MIT notices accompany the source and site.
The inspected source does not establish an Airwindows derivation.
