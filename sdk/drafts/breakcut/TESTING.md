# BREAKCUT testing

## Commands and exact revision

Source: branch `module/breakcut`, `sdk/drafts/breakcut/` at the revision in `tests.evidenceRevision` of the manifest.
Host: Ubuntu 24.04, gcc 13.3, Python 3.13; ColdFire: m68k-elf-gcc 16.2.0 and binutils 2.47 (the toolchain image's versions).

```sh
python3 -B sdk/drafts/breakcut/test_engine.py   # engine under ASan/UBSan, glue freestanding, package record
python3 -B sdk/drafts/breakcut/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| CutProc11 (ACTV 0, ROLL 0) and WarpCut (ACTV 0) play the break straight: a trig a step, slice = step mod SLCS, no micro-timing, retrig, pitch or reverse, for 1–64 slices, lengths 1–64 and eight seeds | pass |
| 22,016 lines over the four procedures, 43 seeds, ACTV and ROLL 0/42/84/126, lengths 1–64, ramps and reverses: deterministic; step 0 always a trig; slices below SLCS; micro-timing under 24; at most 15 retrigs with a period of 1–24 ticks; pitch only with a RAMP and in its direction; reverse only with REV | pass; 117,481 retrigged, 25,480 off-grid, 343,391 reversed and 73,797 pitched steps among them |
| CutProc11 at ROLL 127 stutters at phrase ends; SQPusher at ROLL 127 fills a one-bar phrase with off-grid or retrigged cuts | pass; 1,028 and 355 such steps over 128 seeds |
| RTIM scale: 24 ticks 79, 12 ticks 95, 6 ticks 111, 3 ticks 127, 48 ticks 63, monotonic | pass |
| Record writer: trig mask, STRT/PTCH/RATE/RTRG/RTIM locks and micro-timing per step, a user's VOL lock kept and its step marked lock-only, a STRT lock past the length kept, swing kept, mirror identical, rewrite idempotent | pass |
| Nine-byte settings packing: 4,000 settings round-trip, every byte below 128, an all-ones record unpacks inside every range | pass |
| `machine.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package: the `ot_machines` record (ABI 1, 80 bytes, `BC` 1–1, BACKING, order 70) at the registry's index, four-byte aligned, every entry even and inside the image | pass; module id 31df86e1, 7,696 bytes of code and data, 1,784 of bss, 139 relocations, 1 hook, 0 stock-code sites |

## Read off the unit or the emulator first

Three values in `engine.h` are calibrations a stock project settles (`ot_spec.py` / `ot_bank.py` on a saved bank, or
the emulator's RAM). `BC_STRT_PER_SLICE` is 2 since 0.1.0's review: ot-tools-io's Python port octapy (MIT) writes a
slice lock as raw STRT = slice index x 2 (`api/core/audio/step.py`, 64 slices over 0..126); still to confirm on a
sliced track by locking STRT to slice 2 and reading the lock byte (expect 4). `BC_RATE_REVERSE` (RATE's full-speed
reverse, taken as 0 with 127 the stock forward default: lock RATE to −128 and read it). And `bc_rtim`'s scale (16
values an octave with stock's default 79 at 1/16: lock RTIM to 1/32 and 1/64 and read the bytes, expecting 95 and 111).
octapy names RTIM 79 "HALF" (its machine default) and 67 "QUARTER" (`api/enums.py`, `RetrigTime`), twelve values
apart and the other way round from the scale assumed here; it gives no source for the names, so the unit decides.
Each is one line to correct.

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model, the base's identity, the package's SHA-256,
the break and its slicing, what was turned and what was heard (clicks at slice boundaries, retrig timing, reverses).

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: SRC SETUP on FLEX, STATIC, THRU and
PICKUP tracks; the machine list with POLY8, Analog BD, VECTOR and FM Synth beside it; SRC SETUP on a BREAKCUT track
(the sample's own setup, SLIC); the double tap on the track key (stock's sample pool); holding a trig (stock's page and
locks); the LEVEL push; Part and project save and reload; a track left to FLEX (the cut-up stays, the signature goes).
Deliberate changes: none beyond what every machine takes through the base (the SRC page while the track is
BREAKCUT's, with the LEVEL push to stock's sample controls).

## Timing

The stock sequencer plays the trigs, retrigs and micro-timing: tempo, speed, length and swing are its. To verify: a
pattern with swing, a track speed other than 1x, per-track length, a tempo change and a pattern change while playing;
that retrigs land on the RTIM the engine meant and that an off-grid cut sounds at its micro-timing. Not run.

## Performance

Not measured. `evidence/performance.json` holds the method with every number null. The work is one line of up to 64
steps and an in-place record rewrite per edit on the UI task; nothing runs at interrupt level or while playing.

## Resources

From the package header: 7,696 bytes of ColdFire code and data and 1,784 of bss (the generator's state, a 64-step line
and the page), one instance, in the base's module DRAM. No DSP memory, no heap. Stack use is the UI task's and was not
measured.

## Hardware

Untested.

## OT UI capture evidence

Pending: SRC SETUP with BREAKCUT in the machine list and the SRC page, captured in the headless emulator
(`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence in `media/capture.json`.
