# Arr Setlists research (OS 1.40C)

Found by disassembling the developer's own OS 1.40C (m68k-elf-objdump, `-m m68k:cfv4e`) and checked under ot_emu.
Addresses only; no stock code is copied here.

## Where stock keeps arrangements

| What | Address |
| --- | --- |
| Pointer to the arrangement in use | 0x10000000 |
| 8 working arrangements, 5652 bytes each (20-byte header: name, flags, row count; 256 rows of 22 bytes) | 0x10000004 |
| 8 saved copies (ARR SAVE / RELOAD copy working and saved in RAM only) | 0x1000b0a4 |
| 8 "has a saved copy" flags | 0x10016144 |
| Changed mask, one bit an arrangement, cleared when written | 0x1001614c |
| Index of the arrangement in use | 0x100b14d1 |
| ARR > CHANGE's window word, nonzero only while the list is open | 0x400c0b40 |

Battery RAM 0x100f8f06-0x100f8ffc was free; the module claims 0x100f8f10-0x100f8f20 (battery-ram.json).

## Card jobs

- `0x40022cd4(0)` posts job 7, SYNC TO CARD's "write the project", to the card task's queue. It returns a negative
  code without posting: -7 with no project loaded, -3 or -53 while a job or a save is pending. Stopped, the job runs at
  once; playing, stock asks PLAYBACK WILL BE STOPPED, so the module switches only when stopped.
- Job 7 calls the arrangement writer `0x400915ac(dir, mask, ...)`, which writes `arrNN.work` for each arrangement in
  the changed mask. Its entry is two instructions, 8 bytes (`link.w %fp,#-324; movem.l %d2-%d7/%a2-%a5,(%sp)`,
  SHA-256 b692e058…); nothing branches into 0x400915ae-0x400915b4, and no module or base hook patches it.
- The arrangement loader `0x4008fd28(dir, mask, ...)` reads `arrNN.work` into the slots. It runs at every project
  load; a power-up that loads the project runs it too.
- `0x400a041c(n)` clears arrangement n: empty rows, count 0, the saved copy cleared, the default name.
- File layer as Kits uses it: open 0x40016864, read 0x40016564, write 0x400166b8, close 0x4001677c, the project
  directory 0x40025230(0, 0).

## The design

The module steps into the writer's entry. On book A it runs stock's writer unchanged. On another book it writes the
8 slots to the book's file instead. A pending switch then writes the book it leaves (book A to `arrbookA.bak`) and
reads the next: book A from that backup, marking all 8 changed so stock's next write puts them back into arr01-08;
another book from its file, or 8 cleared arrangements when it has none. Which book the slots hold survives a reinstall
in the battery record, valid only while a fingerprint of the slots still matches; a project load always means book A.
