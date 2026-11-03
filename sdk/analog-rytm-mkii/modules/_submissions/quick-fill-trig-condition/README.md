# Quick Fill Trig Condition

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.1.0-experimental. See [TESTING.md](TESTING.md) for what ran on a unit.

Lock a trig to FILL without turning the TRC knob.

## Controls

| Gesture | What it does |
| --- | --- |
| Hold a trig in GRID RECORDING, press FILL | The trig gets a FILL condition lock. |
| Press FILL again | NOT FILL. |
| Press FILL again | The lock goes, and the trig follows the TRIG page's condition. |

Holding several trigs writes all of them: the lowest one sets the step, the others follow it, so they end up alike. A trig whose lock is another condition goes to FILL. Nothing shows on screen but stock's own TRC value, which appears on the TRIG page while the trig is held. There are no settings, no effect slot and no knob.

In Euclidean mode a held trig writes the pulse its key maps to, as stock's own trig edit does, and a key on no pulse leaves FILL to stock.

The gesture works in PERF, SCNE, MUTE and CHRO, where the page stays on screen. With QPER held, a menu open or any other screen on top, TRC is covered, so FILL stays stock's and writes nothing. A message on screen does not get in the way.

A trig counts on the page and track where its key is down. PAGE moves the page on its release, so the gesture still works with PAGE held. Once the page moves, stock ends every hold, so a trig still held no longer counts, even back on its own page: press it again. Change track and FILL writes only if that track has a trig on the step. Stock places no trig past the pattern's length, so FILL plays a fill there too.

## Changes to stock flows

| Change | For whom | Why | Neighbouring flows |
| --- | --- | --- | --- |
| FILL pressed with a trig held in GRID RECORDING writes the condition and does not engage fill. Its release is taken too, so a fill latched with FUNC + FILL plays out its loop. | Anyone with the module installed; it applies only while it is. There is no setting: leave the module out of the set to turn it off. | The gesture itself. A musician who holds a trig and presses FILL to hear a fill now writes a lock. Press FILL first and then the trig, and the fill plays, as stock. A row or page would be no quicker than the TRC knob, and FUNC + FILL is stock's latch. | FILL alone, FILL then a trig, FUNC + FILL, FILL with QPER held or a menu open, and FILL outside GRID RECORDING stay stock's. Trig release after the write follows stock's lock edit: the trig stays. |

## Compatibility

It patches one stock call, at the head of the FILL case in the view under the pages, and needs nothing else from the base. A screen above that view that takes FILL keeps it. Claims `ui:TRIG + FILL`.

The write goes through stock's own step setter, so the lock is the same one the TRC knob makes: it saves with the pattern, copies with the trig, and shows and changes on the knob as any other. Stock has no undo for a step's condition.

## Credits

Original work by Nathaniel Pavel.
