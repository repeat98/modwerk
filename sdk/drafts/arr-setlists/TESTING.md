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

Not tested.

## Stock flows

Not tested on the unit. In the emulator, ARR > CHANGE with the module and book 1 behaved as stock: YES chose the
arrangement, NO left the list.

## Performance

Not measured. A switch runs in stock's card task inside stock's own job; the UI does nothing a frame but draw the label
in ARR > CHANGE.
