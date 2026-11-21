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

## Combined 0.7.13 draft

After merging #1861, #1870, #1887 and #1165, the browser and native builders produced the same 819,896-byte OS (SHA-256 `08d8433b2ab223edc1de41b0f5347f5a28f717ba8e95791edca3e0087013c28f`). The release configuration is `74533ff5a9efe6b46d669be60006afa663a410ae0478aaa81191ca0495b7afcb`. The full development build `d096301a` and the minimal build without resident stock hooks `05d6d6d8` also linked.

The emulator repeated the 90%, 70% and stock NONE cases above on the combined release with the same results. All 29 focused host tests for machine events, the sample editor, the controller board, resident engines and saved-project memory priority passed. The three relinked controller packages matched their original bytes after substituting the two write-lease addresses. Their catalog readings still identify the hardware run that measured them.

## Selected-pattern playback on the MKII

On 21 November 2026 the combined development build `d096301a32bfa5248f5c3308ab104a2e4570740684eef5de92202fe340214fb6` ran in RAM on an Octatrack MKII. The panel transport started and stopped the selected pattern A01, Part 1. The development build had no installed modules. T1 had FILTER and SPRING REV, T5 had SPATIALIZER and DELAY, and the other tracks had FILTER and DELAY. Each row has 16 cached CPU and DSP readings spaced 750 ms apart, with a separate frame-timing interval around them.

| Window | CPU mean (range) | DSP T1–4 mean | DSP T5–8 mean | Mean frame-interrupt share | Longest frame | Skipped renders |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Stopped | 35.0% (34.8–35.2%) | 39.3% | 38.1% | 23.6% | 31.6% | 0 |
| Playing | 45.6% (45.2–46.2%) | 39.3% | 38.0% | 31.9% | 66.4% | 0 |
| Playing after STOP and PLAY | 45.7% (45.3–46.2%) | 39.3% | 38.0% | 32.1% | 65.8% | 0 |

The initial restart interval peaked at 66.6% of a frame, with zero skipped renders. The loader errors, stalls and retained crash and stall counts were unchanged. The module-machine CPU allocation reported 0% booked. This is a baseline for the selected pattern. The saturated 90% refusal above was exercised in the release emulator.

The run ended stopped on A01 with the same track, Part and effect assignments. Restoring release `254c5a75` restored Screen Off, USB Audio, the whole-set digest, the saved/live counts (2/2) and the empty disabled-module list. All changes to the running image were in RAM. Exact-release overload and extended listening and soak tests remain open.
