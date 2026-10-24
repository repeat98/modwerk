# Digitone SDK

**Platform:** elemod · **OS:** 1.43 and 1.44 (mk1 and Digitone Keys share one file) · **Core:** 2.2 · **Modules:** [`sdk/digitone/modules/`](../../digitone/modules/) · **Status:** preview

Digitone mods are linkable objects. One core patches the OS once at a few shared sites and calls every subscribed mod's handler, in order, from tables the linker builds. So any set of mods that fits the budgets combines. Modwerk builds them with its own TypeScript linker and OS writer, interoperable with the `.elemod` format. Building firmware in Modwerk is in development, so the machine is in preview.

## Create a mod

```sh
npm run module:new -- my-mod --machine digitone --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers.

## Core events

Handlers use the C calling convention: arguments on the stack, d0–d1/a0–a1 free, the result in d0. Subscribe in `platform.events` and name each handler in `build.json`.

| Event | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI's 30 Hz compose check | `void f(ctrl)`; set `ctrl+0x20` to recompose |
| `ev_draw` | after the OS draws the screen | `void f(bmp, ctrl)` |
| `ev_key` | a key event | `int f(brain, KeyEvent*)`; nonzero takes it |
| `ev_enc` | an encoder event | `int f(brain, EncoderEvent*)`; nonzero takes it |
| `ev_settings` | building the SETTINGS menu | `void f(menu)`; add rows with `core_additem(menu, row)` |
| `ev_render_in` / `ev_render_out` | entry and exit of the audio render on the main CPU (the FM voices run on the second CPU) | `void f(void)` |
| `ev_voice_on` | a voice's note-on in the render; the handler may change the pitch word | `void f(voice, track, event)` |
| `ev_hold` | a track key held on its own; none taken opens the Mod Menu | `int f(brain, event, track)` |
| Tables | `core_params` (parameter ids 182–184), `core_pages` (pages 27–30), `core_projdata` (blocks saved with the project), `core_menu` (Mod Menu entries) | — |

A site the core does not expose is proposed as an event before the mod, never patched by it ([propose an event](../../../docs/module-guides/README.md#propose-an-event-on-the-digitakt-digitone-or-digitakt-ii)).

## Budgets

- **Shared mod memory:** 128 KiB of DDR (0x47BE0000–0x47C00000) for the core and every mod's code and data.
- **Parameter slots:** 3 (ids 182–184), shown, turned and p-locked by the stock UI.
- **Mod pages:** 4 (pages 27–30), each placed after a stock page in its key's list.

Claim named resources (a machine slot, a SETTINGS row, a SysEx id, a +Drive path) in `platform.claims`; two mods may never claim the same one.

## Toolchain

m68k-elf GCC and binutils for ColdFire, and elekloader's builder, which Modwerk runs in the browser for the launch ([vendor/elekloader](../../../vendor/elekloader/README.md)). Modwerk's own linker, OS writer and core are frozen until work resumes; the core's contract is [core/interface.json](../../digitone/core/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Flash and recover

Send the .syx with Elektron Transfer and confirm on the unit. If a custom OS will not start, hold FUNC while powering on, choose OS UPGRADE (TRIG 4) and send the stock .syx with Transfer's legacy OS upgrade mode.

## Credits

The file format, memory map, core interface and hook bus were researched and published by [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later) and [digikit](https://github.com/m-dwyer/digikit) (Em D, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT).
