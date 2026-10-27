# Analog Four MKII SDK

**Platform:** elemod · **OS:** 1.56 · **Core:** elekloader core-a4 0.2 · **Modules:** [`sdk/analog-four-mkii/modules/`](../../analog-four-mkii/modules/) · **Status:** research

The Analog Four MKII runs on the Analog Rytm MKII's platform, a ColdFire MCF5441x: its OS entry, bootstrap loader and UI loop are the Rytm's, instruction for instruction apart from addresses. Its core is elekloader's core-a4, which builds the Digitakt mk1's `core.s`, `settings.s` and `render.s` with the A4's addresses as core-ar2 does for the Rytm, and adds mod storage and parameter pages. The core hooks the shared sites and calls every subscribed mod's handler, in order, from tables the linker builds, so any set of mods that fits the budgets combines. Every hook below has run on a unit. Modwerk's linker has an A4 profile (`src/engine/elektron/elemod.ts`): on the owner's stock 1.56 file it links core-a4 0.2 alone, with each of elekloader's five A4 examples and with three of them together to the same main OS image and storage lockfile as `elekloader.patch`. There is no library module yet, and the browser builds nothing for the A4 until one exists.

## Create a mod

```sh
npm run module:new -- my-mod --machine analog-four-mkii --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers. The core's contract is [core-profile/interface.json](../../analog-four-mkii/core-profile/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Core hooks

Handlers use the C calling convention: arguments on the stack, d0–d1/a0–a1 free, the result in d0. Subscribe in `platform.events` and name each handler in `build.json`.

| Hook | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI compose check, about 20 Hz, as on the Rytm | `void f(void *ctrl)`; set `ctrl + 0x20` to 1 to request a redraw. Not an audio-rate clock. |
| `ev_draw` | after the OS composes the 128 × 64 screen | `void f(void *bmp, void *ctrl)` |
| `ev_key` | a UI key event | `int f(void *brain, void *event)`; nonzero consumes it |
| `ev_enc` | a UI encoder event | `int f(void *brain, void *event)`; nonzero consumes it |
| `ev_settings` | building the settings menu the GLOBAL key opens | `void f(void *menu)`; add rows with `core_additem(menu, row)`; they come after SYSTEM |
| `ev_render_in` / `ev_render_out` | entry and exit of the ColdFire's audio interrupt | `void f(void)` |
| `ev_project` | after CREATE NEW or the project reset (`how` 0), and after every project load, at boot too (`how` 1); the project and its mod data are in place | `void f(int how, unsigned dropped)`; `dropped` flags the global, track, pattern and project scopes that loaded as zeros. Keep it short, and start no load or save from it. |

The A4's voices are analog. The audio interrupt is the digital path: the effects (chorus, delay, reverb) and the inputs. A render handler cannot process the synth voices themselves. Like the Digitakt mk1 core, the core uses DTIM0 and claims `timer:DTIM0`.

## Parameter pages

Core owns the entries of the four routines every parameter page goes through (page_info, page_get_value, param_apply_delta, param_value_text) and asks mods through three tables, with elekloader's `analog-four-mk2/pages.h` (copied in [`include/`](include/analog-four-mk2/pages.h)):

- `core_pages`: a mod's own page, `{page, name, ids[10]}`. A page has ten knobs, A to J; stock's pages are 0 to 47, so a mod's page id is 48 or more and no other mod's.
- `core_params`: how a range of parameter ids reads, turns and prints, `{first, last, get, delta, text}`. Entries are asked in `order`; the first that answers wins, then stock.
- `core_view_pages`: each A4 page is a view of its own, and a page key steps through a list of views for each track type (every track, synth, FX, CV). An entry `{type, key, page, shown}` adds a view after stock's on that key's list; a build holds 16. The current view is saved with the project, and core widens the index stock accepts so a mod's view comes back after a power cycle or a project load.

The full rules are in elekloader's [ADAPTING.md](https://github.com/irpina/elekloader/blob/main/docs/ADAPTING.md) ("Parameter pages (core-a4 0.2, Analog Four MKII)"); `examples/pages-check-a4` there is the smallest mod on them.

## Mod storage

Declare each field in `build.json`, then read and write it through the core with `analog-four-mk2/store.h` (copied unchanged in [`include/`](include/analog-four-mk2/store.h), `sdk/imports/core-a4-headers-f02be99.json`):

```json
"storage": [{ "sym": "my_accent", "scope": "track", "bits": 4 }]
```

```c
#include "analog-four-mk2/store.h"
STORE_FIELD(my_accent);
unsigned v = core_store_get(STORE(my_accent), live_pattern, track);
core_store_set(STORE(my_accent), live_pattern, track, v + 1);
```

`scope` is `sound` (32 bits a sound), `kit` (128), `global` (64 a slot), `track` (six tracks a pattern), `pattern` or `project`; `bits` is 1 to 32, and `sym` is a C name no other mod uses. Zero is the default everywhere. A field of the current kit or one of its sounds is written through to the stored project at once, as stock writes each parameter edit there; other kits, the pool, and track and pattern fields reach the stored project at the next stock save of that part or the next SAVE PROJECT AS. The byte layout and the rules are in the [core-a4 README](https://github.com/irpina/elekloader/tree/main/mods/core-a4) ("Mod storage").

## Memory and budgets

- **Shared mod memory:** 128 KiB of DDR (`0x47BE0000–0x47C00000`) for the core and every mod's code and data, as on the Rytm. A boot-time fill of the area and the gaps beside it was read back intact on a unit, through normal use, Overbridge and a power cycle.
- **Core image:** core 0.2 is 8,764 bytes `.run` plus 192 bytes `.bss` in the shared area, and an 88-byte `.boot` copier (elekloader `f02be99`). The linker remains authoritative for combined sizes and overlap.
- **Fast SRAM:** none.
- **Protected ranges:** none on OS 1.56.
- **Flash:** the main OS must end below `0x300000`, where the OS keeps its voice calibration record; its settings store is at `0x380000–0x400000`.

Claim named resources (a settings row, a SysEx id, a timer) in `platform.claims`; two mods may never claim the same one.

## Toolchain and build

Debian's `m68k-linux-gnu` GCC and binutils for ColdFire (set `ELEKLOADER_CROSS` for another prefix such as `m68k-elf-`), and elekloader's builder. Use the exact owner-supplied `Analog-Four_MKII_OS1.56.syx`; the builder recognises firmware by hash and changes only the main OS section. From an elekloader checkout:

```sh
python -m elekloader.sdk.build mods/core-a4 --stock Analog-Four_MKII_OS1.56.syx
python -m elekloader.sdk.build <module-folder> --stock Analog-Four_MKII_OS1.56.syx
python -m elekloader.lint <module-folder>/out/<mod>-<version>.elemod \
    --stock Analog-Four_MKII_OS1.56.syx --with mods/core-a4/out/core-0.2.elemod
