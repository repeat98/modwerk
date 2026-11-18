# Arr Setlists research (OS 1.40C)

Found by disassembling the developer's own OS 1.40C (`m68k-elf-objdump -m m68k:cfv4e`; the image file starts at
0x40000400, so `--adjust-vma=0x40000400` gives real addresses) and checked under ot_emu. Addresses only; no stock
code is copied here.

## Where stock keeps arrangements

| What | Address |
| --- | --- |
| Pointer to the arrangement in use | 0x10000000 |
| 8 working arrangements, 5652 bytes each (20-byte header: name, flags, row count; 256 rows of 22 bytes) | 0x10000004 |
| 8 saved copies (ARR SAVE / RELOAD copy working and saved in RAM only) | 0x1000b0a4 |
| 8 "has a saved copy" flags | 0x10016144 |
| Changed mask, one bit an arrangement, cleared when written | 0x1001614c |
| ARR > CHANGE's window word, nonzero only while the list is open | 0x400c0b40 |

Battery RAM 0x100f8f06-0x100f8ffc was free; the module claims 0x100f8f10-0x100f8f20 (battery-ram.json).

## Stock's arrangement files

- One file a slot, `%s/arr%02d.work` (and `.strd`), 11,336 bytes: the `FORM … DPS1ARRA` header, the working
  arrangement, the saved copy, all 8 slots' "has a saved copy" flags and a checksum.
- `0x40089644(file, slot)` writes one slot into an open file; `0x4008b4d4(file, slot, 0)` reads one file into a slot,
  sets all 8 flags from it and clears that slot's changed bit (third argument nonzero: check only). Both return < 0 on
  failure; the reader -52 for a file from a newer OS.
- `0x400915ac(dir, mask, …)`, the per-arrangement writer: for each slot changed (or whose file is missing) it opens
  `arrNN.work` and calls 0x40089644. Its entry is two instructions, 8 bytes (`link.w %fp,#-324; movem.l
  %d2-%d7/%a2-%a5,(%sp)`, SHA-256 b692e058…); nothing branches into 0x400915ae-0x400915b4, and no module or base hook
  patches it.
- `0x4008fd28(dir, mask)` reads the masked slots' files (project loads, the power-up one too).
- `0x40016388(to, from, 0)` copies a file; SAVE and RELOAD PROJECT use it for arr01-08 (-12: no such file).
- File layer: open 0x40016864 `(file, path, mode, buffer, size)`, close 0x4001677c; the project directory
  0x40025230(0, 0); `clear_arr` 0x400a041c(n).

Under ot_emu (card written back with `--card-rw`) the module's arr09-arr16 came out 11,336 bytes with stock's header,
differing from stock's arr01 in 9 bytes (rows and checksum).

## Card jobs

`0x40022cd4(0)` posts job 7, SYNC TO CARD's "write the project". It returns a negative code without posting: -7 with
no project loaded, -3 or -53 while a job or a save is pending. Stopped, the job runs at once; playing, stock asks
PLAYBACK WILL BE STOPPED, so the module switches only when stopped.

## The design

The module steps into the writer's entry. On book 1 it runs stock's writer unchanged. On another book it writes the
book's 8 files together (every file carries all 8 flags, and reading sets all 8, so a book's files must agree). A
pending switch then backs up book 1 when leaving it and reads the next book's files; arriving at book 1 reads the
backup and marks all 8 changed, so stock's next write repairs arr01-08. A file that does not read leaves its slot
empty and is never written back unless that arrangement is edited. Which book the slots hold survives a reinstall in
the battery record, valid only while a fingerprint of the slots still matches; a project load always means book 1.
