# Model:Cycles base source

Modwerk's base for Model:Cycles OS 1.13 is Modwerk's own source (GPL-2.0-or-later). `core/core.s` is the hook bus,
the Digitakt II's `core.s` byte for byte (28 November 2026). `core-mc/` is the core's recipe (`mod.json`: the boot's two
displaced calls, the cache invalidation and `core_boot_init`), the OS's own routines and data by name (`fw.s`, 25
`fw_*` symbols, no bytes) and `ev_boot` (`boot.s`); `../include/model-cycles/` declares them for C (`core.h`) and
assembly (`core.inc`). These replaced drumkilla's core-mc 0.3 from
[Elekloader v0.11.0](https://github.com/elekloader/elekloader/releases/tag/v0.11.0) on 28 November 2026, with the same
names, values and sites, so whatever was built for core-mc 0.3 links to this core; the
[import record](../../../imports/core-mc-source-f20ffda.json) stays as history. The core's five stock sites (boot,
`ev_tick`, `ev_draw`, `ev_key`, `ev_enc`) are in [base.json](base.json)'s `common`, each named by its stock bytes'
length and SHA-256.

[base.json](base.json) builds the core's `mod.json` and adds one hook, `ev_key_leds`
([base/key-leds.s](base/key-leds.s)): the key-LED frame after the LEDs are cleared and before the stock views set
theirs, as the Digitakt II has it. Its site is the frame's clear call (`0x40006a6e`); `fw_led_set` names the OS's own
setter, declared for C in [`../include/mc/core.h`](../include/mc/core.h). [events.json](../events.json) lists all six
hooks.

A collection's number in `mod.json` is the size of one entry in bytes (a handler's address, 4), not a count of
handlers: the linker puts every subscriber of a hook in its table.

The recipe checks that the base keeps every site, export, import, weak symbol, contribution, collection, requirement
and conflict of the released `core-mc-0.3.elemod` (pinned in
[`sdk/imports/elekloader-core-mc-v0.3.json`](../../../imports/elekloader-core-mc-v0.3.json)). To reproduce it, build with
the toolchain of `sdk/build/Dockerfile`, the kit-pinned Elekloader SDK and your local copy of the exact stock OS:

```sh
npm run machine:base -- model-cycles --stock /private/model-cycles_OS1.13.syx --out /private/mc-base
```

## Results

- Built 2026-11-28 with Modwerk's own core: package `c8e9966a…` ([base-binding.json](../base-binding.json)), 94 bytes
  `.boot`, 38250 `.run`, 115796 `.bss`, 8 sites; its exports, imports, sites, tables, contributions and every `fw_*`
  value equal those of `485c526a…`, the hook-bus base before it. Not yet run on a unit.
- Built 2026-11-25 with m68k-elf GCC 16.2.0 and binutils 2.47 against the kit at `3b31ef3`: package `646706ff…`
  (see [base-binding.json](../base-binding.json)), 76 bytes `.boot`, 38214 `.run`, 115796 `.bss`, 8 sites, with the
  link, the audio load, the log and the runtime loader ([LINK.md](../LINK.md)). Before it, `4d4d91d2…` (24 November,
  before the review fixes and whole-reply sends) had 37994 bytes `.run`; before the link, `2e5243e6…` had 220
  bytes `.run`, 16 `.bss` and 6 sites. core-mc 0.3's release has 180 bytes `.run` and 5 sites.
- An image of stock OS 1.13 with this base and a test module that blinks TRIG 16 through `ev_key_leds`, asking for each
  LED frame from `ev_tick` (`7bdfbcde…`), runs in digiemu and on a unit as expected: TRIG 16 blinks in every view, over the stock LEDs
  ([record](../../../../docs/verification/2026-11-23-model-cycles-base.md)).
- The first build of this base (`dee352df…`, without `ev_key_leds`) booted on a unit and behaved as stock. Its copy of
  core-mc's `mod.json` set every collection to 8, read as room for eight handlers; 8 is an entry size, so the linker
  would have refused every module. This base keeps the release's 4.
