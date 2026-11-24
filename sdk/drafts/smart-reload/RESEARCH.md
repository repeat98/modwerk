# Smart Reload: OS 1.40C research

Read from the developer's own OS 1.40C (disassembly) and checked under ot_emu; no stock bytes are kept here.

## RELOAD PART

- The main screen's FUNC + CUE (0x4005e038) and the Part menu's RELOAD (0x4002dd56) call 0x4004aab4(part). It returns 0
  when the Part has nothing saved, else copies the saved Part (0x18b2 bytes) over the bank's working copy and over the
  working Part at 0x100a4ece + part * 0x18b2, clears the Part's edited bits and returns 1. The callers show
  `PART %d RELOADED` or `SAVE PART FIRST`.
- Entry: `lea -32(%sp),%sp ; movem.l %d2-%d5/%a2-%a3,(%sp)` (8 bytes), the module's jmp site; it replays them and
  continues at 0x4004aabc.

## The arrangement row's scenes

- Row r of the working arrangement: *(0x10000000) + 0x14 + 22 * r; the row count is the 16-bit word at +0x12. Byte 0 is
  the row type (0 pattern), byte 1 bank << 4 | pattern, byte 8 scene A, byte 9 scene B (signed; negative is `--`).
  Under ot_emu, rows poked with 01 02 and 03 04 showed scenes 02 03 and 04 05 in the arranger rows.
- The arranger's row start (0x4004a100) writes each side that is not `--` into the bank's copy of the Part
  (bank data at 0x400e21e0 + bank * 0x9b340, the Part's scenes at +0x8ed90 + part * 0x18b2), sets the bank's
  edited-Part bit (+0x95048) and changed word (+0x9b332), and, when the row's bank (byte 1 >> 4) is the bank in use
  (0x80000002) and the row's pattern plays the Part in use (pattern p's Part at +0x8e57 + p * 0x8ed8;
  0x80000003), the working Part's scenes at 0x100a4ede + part * 0x18b2 (+0 A, +1 B), the edited bit 0x100b145e and
  0x100f8598; then 0x40027e00 and a UI post (0x460d17ae with 0x400c0c43 for A, 0x400c0c42 for B).
- The arranger's current row: 0x80006698 (-1 none); its run state 0x800066a0 (1 playing). Under ot_emu, stopped after
  PLAY on row 0 it stayed 0.

## The scene in the sound

Writing the scene only shows it: on the developer's MKI the Part's saved scene kept playing until the row came round.
Choosing a scene on the panel (SCENE A/B + TRIG, 0x40052a42..0x40052a9a) writes the same field, calls 0x40027e00, then
0x40002df4(bank, part, scene, side) with the bank from 0x100b14ce: the scene's locks into the sound. The module makes
that call after each side it writes. (The row start leaves it to the pattern's start.)

## A `--` side

`--` changes nothing at a row's start, so a row plays the scene the rows before it left; the main screen's rows show
that scene for a `--` side and recompute it as rows play. After the reload the module takes, per side, the nearest row
at or above the current one that plays the same bank's Part and sets that side (the developer's choice).
