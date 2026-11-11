# Octatrack unit session, 10 November 2026

The owner's Octatrack MKII, OS 1.40C, after #1390 merged (main `077ebcd21`; the site's beta base `500cdb6f…`,
`.bin` `51dffdeb…`). The unit was driven over USB from this repository. Results below are what the unit reported, or
what the owner saw and said, as marked.

## Finding 72 on the live base

- `500cdb6f` RAM-booted on the unit (the tester image, without development requests), nothing installed.
- The owner, by hand: PROJ, DOWN, RIGHT, YES (USB DISK MODE), about 10 s, NO, PLAY. Reported: the audio plays.
  Afterwards the unit still answered over USB on that base.
- Not tested: the walk on a flashed base, a file copy inside USB DISK MODE, an OS upgrade from the card.

## A USB base update that held (#1386)

- From the flashed `18902326` to `500cdb6f` through modwerk.app, with a 19-module set.
- Right after the update: slot 1, generation 5, whole, not confirmed, no try used. After one power cycle, about
  15 s up: running slot 1, one try used, not confirmed; a few seconds later confirmed, no fall-back. All 19 modules
  restored. No stall at that start.
- So #1386's fall-back did not reproduce. Not tested: a first start that records a stall, as in the report.

## Finding 74 on the live base

Development twins of the same source (`build_core.py` with the beta flags and `--dev`, without controller rows;
`d7a2c744…`, and `5b4d38af…` with the masked-span instrumentation below), RAM-booted. E-Verb 0.1.2, TapeHead 0.1.2
and Euclid 0.1.4 installed, transport stopped, the self-test started over USB (`selftest:trace`).

| Part | Runs | Result |
| --- | --- | --- |
| FILTER on every FX1, DELAY on every FX2 | 5 | all passed; peaks CPU about 56 %, T5-8 69-71 %, longest frame 402-409 µs |
| the same with FLANGER on T5-T6 FX2, PHASER on T7-T8 FX2 (bank A Part 2) | 1, `d7a2c744` | **stalled**, below |
| the same | 15, `5b4d38af` | all passed; T5-8 peak about 75 % |

The stalled run, stall record 41: reason 1 (frames stopped), loader phase 0 and no job in flight, no rejected
packets, loader errors or eDMA errors, five selections requested and five completed. Afterwards the three effects
were still loaded on core 0 (3,356 of 4,720 words, not running), FLANGER and PHASER running, and the T5-8 meter stood
at 74 %. Only a power cycle recovered.

The instrumented twin records the base's longest fully masked span (`modwerk_masked_max`, `runtime.c`) and its
caller. Through the 15 passing runs it stayed at 1,886 DTCN3 counts, about 14 µs: far under the roughly 200 µs that
stops core 0 (OCTATRACK_HARDWARE_TRAPS.md). No stalled run was instrumented, so masked ColdFire code is not ruled out
for the stall itself.

So on the live base: 1 stall in 21 runs on the heavier Part, 0 in 5 on the lighter one, against about half the runs
on the 25 October twin. Next: instrument the host port on a stalled run, since the loader sends module code to a
nearly full core over it.

## A RAM boot that never came back on USB

The first RAM boot of `500cdb6f` from the flashed `18902326`, with a Zoom MS pedal on another hub, started (the
owner saw the missing-modules notice) but did not appear on USB within about 90 s; a power cycle returned the unit.
With the pedal unplugged, `5080b8d6` from `18902326` and then `500cdb6f` from `5080b8d6` both came back within a
minute, and every later boot did. Whether the pedal or the starting base caused it was not separated.
