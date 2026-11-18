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

## Stock flows

Not tested on the unit. In the emulator, ARR > CHANGE with the module and book 1 behaved as stock: YES chose the
arrangement, NO left the list.

## Performance

Not measured. A switch runs in stock's card task inside stock's own job; the UI does nothing a frame but draw the label
in ARR > CHANGE.

### Book 2 a copy of book 1 (found on the unit, 18 November 2026)

After the first session book 2 held a copy of book 1, and clean runs on books 3 and 4 could not make another. The
session's order fits one cause: the kept build was on book 2, my diagnostic trial replaced it and switched to book 1,
the rollback brought the kept build back with its memory still saying book 2 over book 1's arrangements, and its next
switch saved them as book 2. Fixed: the record carries a serial each copy writes, and on install a copy trusts its
own memory only while the serial is still its own; otherwise it rereads the record and checks it against the
arrangements. `verify.py` (52 checks) replays that order; against the old logic it fails, writing book 1's songs into
arr09. On the unit, package `06f593e3…` kept on book 2: a 2-minute trial of a second copy saw book 2 (value 0x401),
the developer switched to book 1 in it (0x400), and after the rollback the kept copy reported book 1 (1024), not book 2.

### Cleared arrangements coming back (found on the unit, 18 November 2026)

As the developer reported it: arrangements cleared with FUNC + PLAY in ARR > CHANGE on book 2 sometimes came back after
book 1 and back; copied and pasted ones stayed. Cause: the list's FUNC + PLAY clears with stock's undo (0x400610ee)
and does not mark the arrangement changed, and the module wrote a book other than book 1 only when something was
marked changed. Stock's own SYNC job writes all 8 files every time. Fixed: the module writes a book's 8 files
whenever stock's writer asks for any (its mask argument), as stock does. `verify.py` (54 checks) clears one without the
mark and leaves the book; against the old rule it fails. On the unit (package `06f593e3…`), as the developer
reported it: cleared arrangements on book 2 stayed cleared after book 1 and back, and a clear undone with a second
FUNC + PLAY came back as before.

### SAVE, RELOAD and LOAD PROJECT, and coming back to the saved place

On the unit (package `06f593e3…`), as the developer reported it: on book 2 an edit, SAVE PROJECT, another edit and
RELOAD PROJECT landed on book 1, and book 2 then held the saved version; LOAD PROJECT of the same project from book 3
landed on book 1, with book 3's arrangements kept. All passed. The developer asked to land on the book and
arrangement the project was saved on instead, as stock does for its arrangement. Built: the module writes
`arrbook.work` (book, each book's last choice) whenever stock writes arrangements, SAVE PROJECT copies it to
`arrbook.strd` and RELOAD back, and after a load the module switches to that book once stock's job queue frees.
`verify.py` (59 checks) covers LOAD, RELOAD, waiting while stock loads and a project left on book 1. Not run under
ot_emu (its project loads differ from the unit's); on the unit: not yet.

### Coming back after RELOAD failed on the unit; the job's message; the book on the main screen

On the unit (package `017d8541…`), as the developer reported it: saved on book 3, arrangement 5, then RELOAD PROJECT
landed on book 1, arrangement 7. Not yet explained; the next build waits up to 5 minutes (not 10 s) for stock to finish
a load before switching back (a reload also reads samples), and its diagnostic word shows the return's state.
The developer asked to drop NOW SAFE TO EJECT! after each switch and to show the book before the arrangement's name on
the main screen. Built: after a switch of its own the module closes the job's message box with stock's own close
(0x40056bec), and on books 2-16 draws the number over stock's arranger icon when exactly that icon is on screen.
Under ot_emu: one second after RIGHT, BOOK 2 and no message box; the main screen on book 2 showed `2` before the name.
`verify.py`: 64 checks.

On the unit (package `22591f16…`, kept), as the developer reported it: RELOAD still landed on book 1 (arrangement 5),
and the book number sat over the main screen's mode icon (Tracks, Chromatic, ...), shown only in Tracks mode: I had
taken the mode icon for an arranger icon. Removed. The kept build's diagnostic word then read 0x10000000: one reload
seen, no load, no return pending, none posted. A diagnostic trial could not observe the kept copy's events, so the
next build logs its last four project events in the top half of its own diagnostic word.
