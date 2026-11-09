# Improved Envelopes: testing

## Unit, EV15 / ED02 (DEC, REL and HLD curves), 6 Nov 2026

Build ED02 (unit pass): RC31's set and no-send base b530a147 with Improved Envelopes (head de6be7d02:
idle skip fcdf99a0, the tables from `tools/dec_table.py`, HLD texts in whole ms below 2 s). sha256 6060d48f640ae90ed2306a0cbbfff7dca8b9a275e6636e3fa70fb830fba55f81,
lock RC31's NS01 (unchanged), ramSpare 15,708. Independent review of ED01: no bugs; its HLD text finding
(79/80 and 81/82 read alike) is fixed in ED02. rytm-emu 2ac0f1f boots it ("cpu exceptions: 32:..."
only) and the five `ptr` sites hold the tables' addresses.

On the unit (track 1 as it is, the looped sine; MIDI CC 78-80 from the rig, takes recorded from MAIN OUT
over USB; envelope read at 0.083 ms steps, -3 dB to -23 dB slope, t60 = 60 dB x ms per dB):

| AMP DEC | design t60 | measured |
|---|---|---|
| 1 / 2 / 3 / 5 / 8 | 0.2 / 0.4 / 0.6 / 1.0 / 1.6 ms | 1.0 / 1.0 / 1.25 / 1.5 / 1.75 ms (the VCA's slew floors the shortest) |
| 12 / 15 / 20 | 2.4 / 3.0 / 4.0 ms | 2.5 / 3.25 / 4.25 ms |
| 25 / 30 / 35 / 45 / 55 | 5 / 7.5 / 10 / 15 / 25 ms | 5.0 / 7.5 / 10.0 / 15.0 / 25.0 ms |
| 65 / 75 / 85 / 89 | 50 / 100 / 200 / 300 ms | 50.3 / 100.8 / 201.3 / 301.5 ms |
| 95 / 100 / 105 / 110 | 0.66 / 1.28 / 2.47 / 4.78 s | 0.665 / 1.284 / 2.476 / 4.763 s |
| 113 / 115 / 117 / 120 | 7.10 / 9.25 / 12.04 / 17.88 s | 7.04 / 9.19 / 12.00 / 17.69 s |

From 5 ms up the AMP decay is within 0.7 % of the text; below 5 ms the VCA slew (~0.8 ms) sets the floor,
so DEC 1..8 differ by less than a millisecond.

| AMP HLD (ATK 0, DEC 25) | design | measured decay start, minus HLD 0 (3.3 ms) |
|---|---|---|
| 1 / 2 / 3 / 5 / 8 / 10 / 15 | 0.67 / 1.33 / 2.0 / 3.33 / 5.33 / 6.67 / 10.0 ms | 0.58 / 1.33 / 1.92 / 3.25 / 5.25 / 6.58 / 9.92 ms |
| 21 / 31 / 42 / 46 / 57 | 18.0 / 51.3 / 124.7 / 151.3 / 298 ms | 17.9 / 51.25 / 124.6 / 151.2 / 297.9 ms |
| 70 / 85 / 90 / 100 | 627 / 1481 / 1972 / 3497 ms | 627.3 / 1481.2 / 1972.0 / 3496.7 ms |
| 110 / 126 | 6.20 / 15.5 s | 6.20 / 15.50 s |

FILTER DEC and REL (self-oscillating tone, FRQ 86, ENV +6, level through the map of a linear ATK 64,
log-linear fit from 80 % to 10 %, two takes each): time constant against the text's t60 / ln 1000.

| k | DEC | REL |
|---|---|---|
| 45 / 55 / 65 (15 / 25 / 50 ms) | 1.017 / 1.016 / 1.015 | not measurable (too short to track) |
| 75 / 89 / 100 (100 ms / 300 ms / 1.28 s) | 1.014 / 1.015 / 1.012 | 1.015 / 1.015 / 1.015 |

DEC 30 (7.5 ms) was too short to track. The 1.5 % is the method's, as on EV14.

Some takes of the HLD sweep came back with a one-off USB capture gap (a stretch of digital silence);
those were repeated and the clean take is the one above.

On the unit's screen (ED02, the author): AMP HLD 90 reads 1972ms and fits the field.

Not tested: FILTER DEC/REL below 15 ms and AMP DEC below 5 ms to better than the VCA's slew, the other knob texts on the unit's screen (host-checked: all 128 values of each knob distinct, at most 6 characters), FUNC jump to HLD 42, saving and reloading.

## Idle CPU, LR03 / LP01 (6 November 2026)

The amp writer called `envelopes_voice` for every voice every block. Now (8028baf2) a voice skips the C call when its rate and level words equal the last
ones it took and that call left the level follower as it was. The follower is a pure function of its
state and the record outside the attack words, so the skipped call would have changed nothing. Stock
(read in amp_env_commands) sends rate 0 / level 0 to an idle voice every block, and the same one-pole
record in the decay state, which a voice stays in until its next trig.

- Measured on the author's MKII with the private lag-telemetry base, RC31's set, scratch project,
  sequencer stopped, no USB audio, 50 one-second readings: LR01 (RC31) 70.84 % of the audio block,
  LR03 (RC31 with this source) 70.37 %. Pad mash (LR02, with two other idle changes): 81.7 % against
  82.7 %, ~10 % fewer presses.
- Independent code review: no findings (registers, ColdFire encodings, skip equivalence).
- rytm-emu: LP01 boots, TRAP #0 only. Rig re-run on the unit: pending.

## Unit, EV14 (current), 6 Nov 2026

Build EV14: EV13's set with Improved Envelopes at 4efb6fbe (FILTER ATK table for the filter's 1.00x
speed, FILTER text unscaled; 18a15a2e adds only docs); sha256
61163e6089ca427505e2c25fcd3401e13dd828a23094cd3d5be856bf5d83cc9f, lock NS01, ramSpare 17,788.
Flashed by the author. FILTER ATK by the ~1.3 kHz method of the EV13 section (FRQ 86, ENV +6, ends
extrapolated, four takes each; mean / spread):

