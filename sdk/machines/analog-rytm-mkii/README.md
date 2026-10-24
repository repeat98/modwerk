# Analog Rytm MKII SDK

**Platform:** elemod · **OS:** 1.74 · **Core:** elekloader core-ar2 0.3 · **Modules:** [`sdk/analog-rytm-mkii/modules/`](../../analog-rytm-mkii/modules/) · **Status:** preview

The Analog Rytm MKII runs on the same ColdFire platform as the Digitakt mk1, and its OS entry and bootstrap loader match the Digitakt's instruction for instruction. Its core is elekloader's Digitakt mk1 core (`core.s`, `settings.s`, `render.s`) built with the Rytm's addresses. The core hooks eight shared sites and calls every subscribed mod's handler, in order, from tables the linker builds, so any set of mods that fits the budgets combines. From 0.2 it also keeps mod storage: fields a mod declares, saved with sounds, kits, global slots and projects (below). Core 0.3 is for OS 1.74 only; new core versions drop old OS support, so Modwerk supports the Rytm on OS 1.74 alone. Every event below has run on a unit. Modwerk's linker builds Rytm modules. Filter Hz is the first library module, so the machine is in preview: the browser builds the core with library modules on OS 1.74, with downloads off until the owner turns them on.

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
| `ev_project` (core 0.3) | after CREATE NEW or the project reset (`how` 0), and after every project load, at boot too (`how` 1); the project and its mod data are in place | `void f(int how, unsigned dropped)`; `dropped` flags the global, track, pattern and project scopes that loaded as zeros. Keep it short, and start no load or save from it. |

On the Rytm, y = 0 is the bottom row of the screen: a rectangle at y 48–63 lands at the top, as hardware photos and rytm-emu both show. Drawing code written with y = 0 as the top row, such as the hooks-check example ported from the Digitakt, needs y flipped (63 − y).

The render events cover the digital path only: this block renders the delay and reverb and mixes their returns. The analog voices are not rendered by this code, so a render handler cannot process the drum voices themselves. Like the Digitakt mk1 core, the core uses DTIM0 and claims `timer:DTIM0`.

## Mod storage (core 0.3)

Declare each field in `build.json`, then read and write it through the core with elekloader's `analog-rytm-mk2/store.h`:

```json
"storage": [{ "sym": "my_accent", "scope": "track", "bits": 4 }]
```

```c
#include "analog-rytm-mk2/store.h"
STORE_FIELD(my_accent);
unsigned v = core_store_get(STORE(my_accent), live_pattern, track);
core_store_set(STORE(my_accent), live_pattern, track, v + 1);
```

`scope` is `sound` (56 bits a sound), `kit` (64), `global` (40 a slot), `track` (at most 16 bits a pattern track), `pattern` or `project`; `bits` is 1 to 32, and `sym` is a C name no other mod uses. Zero is the default everywhere. The linker places every field from the build's lockfile, as elekloader's `store.ts` does, and appends the lockfile after the image, so the next build keeps each field where it was and older projects keep their data. A field that changes size, or a new field that no longer fits, gives the build a new layout. `core_store_get` and `core_store_set` mask interrupts, so call them from any event. The full rules, which bytes each scope uses and what travels over SysEx and Transfer, are in elekloader's [ADAPTING.md](https://github.com/irpina/elekloader/blob/main/docs/ADAPTING.md) ("Mod storage") and the [core-ar2 README](https://github.com/irpina/elekloader/tree/main/mods/core-ar2).

On modwerk.app each configuration keeps the lockfile of its last build. The next build of that configuration starts from it, so adding or removing a module leaves every other module's fields where projects on the unit expect them. Duplicating a configuration copies the lockfile, and the configuration's JSON backup carries it (the field places only, no project data). A configuration that has never been built, or one shared on the forum, starts from a new layout.

## Memory and budgets

- **Shared mod memory:** 128 KiB of DDR (`0x47BE0000–0x47C00000`) for the core and every mod's code and data. A boot-time fill of the whole area was read back intact on a unit.
- **Core image:** core 0.3 is 7,540 bytes `.run` plus 36 bytes `.bss` in the shared area, and an 88-byte `.boot` copier. The linker remains authoritative for combined sizes and overlap.
- **Fast SRAM:** none. The core has no `.fast` copy table on this machine.
- **Protected ranges:** none on OS 1.74.
- **Flash:** the main OS must end below `0x300000`; the OS keeps its own stores at `0x300000–0x380000` and `0x380000–0x400000`.

