# Rave Stab

## Overview

SY RAVE, a six-voice digital chord machine for stabs on the Analog Rytm MKII (OS 1.74), by @chevyone. Version 0.1.0-experimental: a prototype, played by its author on a MKII.

Six band-limited oscillators play a chord. The chord and its voicing are taken at each hit, so a pattern can lock a progression step by step, and the trig's note transposes the whole chord. DET spreads the voices against each other, WAV runs from saw through square to a narrow pulse, and PCH starts the chord off its pitch at the hit and drops or scoops it in, the zap of a rave stab. There is no filter in the machine: the voice's stream goes through the track's own analog filter, AMP and OVR, as Analog BD's does, so the FLTR page and its envelope make the stab's sweep.

It began as an accident: HH Alloy's CLSD metal set, tuned two octaves down with a long decay, played a chord. That chord is CHD 0, EURK, with its own detuning.

## Controls

SYNTH page:

| A TUN | B PCH | C CHD | D STR |
| --- | --- | --- | --- |
| **E WAV** | **F VOI** | **G DET** | **H LEV** |


- **TUN**, Tune: centred at 64, 3/8 of a semitone a step, ±24 semitones. The trig's note adds to it.
- **Register** (−1, −2, 0, +1 octave against the note): tap the TUN encoder to step it. Its label shows it (T-1, T-2, T 0, T+1), and it saves with the sound. A new sound starts at T-1, so note 60 plays a chord on C3 (130.8 Hz).
- **STR**, Strum: 0 opens all six notes together. Turned up, the lowest note opens first and the rest follow upwards in pitch order, whatever the voicing. The gap between two notes grows with the square of the turn: barely there up to about 10, 25 ms a note at 64, 100 ms a note at 127 (half a second for the chord). A waiting note is silent and fades in over 0.7 ms; over a chord still ringing it fades out first, so a strum never clicks. Taken at the hit.
- **The level** holds while the chord rings: the AMP page's envelope gives the stab its length.
- **CHD**, Chord: the dial in 13 equal zones of about 10 values (0-9 EURK, 10-19 MIN, … 119-127 OCT), so it turns end to end; the knob shows the chord's name. Six notes each, from the root up:

  | Zone | Chord | Notes (semitones) |
  | --- | --- | --- |
  | 0-9 | EURK | 0, 6.1, 9.16, 13.64, 16.64, 20.08 (HH Alloy's CLSD, as found) |
  | 10-19 | MIN | 0, 3, 7, 12, 15, 19 |
  | 20-29 | MIN7 | 0, 3, 7, 10, 12, 15 |
  | 30-39 | MIN9 | 0, 3, 7, 10, 14, 19 |
  | 40-49 | MIN11 (shown MI11) | 0, 3, 7, 10, 14, 17 |
  | 50-59 | MAJ | 0, 4, 7, 12, 16, 19 |
  | 60-68 | MAJ7 | 0, 4, 7, 11, 12, 16 |
  | 69-78 | DOM7 | 0, 4, 7, 10, 12, 16 |
  | 79-88 | SUS2 | 0, 2, 7, 12, 14, 19 |
  | 89-98 | SUS4 | 0, 5, 7, 12, 17, 19 |
  | 99-108 | 5TH | 0, 7, 12, 19, 24, 31 |
  | 109-118 | DIM | 0, 3, 6, 9, 12, 15 |
  | 119-127 | OCT | 0, 0, 12, 12, 24, 24 |

- **VOI**, Voicing: the dial in 9 equal zones of about 14 values (0-14, 15-28, 29-42, 43-56, 57-71, 72-85, 86-99, 100-113, 114-127), its name on the knob (STD, R-1, R5-1, DRP2, DRP3, D2+4, OPEN, SUB, WIDE). In turn: as listed; the root an octave down; the root and the fifth an octave down; drop 2 (the second highest note down an octave); drop 3 (the third highest); drop 2 and 4; open (the root down, the third and fifth notes up); sub (the root two octaves down); wide (the notes up 0, 1 and 2 octaves in turn). Every voicing moves notes down or opens them out and keeps the root lowest (a note dropped under it takes it down too), so a minor chord stays minor.
- **DET**, Detune: 0 plays every note exactly; up to 127 the voices spread up to 30 cents against each other (the root stays), for the beating of several analog oscillators.
- **WAV**, Wave: 0 saw, 64 square, 127 a 12 % pulse; saw to square is a crossfade at an even loudness, square to pulse narrows the width.
- **PCH**, Pitch drop: centred, 0 at 64 plays the chord on its pitch from the start. Above, the hit starts the chord up to two octaves higher (at 127) and it falls back; below, up to two octaves lower (at 0) and it rises. The fall is quick (a 20 ms time constant, on pitch within about 150 ms) and the amount grows with the square of the turn, so the turns near the centre give a slight bend. It is taken at the hit.
- **LEV**, Level: the voice's level into the filter, as every Rytm machine has.

**Velocity** plays the chord louder (127 at full, 30 at 0.37).

**Locks and turns.** CHD, VOI, STR, PCH and the velocity are taken when the hit starts and hold for the hit, so each locked step plays its own chord and a ringing chord never changes under it. TUN, DET and WAV follow a turn or a lock while the chord rings, gliding over about 5 ms.

## Usage

The BD, SD and BT tracks' machine lists, in the SY section (FUNC + SRC).

### Quick tutorial

1. Select the BD track, press FUNC + SRC, choose SY RAVE and press YES. Play the pad: the EURK chord.
2. On the FLTR page close the frequency, raise the resonance a little and give the filter envelope a short decay: the classic stab. Shorten the AMP's decay for a tighter one.
3. Turn CHD to MI11 and DET to 40 for a wide, beating stab; WAV to 0 for a saw; PCH to +40 for the zap; STR to 40 for a quick strum.
4. In CHROMATIC mode play notes: the whole chord transposes.
5. Lock CHD and VOI on a few steps (hold the trig, turn the knob) for a progression on one track.

### Changes to stock flows

None: SY RAVE is a machine of its own in the machine list. Its CHD and VOI knobs show names, through the base's knob-text table, for its own slot only. Choosing another machine, kits, sound locks and saving work as for a stock machine; the register is stored in the sound's mod storage.

## Compatibility and limitations

- Built for OS 1.74 on the Modwerk base's digital voices (the voices variant; send-bus when the set also holds a send effect). It takes machine slot 39 and nothing else: no stock site, no key gesture.
- The register is not a parameter a lock or the LFO can reach; a sound lock carries it.
- CHD and VOI turn through 0..127 like any knob: about ten clicks a chord and fourteen a voicing. A knob that steps one name a click needs a stepped dial in the base, which it does not have yet.
- STR sits on sound index 11, where stock machines have DEC, and answers its MIDI CC: a sound saved before 0.1.0's STR strums by its old DEC value (127 the widest strum); set STR to 0 for none.
- One voice costs about 6.8 % of the audio block on a MKII (7.95 % at most); three ringing together about a fifth.

## Tests and measurements

Host tests of the DSP, and the author's tests on a MKII: [TESTING.md](TESTING.md).

## Authorship and licences

Original work by chevyone, GPL-3.0-or-later ([LICENSE](LICENSE)). The chords, curves and code are this module's own (`tools/gen_tables.py` writes the tables); the build carries no Elektron code or tables, and no recording's samples.

## Screens and audio

No screenshots or audio yet.
