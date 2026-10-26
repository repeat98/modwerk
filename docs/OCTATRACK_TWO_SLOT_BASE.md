# Octatrack: two-slot base (power-cut-safe updates)

**Status: built and host-tested, not yet run on a unit (owner, 25 October 2026).** Code: `slots.c`/`slots.h` (records
and choices), `stub.s`/`stub.c` (the stub), `build_stub.py`, `flash.c` (writer, confirm, screens), `check_stub.py`.

The owner's rule: updating the base must never brick a unit, whatever USB or the power does, and the unit shows
the update on its own screen. Today's base (`flash.c`) keeps one copy of the OS in flash and rewrites it in place.
A power cut during that write (about 10 s) leaves no bootable OS. The unit can still be recovered from the startup
menu, but only with a DIN MIDI interface. With two slots, an update writes only the copy that is not running, so
a power cut or USB dropout at any moment leaves the running copy whole.

## What the unit gives us (MKII, OS 1.40C, read from the user's own file)

- **Elektron's bootloader**, flash `0x0000`-`0x3fff`, is never written. At reset it sets the caches, unpacks the
  section at flash `0x4012` into RAM at `0x40000400` with its own unpacker (`0x207e(src, dst)`, the kit's
  codec), turns the caches off again and calls `0x40000400` with one boot word on the stack. It checks nothing.
- **FUNC at power-on** opens the startup menu in that bootloader: TESTMODE, EMPTY RESET, MIDI UPGRADE, SEND
  UPGRADE. MIDI UPGRADE takes an OS `.syx` over DIN only, checks the received file (checksum, its version
  against the MK1 and downgrade rules), never what flash holds, erases `0x4000`-`0xfffff` and writes it. So
  whatever we write above `0x4000`, recovery stays possible; it removes the two-slot layout and leaves stock.
- **Flash is at least 8 MB.** The OS window is `0x4000`-`0x1fffff` (8 KB sectors to `0x10000`, then 64 KB). A
  second stock routine writes "bulk data" at `0x200000`-`0x7fffff`; nothing of ours goes there.
- **The OS reads its version from flash** at `0x4004`-`0x4012`, the container header (the SYSTEM page shows it).
- **Stock's upgrade screen**, `0x4007f9cc(step, current, total)`: PREPARING FLASH (0), WRITING OS DATA (1),
  VERIFYING OS DATA (3) with a progress bar, drawn and sent to the LCD at once. Stock calls it after the same
  quiesce `flash.c` uses.

## Layout

| Flash | Holds |
| --- | --- |
| `0x000000`-`0x003fff` | Elektron's bootloader and startup menu. Never written. |
| `0x004000`-`0x005fff` | The stub's sector: the container header (the version the OS shows), a trampoline section, the mark `MWSTUB` + version + code check at `0x40`, the code at `0x100`. Written once per unit. |
| `0x006000`-`0x00ffff` | Unused. |
| `0x010000`-`0x0fffff` | Slot A, 960 KB. |
| `0x100000`-`0x1effff` | Slot B, 960 KB. |
| `0x1f0000`-`0x1fffff` | Unused. |
| `0x200000`-`0x7fffff` | Stock's bulk data. Never written. |

A slot is one 256-byte record page, then a plain base container (the kit's `.bin` deciphered, as `flash.c` takes
it today). The record holds a magic, the slot's generation, the container's length and a check over those, all
programmed last; then two words left erased at write time: *tries* (the stub clears one bit for each start of a
slot not yet confirmed) and *confirmed* (the base clears it once it has run healthy).

## The stub

