# Resonator testing

Software results below ran in the DSP emulator (dsp_host, from the octabam checkout `npm run upstream:tools` keeps) on the source of this commit. Unit results are labelled with their build.

## On the unit

The owner's Octatrack, OS 1.40C, Modwerk base e11525835106699a, 23 November 2026, each a RAM trial over USB (`npm run module:dev`), rolled back at the end:

| Build | Trial | What ran | Seen |
|---|---|---|---|
| 0.1.0, four modes, INTV and TUNE (fcabecbac) | 900 s | the owner played it on a loop | verdict: no crash, stall, freeze or skipped track. The owner: "not bad", but the dry was still clear at MIX 100 (fixed: the dry now falls as (1 - MIX)^2) |
| four modes, CHRD, COLUN, TONE, SCALE (uncommitted; trial 261c20de) | 900 s | the owner played it | verdict: no crash, stall, freeze or skipped track. The owner: not user-friendly. COLUN's state unclear, TONE barely audible, no resonator types, SCALE and CHRD undescriptive, voice count unclear. This version answers each |
| eight partials, TYPE and VOIC, DAMP on page 2 (2dbc0da58; trial 3511769c) | unplugged by the owner at about 493 s | the owner | the owner: TYPE belongs on page 2, DAMP on page 1, CHRD and COLUN need stepped and two-state switches, SCALE seemed to do nothing (with one voice it moves only the root), DAMP mostly duplicates DCAY. This version: DAMP gone (fixed damping), TONE on page 1, VOIC defaults to three voices, labels via #2084 |

The "refusals" figure a trial prints is word 4 of the base's USB diagnostics: vendor requests the link refused, which grows with the tools' own traffic (it read 15,087 to 22,410 through the 24 November session), not a module refusal. The panel showed stepped knobs as numbers in a development package then; it shows their words now.

## Test procedure on the unit, 24 November 2026

The owner's Octatrack MKII, OS 1.40C, RAM-booted on development twin `8fd6d456` of base 0.8.1 (built from `9d5aec73a` with the beta base's flags and `--dev`), project Dev17, bank C: picks on the empty C02, readings on C04 at 126 BPM (trigs on steps 1/5/9/13 of T1-T4, T6, T7; T2 and T4 play samples), Part 1 equal to its saved copy, the scene Tape Echo 0.1.9's frame cost was read on. The package declares its measured cost (`npm run module:dev -- resonator --build-only --cycles 256 --cycles-kind executed --state 89`); a draft built with the builder's placeholder of 600 modeled cycles is refused at verify (loader refusal 6).

**Build `9d5aec73a`, package `bcdf3d49b012`:** `npm run test:procedure -- resonator --package … --pick-pattern 2 --measure-pattern 4`, 427 s, steps 1 to 10 passed.

| # | Step | Result |
|---|---|---|
| 1 | Software checks | passed (`module:doctor --draft`) |
| 2 | Beside every other module | judged by step 1 for a draft |
| 3 | Name the build | passed |
| 4 | DSP cost model | passed (`cycle-scan check`) |
| 5 | Emulator rehearsal | not run: no emulator session; the unit steps ran directly |
| 6 | Read the unit | passed: twin `8fd6d456`, nothing installed |
| 7 | Scripted unit pass | passed: self-test with it installed (CPU peak 55.4 %, longest frame 400 us); alone on FX2 of T1 and T5 admitted in 118 ms (peaks 492 and 578 per mille of a frame); all eight at once while playing admitted (CPU 57.3 %, core peaks 723 and 825 per mille); 12 of 12 Part switches ran their own effects within 3 s |
| 8 | Soak | passed: 2,400 operations in 122 s, no crash, stall or frozen frame. PROG CH RECV was on 16, so its program changes did nothing: the procedure's soak sends programs 0-3 (bank A) on channel 1, which would have left the unit in bank A for step 9 |
| 9 | Cost on the unit | passed, below |
| 10 | Put back | passed: the inventory as at the start |
| 11 | Agent by hand | below |
| 12 | Owner's stage | to do |

