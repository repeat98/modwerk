# QPERF

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.2.0-experimental. See [TESTING.md](TESTING.md) for what ran on a unit.

Set performance locks from the QPER key, much faster than one performance at a time.

## Controls

QPER links one performance at a time. Hold QPER and press a pad or trig key: the link moves there. Press the linked one to unlink it. With QPER still held and one performance linked:

| Gesture | What it does |
| --- | --- |
| Turn a knob | Edits the linked performance's lock, as holding a performance pad does: the knob inverts and shows the offset. |
| PLAY | CLEAR PERFORMANCE, with stock's clear. PLAY again: UNDO CLEAR. |
| YES | Writes what you hear into the kit and removes those locks. The sound holds at any position. Muted, it still applies, so the sound moves by what the knob would add. At knob zero nothing is added and the locks stay. |
| RECORD | COPY PERFORMANCE n. |
| STOP | PASTE PERFORMANCE onto the linked one. STOP again: UNDO PASTE. |

FUNC + QPER (mute) is stock's.

## Recording performance moves

Stock's LIVE RECORDING records knob turns but no performance moves. With this mod, while LIVE RECORDING plays, every performance you move goes into a lane: the pads in PERF mode (several at once), the QPER knob on the linked performance while it turns, and performance CCs from MIDI. The lane plays back on every pass, 8 points a step, and you hear it through the performances themselves, so a lock you change later changes the recorded move too.

A pass records only the performances you touch. The others keep playing what they recorded. Letting go of a pad records its return to zero.

| Gesture | What it does |
| --- | --- |
| QPER + YES, LIVE RECORDING on | Writes the lane into the pattern as trigless parameter locks, one per step, and empties the lane. Shows PERF MOVES APPLIED. |
| QPER + NO | Empties the lane: PERF MOVES CLEARED. NO again: UNDO CLEAR. |

With LIVE RECORDING off, QPER + YES writes the linked performance into the kit, as above.

- **The lane lives in RAM.** Changing pattern, loading a project or powering off drops it. Only QPER + YES keeps the moves, in the pattern.
- **A move held still.** A pad held down counts as moving, so it records and overrides the lane. The QPER knob counts as moving only while it turns past a couple of steps: a resting knob wobbles, and that alone records nothing.
- **It loops with the track.** The lane loops with the pattern's length, and with a length per track (SCALE per track) with the selected track's length, whatever the master length. 64 steps at most, also when the length is INF.
- **The written locks.** Each step gets the lane's first recorded value in that step, added to the step's own lock or the kit's value, so a move shorter than a step still lands. The step after a move ends gets the parameter's own value back. A step with no trig becomes a lock trig, as stock's live recording does. A step whose trig has a condition takes the move only on the passes where the trig plays, as any lock on it does.
- **Tracks with their own length.** With a length per track, QPER + YES gives each track the lane where it plays: a shorter track takes it wrapped onto its own steps, the later ones winning, as stock's live recording wraps knob locks, and a longer one takes it repeated. A track at another speed than the selected track gets none.
- **72 lock rows a pattern.** Stock keeps one row for each locked parameter of each track, two for a fine one, and uses 71. If the moves need more, QPER + YES shows LOCK MEM FULL! and writes nothing.

These work on the sound pages and in PERF, SCNE, MUTE and CHRO. Press QPER in a menu, dialog, list, the SAMPLER or TEMPO and everything stays stock's, for as long as you hold it. A menu opened with QPER held keeps its keys too. The one exception is linking: where stock lets a pad or trig link over a screen, such as the GLOBAL menu, it moves the one link here too.

Stock draws every message. YES shows PERFORMANCE n APPLIED, or NOTHING TO APPLY when no value would change. A key or turn with nothing linked shows NO PERFORMANCE LINKED, with several linked MORE THAN ONE LINKED, and with no room LOCK MEM FULL!.

## Things to know

- **Kits with several links.** A kit keeps the links it was saved with, and they all play. This is the only way to have several. YES, PLAY, RECORD, STOP and a knob edit act on one performance, so they show MORE THAN ONE LINKED and change nothing until you press a pad or trig with QPER held. That press leaves one link, and saving the kit stores it.
- **The sound follows the link.** An unlinked performance stops adding, and a newly linked one takes the knob's position.
- **48 locks a kit.** All 12 performances share them. A new parameter with none left shows LOCK MEM FULL! and writes nothing.
- **Power on.** Stock does not know the QPER knob until it moves, so the amount is 0 and YES adds nothing until then.
- **Locks past a parameter's range.** Stock lets a lock go past what the parameter can hold, here too. YES stops at the limit, so the sound can change.
- **Full QPER is at most 99.6% of a lock.** Stock's knob value is 8 bits, times 128, and the engine's full scale is 32768. YES keeps what plays, so +54 at full reads 53.
- **YES uses up the lock.** Full QPER no longer reaches the old offset, because the part you did not apply is gone. Stock's undo does not bring it back; reloading an unsaved kit does.

## Stock flows changed

- **QPER + pads and trigs** link several performances on stock. With this mod a press moves the one link, and the linked one unlinks it. Why: linked offsets add up, so several made the knob's total and QPER + YES hard to follow.
- **QPER + PLAY** starts the sequencer on stock. With this mod it clears instead. PLAY alone still starts it.
- **QPER + STOP and QPER + RECORD** act as STOP and RECORD on stock. With this mod they paste and copy.
- **QPER + knob** changes the parameter on stock. With this mod it edits locks and leaves the parameter alone.
- **QPER + YES** did nothing visible on stock (rytm-emu, OS 1.74). With LIVE RECORDING on it writes the lane instead of the kit.
- **QPER + NO** empties the lane. What stock does with it was not checked.
- **Performance moves during LIVE RECORDING** are kept and played back by this mod. Stock keeps none.

Kits are not changed by loading them: only a pad or trig press with QPER held changes a kit's links. Remove the mod to get these back.

## Tutorial

1. Hold QPER, press pad 1 to link its performance, and keep holding.
2. Turn FLTR's cutoff up and the resonance a little, and let go of QPER.
3. Sweep the QPER knob. Both moves come in together.
4. When a position sounds right, hold QPER and press YES to keep it in the kit.
5. Hold QPER and press RECORD, press pad 2, then STOP to start another performance from this one.
6. Press PERF, hold RECORD and press PLAY. While the pattern plays, press and squeeze pads 1 and 2. Let go and listen to the next pass.
7. With LIVE RECORDING still on, hold QPER and press YES to write the moves into the pattern.
