# Resonator

Version 0.1.0-experimental · by [Jannik Aßfalg](https://github.com/repeat98) · a draft, not tested on a unit yet.

## Overview

Four tuned resonant modes that ring at the pitches you choose, excited by the track's own audio. Drums, noise and loops ring at a note, a chord of stacked intervals, or the frequencies of Aleksi Perälä's Colundi sequence. Lock PTCH on trigs and the sequencer plays the resonator.

## Controls

| Page | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Main | PTCH (DEG) | INTV | DCAY | DAMP | GAIN | MIX |
| Setup | TUNE | | | | | |

- **PTCH** 0–127, default 57: the root. In NOTE, a MIDI note (69 = A at 440 Hz). In COLUN, a Colundi degree (78 = 440 Hz, 79 = 441 Hz); the panel names it DEG.
- **INTV** UNI, 1–24, default 7: the step between the four modes, in semitones or Colundi degrees. UNI is one resonance. Modes past 127 stay at 127.
- **DCAY** 0–127, default 64: the ring to -60 dB, 25 ms at 0, about 0.5 s at 64, 10 s at 127.
- **DAMP** 0–127, default 32: shortens the upper modes, each a step more than the one below.
- **GAIN** 0–127, default 32: the ring's level, 0 dB at 32, +24 dB at 127. Loud rings soft-clip at -3.5 dBFS.
- **MIX** 0–127, default 64: 0 is exact passthrough, 127 is only the ring.
- **TUNE** NOTE / COLUN, on the SETUP page: what PTCH and INTV count.

The root and the fourth mode sit in the centre, the second left, the third right. The input is summed to mono.

## Usage

1. Select an audio track that plays a sample.
2. Hold **FUNC** and press **FX1** (or **FX2**). Turn **LEVEL** to RESONATOR and press **YES**.
3. Press **FX1** for the main page; hold **FUNC** and press **FX1** for TUNE.

## Quick tutorial

1. Put RESONATOR on FX1 of a drum loop. The defaults ring a stack of fifths on A under every hit.
2. Set TUNE to COLUN, then lock PTCH on a few trigs (hold a trig, turn PTCH): each hit rings at its own Colundi frequency.
3. Turn DCAY up for long rings, GAIN up for quiet material, INTV to UNI for one clean resonance. MIX 0 brings back the dry track.

## Compatibility and limitations

- A buffer-free insert: FX1 or FX2 on any track, several at once. It patches no stock code and claims no keys or screens.
- A sustained tone at a mode's pitch with long DCAY and high GAIN soft-clips; lower GAIN or DCAY for a clean ring.
- Pitches assume 44.1 kHz.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

Original code by Jannik Aßfalg under the MIT licence in LICENSE. The Colundi sequence, 128 absolute frequencies from 10.8 Hz to 12 kHz, is Aleksi Perälä's ([colundi.net](http://colundi.net/data.php)); the values follow tubbutec's full Scala file of it, rounded back to the published 0.01 Hz. Used with the owner's permission recorded on 23 November 2026. The COLUNDI draft ([#2047](https://github.com/repeat98/modwerk/pull/2047)) measured the first one-mode resonator and its tail-silence failure, which shaped this design.

## How it works

Each mode is a coupled-form resonator: a rotation by the pitch's angle, scaled by the decay radius. Its pitch is exactly the rotation's angle, so a locked pitch or decay jumps without a transient. The state is kept in double precision (a rounded 24-bit word and its signed remainder), so even a ten-second ring decays to digital silence. The input gain follows (1 - r)^0.75, a middle way between keeping drum hits audible and keeping sustained tones from exploding at long decays; the soft clip catches the rest.

## Develop

- Check it: `python3 sdk/drafts/resonator/verify.py` (the render gate) and `npm run module:doctor -- --draft resonator`.
- Hear it: `npm run module:dev -- resonator` builds it and tries it on your unit over USB.
- The tables come from `tables.py`; the DSP is `resonator.asm`. Read the traps in sdk/octabam/AGENTS.md before changing it.
