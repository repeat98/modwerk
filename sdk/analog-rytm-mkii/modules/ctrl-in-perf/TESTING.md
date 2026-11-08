# Ctrl In Perf — test report

- Module: `ctrl-in-perf` 1.0.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.7.
- Original: MrScruff's rytm-mods-src `mods/0017-ctrl-in-perf` at `cd4ded4a`, for OS 1.73.

- Build CP02 (OS 1.74, the Modwerk base for core-ar2 0.7, plain variant `ba530f45`, + this module): `.syx`
  `f154018ef7c671b4d59a428e71fa78dac1662c0e2746e50cc51b0f4c7f8708b9`. Emulator only. Against the base alone it
  takes 672 bytes of flash and 952 bytes of the shared mod RAM. Linked with irpina's core-ar2 0.7 release
  instead (CP01, `92983fe0…a206`), the emulator frames below are byte-identical.

## Status

Not run on a unit. The emulator results below are emulator results, not hardware evidence.

## Emulator (analog-emu `4c07ed3`, dtboot, CP02, fresh card, 2026-11-08)

- GLOBAL > CONTROL > CONTROL INPUT 1, MODE CV: the rows are MODE, CV ZERO LEVEL, CV MAX LEVEL and PERF
  DEST. MODE EXPR also shows PERF DEST last. MODE OFF hides it.
- PERF DEST steps OFF, PF1..PF12 (twelve distinct frames) and stops at both ends.
- With PF1 set and the menu closed, the converter's result word poked to CV ZERO, midway and MAX gave
  the port value 0x4000, 0x6000 and 0x7fff and macro 1's word 0, 0x3f00 and 0x7f00 (0, 63, 127; the
  midway step stays at 63 because of the hysteresis while stock's input smoothing rises). Stock's
  smoothed copy, which the lock loop reads, matched each time.
- Captures: [media/capture.json](media/capture.json).

## Source

- The OS 1.74 addresses were read in Ghidra against the 1.73 original: the CONTROL INPUT rebuild's
  converge site, its registers and epilogue, the value text routine and font, the menu item calls, the
  audio interrupt (the core's `ev_render_in` entry runs before stock's macro smoother and lock loop, and
  nothing between them writes the twelve macro words) and the input routine's CV and EXPR scaling.
- The committed package is reproduced by the pinned toolchain (`build-elemod-isolated.sh`,
  `verify-elemod-release-exports.mjs`).

The OS 1.73 original, in rytm-mods-src, passed its checks in rytm-emu and never ran on a unit
(rytm-mods-src `re/subsystems/control-inputs.md`): ZERO, the midpoint and MAX gave 0, 63 and 127;
port 2 to PF3 worked on its own; the value stopped at both ends; the row showed and hid with MODE;
the setting survived a power-off and a cold boot. Those results are for the 1.73 build and its
persisted-gap storage, not for this port.

## Hardware (to run)

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
