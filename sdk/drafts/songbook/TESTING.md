# Songbook testing

Version 0.1.0-experimental, called Arr Setlists until 22 November 2026. Host gate, emulator runs and the developer's own tests on their MKI (flashed base
`6c189889…`), each on the named build below; the last build tested on the unit is package `08d0833a…` (source
`f068cd608`), on base 0.7.13.

## Host gate

`verify.py`: 88 checks of songbook.c against simulated battery RAM and simulated stock file routines: switching
both ways, arr09-arr128 named and written 8 at a time, book 1's backup and arr01-08 repaired on return, a file that
will not read never written back, refusals (playing, card busy, no project), reinstall and power-cycle detection by
the battery record, SAVE and RELOAD PROJECT, returning to where a project was left (in stock's order of hooks and its two
load jobs, and a write between them), arranger mode after LOAD, the label. Passes.

## Emulator (ot_emu, adapted, beta base, OS 1.40C MKI layout), 18 November 2026

Not hardware evidence. Package `songbook.mwrm` built from this folder, trial over the emulator's USB link
(`--dsp-rt`), a project created on an empty Set, the card written back (`--card-rw`).

- Book 1 to 2: stock's SYNC TO CARD job ran (NOW SAFE TO EJECT!), book 2 came up with 8 empty arrangements, the label
  read BOOK 2. Five rows added on book 2. Book 2 to 3 to 2: its five rows back. Back to book 1: its three rows back,
  unchanged. Book 1 to 2 again: the five rows.
- On the card afterwards: arr01-arr08.work, ARR01.BAK-ARR08.BAK and arr09-arr16.work, all 11,336 bytes; arr09 has
  stock's header and differs from arr01 in 9 bytes.
- Earlier build (own file format, same switching): a power cycle on book 2 with no project load kept book 2 in the
  slots and the module took it as book 2; a power cycle with the project loaded put book 1 in the slots, as recorded.
  Switching after that power-up could not be checked here (this emulator then reports "no project"): on the unit.
- Not run in the emulator: SAVE PROJECT and RELOAD PROJECT, switching while playing, removing the module on book 2,
  a file that will not read.

## On the unit

Andrey Sidorkin's MKI, flashed base `6c189889…`, scratch project, 18 November 2026. The development base did not
upload over USB that day (four attempts dropped at 10-20 %), so my driven stage 1 could not run: a 10-second and a
15-second trial of package `101941a7…` logged no crash, stall, freeze or skipped track, and it was kept for the
developer's own test.

- As the developer reported it: the label stepped BOOK 1 to BOOK 16 in about half a second a press, but ARR > CHANGE's
  list kept book 1's names, and an arrangement opened straight from it still showed book 1's rows. Leaving to the main
  screen showed the new book's (empty) arrangement; reopening CHANGE showed its names.
- A 2-minute trial of a diagnostic build counted, on the unit: each switch to a new book cleared all 8 arrangements
  (arrangement 1 then had 0 rows); book 1 read its 8 backup files back. So the switch worked and only the open list
  was stale: stock draws it once, when it opens.
- Fixed in the next build: after a switch the module has stock draw the open list again (0x40036e18). Under ot_emu,
  names SONG ALPHA, BRAVO, CHARLIE on book 1: RIGHT showed an empty list with BOOK 2 at once, LEFT the three names.
  On the unit (package `caab80cb…`, kept): books 3 and up showed empty lists at once; book 2 showed book 1's names.
  As the developer reported it, a clean run on books 3 and 4 then passed: rows added on book 3 came back after book 4,
  book 1 was unchanged, book 4 stayed empty. Book 2's copy of book 1 dates from the first test, before the fix;
  how it was written is not known.
- The developer asked that each book come back on the arrangement last chosen in it. Built with stock's own choice,
  select_arr (0x400a03a0), and the list's cursor moved onto it. Under ot_emu: book 1 on arrangement 3, book 2 then on
  1, arrangement 2 chosen there, book 1 back on 3, book 2 on 2, a new book on 1; after a switch DOWN and YES chose the
  row below the remembered one.
- On the unit, package `351f45ab…` kept, as the developer reported it: book 1 on arrangement 3 to book 3 on 1;
  arrangement 2 chosen there; book 1 came back on 3 and book 3 on 2. While playing, LEFT/RIGHT said STOP TO CHANGE
  BOOK and nothing changed. ARR SAVE, an edit and ARR RELOAD in book 3 brought the saved version back. A power cycle on
  book 3 came back on BOOK 3 with book 3's arrangements: the unit keeps them in battery memory, and the module's record
  matched them (not a project load, so not book 1, as I had expected).