| FILTER ATK | Target | Measured | Ratio |
|---|---|---|---|
| 10 / 15 / 20 / 25 | 2 / 3 / 4 / 5 ms | 1.88 / 3.01 / 3.83 / 4.87 ms (spread 0.04-0.21) | 0.94 / 1.00 / 0.96 / 0.97 |
| 30 / 35 / 40 / 45 | 7.5 / 10 / 12.5 / 15 ms | 7.50 / 9.99 / 12.50 / 15.01 ms (spread <= 0.008) | 1.000 |
| 50 / 55 / 64 / 72 / 80 | 23.8 / 37.9 / 87.2 / 183 / 384 ms | 23.86 / 37.96 / 87.40 / 183.46 / 385.03 ms | 1.001-1.003 |

Below 3 ms one tone cycle (~0.5 ms) is a large part of the ramp, so 2 ms and shorter are within the
method's error. Everything else of EV13 carries over (AMP code unchanged).

## Unit, EV13, 6 Nov 2026

Build EV13: EV09's set and base (no-send b530a147, lock NS01) with Improved Envelopes at a6df46ff
(FILTER ATK table, rounded knob times); sha256
6c7598110742557956310a49906aa44d20978273f31d66a394eb8fa4de9c3cbb, ramSpare 17,708. Flashed by the
author; scratch project, track 1 a looped sine. MAIN OUT over USB audio, settings by USB MIDI CC.

EV13 and EV14 also carried ENV RESET AMP with a pre-fade; it left this module before 0.1.0 (Env Reset
Amp keeps ENV RESET AMP), so those runs are not recorded here.

**FILTER ATK on the new table** (method as EV09 below: LP2, RES 127, FRQ 40, LEV 0, ENV +24, AMP ATK 0
/ HLD AUTO / DEC INF, FILTER SUS 127 / DEC 0, single MIDI notes; rise start to top, by zero crossings).
Target = the curve; this build's table carried the 0.984 speed (superseded below).

| ATK | Target | Measured | Resolution (two periods) |
|---|---|---|---|
| 64 / 72 / 80 / 96 | 87.2 / 183 / 384 / 1691 ms | 88.7 / 183.7 / 381.9 / 1710 ms | 4-7 ms |
| 45 / 55 | 15 / 37.9 ms | 16.1 / 42.3 ms | 4-5 ms |
| 1 / 5 / 10 / 25 / 35 | 0.2 / 1 / 2 / 5 / 10 ms | 1.6 / 1.9 / 1.5 / 11.3 / 11.5 ms | 1.5-5 ms |

The long end matches within 2 %. Below 15 ms the filter tone is too low for this method to time the
ramp (a few cycles across it), so short FILTER ATK times were not measured this way (see the ~1.3 kHz runs below). A run at FRQ 70 put the top
of the sweep past the tracker's 12 kHz range and was discarded.

**Filter envelope re-measured at ~1.3 kHz** (same EV13 unit, same day). The low tone above (139 Hz,
7 ms a cycle) blurs short segments, and timing the rise between thresholds cut its ends off. Here:
FRQ 86, ENV +6 (a 12-semitone sweep from ~1.3 kHz), each segment's ends extrapolated from line fits
over 10-30 % and 70-90 % of the sweep, four takes per attack value, two per decay/release value
(medians; three single takes where a fit failed are left out).

