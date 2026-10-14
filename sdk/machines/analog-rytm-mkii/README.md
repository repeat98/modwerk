# Analog Rytm MKII SDK

**Platform:** elemod · **OS:** 1.73 · **Core:** elekloader core-ar2 0.1 · **Modules:** [`sdk/analog-rytm-mkii/modules/`](../../analog-rytm-mkii/modules/) · **Status:** research

The Analog Rytm MKII runs on the same ColdFire platform as the Digitakt mk1, and its OS entry and bootstrap loader match the Digitakt's instruction for instruction. Its core is elekloader's Digitakt mk1 core (`core.s`, `settings.s`, `render.s`) built with the Rytm's addresses. The core patches OS 1.73 at eight shared sites and calls every subscribed mod's handler, in order, from tables the linker builds, so any set of mods that fits the budgets combines. Every event below has run on a unit. Modwerk does not build Rytm firmware yet, and no module targets it, so the machine stays in research.

## Create a mod

```sh
npm run module:new -- my-mod --machine analog-rytm-mkii --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers. The core's contract is [core-profile/interface.json](../../analog-rytm-mkii/core-profile/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Core events

Handlers use the C calling convention: arguments on the stack, d0–d1/a0–a1 free, the result in d0. Subscribe in `platform.events` and name each handler in `build.json`.

| Event | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI compose check, about 20 Hz (the Digitakt's runs at 30) | `void f(void *ctrl)`; set `ctrl + 0x20` to 1 to request a redraw. Not an audio-rate clock. |
| `ev_draw` | after the OS composes the 128 × 64 screen | `void f(void *bmp, void *ctrl)`; y counts up from the bottom row (0) to the top (63), x runs left to right |
| `ev_key` | a UI key event | `int f(void *brain, void *event)`; nonzero consumes it |
| `ev_enc` | a UI encoder event | `int f(void *brain, void *event)`; nonzero consumes it |
| `ev_settings` | building the SETTINGS menu | `void f(void *menu)`; add rows with `core_additem(menu, row)` |
| `ev_render_in` / `ev_render_out` | entry and exit of the ColdFire's audio block: 32 frames, about 1,500 blocks a second | `void f(void)` |

On the Rytm, y = 0 is the bottom row of the screen: a rectangle at y 48–63 lands at the top, as hardware photos and rytm-emu both show. Drawing code written with y = 0 as the top row, such as the hooks-check example ported from the Digitakt, needs y flipped (63 − y).

The render events cover the digital path only: this block renders the delay and reverb and mixes their returns. The analog voices are not rendered by this code, so a render handler cannot process the drum voices themselves. Like the Digitakt mk1 core, the core uses DTIM0 and claims `timer:DTIM0`.

## Memory and budgets

- **Shared mod memory:** 128 KiB of DDR (`0x47BE0000–0x47C00000`) for the core and every mod's code and data. A boot-time fill of the whole area was read back intact on a unit.
- **Core image:** 460 bytes `.run` plus 16 bytes `.bss` in the shared area, and an 88-byte `.boot` copier. The linker remains authoritative for combined sizes and overlap.
- **Fast SRAM:** none. The core has no `.fast` copy table on this machine.
- **Protected ranges:** none on OS 1.73.
- **Flash:** the main OS must end below `0x300000`; the OS keeps its own stores at `0x300000–0x380000` and `0x380000–0x400000`.

Claim named resources (a SETTINGS row, a SysEx id, a timer) in `platform.claims`; two mods may never claim the same one.

## Toolchain and build

Debian's `m68k-linux-gnu` GCC and binutils for ColdFire (elekloader's default for this machine; set `ELEKLOADER_CROSS` for another prefix such as `m68k-elf-`), and elekloader's builder. Use the exact owner-supplied `Analog-Rytm_MKII_OS1.73.syx`; the builder recognises firmware by hash and changes only the main OS section. From an elekloader checkout:

```sh
python -m elekloader.sdk.build mods/core-ar2 --stock Analog-Rytm_MKII_OS1.73.syx
python -m elekloader.sdk.build <module-folder> --stock Analog-Rytm_MKII_OS1.73.syx
python -m elekloader.lint <module-folder>/out/<mod>.elemod \
    --stock Analog-Rytm_MKII_OS1.73.syx --with mods/core-ar2/out/core-0.1.elemod
python -m elekloader.patch --stock Analog-Rytm_MKII_OS1.73.syx \
    --mod mods/core-ar2/out/core-0.1.elemod --mod <module-folder>/out/<mod>.elemod \
    --out my-build.syx --version XX01
```

Modwerk's own linker and browser build do not cover the Rytm yet: its linker profile comes with the first module, so build with elekloader until then.

## Flash and recover

Send the .syx with Elektron Transfer over USB (MIDI IN and OUT set to the device) and press YES on the unit; it restarts by itself. Restoring the stock 1.73 .syx the same way returns the unit to stock. If a custom OS will not start, hold FUNC while powering on to open the STARTUP menu, choose TRIG 4 (OS UPGRADE), then send the stock .syx from Transfer's SysEx Transfer Recovery Mode over MIDI DIN; recovery mode does not use USB, so you need a MIDI DIN sender: a USB-MIDI interface, or a serial adapter at 31250 baud as the machine profile describes. Local parsing and link checks do not guarantee hardware safety.

## Status

The core-ar2 0.1 device profile and core are in elekloader (merged in irpina/elekloader#89). Builds HM01 (core and hello-marker) and HC01 (core and hooks-check) ran every event on a unit on OS 1.73, and the stock .syx restored it each time ([core report](https://github.com/Iced-Cream/rytm-mods-boot-report/blob/main/CORE_REPORT.md)). No module in this SDK is approved or qualified for publication yet.

## Credits

The device profile, memory map and core port build on [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later) and [digikit](https://github.com/m-dwyer/digikit) (Em D, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT); the Rytm's OS 1.74 boot contract and recovery path by [rytm-fw-re](https://github.com/ethernet8023/rytm-fw-re). [rytm-emu](https://github.com/trigcondition/rytm-emu) (MIT, a fork of [rouletrro](https://github.com/Ondrysak/rouletrro)) runs stock and patched OS 1.73 builds in an emulator, for checks and screenshots before flashing.
