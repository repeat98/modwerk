# Velocity Humanise — test report

- Module: `velocity-humanise` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.4 and later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `e029f7540c2df2a5185620ca68b4c08579e120c6` (tag `v1.3`), `velocity-humanise`.
  `src/velocity-humanise.s` (`53949373…9916`, rytm2_mods' `velocity-humanise/os1.74/velocity-humanise.s`) and the shared files are byte-identical to it.
  1.2 changed only `src/velocity-humanise.s` and the sites: its parameter's turn and text are an entry in core-ar2's `core_params`
  instead of the two detours 1.1 made at the entries of param_apply_delta and param_value_text, which core-ar2 0.4 and later own.
- Original: MrScruff's rytm-mods `0003-velocity-humanise`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build P4A4 (OS 1.74, core-ar2 0.4's first version + all eleven rytm2_mods ports with this module at 1.2): `.syx`
  `1c0311697543789316c10dbbbfa78b9a717a180eb26611f2f0d1b732a428d65c`.
- Tested build U4A4 (OS 1.74, core-ar2 0.4's final version + the same eleven, the bytes of rytm2_mods v1.3): `.syx`
  `18681f8709242b9d3c5117335a81cd5659ea01c583e3e8477d536e379517b785`.
- Build VH12 (OS 1.74, the Modwerk base for core-ar2 0.7, plain variant `ba530f45`, + this folder's 1.2.0): `.syx`
  `854bfcf00d0ef3c5b11d03211d1eaf8107b30f3106e40c3f88e10e5b85a8b7b3`. Emulator only.
- 1.1's tested builds (C3A4, SXH4, VHH4, C3N4) are listed with their runs below.

## Hardware: 1.2

On an Analog Rytm MKII with OS 1.74, 2026-10-21, Iced-Cream flashed P4A4 as part of the
core-ar2 0.4 unit test (Part A, the rytm2_mods pages through `core_pages` and `core_params`),
ran the steps by hand and restored stock 1.74:

1. TRIG page, FUNC held, VEL turned: the label reads RND and the popup steps 0, 1, 2, 3, 4, 6,
   8, 10, 12, 16, 20, 24, 32, 40, 48, 64. FUNC released, VEL turned: the real velocity, as on stock.
2. Power-cycle without saving: the N set is kept.

Both passed. The same day U4A4, core-ar2 0.4's final version with the same eleven mods (the
bytes of rytm2_mods v1.3), passed the core's own page-key and audio-load steps; this
module's steps were not repeated on it. 1.1's measured velocity spread was not repeated on
1.2: it runs in code 1.2 did not change (the trig's velocity detour), but the build around it
did. See [the hardware report](evidence/hardware-testing.json).

## Hardware: 1.1 (the source before 1.2)

On an Analog Rytm MKII with OS 1.74, 2026-10-20, Iced-Cream flashed C3A4 (core-ar2 0.3
and all eleven v1.2 ports, including this module's release object `545cf2ec…e0d9`) and
C3N4 as part of the core-ar2 0.3 unit test, ran the module's test steps and restored
stock 1.74:

1. TRIG page, hold FUNC, turn VEL: the label reads RND, the popup 0..64.
2. N = 32, playing a track of equal-velocity trigs: the hits vary in level. N = 0: all equal.
3. Save, power-cycle, reload: N is kept.
4. Without euclid-accents in the build (C3N4): 1 to 3 the same, and euclid on/off unaffected by N.

Steps 1 to 3 passed on C3A4, and N was also kept through a power-cycle without SAVE
PROJECT (core 0.3 saves track fields on stock's per-part saves). Step 4 passed on C3N4.
Relinking C3A4's core and v1.2's eleven release objects on stock 1.74 gives C3A4's main OS
byte for byte. Duration was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: FUNC + VEL on the TRIG page reads RND. On CP with 16 equal-velocity trigs,
N 10 gave a bar-to-bar spread of 0.63 dB per step against 0.35 dB at N 0, the measurement
floor, as a velocity spread of about 10 should. The remote turn landed on N 10, so a larger N
was not measured. N set fully right was kept through a power cycle without SAVE PROJECT
(the dial position matched; that view shows no number).

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran VHH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
FUNC + VEL on the TRIG page read RND and N 64 was kept after release. On CP with equal-velocity
trigs, N 64 gave a bar-to-bar spread of 2.99 dB per step against 0.36 dB at N 0, the
measurement floor. Persistence was not repeated alone. No output froze or dropped out.

## Source build comparison

Built in Modwerk's pinned toolchain (`sdk/build/Dockerfile`, image `modwerk-source-tools`:
m68k-elf GCC 16.2.0, binutils 2.47) from a clean checkout of this branch:

```sh
bash scripts/build-elemod-isolated.sh CHECKOUT OUT IMAGE_ID
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/velocity-humanise/1.74.json sdk/imports/packages/velocity-humanise/velocity-humanise-1.2.0-os1.74.elemod
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

The committed package reproduces from that recipe (`package-elemod-recipe.mjs … --check`).
`ORACLE` held elekloader's released `core-ar2-0.7.elemod` (`f1e9cb2c…c9c1`, the core Modwerk's
base is built from) and rytm2_mods v1.3's release `velocity-humanise-1.2-os1.74.elemod` (`e711124d…0515`).
The materialised Modwerk package linked with that core gives main OS `da715900…f5f0`,
byte-identical to the core linked with the release object
([source-parity.json](evidence/source-parity.json)). `.run` is 816 bytes and 3 sites, plus one
`core_params` entry. The firmware and the linked builds stayed on the owner's computer.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (trigcondition's Rytm and A4
emulator built on rytm-emu; its history holds `c5732f0`, which took 1.1's captures, `951dcbc` and `e914f46`), headless `dtboot`, the same input on
VH12 and on stock 1.74 ([capture plan](media/capture.json)): BD's TRIG page, FUNC held while
VEL turns up. Frames are byte-identical until FUNC is held; from then on stock shows VEL and
the trig velocity, VH12 shows RND and N. The three captures are byte-identical to 1.1's on
VH74. Key presses are 12M, as [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md)
asks since rytm-emu `e914f46`. Playback and persistence were not exercised in the emulator;
the hardware runs cover them.

## Load and memory

816 bytes in the shared DDR area, no `.bss`, no fast SRAM, and four bits of track storage.
One detour runs on each trig: it reads N through `core_store_get`, which masks interrupts
briefly, then draws a random offset and clamps the velocity. FUNC + VEL's turn and text run
when the core asks its `core_params` entry, on UI edits and drawing. Static reading, not a
measurement.

## Not tested

- Beside Sample RATE: the two patch overlapping bytes of param_short_name and are flagged as a conflict.
- 1.2 on Modwerk's base (core-ar2 0.7) on a unit: the hardware runs used core-ar2 0.4.
- Other modules beside it, except rytm2_mods' own ports.
- Kit and pattern transfer over SysEx, and loading a project saved with this module into a build without it.
