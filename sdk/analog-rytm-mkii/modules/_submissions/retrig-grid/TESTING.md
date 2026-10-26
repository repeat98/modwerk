# Retrig Grid testing

## Build

RG04, 26 October 2026: core-ar2 0.3 (`core-0.3.elemod` sha256 90f30adb…9c75, built from elekloader's core-ar2-v0.3 tag) + retrig-grid 0.1.0-experimental, built and linked with that tag's `elekloader.sdk.build`, `lint` and `patch` and Debian's m68k-linux-gnu-gcc 12.2.0, on the owner-supplied OS 1.74 (stock sha256 cb0f99d6…e123). RG04.syx sha256 313fc74aa0e58e480a79959369bc41aeaf14dc733f202be46751ad11d21e0e7c. Module: `.run` 1105 bytes, `.bss` 100 bytes, no sites. Lint: OK.

## Stock, before the module (rytm-emu, 26 October 2026)

Factory project RYTMLINJE, 127 BPM, BD with RETRIG 1/16. Each trig was read from the analog voice frame by `DTEMU_FRAME_TRACE=160,162`: BD's trig switch (byte 161 bit 4) and a voice with a trig on every step (byte 163 bit 4).

- Holding RTRG and pressing BD between two steps: the first hit came at the press, then retrigs every 5664 or 5696 samples (177 or 178 blocks of 32; the ideal 1/16 at 127 BPM is 5669.3). They stayed 0.32 of a step after the step grid, about 37 ms, for the whole hold, with no swing.
- Moving only the series' tick deadline and counter onto the grid, in a snapshot taken just after the press, put the next 14 hits within 2 samples of the steps; stock carried on from there. That is what the module does.

## RG04 in rytm-emu (rytm-emu 3c4c42c, 26 October 2026)

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

Build LF18: the author's LF17 (core-ar2 0.3 + loop-sync 0.3 + send-fx 0.1, each `.elemod` byte-identical to LF17's) + retrig-grid 0.1.0-experimental (`.elemod` sha256 01f7e265…, the source above; the same module object as RG04). LF18.syx sha256 7d3b6b88808c20377c1cd9c8d7fdbeda8986b71c5e33dc34fbe6435d1d7bdbc2, linked with LF17's storage lockfile. Sent to the author's Analog Rytm MKII on OS 1.74 with Elektron Transfer.

The author went through the LF18 test sheet and reported the result as "parfait". The sheet's five checks:

1. RTRG + BD between two steps while playing: the retrigs fall with the pattern.
2. RETRIG 1/8, then 1/12.
3. GLOBAL > RETRIG GRID OFF: free again, then ON.
4. Pattern stopped: as stock.
5. His heavy project with Send FX: no added interface lag.

Each check's result was not reported separately. Neither the duration nor timings on the unit were recorded, and the firmware was not read back.

## Not tested

- External MIDI clock; a tempo change during a roll; a pattern change during a roll.
- Per-step retrigs set in the sequencer, with the module installed: the module skips series whose retrig flag (0x8000fe44) stock clears for them, so they should be untouched, but this was not run.
- CREATE NEW (the row should read ON) and SAVE PROJECT / LOAD PROJECT of the switch.
- Load on a unit: not measured.
