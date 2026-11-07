# Euclid Accents — test report

- Module: `euclid-accents` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.4 and later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `e029f7540c2df2a5185620ca68b4c08579e120c6` (tag `v1.3`), `euclid-accents`.
  `src/euclid-accents.s` (`22e279b1…424c`, rytm2_mods' `euclid-accents/os1.74/euclid-accents.s`) and the shared files are byte-identical to it.
  1.2 changed only `src/euclid-accents.s` and the sites: its parameter's turn and text are an entry in core-ar2's `core_params`
  instead of the two detours 1.1 made at the entries of param_apply_delta and param_value_text, which core-ar2 0.4 and later own.
- Original: MrScruff's rytm-mods `0002-euclid-accents`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build P4A4 (OS 1.74, core-ar2 0.4's first version + all eleven rytm2_mods ports with this module at 1.2): `.syx`
  `1c0311697543789316c10dbbbfa78b9a717a180eb26611f2f0d1b732a428d65c`.
- Tested build U4A4 (OS 1.74, core-ar2 0.4's final version + the same eleven, the bytes of rytm2_mods v1.3): `.syx`
  `18681f8709242b9d3c5117335a81cd5659ea01c583e3e8477d536e379517b785`.
- Build EA12 (OS 1.74, the Modwerk base for core-ar2 0.7, plain variant `ba530f45`, + this folder's 1.2.0): `.syx`
  `c18fca9b6f1889adffe901f848ede19230781af17d279c94e292bba64feb41e3`. Emulator only.
- 1.1's tested builds (C3A4, SXH4, EAH4) are listed with their runs below.

## Hardware: 1.2

On an Analog Rytm MKII with OS 1.74, 2026-10-21, Iced-Cream flashed P4A4 as part of the
core-ar2 0.4 unit test (Part A, the rytm2_mods pages through `core_pages` and `core_params`),
ran the steps by hand and restored stock 1.74:

1. TRIG twice for EUCLIDEAN, OP turned right and then back: OR, XOR, AND, SUB, OR\*, XOR\*,
   AND\*, SUB\*, with the right glyph and label for each, and the same order going back.
2. Power-cycle without saving: the OP value set is kept.

Both passed. The same day U4A4, core-ar2 0.4's final version with the same eleven mods (the
bytes of rytm2_mods v1.3), passed the core's own page-key and audio-load steps; this
module's steps were not repeated on it. 1.1's playback, accent level and bake checks were not
repeated on 1.2: they run in code 1.2 did not change (trig_fire, the euclid bake), but the
build around it did. See [the hardware report](evidence/hardware-testing.json).

## Hardware: 1.1 (the source before 1.2)

On an Analog Rytm MKII with OS 1.74, 2026-10-20, Iced-Cream flashed C3A4 (core-ar2 0.3
and all eleven v1.2 ports, including this module's release object `ddba6f8a…fd73`) as
part of the core-ar2 0.3 unit test, ran the module's test steps and restored stock 1.74:

1. TRIG, TRIG again for EUCLIDEAN, EUC on, OP turned fully right: OR\*, XOR\*, AND\*, SUB\*.
2. With OR\* and a few grid trigs, playing: only grid trigs play; those on euclid hits are accented.
3. FUNC + EUC off: the accents are written into the pattern. Save, power-cycle, reload: OP keeps its accent value.
4. With an accent operator EUC stays on and the track plays only its grid trigs. OP back to a
   plain operator: euclid generates the trigs again.

All four passed, and OP also kept its accent value through a power-cycle without SAVE
PROJECT (core 0.3 saves track fields on stock's per-part saves). Relinking C3A4's core and
v1.2's eleven release objects on stock 1.74 gives C3A4's main OS byte for byte. Duration
was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: OP turned past SUB to the accent values (SUB\* with its mark). With BD grid
trigs on steps 1, 2, 4, 5, 7 and 10 and PL1 6 (hits on 1, 4, 7, 9, 12, 15), at XOR\* and at
SUB\* only the six grid trigs played, and those on hits (1, 4, 7) peaked 2.1 to 2.4 dB above
the others, measured on BD's output and checked in the pattern's memory. After a power cycle
without SAVE PROJECT, OP still showed SUB\*. The bake (FUNC + EUC off) was not repeated.

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran EAH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
OP reached SUB\*, AND\* and XOR\*. At XOR\* and at SUB\* only the grid trigs played (the
euclid-only steps held just the previous hit's decay), and grid trigs on euclid hits peaked
2.0 to 2.3 dB above the others, measured on BD's output. Persistence and the bake were not
repeated alone. No output froze or dropped out.

## Source build comparison

Built in Modwerk's pinned toolchain (`sdk/build/Dockerfile`, image `modwerk-source-tools`:
m68k-elf GCC 16.2.0, binutils 2.47) from a clean checkout of this branch:

```sh
bash scripts/build-elemod-isolated.sh CHECKOUT OUT IMAGE_ID
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/euclid-accents/1.74.json sdk/imports/packages/euclid-accents/euclid-accents-1.2.0-os1.74.elemod
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

The committed package reproduces from that recipe (`package-elemod-recipe.mjs … --check`).
`ORACLE` held elekloader's released `core-ar2-0.7.elemod` (`f1e9cb2c…c9c1`, the core Modwerk's
base is built from) and rytm2_mods v1.3's release `euclid-accents-1.2-os1.74.elemod` (`8d07137f…b7d6`).
The materialised Modwerk package linked with that core gives main OS `c7a0a887…5d5e`,
byte-identical to the core linked with the release object
([source-parity.json](evidence/source-parity.json)). `.run` is 1,424 bytes and 11 sites, plus one
`core_params` entry. The firmware and the linked builds stayed on the owner's computer.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (rytm-emu's successor; its
history contains `c5732f0`, which took 1.1's captures), headless `dtboot`, the same input on
EA12 and on stock 1.74 ([capture plan](media/capture.json)): BD's EUCLIDEAN page, EUC and PL1
stepped, then thirty-two value steps on OP. The EUCLIDEAN page frame is byte-identical on both
builds (and to 1.1's capture). Stock stops at SUB; EA12 goes on to OR\*, XOR\*, AND\* and SUB\*.
Key presses are 12M, as [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md) asks
since rytm-emu `e914f46`. Playback, the bake and persistence were not exercised in the
emulator; the hardware runs cover them.

## Load and memory

1,424 bytes in the shared DDR area, no `.bss`, no fast SRAM, and one bit of track storage.
Two detours run on each trig in the sequencer's trig fire; on an accent track the accent
arm reads the flag through `core_store_get`, which masks interrupts briefly. OP's turn and
text run when the core asks its `core_params` entry, on UI edits and drawing. Static reading,
not a measurement.

## Not tested

- 1.2 on Modwerk's base (core-ar2 0.7) on a unit: the hardware runs used core-ar2 0.4.
- Other modules beside it, except rytm2_mods' own ports.
- Kit and pattern transfer over SysEx, and loading a project saved with this module into a build without it.
