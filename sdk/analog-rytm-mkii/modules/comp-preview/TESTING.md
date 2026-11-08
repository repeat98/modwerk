# Compressor Preview — test report

- Module: `comp-preview` 1.1.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.4 and later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `e029f7540c2df2a5185620ca68b4c08579e120c6` (tag `v1.3`), `comp-preview`.
  `src/comp-preview.s` and `src/calib.inc` are byte-identical to `comp-preview/os1.74/comp-preview.s` and `comp-preview/calib.inc` there (unchanged in rytm2_mods since).
  Source fingerprint (`evidence.sourceSha256`): sha256 of the output of `sha256sum src/calib.inc src/comp-preview.s`, `a36fa34530ef0809810ceff82f117667849af2de944796ce5aab511018ad0cb7`.
- Original: MrScruff's rytm-mods `0006-comp-preview`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Build CP11 (OS 1.74, the Modwerk base for core-ar2 0.7, plain variant `ba530f45`, + this folder's 1.1.0): `.syx`
  `55dafc3b527e1bb83c2f62b8a61c27cf9d1c6102a06bfee7ac796223dc94ec47`. Emulator only.
- 1.1's tested builds on core-ar2 0.4 (Q4A4, Q4D4, Q4F4, U4A4, U4D4, U4F4, U4M4) are listed with their runs below.

## What has not been run

- **Modwerk's base on a unit:** this package has not been flashed on a unit with core-ar2 0.7, and no browser build from a stock OS file ran for it.
- **Playback on Modwerk's base:** the module makes no sound, so the owner's listening check does not apply; its CPU cost on this base is unmeasured.
- **Low thresholds:** at THR 41 and below the emulator's full layout drew no trace (see Emulator). Not checked on a unit, and not followed into the source.

## Source build comparison

Built in Modwerk's pinned toolchain (`sdk/build/Dockerfile`, image `modwerk-source-tools`:
m68k-elf GCC 16.2.0, binutils 2.47) from a clean checkout of this branch:

```sh
bash scripts/build-elemod-isolated.sh CHECKOUT OUT IMAGE_ID
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/comp-preview/1.74.json sdk/imports/packages/comp-preview/comp-preview-1.1.0-os1.74.elemod
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's released `core-ar2-0.7.elemod` (`f1e9cb2c…c9c1`, the core Modwerk's
base is built from) and rytm2_mods v1.3's release `comp-preview-1.1-os1.74.elemod` (`0af33e7c…79d6`).
The materialised Modwerk package linked with that core gives main OS `cf6463cb…66ef`,
byte-identical to the core linked with the release object
([source-parity.json](evidence/source-parity.json)). `.run` is 3912 bytes and 3 sites, plus one
`core_view_pages` entry. The firmware and the linked builds stayed on the owner's computer.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (trigcondition's Rytm and A4
emulator built on rytm-emu; its history holds `c5732f0`, `951dcbc` and `e914f46`), headless `dtboot`, the same input on
CP11 and on stock 1.74 ([capture plan](media/capture.json)): FX track, AMP, THR down to 64, AMP again,
ten BD hits, FUNC + AMP, ten BD hits more. Frames are byte-identical up to the compressor page; on
the second AMP press CP11 shows the preview, where stock stays on the compressor page. In the
preview each BD hit pulls the gain-reduction trace down and it recovers; FUNC + AMP switches to gain
reduction alone. Key presses are 12M, as [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md)
asks since rytm-emu `e914f46`.

The same plan with THR at other values: at 52 the trace runs as at 64. At 41 the full layout drew
no trace and no level for any of ten hits, while the second layout showed the line near the bottom,
dipping at each hit: between hits the estimate holds a reduction past the full layout's range. At 24
neither layout drew it. The emulator's voices are not a unit's, so whether a unit shows the same at
low thresholds is open. FUNC + LEFT/RIGHT were pressed only at THR 24, where nothing was drawn,
and FUNC + UP/DOWN not at all, so neither was judged in the emulator; the hardware runs cover the keys.

## Load and memory

3912 bytes in the shared DDR area (`.run`, the same size as rytm2_mods' release object), no fast
SRAM, no mod storage. The estimate runs on each audio block; the author measured 4 to 5 points of
CPU on a unit with core-ar2 0.4. Not measured on Modwerk's base.

## Hardware: 1.1 on core-ar2 0.4 (author-reported)

On an Analog Rytm MKII with OS 1.74, 2026-10-21, Iced-Cream flashed the core-ar2 0.4 unit-test builds with the rytm2_mods ports, ran the steps by hand and restored stock 1.74. Copied from rytm2_mods' comp-preview/README.md; see [the hardware report](evidence/hardware-testing.json).

1. Q4A4 (full build): COMP and the preview cycle; the preview's FUNC keys work and it is kept on leaving the FX track.
2. Q4D4 (with duck): COMP, preview, DUCK cycle, and the preview's trace runs while DUCK ducks.
3. With cpu-probe in the build (Q4D4, and Q4F4 without duck), CPU read 100 % now and then and the trace stopped, coming back by itself. With the load guard (U4A4, U4D4, U4F4, U4M4): the preview is kept on the COMP view with and without duck; in the busiest case (DAC SUM, fx-sends' chorus and the preview) CPU still touches 100 %, the audio interrupt reads 92 % and peaks at 94 %, the trace stops now and then and comes back by itself, knobs and values keep responding, and nothing is audible. The guard rarely engages at these loads.

Also on the rytm2_mods side: rytm-emu, OS 1.74: without duck, FX then AMP through COMP and the preview, 9 screens pixel-identical to 1.0 on core 0.4; with duck: COMP, preview, DUCK, COMP, preview, DUCK, and DUCK's knobs turn.

## Hardware: 1.0 (the source before 1.1)

On an Analog Rytm MKII, 2026-10-14, in the full 1.0 build (core-ar2 with all eleven ports): works as described, and the SEQ knob's value goes back to its name after about 1 s. Against rytm-mods-src's default build the 1.0 stub equals its caves byte for byte, label by label.
