# Voice DAC — test report

- Module: `voice-dac` 1.4.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.6 or later; Modwerk's base is core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm2_mods at `01254ab5f69f7083a70746b18de715d52335e499` (tag `v1.4`), `voice-dac`.
  `src/voice-dac.s` is rytm2_mods' `voice-dac/os1.74/voice-dac.s`; `include/ar2-1.74.inc` and `shared/shared.s` are its `include/` and `shared/` files, unchanged.
- Original: MrScruff's rytm-mods `0013-voice-dac`, at rytm-mods-src 3a98e23.

## Unit run beside LFO RND, with measurements (hardware, 2026-11-09)

Analog Rytm MKII, OS 1.74, build VL4H (`a019341d…ecc2`) = stock 1.74 + the Modwerk base for core-ar2 0.7 (plain variant `ba530f45`) + analoghealth 1.3 (remote keys, the test harness) + this package (`f6b2b459…edb6`) + LFO RND 1.2.0 (the package in repeat98/modwerk#1344), linked by `scripts/link-image.mjs`. The two modules take 55 of core's 56 sound bits (LFO RND 16, Voice DAC 39). Four elkbench plans, each passed first in the emulator, then run on the unit; stock 1.74 flashed back at the end.

- **Flash on and off:** VL4H over stock and stock back over VL4H both completed.
- **DAC SUM and DAC FILTER:** as in the run below: FILTER pressed twice stays on stock's page with DAC SUM off and opens DAC FILTER with it on.
- **All eight TYPs:** on BD and on SD, the knobs and the TYP symbol follow OFF, LP2, LP1, BP, HP1, HP2, BS and PK (checked on screen).
- **Page follows the track:** switching between BD and SD shows each track's own DAC FILTER values.
- **Kept:** BD (LP2, FRQ 0, RES max, DEP 0, ATK -64, SUS +63, POL -), SD (BS, FRQ 0, RES max, DEP 0, ATK +63, SUS -64, POL -) and CP's LFO RND setting come back after SAVE KIT and KIT RELOAD, and again after a hand power cycle with no save. DAC SUM was then set OFF and read back.
- **Load:** CPU 75.2 / 75.4 % before any key; 92.8 / 92.9 % (DSP 86.0 / 86.3 %) while playing with four voices on DAC FILTER beside LFO RND, read 30 s apart; free heap flat.
- **Measured takes:** BD alone on all 16 steps of A01, ten 8 s recordings of MAIN (USB channels 1-2), one control changed per pair. Pass marks were set before the run.
  - **Dropouts:** none in all ten takes (gap and dip checks). Click detection was off, because on a kick every 16th step each new hit reads as a click.
  - **ATK** (-64 against +63): the attack peak rises +4.3 dB (mark +3 dB). Pass.
  - **POL** (- against +): the mean hits correlate at -1.000, so the sign flips (mark -0.8 or lower). Pass.
  - **RES** (0 against max, LP2 at FRQ about 38): +11.4 dB at 80-101 Hz (mark +3 dB). Pass.
  - **SUS** (-64 against +63): the tail 60-120 ms after each hit rises +2.9 dB, under the +3 dB mark. On 16ths that window ends just before the next hit. An earlier attempt the same day with BD on quarter notes measured +9.5 dB for the same pair (and ATK +5.5 dB) before it stopped on a test-tool false alarm.
  - **DEP** (0 against FULL, LP2 at FRQ 0): the spectral-centroid mark (+6 semitones) was not met; it measured -13.7. The DEP FULL take is about 25 dB quieter in RMS (-53.2 against -28.2 dBFS), so the filter removed the kick's body. What is left is mostly the attack and noise, which the centroid reads as brighter, so this measure does not fit the pair. The owner heard DEP work as expected.
- **Listening (by the owner):** BD alone through DAC FILTER on LP2, turning RES, DEP, ATK, SUS and POL by hand. The owner's words: "I heard clicks on polarity changes" and "finished, otherwise was as expected".
- **POL click:** POL is applied as an instant sign change of the voice's gain in the audio interrupt, with no ramp, so changing POL while the voice sounds clicks. Listed under the README's limitations.
- **Not checked on the unit:** TYP's effect on the sound past LP2 (BP, HP1, HP2, BS, PK were checked on screen only); SysEx, +Drive and Overbridge transfers of the settings.

## Unit run on Modwerk's base (hardware, 2026-11-08)

Analog Rytm MKII, OS 1.74, build VD4H (`d2b7c794…503a`) = stock 1.74 + the Modwerk base for core-ar2 0.7 (plain variant `ba530f45`) + analoghealth 1.3 (remote keys, the test harness) + this package (`f6b2b459…edb6`), linked by `scripts/link-image.mjs`. Four elkbench plans, each passed first in the emulator (flash transitions included), then run on the unit; stock 1.74 flashed back at the end.

- **Flash on and off:** VD4H over stock and stock back over VD4H both completed.
- **DAC SUM off:** FILTER pressed twice stays on stock's FILTER page.
- **DAC SUM:** GLOBAL > AUDIO ROUTING shows the DAC SUM row (stock's list has none); RIGHT sets it ON.
- **DAC FILTER:** with DAC SUM on, FILTER then FILTER again opens DAC FILTER with TYP OFF (FRQ and RES empty).
- **Knobs follow TYP:** LP2 shows FRQ and RES, LP1 FRQ only, OFF neither (checked on screen).
- **Kept:** BD on LP1 comes back after SAVE KIT and KIT RELOAD; DAC SUM ON and BD on LP1 are kept across a hand power cycle with no save. DAC SUM was then set OFF and read back.
- **Load:** CPU 74.9 / 74.5 % before any key, 82.8 / 82.9 % while A01 played with DAC SUM on and BD on LP2 at the lowest FRQ; free heap flat.
- **Listening (by the owner):** BD on LP2 at the lowest FRQ, then TYP turned to OFF and back to LP2 by hand while it played. The owner's words: "sounds as expected".
- **Not checked on the unit:** persistence of FRQ, RES, DEP, ATK, SUS and POL; TYP past LP1 (BP, HP1, HP2, BS, PK); beside other modules that use sound bits. The sound was judged by ear only; nothing was recorded or measured.

## Emulator and offline checks for this submission (Modwerk's base)

All results in this section are from the emulator or offline tools, on 2026-11-08.

- **Build.** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `6f8066eb…`, m68k-elf GCC 16.2.0, binutils 2.47) compiled this folder; `package-elemod-recipe.mjs` wrote `voice-dac-1.4.0-os1.74.elemod` (`.run` 11,080 bytes, no `.bss`), and `--check` reproduces it. Its hash and source commit are in `sdk/imports/voice-dac-2026-11-08.json`.
- **Link.** `scripts/link-image.mjs` on the owner's stock OS 1.74 (`cb0f99d6…e123`) links it with the vendored Modwerk base for core-ar2 0.7 (plain variant `ba530f45`): `ramSpare` drops from 119,004 bytes (base alone) to 107,896, `fastSpare` stays 0, flash headroom 1,195,984 bytes. The image, VD14, is `1ed68998…432e`.
- **Source parity.** Linked with elekloader's released core-ar2 0.7 (`f1e9cb2c…c9`) on the same stock file, the package gives a main OS byte-identical to rytm2_mods v1.4's release object `voice-dac-1.4-os1.74.elemod` (`9649ce2a…960c`) linked with that core ([evidence/source-parity.json](evidence/source-parity.json)).
- **Emulator, analog-emu `4c07ed3` (dtboot, headless), VD14** ([media/capture.json](media/capture.json) has the full input plan):
  - GLOBAL > AUDIO ROUTING ends with a DAC SUM row reading OFF; RIGHT sets it ON. On stock 1.74 the same input shows a list ending at USB TO MAIN.
  - With DAC SUM on, TRIG and then FLTR twice on BD opens DAC FILTER with TYP OFF: DEP, ATK, SUS and POL shown, FRQ and RES empty. On stock the second FLTR press stays on the FILTER page.
  - Turning knob C (TYP) up: LP2 shows FRQ and RES; LP1 shows FRQ and leaves RES empty.
  - Every frame before AUDIO ROUTING opens is byte-identical to stock's with the same input.
- **Not shown by the emulator:** the sound (its analog voices are stubbed). The unit runs above cover what ran on hardware; LFO RND (16 of core's 56 sound bits) and this module (39) ran together in VL4H.
- **Offline:** the patch sites in `build.json` are the 27 of rytm2_mods' `ports["1.74"]`, as address, length and SHA-256 of the stock bytes; the link above checks those guards against the owner's stock file.

## Reported by the author on core-ar2 0.6

These are the porting contributor's results as written in rytm2_mods' README for 1.4 (see [upstream/README.md](upstream/README.md), "Results so far"), not repeated on Modwerk's base. The unit build's hash is in [evidence/hardware-testing.json](evidence/hardware-testing.json); its voice-dac source equals v1.4's, but its object was not compared with the v1.4 release object.

- rytm-emu, OS 1.74, core-ar2 0.6 with all eleven rytm2_mods (V6A4) against the same with voice-dac 1.3: a 59-screen walk was pixel-identical except DAC FILTER with TYP OFF, LP1 and HP1, where FRQ and RES, or RES, are empty as intended; the empty knobs do nothing; the page follows a switch from BD (LP1) to SD (OFF) and back.
- Hardware, Analog Rytm MKII, OS 1.74, 2026-10-23, V6H4 (V6A4 plus the analoghealth test mod for remote keys, `.syx` `4a896e59…f697`): every test step passed. DAC FILTER through every TYP, the empty knobs inert, the page following TRK + SD and back, RES kept across LP2, LP1 and LP2, and BD's DAC FILTER back as saved after SAVE KIT, a power cycle and RELOAD. BD on LP2, LP1 and OFF: no dropouts, nothing audible. Not compared with a v1.3 recording.
- Earlier versions: values kept through kit save and reload, a power cycle without a kit save, the +Drive sound library and a kit sent by SysEx and Overbridge (1.2, 2026-10-20); the shaper, 2-pole filters and polarity on hardware (1.0 era, 2026-10-06/07).

## Sound

Voice DAC changes the sound. The owner listened on both unit runs above: on 2026-11-08 (TYP) "sounds as expected"; on 2026-11-09 (RES, DEP, ATK, SUS, POL) "I heard clicks on polarity changes" and "otherwise was as expected".
