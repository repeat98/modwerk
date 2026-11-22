# Voice Spread testing

## On a unit (prodbysmolec, 23 November 2026)

Digitone II, stock OS 1.12 (`Digitone_II_OS1.12.syx`, sha256 `7e5b8a733d4ab1fd…`). This folder's source compiled with GCC 16.2.0 `m68k-elf` (`scripts/build-elemod-packages.mjs`, the local toolchain, not yet the pinned Docker image), linked by Elekloader 0.11.0's patcher with Modwerk's Digitone II development base (`modwerk-base-digitone-ii-dev-70f7a8dc`: the plain base 1.1 plus the USB link) for OS 1.12. Recipe `1.12.json` sha256 `582ac4a6d13297aab2b60470520513635475711e3178f88f03f2a09f7d88ec60`, source tree `80b9bcc61e938fec…` (the build inventory's `sourceTreeSha256`, at the module's C sources of this commit). Image sha256 `5193559275f5656e9dafd88790bd27ee0d1dd7b9322a08f122b1a13e2fcc4270`. Booted from RAM over the link (`dn2_link.py ramboot`); nothing was written to the flash.

| Check | How | Result |
| --- | --- | --- |
| The rows appear | SETTINGS > PERSONALIZE, screen read over the link | VOICE SPREAD and FILTER SPREAD are the last two rows, label left and value right as on the stock rows ([screenshot](media/personalize.png)). |
| LEFT and RIGHT step the values | link key presses | OFF → 25 → 50 → 75 → 100 and OFF → LOW → MID → HIGH; the row redraws at once. |
| Rows in plain SETTINGS (first build) | the same, from `ev_settings` | The value was drawn over the label; the rows moved to PERSONALIZE, where `core_addvalue` lays them out as designed. |
| The offsets reach the voices | VOICE SPREAD 100, FILTER SPREAD HIGH; the smoothed voice values (0x800068e4 + 0x22 + 202 × voice) and the frame records sent to the DSP (0x80005e60 + 0xda + 146 × voice) read over the link | Pan of voices 0–15: 0x0100, 0x7f00, 0x2080, 0x5f80, 0x10c0, 0x6f40, 0x3040, 0x4fc0, 0x08e0, 0x7720, 0x2860, 0x57a0, 0x18a0, 0x6760, 0x3820, 0x47e0 (centre 0x4000 plus the expected offsets, held in range). Filter frequency from 0x7f00 down to 0x6b00 on the voices with a downward offset, 0x7f00 on the others. The records sent to the DSP match the smoothed values. Read on the build before the label change (image `e705f01e…`), whose `spread.c` is the same. |
| The kit is untouched | the voice arrays the stock writer fills (0x80003b12 + 202 × voice) | Pan stays 0x4000 and the filter 0x7f00 there: the offset is only in the live copy. |
| Heard | chords on track 1 over USB MIDI: 100, then OFF, then 100 | Not yet reported. |

The `%` sign is not in the menu font (a first build showed a wrong glyph), so the values are plain numbers.

## The released package

`sdk/imports/packages/voice-spread/voice-spread-0.1.0-experimental-os1.12.elemod`, sha256 `9ce8ff19564deedd1531f60a3b4d2be3f898aab0a8e243db1d6aa20a3a17f0f5`, exported from the pinned Docker toolchain (`scripts/build-elemod-isolated.sh`, GCC 16.2.0, image `85394501…`) at commit `a78057606` (recipe sha256 `78d301ad…`, source tree `b163786f…`). Linked with the development base by Elekloader 0.11.0's patcher, it gives the same main OS, byte for byte (sha256 `493992eb8a335d40…`), as the locally compiled module the unit ran, so the unit results above hold for this package.

## Host test

`cc -std=c11 -Wall -Wextra -Werror src/spread.c tests/spread_test.c && ./a.out` prints `voice-spread: ok`. It checks that OFF adds nothing, that each level's offsets sum to zero, that neighbouring voices go to opposite sides, the 100 % and HIGH limits, that values are held in range at both ends, and that no other parameter changes.

## Not tested

- Saving the project with the module and loading it again after a power cycle (the setting's `core_projdata` block), and loading a project saved without it.
- A build with the plain base (no link) and the pinned toolchain image; flashing.
- Parameter locks and LFOs on pan and filter frequency together with the spread.
- CPU load on the unit: the work per frame is bounded (16 voices) and was read from the code, not measured.
- Running beside another Digitone II module: none exists yet.
