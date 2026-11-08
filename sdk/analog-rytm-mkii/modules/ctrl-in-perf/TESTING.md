# Ctrl In Perf — test report

- Module: `ctrl-in-perf` 1.0.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.7.
- Original: MrScruff's rytm-mods-src `mods/0017-ctrl-in-perf` at `cd4ded4a`, for OS 1.73.

## Status

Not tested on OS 1.74. Nothing in this report was run with this module yet.

The OS 1.73 original, in rytm-mods-src, passed its checks in rytm-emu and never ran on a unit
(rytm-mods-src `re/subsystems/control-inputs.md`): ZERO, the midpoint and MAX gave 0, 63 and 127;
port 2 to PF3 worked on its own; the value stopped at both ends; the row showed and hid with MODE;
the setting survived a power-off and a cold boot. Those results are for the 1.73 build and its
persisted-gap storage, not for this port.

## To test

1. **Row.** In rytm-emu and on the unit: GLOBAL > CONTROL > CONTROL INPUT 1, MODE CV and EXPR show
   PERF DEST as the last row; OFF shows none. Turning it steps OFF, PF1..PF12 and stops at both ends.
2. **Drive.** CV mode, PERF DEST PF1: ZERO, the midpoint and MAX give macro 1 the values 0, 63 and 127
   (in rytm-emu by poking the converter's result word; on the unit with a CV source), and a lock on
   performance 1 follows.
3. **Wins.** While the jack drives PF1, turning the PERF knob or pressing pad 1 in PERF mode does not
   move macro 1 past the next block; PERF DEST OFF gives them back.
4. **Port 2.** CONTROL INPUT 2 to PF3 drives macro 3 only.
5. **Kept.** PERF DEST survives saving the project, loading another and back, and a power cycle; a
   new project reads OFF.
6. **Beside stock.** CONTROL IN 1 MOD still plays from the same jack.
