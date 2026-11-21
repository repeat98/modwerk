# Improved Performance testing

Version 0.1.0-experimental, Analog Rytm MKII, OS 1.74. Tester and unit: Nathaniel Pavel (@npp1993), his own Analog Rytm MKII. Firmware, dumps and built images stay out of this folder.

**What ran where.** The four assembly sources are the code that ran in every test below: the public files assemble, with `build.json`'s symbols, to the same code and data as the files the tests used (compared object for object). `src/cpu-mark.c`'s counting of the load is the tested code; its drawing was rewritten afterwards (stock's font, the words CPU and OVR, only where the bottom bar is) and has run in rytm-emu only. The unit tests ran in private test builds beside 17 other modules of the author's set, on a development base with the USB link and a load meter. **The release package itself has not run on a unit.**

## rytm-emu

A local build of rytm-emu with a cache model and an interrupt profiler added (not upstream's), the audio interrupt run in zero time so that two runs can be compared block for block. Each comparison is one image run twice: as built, and with this module's patch sites written back to stock before the run. One record of engine state every audio block, and the DAC output as a WAV.

| Image | Session | Blocks | Result |
| --- | --- | --- | --- |
| The plain release base + this module, nothing else | Notes on 12 tracks at 12 velocities, pad pressure, performance controllers, controller ramps on track channels, every controller 16 to 119 on the FX channel | 69,552 | Parameter words, smoother states, control frame, voice records, voice gains and the DAC output identical in every block. Audio interrupt: 20,858 fewer instructions a block than with the exact parts' sites back at stock. |
| The same code beside 17 other modules | the same | 69,551 | The same seven identical; 19,121 fewer instructions a block. |
| The same, a kit loaded from the KIT menu while a long reverb rings | BD notes, then LOAD KIT, kit 02 | 65,801 | Reverb output, delay output, the FX track's words and the DAC output identical to the image with every site back at stock. Stock applies the new kit's FX settings in one block. |
| Self-checking builds, one for each group of parts (stock does all the work; each skip is compared with what stock produced) | each group's own session | 64,301 to 163,301 | 0 differences: sample voices, send mixer, delay, reverb, slide pass, lists, matrix, stream clear, voice mix, compressor words, smoother. |

**The after-use rest of the delay and the reverb** (the one part that is not bit-identical), its own session of 133,301 blocks: identical in every word from power-on to the first rest after use. At rest the output is zero where stock's was at most 266 (delay) and 60 (reverb) of 2^31; a 24-bit converter step is 256. With feedback raised to 100 and no input, the rest ended and the tone grew out of the residue as in stock. After the next use the two runs were identical again.

**CPU and OVR** (upstream rytm-emu c5732f0, builds with one threshold lowered so that the word shows): on the main screen and under the TEMPO pop-up the word sits in the bottom bar's lower right corner, in the bar's font and on its text line; with a test module's dark box in that corner (where Loop Sync shows SYNC) the word replaces the box cleanly; on the GLOBAL menu and over the machine list nothing is drawn.

Not reached in rytm-emu: a USB audio stream, a sample that plays, the interrupt's short path during a project load.

## On the unit (author's MKII, OS 1.74)

All from RAM, in test images of the author's 18-module set; the figures are the unit's own meter (the share of each audio block's period that the audio interrupt used). The pattern is one 12-track pattern of the author's project, played hands off.

**Self-checks: stock does all the work, and each part compares what its skip would have left.**

| Date | Part | Checks | Differences |
| --- | --- | --- | --- |
| 18 Nov 2026 | Sample voices | 1,885,296 skipped voice-blocks, 3,289,416 transfers | 0 |
| 20 Nov 2026 | Send mixer, delay, reverb (exact form) | 388,252 mixer passes, 194,126 blocks each for delay and reverb | 0 |
| 20 Nov 2026 | Slide pass, lists, matrix | 196,000 blocks, 5,095,584 list calls | 0 |
| 20 Nov 2026 | Stream clear, voice mix, compressor words | about 192,000 blocks each | 0 |
| 20 Nov 2026 | Smoother | 1,331,363 blocks, the author turning knobs for part of it (2 "at rest" marks dropped and set again) | 0 |

**Audio load, the same pattern.**

| Build | Pattern, mean | Longest block | Stopped | Redraw step |
| --- | --- | --- | --- | --- |
| The set without this module (17 Nov 2026) | 85.4 % | 99.4 % | not comparable | 19.1 ms |
| The set with this module's code, as one module (20 Nov 2026) | 72.0 % | 87.2 % | 54.3 % | 8.0 ms |

- The delay rested only with the sequencer stopped, and the reverb never: on this project its input is never exactly zero.
- A kit switch while the reverb rang (the author, 20 Nov 2026): the tail rang out with and without the module; the counters showed the reverb rest never engaged.
- A burst of USB stream frames arrives after each RAM boot (about 1.6 s): the stream part fell back to stock for it and went back to skipping afterwards, in the real build and in its self-check.
- CPU and OVR: not seen on the unit. The load never reached 88 % on a build that carried the mark.

## Not tested

- The release package (0.1.0-experimental as built from this folder) on a unit.
- This module as the only module on a unit: every unit run was beside 17 others.
- A project load while sound rings (the audio interrupt takes a shorter path then; read, not run).
- A USB audio stream of more than the 1.6 s above.
- A sample that plays through a rest of its voice in rytm-emu (on the unit the pattern has one sample voice playing).
- The CPU mark on the unit, and its thresholds.
- A second unit; any OS but 1.74.
