# Digitakt SDK

**Platform:** elemod · **OS:** 1.53 and 1.54 (mk1) · **Core:** 2.1 · **Modules:** [`sdk/digitakt/modules/`](../../digitakt/modules/) · **Status:** preview

Digitakt mods are linkable objects. One core patches the OS once at a few shared sites and calls every subscribed mod's handler, in order, from tables the linker builds. So any set of mods that fits the budgets combines. Modwerk builds them with its own TypeScript linker and OS writer, interoperable with the `.elemod` format. Building firmware in Modwerk is in development, so the machine is in preview.

## Modwerk stack

Today mods reach the unit as a full OS file sent with Transfer. The Digitakt is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)): its core grows into a Modwerk base with a hook registry, a USB link, the runtime loader's ColdFire glue, base updates over USB, the MCP's device tools and the machine page. None of it is started. Until it ships this guide's core is what builds, a mod that needs a stock site other mods will want waits for the base's hook, and the full OS file sent with Transfer stays the fallback after it.

## Create a mod

```sh
npm run module:new -- my-mod --machine digitakt --author your-github-login
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
| `ev_render_in` / `ev_render_out` | entry and exit of the audio render | `void f(void)` |
| SRC machines | the table `core_machines`: new SRC machines in slots 4–7, treated by the OS like the stock machine they stand in for | — |

A site the core does not expose is proposed as a core hook before the mod, never patched by it ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).

## Budgets

- **Shared mod memory:** 128 KiB of DDR (0x47BE0000–0x47C00000) for the core and every mod's code and data.
- **Fast SRAM:** 2,304 bytes (0x8000F700–0x80010000) for time-critical code.
- **SRC machine slots:** 4–7, one per new machine.

Claim named resources (a machine slot, a SETTINGS row, a SysEx id, a +Drive path) in `platform.claims`; two mods may never claim the same one. Save a mod's state only in a record it owns (a tagged kit tail, pattern padding), never in bytes another mod saves ([a module owns what it saves](../../../docs/module-guides/README.md#cross-compatibility)).

## Toolchain

m68k-elf GCC and binutils for ColdFire, and elekloader's builder, which Modwerk runs in the browser for the launch ([vendor/elekloader](../../../vendor/elekloader/README.md)). Modwerk's own linker, OS writer and core are frozen until work resumes; the core's contract is [core/interface.json](../../digitakt/core/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Flash and recover

Send the .syx with Elektron Transfer and confirm on the unit. If a custom OS will not start, hold FUNC while powering on, choose OS UPGRADE (TRIG 4) and send the stock .syx with Transfer's legacy OS upgrade mode.

## Credits

The file format, memory map, core interface and hook bus were researched and published by [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT).
