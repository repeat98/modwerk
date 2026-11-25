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

## 646706ff: the base this pull request vendors (25 November 2026)

`4d4d91d2` (below) with the owner's review fixes: a RAM boot keeps an accepted request's numbers, the flush pushes
all four cache ways, a release base sends 0 for the RAM-boot words, and the link writes each reply whole under
stock's USB lock, holds it while another SysEx is open (for up to a second) and drops none
([LINK.md](../../sdk/machines/model-cycles/LINK.md), "Stock's send from two tasks"). 76 bytes `.boot`, 38214 `.run`,
115796 `.bss`, 8 sites. Its image `89edf78e…` (stock 1.13 and the base alone) is byte for byte what the site's kit
builds from the stock file. On the submitter's Model:Cycles, flashed with stock's upgrade: identity `0x7c774e99`
and RAM-boot words 0; the loader's edge cases (try, keep, undo, refused while a pattern plays, the 10 s lapse, two
modules on the draw hook with one removed, `frames.mwrm` on a stock-code site on trial, undone, kept and removed);
Transfer connected beside the link (419 requests, none dropped, no send failures); stock 1.13 flashed over it and
the base back from the site's send dialog. The development base of the same source (`d0a26304`, image `1d6c4052…`):
the site's stock bytes back after each undo and removal, the masked-span counters (longest 7.27 µs), a RAM boot, and
a FREEZE incident from a test module that held the UI tick for 6 s while the audio ran on. Rows in
[LINK.md](../../sdk/machines/model-cycles/LINK.md#evidence).

## 4d4d91d2: the base before the review fixes (24 November 2026)

`2e5243e6` (below) with the link, the audio load, the diagnostics log and the runtime loader in every base, as the
owner asked: 76 bytes `.boot`, 37994 `.run`, 115796 `.bss`, 8 sites. Its image `ec928894…` (stock 1.13 and the base
alone, as the site builds it) ran flashed on the submitter's unit: identity `0x15eddb5a`, the load and the log, the
loader's edge cases, Transfer connected beside the link, and a power cycle (the rows in
[LINK.md](../../sdk/machines/model-cycles/LINK.md#evidence)).

## 2e5243e6: the base before the link

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
