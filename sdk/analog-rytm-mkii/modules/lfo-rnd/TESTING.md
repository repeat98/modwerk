# LFO RND — test report

- Module: `lfo-rnd` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.4 and later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `e029f7540c2df2a5185620ca68b4c08579e120c6` (tag `v1.3`), `lfo-rnd`.
  `src/lfo-rnd.s` (`9363d09a…f648`, rytm2_mods' `lfo-rnd/os1.74/lfo-rnd.s`), `include/ar2-1.74.inc` (`c57431f7…874b`)
  and `shared/shared.s` (`8cc89465…62d6`) are byte-identical to it.
  1.2 changed `src/lfo-rnd.s` and the sites only: the page, its four knobs and the LFO key's second press are entries in
  core-ar2's `core_pages`, `core_params` and `core_view_pages` instead of 1.1's detours at the entries of page_info,
  page_get_value, param_apply_delta and param_value_text and its own list for the LFO view, which core-ar2 0.4 and later own.
- Original: MrScruff's rytm-mods `0004-lfo-rnd`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build P4A4 (OS 1.74, core-ar2 0.4's first version + all eleven rytm2_mods ports, lfo-rnd 1.2 from rytm2_mods `7ff47d7`): `.syx`
  `1c0311697543789316c10dbbbfa78b9a717a180eb26611f2f0d1b732a428d65c`.
- Tested build Q4A4 (core-ar2 0.4's second version + the same eleven, lfo-rnd's page-key list through `core_view_pages`, rytm2_mods `d20f352`): `.syx` `aeeefc50…`.
- Tested build U4A4 (OS 1.74, core-ar2 0.4's final version + the same eleven, the bytes of rytm2_mods v1.3, this folder's source): `.syx`
  `18681f8709242b9d3c5117335a81cd5659ea01c583e3e8477d536e379517b785`.

## Hardware: 1.2 on core-ar2 0.4

On an Analog Rytm MKII with OS 1.74, 2026-10-21, Iced-Cream flashed P4A4, Q4A4 and U4A4 as part of the
core-ar2 0.4 unit test (runs T22, T23 and T25), ran the steps by hand and restored stock 1.74 after each.

P4A4 (Part A, the rytm2_mods pages through `core_pages` and `core_params`), the module's test steps:

1. LFO page, press LFO again: LFO RND with DS1, DS2, DP1, DP2.
2. Turn DS1: the destination list opens; pick FRQ, YES. DP1 to 32.
3. Play trigs on that track: the cutoff varies note to note. DP1 = 0: no change.
4. Save the kit, power-cycle, reload: the four settings are kept.
5. Power-cycle without saving the kit: the four settings are kept.
6. A kit saved with lfo-rnd 1.0: its settings show and play; change one, power-cycle, the change is kept and the rest are as they were.

Every step passed. Q4A4 moved the LFO key's second press into `core_view_pages`; the page keys passed beside the
other mods. U4A4 holds this folder's source: core's page step and title passed, LFO stepping LFO, LFO RND, LFO with
the header following; the six steps above were not repeated on it. Duration was not recorded. See
[the hardware report](evidence/hardware-testing.json).

On 2026-11-05 (run T133) the same unit ran V14H, core-ar2 0.10 with all eleven rytm2_mods ports, this module's
rytm2_mods v1.3 release object (`3cd13805…6a08`) among them, plus analoghealth for remote keys, as a load baseline:
the whole set idled at CPU 80.0 % (DSP 74.8 %) and reached 96 % (DSP 88.6 %) with notes on eight voice tracks.
This module's share was not separated.

## Hardware: earlier versions

- 1.1 (core-ar2 0.3 storage), 2026-10-20, C3A4 with all eleven v1.2 ports: steps 1 to 6 passed, with LFO RND kept
  through kit save and reload, a power cycle without a kit save, the +Drive sound library, and a kit sent and received
  by SysEx and by Overbridge.
- 1.0, 2026-10-14, R2T3 (core-ar2 0.1 with all eleven ports, run T9): the page, the sixteen-entry destination list,
  random offsets per note on two destinations, the list following the knob turned, no page on the FX track, and the
  settings kept through save, power cycle and reload.

## Source build comparison

Built from this folder with Modwerk's elemod builder and exported without firmware:

```sh
node scripts/build-elemod-packages.mjs --output OUT --source-commit SHA --module analog-rytm-mkii:lfo-rnd
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/lfo-rnd/1.74.json sdk/imports/packages/lfo-rnd/lfo-rnd-1.2.0-os1.74.elemod
```

The cross assembler was GNU binutils 2.42 (`m68k-linux-gnu`, the source is assembly only), which reproduces the
committed Velocity Humanise 1.2.0 package byte for byte from the same commands; CI rebuilds this one in the pinned
`modwerk-source-tools` image (binutils 2.47) and requires it to match.

Compared with rytm2_mods v1.3's release object `lfo-rnd-1.2-os1.74.elemod` (`3cd13805…6a08`), the package has
identical sites (31, with the same stock guards and new bytes), relocations (9), symbols, exports, imports, storage
and `core_pages`, `core_params` and `core_view_pages` entries. `.run` is 1,664 bytes in both: every byte the release
object ships matches, and its 278 other bytes are runs elekloader's packager takes from the stock image at link time,
which this package carries as authored code. A linked-image comparison against stock OS 1.74 has not been run yet.

## Emulator

Not run yet for this package.

## Load and memory

1,664 bytes in the shared DDR area (`.run`), no `.bss`, no fast SRAM, and 16 bits of sound storage.
The sequencer interrupt's detour reads the sound's field through `core_store_get`, which masks interrupts briefly,
once per voice trig. The audio interrupt's detour draws at most two offsets per voice track when a note starts and
adds the held offsets to their destinations every block. The page, knobs and lists run on UI edits and drawing.
Static reading, not a measurement.

## Not tested

- This package on Modwerk's base (core-ar2 0.7), on a unit or in the emulator.
- Beside Loop Sync, whose audio-interrupt site is next to this module's.
- Beside library modules other than rytm2_mods' own ports.
- Loading a kit saved with this module into a build without it.
