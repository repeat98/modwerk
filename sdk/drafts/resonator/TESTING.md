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
| MIX 0 is bit-exact passthrough (COLUN on, every other knob high) | pass |
| MIX 100 with the ring silenced (GAIN 0): dry at (28/128)^2 | -26.4 dB |
| Zero in, zero out, BELL, four voices, full GAIN and DCAY, COLUN off and on | pass |
| NOTE 69, one PURE voice, ten-second ring | 440.0007 Hz |
| COLUN degree 78 / 79 | 440.0007 / 440.9999 Hz |
| COLUN degree 0 / 127 | 10.8019 / 12000.0001 Hz |
| MAJ on A3, four PURE voices | 220.00, 277.18, 329.63, 440.00 Hz |
| MAJ on Colundi 78, snapped | 440.00, 528.00, 639.00, 880.00 Hz |
| MAJ on D4 in C MAJ (turns D minor) | 293.67, 349.23, 440.00, 587.33 Hz |
| C#4 in C MAJ snaps down to C4 | 261.63 Hz |
| MAJ triad in three voices | 220.00, 277.18, 329.63 Hz |
| Two STRNG voices of MAJ, four harmonics each | 220, 440, 660, 880 and 277.18, 554.36, 831.55, 1108.73 Hz |
| One BELL voice on A3, eight partials | 110, 220, 264, 330, 440, 550, 586.74, 660 Hz |
| One STRNG voice on Colundi 78: harmonics not snapped | 440, 880, 1320, 1760 Hz |
| DCAY 64 T60 (table 0.512 s) | 0.512 s |
| Tail after a 0.9 FS burst, BAR MAJ7 in four voices, DCAY 64 at 6 s and DCAY 100 at 30 s | 0 LSB: digital silence |
| Full-scale 440 Hz sine on a STRNG voice at 440 Hz, GAIN and DCAY at 127 | peaks 3 LSB above 2/3 FS (the soft clip's ceiling) |
| Once tuned, a trig split at frame 7; garbage in the r7 block before init | bit-identical to the plain render |
| One PURE voice: L == R; a four-voice chord: L differs from R; TONE 0 vs 127 differ | pass |

Pitch is the least-squares period over every rising zero crossing from 1 s to 6 s; chord and body partials are the phase step of half-second demodulations from 0.5 s to 2 s at each expected frequency, within 0.05 Hz.

## Sound quality

Not run on this version yet. The four-mode draft passed `npm run fx:audit` at its defaults (every signal ok, idle digital silence; the dearest settings flagged a 12 kHz ring's skirt as aliasing at -51.8 dBc on a -56 dBFS render, not distortion), and every one of its knobs changed the noise render. Rerun both before listing.

## Performance

dsp_host meter, worst of these, all knobs at their dearest: 255.2 executed instructions/sample (four BELL voices of MAJ7 snapped to Colundi, trig split at frame 1 or 15); 252.2 without a split; 250.5 for four STRNG voices in a scale; 246.4 for one BAR voice. The sample loop runs eight partials at 18 cycles each; one partial is retuned per block. The module is 799 words of code and a 1054-word P table (1853 DSP words in the package), 89 state words. For scale only, #2047 quotes SPRING REV at 257.50 instructions/sample whole and 314.19 in its split sweep, measured in a different harness; the matched stock benchmark and the unit's CPU price are still open.