About 900 bytes of ColdFire code, our own, never written over USB once in place. The bootloader unpacks the
section at `0x4012`, ours a 6-byte jump, to `0x40000400` and calls it; the stub then runs from NOR where it lies
(no copy, no RAM of its own but the bootloader's stack). At each start it:

1. reads both records: a slot counts when its record checks and the container's own section sum matches;
2. picks the newest counting slot. If it is not confirmed, it clears one *tries* bit first (a single-word program
   run from SRAM, since NOR answers status while it programs); after two tries without a confirmation it
   starts the other counting slot, clearing one more bit so the base can tell it went back;
3. unpacks that slot with the bootloader's own unpacker and enters it exactly as the bootloader would: its cache
   settings, its stack (return address and boot word), every register as it left them;
4. invalidates the instruction cache before that jump (CACR bit 8, as `runtime.c` does on the unit). The
   trampoline ran at `0x40000400` from the cache and the bootloader's CACR values never invalidate it: without
   this the jump could run the trampoline again instead of the OS, at every start. `build_stub.py` refuses a stub
   whose bytes lack it.

With no counting slot it can only stop; by construction one always counts (below). Bases recognise a stub by its
mark and code check, not its bytes, so a stub built with another compiler is still recognised. Stock's card update
and MIDI recovery write a plain container at `0x4000`, which replaces the stub: the unit is back to one slot.

## The base

**At most one restart per update (owner, 25 October 2026).** Two orders, which the site picks from SLOTS:

- **A unit on two slots:** the running base writes the new base's container into its spare slot, then restarts
  onto it. It takes another base's container only into a spare slot, and only once the checks that keep
  Elektron's bootloader safe pass (an OS entry, NOR's bootstrap version, stock's bootloader copy byte for byte).
  This write is under stock's quiesce, with stock's upgrade screen (PREPARING FLASH, WRITING OS DATA, VERIFYING
  OS DATA). The slot's record cannot name that base: zeros.
- **A unit with one copy** (installed from the card, or any unit before this base): the new base starts from RAM
  first (the trial, the update's one restart), then writes itself and runs on. A base takes another base's
  container here only on two slots (refusal 106 otherwise). Stock's routines need no quiesce: they mask
  interrupts only around their command writes, the OS runs from RAM, and the upload engine has stopped the
  transport. So the base writes while the OS runs on, with its own box (BASE UPDATE, SAVING THE NEW BASE, KEEP
  THE POWER ON, a bar) and a BASE SAVED popup; the next start is from the new slot. Conversion comes first:
  the base the unit started from NOR is copied to slot B, confirmed (above any old container, so it stays whole
  meanwhile), then the stub's sector, then this base into slot A. The stub's sector is the only moment a power cut
  can still cost a startup-menu recovery: its erase and the pages up to the end of the stub's code, under a
  second, once per unit. A conversion whose stub write failed its check, the unit still up, goes on from slot B
  next time; flash with neither layout is refused (refusal 108), nothing written.

Either way the slot the base may lose is written, never the newest *confirmed* one (else the newest whole one):
erase, program, verify the body, then the record. A power cut or a lost USB reply anywhere before the record
leaves that slot not counting, and the stub starts the other one. When the slot the stub starts next already holds
the container, nothing is written (the site's repeat after a lost reply).

- **Confirm**: 15 s after a start from the newest slot (a try used, so never a slot only just written), the base
  confirms it, with a single-word program (stock's page program may wait for ever on a page whose bits are already
  programmed). A slot a base wrote itself names it and is kept on that alone: the base talked over USB in its
  trial. Another base's slot also waits for a computer's USB contact since the start, so a base that starts but
  has lost USB is never kept; without it, two starts later the stub goes back to the previous base.
- **Report**: SLOTS (vendor request 39, `flash.h`) gives the layout, the running slot, whether it is confirmed
  and whether the stub went back; the site tells the user when it did. `npm run device -- status` prints it.

## Showing it on the Octatrack

- Writing: stock's own upgrade screen when quiesced (another base, two slots), the base's box otherwise.
- After it: BASE SAVED (it ran on), or, at the start from the new slot, BASE UPDATED; UPDATE UNDONE when the stub
  went back to the previous base.
- Not built: anything on the unit while the base is sent and while the new base starts from RAM.

## Tests before any unit

- `test_flash.c` (host, `npm run check`): conversion, update, repeat, one restart at most, confirm (with and
  without a computer), return after two failed starts,
  against a flash model that clears bits only, with a power cut after every single erase and program, after which
  a model of the bootloader and the stub (with `slots.c`, the stub's own code) must start a whole base. Update:
  283 operations, none leaves a unit unable to start. Conversion: 599, of which only those in the stub's sector
  (its erase and the pages up to the end of its code) do.
- `check_stub.py` (local, your OS file, Unicorn): the bootloader's last steps and its unpacker, then the stub,
  for six slot states: the right base unpacked byte for byte, the try marked, the OS entered with the
  bootloader's stack and registers, NOR written only by the SRAM routine. Unicorn models no caches.

## Hardware run (the owner's MKII, a DIN MIDI interface at hand)

1. Read-only: `0x100000`-`0x1fffff` blank or unused before the first conversion erases it.
2. Convert (the trial, then the write while it runs on: UI, audio and the box during it, the screen after; stock
   copies a bulk-data directory from flash `0x200000` at start, and if it reads that data later a read during the
   write would see the chip's status, so watch for glitches; a crash then is a cut write, not a brick), power
   off and on (BASE UPDATED, the confirm), then update A to B and back on two slots (stock's screen, one restart).
3. Pull the power during the slot write, several times at different points; pull the USB cable during the write.
4. Install a base that fails to start: after two power cycles the stub must start the previous one.
