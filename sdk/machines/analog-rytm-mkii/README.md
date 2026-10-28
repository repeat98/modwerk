# Analog Rytm MKII SDK

**Platform:** elemod · **OS:** 1.74 · **Core:** elekloader core-ar2 0.7 · **Modules:** [`sdk/analog-rytm-mkii/modules/`](../../analog-rytm-mkii/modules/) · **Status:** preview

The Analog Rytm MKII runs on the same ColdFire platform as the Digitakt mk1, and its OS entry and bootstrap loader match the Digitakt's instruction for instruction. Its core is elekloader's Digitakt mk1 core (`core.s`, `settings.s`, `render.s`) built with the Rytm's addresses. The core hooks eight shared sites and calls every subscribed mod's handler, in order, from tables the linker builds, so any set of mods that fits the budgets combines. From 0.2 it also keeps mod storage: fields a mod declares, saved with sounds, kits, global slots and projects (below). Cores from 0.3 on are for OS 1.74 only; new core versions drop old OS support, so Modwerk supports the Rytm on OS 1.74 alone. Every core 0.3 hook below has run on a unit; core 0.7 has not yet run on one from Modwerk's builder, so its parameter pages are not tested on hardware here. Modwerk's linker builds Rytm modules. Filter Hz is the first library module, so the machine is in preview: the browser builds the core with library modules on OS 1.74, with downloads off until the owner turns them on.

## Modwerk stack

Today the core is elekloader's core-ar2 0.7, and mods reach the unit as a full OS file sent with Transfer. The Rytm is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)) on a Modwerk base started from core-ar2 0.3's source (owner, 27 October 2026). The first shared site the base owns is the send bus: per-track sends, the SEND and SEND FX pages, per-kit state and p-locks, and an FX list each send effect joins as its own module. The USB link, the loader, base updates over USB, the MCP's device tools and the machine page follow. The plan goes to the owner before any code. Until the base ships, core-ar2 0.7 is what builds, and the full OS file sent with Transfer stays the fallback after it.

## Create a mod

