# Digitone II OS research

What the Digitone II integration has established so far, on stock OS 1.12. Everything here is a hash, an address or a structural fact; no firmware bytes, code or tables. Work from your own download of the stock OS.

| | |
| --- | --- |
| File | `Digitone_II_OS1.12.syx`, SHA-256 `7e5b8a733d4ab1fdf7e5d22757f7d8eddaa3cbf71d0858874a791844c02ceb35` |
| Main OS | section 3, 3,196,288 bytes depacked, SHA-256 `a098f620019b2ad38fd7e0397df39501fb1cf6bc26d0283915f34c49446fdf1a`, runs at `0x40000400`, ends at `0x4030C980` |
| Tools | elekloader kit 0.7.0 (`3b31ef3`) for the container, GNU `m68k-elf` binutils 2.x for disassembly, a ColdFire emulator of the control processor for the emulator runs |

## Step 1: the file

- The same ELE3 container as the Digitakt II, SysEx device byte `0x15`. Sections in table order: 5, 2 (bootstrap, runs at `0x80000400`), 3 (main OS), 4 (updater), 7 (SHARC program) and 8.
- Sealed like the Digitakt II: a 32-byte HMAC-SHA256 after the last section's padding. The key comes from the bootstrap's seed string `"Multiplier"` and the 32 bytes after its NUL, by the same derivation as the Digitakt II's `"Master Overdrive"`.
- The 1.12 bootstrap reads section 3 from flash, at its offset + `0x80000`, to `0x40400000`, and depacks it in place to `0x40000400`. The 1.10D bootstrap staged at `0x40200000` instead, so the stage address is per release and must be checked for every OS a profile adds.
- The container starts at flash `0x80000` and must end below `0x380000`, as on the Digitakt II.

## Step 2: the rebuild

With an elekloader device profile for 1.12 (stage `0x40400000`, seal seed `"Multiplier"`), the kit's writer rebuilds the stock file byte for byte from its own main OS stream, and `verify` passes. A file whose main OS is repacked by the kit's packer also verifies: in-place gap 2,389,386 bytes, 998,672 bytes of flash spare.

## Memory

