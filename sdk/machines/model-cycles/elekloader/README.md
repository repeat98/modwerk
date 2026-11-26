# Model:Cycles base source

Modwerk's base for Model:Cycles OS 1.13 starts from core-mc 0.3 at `f20ffda`, the commit of
[Elekloader v0.11.0](https://github.com/elekloader/elekloader/releases/tag/v0.11.0). The imported `core-mc/`, the
shared `core/core.s` and `../include/model-cycles/` are byte-for-byte copies; the
[import record](../../../imports/core-mc-source-f20ffda.json) lists each file and its SHA-256. core-mc is drumkilla's,
on irpina's hook bus. Its firmware locations (0.2), `ev_boot` and the boot cache invalidation (0.3) came in through
Elekloader #192 to #194. The pinned kit's SDK has core-mc 0.1 and no Model:Cycles headers, so the headers come with the
import.

[base.json](base.json) builds core-mc's own `mod.json` and adds one hook, `ev_key_leds`
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
