# Arr Setlists testing

## Host gate

`verify.py`: 40 checks of arr_setlists.c against simulated battery RAM and simulated stock file routines: switching
both ways, arr09-arr128 named and written 8 at a time, book 1's backup and arr01-08 repaired on return, a file that
will not read never written back, refusals (playing, card busy, no project), reinstall and power-cycle detection by
the battery record, SAVE and RELOAD PROJECT, the label. Passes.

## Emulator (ot_emu, adapted, beta base, OS 1.40C MKI layout), 18 November 2026

Not hardware evidence. Package `arr-setlists.mwrm` built from this folder, trial over the emulator's USB link
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

## Stock flows

Not tested on the unit. In the emulator, ARR > CHANGE with the module and book 1 behaved as stock: YES chose the
arrangement, NO left the list.

## Performance

Not measured. Counted from `arr_setlists_core.s`: the dearest work of the module's own is the fingerprint of the 8
arrangement slots, 6 instructions a byte over 90,440 bytes (542,640 instructions), once a switch or project event and
once every 120 ticks while a book other than 1 is in use. A switch's card work runs inside stock's own SYNC TO CARD
job on its card task. No evidence/performance.json yet: perf:audit asks for a measured count and presses while
playing, and switching is refused while playing by design.
