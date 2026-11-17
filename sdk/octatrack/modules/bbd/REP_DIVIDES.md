# `rep` divides in an effect's process routine crackle core B

Found while bringing up the BBD Delay draft (FX2, id `0x0e`) on hardware, 11 Oct 2026.
Octatrack MKII, OS 1.40C, private images BBD01–BBD03.

## Summary

BBD's process routine ran 24-step divides as `rep #$18` / `div x0,a`, once or twice per
call. On track 1 with FILTER or PHASER on FX1, core B (payload B, tracks 1–4) crackled
continuously. Changing STGS made clicks, and after a few changes all four tracks on core B went
silent. Replacing each `rep` with a one-instruction `do` loop removed every symptom on hardware.
The results are bit-identical.

**Rule:** do not use `rep` in an effect's `init` or `proc`. Write
`do #$18,>label / div x0,a / label:` instead. Neither stock payload contains a single `rep` or
`div`.

## Symptoms (BBD01)

- **Track scope:** only with BBD on **T1's FX2**. The same BBD on T5 (core A) was clean.
  Three BBDs at once on T2, T3 and T4 were also clean, which rules out total load.
- **FX1 dependence:** it needed one of the heavier FX1 effects on T1.

  | T1 FX1 | Result |
  |---|---|
  | FILTER, PHASER | Crackle |
  | NONE, EQUALIZER, DJ EQ, FLANGER, CHORUS, SPATIALIZER, COMB, COMPRESSOR | Clean |

  COMPRESSOR and NONE still crackled occasionally while samples played on T1.
- **Not BBD's own output:** the crackle persisted at MIX 0 (BBD's exact dry pass), at FDBK 0,
  with T1 muted and with T1's level at 0. TIME did not change its pitch.
- **On a knife-edge:** FILTER BASE/WIDTH changed its loudness, FILTER's page-2 DIST
  stopped it, playing a kick on T1 made it louder, and the order of setup mattered.
- **STGS:** each change on T1 made a digital artefact, and core B eventually went silent until a
  power cycle. The STGS clear ran `rep #$100` of Y stores, 256 cycles with interrupts held
  off. On an older, heavier project the first symptom was a loud high-pitched tone, which
  `docs/contributing/FAILURE_MODES.md` lists as the deep-overrun signature.

## Bisect (BBD02)

BBD02 added a DIAG selector on page-2 slot 8 and replaced the STGS clear/reset `rep`s with
`do` loops. Each mode skips one part of the routine. The test was T1 with FILTER on FX1:

| DIAG | What runs | Crackle |
|---|---|---|
| NORM | Everything | yes |
| DRY | Nothing (`proc` returns at entry) | no |
| CTRL | Per-call control code, divides included; no sample loop | yes |
| BURN | A `do` loop of `nop`s matching the sample loop's cycle count, no memory traffic | no |
| NDIV | The full sample loop; per-call divides skipped | no (the delay was audible) |

CTRL crackling while BURN and NDIV were clean isolates the per-call `rep` divides. Cycle
count and memory traffic are not the cause.

## Fix (BBD03)

All three remaining `rep #$18 / div x0,a` sites became `do #$18,>label / div x0,a / label:`.
BBD's gates passed with unchanged residuals against the reference model. On hardware:

- **FILTER on T1's FX1:** no crackle, with or without a kick playing.
- **PHASER on T1's FX1:** no clicks.
- **STGS changes on T1 and T5:** clean, and tracks 1–4 keep playing.
- **The original heavier project:** fine.

A `div` sequence survives interruption: the interrupt saves and restores SR (including C),
and payload B's two host interrupts (`P:0x36d`, `P:0x37c`) touch only `a1`, which they save
to `x:$200`/`x:$201` and restore.

## Mechanism (inferred, not measured)

`rep` is not interruptible. Payload B has two live interrupt vectors (`P:0x10`, `P:0x12`):
host commands that program DMA channels 0 and 1 for the ColdFire's audio transfers (DCR
`$8e82c0` / `$8e8a50`, X space). T1 is the first track core B processes after its
frame handshake. Holding interrupts off at that point for ~24–30 cycles, once or twice per
call, plausibly delays the DMA set-up past its deadline. The result would be a frame-level
glitch on core B's output, which explains why muting T1 did not help. Heavier FX1s and voice
playback move the divides into or out of that window. Later tracks run after the window has
passed, and core A has a different interrupt set.

The interrupt timing was not observed directly. The ColdFire port (`ot_emu`) reproduced none
of this: its DSP cores run lock-step with no real host-port timing, its main mixdown reads a
gain of 0, and core 1's output only reaches the port through core 0.

## Other modules with `rep` in `proc`

All three are `rep #$18` divides and were not tested for this:

| Module | Sites (line numbers in its `.asm`) |
|---|---|
| `modules/character/character.asm` | 176, 225, 357, 397, 525 |
| `modules/spectrum/spectrum.asm` | 235, 353, 476, 493 |
| `modules/modulation/modulation.asm` | 1034 |

Whether each site runs every call or only on a knob change was not checked. Character's FX2
instance is a dry pass, so its exposure would be on FX1. A module is most likely to show it
on T1, behind another effect on the same track, with samples playing.

## How it was found

- **Free tests on the BBD01 image** (FX1 NONE per track, BBD on other tracks, MIX/FDBK/TIME,
  track mute) narrowed it to T1 plus the FX1 effect.
- **Static checks ruled out:**
  - Y-slot overlap with stock code
  - Payload B's frame buffers (X:`$2000`/`$4000`, not Y)
  - Interrupt-handler register use
  - Code placement (internal P on both payloads)
  - Instruction forms with no stock precedent other than `rep`/`div`
- **ColdFire-port runs** confirmed BBD's allocator base (`0x4000`), r7 (`0x6200`), call pattern
  (one call per frame, n7 = 16) and memory writes (its own block only) on core 1. They did not
  reproduce the fault.
- **The DIAG image** gave the answer in one flash.

## Suggested follow-ups

- Add this to `docs/contributing/FAILURE_MODES.md` and the traps in octabam's `AGENTS.md`:
  "no `rep` in `init`/`proc`; stock has none".
- A build check that refuses `rep` in a module's DSP source, the way `verify_initregs.py`
  refuses an `init` that writes r1.
- Hardware-test Character, Spectrum and Modulation on T1 behind FILTER with samples playing,
  then convert their divides the same way.
