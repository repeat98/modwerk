# VECTOR Undo on Octatrack 0.7.11

20 November 2026 · Octatrack MKII · Elektron OS 1.40C · Tracks + Main + Cue

## VECTOR rollback

A 30-second stopped whole-set trial of the released VECTOR 0.3.2 left the previous 0.7.11 development image `fac1523234f4bb0b` in recovery at generation 7. A fresh connection and the standard recovery command also failed. After the owner power-cycled, the 0.7.9 base, set digest, and all ten ordered inventory entries matched the original snapshot.

The loader now evaluates a departing track machine's own stock menu definitions as they will read after the switch restores them. A separate cached callback and all working and saved Part signatures are still checked live. A host regression exercises all three cases. The original unit log reported the recovery state without identifying the particular reference that blocked it.

| Physical trial with VECTOR alone | What Undo restored |
|---|---|
| Matched development build `a7227df2ba0bc27e`, original preceding set sequence, 30 seconds stopped | Normal, generation 8, original empty inventory and set digest |
| Same build, 30 seconds stopped again | Normal, generation 12, same baseline |
| Same build after playback | Normal, generation 14, same baseline |
| Controller-enabled development build `be86323a387211a5`, 30 seconds stopped | Normal, generation 2, same baseline |
| Release candidate `a08a1557c5bd7d04b6b0615361f059ac99ba2bc40f8a7e3b86842db2ccbbb5bd`, 30 seconds stopped | Normal, generation 2, exact starting inventory and set digest |

Each comparison and release trial ran through the hardware USB loader. The tested release candidate was RAM-booted. The unit returned to its flashed 0.7.9 base and the ten original modules after the release trial.
