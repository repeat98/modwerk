# Ctrl In Perf — test report

- Module: `ctrl-in-perf` 0.1.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.7.
- Original: MrScruff's rytm-mods-src `mods/0017-ctrl-in-perf` at `cd4ded4a`, for OS 1.73.

- Build CP02 (OS 1.74, the Modwerk base for core-ar2 0.7, plain variant `ba530f45`, + this module): `.syx`
  `f154018ef7c671b4d59a428e71fa78dac1662c0e2746e50cc51b0f4c7f8708b9`. Emulator only. Against the base alone it
  takes 672 bytes of flash and 952 bytes of the shared mod RAM. Linked with irpina's core-ar2 0.7 release
  instead (CP01, `92983fe0…a206`), the emulator frames below are byte-identical.

## Hardware (T208, 2026-11-08)

On Iced-Cream's Analog Rytm MKII, OS 1.74, a scripted elkbench run of CPH2 (CP02 plus the analoghealth 1.3
remote-key layer, `.syx` `3039fb3d23caf9e499a3fa2352508420d63e88db24ff6dda855548bd4895a954`) in a `~T` test
project, approved by Iced-Cream, with a power cycle by hand. Stock 1.74 was flashed back after.

- CPU 74.6% and 74.8%, read 30 s apart, heap flat (analoghealth).
- CONTROL INPUT 1 started at MODE OFF. With MODE CV, PERF DEST is the last row, steps OFF, PF1..PF12 and
  holds at both ends; MODE OFF hides it.
- PF1 was kept over a project save and reload, and over the power cycle; then set back to OFF.
- With nothing plugged into EXP/CV IN 1, the port reads below CV ZERO and macro 1 stays at 0.
- Iced-Cream listened to the unit throughout the run.

CPH2 and CP02 were built when this version was numbered 1.0.0-experimental; `build.json` and
`src/ctrl-in-perf.s` are unchanged since, so the renumbered package differs only in its version label.

The manifest's `evidence.sourceSha256` is the sha256 of `sha256sum build.json src/ctrl-in-perf.s` output;
neither file changed after CPH2 was built.

## Hardware, CV source (T221, 2026-11-09)

On the same Analog Rytm MKII, OS 1.74, a scripted elkbench run of CPH3, approved by Iced-Cream:
`.syx` `e13685cfea3572c9e84cdf5f915c95b367c0a94e5c1c9585d7070d7522777afb`. CPH3 is this package
(`6b6fdb7d…cb05`) on the Modwerk base plain variant `1c14b6b0` (core-ar2 0.7), plus analoghealth 1.3,
built from `bb04f1a`. An Analog Four MKII (stock 1.56 plus a remote-key build, flashed back to stock
after) drove its CV OUT A, set to VALUE LIN 0-5 V, into the Rytm's EXP/CV IN 1. Iced-Cream moved the
cable by hand. The run used a `~T` test project, and stock 1.74 was flashed back after.

- CPU 74.9% and 74.9%, DSP 70.2%, heap flat (analoghealth).
- CONTROL INPUT 1 MODE CV, PERF DEST PF1, and a performance 1 lock on BD TUNE at +127.
- Each row was read twice, 1 s apart, and both reads matched:

| CV OUT A | port 1 | macro 1 | BD TUNE live word |
|---|---|---|---|
| 0 V | 0x3fcc | 0x0000 | 0x3d00 (base) |
| about 2.5 V | 0x6048 | 0x4000 | 0x7cff |
| 5 V | 0x7fff | 0x7f00 | 0x7fff (top) |
| 0 V again | 0x3fcc | 0x0000 | 0x3d00 |

- The jack drove macro 1, and the lock on performance 1 followed. Macro 1 returned to 0 with the jack.
- PERF DEST and MODE were set back to OFF after the run, and checked on screen.

Not run on the unit: EXPR mode and CONTROL INPUT 2. Iced-Cream did not listen during this run.

## Beside Control In Actions (emulator, 2026-11-09)

One build with this module and Control In Actions on the plain base `1c14b6b0`. MODE OFF looks the
same as either module alone. CV and EXPR look the same as this module alone. ACTION looks the same as
Control In Actions alone, with no PERF DEST row.

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

## Still to run on hardware

1. **Row.** On the unit in EXPR mode (CV and OFF were run in T208).
2. **Drive.** Run on the unit in CV mode (T221). Still to run: EXPR mode.
3. **Wins.** While the jack drives PF1, turning the PERF knob or pressing pad 1 in PERF mode does not
   move macro 1 past the next block; PERF DEST OFF gives them back.
4. **Port 2.** CONTROL INPUT 2 to PF3 drives macro 3 only.
5. **Kept.** PERF DEST survives saving the project, loading another and back, and a power cycle; a
   new project reads OFF.
6. **Beside stock.** CONTROL IN 1 MOD still plays from the same jack.
