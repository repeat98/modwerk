# Voice DAC — test report

- Module: `voice-dac` 1.4.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.6 or later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `01254ab5f69f7083a70746b18de715d52335e499` (tag `v1.4`), `voice-dac`.
  `src/voice-dac.s` is rytm2_mods' `voice-dac/os1.74/voice-dac.s`; `include/ar2-1.74.inc` and `shared/shared.s` are its `include/` and `shared/` files, unchanged.
- Original: MrScruff's rytm-mods `0013-voice-dac`, at rytm-mods-src 3a98e23.

## Run for this submission

Nothing was run on a unit or in the emulator on Modwerk's base (core-ar2 0.7). Not tested:

- a build of this folder against core-ar2 0.7 and stock OS 1.74, and its source parity with rytm2_mods v1.4's release object;
- DAC SUM, DAC FILTER, the page following TYP, and keeping the values, on Modwerk's base;
- beside other modules that use sound bits (rytm2_mods' LFO RND takes 16 of core 0.3's 56 sound bits; this module takes 39);
- emulator captures of the page.

Done offline: `src/voice-dac.s` assembles with GNU as 2.42 (`-mcpu=5475`, `include/` and `shared/` in place) to 11,078 bytes, the memory figure in the manifest. The patch sites in `build.json` are the 27 of rytm2_mods' `ports["1.74"]`, as address, length and SHA-256 of the stock bytes; the SHA-256s come from rytm2_mods' own `mod.json` and were not compared with a stock file.

## Reported by the author on core-ar2 0.6

These are the porting contributor's results as written in rytm2_mods' README for 1.4 (see [upstream/README.md](upstream/README.md), "Results so far"), not repeated on Modwerk's base. The build hashes are not recorded here.

- rytm-emu, OS 1.74, core-ar2 0.6 with all eleven rytm2_mods (V6A4) against the same with voice-dac 1.3: a 59-screen walk was pixel-identical except DAC FILTER with TYP OFF, LP1 and HP1, where FRQ and RES, or RES, are empty as intended; the empty knobs do nothing; the page follows a switch from BD (LP1) to SD (OFF) and back.
- Hardware, Analog Rytm MKII, OS 1.74, 2026-10-23, V6A4 plus the analoghealth test mod for remote keys: every test step passed. DAC FILTER through every TYP, the empty knobs inert, the page following TRK + SD and back, RES kept across LP2, LP1 and LP2, and BD's DAC FILTER back as saved after SAVE KIT, a power cycle and RELOAD. BD on LP2, LP1 and OFF: no dropouts, nothing audible. Not compared with a v1.3 recording.
- Earlier versions: values kept through kit save and reload, a power cycle without a kit save, the +Drive sound library and a kit sent by SysEx and Overbridge (1.2, 2026-10-20); the shaper, 2-pole filters and polarity on hardware (1.0 era, 2026-10-06/07).

## Sound

Voice DAC changes the sound. It stays a draft until the owner has listened to it.
