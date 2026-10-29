# Retrig Grid testing

## 0.2.0: swing and micro timing (rytm-emu, 29 October 2026)

### Build

RG08: core-ar2 0.3 (`core-0.3.elemod` sha256 90f30adb…, as RG05) + retrig-grid 0.2.0-experimental (`.elemod` sha256 fdfcd4a8…), elekloader core-ar2-v0.3 `sdk.build`, `lint` and `patch`, Debian's m68k-linux-gnu-gcc 12.2.0, owner-supplied OS 1.74 (stock sha256 cb0f99d6…e123). RG08.syx sha256 ad3b361f050bf987b9e15ccd5df39ed14503ea6e695d7f253d02dfa00b2a6bb0. Module: `.run` 2305 bytes, `.bss` 228 bytes, no sites. Lint: OK.

RGS1: the author's MD07 set (core-ar2 0.7 draft 735d641e…, loop-sync 0.3.2 81cf9a96…, send-fx a0c2c614…) with this retrig-grid object, linked by elekloader main with MD07's lockfile: storage record 0xa369a464 as MD07, 152 bytes of the 128 KB mod area spare. RGS1.syx sha256 26713395418c940c2cd7da1294e0f29a6e353435ca482405830f1b34e2a9094e. The linker places mods by id, so Send FX's code starts 1,080 bytes later than in MD07.

### Diagnosis (written before the change)

- **Certain** (code): 0.1.0 put the first tick on a straight grid point and stock counted straight ticks from it. Nothing read the swing, the swing trigs or micro timing.
- **Certain** (rytm-emu, disassembly): stock runs at most one retrig tick an audio block (0x4012089a); a count of 1 always fires and reloads 960. LENGTH (0x8000fc24) and VEL.CUR (0x42ade07c) advance with the tempo each block, not with ticks.
- **Certain** (rytm-emu, BD trigs poked on every step, swing 66 %): a trig sounds at its straight step start, plus (SWING - 50) / 50 of a track step if the step's swing trig is set (bit 4 of its flag word, track + 2 x step), plus its micro timing (signed byte at track + 320 + step) in 1/24 of a track step. Measured offsets: +0.320, +0.5, -0.5, +1.278, -0.958, +0.25, -0.25 steps for micro timing 0, +12, -12, +23 (swung), -23, +6 (swung), -6.
- **Certain** (rytm-emu): the per-track times at 0x8000fd50 are three event lanes a track. The sequencer writes the next step's time into a free lane at the straight start of the current step; on a step with a trig it is the trig's time above. **Probable**: on a step without a trig the lane does not follow the step's swing trig (a trigless track, swing trigs on the odd steps, showed swung values on steps 6 and 14). A pad is usually rolled on a track without trigs there, so the module reads the swing from the pattern instead.
- **Certain** (rytm-emu, found while testing, also in 0.1.0): the master step at 0x405c8c94 is 1 at PLAY. 0.1.0 counted the bar from step 0, one step before PLAY, so 1/8, 1/4, triplets and slower rolls fell one step before the pattern's beats (RG05 and RG08's predecessor RG07, BD trigs on the beats: every 1/4 retrig 5,664 samples, one step, early). The track step counters at 0x405c8cd0 + t hold the step the sequencer prepares next: from the next pulse on, the step that starts after the one under way, with its pulse at 0x405c8cdd + t.

### Method

