# Model:Cycles: the Modwerk base from core-mc 0.3 — 23 November 2026

The first Modwerk base for Model:Cycles OS 1.13, built by `npm run machine:base -- model-cycles` with the reviewed
toolchain (m68k-elf GCC 16.2.0, binutils 2.47) against the kit at `3b31ef3`, from core-mc 0.3's source at Elekloader
v0.11.0, unchanged. Two builds were run.

## dee352df: the first build (superseded)

Its copy of core-mc's `mod.json` set each hook's collection to 8, read as room for eight handlers. A collection's
number is the entry size in bytes, so the linker refuses every module against it ("an entry for ev_tick is not 8
bytes"), found when the first test module was linked. Nothing subscribed, so the base alone ran as stock.

- **Package:** equal to the release `core-mc-0.3.elemod` (`e214e171…`) except the collections. 76 bytes `.boot`, 180
  `.run`, 16 `.bss`, 5 sites.
- **Image:** linked with the kit-pinned Elekloader patcher (`elekloader.patch`, checkout from `npm run upstream:tools`)
  on the stock `model-cycles_OS1.13.syx` (`44fe5862…`): `101129e0…`, 976,800 bytes, flash ends at `0x0dc260`.
- **Emulator** (digiemu, macOS app; not hardware evidence): boots, a project loads, a pattern on all six tracks plays,
  knobs turn and the PUNCH, GATE, LFO and MACHINES pages open as with stock 1.13; boots again after a restart.
- **On a unit** (the submitter's Model:Cycles, flashed as an OS update, then a power cycle): boots normally and behaves
  as with stock 1.13.

## 2e5243e6: the base this pull request vendors

core-mc 0.3's own `mod.json` (collections 4, as released) and Modwerk's `ev_key_leds` (`modwerk/key-leds.s`, site
`0x40006a6e`, collection `ev_key_leds`). The recipe's check passes: it keeps every site, export, import, weak symbol,
contribution, collection, requirement and conflict of the release.

- **Package:** 76 bytes `.boot`, 220 `.run`, 16 `.bss`, 6 sites (`sdk/machines/model-cycles/base-binding.json`).
- **Test image:** the base and a test module (`leds-test`, not in this repository: `ev_tick` flips a flag every 15
  ticks and sets `ctrl + 0x21`; `ev_key_leds` sets TRIG 16 on or off with `fw_led_set`), linked as above:
  `7bdfbcde…`, 976,928 bytes, flash ends at `0x0dc2d0`. The linker placed one entry in each of `ev_tick` and
  `ev_key_leds`.
- **Emulator** (digiemu, macOS app; not hardware evidence): TRIG 16 blinks about once a second with the sequencer
  stopped, while a pattern plays and with TRACK held; the other LEDs behave as with stock 1.13.
- **On a unit** (the submitter's Model:Cycles, the test image flashed as an OS update, then a power cycle): boots
  normally; TRIG 16 blinks about once a second with the sequencer stopped, while a pattern plays, with TRACK held and
  with PATTERN pressed, where it stays over the stock pattern LEDs (the test module sets it in every frame, first
  setter wins). The other LEDs behave as with stock 1.13.
- **Not run on this build:** recovery with the stock `.syx` after it.
