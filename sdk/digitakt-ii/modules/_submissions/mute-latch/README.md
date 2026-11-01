# Mute Latch — Digitakt II

A Digitakt II mod by @crisp909. Version 0.1.0-experimental, for OS 1.17. Not tested yet.

## Overview

PREP MUTES (hold FUNC, press the TRIG keys of the tracks to switch) normally changes those tracks the moment FUNC is let go. Mute Latch adds one gesture: hold TEMPO while you choose the tracks, and the choice is parked instead. Let go of every key and the tracks switch when the sequencer next reaches the pattern's first step, so both hands are free for a synth or effects until then. Without TEMPO held, PREP MUTES works exactly as before.

- Parks the choice while the sequencer plays; STOP drops it.
- Follows the instrument's own step position and pattern length: no clock of its own.
- Patches no stock site and takes no sequencer hook.

## Controls

There are no knobs and no SETTINGS rows.

| Gesture | What it does |
| --- | --- |
| FUNC held (PREP MUTES open), TEMPO held, TRIG key | The track joins the parked choice; pressing it again takes it back out. |
| Let go of TEMPO, the TRIG keys and FUNC | Nothing happens now. The parked tracks switch at the next first step. |
| STOP | Drops everything still parked. |

Parked tracks toggle their mute state, as PREP MUTES does: a track that is muted becomes audible.

## Usage

### Where to find it

Location: PREP MUTES, the page FUNC opens when the permanent mute mode is on.

1. Install a build that contains Mute Latch for the Digitakt II on OS 1.17.
2. Start the sequencer with PLAY.
3. Hold FUNC, then hold TEMPO and press the TRIG keys of the tracks to switch.
4. Let go of everything. The tracks switch when the pattern comes round to its first step.

### Quick tutorial: mute the drums for the next pass

1. Play a pattern that loops.
2. Hold FUNC, hold TEMPO and press TRIG 1 and TRIG 2, the tracks that carry the drums.
3. Let go of TRIG 1, TRIG 2, TEMPO and FUNC, then move to your synth. The drums keep playing.
4. At the pattern's first step the two tracks switch. Repeat the gesture to bring them back in.

## Compatibility and limitations

- Digitakt II, OS 1.17 only.
- Works while the sequencer plays. Stopped, PREP MUTES keeps its stock behaviour.
- The switch happens on the first UI tick after the wrap (the core ticks at about 30 Hz), so it can land up to about 35 ms after the first step starts. It is not sample-accurate; that would need a sequencer hook in the base.
- With Scale per track, the longest track's wrap is taken as the pattern's end.
- The parked choice is kept in RAM only. It is not saved with the project and does not survive a power cycle.
- The stock result of FUNC+TEMPO is not checked yet, and the module does not consume the key.
- A change of pattern while tracks are parked applies them at the new pattern's first step. This is the intended reading, not yet observed.

### Stock flows this module touches

| What changes | For whom | Why | Opt out |
| --- | --- | --- | --- |
| In PREP MUTES, a TRIG key pressed while TEMPO is held joins a parked choice instead of the stock choice. | Anyone who holds TEMPO inside PREP MUTES. | The mutes must wait for the pattern's first step. | Do not hold TEMPO; nothing else changes. There is no SETTINGS switch yet. |

## How it works

The module runs in the core's `ev_tick` (the UI task, about 30 Hz). Stock locations of OS 1.17 are named once in `build.json`: the vtable of the PREP MUTES view, the routine that applies its choice, the key-down query, the Brain, and three words of sequencer state (the playing flag, the pattern pointer and each track's step position). While the PREP MUTES view is on top, a session is open and TEMPO is held, the view's 16-bit choice is moved into the module's parked set and cleared, so letting go of FUNC applies nothing. When the longest track's step position falls to a lower value (it wrapped), the parked set is written back and the stock routine applies it.

These locations were read from the OS 1.17 image with a static disassembler and have not been observed running.

## Tests and measurements

The Modwerk evidence tier is `none`. [TESTING.md](TESTING.md) lists what was and was not checked. Memory and load are not measured.
