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

core-mc 0.3's own `mod.json` (collections 4, as released) and Modwerk's `ev_key_leds` (`base/key-leds.s`, site
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

## The development link (dev base bf2f8ac4)

The release base above with base.json's `dev`: the read-only USB link (`base/link.c`, `link.s`), dev base `bf2f8ac4`,
1524 bytes `.run`, 484 `.bss`, 7 sites. On the submitter's Model:Cycles over USB from a Mac with
`sdk/machines/model-cycles/tools/mc_link.py`: the first link (`79efd1ec…`, any port) answered `ident` (port USB) and
`mem 0x40000400 16` (the stock OS's first bytes); the link limited to USB (`6054da89…`) answered `ident` after a fresh
flash with port USB and one request. Details in `sdk/machines/model-cycles/LINK.md`.

Keys and encoders over the link (dev base `26dee268`, image `ccb406b4…`): on the same unit, `key 2 1` held TRACK as
a person would and `key 2 0` let it go; `enc 2 10` on the main page turned PITCH.

RAM boot (dev base `984a4508`: 5624 bytes `.run`, 1284 `.bss`, 8 sites; it adds an `ev_boot` handler): on the same
unit, 24 November 2026, `089e13a9…` (the dev base alone) flashed as an OS update. `mc_link.py ramboot` uploaded
`f39676d6…` (the dev base and the TRIG 16 test module, MAIN OS CRC `0x36fc4fa1`) with stock's OS upgrade in 3.2 s,
nobody answered "Upgrade OS now?", and the link answered ok and reset the unit. After a power cycle the attempt was
repeated: the unit reset by itself, TRIG 16 blinked, and `ident` reported the mailbox `booted`, `booted from RAM` and
CRC `0x36fc4fa1`. A power cycle then booted the flashed image: TRIG 16 did not blink. Nothing was flashed for the RAM
boot.

## The site's build of 2e5243e6 (24 November 2026)

The machine page builds the base through the vendored Elekloader kit 0.7.0, with `modwerk-base-model-cycles-2e5243e6.elemod`
pinned in `sdk/imports/elekloader-modwerk-base-model-cycles-2026-11-24.json`. `planBuild('model-cycles', '1.13', [])`
picks that file, not core-mc 0.3 (`digi-build.test.ts`). The kit's `build` in Node, given the stock
`model-cycles_OS1.13.syx` (`44fe5862…`) and that package with no version name, logs 6 sites, RAM
`0x47e00000–0x47e00104`, sections 2, 4 and 5 byte for byte, flash end `0x0dc280` (1,064,320 bytes spare), and writes
`f8b652a0…` (976,800 bytes): byte for byte the image Elekloader's Python patcher built from the same files on
23 November. Downloads are off, so the page offers no file yet. Not run here: the page itself in a browser (it needs
a signed-in member).

## Sending from the page's sender over USB (24 November 2026)

The site's own sender (`src/engine/elektron/os-upgrade.ts` over `os-upgrade-midi.ts`, as `usb-upgrade.ts` calls it),
bundled with Vite and run from Node through the MCP's `nodeMidiAccess` on a Mac, sent `f8b652a0…` (the base
`2e5243e6` alone, no module) to the unit over USB with Elektron Transfer closed: 478 messages, each answered, in 2.2 s.
The unit asked UPGRADE OS NOW?; after YES it wrote the flash and booted normally, as stock (tester's report). This is
also the first run of the base with no subscriber on `ev_key_leds`. Not run: the page's dialog in a browser (its
button waits for the downloads approval), NO at UPGRADE OS NOW?.