Claim named resources (a SETTINGS row, a SysEx id, a timer) in `platform.claims`; two mods may never claim the same one.

## Toolchain and build

Debian's `m68k-linux-gnu` GCC and binutils for ColdFire (elekloader's default for this machine; set `ELEKLOADER_CROSS` for another prefix such as `m68k-elf-`), and elekloader's builder. Use the exact owner-supplied `Analog-Rytm_MKII_OS1.74.syx`; the builder recognises firmware by hash and changes only the main OS section. From an elekloader checkout, with `core-ar2-0.3.elemod` from the [core-ar2-v0.3](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.3) pre-release (elekloader's `main` builds core 0.4, which is not the core this SDK targets):

```sh
python -m elekloader.sdk.build <module-folder> --stock Analog-Rytm_MKII_OS1.74.syx
python -m elekloader.lint <module-folder>/out/<mod>-<version>-os1.74.elemod \
    --stock Analog-Rytm_MKII_OS1.74.syx --with core-ar2-0.3.elemod
python -m elekloader.patch --stock Analog-Rytm_MKII_OS1.74.syx \
    --mod core-ar2-0.3.elemod --mod <module-folder>/out/<mod>-<version>-os1.74.elemod \
    --out my-build.syx --version XX01
```

Modwerk's linker covers OS 1.74 (`src/engine/elektron/elemod.ts`), mod storage included. On the owner's stock 1.74 file it links core-ar2 0.3 with each of rytm2_mods v1.2's eleven mods, with the storage mods together, with all eleven, and again from a kept lockfile, byte for byte as elekloader kit 0.7.0 does. In the browser, the Rytm's configuration page checks and builds core-ar2 0.3 and the selected library modules from the owner's stock OS 1.74, with elekloader's kit, the core pinned in `sdk/imports/elekloader-core-ar2-v0.3.json` and each module's source-only package pinned in its own record (`sdk/imports/elekloader-filter-hz-2026-10-23.json`). Downloads stay off until the owner turns them on. The browser does not keep a configuration's storage lockfile yet, so it rebuilds a fresh storage layout each time; no library module declares storage, so nothing is lost. A module with storage needs that lockfile before it enters the library. Until then, build firmware with storage mods with elekloader.

## Flash and recover

Send the .syx with Elektron Transfer over USB (MIDI IN and OUT set to the device) and press YES on the unit; it restarts by itself. Restoring the stock .syx the same way returns the unit to stock. If a custom OS will not start, hold FUNC while powering on to open the STARTUP menu, choose TRIG 4 (OS UPGRADE), then send the stock .syx from Transfer's SysEx Transfer Recovery Mode over MIDI DIN; recovery mode does not use USB, so you need a MIDI DIN sender: a USB-MIDI interface, or a serial adapter at 31250 baud as the machine profile describes. Local parsing and link checks do not guarantee hardware safety.

## Status

The first port, core-ar2 0.1 for OS 1.73, is in elekloader (merged in irpina/elekloader#89); Modwerk no longer supports OS 1.73. Builds HM01 (core and hello-marker) and HC01 (core and hooks-check) ran every event on a unit on OS 1.73, and the stock .syx restored it each time ([core report](https://github.com/Iced-Cream/rytm-mods-boot-report/blob/main/CORE_REPORT.md)). Core-ar2 0.3 (OS 1.74, with mod storage) is on elekloader's [core-ar2-v0.3](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.3) pre-release and in kit 0.7.0's catalog. Filter Hz is the first library module ([folder](../../analog-rytm-mkii/modules/filter-hz/)).

## Credits

The device profile, memory map and core port build on [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later) and [digikit](https://github.com/m-dwyer/digikit) (Em D, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT); the Rytm's OS 1.74 boot contract and recovery path by [rytm-fw-re](https://github.com/ethernet8023/rytm-fw-re). [rytm-emu](https://github.com/trigcondition/rytm-emu) (MIT, a fork of [rouletrro](https://github.com/Ondrysak/rouletrro)) runs stock and patched OS 1.73 builds in an emulator, for checks and screenshots before flashing.