```sh
npm run module:new -- my-mod --machine analog-rytm-mkii --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers. The core's contract is [core-profile/interface.json](../../analog-rytm-mkii/core-profile/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Core hooks

Handlers use the C calling convention: arguments on the stack, d0–d1/a0–a1 free, the result in d0. Subscribe in `platform.events` and name each handler in `build.json`.

| Hook | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI compose check, about 20 Hz (the Digitakt's runs at 30) | `void f(void *ctrl)`; set `ctrl + 0x20` to 1 to request a redraw. Not an audio-rate clock. |
| `ev_draw` | after the OS composes the 128 × 64 screen | `void f(void *bmp, void *ctrl)`; y counts up from the bottom row (0) to the top (63), x runs left to right |
| `ev_key` | a UI key event | `int f(void *brain, void *event)`; nonzero consumes it. `event + 12` is the key id (trig keys 0x00–0x0f, BANK A–H 0xc0–0xc7, FUNC 0x80, NO 0x45), `event + 16` the flags: 1 pressed, 0x10 released; a held key repeats with 8 set (a 2 s BANK hold gave 15 events) |
| `ev_enc` | a UI encoder event | `int f(void *brain, void *event)`; nonzero consumes it. `event + 12` is the encoder, 0–7 for A–H (not 1–8 as elekloader's ADAPTING.md gives for the Digitakt), `event + 16` the count after the encoder's acceleration, which can be 0 for a slow first turn |
| `ev_settings` | building the SETTINGS menu | `void f(void *menu)`; add rows with `core_additem(menu, row)` |
| `ev_render_in` / `ev_render_out` | entry and exit of the ColdFire's audio block: 32 frames, about 1,500 blocks a second | `void f(void)` |
| `ev_project` (core 0.3) | after CREATE NEW or the project reset (`how` 0), and after every project load, at boot too (`how` 1); the project and its mod data are in place | `void f(int how, unsigned dropped)`; `dropped` flags the global, track, pattern and project scopes that loaded as zeros. Keep it short, and start no load or save from it. |

On the Rytm, y = 0 is the bottom row of the screen: a rectangle at y 48–63 lands at the top, as hardware photos and rytm-emu both show. Drawing code written with y = 0 as the top row, such as the hooks-check example ported from the Digitakt, needs y flipped (63 − y).

The render hooks cover the digital path only: this block renders the delay and reverb and mixes their returns. The analog voices are not rendered by this code, so a mod cannot change a voice's own sound; it can read each voice from the codec's receive buffer and add a return of its own ([The audio block](#the-audio-block)). Like the Digitakt mk1 core, the core uses DTIM0 and claims `timer:DTIM0`.

Traps found while writing a C mod for OS 1.74 (rytm-emu `3c4c42c`, October 2026):

- **Stock returns pointers in d0.** Debian's `m68k-linux-gnu-gcc` expects a pointer result in a0, so a C mod that declares a stock routine as returning a pointer (`project_singleton`, `kit_track_sound`, a vtable getter) reads garbage and can jump to 0 at boot. Declare such routines as returning an integer and cast the result.
- **`is_key_held` does not cover the BANK keys.** They are not in stock's key-scan list, so it reads them as up; follow a BANK hold through `ev_key`'s press and release events instead, and ignore its repeats.
- **FUNC + turn never reaches the parameter path.** On a sound page a turn with FUNC held calls neither `param_set_apply_delta` nor `param_set_value`, and stock changes nothing, so a hook there never sees it. Take the gesture in `ev_enc` and test FUNC with `is_key_held(0x80)`.
- **SETTINGS is the GLOBAL menu.** The rows `ev_settings` adds come after SYSTEM in the menu the GLOBAL key opens. The menu calls a row's label callback again when it redraws the row, so the label can show the row's state: a row whose select callback flips a value and whose label reads it shows the new value at once.
- **Trig times in rytm-emu.** `DTEMU_FRAME_TRACE=160,162` prints the analog voice frame's trig switches (BD byte 161 bit 4, SD byte 160 bit 0, RS byte 163 bit 4) with their sample number whenever they change: exact trig timing without reading audio. The sequencer's timing words are in [sequencing.md](../../../docs/module-guides/sequencing.md#analog-rytm-mkii-os-174).

## The audio block

What follows was read and measured for Send FX on OS 1.74 (`src/gate.s` on branch `module/rytm-chorus`, commit `bf62ba19`, [repeat98/modwerk#878](https://github.com/repeat98/modwerk/pull/878)).

- **Where the returns are.** The FX returns routine takes the output slot in d2, runs the PRE return mixer (delay and reverb into the analog mixer, before distortion and the compressor), then the POST one, and ends with `move.l #32,%macsr` at 0x4010ee66 (6 bytes) before it returns. Every send effect needs this site, so it is shared: the Rytm's Modwerk base is to own it as the send bus ([Modwerk stack](#modwerk-stack)), and a send effect subscribes there rather than detouring the instruction itself. The PRE words sit at `0x80000030 + slot × 2048`, left and right on a 64-byte stride, 24-bit values in the low bits. The codec's receive buffer at 0x80007440 holds MAIN, the eight voices and AUDIO IN, 12 words a frame.
- **The EMAC.** Stock's mixers use the EMAC, and `#32` is its fractional mode, so a mod hooked there can use the EMAC too if it leaves it as stock had it. Read the accumulators it will use (Send FX: ACC0, ACC1 and ACCEXT01) into registers while MACSR still holds 0x20, which neither rounds nor saturates the reads. Then set its own mode, for example 0x80 (signed integer, saturating). Before returning, set `#32` again, then write the accumulators back, ACCEXT01 last.
- **What it buys.** `mac.w` with a parallel load sums the eight voice words in one instruction each: each multiplies a word's upper half by its gain while it loads the next word. To add a 16-bit return to a 24-bit PRE word with 24-bit saturation, shift the word up 8 bits, `move.l` it into an accumulator, `mac.l` the sample by the gain, read it back with `movclr.l` and shift it down 8. In the emulator Send FX's output loop fell from about 40 to about 20 instructions a frame, and the eight voices from about 60 to about 16.
- **Measure it on the unit's own clock.** core-ar2 starts DMA timer 0 free running. Read its counter (0xFC07000C) as the mod's block starts and ends, and divide by the time since the previous block, as Send FX's CPU meter does. In the emulator one instruction executed per 48 kHz frame cost about 0.023 % of the block period.
- **rytm-emu's profiler does not see mod code.** `dtboot --profile-after N` (revision `3c4c42c`) samples only the blocks it runs from its code window, the stock code from 0x40000400. A mod's code, high in RAM (0x47BE0000 on), runs on the stepped path and is never sampled. Measuring Send FX needed a local change to `src/cpu.rs` that samples the stepped branch too, at a jittered interval (33 to 96 instructions) so a loop's period does not alias with it, and a dump of every sampled PC in an address range. Propose such a change to [rytm-emu](https://github.com/trigcondition/rytm-emu) upstream; do not commit emulator code here.