python -m elekloader.patch --stock Analog-Four_MKII_OS1.56.syx \
    --mod mods/core-a4/out/core-0.2.elemod --mod <module-folder>/out/<mod>-<version>.elemod \
    --out my-build.syx --version XX01
```

Modwerk packs the main OS more densely than elekloader, so a build's .syx is smaller than elekloader's for the same image (893,717 stored bytes against 974,236 for core alone); both depack to the same image. The in-place depack margin narrows with it: about 478 KB for core with three mods, against stock's 540 KB.

## Flash and recover

Send the .syx with Elektron Transfer over USB (MIDI IN and OUT set to the device) and press YES on the unit; it restarts by itself. Restoring the stock .syx the same way returns the unit to stock. If a custom OS will not start, hold FUNC while powering on to open the STARTUP menu, choose TRIG 4 (OS UPGRADE), then send the stock .syx over MIDI DIN; recovery mode does not use USB, so you need a MIDI DIN sender. Local parsing and link checks do not guarantee hardware safety.

## Status

core-a4 0.1 and 0.2 are in elekloader (irpina/elekloader#154 and #180). On a unit, on OS 1.56: HC56 (core and hooks-check-a4) ran every hook; SC56 (store-check-a4) kept every storage field through saves, loads, power cycles and a Transfer round trip; CA56 (ddr-canary-a4) left the mods' area intact; PA56 (core 0.2 and pages-check-a4) passed the parameter page checks; the stock file restored the unit over MIDI DIN. Before a first module enters the library, the A4 needs a pinned core-a4 release (elekloader has none yet) and the browser's build preview.

## Credits

The device profile, memory map and core port build on [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later) and its Analog Rytm MKII core, core-ar2, and on [digikit](https://github.com/m-dwyer/digikit) (Em D, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT). [analog-emu](https://github.com/Iced-Cream/analog-emu) (MIT, a fork of rytm-emu and [rouletrro](https://github.com/Ondrysak/rouletrro)) runs stock OS 1.56 in an emulator, for checks and screenshots before flashing.