| FILTER ATK | Target (curve) | Median measured | Ratio |
|---|---|---|---|
| 15 / 20 / 25 | 3 / 4 / 5 ms | 2.96 / 3.90 / 4.94 ms | 0.99 / 0.97 / 0.99 |
| 30 / 35 / 40 / 45 | 7.5 / 10 / 12.5 / 15 ms | 7.61 / 10.15 / 12.71 / 15.25 ms | 1.015-1.017 |
| 50 / 55 / 64 / 72 / 80 | 23.8 / 37.9 / 87.2 / 183 / 384 ms | 24.26 / 38.57 / 88.82 / 186.42 / 391.19 ms | 1.017-1.019 (spread <= 0.06 ms) |
| 5 / 10 | 1 / 2 ms | 0.82 / 1.66 ms | below the method's ~0.5 ms cycle |

The table then carried 0.984, so the filter ran at 0.984 x 1.018 = 1.00x the OS model.

| FILTER (time constant) | 24 | 40 | 56 | 72 | 88 |
|---|---|---|---|---|---|
| DEC, model ms | 47.2 | 120.7 | 268.5 | 566.0 | 1164.4 |
| DEC, measured / model | 1.013 | 1.011 | 1.008* | 1.002 | 0.987 |
| REL, measured / model | 1.014 | 1.016* | 1.015* | 1.013 | 1.014 |

