# Octatrack CPU admission across STOP and PLAY

The 0.7.13 candidate has configuration `1ddf1a75b0e14584006f86696054482d09faf9213830b6eb6d80dc6a8286bcbe`. The browser and native builders produced the same OS image, SHA-256 `f9e37af31e75b1ffc60ec8a3502a34a0679e1945f9eec6a685d368173527890f`.

## Host regression

The test first measured 90% during playback, then supplied stopped readings of 62%. Before the fix, pressing PLAY immediately made 62% available to the admission check. This let a module effect through the 85% limit before the next playback window had filled.

| Case | Result in the host harness |
| --- | --- |
| Restart after a busy pattern | The effect is refused using 90%. The dialog shows PLAY and the 85% limit. |
| A lighter pattern replaces the old measurement | The seventh fresh reading still protects the restart. The eighth replaces 90% with 70% and the effect fits. |
| The current meter is busier than the saved playing window | The higher current load governs the pick. Stock effects and NONE remain available. |
| A resting effect would wake at 83% | The dialog shows its additional 3% and the 85% limit. The refused effect stays asleep. |
| A machine would exceed the measured CPU limit | Its requested price includes the wake cost when applicable. A second refusal preserves the dialog already on screen. |
| The frame-share display after STOP and PLAY | The saved 54% share survives the restart and falls to the current 20% after eight fresh readings. |

The SDK suite, module compatibility check and DSP cost-model check passed. These cases exercise selection and display. The change adds no work to the per-sample renderer. The tests establish neither a saving in sustained playback CPU nor an audible result.

## Release images in the emulator

The ColdFire emulator ran the preceding release image `ae78c478` and the candidate image above. Both received the same synthetic restart state. The recent and saved CPU readings were 62% and 90%. The recent and saved frame shares were 20% and 54%. Playback was active.

The preceding image returned 62% CPU and 20% frame share and admitted a module effect on T4 FX2. The candidate returned 90% and 54% and refused it. Stock NONE remained available and the module effect fitted with the playing and recent readings both at 70%.

The candidate drew both dialogs through its own renderer and font at 128 × 64 pixels. The effect dialog showed T4 FX2, PLAY 90% and LIMIT 85%. The machine dialog showed T6 SRC, AMIGA, PLAY 90%, +12% and LIMIT 85%. These were controlled meter inputs in the emulator.
