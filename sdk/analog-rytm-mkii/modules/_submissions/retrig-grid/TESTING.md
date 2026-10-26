# Retrig Grid testing

## Build

RG05, 26 October 2026 (this source): core-ar2 0.3 (`core-0.3.elemod` sha256 90f30adb…9c75, built from elekloader's core-ar2-v0.3 tag) + retrig-grid 0.1.0-experimental (`.elemod` sha256 fdec6df5…), built and linked with that tag's `elekloader.sdk.build`, `lint` and `patch` and Debian's m68k-linux-gnu-gcc 12.2.0, on the owner-supplied OS 1.74 (stock sha256 cb0f99d6…e123). RG05.syx sha256 a39f45ef27e3a70ee3ece06b5950c0890d24ee043aa0a1bba7c7cf6297eabb9e. Module: `.run` 1225 bytes, `.bss` 108 bytes, no sites. Lint: OK.

RG04 (module `.elemod` 01f7e265…, also in the author's LF18) is the first source. It worked out the pulse's place in the bar from the master step times the current speed's pulses per step. RG05 counts the pulses instead (review of #957), and gives the same results as RG04 in every case below where the speed stays constant.

## RG05: a speed change while playing (26 October 2026)

Same method as below, on RG05's snapshot. The pattern was poked to the normal scale mode at 2x (bytes 85689 and 85690 = 0 and 0), or at 3/2x (0 and 1), while playing. Its every-step voice then trigs every 2816 or 2848 samples at 2x. RTRG + BD was pressed about four 1x steps later. Times are in 1x steps (16ths) since PLAY, mod 16.

| Case | RG04 (before) | RG05 |
| --- | --- | --- |
| 1/16 at 2x, two press times | 6.497 7.501 8.500 9.500 … (half a 16th off) | 6.999 7.998 8.997 10.002 … |
| 1/4 at 2x | not run | 7.998 12.000 0.002 3.998 8.000 … |
| 1/16 at 3/2x | not run | 6.999 7.998 8.997 10.002 … |

Diagnosis (certain, from the code and the RG04 run): RG04 counted the steps played before the change at the new speed's 3 pulses instead of 6, an error of 3 pulses per step played before the change.

## Stock, before the module (rytm-emu, 26 October 2026)

Factory project RYTMLINJE, 127 BPM, BD with RETRIG 1/16. Each trig was read from the analog voice frame by `DTEMU_FRAME_TRACE=160,162`: BD's trig switch (byte 161 bit 4) and a voice with a trig on every step (byte 163 bit 4).

- Holding RTRG and pressing BD between two steps: the first hit came at the press, then retrigs every 5664 or 5696 samples (177 or 178 blocks of 32; the ideal 1/16 at 127 BPM is 5669.3). They stayed 0.32 of a step after the step grid, about 37 ms, for the whole hold, with no swing.
- Moving only the series' tick deadline and counter onto the grid, in a snapshot taken just after the press, put the next 14 hits within 2 samples of the steps; stock carried on from there. That is what the module does.

## RG04, then RG05, in rytm-emu (rytm-emu 3c4c42c, 26 October 2026)

Every case in this table was run on RG04 and again on RG05 with the same hits, except 1/3 and 1/32 (RG01 only) and RETRIG GRID OFF and the power cycle (RG04 only; the switch and its storage did not change in RG05).

Method: boot RG04 on a fresh card, clear the calibration notices with NO, PLAY the factory pattern, and save a snapshot. Each case below resumes the snapshot with keys at fixed clocks and reads the trig times as above. The master step and pulse in the snapshot (0x405c8c94, 0x405c8c96) and the next pulse's time (0x405c8b20) place each hit in the bar since PLAY. Where noted, the pattern's swing byte was set to 50 % by `--poke`, so the step grid is visible in the pattern's own trigs, and BD's RETRIG rate was set by `--poke` on the live kit. Times are master steps, mod 16.

| Case | BD hits | Result |
| --- | --- | --- |
| 1/16, press at 3.456 | 3.456 3.998 4.997 6.002 7.001 8.000 … 15.998 | press, then steps; first gap 0.54 |
| 1/16, press at 3.710 | 3.710 4.997 6.002 7.001 … | step 4 was 0.29 away (under half a period): skipped |
| 1/16, press at 3.964 | 3.964 4.997 6.002 … | first gap 1.03 |
| 1/16, press at 4.218 | 4.218 4.997 6.002 … | first gap 0.78 |
| 1/4 | 3.710 8.000 12.002 15.998 4.000 8.002 11.998 16.000 | the beats |
| 1/12 | 3.710 5.336 6.668 8.000 9.332 10.664 12.002 … | triplets of the bar |
| 1/3 (on RG01, same logic) | 3.710 10.664 15.998 5.332 10.666 16.000 | thirds of the bar |
| 1/32 (on RG01) | 3.710 3.998 4.500 4.997 5.499 … | half steps |
| 1/80 | 3.710 3.998 4.201 4.399 4.602 … | fifths of a step |
| ALWAYS ON, no RTRG | 3.710 4.997 6.002 7.001 … | aligned as with RTRG |
| Sequencer stopped | 3.710 4.709 5.708 6.707 … | from the press: stock |
| RETRIG GRID OFF | 10.743 11.742 12.741 … | from the press: stock |
| Swing 57 % (factory) | 3.710 4.997 6.002 7.001 … | straight grid |

All hits after the first are within 2 samples of the grid: the same 32-sample block.

The GLOBAL menu lists RETRIG GRID ON after SYSTEM, and YES turns the row to RETRIG GRID OFF; the label changes at once (screens in `media/`). After OFF, a power cycle (`--power-off`, the power-fail save) and a cold boot on the same card, the row still reads OFF.

The audio-block handler was counted from the compiled object: three SRAM reads and about 12 instructions until a pad has retriggered, then about 45 an audio block, with the per-track pass only when a deadline moves.

## On a unit (author report, 26 October 2026)

Build LF18: the author's LF17 (core-ar2 0.3 + loop-sync 0.3 + send-fx 0.1, each `.elemod` byte-identical to LF17's) + retrig-grid 0.1.0-experimental (`.elemod` sha256 01f7e265…, the RG04 source, before the speed-change fix). LF18.syx sha256 7d3b6b88808c20377c1cd9c8d7fdbeda8986b71c5e33dc34fbe6435d1d7bdbc2, linked with LF17's storage lockfile. Sent to the author's Analog Rytm MKII on OS 1.74 with Elektron Transfer.

The author went through the LF18 test sheet and reported the result as "parfait". The sheet's five checks:

1. RTRG + BD between two steps while playing: the retrigs fall with the pattern.
2. RETRIG 1/8, then 1/12.
3. GLOBAL > RETRIG GRID OFF: free again, then ON.
4. Pattern stopped: as stock.
5. His heavy project with Send FX: no added interface lag.

Each check's result was not reported separately. Neither the duration nor timings on the unit were recorded, and the firmware was not read back.

### This source on the unit: build MD06 (author report, 26 October 2026)

Build MD06: a core-ar2 0.7 draft (elekloader branch `core-ar2-fx-lockwords`, b062098, not released) + loop-sync 0.3.1 + send-fx (its locks branch) + retrig-grid 0.1.0-experimental (`.elemod` sha256 fdec6df5…, this source, the same object as RG05's). MD06.syx sha256 ea02c82aaed14bac7dd04f1e6a677277507a793569607aeec34f06dfd30e55b8, linked with LF18's storage lockfile. Sent to the author's Analog Rytm MKII on OS 1.74 with Elektron Transfer. This module uses only core-ar2 0.3's events, which the draft keeps.

The author reported, while playing:

- A tempo change: "changement de tempo ok ça suit" (the retrigs follow).
- The speed (SCALE) changed from 1x to 2x: the retrigs stay on the grid.

Informal listening; no timings measured on the unit; the firmware was not read back.

## Not tested

- On a unit: this source with the released core-ar2 0.3 alone (MD06 carried a core-ar2 0.7 draft and other modules).
- External MIDI clock; a pattern change to another pattern while playing (only speed and tempo changes were run).
- Per-step retrigs set in the sequencer, with the module installed: the module skips series whose retrig flag (0x8000fe44) stock clears for them, so they should be untouched, but this was not run.
- CREATE NEW (the row should read ON) and SAVE PROJECT / LOAD PROJECT of the switch.
- Load on a unit: not measured.
