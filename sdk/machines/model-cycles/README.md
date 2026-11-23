# Model:Cycles SDK

The Model:Cycles is in research for stock OS 1.13. Its Modwerk base is in development: built from core-mc 0.3's source; it boots on a unit and behaves as stock. No module exists yet, and the page stays beta-only.

## Modwerk stack

The Model:Cycles follows the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)). Its [Modwerk base](elekloader/README.md) starts from drumkilla's core-mc 0.3 at Elekloader v0.11.0, imported unchanged, with room for eight handlers per hook instead of four. Modwerk adds no hooks, sources or sites yet. The base owns the five sites below; a module subscribes to them and never patches them. What several modules will share (pages behind a stock key, menu rows, per-kit state) goes into the base before the first module that needs it ([choose how a module hooks in](../../../docs/module-guides/README.md#choose-how-a-module-hooks-in)). A site only one module needs stays that module's own declared site (`platform.claims`).

Next: the first module, Control All Config. The USB link, loading without a reflash and base updates over USB are not started.

## Core hooks

The registry is [events.json](events.json), in the Octatrack's format; the [core contract](../../model-cycles/core-profile/interface.json) lists the same hooks and the exports, and `modules:check` refuses a module that uses anything else.

| Hook | Handler | When |
| --- | --- | --- |
| `ev_tick` | `void f(void *ctrl)` | UI compose check, about 30 Hz. Set `ctrl + 0x20` to 1 to request a redraw. Not a clock. |
| `ev_draw` | `void f(void *bmp, void *ctrl)` | After the OS composes its 128x64 frame; y = 0 is the bottom row. |
| `ev_key` | `int f(void *brain, void *ev)` | Each key event, before stock. Nonzero takes it. `ev+12` key id, `ev+16` flags. |
| `ev_enc` | `int f(void *brain, void *ev)` | Each knob turn, before stock. Nonzero takes it. `ev+12` knob, `ev+16` delta. |
| `ev_boot` | `void f(void)` | Once at boot, before the OS starts: supervisor mode, interrupts and data cache off, no firmware call, only the mods' own RAM. |

Handlers are C functions: arguments on the stack, d0-d1/a0-a1 free, everything else kept. Lower `order` runs first; each hook holds eight handlers. DMA timer 0 stays as the stock OS has it (`NO_DTIM0`), so a mod cannot use it as a time base.

The core also exports 25 firmware locations (`fw_project`, `fw_key_held`, `fw_fill`, `fw_text`, the kits, the +Drive's file system), declared in [`include/model-cycles/core.h`](include/model-cycles/core.h) for C and `core.inc` for assembly. A module that uses them names no address of its own. There is no SETTINGS, render, LED or project-storage hook yet.

## Memory

- Shared DDR: `0x47E00000–0x47E40000` (262,144 bytes for core and linked mods).
- Modwerk base footprint: 180 bytes `.run` plus 16 bytes `.bss`, and 76 bytes `.boot`; the linker remains authoritative for combined sizes and overlap.
- No `.fast` copy table and no large-buffer area (`bulk`) yet: the pinned kit's Model:Cycles profile does not carry `bulk`.

## Build and recovery

Use the exact owner-supplied `model-cycles_OS1.13.syx`. Build the base with the reviewed toolchain (m68k-elf GCC 16.2.0, binutils 2.47) and the kit-pinned Elekloader checkout from `npm run upstream:tools`:

```sh
npm run machine:base -- model-cycles --stock /private/model-cycles_OS1.13.syx --out /private/mc-base
```

A normal OS update uses Elektron Transfer. For recovery, hold FUNC while powering on for the STARTUP MENU, press TRIG 4 (OS UPGRADE), then send the owner's stock `.syx` over 5-pin MIDI; this recovery mode does not use USB.

## Status

- The base builds from the imported source; with the reviewed toolchain its package equals the core-mc 0.3 release except for the larger collections.
- Boots and behaves as stock on a unit and in digiemu ([record](../../../docs/verification/2026-11-23-model-cycles-base.md)). Recovery with the stock `.syx` after it is not tested.
- No module. The first planned is Control All Config.