## Parameter pages (core 0.4 and later)

From 0.4 the core takes the four routines every parameter page goes through, and the page keys' lists. A mod adds its own page behind a stock page key, or answers a stock page's parameters, by contributing entries to `core_pages`, `core_params` and `core_view_pages` (0.6 adds `core_page_fns`, a page's own info function). Several mods share one key: the key steps through stock's pages, then each mod's, in `core_view_pages`' order. The structures and the view numbers (`CORE_VIEW_AMP`, `CORE_VIEW_DELAY`…) are in [`include/analog-rytm-mk2/pages.h`](include/analog-rytm-mk2/pages.h); elekloader's ADAPTING.md, "Parameter pages (core-ar2 0.4)", has the full contract. Prefer these lists to a page key gesture of a mod's own: a second press only one mod can hold is a dead end ([Choose how a module hooks in](../../../docs/module-guides/README.md#choose-how-a-module-hooks-in)). 0.5 adds mod machines in the hidden machine slots ([`machines.h`](include/analog-rytm-mk2/machines.h)), 0.4 the audio block's load in `core_audio_load` ([`load.h`](include/analog-rytm-mk2/load.h)).

Mods built for 0.3 that patch a page's entry or a page key's list themselves (rytm2_mods v1.2's lfo-rnd, voice-dac, euclid-accents, velocity-humanise and comp-preview 1.0) overlap core's page sites and are refused at link with 0.4 and later; their 0.4 versions contribute entries instead. Mods with only events and storage, and mods that hook deeper in those routines (filter-hz's text, ctrl-all's turn), link with 0.7 as with 0.3.

## Mod storage (core 0.3)

Declare each field in `build.json`, then read and write it through the core with elekloader's `analog-rytm-mk2/store.h`. Modwerk's source builder finds it in [`include/`](include/analog-rytm-mk2/store.h), copied unchanged from elekloader's `core-ar2-v0.3` tag (`sdk/imports/core-ar2-store-header-769d9aa.json`); elekloader's own builder uses its SDK's copy:

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
- **Core image:** core 0.7 is 10,692 bytes `.run` plus 1,368 bytes `.bss` in the shared area, and a 94-byte `.boot` copier (core 0.3: 7,540, 36 and 88). The linker remains authoritative for combined sizes and overlap.
- **Fast SRAM:** none. The core has no `.fast` copy table on this machine.
- **Protected ranges:** none on OS 1.74.
- **Flash:** the main OS must end below `0x300000`; the OS keeps its own stores at `0x300000–0x380000` and `0x380000–0x400000`.

Claim named resources (a SETTINGS row, a SysEx id, a timer) in `platform.claims`; two mods may never claim the same one.

## Toolchain and build

Debian's `m68k-linux-gnu` GCC and binutils for ColdFire (elekloader's default for this machine; set `ELEKLOADER_CROSS` for another prefix such as `m68k-elf-`), and elekloader's builder. Use the exact owner-supplied `Analog-Rytm_MKII_OS1.74.syx`; the builder recognises firmware by hash and changes only the main OS section. From an elekloader checkout, with `core-ar2-0.7.elemod` from the [core-ar2-v0.7](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.7) pre-release:

```sh
python -m elekloader.sdk.build <module-folder> --stock Analog-Rytm_MKII_OS1.74.syx
python -m elekloader.lint <module-folder>/out/<mod>-<version>-os1.74.elemod \
    --stock Analog-Rytm_MKII_OS1.74.syx --with core-ar2-0.7.elemod
python -m elekloader.patch --stock Analog-Rytm_MKII_OS1.74.syx \
    --mod core-ar2-0.7.elemod --mod <module-folder>/out/<mod>-<version>-os1.74.elemod \
    --out my-build.syx --version XX01
```

Modwerk's linker covers OS 1.74 (`src/engine/elektron/elemod.ts`), mod storage included. On the owner's stock 1.74 file it links core-ar2 0.3 with each of rytm2_mods v1.2's eleven mods, with the storage mods together, with all eleven, and again from a kept lockfile, byte for byte as elekloader kit 0.7.0 does, and links core-ar2 0.7 alone, with Filter Hz, and with Loop Sync and Retrig Grid from one lockfile as kit 0.7.0 and elekloader at the core's commit do ([verification record](../../../docs/verification/2026-10-27-rytm-core-ar2-pages.md)). In the browser, the Rytm's configuration page checks and builds the newest pinned core, core-ar2 0.7, and the selected library modules from the owner's stock OS 1.74, with elekloader's kit, the core pinned in `sdk/imports/elekloader-core-ar2-v0.7.json` (0.3's record stays) and each module's source-only package pinned in its own record (`sdk/imports/elekloader-filter-hz-2026-10-23.json`). Downloads stay off until the owner turns them on. Each configuration keeps the storage lockfile of its last build (Mod storage, above), so a module with storage can enter the library.

## Flash and recover

Send the .syx with Elektron Transfer over USB (MIDI IN and OUT set to the device) and press YES on the unit; it restarts by itself. Restoring the stock .syx the same way returns the unit to stock. If a custom OS will not start, hold FUNC while powering on to open the STARTUP menu, choose TRIG 4 (OS UPGRADE), then send the stock .syx from Transfer's SysEx Transfer Recovery Mode over MIDI DIN; recovery mode does not use USB, so you need a MIDI DIN sender: a USB-MIDI interface, or a serial adapter at 31250 baud as the machine profile describes. Local parsing and link checks do not guarantee hardware safety.

## Status

The first port, core-ar2 0.1 for OS 1.73, is in elekloader (merged in irpina/elekloader#89); Modwerk no longer supports OS 1.73. Builds HM01 (core and hello-marker) and HC01 (core and hooks-check) ran every hook on a unit on OS 1.73, and the stock .syx restored it each time ([core report](https://github.com/Iced-Cream/rytm-mods-boot-report/blob/main/CORE_REPORT.md)). Core-ar2 0.3 (OS 1.74, with mod storage) is on elekloader's [core-ar2-v0.3](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.3) pre-release and in kit 0.7.0's catalog; core-ar2 0.7 (parameter pages, machines, page functions, write-through) is on the [core-ar2-v0.7](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.7) pre-release (irpina/elekloader#199). Filter Hz is the first library module ([folder](../../analog-rytm-mkii/modules/filter-hz/)).

## Credits

The device profile, memory map and core port build on [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT); the Rytm's OS 1.74 boot contract and recovery path by [rytm-fw-re](https://github.com/ethernet8023/rytm-fw-re). [rytm-emu](https://github.com/trigcondition/rytm-emu) (MIT, a fork of [rouletrro](https://github.com/Ondrysak/rouletrro)) runs stock and patched OS 1.73 builds in an emulator, for checks and screenshots before flashing.
