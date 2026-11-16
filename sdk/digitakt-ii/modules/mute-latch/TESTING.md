# Mute Latch testing

## Status

- **On a unit, current package (reported by the author, crisp909, 2026-11-16):** `mute-latch-0.1.0-experimental-os1.17.elemod`, sha256 `2e47115e6821153430e5ae56479863fce411467cd640a69a93aa8d6f5c2bda08`, built by the author from commit 155a17577 in the pinned toolchain image (GCC 16.2.0). It differs from the first package in three places: STOP removes the "MUTES ARMED" message at once, a pass is counted once per wrap of the step position, and when the steps are too short for the second tick of step 1 the switch is made on the first position seen after it. See [Review changes on a unit](#review-changes-on-a-unit).
- **On a unit, first package (reported by the author, 2026-11-14):** `aa9dd675077e55759fe1b5ad97e234795119939bb6cd452ce28e5f59b6cda9bc` (commit 446dbf76) worked as intended, see [First package on a unit](#first-package-on-a-unit-reported-by-the-author-crisp909). Reports are not measurements made here.
- Everything under "Emulator evidence" was seen in digikit's headless ColdFire-only `panel_drive` (no DSP) with the SSI clock at 96 kHz, a one-sample card made with digikit's `plusdrive`, and a 128-step pattern. It approximates the instrument and is not hardware evidence.

## Not tested

- On a unit: leaving Mute Mode while armed; arming a second and third time in a pattern of two steps without STOP between; a pattern of one step; track speed 2x or any setting that makes the steps shorter than a UI tick (only 140 and 200 BPM at 128 steps were run, which is why the short-step fallback is not shown to be exercised); Scale per track.
- Tempos of the 2026-11-14 report were not recorded, and CPU load and memory were not measured.
- A pattern change while tracks are parked, a second PREP MUTES session started while tracks are still parked, holding TRIG keys after PERFORM, a power cycle with something armed.
- Whether a track comes in exactly on a kick at step 1 at every tempo; the report covers several tempos at 128 steps.
- The stock flows with and without the module beyond those listed below; DSP-coupled emulation.

## First package on a unit (reported by the author, crisp909)

Package `mute-latch-0.1.0-experimental-os1.17.elemod`, sha256 `aa9dd675077e55759fe1b5ad97e234795119939bb6cd452ce28e5f59b6cda9bc`, built by the author in the pinned toolchain image (GCC 16.2.0) from commit 446dbf76, linked with core 1.0 by the Elekloader builder for OS 1.17. Tested on a Digitakt II on 2026-11-14 and reported as working, in these words: "tested what you asked and it works". The test asked for: a 128-step pattern, a short kick on the muted track at steps 126 to 128 and 1, several tempos and repetitions, 2 and 3 PERFORM presses (the passes counted down and the switch came after that many), and choosing the same tracks again to cancel. This is a report: the number of repetitions and the tempos were not recorded, and CPU load was not read.

## Switch moment on a unit (reported by the author, crisp909)

Digitakt II, OS 1.17, 128-step pattern (all tracks the same length, per pattern, pattern change off), short kick sample on the muted track, kicks on steps 126 to 128 and 1 to 2, 140 BPM, no swing. Reported by the author, not measured here. Builds from this repository's source compiled with GCC 13 (private test builds, not the pinned toolchain):

| Build (where the switch is made, by the step counter) | What the author heard |
| --- | --- |
| Last step (counter at 128) | Steps 127 and 128 already audible. |
| First step (counter at 1) | Step 128 still audible. |
| Second step (counter at 2) | Step 1 not audible. |
| Second tick of the first step (`ml-t2`) | Steps 126 to 128 stay as they were, step 1 plays switched. Checked at several tempos (values not recorded). |

The step counter runs a step ahead of the sound, and the mute is judged shortly after the counter moves on, so the window for a switch between the last and the first step is about one step wide. The first package switches on the second tick of the first step, or on the first tick of the second step if the steps are shorter.

## Review changes on a unit

Package `mute-latch-0.1.0-experimental-os1.17.elemod`, sha256 `2e47115e6821153430e5ae56479863fce411467cd640a69a93aa8d6f5c2bda08` (recipe `1.17.json` sha256 `0e26cfe5b25d0d3c02fc545a097c1e287a6680e3dee50f9215687a9ece0e5677`), built by the author from commit 155a17577 in the pinned toolchain image (GCC 16.2.0), linked with core 1.0, run on a Digitakt II, OS 1.17, on 2026-11-16. Reported by the author, not measured here:

| Check | Reported result |
| --- | --- |
| STOP while armed | The "MUTES ARMED" message goes at once. |
| 128-step pattern, kicks on steps 126 to 128 and 1, 140 BPM and 200 BPM | The switch lands between step 128 and step 1, as with the first package. The change broke nothing the author checked. |
| Fast tempo | Tried at 200 BPM only; reported fine. |
| Pattern of two steps, 30 BPM, several PERFORM presses | The countdown ran in the header and the mutes switched after the last pass. |

Not run: arming again without STOP in the two-step pattern, a pattern of one step, track speed 2x, leaving Mute Mode while armed, Scale per track. Counts of repetitions and CPU load were not recorded.

## Emulator evidence

### Stock OS 1.17 observations

- Stock: `Digitakt_II_OS1.17.syx`, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`. Image: elekloader's `python -m elekloader.patch` with `core-1.0.elemod` (SHA-256 `95303655a9358f581b485acb68b884b394a577f5d0b373f0a3e5957c8d0ca72c`) and earlier builds of this module compiled with GCC 13.3 `m68k-linux-gnu` (not the pinned GCC 16 `m68k-elf`).
- Counts of executions come from `panel_drive --count` on the stock routines `0x40068b96` (a track's mute toggles) and `0x4006de70` (applies a PREP MUTES choice).
- Mute Mode is entered with FUNC+TRK. In it, holding FUNC and pressing TRIG keys shows "PREP MUTES" with the chosen tracks; letting go of FUNC applies the choice at once (2 toggles for 2 tracks). There is no setting to turn on.
- With FUNC held, TEMPO is the stock **Tap tempo**: it opens a "Tap tempo 1/4" view over PREP MUTES. FUNC+PERFORM opens a different stock view (header "Perform Kit=ON"). A first version of the module polled TEMPO and never saw its view on top, so it did nothing; the module now takes the PERFORM key event instead.
- Step position `0x43164fe0` + track rises by 1 per step (about 16.5 M instructions) and wraps to 0 after the last step; playing flag `0x43164f94` is 1 while playing; pattern pointer `0x4316501c`.
- The view on top of the stack is read as the module assumes: Brain `0x44f5de40`, last node `0x450d0b00`, object `0x450b0750` with vtable `0x401f8a18`; its choice mask at +`0x88` (5 for tracks 1 and 3) and session flag at +`0x8d` (1 while FUNC is held).

### Loop build, view check (superseded build)

Image sha256 f9c5077602350efc836800ad3eef8357fcf1247ea96c049ed93ebb9ef255f248 (core 1.0 + an earlier build of this folder, GCC 13, no patched stock site). 128-step pattern, TRIG 1 and 3 chosen, run stopped at chosen times:
- One press: 2 toggles, 1 apply at the last step (the timing of that build, since changed to the second tick of step 1). Two presses: 0 toggles after the first pass, 2 toggles and 1 apply after the second.
- Header: MUTES ARMED with the loop icon and 1, 2, 3, 4 for one to four presses and 1 again for the fifth (see `media/`); the message stays past the stock time-out and goes when the mutes switch.
- The PREP MUTES view object: the same address (0x450b0750) in four FUNC sessions and after leaving and re-entering Mute Mode; the view-stack node is freed on leaving Mute Mode. Armed, then FUNC+TRK to leave Mute Mode, then a whole pass: 0 toggles, 0 applies (the choice is dropped). Armed, left and re-entered, armed again: 2 toggles, 1 apply.

### Earlier builds (superseded)

- A build that took TEMPO and applied on the wrap: mutes switched at position 1 (2 toggles, 1 apply, 0 before), TEMPO with nothing chosen cancelled, stopped sequencer kept stock behaviour.
- A PERFORM build with MUTES ARMED and lit TRIG LEDs (image sha256 d736aaec...): header and LED arrays as expected in the emulator; the LEDs are not part of this module. The author reported that build working on a unit (informal, not measured here).
- A build applying on the last step (image sha256 afba203f...): position 127: 2 toggles, 1 apply. The unit test above showed that this is too early, steps 127 and 128 play switched.
- Hardware, informal reports by the author: `mute-latch-0.1.0-loop-pr-os1.17.elemod` (sha256 8d8a71e24c7a3896f1193c221435a057be559bd764fd9b3c811fb65e41f80db5, GCC 13): one to four PERFORM presses with the loop icon and countdown, no LEDs. A personal variant with armed tracks' TRIG LEDs (sha256 4b79a25b4de4e45eade574d27b56fd3f8f9aecb68508f7b6b6a435a58191dfb0) patches the key-LED frame and is not part of this module.

## Flows compared with and without the module (emulator)

- PREP MUTES with FUNC released without PERFORM while playing: 2 toggles, as stock.
- PERFORM with FUNC held, nothing chosen, nothing armed: stock behaviour (not re-run on the current source beyond an earlier build).
- Stopped sequencer: stock behaviour (earlier build, not re-run).
- Not tested: save/reload of a project (module keeps no saved state), other patterns, Part change, power cycle on a unit.

## Source and build

Source: branch `module/mute-latch-dt2` of crisp909/modwerk, this folder. Built by the author in the pinned toolchain image (`scripts/build-elemod-isolated.sh`, GCC 16.2.0) and linked with Elekloader on core 1.0 and the stock OS 1.17. Screenshots: `media/capture.json` (emulator captures).