Package `c6b2c9a4…`, as the developer reported it: after FUNC + PATTERN (arranger mode off), SYNC and CHANGE the
project opened in pattern mode (passed); SAVE on book 3, arrangement 5 and RELOAD landed on book 1 (failed). Event
log: save, reload, stock's new-project step, then arranger mode off/on twice, and no ev_banks_load, where the module
now read the saved place. Fixed: the RELOAD hook reads it too. `verify.py`: 69 checks.

Package `da945df5…`, as the developer reported it: SAVE on book 3, arrangement 5 and RELOAD showed book 1, then
came back to book 3, arrangement 5 (passed); SYNC in arranger mode on book 2 and CHANGE to the same project came back
on that book and arrangement in arranger mode (passed).

### Book 1 overwritten with book 2 (found on the unit after the module was removed, 19 November 2026)

As the developer reported it: after removing the module (on book 1, as the module said) the arrangements shown were
book 2's. Cause, from stock's code: LOAD and RELOAD are two card jobs. The first (0x40085276: project, banks, and the
arrangement files checked only) raises ev_banks_load and ev_banks_loaded; the second (job 27, 0x40085342) starts with
the new-project step (0x400909d8, ev_project_new) and loads arr01-08 into the slots last (0x4008fd28). The module took
ev_banks_load as "the slots hold book 1". When its return switch ran between the two jobs (its event log once showed
the switch before ev_project_new), leaving "book 1" made stock's writer save the slots, still holding book 2, as
arr01-08, and the backup took the same; the second job then loaded them. Fixed: the book changes to 1 only at
ev_project_new, and the return switch is asked for only after it, so it queues behind the job that loads arr01-08.
`verify.py` (71 checks) simulates both jobs and a write between them; against the previous code 8 checks fail,
among them that write landing in arr01-08. On the unit: not yet (the unit is paused while #1980, base freezes, is
open).

Package `7b4329e6…` (the book 1 load fix), kept beside USB AUDIO on base 0.7.13 (`6d23e888…`), a new project with
book 1's arrangements named B1 ONE and B1 TWO, as the developer reported it, 22 November 2026: book 2 with B2 ONE, SYNC
and PROJECT > CHANGE came back on book 2, B2 ONE, in arranger mode; book 1's B1 ONE and B1 TWO were intact (passed).
SAVE and RELOAD on book 2 came back on book 2, but the main screen showed book 1's arrangement name until the ARR menu
was opened and closed. Stock refuses select_arr while a change of its own is pending (0x800066a0), as after a RELOAD in
arranger mode; the module now tries again on the next frames, up to two seconds. `verify.py`: 72 checks.

Package `d731cb92…` (the retry), as the developer reported it: the main screen still showed book 1's arrangement
after RELOAD. Event log: the reload's load, stock's new-project step, arranger mode off, return posted, arranger mode
on (stock's end of the load, before the module's switch ran), switch to book 2. Stock had set up the arranger over
book 1's slots; choosing the arrangement does not rebuild that. Fixed: after a return switch that follows a load, with
arranger mode on, the module applies it again with stock's own routine (0x40055fd8, as stock's end of a load does);
never after LEFT/RIGHT. `verify.py`: 74 checks.

Package `08d0833a…` (source `f068cd608`), kept beside USB AUDIO on base 0.7.13, as the developer reported it,
22 November 2026: in arranger mode on book 2, SAVE and RELOAD PROJECT came back with the main screen showing B2 ONE,
PLAY played B2 ONE's rows, and book 1's B1 ONE and B1 TWO were intact afterwards (passed). Together with the round
before on `7b4329e6…` (LOAD back on book 2 in arranger mode, book 1 intact), the book 1 load fix is tested on the MKI.

### A backup file missing or unreadable (found by the owner in review, #1737, 22 November 2026)

Leaving book 1, deleting one of its `.bak` files and returning made the backup read treat the missing file as an empty
slot and report success; all eight slots were then marked changed, and the next save replaced the valid arr03.work
with an empty arrangement. Fixed: book 1 is restored slot by slot; a slot whose backup is missing or does not read
comes from its own arr0N.work and is not marked, so that file stays as it was. A backup counts only when all eight
files were written, so a partial one is never read back. `verify.py` (80 checks): a missing arr03.bak, an unreadable
arr05.bak and a backup write failing after three files; the previous code fails the missing-file case (arr03.work
saved empty). On the unit: not yet.

### An arrangement file that is there but fails to open (found by the owner in review, #1737, 22 November 2026)