Each case resumes a snapshot of the build playing the factory project (RYTMLINJE, 127 BPM, ADVANCED scale, BD 16 steps at 1x) and reads trig times from the analog voice frame (`DTEMU_FRAME_TRACE=160,162`, BD's trig switch). The pattern's swing byte (pattern + 85688) and BD's step flags and micro timing were set by `--poke`. Two checks:

1. **Against the pattern.** BD trigs poked on every step (swing trigs on the odd steps). The same run without keys gives the pattern's own BD trig frames; with RTRG + BD held, every hit after the press is compared with the nearest pattern hit. A retrig off the pattern shows as an extra hit.
2. **Against the swung grid.** BD without trigs; each retrig is compared with the straight grid point moved by the swing of the steps around it (odd steps late by (SWING - 50) / 50 of a step, linear between step starts), in samples.

### Results

| Case (check 1) | Retrigs after the press | Off a pattern hit |
| --- | --- | --- |
| 1/16, swing 50 % | 26 | 0 (all on the same frame) |
| 1/16, swing 58 % | 26 | 0 |
| 1/16, swing 66 % | 26 | 0 |
| 1/16, 66 %, micro timing +12, -6, +6, -12 on steps 3, 6, 10, 13 | 26 | 0 |
| 1/16, 66 %, micro timing +12, -12, +23, -23, +6, -6 (steps 6 and 7 cross) | 23 | 0 |
| 1/16, 66 %, NORMAL scale (length 16), micro timing as above | 26 | 0 |
| 1/16, 66 %, tempo set to 100 BPM | 21 | 0 |
| 1/32, 66 %, BD track at 2x | 53 | 0 |
| 1/32, 58 %, NORMAL scale at 2x | 53 | 0 |
| 1/16, 66 %, NORMAL scale at 2x (1/16 on the unswung even 2x steps) | 31 | 0 |
| 1/12, 66 %, BD at 3/4x set before PLAY | 21 | 0 |
| 1/16, 58 %, from a fresh PLAY | 20 | 0 |
| 1/4, 50 % and 66 %, BD trigs on steps 1, 5, 9, 13 | 11 | 0 (RG05: all 5,664 samples early) |
| RGS1 (MD07's set): 1/16 at 66 %, and 1/4 on the beats at 66 % | 26, 11 | 0 |

Check 2, at swing 50, 58 and 66 %: 1/16 for four press positions across a step, 1/32, 1/12, 1/4 and 1/80. Every retrig is within 19 samples (one 32-sample block) of the swung grid; at 66 % the 1/16 roll plays the odd steps 0.318-0.322 step late and the even ones on time, and 1/32 plays the half steps 0.657-0.662 after the step (half way between a swung and an unswung step).

ALWAYS ON at 66 %: as with RTRG. Sequencer stopped, and RETRIG GRID OFF (set by writing the switch's variable): a retrig about every step from the press (gaps 0.999, once 1.005), as stock. A grid point closer than half a period to the press, once swung, is skipped.

Load (static, from the compiled object): about 16 instructions an audio block until a pad has retriggered, about 35 while it retriggers, and about 350 once per retrig (the pass over the tracks and the swung time of the next retrig, with four divisions). 0.1.0 ran its pass over the tracks on every tick.

The GLOBAL screens (`media/`) were captured again on RG08 with the same plans: byte-identical to RG05's.

### On a unit (author report, 29 October 2026)

Build MB04 (`OS-MB04-groupe-1.syx`, sha256 3ad6fd307df28d1fd23e5b9090fe4ba8718480b7ea5cae79073abaeb9cba1202): the Modwerk base with the send bus and the effects clock, CHORUS, FLANGER, PHASER, MULTIBAND DRIVE, BITCRUSHER, ARP FILTER and MULTITAP DELAY, loop-sync 0.3.2 (81cf9a96…) and this retrig-grid object (fdfcd4a8…), storage record 0x3a9157b2.

- The author: "le swing Suit sur rtrg grid" (the retrigs follow the swing).

That is the whole report: the sheet's other checks (1/4 on the beats, 1/32 and 1/12 at 66 %, micro timing, OFF) were not reported one by one. Informal listening; the swing values used were not recorded; no timings measured on the unit; the firmware was not read back. The same object is in MB07-MB09.

## 0.1.0

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

- 0.2.0 on a unit, beyond "the swing follows": 1/4 on the beats, 1/32 and 1/12 with swing, micro timing, the OFF switch. RGS1 (MD07's set, where Send FX's code moves by 1,080 bytes) was not tried: the author tested on MB04, where Retrig Grid links last.
- A pattern change while a roll plays (the next pattern's swing is read from its first retrig on); a track speed changed while playing; the switch through the GLOBAL menu on RG08 (unchanged code).
- On a unit: 0.1.0 with the released core-ar2 0.3 alone (MD06 carried a core-ar2 0.7 draft and other modules).
- External MIDI clock; a pattern change to another pattern while playing (only speed and tempo changes were run).
- Per-step retrigs set in the sequencer, with the module installed: the module skips series whose retrig flag (0x8000fe44) stock clears for them, so they should be untouched, but this was not run.
- CREATE NEW (the row should read ON) and SAVE PROJECT / LOAD PROJECT of the switch.
- Load on a unit: not measured.