- At reset (`0x400004e8`) the OS copies `0x402FD000`–`0x40305000` to SRAM `0x80000000` (the whole first half) and `0x40305000`–`0x4030C980` to `0x80008000`, zeroing the rest of the second half. It clears DDR `0x402FD000`–`0x466B84D0`; the stack runs down from `0x48000000`. The DSP's buffers are reached through the uncached alias `0x4E6C0000`–`0x4E6F9300`.
- **DDR `0x47F00000`–`0x47F40000`** (256 KB, the Digitakt II's area): no decoded instruction names it or its alias. In the emulator, a canary fill of all of it stayed intact from the reset clear to 888M instructions, through the ready screen, two trig presses and two encoder turns. It lies inside the free region `0x4671A000`–`0x47FE0000`.
- **SRAM `0x8000F980`–`0x80010000`** (1,664 bytes, `.fast` code): past the reset's copy into the second half, which it zeroes; no decoded instruction names it. Static evidence only: the probe cannot fill SRAM.

## Step 4 (draft): the core

The Digitakt II core (`core-dt2` 1.0) ported to 1.12 as `core-dn2` 1.0: the same sources (`core.s`, `settings.s`, `fast.s`, `personalize.s`) and events, with these sites. Each was found by the Digitakt II's patterns: the same instruction shapes, offsets and call structure.

| Site | Stock | Event |
| --- | --- | --- |
| `0x40000538` | `jsr 0x400019b0`, the OS entry's call (same address as the Digitakt II) | boot copier |
| `0x4002e464` | `jsr 0x4011d5d4`: returns the view controller's byte +0x20 | `ev_tick` |
| `0x4002e4ca` | `jsr 0x4011d60a`: `drawAll(ctrl, bmp)`, the 128x64 frame | `ev_draw` |
| `0x4002f20c` | `jsr 0x4002c5c8`: `Brain::key(brain, event)` (reads +0x94, +0x98) | `ev_key` |
| `0x4002f256` | `jsr 0x4002c55c`: `Brain::enc(brain, event)` | `ev_enc` |
| `0x4009ff88` | `movea.l (a2),a0; pea 2.w` in the SETTINGS builder `0x4009fbe0`, after SYSTEM | `ev_settings` |
| `0x400987a2` | `movem.l $18(a7),d2-d6/a2-a6` ending the PERSONALIZE constructor `0x40097eac`, after NOTE EDIT MENU | `ev_personalize` |

`core_additem` uses `operator new` `0x40120544`, `MenuItem`'s constructor `0x401173b8`, `Menu::addItem` `0x40116bee` and the function-pointer `std::function` manager `0x4018de3e` (for `PFSs15FileStorageInfoE`). The tick and draw sites lie `0x66` apart and the key and encoder sites `0x4a` apart, as on the Digitakt II, and the getter and `drawAll` are `0x36` apart, as there.

Core 1.0 builds to 480 bytes of `.run` and 20 of `.bss`, lints, and links (RAM 544 of 262,144 bytes).

## Step 3: what the emulator shows

A ColdFire emulator of the control processor, without the DSP:

- Core alone: cold boot reaches the ready screen at the same instruction count as stock, and the screen is identical to stock's.
- Core with a test mod that counts `ev_tick`, `ev_draw`, `ev_key` and `ev_enc` and takes nothing: all four count. Two trig presses give four `ev_key` calls (press and release) and two encoder turns two `ev_enc` calls. After those inputs the screen is identical to stock's under the same inputs.
- Core with a test mod that adds one row through `core_additem` from `ev_settings` and one from `ev_personalize` (labels built with `std::string`'s constructor `0x401ceab8`, as the firmware's own labels are): the OS builds both menus once at boot, so each event runs once before any input. SETTINGS lists the row last, after SYSTEM, in the stock row style; PERSONALIZE lists its row last, after NOTE EDIT MENU. Selecting either row with YES runs its select callback once. Panel codes: SETTINGS 8, YES 10, UP 11, NO 12, DOWN 14.

## Step 3: on a unit

- toonst's unit (23 October 2026, [elekloader's build guide](https://github.com/toonst/elekloader/blob/3d7c2e3/docs/BUILDING.md#flash-it)): stock 1.12 and core/DigiHealth builds flashed over USB, the six UI events ran with core 0.1 and hooks-check 0.1, and the startup-menu recovery restored stock 1.12 over MIDI DIN.
- A second unit (18 November 2026, [record](verification/2026-11-18-digitone-ii-core-on-a-unit.md)): toonst's elekloader at `3d7c2e3` built core-dn2 0.3 with hello-marker, then with hooks-check-dn2. Both booted from Transfer over USB, kits played normally, all six UI events and the subscriber order behaved as in the emulator, and a normal Transfer update put stock 1.12 back.

## The processors (20 November 2026)

What the 1.12 update and a unit show; nobody has opened a unit for this:

- **A ColdFire of the MCF5441x family (V4)** runs the OS (`main_section` 3, loaded at `0x40000400`): the UI, the sequencer, USB and
  MIDI, a kernel of sixteen tasks, and the parameter frames at 1,500 a second. 128 MB of DDR at `0x40000000`, read
  uncached through `0x48000000`; 64 KB of SRAM at `0x80000000`, which section 4 fills (32 KB from `0x80000400`).
  Section 2 (16 KB, at `0x02010000`) looks like the bootloader. External devices sit at `0xEC07xxxx` and `0xEC09xxxx`
  (the MCF5441x's peripheral bridge: UART9 carries MIDI, 0xEC090000 the reset and its status, 0xEC094000 GPIO). Its
  block at 0xFC0CC000, the eSDHC, holds the +Drive; DSPI0 drives the flash. The MCF5441x memory map (U-Boot's
  `immap_5441x.h`) matches every block stock uses; the MCF5445x's does not. DSPI1 (0xFC03C000) writes 5-bit registers
  with 8-bit values (prefix 0xA0), which looks like the audio codec's control port.
- **The ColdFire boots and feeds the SHARC over DSPI2** (0xEC038000). At start it decodes section 7 into a buffer and
  sends it byte by byte, waiting before each on a ready line (GPIO 0xEC094018 bit 4). Then, in every frame
  interrupt, it sends a 2,688-byte parameter frame from SRAM `0x80005e60` and receives 2,748 bytes into
  `0x800053a4`. The frame carries per-voice records with each track's parameters, sends included. The SHARC writes
  the cycles it spent on its last audio block into the first word it returns (read on a unit: about 370,000 to
  430,000 a block). Blocks added to the boot stream before it is sent run on a unit (a research build that adds its
  own SHARC code, 20 November 2026; not published).
- **An Analog Devices SHARC+** (the ADSP-2156x or SC5xx family) renders the sound. Section 7 is an ADI boot stream:
  95 blocks, each led by the 0xAD signature, filling the section exactly, into L1 (`0x2824xxxx`-`0x283xxxxx`), L2
  (`0x2000xxxx`) and its own DDR (`0x80xxxxxx`). Each block header is four little-endian words: the code word (0xAD, a
  checksum byte and the flags), target, count and argument. The checksum makes the XOR of the header's 16 bytes zero,
  and every stock block passes. Its code is VISA (16-, 32- and 48-bit instructions, each 16-bit parcel little-endian), with
  32-bit float tables, rendering 32-sample blocks, 1,500 a second. The Octatrack's DSP56k code cannot run there;
  algorithms port. A GPL-3.0 SHARC+ toolchain exists ([selache](https://github.com/js216/selache): assembler, C
  compiler, linker, boot streams); code it assembled for the ADSP-21569 ran on a unit. Its disassembly of stock code
  loses step in parts of the DSP loops, so read those stretches with care.
- **An ARM core** runs section 8 (160 KB: 4 KB of 0xFF, then Thumb code): which one, and what it does, is open.

## Still open

- Where the stock send buses and delay sit in the SHARC's code and how a base loads its own SHARC code for modules, and no run that exercises the DSP side of a mod, no project save or power-cycle persistence check, and the startup-menu recovery has been tried on one unit only.
- `core-dn2` and the device profile were in a local elekloader checkout. toonst's elekloader fork now has `core-dn2` 0.3 (commit `3d7c2e3`): the six events above plus an input bridge, SysEx observers and a SHARC bridge from earlier cores, and the Digitakt II 1.1 additions (`ev_frame_params`, `ev_key_leds`, project and kit data) at this unit's addresses. Its boot and six UI events have run on a unit; the 1.1 additions and the bridges have run in an emulator only. Modwerk has not copied it. The Digitone II's base follows the Digitakt II's, built here ([goal](../sdk/machines/digitone-ii/GOAL.md)).
