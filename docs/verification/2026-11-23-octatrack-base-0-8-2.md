# Octatrack base 0.8.2: the recorder update's CS1 skip, 23 November 2026

Source: `base/octatrack-next` on main `4c35b504a` (base 0.8.1) plus `mw_rec_update` (`status.s`), hooked at
`0x4000432c` (`build_core.py`'s `DYNLOAD_HOOKS`). Idea and hardware figures for the technique: Bryan T.

## What changes

Stock's recorder control-record update runs about 1.5 times a frame for every recording track. It stores the clamped
length in the track's 44-byte record at `0x46c938c4 + 44 × id`, reads `[r+300]` and `[r+308]` of its CS1 record
(`0x100d38f0 + 1096 × id`) and writes six fields. The base's copy keeps stock's arithmetic and every other write, but
stores `[r+300]` and `[r+308]` only when the new value differs from the one it read. It reads them under stock's own
interrupt mask (stock reads them just before taking it), so no interrupt can store between the read and the skipped
write: CS1 ends as stock leaves it. The routine is replaced whole; nothing else patches `0x4000432c..0x400043f2`
(`modules:compat` and the base build's `catalogue_overlaps` pass).

## Emulator A/B (`sdk/machines/octatrack/elekloader/rec-harness/`)

Stock's routine and the base's, on two emulated machines, 1,000,000 random calls: ids 0-9; zero, short, negative and
large lengths; the flag; other writers storing into all six CS1 fields and the 44-byte records between calls; the tempo
words moving; repeated calls as in steady recording; SR at 0x2700 or lower masks. After every call, every register, the
CS1 records of ids 0-9, the 44-byte records and the arguments on the stack equal stock's. SR's system byte equals
stock's; its condition codes, and the same five bits of d0 (which ends holding SR), differ, and no C caller reads them
after a call. **PASS.** CS1 writes a call: stock 4.49, base 3.02 (6 and 4 on a call that runs the whole routine with
both values unchanged).

The harness found one mistake on the way: stock's indexed store into the 44-byte record is at +16 (objdump prints that
form's displacement in hex), not +10.

## Builds (OS 1.40C, outside Git)

| Build | Identity / MAIN.raw SHA-256 |
| --- | --- |
| Release 0.8.2 (`octatrack:base -- --beta --write`) | base `6852c1ff706094a7…`; browser = native `.bin` `4afe6fef21f7b63c…` (831,484 bytes), +220 bytes on 0.8.1 |
| Development twin of 0.8.1 (main `4c35b504a`), beta flags without controller rows, `--dev` | MAIN `ace30d0ffa6b1ee4…`, RAM-booted as `4c7eb79b844c8139…` |
| Development twin of 0.8.2, the same flags | MAIN `db0a7f9b29da8b56…` |

## On the owner's MKII

The unit started on another session's RAM-booted development twin `d7e727cd84cf2d99…` (flashed base 0.8
`e11525835106699a…`), with an empty inventory and card set 4. Its recorder setup on track 1 read INAB A B, INCD C D,
RLEN MAX, TRIG ONE, SRC3 MAIN, LOOP ON, 16 s.

The RAM boot of the 0.8.1 twin `4c7eb79b` staged and armed, and the unit did not come back on USB within 60 s, nor in
the ten minutes after (#1985's symptom: about one RAM boot in three on 22 November). No measurement ran.

## Not run

- The CPU A/B with eight tracks recording (TRACK + REC1 on each, `guard` and ten `stats` readings each on the 0.8.1 and
  0.8.2 twins), and a byte check of the recorded buffers.
- A RAM boot of the release image `6852c1ff`, a trial on it, a Keep, a power cycle and a flash.
- The unit was left off USB after the 0.8.1 twin's RAM boot; a power cycle returns it to the flashed 0.8.

## 24 November 2026: the boot stub with the late-combine guard (#2028)

`build_stub.py` now compiles `stub.s`, `stub.c` and `slots.c` one by one with `-fno-late-combine-instructions` and runs
`check_mcf54455` on the two C objects, as every other ColdFire C compile of the base does. The stub's code is 890 bytes
(was 900), `stub_body.c` `5be076c9…` (was `89b61a6d…`); `STUB_VERSION` stays 1, so units already on two slots keep their
stub and only a unit converted from this base on gets the new one.

- Release 0.8.2 rebuilt: base `c5791ec973ba6e76…` (was `6852c1ff`); browser = native `.bin` `a9d3c56a082c1513…`
  (831,484 bytes); MAIN 1,348,058 bytes (12 fewer). Base-bound packages relinked with unchanged bytes.
- Emulator: `check_stub.py` passed all six slot states on #2028's build (its description has the record).
- Not run on a unit: a two-slot conversion writes the stub to NOR at `0x4000` and only a cold start runs it. The A/B and
  release-image steps above now apply to `c5791ec9` instead of `6852c1ff`.

## 24 November 2026: the CPU record's own tracks, and the slot behind an in-use refusal

`diag.c`'s CPU record keeps every track refused since the start in its top byte and adds the tracks refused since the
previous CPU record in bits 16-23 (per-track counters that `cpu_refuse` and `status.c`'s frame admission bump; no shared word is cleared), the count now in
the low 16 bits. `dsp.c` keeps the slot whose running effect made its admission return `RUNTIME_IN_USE`, and the self-test record
carries it above the refusal (`selftest.h`, bits 16-23) only while the loader's refusal is that admission's
(`RUNTIME_CHECK_DSP`): Analog BD's and Output Matrix's controllers refuse in use too, and an earlier sync's slot must not
name a track for them. So the site names the track and FX slot.

- Release 0.8.2 rebuilt: base `8f179f5eb41220d9…` (was `c5791ec9`); browser = native `.bin` `b5336893689f44a3…`
  (831,616 bytes); container 831,600 bytes (132 more). The resident port's `dsp.c` hunks moved 4 lines, re-pinned.
  Base-bound packages relinked with unchanged bytes; Analog BD's reviewed recipe still matches.
- Host: `test_diag.c` (a second record names only its new track), `test_status.c` (a frame-admission refusal moves its track's counter: on a twin a POLY8 pick refused on T3 had logged recent tracks 0), `test_dsp.c` (T6's FX2 slot) and `test_selftest.c`
  (the slot above an admission's refusal, none above a controller's) pass; each fails without the change.
- On a unit: a development twin of this source, below. Not run: the release image itself, and an in-use refusal.
  The steps above now apply to `8f179f5e` instead of `c5791ec9`.

### On the owner's MKII, 24 November 2026

Source `6663f66d1`; `test:procedure -- --base --no-unit` passed steps 1-4 on it (package `566cc2d6…`). Development twin
`58babe99` (`build_core.py`, the beta flags without the controller rows, plus `--dev`, OS 1.40C, outside Git); a twin of
`bfe28f137`, `b2d608af`, ran the first CPU case. The unit started and ended on its flashed base `eb667962` (0.8.1) with nine
kept modules. Three RAM boots, the CF card in, nothing kept or flashed. The loaded project's Part 1 was checked equal to its
saved copy (6,322 bytes) before each case and after it, and its saved copy never changed.

| What | Twin | Observed |
| --- | --- | --- |
| POLY8 0.3.3 in a trial, picked on T1, then on T3, stopped | `b2d608af` | T1 admitted; T3 refused: "CPU FULL, T3 SRC, POLY8 NEEDS +46%, CPU 95%". CPU record `a=0x04000001`: T3 since the start, no recent track (the fault `751daf8fa` fixes). RELOAD put Part 1 back; the trial rolled back. |
| The same | `58babe99` | The same box. Record `a=0x04040001`: T3 since the start and since the last record, count 1. The record's machines show T3 on its old machine: a refused pick never reaches the track, so the pull prints "this time T3 stock", not POLY8. |
| Mini Verb in a trial on T6 FX2, the trial left to end | `b2d608af` | Rolled back: a trial's rollback parks the effect (T6 FX2 read NONE until RELOAD), so it is no in-use refusal. Self-test record: refusal 0, slot 0. |
| 18 packages as one set, 225,044 bytes, 30 s | `58babe99` | Installed, no crash, stall, freeze or skipped track; rolled back to none. |
| The other 20, 225,208 bytes, 30 s | `58babe99` | The same; CPU at 90 % or more for 1.5 s, no fault. |
| Back on the flashed base | `eb667962` | The same nine modules and handles; card set 1, 9 saved, 9 live. |

- Not run: an in-use refusal on a unit (it needs a module installed outside a trial, which on a twin takes a Keep that
  rewrites the card's kept-set file); the soak (it drives the loaded project over USB MIDI); the price; the release image.
- `test:procedure -- --base`'s large set (39 packages) was refused `RUNTIME_CONFLICT` on this twin: it holds RINGMOD SC,
  which a twin without controller rows does not admit, and its 449,088 bytes pass the module pool (0.8.1: 396,428 did not
  fit). Run as the two sets above, without RINGMOD SC.
