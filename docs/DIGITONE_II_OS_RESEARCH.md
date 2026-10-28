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

## Still open

- No run with the DSP, no hardware run, and recovery with the stock file has not been tried on a Digitone II.
- `core-dn2` and the device profile live in a local elekloader checkout; they belong upstream in elekloader before Modwerk can list an SDK.