Step 9, `device:price` on T1 FX2, 8 s a reading:

| | Frame interrupt | CPU meter | DSP T1-4 | DSP T5-8 |
|---|---|---|---|---|
| Before | 38.3 % (longest 91.7 %) | 62.0 % | 36.4 % | 47.2 % |
| Installed, used nowhere | +0 | -0.1 | +3.0 | -1.5 |
| On T1 FX2 | +0.1 | +0.2 | +6.8 | +0.1 |

Curve on T1, T3, T6 and T7: the longest frame moved -1.3, 0, -0.2 and -1.7 points, so rest 0, first 0, each 0: the work is on the DSP, none in the frame interrupt. Admission: alone on the empty pattern admitted (longest frame 39.6 %), on the medium one admitted (89.2 %), no dropped render, no stall. The figures for `resources.cpuPrice` and `evidence/` are read again with `device:price --write` once the module is listed (`--write` writes only to `sdk/octatrack/modules/`).

Earlier runs of the same day, for the record: on C01, whose busiest step trigs all eight sample tracks, both solo picks were refused with CPU FULL, RESONATOR NEEDS +3 %: an effect `frame-costs.json` does not list is charged 3 % when it wakes, on a reserve of 101 % + 8 for a pattern that has not played, against the 110 % line. Once `first` = 0 is listed, that charge goes. Step 9 first failed because `device:price` ignored `MODWERK_DEV_SOCKET`, and a rerun stopped at step 7 because the previous soak's CCs had edited the Part (both reported with their fix in the tooling pull request).

