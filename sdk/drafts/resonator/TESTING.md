# Resonator testing

Software results below ran in the DSP emulator (dsp_host, from the octabam checkout `npm run upstream:tools` keeps) on the source of this commit. Unit results are labelled with their build.

## On the unit

The owner's Octatrack, OS 1.40C, Modwerk base e11525835106699a, 23 November 2026, each a RAM trial over USB (`npm run module:dev`), rolled back at the end:

| Build | Trial | What ran | Seen |
|---|---|---|---|
| 0.1.0, four modes, INTV and TUNE (fcabecbac) | 900 s | the owner played it on a loop | verdict: no crash, stall, freeze or skipped track. The owner: "not bad", but the dry was still clear at MIX 100 (fixed: the dry now falls as (1 - MIX)^2) |
| four modes, CHRD, COLUN, TONE, SCALE (uncommitted; trial 261c20de) | 900 s | the owner played it | verdict: no crash, stall, freeze or skipped track. The owner: not user-friendly. COLUN's state unclear, TONE barely audible, no resonator types, SCALE and CHRD undescriptive, voice count unclear. This version answers each |
| eight partials, TYPE and VOIC, DAMP on page 2 (2dbc0da58; trial 3511769c) | unplugged by the owner at about 493 s | the owner | the owner: TYPE belongs on page 2, DAMP on page 1, CHRD and COLUN need stepped and two-state switches, SCALE seemed to do nothing (with one voice it moves only the root), DAMP mostly duplicates DCAY. This version: DAMP gone (fixed damping), TONE on page 1, VOIC defaults to three voices, labels via #2084 |

The base's refusal counter read 18 before the second trial and 19 before the third; its causes were not captured. The panel shows stepped knobs as numbers in a development package, which made the second trial hard to read.

## Stock flows

Not tested. The module patches no stock code and claims no keys or screens; the effect chooser, parameter locks and Part saves still need a run on a unit.

## Render gate (verify.py)

`python3 sdk/drafts/resonator/verify.py`, all passing:

| Gate | Result |
|---|---|
| Every instruction decodes as written; no mpysu; the sample loop is straight-line | pass |
| The short table, for every knob value: each note's theta (top octave in 48 bits, shifted down by octaves) | bit-exact: the 24-bit theta of every note 0-127 (at most 0.20 cents from the curve) |
| Decay, input gain and TONE interpolated between every fourth value, for every knob value | T60 within 0.66 %, gain within 0.030 dB, TONE corner within 1.64 % of their curves |
| MIX 0 is bit-exact passthrough (COLUN on, every other knob high) | pass |
| MIX 100 with the ring silenced (GAIN 0): dry at (28/128)^2 | -26.4 dB |
| MIX 127 with the ring silenced: no dry left | digital silence |
| MIX at constant power, from the table, every MIX value | dry^2 + ring^2 within 0.025 dB from MIX 4, -0.138 dB at worst (MIX 2); dry exact |
| Noise (1 s, then 2 s) at the default setting, MIX 0, 32, 64, 96, 127 | -2.0, -1.4, -0.5, -0.1 dB per step |
| The ring alone (MIX 127) on 8 s of noise, default setting, DCAY 0 / 32 / 64 / 96 / 127, from 6 s | -3.8 / -4.0 / -4.2 / -4.2 / -3.3 dB from the dry |
| Zero in, zero out, BELL, four voices, full GAIN and DCAY, COLUN off and on | pass |
| NOTE 69, one PURE voice, ten-second ring | 440.0008 Hz |
| NOTE 0 / 115 / 116 / 127 (both ends of the octave shift) | 8.1756 / 6271.9272 / 6644.8755 / 12543.8527 Hz |
| COLUN degree 78 / 79 | 440.0008 / 441.0000 Hz |
| COLUN degree 0 / 127 | 10.8019 / 12000.0002 Hz |
| MAJ on A3, four PURE voices (this and the chord rows below at GAIN 32: at 127 the louder long ring reaches the soft clip, whose intermodulation moves the estimates) | 220.00, 277.18, 329.63, 440.00 Hz |
| MAJ on Colundi 78, snapped | 440.00, 528.00, 639.00, 880.00 Hz |
| MAJ on D4 in C MAJ (turns D minor) | 293.67, 349.23, 440.00, 587.33 Hz |
| C#4 in C MAJ snaps down to C4 | 261.63 Hz |
| MAJ triad in three voices | 220.00, 277.18, 329.63 Hz |
| Two STRNG voices of MAJ, four harmonics each | 220, 440, 660, 880 and 277.18, 554.36, 831.55, 1108.73 Hz |
| One BELL voice on A3, eight partials | 110, 220, 264, 330, 440, 550, 586.74, 660 Hz |
| One STRNG voice on Colundi 78: harmonics not snapped | 440, 880, 1320, 1760 Hz |
| DCAY 64 T60 (table 0.512 s) | 0.512 s |
| DCAY 66 / 99, between table points (curve 0.563 / 2.669 s) | 0.561 / 2.670 s |
| Tail after a 0.9 FS burst, BAR MAJ7 in four voices, DCAY 64 at 6 s and DCAY 100 at 30 s | 0 LSB: digital silence |
| Full-scale 440 Hz sine on a STRNG voice at 440 Hz, GAIN and DCAY at 127 | peaks 3 LSB above 2/3 FS (the soft clip's ceiling) |
| Once tuned, a trig split at frame 7; garbage in the r7 block before init | bit-identical to the plain render |
| One PURE voice: L == R; a four-voice chord: L differs from R; TONE 0 vs 127 differ | pass |
| TONE 30 (low-pass) / 99 (high-pass), between table points: a tone at the voice's pitch against TONE 64 | -4.66 / -5.25 dB (the one-pole's model: -4.66 / -5.26 dB) |

