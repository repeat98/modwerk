# Voice DAC — test report

- Module: `voice-dac` 1.4.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.6 or later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `01254ab5f69f7083a70746b18de715d52335e499` (tag `v1.4`), `voice-dac`.
  `src/voice-dac.s` is rytm2_mods' `voice-dac/os1.74/voice-dac.s`; `include/ar2-1.74.inc` and `shared/shared.s` are its `include/` and `shared/` files, unchanged.
- Original: MrScruff's rytm-mods `0013-voice-dac`, at rytm-mods-src 3a98e23.

## Run for this submission (emulator and offline, Modwerk's base)

Nothing was run on a unit on Modwerk's base (core-ar2 0.7). All results below are from the emulator or offline tools, on 2026-11-08.

- **Build.** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `6f8066eb…`, m68k-elf GCC 16.2.0, binutils 2.47) compiled this folder; `package-elemod-recipe.mjs` wrote `voice-dac-1.4.0-os1.74.elemod` (`.run` 11,080 bytes, no `.bss`), and `--check` reproduces it. Its hash and source commit are in `sdk/imports/voice-dac-2026-11-08.json`.
- **Link.** `scripts/link-image.mjs` on the owner's stock OS 1.74 (`cb0f99d6…e123`) links it with the vendored Modwerk base for core-ar2 0.7 (plain variant `ba530f45`): `ramSpare` drops from 119,004 bytes (base alone) to 107,896, `fastSpare` stays 0, flash headroom 1,195,984 bytes. The image, VD14, is `1ed68998…432e`.
- **Source parity.** Linked with elekloader's released core-ar2 0.7 (`f1e9cb2c…c9`) on the same stock file, the package gives a main OS byte-identical to rytm2_mods v1.4's release object `voice-dac-1.4-os1.74.elemod` (`9649ce2a…960c`) linked with that core ([evidence/source-parity.json](evidence/source-parity.json)).
- **Emulator, analog-emu `4c07ed3` (dtboot, headless), VD14** ([media/capture.json](media/capture.json) has the full input plan):
  - GLOBAL > AUDIO ROUTING ends with a DAC SUM row reading OFF; RIGHT sets it ON. On stock 1.74 the same input shows a list ending at USB TO MAIN.
  - With DAC SUM on, TRIG and then FLTR twice on BD opens DAC FILTER with TYP OFF: DEP, ATK, SUS and POL shown, FRQ and RES empty. On stock the second FLTR press stays on the FILTER page.
  - Turning knob C (TYP) up: LP2 shows FRQ and RES; LP1 shows FRQ and leaves RES empty.
  - Every frame before AUDIO ROUTING opens is byte-identical to stock's with the same input.
- **Not tested on Modwerk's base:** anything on a unit; the sound (the emulator's analog voices are stubbed); FRQ, RES, DEP, ATK, SUS and POL moving the audio; values kept through kit save, reload or a power cycle; TYP values past LP1; beside other modules that use sound bits (rytm2_mods' LFO RND takes 16 of core's 56 sound bits; this module takes 39).
- **Offline:** the patch sites in `build.json` are the 27 of rytm2_mods' `ports["1.74"]`, as address, length and SHA-256 of the stock bytes; the link above checks those guards against the owner's stock file.

## Reported by the author on core-ar2 0.6

These are the porting contributor's results as written in rytm2_mods' README for 1.4 (see [upstream/README.md](upstream/README.md), "Results so far"), not repeated on Modwerk's base. The unit build's hash is in [evidence/hardware-testing.json](evidence/hardware-testing.json); its voice-dac source equals v1.4's, but its object was not compared with the v1.4 release object.

- rytm-emu, OS 1.74, core-ar2 0.6 with all eleven rytm2_mods (V6A4) against the same with voice-dac 1.3: a 59-screen walk was pixel-identical except DAC FILTER with TYP OFF, LP1 and HP1, where FRQ and RES, or RES, are empty as intended; the empty knobs do nothing; the page follows a switch from BD (LP1) to SD (OFF) and back.
- Hardware, Analog Rytm MKII, OS 1.74, 2026-10-23, V6H4 (V6A4 plus the analoghealth test mod for remote keys, `.syx` `4a896e59…f697`): every test step passed. DAC FILTER through every TYP, the empty knobs inert, the page following TRK + SD and back, RES kept across LP2, LP1 and LP2, and BD's DAC FILTER back as saved after SAVE KIT, a power cycle and RELOAD. BD on LP2, LP1 and OFF: no dropouts, nothing audible. Not compared with a v1.3 recording.
- Earlier versions: values kept through kit save and reload, a power cycle without a kit save, the +Drive sound library and a kit sent by SysEx and Overbridge (1.2, 2026-10-20); the shaper, 2-pole filters and polarity on hardware (1.0 era, 2026-10-06/07).

## Sound

Voice DAC changes the sound. It stays a draft until the owner has listened to it.
