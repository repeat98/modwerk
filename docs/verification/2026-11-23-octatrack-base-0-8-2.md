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
