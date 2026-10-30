# DRUMMAP testing

## Commands and exact revision

Source: branch `module/drummap`, `sdk/drafts/drummap/` at the revision in `tests.evidenceRevision` of the manifest.
Host: Ubuntu 24.04, gcc 13.3, Python 3.13; ColdFire: m68k-elf-gcc 16.2.0 and binutils 2.47 (the toolchain image's versions).

```sh
python3 -B sdk/drafts/drummap/test_engine.py   # engine under ASan/UBSan, glue freestanding, package record
python3 -B sdk/drafts/drummap/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| `dm_level` against DrumMap's `ReadDrumMap`, as written with `uint8_t` arithmetic, over every x, every third y, the three parts and 32 steps (2,113,536 cases) | identical |
| Hits where the level clears 255 − fill and accents above 192, without chaos, over parts, positions, fills and lengths 1–64; the 32-step repeat; FILL 0 plays nothing; FILL 127 every step with a level | pass |
| Chaos never removes a hit, and the two passes of a 64-step track differ for some seeds | pass |
| Record writer: trigs and VOL locks per step, a user's PTCH lock kept and its step marked lock-only, FX1 lock past the length kept, swing kept, mirror identical, rewrite idempotent, AVEL OFF writes no VOL lock | pass |
| Nine-byte settings packing: 4,000 settings round-trip, every byte below 128, an all-ones record unpacks inside every range | pass |
| `machine.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package: the `ot_machines` record (ABI 1, 80 bytes, `DM` 1–1, BACKING, order 60) at the registry's index, four-byte aligned, every entry even and inside the image | pass; module id dbb21015, 7,804 bytes of code and data, 676 of bss, 130 relocations, 1 hook, 0 stock-code sites |

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model, the base's identity, the package's SHA-256,
the samples, what was turned and what was heard.

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: SRC SETUP on FLEX, STATIC, THRU and
PICKUP tracks; the machine list with POLY8, Analog BD, VECTOR and FM Synth beside it; SRC SETUP on a DRUMMAP track
(the sample's own setup); the double tap on the track key (stock's sample pool); holding a trig (stock's page and
locks); the LEVEL push; Part and project save and reload; a track left to FLEX (the pattern stays, the signature goes).
Deliberate changes: none beyond what every machine takes through the base (the SRC page while the track is
DRUMMAP's, with the LEVEL push to stock's sample controls).

## Timing

The stock sequencer plays the trigs: tempo, speed, length and swing are its. To verify in the emulator or on a unit: a
pattern with swing, a track speed other than 1x, per-track length, a tempo change and a pattern change while playing.
Not run.

## Performance

Not measured. `evidence/performance.json` holds the method with every number null. The work is one 64-step map read
and an in-place record rewrite per edit on the UI task; nothing runs at interrupt level or while playing.

## Resources

From the package header: 7,804 bytes of ColdFire code and data (with Grids' 2,400-byte map) and 676 of bss, one
instance, in the base's module DRAM. No DSP memory, no heap. Stack use is the UI task's and was not measured.

## Hardware

Untested.

## OT UI capture evidence

Pending: SRC SETUP with DRUMMAP in the machine list and the SRC page, captured in the headless emulator
(`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence in `media/capture.json`.
