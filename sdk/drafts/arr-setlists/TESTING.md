# Arr Setlists testing

## Host gate

`verify.py`: 31 checks of arr_setlists.c against simulated battery RAM and a simulated file layer: switching both
ways, the backup of A and arr01-08 rewritten on return, books B-P never written through stock's writer, refusals
(playing, card busy, no project), reinstall and power-cycle detection by the battery record, SAVE and RELOAD PROJECT,
the label. Passes.

## Emulator (ot_emu, adapted, beta base, OS 1.40C MKI layout), 18 November 2026

Not hardware evidence. Package `arr-setlists.mwrm` built from this folder, trial over the emulator's USB link
(`--dsp-rt`), a project created on an empty Set.

- A to B: stock's SYNC TO CARD job ran (NOW SAFE TO EJECT!), book B came up with 8 empty arrangements, the label
  read BOOK B. Five rows added on B. B to C to B: B's five rows back. Back to A: A's three rows back, unchanged.
  A to B again: B's five rows. The battery record's fingerprint matched the slots after every switch.
- Power cycle on book B with no project load (battery RAM kept): the slots still held B, and the module took it as B
  (label BOOK B).
- Power cycle with the project loaded at power-up: the record said book A with book A's fingerprint. In this emulator
  stock then refused SYNC TO CARD as "no project" (code -7, shown as NO PROJECT), so switching after that power-up
  could not be checked here: on the unit.
- Not run in the emulator: SAVE PROJECT and RELOAD PROJECT, switching while playing, removing the module on book B.

## On the unit

Not tested.

## Stock flows

Not tested on the unit. In the emulator, ARR > CHANGE with the module and book A behaved as stock: YES chose the
arrangement, NO left the list.

## Performance

Not measured. A switch runs in stock's card task inside stock's own job; the UI tick does one compare a frame.
