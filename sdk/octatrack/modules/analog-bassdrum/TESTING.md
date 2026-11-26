# Analog BD 0.2.0 — the ColdFire rewrite

24 November 2026. Package `bf9c69b4` (`public/octatrack-modules/analog-bassdrum/0.2.0-experimental.mwrm`), built by `build.py` from `drum.c` and `drum_machine.c` (`--subscribe ot_machines:ab_machine:20 --raise ev_trig_muted`): 37,592 bytes of ColdFire code and data, 2,272 of bss, no DSP code, no stock-code site, no `requiredBase`. The builds played on the unit were the same sources built under a temporary id, `analog-bd-cf` (so `frame-costs.json`'s 0.1.7 booking would not stop the curve): the last of them, package `934c9557`, is byte for byte what these sources build under that name; the release package differs only in its module id and name.

## What changed

- **No DSP.** The 808 and 909 run in C on the ColdFire (`drum.c`), rendered into the packer's source longs like SYNTIZ's. Each voice keeps its own 16-sample grid from its trig, so every event (the 909's body opening, its click, its release, the end of its hold) falls on a block edge; envelopes are worked out exactly once a block and ramped across it; the sample loop reads tables, multiplies and adds. A voice whose hit is over hands its track to stock's silent source.
- **The same models.** Tables come from 0.1.7's fit (`fit909.json`, the 808's constants) through `tools/tables.ts`; nothing is copied from a recording. The body's two tables (the cycle above H1 and H1) are 1,024 points, linearly interpolated, in three band-limited copies (H1-63, H1-24, H1-10) chosen per block by the sweep's increment.
- **The lead-in.** Every recorded hit rises for 2.25 ms before its main fall (sd 0.07 ms over the 160 hits of the three recordings, the previous hit's tail removed before onset detection). `leadin.json` is the mean of all hits over the 96 samples before the body opens, from before the rise; its level by ATK is the median projection of the low- and high-Attack hits, its variation (FIXD OFF) the measured relative spread.
- **The desk is gone** (owner, 24 November 2026): SAT, LOW, HIGH and LPF are not read. At neutral 0.1.7's desk was a gain of 4 (residual -92 dB), which 0.2.0 keeps; only ACNT near 127 drove its limiter.

## On the host

Renders of `drum.c` through a host harness, compared with the recordings (Skee Mask's 70 BPM direct-out takes, private) and with 0.1.7's float models (`dsp909.Voice`, `dsp808.Voice`, which match 0.1.7's DSP at -80 dB or better). Hits aligned at the main fall, levels matched over 30-400 ms, error energy against the mean of four neighbouring recorded hits:

| Case (TUNE / ATK) | Recording's own hit-to-hit spread | 0.1.7: lead-in / 0-25 ms | 0.2.0: lead-in / 0-25 ms / 25-100 ms |
| --- | ---: | ---: | ---: |
| 0 / 0 | -31.2 dB | -4.9 / -23.8 | -14.5 / -24.6 / -29.2 |
| 0 / 127 | -29.4 dB | -2.4 / -21.2 | -14.7 / -22.7 / -28.7 |
| 127 / 0 | -22.1 dB | -5.4 / -21.7 | -11.2 / -21.9 / -22.9 |
| 127 / 127 | -26.8 dB | -3.0 / -19.0 | -12.1 / -19.5 / -18.4 |

- 808 against 0.1.7's: -50 to -55 dB at defaults and moderate settings; with ATK 127 and a high accent -25 to -32 dB, where 0.1.7's desk limited its peaks softly and 0.2.0 clips at full scale.
- High frequencies: in the tail, energy above 4 kHz is 81 dB under the fundamental (0.1.7: 67 dB). Block-rate lines (2.76 kHz and its multiples) are 83 dB under the fundamental, as 0.1.7's own. With TDEP and TUNE at 127 the band-limited copies take the energy above 16 kHz during the sweep 3.5-6 dB down; at defaults the sweep never reaches the copies.
- Retriggers every 476 ms (four steps at 126 BPM): the largest step from one sample to the next, from the trig to the body's first block, is 0.005 of full scale, the slope of the fall itself.
- ColdFire instructions (qemu `-cpu cfv4e`, `m68k-elf-gcc -mcpu=54455 -Os`, the engine at `-O2`, two render calls a frame): a 909 about 1,070 a frame while it decays and up to about 1,900 in the frame its click starts, an 808 about 1,000; a resting voice runs none of it (its track goes to stock's silent source). Counts, not the unit's time.

## On the owner's MKII, 24 November 2026

Development twin `4c7eb79b` of base 0.8.1, built from main `539b97e7e` without trust rows; project Dev17. The owner's flashed base `eb667962` and its nine kept modules were recorded first and checked again after the twin (card set 1, 9 saved, 9 live both times). The first boot of the twin never enumerated on USB and the unit came back on the flashed base; the owner power-cycled and the second boot came up.

**Listening (the owner, four rolled-back trials of 2 to 11 minutes).** What he reported, and what changed before the next trial:

1. TDEP did nothing above 115, and high-frequency artifacts were clearly audible: the sweep's excursion overflowed a 16-bit factor past TDEP 115; the body table was read without interpolation (noise 58 dB under the fundamental) and every block's ramps restarted from exact targets (a 2.76 kHz line). Fixed by a wider shift, interpolated tables and ramps that go on from where the last block left them.
2. Still a little of it: quickly repeated hits clicked twice (the lead-in started at 30 % of its height, and the new body restarted its phase under the last hit's tail). Fixed by the lead-in from before the rise, and the old hit fading out across the lead-in.
3. DCAY, ACNT and almost every other control played their value only after being turned: a track that had just become Analog BD rendered from the live lane and DSP halfwords, which still held the old machine's bytes. Fixed: on the tick a track turns, its twelve Part bytes are copied there.
4. Faint aliasing remained: the band-limited copies for fast sweeps. The owner accepted the final build as good enough.

Each trial ended "no crash, stall, freeze or skipped track logged during the trial" and rolled back.

**Cost** (`npm run device:price -- --curve T1,T3,T6,T7 --pick-pattern 2 --measure-pattern 4`, 8 s a reading, three readings a state, final build `934c9557`): Dev17 C04 at 125 BPM, trigs on steps 1/5/9/13 of T1-T4, T6 and T7 (T2 and T4 play samples), 77.9 % of the frame at its longest with stock alone, picks on the empty C02, Part 1.

| Analog BD tracks | Longest frame | Added | 0.1.7 on the same scene (22 November) |
| --- | ---: | ---: | ---: |
| 0 | 78.3 % | — | — |
| 1 (T1) | 87.0 % | +8.7 | +20.7 |
| 2 (T3) | 91.0 % | +12.7 | +32.6 |
| 3 (T6) | 95.0 % | +16.7 | +40.8 |

First 8.7, each 4.0 (`evidence/frame-cost.json`); installed on no track +0 on the frame, +0.3 on the CPU meter; no render dropped and no stall. A fourth track (T7) was refused by the base's CPU budget: with no price named yet each track is charged the default 12 %, past the 45 % allowance at four. Admitted on the empty pattern at a 41.0 % longest frame and on the medium one at 86.9 %, nothing dropped. The first build of the day, before the fixes above, read +13.8, +22.0 and +26.6 on the same scene (126 BPM); the readings scatter by about ±2.5 points.

## Not tested

MKI; project save, reload and a power cycle with Analog BD tracks; eight tracks with heavy effects; MIDI-triggered notes and mute modules (`ev_trig_muted` is raised as SYNTIZ does); the module's machine price (`resources.cpuPrice`, still on the pending list).

## Reproduce

- Tables: `node tools/tables.ts` (or `--check`).
- Package: `python3 -B sdk/runtime/loader/build.py sdk/octabam/modules/analog-bassdrum/drum.c sdk/octabam/modules/analog-bassdrum/drum_machine.c --subscribe ot_machines:ab_machine:20 --raise ev_trig_muted -o analog-bassdrum.mwrm`.
- Host checks: `cc test_drum.c drum.c && ./a.out` (levels, rest, retriggers, FIXD determinism, the 808 and every control at its ends).

0.1.x's record is in Git history: `git show 223357e7f:sdk/octatrack/modules/analog-bassdrum/TESTING.md`.