Pitch is the least-squares period over every rising zero crossing from 1 s to 6 s; chord and body partials are the phase step of half-second demodulations from 0.5 s to 2 s at each expected frequency, within 0.05 Hz.

## Sound quality

### Ring and dry levels

Measured in dsp_host, the ring alone (MIX 127) against the dry, default setting otherwise (PTCH 57, CHRD MAJ, TONE 64, GAIN 32, STRNG): noise is 8 s of white noise at ±0.5 FS, measured from 6 s; drums are 4 s of a 120 BPM eighth-note loop (a pitch-falling sine kick and a noise-and-tone snare, peaks near -1 dBFS), measured from 2 s. Peak is the ring's; pegged, the share of samples at the soft clip's ceiling.

| voices | DCAY | GAIN | noise, before | noise, now | drums, before | drums, now | drum peak dBFS, before / now | pegged, before / now |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 32 | -16.4 | -9.3 | -6.3 | -0.7 | -4.6 / -3.5 | 0 / 0.71 % |
| 1 | 32 | 32 | -20.1 | -7.5 | -12.3 | -1.5 | -9.1 / -3.5 | 0 / 0.68 % |
| 1 | 64 | 32 | -23.5 | -6.9 | -17.9 | -1.6 | -17.3 / -3.5 | 0 / 0.02 % |
| 1 | 96 | 32 | -27.7 | -7.2 | -19.6 | +1.1 | -24.4 / -4.9 | 0 / 0 |
| 1 | 127 | 32 | -32.4 | -8.1 | -18.6 | +5.7 | -27.5 / -4.5 | 0 / 0 |
| 3 | 0 | 32 | -10.8 | -3.9 | -2.7 | +1.8 | -3.5 / -3.5 | 0.19 / 2.32 % |
| 3 | 32 | 32 | -16.7 | -4.1 | -9.5 | +0.4 | -6.2 / -3.5 | 0 / 1.66 % |
| 3 | 64 | 32 | -20.6 | -4.0 | -16.2 | -0.5 | -14.6 / -3.5 | 0 / 0.45 % |
| 3 | 96 | 32 | -24.2 | -3.7 | -19.1 | +1.5 | -22.2 / -3.7 | 0 / 0 |
| 3 | 127 | 32 | -28.5 | -4.1 | -18.5 | +5.7 | -27.1 / -4.2 | 0 / 0 |
| 1 | 127 | 127 | -8.6 | +6.2 | +4.9 | +12.2 | -4.9 / -3.5 | 0 / 85 % |
| 3 | 127 | 127 | -4.8 | +6.7 | +5.0 | +12.2 | -4.7 / -3.5 | 0 / 85 % |

The input gain went from (1 - r)^0.75 / 4 to 0.157 (1 - r)^0.45 with up to 2 dB less below DCAY 32. On noise the ring now sits 3.7-4.1 dB under the dry at every DCAY with three voices (it fell by 18 dB across DCAY before); one voice is about 4 dB quieter, as its eight partials share one voice's energy. Not level with the dry: a ring that loud drove these drums (peaks near -1 dBFS) through the soft clip, whose ceiling is -3.5 dBFS, on 4.1 % of samples at DCAY 0 (0.167 (1 - r)^0.45, noise -1.6 to -3.6 dB) and 5.2 % with (1 - r)^0.5 / 4; 0.6 kept the drums cooler but let noise fall 10 dB across DCAY. The drum ring now runs 2.3 % / 1.7 % / 0.5 % into the ceiling at DCAY 0 / 32 / 64 with three voices at GAIN 32, none from 96; at GAIN 127 (+24 dB) it lives on the clip, as any ring 24 dB hotter than the dry does.

