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
| Zero in, zero out, BELL, four voices, full GAIN and DCAY, COLUN off and on | pass |
| NOTE 69, one PURE voice, ten-second ring | 440.0008 Hz |
| NOTE 0 / 115 / 116 / 127 (both ends of the octave shift) | 8.1756 / 6271.9272 / 6644.8755 / 12543.8527 Hz |
| COLUN degree 78 / 79 | 440.0008 / 441.0000 Hz |
| COLUN degree 0 / 127 | 10.8019 / 12000.0002 Hz |
| MAJ on A3, four PURE voices | 220.00, 277.18, 329.63, 440.00 Hz |
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

`npm run fx:audit` (plan `--tail 12`), each signal rendered in dsp_host through this source at the manifest's dearest setting (PTCH 60, CHRD MAJ7, DCAY 127, TONE 127, GAIN 127, MIX 127, COLUN on, TYPE BELL, four voices):

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
|---|---|---|---|---|---|---|---|
| tone-1100hz-12db | -47.6 | -65.3 | -22.7 | -15.2 | -121.7 | 0 | FAIL |
| tone-1100hz-1db | -36.6 | -74.6 | -22.7 | -15.2 | -125.2 | 0 | FAIL |
| tone-2701hz-12db | -50.3 | -61.2 | -60.8 | -12.2 | -119.9 | 0 | ok |
| tone-2701hz-1db | -39.3 | -78.2 | -95.4 | -12.1 | -118.3 | 0 | ok |
| tone-5301hz-12db | -53.8 | -65.6 | -55.5 | -15.8 | -119.8 | 0 | FAIL |
| tone-5301hz-1db | -42.8 | -77.8 | -66.7 | -15.8 | -120.7 | 0 | ok |
| tone-9102hz-12db | -57.4 | -69.9 | -41.6 | -14.4 | -118.3 | 0 | FAIL |
| tone-9102hz-1db | -46.4 | -79.6 | -62.6 | -14.4 | -114.4 | 0 | ok |
| idle | after the input stops: digital silence | | | | | | OK |

Not distortion: at MIX 127 the output is the ring of the eight tuned partials, so the test tone itself comes out 35-46 dB down and the ring (the residual, -12 to -16 dBc) lands on some fold-back bins. The "aliasing" is the same at -12 and -1 dBFS, which a linear ring does and a nonlinearity does not. The previous commit's table renders the same figures within 1.1 dB.

The same with DCAY 0, so the onset's ring has died before the audit's window and only the soft clip is left: every tone ok (aliasing -70.8 to -112.9 dBc) except 9.1 kHz, whose clip's third harmonic (27.3 kHz) folds to 16.8 kHz at -59.6 dBc (-12 dBFS) and -37.3 dBc (-1 dBFS). GAIN 127 is +24 dB into an x - x^3/3 clip; the previous commit measures the same (-59.6 / -37.3 dBc). Known, not changed here.

`compare` on the noise render (1 s of noise, then 12 s), each knob at its two ends with the rest at the dearest setting: every knob differs (PTCH +31.8 dB, CHRD -7.9 dB, DCAY -21.2 dB, TONE -13.4 dB, GAIN +94.9 dB, MIX -25.0 dB, COLUN +3.1 dB, TYPE -5.6 dB, VOIC -2.4 dB) except SCALE, identical because COLUN is on in the dearest setting and SCALE works with COLUN off only. MIX 0, 32, 64, 96, 127: the level falls -5.0, -6.8, -9.6 and -3.6 dB step to step, monotonic, because at this setting the ring is 25 dB quieter than the dry: more than the guide's 3 dB per step, a question of the mix law and GAIN's range, not of this commit.

The previous commit's renders against this one's, dearest setting: noise -39.7 dB difference at -0.04 dB level, the 9.1 kHz tone -46.9 dB (DCAY 127 and TONE 127 sit between table points; the T60 and the TONE corner moved by under 0.7 % and 1.7 %). With DCAY and TONE on table points, every note 0-127 renders bit-identical to it.

## Performance

dsp_host meter, executed instructions/sample at the worst block, GAIN at 127, nine settings each with a trig split at frame 1, 7 and 15 and without: 253.3 at worst (four STRNG voices of 5TH around note 118 in C MAJ, DCAY 126, split), 251.7 without a split; four BELL voices of MAJ7 snapped to Colundi 251.2 (split) and 249.6; four STRNG voices of MAJ7 in C MAJ 253.1 and 251.4; one BAR voice 248.6 and 246.9. The previous commit measured 255.1 at worst (the Colundi setting, split) and 252.1 without a split in the same runs. The sample loop runs eight partials at 18 cycles each; one partial is retuned per block. The module is 837 words of code and a 634-word P table (1471 DSP words; the previous commit 797 + 1054 = 1851), 89 state words. The Colundi search walks the table in address registers; a note's theta, the decay and TONE cost more per block than a lookup did. For scale only, #2047 quotes SPRING REV at 257.50 instructions/sample whole and 314.19 in its split sweep, measured in a different harness; the matched stock benchmark and the unit's CPU price are still open.
