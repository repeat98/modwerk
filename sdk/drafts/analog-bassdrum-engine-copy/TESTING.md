# Test the engine-copy follow-up

Candidate 0.1.6-experimental on published 0.1.5. The only reported hardware result so far is on a locally built image, **AB015FX4** (Analog BD and stock only, SPRING REV given up): MAIN OS SHA-256 `d8fb2a00d3c093e004d41223adc354afbde6d6cebf817968bf43f6235cb87c27`, card update `04741dd28c9a32450c58bd7f06bede8f8ce125f8278b66512f9ade34b8ce8698`. It was built with `make image` on macOS, not with `build.py` in the isolated container.

## Hardware steps

Use a disposable copy of a project. Record the model, the firmware label and what happened at each step; a step not performed stays unverified.

1. Sequencer running, an Analog BD track with trigs. Change it to FLEX in SRC SETUP. Expect silence on that track until its next trig, then the sample; no burst of wrong data. The SRC page and SRC SETUP show stock FLEX defaults.
2. Change it back to Analog BD. Expect the drum at its assignment defaults, sounding without SRC + PLAY.
3. Assign Analog BD to a track that is already plain FLEX. Expect sound at once.
4. Repeat 1 through the track's machine list (double-tap the track, LEFT), and with THRU, STATIC, NEIGHBOR or PICKUP as the target.
5. Keep a second track playing a sample and a second Analog BD track on the other DSP core through all of this. Expect both unaffected.
6. After a change, power off and on without saving. Expect every machine as it was, the other Analog BD track with its patch, and PLAY running.
7. Repeat a change in another Part, then return. Save, reload the Part and the project around a change.

Reported so far (MKII, AB015FX4): steps 1, 2, 3, 6 and the sample-track half of 5 as passing; see [evidence/hardware-npp1993.json](evidence/hardware-npp1993.json). Steps 4 and 7, a second Analog BD track during the change, and the sequencer stopped were not reported.

## Reproduce software evidence

`python3 sdk/drafts/analog-bassdrum-engine-copy/apply.py` checks the pinned 0.1.5 base and this folder's fingerprints. `--output <fresh-private-sdk>` stages a private SDK; `build.py --sdk <fresh-private-sdk> --stock-main-os <owned-decoded-1.40C-MAIN-OS>` builds it in the isolated native container (not run for this record).

`verify.py --sdk <built-candidate-sdk> --output <private-json>` needs GNU m68k tools and Unicorn. Result on this source: 512 chooser cases, 32 reselections, five target machines, registers and stack, and 1,152 engine-copy and voice cases, all passing. On the 0.1.5 `machine.s` the first engine-copy case fails, as expected.

The emulator comparison used ot_emu with a two-process power cycle (battery RAM and card carried into a fresh boot, firmware's own power-up load, no project load) and a dump of the engine's copy at the end of the first run. This emulator build rendered no audio in these fixtures, so the stale voice and its stop rest on the unit cases and the hardware report.
