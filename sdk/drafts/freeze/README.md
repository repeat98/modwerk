# Freeze

Version 0.1.0 · by @jacobphono · **a draft: not runnable on a unit yet.** The engine and its host tests exist;
the base hook it needs does not ([DELAY_HOOK_PROPOSAL.md](DELAY_HOOK_PROPOSAL.md)). Nothing here has run on an
Octatrack or in `ot_emu`.

## Overview

Freeze is an FX2 effect that holds the last few seconds of a track and plays them back as a slow, low, tape-like
loop that repeats every 1 to 8 of the track's own steps. Odd lengths (3, 5, 7) drift against a 16-step pattern
and come back into line every 48, 80 or 112 steps; two tracks with different lengths run on their own. While it is
not holding, the track passes through bit for bit.

## Controls

| Page | Control | Range, default | What it does |
| --- | --- | --- | --- |
| 1 | STEP | 1-8, 5 | Loop length in track steps. A change lands when the current loop ends. |
| 1 | SPIN | 0.25x-1.0x, 0.5x (64) | Tape speed of the held audio: slower is lower. FUNC+turn stops at 0.25x, 0.5x and 1.0x. A move glides like a motor. |
| 1 | JTR | 0-127, 0 | Slow, bounded tape wander (about 1.2 % of the speed at 127, so the same pitch drift at every SPIN) and a small drift of where each loop starts. The loop length never changes. |
| 1 | POS | 0-127, 0 | Where in the held audio the loop reads: 0 the newest, 127 the oldest. A move scrubs there at up to 1/8 of the tape speed. |
| 1 | GRAB | OFF/HOLD, OFF | HOLD captures at the track's next step; OFF lets go at the next step. Lockable per step. |
| 1 | MIX | 0-127, 127 | How much of the loop replaces the track while holding: 127 loop only. |
| 2 | FADE | 0-127, 20 | Grab and release crossfade, 6 ms to 1.1 s. |
| 2 | SEAM | 0-127, 64 | Length of the crossfade where the loop returns to its start, 1/256 to 1/2 of the loop. |

## How it works

- While not holding, Freeze writes the track's dry signal into the track's stock four-second delay ring (the ring
  stock DELAY uses; it is idle on a track whose FX2 is not DELAY) and leaves the audio untouched.
- GRAB at the next step stops recording: the ring's own frames are written back, so the history survives any
  length of hold. A tape head reads it at SPIN. Every STEP track steps the loop returns to its start through a
  crossfade from the running head into a second head that has been reading the audio just before the start, so the
  audible period is exactly STEP steps (the tests check one cycle against the next and that nothing repeats at half
  the period).
- **Timing is the track's own** ([sequencing.md](../../../docs/module-guides/sequencing.md)): a step is the moment
  the track's sequencer tick (`0x800064f0 + track`) reaches 1, just after the step's trig, so track speed, tempo and
  swing come from the sequencer. The tempo word and the track scale give only the nominal step length used to plan
  the crossfade. There is no clock of Freeze's own. A step is detected per 16-sample block, so a loop start may sit
  up to 0.36 ms off the exact step.
- STOP lets go and fades to dry. A STEP change lands at the end of the current loop; a tempo change from the next
  loop on. PLAY does not restart a loop: Freeze counts steps, not positions in the pattern.
- If the held audio is too short for the loop at the chosen SPIN (slow tempo, slow track speed, 8 steps), SPIN is
  lowered to what fits. GRAB waits until at least 4,096 frames (93 ms) have been recorded since the effect was
  chosen or last released.

## Compatibility and limitations

- **Blocked:** needs the base hook `ev_delay_track` ([proposal](DELAY_HOOK_PROPOSAL.md)). Tape Echo takes the same
  stock site today with its own detours; Freeze does not touch it and does not depend on it.
- FX2 only, like stock DELAY (it uses the track's delay ring). On a track whose FX2 is Freeze, stock DELAY and
  Tape Echo are not on that track's FX2 by definition, so the ring is Freeze's.
- Linear interpolation: at fractional speeds the held audio loses some top end (strongest at 0.5x). Hermite
  interpolation is the planned improvement once CPU is measured.
- The equal-power seam lifts strongly correlated audio (a sustained tone that lines up across the seam) by up to
  2.8 dB in the middle of the seam; uncorrelated material dips 0.24 dB.
- The held loop is runtime state: it is not saved with the project and is gone after a power cycle.
- CPU is not measured. While holding, Freeze reads up to two tape heads and writes the ring back.

## Tests and measurements

Host tests only: see [TESTING.md](TESTING.md). `python3 -B sdk/drafts/freeze/verify.py`.

## Authorship and licences

Original code by jacobphono, written with Claude Code (Anthropic) under the MIT licence in LICENSE. The musical
brief came from a behavioural reference written independently by Codex for this project. The idea of a looper whose
jitter slowly changes the loop comes from a look at a Reaktor ensemble's control descriptions; no Reaktor code,
structure, artwork, samples or names are used. The crossfaded two-head tape loop and smooth-random wander are
long-published, general techniques. No Elektron firmware, code or tables are included.

## Screens and audio

None yet. A synthetic audition render is made with `verify.py --audition <file.wav>`; it is not hardware audio.
