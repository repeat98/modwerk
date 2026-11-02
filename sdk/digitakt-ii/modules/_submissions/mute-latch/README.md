# Mute Latch — Digitakt II

A Digitakt II mod by @crisp909. Version 0.1.0-experimental, for OS 1.17. Tried in an emulator only, not on a unit.

## Overview

PREP MUTES (in Mute Mode, hold FUNC and press the TRIG keys of the tracks to switch) normally changes those tracks the moment FUNC is let go. Mute Latch adds one gesture: with tracks chosen, press PERFORM while FUNC is still held, and the choice is parked instead. Let go of every key and the tracks switch when the sequencer next reaches the pattern's first step, so both hands are free for a synth or effects until then. Without that PERFORM press, PREP MUTES works exactly as before.

- Parks the choice while the sequencer plays; STOP drops it.
- Follows the instrument's own step position and pattern length: no clock of its own.
- Patches no stock site and takes no sequencer hook.

## Controls

There are no knobs and no SETTINGS rows.

| Gesture | What it does |
| --- | --- |
| Mute Mode, FUNC held (PREP MUTES open), TRIG keys, then PERFORM | The chosen tracks are parked. the stock PERFORM view does not open. |
| Let go of the TRIG keys, PERFORM and FUNC | Nothing happens now. The parked tracks switch at the next first step. |
| FUNC held, PERFORM with nothing chosen | Cancels what is parked. |
| STOP | Drops everything still parked. |

Parked tracks toggle their mute state, as PREP MUTES does: a track that is muted becomes audible. Choosing a track again before pressing PERFORM takes it back out; pressing PERFORM a second time with a new choice parks that too.

## Usage

### Where to find it

Location: Mute Mode (FUNC+TRK), PREP MUTES (FUNC held).

1. Install a build that contains Mute Latch for the Digitakt II on OS 1.17.
2. Start the sequencer with PLAY and enter Mute Mode with FUNC+TRK.
3. Hold FUNC and press the TRIG keys of the tracks to switch, then press PERFORM.
4. Let go of everything. The tracks switch when the pattern comes round to its first step.

### Quick tutorial: mute the drums for the next pass

1. Play a pattern that loops and enter Mute Mode.
2. Hold FUNC, press TRIG 1 and TRIG 2, the tracks that carry the drums, then press PERFORM.
3. Let go of every key and move to your synth. The drums keep playing.
4. At the pattern's first step the two tracks switch. Repeat the gesture to bring them back in.

## Compatibility and limitations

- Digitakt II, OS 1.17 only.
- Works while the sequencer plays. Stopped, PERFORM keeps its stock behaviour and PREP MUTES its stock behaviour.
- The switch happens on the first UI tick after the wrap (the core ticks at about 30 Hz), so it can land up to about 35 ms after the first step starts. It is not sample-accurate; that would need a sequencer hook in the base.
- With Scale per track, the longest track's wrap is taken as the pattern's end.
- The parked choice is kept in RAM only. It is not saved with the project and does not survive a power cycle.
- After PERFORM the PREP MUTES screen shows no chosen tracks, because the stock choice is cleared; the parked set is not drawn.
- A change of pattern while tracks are parked applies them at the new pattern's first step. This is the intended reading, not yet observed.

### Stock flows this module touches

| What changes | For whom | Why | Opt out |
| --- | --- | --- | --- |
| FUNC+PERFORM opens a stock view. While PREP MUTES is open, tracks are chosen and the pattern plays, the PERFORM key press goes to the module instead, so that stock view is not available then; the stock PERFORM view does not open. A PERFORM press with nothing chosen and nothing parked, anywhere else, or while stopped, is left to the stock OS. | Anyone who taps tempo with FUNC held inside a PREP MUTES session with tracks chosen while playing. | Tap tempo itself is the key the gesture needs: FUNC and the TRIG keys are already taken inside PREP MUTES. | Let go of FUNC first, or choose no tracks. There is no SETTINGS switch yet. |

## How it works

The module uses two core hooks. In `ev_key` it reads the key event's code; for PERFORM, while the PREP MUTES view is on top with its session open and the sequencer plays, it moves the view's 16-bit choice into its own parked set, clears the view's mask (so letting go of FUNC applies nothing) and takes the event. In `ev_tick` (the UI task, about 30 Hz) it follows the master track's step position and, when it falls (the pattern wrapped), writes the parked set into the view's mask and calls the stock routine that applies it. Stock locations of OS 1.17 are named once in `build.json`: the vtable of the PREP MUTES view, the apply routine, the key-down test, the Brain, and three words of sequencer state (the playing flag, the pattern pointer and each track's step position).

These locations were read from the OS 1.17 image with a static disassembler and then observed in an emulator, not on a unit.

## Tests and measurements

The Modwerk evidence tier is `none`. [TESTING.md](TESTING.md) lists what was and was not checked. Memory and load are not measured.

## New in this build

- The gesture is on PERFORM, next to FUNC.
- Pressing PERFORM shows "MUTES ARMED" in the header (the stock header message); with nothing chosen it shows "ARM CANCELED".
- Parked tracks keep their TRIG LEDs in the PREP MUTES chosen-track state until the mutes switch. The module patches the key-LED frame site 0x400311a2 (declared in `platform.claims`); Elekloader core 1.1 also hooks that site, so this build needs core 1.0 until the module moves to the core hook.