Every failed open counted as "no such file": a book's file that failed to open once (a card fault) gave an empty slot
with no error, and the next sync wrote that empty slot over the saved arrangement. Fixed: a failed open is "no such
file" only when stock's own exists check (the file system's, at 0x46c823fa, as stock's copy uses for its -12) says the
file is not there and a second open fails too. A file that is there but did not open is a read failure, so the book
is reported (BOOK FILE ERROR) and written back only where edited. `verify.py` (86 checks): arr11.work failing to open
once on the way back to book 2 (reported, the next sync writes nothing, arr11.work keeps its arrangement, an edit of
another slot is still saved, the file reads again later), and the open and the exists check failing together with the
second open working; the previous rule fails six of them (arr11.work saved empty). Not covered: a card on which the
open and the exists check keep failing for a file that is there, which still reads as missing. On the unit: not yet.

### A reload between the failed read and the next sync (found by the owner in review, #1737, 23 November 2026)

The module kept which book is in the slots across a reinstall, but not that the book was read only in part: after a
reinstall, or back after another build's trial (Undo), the next sync wrote the empty slot over arr11.work. Fixed:
the battery record keeps that state too (its byte 6), and the install handler reads it back with the book.
`verify.py` (88 checks): the reinstall and the return after Undo, each between arr11.work's failed open and the next
sync; without the record byte both overwrite arr11.work. On the unit: not yet.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Switching books 1 to 16 and back, stopped | each switch writes 8 files and reads 8 inside stock's SYNC job, on the card task | the developer's MKI, builds 101941a7 to c5027552c | pass |
| LEFT/RIGHT in ARR > CHANGE while playing | stock's write job would stop playback | the developer's MKI, c5027552c | pass: refused with STOP TO CHANGE BOOK, nothing changed |
| PROJECT > CHANGE (load) on book 2, arranger mode | stock loads in two jobs; a return switch between them overwrote book 1 on an earlier build | the developer's MKI, 7b4329e6 (base 0.7.13) | pass: back on book 2 in arranger mode, book 1 intact |
| RELOAD PROJECT on book 2, arranger mode | stock re-applies arranger mode over book 1's slots before the return | the developer's MKI, 08d0833a (base 0.7.13) | pass: main screen and PLAY on book 2, book 1 intact |
| SAVE, edit, RELOAD on a book other than 1 | arr09+ need their own .strd copies | the developer's MKI, c5027552c | pass: the saved version came back |
| Power cycle on book 3 | the slots stay in battery RAM; the module must recognise them | the developer's MKI, c5027552c | pass: back on book 3 |
| FUNC + PLAY clear in the list, and its undo | stock's list clear sets no changed bit | the developer's MKI, 06f593e3 | pass: cleared stayed cleared, undo restored |
| A trial of another build over the kept one, switching during it | the kept copy came back with stale memory on an early build | the developer's MKI, 06f593e3 | pass: the kept copy reread its record |
| Beside USB AUDIO (installed with base 0.7.13) | both kept in one set, sharing the base | the developer's MKI, 08d0833a | pass: kept together, no crash, stall or freeze |
| Removing the module on book 1 | stock's next save writes the slots as arr01-08 | the developer's MKI, package 08d0833a removed on book 1, then a power cycle (an earlier build had left book 2 in book 1, the load fault since fixed) | pass: the stock arrangements were book 1's |
| An arr09+ file there but failing to open once | taken for a missing file, its empty slot was written back (owner's review) | host test (verify.py) | pass in the host test; not run on a unit |
| A reinstall or Undo between that failed read and the next sync | the module forgot the book was read only in part (owner's review) | host test (verify.py) | pass in the host test; not run on a unit |
| Removing the module on a book other than 1 | stock would write that book into arr01-08 | README asks to step back to book 1 first | not run: documented limitation |
| A book file that does not read | must not be written back | host test (verify.py) | not run on a unit |
| A new project (ev_project_new outside a load) | must reset the books, not keep a load's return | host test (verify.py) | not run on a unit |
| MKII | another panel and key layout | none | not run: no MKII |
| device:test / device:qualify lifecycle | install, Keep, Undo, removal on the scripted path | none | not run: the development base did not upload over USB |

## Stock flows

Not tested on the unit. In the emulator, ARR > CHANGE with the module and book 1 behaved as stock: YES chose the
arrangement, NO left the list.

## Performance

Not measured. Counted from `songbook_core.s`: the dearest work of the module's own is the fingerprint of the 8
arrangement slots, 6 instructions a byte over 90,440 bytes (542,640 instructions), once a switch or project event and
once every 120 ticks while a book other than 1 is in use. A switch's card work runs inside stock's own SYNC TO CARD
job on its card task. No evidence/performance.json yet: perf:audit asks for a measured count and presses while
playing, and switching is refused while playing by design.
