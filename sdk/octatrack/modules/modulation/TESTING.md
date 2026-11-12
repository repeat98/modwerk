# Modulation testing

## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The source records 29 reference gates and 13-setting identity comparisons. Image 88 overran with four Modulation instances beside reverb; the following cycle optimization has not been retested on hardware.

## Commands and results

Declared native gates:

`tools/verify/verify_modulation.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Priced words per sample: PHSR 298, COMB 329, LINE 354. These are estimates, not a percentage of DSP capacity.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## 0.1.1-experimental licence update

Copyright notices, full component terms and SPDX metadata were corrected.
No DSP implementation changed and no firmware, emulator, audio or hardware tests
were rerun. Existing evidence remains attached to the source revision above;
this documentation version does not create new firmware qualification.
