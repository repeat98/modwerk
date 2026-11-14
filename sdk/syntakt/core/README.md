# Syntakt core

The Modwerk core for the Syntakt. OS 1.40 is a boot probe. OS 1.42 lowers the factory stack and copies the core into the gap above it before the wipe. It is the outcome of [the OS research](../../../docs/SYNTAKT_OS_RESEARCH.md), which also lists every open decision. No module can be built for the Syntakt yet.

**Status:** interface 0.1. A 1.42 boot probe has run on a unit, and DIN recovery has been used there. The stack-gap build has booted on a unit with the sample slots already full and returned to stock 1.42 ([record](../../../docs/verification/2026-11-10-syntakt-stack-gap-on-unit.md)). Loading samples while that build was running was not done.

## Files

| File | Content |
| --- | --- |
| [interface.json](interface.json) | The contract modules will link against: events, tables, exports, claims and memory. Empty except the reserved SRAM area. |
| [probe.json](probe.json) | The boot hook per supported release: address, displaced length, SHA-256 of the stock bytes, continuation. The stack-top word is recorded for both releases and changed only on 1.42. |
| [stock-map.json](stock-map.json) | What the linker and the stock-write checker refuse to touch: per-release image extents, the SRAM initialisation data, the heap descriptor, the SysEx tables, the reset chain and the vector filler; the proven-free area and the two unproven SDRAM candidates; the tail budget. |
| [boot.s](boot.s) | The core's own code. Its assembled bytes are `SYNTAKT_BOOT_STUB` (1.40) and `SYNTAKT_GAP_STUB` (1.42) in `src/engine/elektron/syntakt.ts`. |

Everything in these files is an address, a length, a hash or a note. No firmware byte, code or table of the OS is kept here.

## What the probe does

At the BSS-clear entry the stock OS has already copied its SRAM image and has not yet zeroed its BSS. The planted `jmp` enters the stub, which replays the two displaced instructions, writes a 16-byte signature (`MWSK`, version, length, 0) into the reserved SRAM tail and jumps back to stock. The signature is written only there. An emulator or a debugger can read 0x8000733c after boot to see that the hook ran.

On OS 1.42 the same stub then copies itself to 0x47fe0000, the start of the stack gap, and only then returns. The glued-on copy stays in the appended tail, inside the memory the OS zeroes next. The staying copy is the one above the lowered stack. OS 1.40 does not lower the stack and does not copy itself. The linker still offers mods no SDRAM, so a mod with `.run`, `.bss` or `.fast` is refused.

## Memory

| Area | Range | Size | Verdict | Use |
| --- | --- | --- | --- | --- |
| `sram-tail` | 0x8000733c–0x80008000 | 3,268 bytes | proven free in 1.40 and 1.42: no reference in either image, zero after the reset copy, no allocator or DMA ring reaches it | the core's fast data; re-zeroed at every reset |
| Stack gap | 0x47fe0000–0x48000000 | 128 KB | the 1.42 core's own staying copy, opened by the stack word at 0x400004f4; not proven under a full sample load | not offered to mods. The heap block stays unused |

## Rules the build enforces

- The linker profile (`SYNTAKT_DEVICE`) binds the two researched releases by file and image hash, offers only `sram-tail`, and protects the image header, the reset chain (except the hook), the vector filler and, per release, the SRAM initialisation data, the heap descriptor and the SysEx tables.
- The stock-write checker (`src/engine/elektron/stock-writes.ts`) compares the linked image with stock and refuses any changed byte outside a declared, guard-verified site, overlapping or unguarded sites, sites inside protected ranges, code sites that are not whole instructions or that become PC-relative, a tail over 16 KB, and a tail without the hook that moves it before the clear. On 1.42 the declared places are the boot hook, the stack word and the glued-on tail.
- The container writer keeps every section but the main OS byte-identical and refuses a build whose in-place depack would overrun or whose container exceeds the 2 MB receive-buffer bound (`ELE3_DEVICES.syntakt`).
- The profile is not yet in the shared `LINK_DEVICES` table (owner review), so no builder or CI job picks it up.

## Build and check locally

```sh
node scripts/verify-syntakt-core-probe.mjs --out /tmp/syntakt-probe --firmware ~/path/Syntakt_OS1.42.syx
```

It links the core into the owner's stock file, runs the checker, rebuilds the container and writes the `.syx` with a JSON record of hashes, layout, margins and the checker's report. A 1.42 file is written as `syntakt-1.42-stack-gap.syx`. The record carries no firmware bytes; the `.syx` stays on the developer's computer. Results of the owner's runs are in [docs/VERIFICATION.md](../../../docs/VERIFICATION.md).

## Open decisions (owner)

1. Register the Syntakt in the shared linker and container tables.
2. Qualify the stack gap on a Syntakt with every sample slot loaded. The 1.42 core already uses it; the heap block stays unused, and mods are still not offered the gap.
3. Accept the 2 MB container bound as the flash limit until the flash geometry is read from a unit.
4. Keep the analysed 1.40 file as a supported release beside 1.40A (surveyed at container level only, [research report §5.1](../../../docs/SYNTAKT_OS_RESEARCH.md)) or drop it.