**Rebuild `2a622a8f5`, package `16600fb3681f`** (the COLUN switch's words, NOTE / COLUN; the DSP code is the same 1,511 words): the same command, 427 s, steps 1 to 10 passed. Step 7: self-test passed (CPU peak 54.8 %, longest frame 396 us); alone on FX2 of T1 and T5 admitted in 118 and 135 ms (peaks 415 and 495 per mille); all eight at once while playing admitted (CPU 56.9 %, core peaks 722 and 755 per mille); 12 of 12 Part switches. Step 8: 2,400 operations, passed. Step 9: frame interrupt +0 at rest and +0.1 in use, CPU meter +0.1 and -0.3; curve -2.5, +0.1, -1.9, -1.8, so rest 0, first 0.1, each 0; admitted on the empty (39.7 %) and the medium pattern (90.0 %), no dropped render, no stall. Step 10: the inventory as at the start.

The DSP columns scatter between single 8-s readings: the two runs read +3.0 / +6.8 (at rest / in use) and -7.6 / +0.4 points on the instance's core for the same DSP code. One reading does not give the DSP cost; dsp_host's 250.8 executed instructions a sample at worst does, and the listing's `device:price --write` should take several readings.

### By hand, in a 30-minute trial of `bcdf3d49b012`

The trial ended with the verdict "no crash, stall, freeze or skipped track logged during the trial" and rolled back; the inventory was empty after it.

- **Screens.** Chosen by the README's steps (FUNC + FX1, LEVEL to Resonator, YES). The main page reads PTCH, CHRD, DCAY / TONE, GAIN, MIX as the README says; stepped knobs show their words (CHRD MAJ, TYPE STRNG, VOIC 3, SCALE OFF). The COLUN switch drew OFF / ON in place of its name: it is the mode select, which names itself with its value, so `2a622a8f5` relabels it NOTE / COLUN, and in a trial of `16600fb3681f` the switch read NOTE, and COLUN when turned on. The chooser lists the draft as "Resonator", in mixed case; to check on the listed build.
- **MAIN over USB.** 15 s of C04 with Resonator on T2 FX1, recorded on Windows (`sounddevice`, WDM-KS): peaks -14.6 and -13.7 dBFS, no run of exact zeros inside sound, no 16-64-sample block played twice. CUE was not recorded: Windows opened the Octatrack's input only as two channels (WASAPI's 20-channel input refused the format).
- **DSP frame gap** 395-418 us after every case below (normal 380-420).

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Alone on FX2 of T1 and of T5 (both DSP cores) | its code and 89 state words on either core | step 7 | pass |
| Eight at once while playing | eight 1,511-word copies and their DSP load | step 7 | pass: all admitted, CPU 57.3 % |
| FX1 and FX2 of one track (T2) | two state blocks side by side | picked, played 5 s, `health` | pass |
| DCAY, GAIN and MIX at 127, four voices, a second Resonator on FX2 | the loudest ring and the soft clip | played 10 s, MAIN recorded | pass: peaks -4.1 / -3.8 dBFS (the clip's ceiling), no sample at full scale, no zeros or repeats |
| TYPE, VOIC and COLUN switched while ringing | a voice retunes one partial a block | encoders while playing | pass |
| Pattern changes while ringing: C04, C03, C01 (all eight tracks), C04 | tails across patterns, the busy pattern | PATTERN + TRIG while playing | pass: CPU 57-62 % |
| CHRD locked on steps 5 and 9, PTCH on step 13 | stepped selects locked per trig | grid recording, played 8 s | pass (the locks drew inverted; the sound is the owner's to judge) |
| FILTER picked over a ringing Resonator, then Resonator again | its state starts from zero on a new pick | picks while playing | pass, 116-118 ms each |
| MIX and DCAY locked in scene A, crossfader swept | knobs morph between scenes | fader sweeps while playing | pass |
| Soak with it in use: T2 FX1 and FX2, T4 FX1, T6 FX2; programs C01, C03, C04, C05 on channel 1 | transitions with four instances running | `octatrack-soak.mjs --programs 32,34,35,36 --pc-channel 1`, 120 s | pass: 2,400 operations, 252 pattern changes (124 a minute), CPU at most 75.2 % |
| The trial ends | the rollback with instances on four slots, and while one rings | the 1,800 s trial of `bcdf3d49b012` expired (stopped, four slots); a 150 s trial of `16600fb3681f` expired while C04 played with DCAY at 127 on T2 | pass: both rolled back with a clean verdict, the inventory empty and the slots NONE. The rollback stopped the transport |
| LFO on MIX, DCAY and TONE | modulation of continuous knobs | | not run: assigning an LFO by remote keys was not verified on screen |
| MIX 0 bit-exact on the unit | passthrough | | not run on the unit: MAIN carries every track; verify.py proves it in dsp_host |
| Beside Analog BD | DSP space on a card build | | not run: a card build; over USB step 7's admission covers it |
| MKI | | | not run: no MKI here |

Left for the owner at the unit: how it sounds and plays (chords, bodies, Colundi, TONE), the locked chords and the scenes by ear, two instances with different settings, MIDI, and a Part save and reload, a project save and reload, and the Keep with a power cycle: what survives.

### Release run: device:qualify, 24 November 2026

`npm run device:qualify -- --keeps-ok public/octatrack-modules/resonator/0.1.0-experimental.mwrm` on the same unit, twin and scene: the release package, SHA-256 `16600fb3681f45e8c2708f4f69da1befe24df696b5e0c4f868bd0eb891eb0fb5`, which `npm run octatrack:module-packages` rebuilt byte for byte from the listed source, so every unit result above is on these exact bytes. Each install and removal Kept. Alone on FX2 of T1 and T5 admitted in 120 and 119 ms (peaks 415 and 495 per mille of a frame); all eight at once while playing admitted (CPU 55.5 %, core peaks 722 and 762 per mille); 12 of 12 Part switches; passed, no failures.

The owner's kept set was read first from a RAM boot of the flashed image `e11525835106699a` (0.8): Tape Echo 0.1.9, Air Chorus 0.1.3, Grain 0.1.3 and Analog BD 0.1.7. After the run the flashed image was RAM-booted again and each of those packages Kept with `device.mjs try --accept`; a further RAM boot of it loaded the same four from the card.

The owner waived the hands-on stage (step 12) for this version on 24 November 2026: "can we release it now? I don't need the handson trial". Listening, a Part and project save and reload, and a power cycle with it kept were therefore not run by hand.

## Stock flows

The module patches no stock code and claims no keys or screens. The effect chooser, parameter locks, scenes and Part switches ran on the unit (above); Part and project saves are the owner's stage.

## Render gate (verify.py)

`python3 sdk/octatrack/modules/resonator/verify.py`, all passing:

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
| Full-scale 440 Hz sine on a STRNG voice at 440 Hz, GAIN and DCAY at 127 | peaks at 2/3 FS (the soft clip's ceiling), +0 LSB |
| The soft clip's aliasing: fx:audit's 9.1 kHz tone at -1 dBFS, GAIN 127, DCAY 0, the rest at the dearest setting; every folded harmonic to the fundamental, worse channel | -47.1 dBc (gate: -45; -21.3 with GAIN reaching +24 dB) |
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

At GAIN 127, three voices, the same drums: GAIN now tops out at +12 dB (GAIN/32) instead of +24 dB ((GAIN/128)^2 x 16), so the share of samples at the ceiling, with the input gain of this commit's predecessor / now:

| DCAY | 0 | 32 | 64 | 96 | 127 |
|---|---|---|---|---|---|
| at the ceiling, GAIN to +24 dB | 34.3 % | 27.1 % | 31.2 % | 75.4 % | 84.8 % |
| at the ceiling, GAIN to +12 dB | 14.6 % | 10.8 % | 10.4 % | 19.5 % | 43.7 % |
| noise, the ring to the dry | +6.6 / +4.3 dB | +6.6 / +4.4 | +6.7 / +4.4 | +6.7 / +4.6 | +6.7 / +4.5 |

(The noise row: +24 / +12 dB GAIN; the noise ring is soft-clipped at both, so it rises only 2 dB.)

The input gain went from (1 - r)^0.75 / 4 to 0.157 (1 - r)^0.45 with up to 2 dB less below DCAY 32. On noise the ring now sits 3.7-4.1 dB under the dry at every DCAY with three voices (it fell by 18 dB across DCAY before); one voice is about 4 dB quieter, as its eight partials share one voice's energy. Not level with the dry: a ring that loud drove these drums (peaks near -1 dBFS) through the soft clip, whose ceiling is -3.5 dBFS, on 4.1 % of samples at DCAY 0 (0.167 (1 - r)^0.45, noise -1.6 to -3.6 dB) and 5.2 % with (1 - r)^0.5 / 4; 0.6 kept the drums cooler but let noise fall 10 dB across DCAY. The drum ring now runs 2.3 % / 1.7 % / 0.5 % into the ceiling at DCAY 0 / 32 / 64 with three voices at GAIN 32, none from 96. At GAIN 127, 12 dB hotter than the dry's level, hot drums still reach the clip (table above).

### MIX

The guide's check, `compare` on the plan's noise render at MIX 0, 32, 64, 96, 127, level step to step:

| setting | before | now |
|---|---|---|
| default (DCAY 64, GAIN 32, three STRNG voices) | -4.94, -6.68, -7.99, -1.85 dB | -2.25, -1.63, -0.62, -0.10 dB |
| dearest (see below) | -4.95, -6.83, -9.56, -3.63 dB | -4.26, -4.77, -3.09, -0.49 dB |

At the dearest setting the ring is the dry's level plus GAIN 127's +12 dB, soft-clipped, about 3-4 dB under the dry on this noise: the dry's fall outruns the ring's rise until MIX 96. With GAIN reaching +24 dB the steps were -0.08, -0.36, -0.20, -0.06 dB. The default setting is the guide's check and passes.

### fx:audit

`npm run fx:audit` (plan `--tail 20`), each signal rendered in dsp_host through this source at the manifest's dearest setting (PTCH 60, CHRD MAJ7, DCAY 127, TONE 127, GAIN 127, MIX 127, COLUN on, TYPE BELL, four voices):

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
|---|---|---|---|---|---|---|---|
| tone-1100hz-12db | -35.1 | -85.7 | -22.4 | -15.3 | -125.8 | 0 | FAIL |
| tone-1100hz-1db | -24.1 | -69.8 | -22.4 | -15.3 | -107.3 | 0 | FAIL |
| tone-2701hz-12db | -37.7 | -87.8 | -87.2 | -12.3 | -119.5 | 0 | ok |
| tone-2701hz-1db | -26.7 | -75.1 | -88.8 | -12.3 | -117.4 | 0 | ok |
| tone-5301hz-12db | -41.3 | -90.3 | -71.3 | -15.7 | -122.2 | 0 | ok |
| tone-5301hz-1db | -30.3 | -82.2 | -71.5 | -15.7 | -108.4 | 0 | ok |
| tone-9102hz-12db | -44.9 | -95.0 | -84.5 | -14.6 | -114.8 | 0 | ok |
| tone-9102hz-1db | -33.9 | -102.5 | -90.9 | -14.5 | -108.1 | 0 | ok |
| idle | after the input stops: digital silence | | | | | | OK |

The 1.1 kHz "aliasing" is the eight partials' ring landing on fold-back bins (the same at -12 and -1 dBFS, which a linear ring does and a nonlinearity does not; every earlier version measures -22.4 to -22.7 dBc). With GAIN reaching +24 dB the clip's harmonics reached -45.7 dBc on the -1 dBFS 1.1 kHz tone; at +12 dB, -69.8 dBc. The plan needs `--tail 20`: with 12 s a ten-second ring at GAIN's top had not finished.

The same with DCAY 0, so only the soft clip is left (plan `--tail 12`), GAIN reaching +12 dB: every tone ok (harmonics -49.7 / -26.6 dBc at 1.1 kHz, -55.0 / -32.5 at 2.7, -62.1 / -39.9 at 5.3, -117.7 / -126.7 at 9.1; aliasing <-140 / <-140, -102.2 / -122.5, <-140 / <-140, -69.2 dBc at -12 / -1 dBFS) except the 9.1 kHz tone at -1 dBFS: -47.1 dBc, the cubic's third harmonic (27.3 kHz) folded to 16.8 kHz. With GAIN reaching +24 dB it was -21.3 dBc there and 1.1 / 2.7 / 5.3 kHz at -1 dBFS failed too (-52.4 / -41.6 / -29.9 dBc), as the tone ran into the hard limit before the cubic. The tone enters the clip at about 0.9 of its range now, inside the cubic: a soft clip that compresses this much makes this much third harmonic, and at 9.1 kHz it lands above Nyquist. Simulated for the case: first-order antiderivative anti-aliasing -33 dBc at the cost of a two-tap average on the whole ring (-0.6 dB at 5.3 kHz, -1.9 dB at 9.1); 2x oversampling with 23-tap half-bands -46 dBc at about 50 instructions a sample. Neither is used.

`compare` on the noise render, each knob at its two ends with the rest at the dearest setting: every knob differs (PTCH +29.6 dB, CHRD -7.6 dB, DCAY -3.8 dB, TONE -12.3 dB, GAIN from silence, MIX -0.7 dB, COLUN +3.1 dB, TYPE -5.8 dB, VOIC -1.0 dB) except SCALE, identical because COLUN is on and SCALE works with COLUN off only.

## Performance

dsp_host meter, executed instructions/sample at the worst block, GAIN at 127, nine settings each with a trig split at frame 1, 7 and 15 and without: 250.8 at worst (four STRNG voices of 5TH around note 118 in C MAJ, DCAY 126, split), 249.6 without a split; four BELL voices of MAJ7 snapped to Colundi 248.7 and 247.5; one BAR voice 246.0 and 244.8. The constant-power mix costs four instructions a sample less than the old crossfade, MIX and TONE are set once per block. Before this table and mix: 255.1 and 252.1. The sample loop runs eight partials at 18 cycles each; one partial is retuned per block. The module is 844 words of code and a 667-word P table (1511 DSP words; 1851 before the short table), 89 state words. The Colundi search walks the table in address registers; a note's theta, the decay and TONE cost more per block than a lookup did. For scale only, #2047 quotes SPRING REV at 257.50 instructions/sample whole and 314.19 in its split sweep, measured in a different harness; the matched stock benchmark and the unit's CPU price are still open.

### Worst case against stock (evidence/performance.json)

`npm run perf:audit -- check sdk/octatrack/modules/resonator/evidence/performance.json` passes; the record is stamped on the source it was measured on.

- **Static bound:** `tools/build/cycle_count.py` counts the per-sample loop `rzframe` at 225 cycles a sample, straight-line, no branch or nested loop. Per block: 16 x 225 for the loop, plus every code word outside it charged once per call, the subroutines a main call enters twice (`rzsin`, `rzsnap`, `rzlerp`) charged twice, the seven-step Colundi search charged seven times and 4 cycles for each of its 51 branches, calls, returns and `do`s: 959 per call. Two calls per block cover a trig split: 16 x 225 + 2 x 959 = 5,518 cycles a block, 22,072 for four instances on a core, against a budget of 49,920. Every knob end and branch is inside the bound: COLUN, VOIC 1-4, every TYPE and SCALE are branches of the same per-call path.
- **Measured, matched against stock:** `benchmark_reverbs.run` as `benchmark_stock_dsp.py` runs it (one instance per core at positions 0 and 4, 4,096 blocks of 16 frames, the null stub's peak subtracted), on a private native image built from this source by `build_bus` (Resonator's 1,511 words in the space of SPRING REV and PLATE REV), through the stock benchmark's cases: fixed knobs, its moving-knob pattern and a trig split at every position 1-15, plus the dearest settings and the corners of COLUN, VOIC, TYPE, SCALE and PTCH (0, 118, 127), with and without a split: 106 cases. Executed instructions in dsp_host, not chip cycles; no stalls modelled.

| Effect | Worst, with trig splits | Worst, unsplit |
|---|---|---|
| Resonator | 247.81 (moving knobs, split at 1) | 246.62 |
| SPRING REV (the reference) | 314.19 | 257.50 |
| DARK REV | 242.38 | 193.25 |
| DJ EQ (the dearest stock effect) | 330.94 | 293.38 |

The stock figures reproduce `benchmark_stock_dsp.py` on the owner's OS 1.40C exactly (unsplit). Resonator is 0.79 of SPRING REV's worst. Its own gate (`verify.py`'s synthetic image, nine settings, no null subtraction) reads 250.8 at worst.
- **Stress:** four Resonators per core behind DJ EQ, 2 s in dsp_host: no hang, no clobber, no write outside its own block (peak 2,308.6 instructions a sample per core for the whole chain).

## Memory

From the native card build (`build_bus` on OS 1.40C, Resonator in the space of SPRING REV and PLATE REV: 1,511 of 1,657 words on each payload, 146 free), reconciled with the build map; `tests.qualification.memory` lists the same regions.

| Region | Space | Size | Scope |
|---|---|---|---|
| Program payload A: 667-word table and 844-word code | DSP P | 1,511 words (4,533 bytes) | once per core |
| Program payload B: the same | DSP P | 1,511 words (4,533 bytes) | once per core |
| Used and initialized X state, r7 + 0..0x58 | DSP X | 89 words (267 bytes) | per instance |
| The rest of the 256-word X block an FX instance gets | DSP X | 167 words (501 bytes) | per instance, unused |
| System stack: three entries of two words on each core (a `bsr` into the Colundi search and its `do`) | DSP X | 12 words (36 bytes) | shared |
| Cloned FX descriptor (416 bytes), five label formatters for CHRD, COLUN, TYPE, VOIC and SCALE (1,372 bytes) and the wide-dial helper (116 bytes) | ColdFire flash | 1,904 bytes | shared |

768 bytes per instance, 11,006 shared, 17,150 for the eight instances the slots allow. No allocator buffer, no Y memory, no scratch outside r7, no ColdFire code per frame. The USB package (764 bytes of code and data, no bss) replaces the card build's ColdFire share and is not counted on top. DSP sizes are logical 24-bit words.
