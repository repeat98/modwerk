# Octatrack base 0.8: first unit run, big sets and the CPU guard (21–22 November 2026)

This base was numbered 0.7.14 while it was developed; the owner renamed it 0.8 on 22 November 2026.

The owner's MKII, OS 1.40C, CF card in. Source `b36f9c53e` (`base/octatrack-next`, release identity `7342ecf7`), built as a
development twin, `9203cdf6` (`MAIN.raw` `6d5269b8`). It has the beta flags, but USB Audio is linked in as `USB AUDIO OUT MAIN`,
with no packaged USB Audio and no USB input. It has `--dev`, and its trust rows admit Sidechain, Output Matrix, Analog BD,
CC Map and Recorder Loop Fix, built against it. Everything ran in RAM as rolled-back trials, and nothing was kept. The flashed
base (`254c5a75`) and its kept set (Grain, Vibrato, Euclid, Mini Verb) were left alone.

The scene was project Dev17, bank C, pattern C01, Part 1, a clean Part. I placed trigs on steps 1, 5, 9 and 13 of T1–T8
(T2, T4 and T5 play samples; T1, T3 and T6–T8 have empty static slots) at 126 BPM. The figures are the CPU meter (`stats`),
the frame interrupt's share and its longest frame (`guard`, 8 s windows), skipped renders (the guard's count), UI ticks a
second (`health`), and the CPU guard's own figures read from RAM (`cpu_played`, `cpu_adjust`, the meter's mean).

## Baselines, no modules

| State | Meter | Frame share | Longest frame | Skips |
|---|---:|---:|---:|---:|
| Stopped, before the first PLAY | 35 % | 23.5 % | 32 % | 0 |
| Stopped, after any PLAY | 42 % | 27.4 % | 36 % | 0 |
| Playing C01 (three reads) | ~60 % | 39.4 % | 88 % | 0 |

UI ticks stayed at 60 a second, and the longest gap between frames at 380–500 µs, in every run below.

## Installed and used nowhere: modules cost the frame, and stock tracks drop renders

- **Set A, 24 modules including all five base-bound ones:** the self-test passed, 24/24 intact. Playing: frame share 57.5 %
  (+18.1), longest frame 125 %, meter 66–69 %. The frame guard skipped renders on stock sample tracks T1–T8 (33 in the
  trial). The trial's verdict failed it, though no module was in use.
- **Each module alone, playing, against 39.4 %:**
  - FM Synth 0.1.4: +5.8, longest frame 117 %
  - Repitch 0.2.1: +2.7 (here it acts: T5's loop names REPITCH as its timestretch)
  - Mute Modes 0.2.2: +2.6
  - POLY8 0.3.3: +2.5
  - Euclid 0.1.5: +2.4 (0.1.6, #1868, rests)
  - Sidechain +0.9, Tape Echo +0.4, Output Matrix +0.2
  - 0: Grain, SYNTIZ, Amiga, Analog BD, Play Modes, Deja Vu, E-Verb, Mini Verb, CC Map, Recorder Loop Fix, Bar LED, Screen Off

  These add up to the set's figure (17.5 against 18.1).
- **Set G** (Grain, FM Synth, SYNTIZ, Amiga, POLY8, Analog BD, Tape Echo, Euclid, Mini Verb, E-Verb, Vibrato), all tracks
  STATIC, playing: meter 65.4 %, frame share 50.7–51.3 %, longest frame 126–131 %, about ten skips in 8 s. Renders drop at a
  51 % mean because single frames spike past the guard's share, not because the mean is high.

## The CPU guard

Machines were picked stopped, after playing, and measured playing C01 with set G installed. The baseline was set G with all
tracks on STATIC: meter 65.4 %, frame share 50.7 %.

| Machine, tracks | Guard | Meter | Frame share | Skips in 8 s |
|---|---|---:|---:|---:|
| FM Synth ×5 (T1–T5) | 2nd refused at kept 65.4 % | 63.6 % (−1.8) | 56.6 % (+5.9) | 0 |
| SYNTIZ ×1 | admitted, 2nd and 3rd refused | 76.5 % (+11) | 65.2 % (+14.5) | 24 |
| POLY8 ×1 | admitted | 71.0 % (+5.6) | 58.0 % (+7.3) | 5 |
| Amiga ×1 | admitted | 67.6 % (+2.2) | 55.4 % (+4.7) | 0 |
| Analog BD ×3 | all admitted, nothing charged | 77.4 % (+12) | 71.4 % (+20.7) | 61 |
| Grain 0.1.0 | refused on every track (price 35, no meter cost) | | | |

FM Synth's five tracks were admitted only after the kept reading had been lowered on the empty pattern C02.

- **It refuses what fits.** The second FM Synth was refused: "CPU FULL, PLAY 79 % +6 %, LIMIT 85 %". The 79 % is kept 65.4,
  plus 6 for the first FM Synth, plus 8 for sleeping delays. The delays slept because the unit was stopped, but the kept
  reading was taken while they played, so they are charged twice. FM Synth names no meter cost, so each track is charged its
  price, 6, while five tracks in place of STATIC lowered the meter.
- **It admits what does not fit.** SYNTIZ is judged on the meter (65.4 + 12 + 3 < 85), yet one track takes the frame share
  to 65 % and drops renders. Analog BD's DSP voice is charged nothing on the ColdFire, yet each track adds about 7 points of
  frame share.
- **One Tape Echo froze the unit.** Tape Echo on T1 FX2 was admitted (65.8 + 8 + 3 wake < 85). Playing, the meter read
  ~75 %, the frame share 62.1 % (+11.4), the longest frame 134 %, and the guard skipped 165 renders in about 11 s. About 3 s
  into the next play, MAIN froze: USB audio kept streaming one 250 ms loop for 9 s. Then the unit left USB, and with it the
  other USB audio interface on the same hub. Nobody was at the unit, so it is not known whether it hung or was switched off.
  The stall and crash records are read at the next power-on.

The fix (frame admission with a peak check, a frame charge for ColdFire effects and DSP voices, prices carried in the
module set, the double counts above) is being designed separately; these figures are its input.

## Smaller findings

- **POLY8 0.3.3** still writes TSTR OFF into the Part's STATIC and FLEX records on a pick (`no_timestretch`, Part byte
  0x1fc for T2), and leaving POLY8 does not restore it. Its own detour already forces TSTR off in the live config.
- **A trial's verdict can fail for skips it did not cause.** `diag.c` logs at most one shed record every ten minutes, so
  skips from an earlier trial are logged inside a later trial's window. Analog BD alone failed on "33 skips since the start"
  with no new skip. The fix is the guard's live skip count in the log's last page (16 bytes are free there), compared
  before and after, as crash and stall counts already are.
- **The first `gap` read after a RAM boot** reported 32.5 s. `frame_at` starts at 0, so the first frame measures from the
  timer's start. The same gap is behind "a frame late" in the first self-test after a boot.
- **`device-send.py` under a time limit** left its request running forever. Fixed separately: the unit queue now stops the
  command on SIGALRM.

## Not tested

Bank and Part switches under load, set B and set swaps, Euclid and more than one Tape Echo, listening by a person, the
release image, a Keep and a power cycle, USB Audio as a package, MKI. The unit left USB before those runs.
