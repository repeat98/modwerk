# Character testing

## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

Recorded checks cover dry identity, saturation, folding, compression, width and both-core compressor-key tests. Prior versions ran on hardware; this catalog revision still needs full qualification.

## Commands and results

Declared native gates:

`tools/verify/verify_character.py`

`tools/verify/verify_charkey.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Static pricer result. It is not a measured hardware load percentage.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## 0.1.1-experimental licence update

Copyright notices, full component terms and SPDX metadata were corrected.
No DSP implementation changed and no firmware, emulator, audio or hardware tests
were rerun. Existing evidence remains attached to the source revision above;
this documentation version does not create new firmware qualification.
