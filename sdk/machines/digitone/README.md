# Digitone SDK

**Platform:** elemod · **OS:** 1.43 and 1.44 (mk1 and Digitone Keys share one file) · **Core:** Modwerk base 3.0 (interface 2.2); site builds still take elekloader's 5.4 · **Modules:** [`sdk/digitone/modules/`](../../digitone/modules/) · **Status:** preview

Digitone mods are linkable objects. One core patches the OS once at a few shared sites and calls every subscribed mod's handler, in order, from tables the linker builds. So any set of mods that fits the budgets combines. Modwerk builds them with its own TypeScript linker and OS writer, interoperable with the `.elemod` format. Building firmware in Modwerk is in development, so the machine is in preview.

## Modwerk stack

Today mods reach the unit as a full OS file sent with Transfer. The Digitone is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)): a Modwerk base with a hook registry, a USB link, the runtime loader's ColdFire glue, base updates over USB, the MCP's device tools and the machine page.

**The base** is Modwerk's own, version 3.0 for OS 1.43 and 1.44, in [base/](base/README.md): the October core (`sdk/elemod/core/`) grown to the whole of interface 2.2, with DTIM0, the twelve hooks, the three parameter slots, the mod pages, one project data list shared with every writer, the Mod Menu and `core_audio`. `npm run elemod:base -- digitone` builds it from source and checks it against [base-binding.json](base-binding.json); its hooks are in [events.json](events.json). KitBank links on it on OS 1.44, and the base alone on OS 1.43 (`npm run digi:link-all -- --machine digitone --core <base>`). It has not run on a unit yet, so site builds still link the catalogue's cores until a tester has run the base; then the site switches over. The USB link, loader glue and machine page are not started; the full OS file sent with Transfer stays the fallback after them.

## Create a mod

```sh
npm run module:new -- my-mod --machine digitone --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers.

## Core hooks

Handlers use the C calling convention: arguments on the stack, d0–d1/a0–a1 free, the result in d0. Subscribe in `platform.events` and name each handler in `build.json`.

| Hook | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI's 30 Hz compose check | `void f(ctrl)`; set `ctrl+0x20` to recompose |
| `ev_draw` | after the OS draws the screen | `void f(bmp, ctrl)` |
| `ev_key` | a key event | `int f(brain, KeyEvent*)`; nonzero takes it |
| `ev_enc` | an encoder event | `int f(brain, EncoderEvent*)`; nonzero takes it |
| `ev_settings` | building the SETTINGS menu | `void f(menu)`; add rows with `core_additem(menu, row)` |
| `ev_render_in` / `ev_render_out` | entry and exit of the audio render on the main CPU (the FM voices run on the second CPU) | `void f(void)` |
| `ev_voice_on` | a voice's note-on in the render; the handler may change the pitch word | `void f(voice, track, event)` |
| `ev_hold` | a track key held on its own; none taken opens the Mod Menu | `int f(brain, event, track)` |
| `ev_midi_cc` | a MIDI CC on a track's channel or the auto channel, before the stock applies it (core 3.2 and newer) | `int f(track, cc, value, flags)`; nonzero takes it |
| `ev_key_leds` | the key-LED frame, before the stock views set theirs; the first setter of an LED wins (core 3.3 and newer) | `void f(mgr)` |
| `ev_note_queue` | an event a note source queues for the render, a step ahead, with its p-locks and the time it plays (core 4.1 and newer) | `void f(event, time)` |
| Tables | `core_params` (parameter ids 182–184), `core_pages` (pages 27–30), `core_projdata` (blocks saved with the project), `core_menu` (Mod Menu entries), `core_audio` (exclusive or insert audio owners, core 3.2 and newer) | — |

A site the core does not expose is proposed as a core hook before the mod, never patched by it ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).

## Budgets

- **Shared mod memory:** 128 KiB of DDR (0x47BE0000–0x47C00000) for the core and every mod's code and data.
- **Parameter slots:** 3 (ids 182–184), shown, turned and p-locked by the stock UI.
- **Mod pages:** 4 (pages 27–30), each placed after a stock page in its key's list.

Claim named resources (a machine slot, a SETTINGS row, a SysEx id, a +Drive path) in `platform.claims`; two mods may never claim the same one.

## Toolchain

m68k-elf GCC and binutils for ColdFire, and elekloader's builder, which Modwerk runs in the browser for the launch ([vendor/elekloader](../../../vendor/elekloader/README.md)). Modwerk's own core is the base above; the core's contract is [core/interface.json](../../digitone/core/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Flash and recover

Send the .syx with Elektron Transfer and confirm on the unit. If a custom OS will not start, hold FUNC while powering on, choose OS UPGRADE (TRIG 4) and send the stock .syx with Transfer's legacy OS upgrade mode.

## Credits

The file format, memory map, core interface and hook bus were researched and published by [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT).
