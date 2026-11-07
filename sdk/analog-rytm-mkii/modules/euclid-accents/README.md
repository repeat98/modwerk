# Euclid Accents

## Overview

Euclid Accents gives the euclidean page's Bool Operator (OP) eight values instead of
four: OR, XOR, AND and SUB as stock, then OR\*, XOR\*, AND\* and SUB\*.

- In accent mode the euclidean generator no longer decides which steps play. Only the
  grid's trigs play, and a trig on a step where the euclidean pattern has a hit plays
  accented. Hand-set accents stay.
- Turning euclid off with FUNC held bakes the accents into the pattern; without FUNC the
  pattern is left as it was.
- The accent flag is per pattern track. It is kept in core-ar2's mod storage and saved
  with the pattern, so stock's own euclid bytes keep their stock values.

Version **1.2.0** for Analog Rytm MKII OS **1.74**, with core-ar2 0.4 or later (Modwerk's
base is core-ar2 0.7). It is
[rytm2_mods](https://github.com/Iced-Cream/rytm2_mods)' elemod port of MrScruff's
`0002-euclid-accents` from [rytm-mods-src](https://github.com/Iced-Cream/rytm-mods-src).
His code is unchanged, except that the accent flag moved from spare bits of stock's
euclid-enable byte into core storage, which removed four of his sites, and that from 1.2
OP's turn and text are reached through core-ar2's parameter table, `core_params`, instead
of two detours of his own at the entries of param_apply_delta and param_value_text, which
core-ar2 0.4 and later own. Hardware testing is
recorded in the [hardware report](evidence/hardware-testing.json) and
[TESTING.md](TESTING.md).

## Controls

| Control | Action |
| --- | --- |
| OP (Bool Operator) | Eight values: OR, XOR, AND, SUB as stock, then OR\*, XOR\*, AND\*, SUB\*, which accent the grid's trigs on euclid hits instead of adding or removing steps. |
| FUNC + EUC off | In accent mode, bakes the accents into the pattern; EUC off without FUNC reverts. |

There are no other new controls, menus or settings. To get stock behaviour back, set OP
to a plain operator, or build without the module.

## Usage

EUCLIDEAN page (TRIG pressed twice): the OP (Bool Operator) parameter.

### Quick tutorial

1. Use a build containing Euclid Accents. Press TRIG twice for the EUCLIDEAN page, turn EUC on, and turn OP fully right: OR*, XOR*, AND*, SUB*.
2. Choose OR*, place a few trigs on the grid and play: only grid trigs play, and those on euclid hits are accented.
3. Hold FUNC and turn EUC off to write the accents into the pattern; turn it off without FUNC to leave the pattern as it was.

## Compatibility and limitations

Requires core-ar2 0.4 or later on OS 1.74. Use your own original stock OS 1.74 file.

- Built for OS 1.74 only.
- Needs core-ar2's parameter table (`core_params`, core-ar2 0.4 and later) for OP's turn and text. 1.1.0 patched param_apply_delta and param_value_text itself and does not link with core-ar2 0.4 or later.
- Needs core-ar2's mod storage: one bit per pattern track (`euclid_accent`).
- On stock firmware, or a build without this module, an accent track plays as its base operator: the flag is in mod storage, which stock ignores.

### Mod storage

| Field | Scope | Bits |
| --- | --- | --- |
| `euclid_accent` | track (per pattern track) | 1 |

The linker places the field from the build's lockfile, so a later build keeps it where it
was and projects keep their accent flags. Removing the module leaves the bit in the
project, unread.

### Sites

The module patches eleven sites, the original mod's own for these functions. Another
module patching the same bytes cannot be combined with it. OP's turn over 0 to 7 and its
names OR\* .. SUB\* are an entry in core-ar2's `core_params` (`euclid_accents_params`,
parameter 467), which the core asks from param_apply_delta's and param_value_text's entries.

| Address | Bytes | Op | Where |
| --- | --- | --- | --- |
| `0x4009ab36` | 8 | jmp `euclid_accents_trig_fire_euclid_gate` | trig_fire: an accent track takes the grid path |
| `0x4009abde` | 6 | jmp `euclid_accents_trig_fire_accent` | trig_fire: accent on euclid hits |
| `0x400c3c7a` | 8 | jmp `euclid_accents_euclid_bake_gate` | euclid bake: FUNC + EUC off |
| `0x400a88b8` | 6 | jsr `euclid_accents_boolop_get_ui` | OP's getter |
| `0x400a9d16` | 6 | jsr `euclid_accents_boolop_set_ui` | OP's setter |
| `0x400ff44c`, `0x400ff4e2` | 2 each | bytes `7207` | the Bool Operator text formatter's limit, 3 to 7 |
| `0x400ff456`, `0x400ff4fe` | 2 each | bytes `7007` | the same formatter's limit, 3 to 7 |
| `0x400ff460` | 6 | lea `euclid_accents_boolop_labels`, `%a1` | the formatter's label table, eight entries |
| `0x401432f0` | 6 | jsr `euclid_accents_bitmapset8` | OP's icon set: eight icons, the accent four with a dot |

## Tests and measurements

See [TESTING.md](TESTING.md) for the commands and results. In short: on an Analog Rytm MKII with OS 1.74 on Modwerk's base (MW12, 2026-11-07), accent +2.3 dB on euclid hits, kept across a power cycle. Before that, on OS 1.74 with core-ar2 0.4 and the other rytm2_mods ports (P4A4, 2026-10-21): OP steps through its eight values both ways and keeps an accent value through a power-cycle without a project save. Modwerk's package linked with core-ar2 0.7 gives a main OS byte-identical to the rytm2_mods v1.3 release object linked with it. In the emulator on the Modwerk base (EA12), OP turns past SUB to OR\*, XOR\*, AND\* and SUB\*, where stock stops at SUB. Memory: 1,424 bytes of the 128 KiB shared mod area.

## Authorship and licences

MrScruff: the original mod (rytm-mods `0002-euclid-accents`), its design and code,
published in rytm-mods-src with his permission. Iced-Cream: the elemod port in
rytm2_mods, including the move to core storage, and this module. irpina: Elekloader and
core-ar2, whose storage keeps the flag.

Code: [GPL-2.0-only](LICENSE), as rytm-mods-src. `src/euclid-accents.s` (rytm2_mods'
`euclid-accents/os1.74/euclid-accents.s`), `include/ar2-1.74.inc` and
`shared/live-track.s` are rytm2_mods' files at `e029f75` (v1.3), unchanged; they name
firmware routines and RAM by address only. The upstream README is in
[upstream/README.md](upstream/README.md). Screens show Elektron's interface solely to
document the modification. No Elektron firmware is included.

## Screens and audio

These captures are from analog-emu (trigcondition's emulator built on rytm-emu) running EA12, the Modwerk base for core-ar2 0.7 and Euclid Accents 1.2.0, from
stock OS 1.74. See [capture provenance](media/capture.json) for hashes and inputs. The
accents were judged on a unit, so there is no audio demonstration.

![EUCLIDEAN page with PL1, PL2, LEN and EUC above RO1, RO2, TRO and OP.](media/euclidean-page.png)

Press TRIG twice on track BD: the EUCLIDEAN page. OP, the Bool Operator, is knob H, bottom right.

![BOOL OPERATOR popup over the EUCLIDEAN page with OP reading OR* under an OR gate icon marked with a dot.](media/op-or-accent.png)

Turn OP right past SUB, where stock stops: OR\*, the first accent operator.

![BOOL OPERATOR popup over the EUCLIDEAN page with OP reading AND* under an AND gate icon marked with a dot.](media/op-and-accent.png)

Further right: AND\*. XOR\* and SUB\* complete the four accent values.
