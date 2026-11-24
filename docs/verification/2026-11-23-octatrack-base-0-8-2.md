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

## 24 November 2026: a saved-set file the start could not read

`modset.c` told a missing `MODWERK0.SET`/`MODWERK1.SET` from one it failed to read only by accident: `load()` returned 0
for both. With neither file whole, the restore zeroed the header, generation included, and said NONE_SAVED when both
failed to open or read; the next Keep sealed generation 1 into the other file, and a file that failed to read at that
start and read again later, holding a higher generation, won over the Keep at the next start.

- `load()` now returns absent (stock's open -12, no such file, or -10, an empty one: the logger's reading in
  `stock_140c.c`), read in full but no set, or unreadable (any other open failure, or any read failing). A header that
  is not whole is never trusted for its generation, since a write cut short inside it mixes new bytes with old.
- An unreadable file gives DAMAGED (5) instead of NONE_SAVED. With no whole set the next save goes first to the
  unreadable file, and every file the start could not read gets the set too before the save counts as saved (`pending`
  stays set and the second write follows at once). If the read-back fails, the save is SAVE_FAILED and retried.
- A newer file that read whole and then failed the restore's second read leaves nothing running, DAMAGED, and an empty
  `set[]` with its generation (it used to keep the other file's bytes).

Host tests (no firmware): `test_modset_card.c` (new; modset.c's own sector store and load) cuts the power before every
stock file call of a save, 328 cuts over eleven installs, removals and switches, with a file's length landing per sector
and only at close, and runs nine read-error cases; `test_modset.c` adds three on its pretend card. On `f99c1d523`'s
modset.c 13 and 6 checks fail (NONE_SAVED where DAMAGED belongs, the Keep losing at the next start); the power-cut sweep
passes there too. With the change all pass, with the elekloader `test_recipe.py` (41), `test_sets.c`, and the
`sdk/tests` saved-set, card guard, card shelf, volatile service, journal, loader, resident engine board and base-bound
suites.

- Release 0.8.2 rebuilt (pinned m68k toolchain): base `39f56803c52277b1…` (was `c5791ec9`); browser = native `.bin`
  `5205b4afbcd20e66…` (831,672 bytes); MAIN 1,348,231 bytes (`d67ce1b5f1ab09bf…`); container 831,656 of 851,712, 20,056
  free (+188 bytes on `c5791ec9`). Base-bound packages relinked.
- Not run on a unit: the read failures cannot be made on hardware. Pending on a flashed 0.8.2: a kept set restored across
  power cycles; a Keep then two power cycles; a card with neither file starting as "Nothing saved" (2), not 5, which
  checks stock's -12 in this path; PROJ held at power-on, a Keep, a power cycle.
