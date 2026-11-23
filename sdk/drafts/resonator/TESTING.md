# Resonator testing

Everything below ran in the DSP emulator (dsp_host, from the octabam checkout `npm run upstream:tools` keeps) on source of 23 November 2026. Nothing has run on a unit yet.

## On the unit

Not tested.

## Stock flows

Not tested. The module patches no stock code and claims no keys or screens; the effect chooser, parameter locks and Part saves still need a run on a unit.

## Render gate (verify.py)

`python3 sdk/drafts/resonator/verify.py`, all passing:

| Gate | Result |
|---|---|
| No mpysu; the sample loop is straight-line | pass |
| MIX 0 is bit-exact passthrough (TUNE COLUN, every other knob high) | pass |
| Zero in, zero out at full GAIN and DCAY, both TUNE settings | pass |
| NOTE 69, ten-second ring | 440.0000 Hz |
| COLUN degree 78 / 79 | 440.0000 / 441.0001 Hz |
| COLUN degree 0 / 127 | 10.8011 / 12000.0004 Hz |
| DCAY 64 T60 (table 0.512 s) | 0.510 s |
| Tail after a 0.9 FS burst, DCAY 64 at 6 s and DCAY 100 at 30 s | 0 LSB: digital silence |
| Full-scale 440 Hz sine on a 440 Hz mode, GAIN and DCAY at 127 | peaks 3 LSB above 2/3 FS (the soft clip's ceiling) |
| Trig split at frame 7; garbage in the r7 block before init | bit-identical to the plain render |
| INTV UNI: L == R; INTV 7: L differs from R | pass |

The pitch is the least-squares period over every rising zero crossing between 1 s and 6 s; the table's own coefficients predict 439.99999 Hz for A 440, and an integer model of the state update gives the same.

## Sound quality

`npm run fx:audit -- plan DIR --tail 6`, rendered through dsp_host, then `check`.

Defaults (PTCH 57, INTV 7, DCAY 64, DAMP 32, GAIN 32, MIX 64, NOTE):

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
|---|---|---|---|---|---|---|---|
| tone-1100hz-12db | -17.9 | -105.7 | <-140 | -105.3 | <-140 | 0 | ok |
| tone-1100hz-1db | -6.9 | -81.0 | -137.9 | -112.8 | <-140 | 0 | ok |
| tone-2701hz-12db | -18.0 | -127.5 | -121.5 | -105.7 | <-140 | 0 | ok |
| tone-2701hz-1db | -7.0 | -115.4 | <-140 | -115.8 | <-140 | 0 | ok |
| tone-5301hz-12db | -18.0 | -135.0 | <-140 | -105.7 | <-140 | 0 | ok |
| tone-5301hz-1db | -7.0 | -132.6 | -133.6 | -116.6 | <-140 | 0 | ok |
| tone-9102hz-12db | -18.0 | <-140 | -114.8 | -106.0 | <-140 | 0 | ok |
| tone-9102hz-1db | -7.0 | <-140 | <-140 | -116.6 | <-140 | 0 | ok |
| idle | digital silence after the input stops | | | | | | ok |

Dearest (PTCH 127, INTV 24, DCAY 127, DAMP 0, GAIN 127, MIX 127, COLUN): idle is digital silence and DC stays under -117 dBFS. The output is only the ring, all four modes at 12 kHz, so the audit's residual (-5 to -22 dBc) is the ring itself, not noise. One line is flagged: tone-2701hz-12db "aliasing" -51.8 dBc (limit -60). It is not distortion: that render peaks at -56 dBFS, where the soft clip is linear, and the same tone 11 dB hotter measures <-140 dBc. The flagged fold bin, 11.69 kHz, sits on the skirt of the 12 kHz modes. No limit was changed.

Every knob changes the sound: `fx:audit -- compare` on the noise signal at both ends of each of the seven controls (the rest at defaults) reports all 91 pairs as "differs"; each knob's own pair differs by -1.4 dB (GAIN) to -18.5 dB (INTV) or more.

## Performance

dsp_host meter, every knob at its dearest (no knob changes the per-sample work): 182.9 instructions/sample, 194.8 with a trig split at frame 1, 7 or 15. The sample loop is 173 words, the module 300 words of code and a 768-word P table. For scale only, #2047 quotes SPRING REV at 257.50 instructions/sample whole and 314.19 in its split sweep, measured in a different harness; the matched stock benchmark (benchmark_stock_dsp.py) and the unit's CPU price are still open.
