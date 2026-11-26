# Model:Cycles SDK

The Model:Cycles is in research for stock OS 1.13. Its Modwerk base is in development: built from core-mc 0.3's source with a key-LED hook added; with a test module on its LED hook it runs on a unit and in digiemu. No module exists yet, and the page stays beta-only.

## Modwerk stack

The Model:Cycles follows the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)). Its [Modwerk base](elekloader/README.md) starts from drumkilla's core-mc 0.3 at Elekloader v0.11.0, imported unchanged. Modwerk adds one hook, `ev_key_leds`, as the Digitakt II has it. The base owns the six sites below; a module subscribes to them and never patches them. What several modules will share (pages behind a stock key, menu rows, per-kit state) goes into the base before the first module that needs it ([choose how a module hooks in](../../../docs/module-guides/README.md#choose-how-a-module-hooks-in)). A site only one module needs stays that module's own declared site (`platform.claims`).

The Model:Cycles gets the whole stack before its base is released (owner, 23 November 2026). The USB link is started, after the Rytm's: every base answers its identity over USB MIDI SysEx, measures the audio's share of the CPU (`load`), keeps a diagnostics log in the Octatrack's layout that `log` reads, and carries the Octatrack's runtime loader, so `mc_link.py try` loads a module to RAM on trial, keeps it or undoes it without a reflash ([LINK.md](LINK.md)). Development bases add memory reads, panel keys and encoder turns, and a RAM boot of an uploaded image. The MCP's `device_status` reads the link's identity and names the build the unit runs, `device_load` reads the audio load, `device_log` the diagnostics log through `log`, and `device_review`, `device_trial`, `device_keep` and `device_undo` load a module through the runtime loader (`--elektron-midi`, [FRONTEND_MCP.md](../../../docs/FRONTEND_MCP.md#a-modelcycles-over-its-link)). Flashing from the site is started: the machine page builds the pinned base from the owner's own OS file in the browser (a local build preview, `CORE_BUILD_PREVIEWS`), byte for byte the image `machine:base` and Elekloader's patcher build; beta testers can download it (`DIGI_BETA_DOWNLOADS`, owner, 26 November 2026), everyone else once the base is reviewed. The page can also send a build over USB as a stock OS update (`usb-upgrade.ts`, the unit asks UPGRADE OS NOW?); that button follows the downloads. The sender ran on a unit (24 November 2026). The Status page is started: Your Model:Cycles (`#model-cycles/unit`, beta, [ModelCyclesUnit.tsx](../../../src/components/ModelCyclesUnit.tsx)) reads the base, the live modules and the audio load over the link every two seconds. The first module, Control All Config, waits for the base.

## Core hooks

The registry is [events.json](events.json), in the Octatrack's format; the [core contract](../../model-cycles/core-profile/interface.json) lists the same hooks and the exports, and `modules:check` refuses a module that uses anything else.

| Hook | Handler | When |
| --- | --- | --- |
| `ev_tick` | `void f(void *ctrl)` | UI compose check, about 30 Hz. Set `ctrl + 0x20` to 1 to request a redraw. Not a clock. |
| `ev_draw` | `void f(void *bmp, void *ctrl)` | After the OS composes its 128x64 frame; y = 0 is the bottom row. |
| `ev_key` | `int f(void *brain, void *ev)` | Each key event, before stock. Nonzero takes it. `ev+12` key id, `ev+16` flags. |
| `ev_enc` | `int f(void *brain, void *ev)` | Each knob turn, before stock. Nonzero takes it. `ev+12` knob, `ev+16` delta. |
| `ev_boot` | `void f(void)` | Once at boot, before the OS starts: supervisor mode, interrupts and data cache off, no firmware call, only the mods' own RAM. |
| `ev_key_leds` | `void f(void *mgr)` | Each key-LED frame, after the LEDs are cleared and before the stock views set theirs. `fw_led_set(mgr, led, state)`: 2 on, 1 off; TRIG n is LED n; the first setter wins. Modwerk's, in `include/mc/core.h`. |

Handlers are C functions: arguments on the stack, d0-d1/a0-a1 free, everything else kept. Lower `order` runs first; a hook takes every subscriber (the 4 in `mod.json`'s collections is an entry's size in bytes, not a count). DMA timer 0 stays as the stock OS has it (`NO_DTIM0`), so a mod cannot use it as a time base.

The core also exports 25 firmware locations (`fw_project`, `fw_key_held`, `fw_fill`, `fw_text`, the kits, the +Drive's file system), declared in [`include/model-cycles/core.h`](include/model-cycles/core.h) for C and `core.inc` for assembly. A module that uses them names no address of its own. A module whose LEDs change asks for a key-LED frame by setting `ctrl + 0x21` to 1 in its `ev_tick` handler. There is no SETTINGS, render or project-storage hook yet.

## Memory

- Shared DDR: `0x47E00000–0x47E40000` (262,144 bytes for core and linked mods).
- Modwerk base footprint: 220 bytes `.run` plus 16 bytes `.bss`, and 76 bytes `.boot`; the linker remains authoritative for combined sizes and overlap.
- No `.fast` copy table and no large-buffer area (`bulk`) yet: the pinned kit's Model:Cycles profile does not carry `bulk`.

## Build and recovery

Use the exact owner-supplied `model-cycles_OS1.13.syx`. Build the base with the reviewed toolchain (m68k-elf GCC 16.2.0, binutils 2.47) and the kit-pinned Elekloader checkout from `npm run upstream:tools`:

```sh
npm run machine:base -- model-cycles --stock /private/model-cycles_OS1.13.syx --out /private/mc-base
```

A normal OS update uses Elektron Transfer. For recovery, hold FUNC while powering on for the STARTUP MENU, press TRIG 4 (OS UPGRADE), then send the owner's stock `.syx` to MIDI IN, the 3.5 mm TRS jack (a DIN interface through a TRS-to-DIN adapter); this recovery mode does not use USB.

## Status

- The base builds from the imported source and keeps everything of the core-mc 0.3 release; Modwerk adds `ev_key_leds`.
- With a test module on `ev_key_leds`, it runs on a unit and in digiemu as expected ([record](../../../docs/verification/2026-11-23-model-cycles-base.md)). Recovery with the stock `.syx` after it is not tested.
- The site builds the base alone from OS 1.13 as a local preview, pinned by identity in `sdk/imports/elekloader-modwerk-base-model-cycles-2026-11-24.json`; downloads are open to beta testers only.
- No module. The first planned is Control All Config.
