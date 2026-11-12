# Spectrum testing

## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The source records filter-response, dirty-state, menu and label checks, plus 13-setting identity comparisons. Earlier versions ran on MKII hardware. The current dynamic-loader catalog is not hardware-qualified.

## Commands and results

Declared native gates:

`tools/verify/verify_spectrum.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Priced instruction words per sample for SEM / ISO in the reported build. Hardware utilization has not been measured.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## 0.1.1-experimental licence update

Copyright notices, full component terms and SPDX metadata were corrected.
No DSP implementation changed and no firmware, emulator, audio or hardware tests
were rerun. Existing evidence remains attached to the source revision above;
this documentation version does not create new firmware qualification.