(* one of two takes; the other's fit failed.) Level read back through a linear attack's pitch map,
log-linear fit between 80 % and 10 %. So the filter envelope runs at the model's speed: 4efb6fbe
builds the FILTER ATK table for 1.0 and shows FILTER times unscaled (EV14). EV14's table is not yet
played on the unit.

Not tested on the unit in EV13: knob texts (rytm-emu: FILTER ATK reads 1.0ms, 4.2ms, 11.0ms, 16.5ms,
2.2s on the curve), FUNC jumps, choke, saving and reloading, CPU cost.

## Unit, EV09, 6 Nov 2026

Build EV09: RC30's set with envelopes in place of env-reset-amp, on the private no-send base b530a147,
lock NS01; sha256 6cccc5e5c91bd24e89c1220ecddef3c569386aed9b44e9f3d79c590999c3f908 (source b6727c48;
the display-name commit 0764febb is in it). Flashed by the author; track 1 as the author set it (a
looped ~1 kHz sine), only AMP ATK/HLD/DEC sent over USB MIDI (CC 78/79/80), MAIN OUT over USB audio.

| Check | Target | Measured |
|---|---|---|
| ATK peak 10 / 25 / 35 / 45 / 55 / 64 / 72 / 80 | 2 / 5 / 10 / 15 / 37.9 / 87.2 / 183 / 384 ms | 2.5 / 5.0 / 10.25 / 15.5 / 38.25 / 87.5 / 183.5 / 383.75 ms |
| ATK 0 / 1 / 5 (0 / 0.2 / 1 ms) | | 0.75 / 1.5 / 1.25 ms (the VCA's own slew) |
| Decay start HLD 0 / 1 / 7 / 15 / 31 / 47 | 0 / 15.6 / 62.5 / 125 / 250 / 500 ms | 2.5 / 17.5 / 64.2 / 126.8 / 251.5 / 501.5 ms |
| AUTO, note 100 / 300 ms | 100 / 300 ms | 102.5 / 301.5 ms |
| Never cut, ATK 87 ms: HLD 0 / 2 / 7 (62.5 ms) | peak at 87 ms | 87.5 / 87.5 / 87.5-87.8 ms (HLD 7 re-run 3x: one sweep take had a late USB note) |
| Second MIDI note on a decaying voice (ATK 64/72, DEC 100/110) | attack continues from the current level to the first peak | -14.27 vs -14.28 dB, all three; the second peak came 23 / 24.5 / 52 ms after the note, from 0.9 / 1.2 / 2.0 dB below the peak |
| AMP DEC slope, DEC 6..126 | 0.918 x model (text) | 0.90-0.925 x model (DEC 108/114 captures failed) |

Decay start = the 3 dB point minus 3 x the measured dB slope. The VCA ran attacks at 0.957x and decays
at 0.918x the OS timing model on EV06; EV07 on builds the ATK table and the AMP ATK/DEC text for it.

### Filter envelope timing (EV09, same day)

Track 1's filter self-oscillating (LP2, RES 127, FRQ 40, sample LEV 0, ENV depth +24, AMP ATK 0 / HLD
AUTO / DEC INF), its pitch tracked by zero crossings: the envelope's level was read back through the
pitch-to-level map of a linear attack (FILTER ATK 48), so the cutoff curve does not bias the fit.

| Segment | Values | Measured / model |
|---|---|---|
| Attack (rise start to top) | ATK 16 / 32 / 48 / 56 / 64 / 72 / 80 | 0.956 / 0.979 / 0.983 / 0.984 / 0.984 / 0.985 / 0.986 |
| Decay (time constant, SUS 0) | DEC 24 / 40 / 56 / 72 / 88 | 0.905 / 0.902 / 0.895 / 0.887 / 0.873 |
| Release (time constant, SUS 127) | REL 24 / 40 / 56 / 72 / 88 | 0.906 / 0.904 / 0.902 / 0.902 / 0.901 |

FILTER ATK text scaled by 0.984, DEC and REL by 0.90 (EV10..EV13). Superseded: the ~1.3 kHz runs in
the EV13 section show both were this method's bias; from 4efb6fbe the filter has no factor.

These runs used stock's FILTER ATK table (118 ms..3.7 s attacks). The new FILTER ATK table
(`envelopes_flt_atk`, site 0x4010d2aa, EV11 on) is checked in rytm-emu only (knob text); its times on
the unit, and the filter's speed below 118 ms, were not tested then (now measured: EV13 section).

## Unit (Analog Rytm MKII, OS 1.74), 6 Nov 2026

Build EV04: RC30's set with Envelopes in place of Env Reset Amp, base 8b0cafbc, sha256
374157b56041b15bff1d9795371cc60c6a7f0388c7075378e1365287a549d393 (source 818f7b08). Flashed by the
author; scratch project.

Automated: track 1 (BD) on BD ANALOG with its DEC 127, filter open, no FX, AMP DEC 40, played over USB
MIDI (channel 1, note 0, velocity 100), MAIN OUT recorded over USB audio; script envtest.py (private
rig, not in the repo). BD ANALOG's own body falls about 3 dB over the first 150 ms and it has an onset
click, so hold and AUTO are judged against the HLD 47 take (held to 500 ms), not by an absolute peak.

| Check | Result |
|---|---|
| HLD 0, ATK 0 | falls from the hit (below the held take by 20 ms) |
| HLD 1 / 7 / 15 / 31 (15.6 / 62.5 / 125 / 250 ms) | leaves the held take after about 20 / 80 / 150 / 300 ms (sample points 10-50 ms apart) |
| AUTO, note 100 ms / 300 ms | leaves the held take right after note-off (125 / 400 ms points) |
| AUTO, ATK 64, note 50 ms | decays from the note-off, mid-attack (AUTO is outside the never-cut rule) |
| Never cut: ATK 64 (87 ms) with HLD 0, 2 (24 ms), 7 (62.5 ms) | identical takes; peak 87 ms, decay from 85 ms |
| ATK peak: 55 / 64 / 72 / 80 (37.9 / 87.2 / 183 / 384 ms) | 36.8 / 87.3 / 171.5 / 348 ms (long ones peak early on BD ANALOG's falling body) |
| ATK rise 10-90 %: 0 / 1 / 5 / 10 / 25 (0 / 0.2 / 1 / 2 / 5 ms) | 1.0 / 1.0 / 1.25 / 1.75 / 3.75 ms (hardware slew ~0.8 ms floors the shortest) |
| ATK 64 rise 10-90 % | 64.8 ms = 0.74 of the 87.2 ms ramp, as earlier probe measurements |

Not tested on the unit: knob texts and the AMP picture (rytm-emu only), FUNC jumps, filter
DEC/REL times, retrigs, choke, saving and reloading, CPU cost.

## rytm-emu (2ac0f1f), EV02-EV04

- Boots to the main screen; CPU exceptions only TRAP #0, as RC30.
- HLD text: 24ms (2), 31ms (3), 125ms (15), 500ms (47), 10.5s (116), 13s (120), AUTO (127).
- AMP DEC text: 63ms (7), 3.3s (68), 39.5s (124). (EV02 showed 0 / 1667s: fixed in EV03.)
- ATK text: 6.5ms (28), 38ms (55).
- FUNC + turn on HLD: 0 -> 15 -> 127 and back (stock's debounce paces it).
- AMP picture: HLD 0 attack straight into decay, AUTO with the note at 127.
- State traces (voice 0): HLD 0 + ATK 0 -> decay one block after the trig; HLD 0/2 + ATK 38 ms ->
  decay at 57 blocks (38 ms); HLD 15 -> 3024 ticks (125 ms); AUTO -> state 1 (gate); HLD turned to
  AUTO during a timed hold -> state 1.

## Review

Independent code review (two rounds): findings fixed in 5437e197 (MAC-mode -60 dB times, follower
start at silence, AUTO turned mid-hold, slow-rate floor); second round found no new bugs.