### MIX

The guide's check, `compare` on the plan's noise render at MIX 0, 32, 64, 96, 127, level step to step:

| setting | before | now |
|---|---|---|
| default (DCAY 64, GAIN 32, three STRNG voices) | -4.94, -6.68, -7.99, -1.85 dB | -2.25, -1.63, -0.62, -0.10 dB |
| dearest (see below) | -4.95, -6.83, -9.56, -3.63 dB | -0.08, -0.36, -0.20, -0.06 dB |

### fx:audit

`npm run fx:audit` (plan `--tail 20`), each signal rendered in dsp_host through this source at the manifest's dearest setting (PTCH 60, CHRD MAJ7, DCAY 127, TONE 127, GAIN 127, MIX 127, COLUN on, TYPE BELL, four voices):

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
|---|---|---|---|---|---|---|---|
| tone-1100hz-12db | -23.1 | -67.7 | -22.4 | -15.4 | -106.0 | 0 | FAIL |
| tone-1100hz-1db | -12.3 | -45.7 | -22.5 | -15.5 | -93.7 | 0 | FAIL |
| tone-2701hz-12db | -25.8 | -72.7 | -83.9 | -12.3 | -118.0 | 0 | ok |
| tone-2701hz-1db | -14.9 | -51.0 | -64.5 | -12.3 | -106.1 | 0 | ok |
| tone-5301hz-12db | -29.3 | -80.5 | -71.3 | -15.7 | -107.2 | 0 | ok |
| tone-5301hz-1db | -18.4 | -58.2 | -71.5 | -15.8 | -94.9 | 0 | ok |
| tone-9102hz-12db | -32.9 | -95.3 | -84.6 | -14.6 | -107.3 | 0 | ok |
| tone-9102hz-1db | -21.9 | -100.1 | -65.3 | -16.4 | -97.9 | 0 | ok |
| idle | after the input stops: digital silence | | | | | | OK |

The 1.1 kHz "aliasing" is the eight partials' ring landing on fold-back bins (the same at -12 and -1 dBFS, which a linear ring does and a nonlinearity does not; the previous commits measure -22.7 dBc too). The ring is 24 dB louder at this setting than before, so its harmonics (the soft clip) rose to -45.7 dBc on a -1 dBFS tone. With `--tail 12` the idle row noted 2 LSB at -90.3 dBFS: the louder ten-second ring had not finished; with 20 s it ends in digital silence.

The same with DCAY 0, so only the soft clip is left (plan `--tail 12`): 1.1 kHz -24.4 / -9.2 dBc harmonics, aliasing <-140 / -52.4 dBc (-12 / -1 dBFS); 2.7 kHz -101.6 / -41.6; 5.3 kHz <-140 / -29.9; 9.1 kHz -45.1 / -21.3 dBc. Before: every tone ok except 9.1 kHz at -59.6 / -37.3 dBc. The short ring is 7 dB louder at GAIN 127 now, so the clip's third harmonic folds back harder; the soft clip itself is unchanged here.

`compare` on the noise render, each knob at its two ends with the rest at the dearest setting: every knob differs (PTCH +29.6 dB, CHRD -7.6 dB, DCAY -3.8 dB, TONE -12.3 dB, GAIN from silence, MIX -0.7 dB, COLUN +3.1 dB, TYPE -5.8 dB, VOIC -1.0 dB) except SCALE, identical because COLUN is on and SCALE works with COLUN off only.

## Performance

dsp_host meter, executed instructions/sample at the worst block, GAIN at 127, nine settings each with a trig split at frame 1, 7 and 15 and without: 250.8 at worst (four STRNG voices of 5TH around note 118 in C MAJ, DCAY 126, split), 249.6 without a split; four BELL voices of MAJ7 snapped to Colundi 248.7 and 247.5; one BAR voice 246.0 and 244.8. The constant-power mix costs four instructions a sample less than the old crossfade, MIX and TONE are set once per block. Before this table and mix: 255.1 and 252.1. The sample loop runs eight partials at 18 cycles each; one partial is retuned per block. The module is 844 words of code and a 667-word P table (1511 DSP words; 1851 before the short table), 89 state words. The Colundi search walks the table in address registers; a note's theta, the decay and TONE cost more per block than a lookup did. For scale only, #2047 quotes SPRING REV at 257.50 instructions/sample whole and 314.19 in its split sweep, measured in a different harness; the matched stock benchmark and the unit's CPU price are still open.
