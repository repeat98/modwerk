# Compressor Preview — test report

- Module: `comp-preview` 1.1.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.4 and later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `e029f7540c2df2a5185620ca68b4c08579e120c6` (tag `v1.3`), `comp-preview`.
  `src/comp-preview.s` and `src/calib.inc` are byte-identical to `comp-preview/os1.74/comp-preview.s` and `comp-preview/calib.inc` there (unchanged in rytm2_mods since).
  Source fingerprint (`evidence.sourceSha256`): sha256 of the output of `sha256sum src/calib.inc src/comp-preview.s`, `a36fa34530ef0809810ceff82f117667849af2de944796ce5aab511018ad0cb7`.
- Original: MrScruff's rytm-mods `0006-comp-preview`.

## What has not been run

- **Modwerk's base:** this package has not been flashed on a unit with core-ar2 0.7, and no browser build from a stock OS file ran for it.
- **Emulator and screenshots:** no analog-emu capture of the preview page, so `media/` holds only the thumbnail.
- **Package and parity:** no source-only OS 1.74 package is committed yet, and no byte-parity run against rytm2_mods' release object.
- **Playback on Modwerk's base:** the module makes no sound, so the owner's listening check does not apply; its CPU cost on this base is unmeasured.

## Hardware: 1.1 on core-ar2 0.4 (author-reported)

On an Analog Rytm MKII with OS 1.74, 2026-10-21, Iced-Cream flashed the core-ar2 0.4 unit-test builds with the rytm2_mods ports, ran the steps by hand and restored stock 1.74. Copied from rytm2_mods' comp-preview/README.md; see [the hardware report](evidence/hardware-testing.json).

1. Q4A4 (full build): COMP and the preview cycle; the preview's FUNC keys work and it is kept on leaving the FX track.
2. Q4D4 (with duck): COMP, preview, DUCK cycle, and the preview's trace runs while DUCK ducks.
3. With cpu-probe in the build (Q4D4, and Q4F4 without duck), CPU read 100 % now and then and the trace stopped, coming back by itself. With the load guard (U4A4, U4D4, U4F4, U4M4): the preview is kept on the COMP view with and without duck; in the busiest case (DAC SUM, fx-sends' chorus and the preview) CPU still touches 100 %, the audio interrupt reads 92 % and peaks at 94 %, the trace stops now and then and comes back by itself, knobs and values keep responding, and nothing is audible. The guard rarely engages at these loads.

Also on the rytm2_mods side: rytm-emu, OS 1.74: without duck, FX then AMP through COMP and the preview, 9 screens pixel-identical to 1.0 on core 0.4; with duck: COMP, preview, DUCK, COMP, preview, DUCK, and DUCK's knobs turn.

## Hardware: 1.0 (the source before 1.1)

On an Analog Rytm MKII, 2026-10-14, in the full 1.0 build (core-ar2 with all eleven ports): works as described, and the SEQ knob's value goes back to its name after about 1 s. Against rytm-mods-src's default build the 1.0 stub equals its caves byte for byte, label by label.
