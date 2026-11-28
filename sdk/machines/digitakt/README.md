# Digitakt SDK

**Platform:** elemod · **OS:** 1.53 and 1.54 (mk1) · **Core:** 4.4 (elekloader's; mods use the hooks below, interface 2.1) · **Modules:** [`sdk/digitakt/modules/`](../../digitakt/modules/) · **Status:** preview

Digitakt mods are linkable objects. One core patches the OS once at a few shared sites and calls every subscribed mod's handler, in order, from tables the linker builds. So any set of mods that fits the budgets combines. The site builds firmware with elekloader's builder (below), so the machine is in preview.

## Modwerk stack

Today mods reach the unit as a full OS file sent with Transfer. The Digitakt is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)): a Modwerk base with a hook registry, a USB link, the runtime loader's ColdFire glue, base updates over USB, the MCP's device tools and the machine page.

**The base** is Modwerk's own, version 5.0 for OS 1.53 and 1.54, in [base/](base/README.md): the October core (`sdk/elemod/core/`) grown to interface 2.1 with DTIM0, the SRC machines of `core_machines`, and Machine Pages' contract (`ev_render_voices`, `cm_ui_v3`, `cm_ui_v31` and its SRC and LFO page sites), so the machine mods need no separate dependency. `npm run elemod:base -- digitakt` builds it from source and checks it against [base-binding.json](base-binding.json); its hooks are in [events.json](events.json). Every shipped mod links on it alone and in pairs (`npm run digi:link-all -- --machine digitakt --core <base> --package <machine-pages>`). It has not run on a unit yet, so site builds still link the catalogue's core below until a tester has run the base; then the site switches over. The USB link, loader glue and machine page are not started; the full OS file sent with Transfer stays the fallback after them.

## Create a mod

```sh
npm run module:new -- my-mod --machine digitakt --author your-github-login
```

This creates `modwerk.module.json` (contract v3), `build.json`, `src/main.c`, README, TESTING, licence and a placeholder thumbnail. See [the SDK guide](../../../docs/SDK.md) for the contract and evidence tiers.

To try it before a pull request, build a local image from your own stock OS and flash it as below:

```sh
node scripts/link-image.mjs --stock Digitakt_OS1.53.syx --version XX01 --out test.syx \
  --elemod vendor/elekloader/catalog/core-4.4.elemod --module digitakt:my-mod
```

For OS 1.54 use `core-4.4-os1.54.elemod`. The catalog keeps core 2.1 beside it; a build takes the newest core its mods link with.

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
| `ev_render_voices` | in the render, after playback has written every track's block (Modwerk base; Machine Pages' event today) | `void f(int32_t *blocks)`; order 10–49 makes a track's sound, 50–89 changes it |
| SRC machines | the table `core_machines`: new SRC machines take ids 4–127, treated by the OS like the stock machine they stand in for | — |

A site the core does not expose and other mods will need is proposed as a core hook before the mod ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)); a site only this mod needs, it patches through `sites` in `build.json` ([choose how a module hooks in](../../../docs/module-guides/README.md#choose-how-a-module-hooks-in)).

## Budgets

- **Shared mod memory:** 128 KiB of DDR (0x47BE0000–0x47C00000) for the core and every mod's code and data.
- **Fast SRAM:** 2,304 bytes (0x8000F700–0x80010000) for time-critical code.
- **SRC machine ids:** 4–127, one per new machine, claimed as `machine:<id>` (STRING uses 8, Digi Mono 20–26, RAM Machines 120–121). Kits store the id, so keep it once released.

Claim named resources (a machine slot, a SETTINGS row, a SysEx id, a +Drive path) in `platform.claims`; two mods may never claim the same one. Save a mod's state only in a record it owns (a tagged kit tail, pattern padding), never in bytes another mod saves ([a module owns what it saves](../../../docs/module-guides/README.md#cross-compatibility)).

## Toolchain

m68k-elf GCC and binutils for ColdFire, and elekloader's builder, which Modwerk runs in the browser for the launch ([vendor/elekloader](../../../vendor/elekloader/README.md)). Modwerk's own linker and OS writer build local images (`scripts/link-image.mjs`, above); its own core is frozen until work resumes. The core's contract is [core/interface.json](../../digitakt/core/interface.json), and `npm run modules:check` rejects modules that use anything it does not provide.

## Flash and recover

Send the .syx with Elektron Transfer and confirm on the unit. If a custom OS will not start, hold FUNC while powering on, choose OS UPGRADE (TRIG 4) and send the stock .syx with Transfer's legacy OS upgrade mode.

## Credits

The file format, memory map, core interface and hook bus were researched and published by [elekloader](https://github.com/irpina/elekloader) (irpina, GPL-2.0-or-later). The container and SysEx transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT).
