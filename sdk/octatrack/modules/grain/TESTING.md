# GRAIN testing

Grain 0.1.0-experimental · by A Force Truly Evil.

## SCAN double-speed endpoint, 20 November 2026

Antonio’s correction at `d75b1ecc651cfae491214c3f5f7bd8fb2db41611` maps knob 127 to +64 thirty-seconds of sample speed. The rebuilt 25,632-byte USB package has SHA-256 `371e2e19169814750c4bf844a2b907b1871328f8919fd32b5bddd869859c60b0`. The development and catalogue builders produced identical bytes. The package loads 24,416 bytes and declares 2,124 bytes of BSS. The compiler stack bounds remain 696 bytes along the audio path and 392 bytes along the waveform path.

`verify_lanes.py` executes the linked ColdFire formatter, START and render with a synthetic 1,024-frame 24-bit stereo Flex sample. Across all 128 knob positions and 128 out-of-range legacy values the displayed speed and read head agreed with the expected mapping. The top step now displays +2.00 and advances 32 source frames in 16 output frames. At 126 it advances 31 frames (+1.93 on the display). At 104 it advances 20 (+1.25), at 64 it holds, and at zero it wraps backwards by 32 frames (−2.00). Legacy values above 127 hold position. The real-time measurements below identify the preceding package. The 35-point reservation carries forward pending verification.

### Stereo engine soak and physical RAM trial

On the host, the linked ColdFire engine rendered 120 seconds of 24-bit stereo on T1 and another 120 seconds on T5. Each track rendered 330,750 blocks at 16 frames each and reached all six voices. The deterministic two-second stereo sample used native 1,024-frame Flex pages. The test varied the grain shape, direction, PAN spread, pitch, positive and negative SCAN, RAND/SYNC and tempo (140 and 240 BPM). Every PCM word matched the portable reference compiled with both fast paths disabled. The SHA-256 of the 5,292,000 big-endian stereo frames on each track was `7f45ce08b48ea409323cd4bad3df6088283e31d1ab628d0f7a7e4b8e8979bb47`. This isolates the engine from stock playback, track admission and hardware timing.

On the physical MKII, OS 1.40C, base `dfa438130710fea9`, the exact package ran as a 180-second USB trial beside the original ten modules. The unit logged no crash, stall, freeze or skipped track. Automatic rollback restored the starting active identity. The inventory, including handles and saved/live counts, matched the preflight. The test issued no project edits, Save, Keep or flash commands.

The normal base declined the development-only sample and timing reads. The physical trial measured installation and rollback. Physical 24-bit playback, guarded T1/T5 assignment and a sounding soak need a project that already has the relevant assignments or a write-protected test setup. Octatrack project edits are automatically cached to CompactFlash (MKII manual, section 4.12).

## Optimized stereo renderer, 20 November 2026

The 25,544-byte package tested on the MKII has SHA-256 `ff105b4615e339742a60241c7ab7b1c10e68bc3dd585cf33a3a9a13fa9d49d5f`. Both builders produced this package. All catalogue packages matched a rebuild with local OS 1.40C.

On development base `06e08f35c62c02ce`, B16 Part 1 played at 140 BPM. T1 used an 88,200-frame stereo 16-bit Flex sample, PTCH 66, POS 60, DENS/SPRY/PAN 127, SCAN 73, DIR 12 and SYNC. Both FX slots on all eight tracks were set to NONE for the entire comparison. With each package installed, we measured six seconds with no T1 trigs, then six seconds with all 16 T1 trigs. Each guard window covered over 16,800 frames. Other tracks, effects and guard settings were identical between the quiet and triggered windows.

| Package and settings | Quiet | Triggered | Added frame time | Active grain lifetimes sampled during triggered playback | Skipped renders |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous `329b40ef`, SQR, SIZE 127 | 26.7% | 60.3% | 33.6 points | 5–6 | 0 |
| Optimized, SQR, SIZE 127 | 26.6% | 58.0% | 31.4 points | 6 | 0 |
| Optimized, NORM, SIZE 127 | 26.7% | 58.4% | 31.7 points | 6 | 0 |
| Optimized, NORM, shorter SIZE (39 encoder steps down) | 26.7% | 59.2% | 32.5 points | 5–6 | 0 |

In the matched SQR case, the optimization saved 2.2 points. A shorter grain crosses more of its envelope per block. Keep the 35-point reservation until hardware timings cover more samples, including 24-bit stereo. The available samples in this project were all 16-bit stereo.

Resetting the track timers before each window and reading `mw_frame_cost_max[0]` and `[8]` afterward gave maxima of 14,628 and 17,201 timer ticks across the triggered windows. At 132 MHz the second value is 130.3 µs, or 34,402 CPU cycles, for the longest T1 call observed. The timed call includes stock Flex, Grain and interruptions. Whole-interrupt peaks in these three windows were 82.7%, 85.5% and 83.9% of a frame. The formal static bound and stock comparison under MIDI load remain open.

| Regression | How it was checked | Result |
| --- | --- | --- |
| Pitched and panned grains, forward and reverse | `test_grain.py` compares reference and optimized PCM plus six grain cursors on 1,600 blocks. Covers four windows, mono/stereo, 16/24-bit, uneven pages and block sizes from 1 to 32. The compiled checks in `verify_lanes.py` also exercise packed stereo reads and fractional carry against the previous package. | Byte-identical audio and cursors. The existing 28 optimized-path comparisons, three reference renders, 1,792 position/scatter cases and all 16 Flex control lanes also passed. |
| Tempo, density and mode changes | Switch SYNC division, tempo and RAND/SYNC while reusing the same track. | The scheduler followed each change. |
| Switch from a long sample to a one-frame sample with SCAN running | Set the previous read head to frame 44,860,415 and render 32 frames in either direction. | The head wraps immediately. The previous positive-SCAN path could subtract the new sample length millions of times inside the audio callback. |
| Reversible install and playback | Compare the complete B16 pattern, the working and saved Part and the inventory before and after the trial. Return to A01 T1 and boot the original base `dfa438130710fea9`. Try this same package for 20 seconds beside its ten modules. | The pattern and Part matched byte for byte. Both trials rolled back. The normal base logged no crash, stall, freeze or skipped track in the coexistence trial. Its ten saved and live modules matched the starting inventory. |

For a 16-frame block of six fractional-pitch stereo grains with alternating direction and nonzero pan, the isolated linked ColdFire renderer executed 5,448 instructions versus 7,588 before (28% fewer), with identical output and cursor state. This count covers the engine in an emulated CPU. The table above measures the complete playing track on hardware.

The package loads 24,328 bytes of code and data and declares 2,124 bytes of BSS, totaling 26,452 static bytes. With GCC 16.2, the generator flags and `-fstack-usage -fcallgraph-info=su`, the deepest Grain audio path is `grain_render` (164 bytes), `gran_render` (448) and `stereo_page` (72), plus three four-byte return addresses, totaling 696 bytes. The waveform draw path remains 392 bytes. Interrupt nesting, stock callbacks and loader overhead are outside those bounds.

Release qualification still needs the ordered assignment test on a suitable Part, the extended stress and soak, and a musician's listening and reboot checks on the final package. The author's SCAN +2.00 endpoint work is separate from the sample-change fix. Earlier MKI meter readings and MKII trials below apply to their named builds.

## SRC and SETUP control-buffer repair, 20 November 2026

The control-repair build is `285605e6b24929f22d3f9d1c3eca61093e88461f315e8ba739c75f1ef4504808` (24,140 bytes, with 22,884 bytes of loaded code and data and 2,124 bytes of BSS). The development and catalogue builders produced identical bytes, and the catalogue-wide rebuild passed against OS 1.40C.

GCC 16.2 generated five unsafe copy instructions in the previous package's `grain_start` and `grain_render`. After reading a value, each instruction advanced its pointer before computing the destination. Calling either wrapper shifted restored SRC words and SETUP bytes into neighboring slots. The generator now targets the MCF54455, uses the SDK's ColdFire compiler flags and checks the assembled object. The SRC and SETUP slot definitions stay in their original order.

With the six SRC settings from the MKII handoff (`66 64 127 127 127 64`), START followed by a render left `64 64 66 64 127 127` in the old binary's frame. This reproduces the MKII observation. The candidate retained the original values through START and both renders. GCC's stack figures give 604 bytes along the candidate's deepest audio call chain and 392 bytes along the waveform draw chain, including the return address for each Grain function.

| Case | Method | Result |
| --- | --- | --- |
| START and render on T1 and T5, both alternating frame buffers | Execute the linked ColdFire instructions with synthetic Flex callbacks and check all 48 bytes after each call. | The previous build failed all eight cases. The candidate passed all eight. |
| All eight tracks, both buffers, fractional POS and SIZE | `python3 -B verify_lanes.py` with Unicorn and m68k-elf binutils. Call START and then render and check the six words consumed by the renderer. | All 16 buffers retained their SRC, SETUP and neighboring bytes. The renderer read the expected words. |
| Position and sound | Run `test_grain.py`. | All 1,792 position/scatter cases, 28 optimized-path comparisons and three reference renders passed. |
| Six-voice pricing setup | Single sustained host trigger at 140 BPM, stereo 44.1 kHz, SIZE and DENS 127. Count nonzero voice lifetimes after each 16-frame render for two seconds. | RAND peaked at four voices. SYNC reached six in the block starting at frame 5,904 (134 ms). |
| Trial on emulated MKII, development base `06e08f35` | Install the candidate into an empty set and pick Grain on T1. | The trial installed and rolled back to its initial inventory. The emulator reported CPU FULL at 100% and refused the track pick. |

### Physical MKII control and pricing check

On 20 November 2026 the control-repair package ran on OS 1.40C, development base `06e08f35c62c02ce`, B16 Part 1. T1 played an 88,200-frame, 16-bit stereo Flex sample. Successive turns of SRC A through F changed only the corresponding rendered word. Both alternating buffers matched the Part. On SRC SETUP, MODE selected SYNC, SHAP reached SQR, and DIR and PAN changed their own Part bytes. The six nonzero voice lifetimes in the renderer confirmed full polyphony.

With T1 at 140 BPM, PTCH 66, POS 60, SIZE/DENS/SPRY 127, SCAN 73, DIR 12 and PAN 127, each six-second frame-interrupt reading followed at least 2.5 seconds of playing. Only T1’s trig mask changed between each pair.

| Playing B16 | Pair 1 | Pair 2 | Pair 3 |
| --- | ---: | ---: | ---: |
| T1 with no trigs | 26.8% | 26.9% | 26.9% |
| T1 with all 16 trigs | 60.1% | 60.8% | 60.8% |
| Added share | 33.3 points | 33.9 points | 33.9 points |

The guard reported zero skipped renders in all six windows. Rollback restored the entire pattern, the saved and working Part, and the development inventory. An intermediate package with a 34% admission price (`cf51ea65999e919861119b0801b52cedcf6d3de7b7558a3f1416536398d8e2a4`) repeated the same scene after the admission tests. The mean rose from 32.1% to 66.2%, a 34.1-point increase, with zero skipped renders. The rounded admission price is **35% per track**.

The final package is `329b40ef81606f3732680b33b0fb867272aedad45857aacf2d9996afdcec5327`. It differs from the control-repair package in exactly one byte, the admission price. The catalogue and development builders produced identical bytes.

The corrected scripted hardware test (PR #1878, `3e773208`) ran twice on the intermediate 34% package. T5’s solo audition on blank B16 added 15.8 points. The initial T1 assignment was refused with **WAS BUSY PLAYING** at 76% CPU. After playing without Grain, the unit accepted T1 and refused additional instances. A repeat with four trigs on each of T1 and T5 was refused on both tracks. The T1 display read 57% before adding the 34% reservation, which would exceed the 85% CPU threshold. Both runs completed all twelve Part changes and the self-test, restored the starting inventory, and logged no skipped track, stall, freeze or crash. Step 7 remains incomplete because of those admission refusals.

On the final 35% package, the MKII loaded Grain in RAM and refused to assign T1 in two trials. Its CPU FULL display showed UNIT IS BUSY at 50% and 51%. A track that would reach the 85% limit is refused. Both trials restored the working and saved Part, the pattern and the starting development inventory. These trials establish the final package’s admission behavior. The six-voice audio-path measurements above used its byte-identical renderer.

The author’s MKI status-meter readings and the frame-interrupt price answer different questions. The author saw about 14 points over the stopped project with default settings, and 21–22 on a dense stereo pattern. The MKII guard price covers the six-voice scene with SYNC, long grains and full pan. A lighter Part is needed to complete the scripted solo and multi-track qualification of the final package. The ordered procedure on the publication layout also stops at module:doctor because the worst-event timing, stock load comparison, stress evidence and formal qualification are outstanding. The soak and the musician’s listening and reboot stage remain open.

At the end of the session the unit was stopped on its original A01 pattern. It booted the starting base `dfa438130710fea9`. All ten module IDs, names, handles and layouts matched preflight. The card reported ten modules saved and ten live.

Earlier MKI and MKII records below describe their respective builds.

## Corrected POS and SPRY build, 20 November 2026

The USB package SHA-256 is `51f3abe9d750f53b372c953d44279e3b4f150807ddedba151f99f259a64ada68`. The historical MKI and emulator observations below predate this correction.

| Case | Method | Result |
| --- | --- | --- |
| Move POS from 101 to 102 on a four-minute, 44.1 kHz sample | Trigger one grain with SCAN and SPRY off and observe its first sample read. | Pass. The read advances from 189.375 s to 191.250 s. Before the fix it jumped to 1.032 s. POS 127 now reads 238.125 s. |
| Sweep position and scatter on long samples | `python3 -B test_grain.py` compares the position, scatter width and actual first read with 64-bit reference arithmetic. Seven lengths span one frame to 44,860,416 frames. | Pass. All 1,792 cases matched. The same test fails on the submitted engine. |
| Preserve the existing sound on short samples | The same command runs `verify.py`. | Pass. All 25 stereo and 3 mono comparisons and 3 reference renders matched, with zero skips. |
| Rebuild the native code and package | Regenerate with `generate.py` and run `generate.py --check` in the source-tools image (GCC 16.2). Compare the official Grain row with `module-dev-package.py`, then run the catalogue-wide USB rebuild against OS 1.40C. | Pass. Both builders produced the same Grain package. Tape Echo, Euclid, Analog BD and all other rebuilt rows matched their published packages. Play Modes stayed on the builder’s existing reviewed version. |

The package is 23,948 bytes on disk. The builder reports 22,692 bytes of loaded code and data plus 2,124 bytes of BSS (24,816 bytes combined). The engine uses existing Flex sample storage. GCC 16.2 with the flags from `generate.py`, `-fstack-usage` and `-fcallgraph-info=su` gives the following bounds for a single call into Grain. Each includes four extra bytes per function for the return address.

| Entry | Deepest chain inside Grain | Stack bound |
| --- | --- | --- |
| Audio render | `grain_render` (168), `gran_render` (420), `flex_page` (8). The sample reader installed by `flex_sample` is always `flex_page`. | 608 bytes |
| Waveform draw | `grain_draw` (208), `wave_area` (148), `vfill.part.0` (24). The page reader uses less stack. | 392 bytes |

These bounds cover Grain's own frames on those paths. Peak memory across overlapping callbacks, loader overhead and worst-case chip cycles remain unmeasured.

## Twelve-step procedure on the corrected USB package

On the release candidate, step 1 stopped at the publication requirements for performance, qualification, library generation and the author's board claim. To exercise the experimental tier, the maintainer staged the same Grain source under `sdk/drafts/grain` on a separate checkout and obtained a temporary maintainer claim. The runner was the one merged by PR #1835 (Git blob `d73e09acf6971c96fa0b8849c1c1e1c4e7db469c`). It used the USB package identified above throughout. The release candidate retained its publication gates.

| Step | Result on 20 November 2026 |
| --- | --- |
| 1–2. Software and compatibility | The experimental doctor passed, including its comparison with the other modules. The runner reports step 2 as covered in step 1 for a draft. |
| 3–4. Build and cost model | The runner verified the package hash. The catalogue cycle scan passed for its ten recorded DSP entries. Grain runs on the ColdFire and still needs its own cycle measurement. |
| 5. Emulator | The package ran for 20 seconds on an emulated MKII and rolled back to its starting identity. |
| 6. Read the MKII | OS 1.40C. The normal base `dfa438130710fea9` had ten modules saved and live. In a separate 20-second USB trial on that base, the device logged no crash, stall, freeze or skipped track. Undo restored its starting identity, and the inventory and all ten saved modules matched afterward. Step 7's transport query required a development base. |
| 7. MKII with six other modules | On development base `700f8e4f8baae0ce`, FLEX07 A01 Part 3, the unit self-test passed with all seven modules intact. All twelve Part switches completed. GRAIN was refused on T1 and T5. The LCD showed CPU FULL at 73% playback load before Grain's declared 15% cost. The runner marked the step failed. Undo restored the six-module inventory. After selecting the original Part, all four saved and working Parts matched their starting bytes. |
| 7. MKII with Grain alone | On development base `0ad7efc59d7bd8f4`, with the same pattern and Part, Grain played on T1 and T5. Their peak renders were 35.9% and 35.6% of one frame. The guard admitted three concurrent instances. All twelve Part switches completed. The original runner failed the two peaks against the declared 15% mean price and the unit independently logged one skipped T1 frame. Undo restored the empty starting inventory. |
| 8–12. Original #1835 run | The ordered runner stopped at step 7. Its soak, pricing, final inventory step, agent audition and submitter stage did not run. The inventory checks above were performed during the trials. |

### Corrected step 7 and handoff

On the same empty development base, the revised procedure compared six seconds of quiet with six seconds of repeated track auditions. T1 rose from 32.2% to 49.8% of a frame (+17.6 percentage points). T5 rose from 32.2% to 49.9% (+17.7 points). Both exceeded the declared 15%. The highest single renders were 36.2% and 37.2%. The guard admitted T1 through T3, all twelve Part switches completed, and the device logged 76,993 skipped renders across those tracks during the trial. Step 7 still fails. Steps 8–12 remain open.

A separate pricing run used FLEX07 B16, Part 1, T1 at 140 BPM with a stereo 16-bit, 44.1 kHz Flex sample of 88,200 frames. Three six-second windows with all 16 trigs active averaged 57.0–57.1% of a frame. The quiet windows averaged 33.0%. A repeat gave 57.0% active. The skip counter stayed constant across those windows. Only one distinct live grain was visible on the waveform, so this run could not establish the six-voice price.

The first six stored SRC values were `66 64 127 127 127 64`, while the live T1 words read `64 64 66 64 127 127`. A one-knob check on both alternating live lanes gave the following results. Word indices start at zero.

| Control moved | MKII observation | Current engine interpretation |
| --- | --- | --- |
| POS, 0 → 34 | Word 3 changed to 34. Word 1 stayed at 64. | DENS reads word 3. POS reads word 1. |
| DENS, 64 → 84 | Word 5 changed to 84. Word 3 stayed at 34. | SCAN reads word 5. DENS reads word 3. |

This build declared 15%. The control-buffer repair and six-voice MKII measurement at the top of this report resolve the live-word mismatch and replace that price.

At handoff the MKII booted the original normal base `dfa438130710fea9`. Its full module inventory matched the preflight capture, and card set 1 reported ten modules saved and ten live. The maintainer released the unit and the temporary Grain board claim.

#### Edge cases on the corrected package

| Case | How it was tested | Result |
| --- | --- | --- |
| POS crossing 101 to 102 on a four-minute sample and SPRY at the maximum Flex length | First-read checks and the randomized host sweep above | Passed on the host. A four-minute sample was not auditioned on the MKII. |
| Installing and undoing beside other modules | Timed USB trial on the normal base and a seven-module self-test on the development base | Passed. The original inventories returned. |
| Admission on a busy pattern | Try GRAIN on T1 and T5 alongside six other modules | Both picks showed CPU FULL. The original machines remained selected. |
| Several Grain tracks while playing | Step 7 placed Grain on consecutive tracks and swept its knobs | Three instances were admitted in the isolated run. The frame guard logged one skipped T1 frame. |
| User project and power-cycle persistence | The maintainer used volatile trials and restored the starting Part assignment | Still requires the submitter's keep, save, reload and power-cycle test on this exact package. |

The submitter's historical MKI audition and the emulator screenshots below cover earlier builds.

## What was tested on a unit (Octatrack MKI, OS 1.40C)
I installed Grain as a card set (`MODWERK0.SET`) on a Modwerk base built locally from the repository's sources
(USB Audio off variant), and played it:

- GRAIN appears in the machine list and plays a Flex sample; the sound was compared by ear with the engine it grew from.
- SRC page (waveform, POS line, live grains), SRC SETUP page (SHAP, DIR, PAN, MODE with the stock dials) and the third,
  full-screen page.
- POS in fine steps, speeding up with the turn; a pressed knob jumps by seven.
- Parameter changes with scenes and the crossfader, LFOs on the SRC knobs and parameter locks on trigs.
- Two Grain tracks at once (mono samples, with and without PAN) and three at once; a fourth and more were not tried. CPU read on the base's status screen: 44 % with no GRAIN;
  63–64 % with two tracks at DENS 64; 64–65 % with two tracks with PAN set at DENS 64 (mono samples: PAN makes the output stereo, the sample is not); 67–68 % with two tracks at high
  density and PAN; 73–74 % with both tracks at the maximum of DENS and PAN. DSP and memory readings did not change.
- The base's frame guard (mw_frame_sheds) was read on the unit with a debug build of an earlier version: it stayed at 0 while two Grain tracks played, so no render was swapped for silence.
- Project and Part saves keep everything: the track is still GRAIN and every knob is as set after a power cycle (confirmed by the author on 0.4.x). On 20 November 2026 the author repeated it on the MKI with a new bank, a new pattern and a new sample, POS, SIZE and DENS set, the Part and the project saved and a power cycle, then loaded another project and reloaded the first: the track, the sample and every knob came back as set. This was an earlier 0.4.x build on the author's local base, not the corrected USB package.
- Loading a sample from another folder through the sample pool keeps the track as Grain.

**CPU readings on the MKI, 20 November 2026.** One track playing one sustained note (a single trig, AMP HOLD at its maximum, a 64-step pattern, 140 BPM) with the engine's defaults and the base's CPU meter read by eye. The sample was **stereo**. The earlier readings above used **mono** samples with PAN spread; the author expected PAN to cost as much as a stereo sample, and these readings show a real stereo sample costs more. The DSP meters did not move (tracks 1 to 4 at 33 %, tracks 5 to 8 at 40 %): Grain runs only on the ColdFire.

| Case | CPU meter | Over the stopped project (43 %) |
| --- | --- | --- |
| Stopped | 43 % | – |
| One track, defaults (DENS 64, SIZE 64, SPRY 0, SCAN 0, PAN 0) | 56 to 58 % | about +14 |
| One track, DENS 100, SPRY 40, PAN 108 | 60 to 61 % | about +18 |
| One track, DENS 127, SPRY 127, SCAN at its maximum | 63 to 65 % | about +21 |
| Two tracks, DENS 100, SPRY 40, PAN 108 | 77 to 81 % | about +18 each |
| Three tracks, the same settings | 90 to 91 % | glitches audible |

The same stereo sample on a plain Flex track, and the 16-trig pattern of the MKII run (one track, 140 BPM, a trig on each of the 16 steps), read the same way:

| Case | CPU meter | Over the stopped project (43 %) |
| --- | --- | --- |
| Flex, LOOP on, one sustained note | 47 % | about +4 |
| Flex, 16 trigs | 49 to 50 % | about +6 to +7 |
| Grain, defaults, one sustained note | 56 to 58 % | about +14 |
| Grain, DENS 127, SPRY 127, SCAN at its maximum, one sustained note | 63 to 65 % | about +21 |
| Grain, the same settings, 16 trigs | 64 to 65 % | about +21 to +22 |

Grain costs about 10 points more than Flex with its defaults and about 15 more at its densest. The 16 trigs add nothing visible to Grain's cost: the settings decide it, not the pattern. The MKII run measured +24 points for the same pattern and settings (33 % to 57 %), close to the MKI's +21 to +22, though the two meters were read differently. Mono and stereo samples were not compared on the same settings.

## What was tested only in an emulator (ot_emu, MKII mode; not hardware)
- A power cycle with the stock-faithful Part check, on a base **without** any knowledge of GRAIN: the track comes back
  as GRAIN with DIR and PAN unchanged. This is the check behind the "every Part byte must pass stock's own check" rule.
- The three pages, the SETUP dials (drawn by stock's own dial routine with the real value, checked at several values), scenes
  and the crossfader, track switching in full screen.
- The sound of the engine is checked on a computer: reference WAVs and stereo cases are byte-identical after every
  optimization.

## Not tested
- **An MKII unit.** Everything above on hardware is an MKI.
- The published Modwerk base (the unit ran a local build of the same sources).
- Install over USB (only the card set was used).
- Worst-case cycle counts: only the base's CPU meter was read, as above.
- Sample slices, reverse playback, recorder buffers as the source, and a sample replaced while the note plays (a normal
  Flex track also stops when its sample is replaced during play).
- A project used with the module removed (the Part check is designed to pass; not tried on a unit).

## Stock flows
GRAIN changes one stock flow: PLAYBACK pressed a third time (from SRC SETUP) opens the full-screen page instead of going
back to SRC. Pressing PLAYBACK again closes it. FUNC + PLAYBACK still opens SRC SETUP. Everything else is as stock.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Two or more Grain tracks at once, mono samples, with PAN | every track keeps its own grains, read position and page cache in one shared render | Two tracks on the author's MKI with the pattern running; CPU read on the base's status screen | pass (MKI, an earlier build of this source) |
| Three Grain tracks at once; a fourth, or eight | one track costs 14 to 21 points of the CPU meter on the MKI (stereo sample, 20 November) and the base reserves 15 for it | Three tracks playing a sustained note on the MKI (the author), earlier at DENS 64 and on 20 November with DENS 100, SPRY 40 and PAN 108; a fourth and eight were not tried | partial (MKI): two tracks at 77 to 81 %; three tracks reach 90 to 91 % with audible glitches at the denser settings; not run for a fourth and eight |
| A Part and a project saved, then a power cycle | every value Grain stores in a Part must pass stock's own power-on check, with or without the module | Saved the project and the Parts on the MKI, switched off and on; in `ot_emu` a power cycle with the stock-faithful check on a base that knows nothing of Grain | pass (MKI by the author on 0.4.x; emulator on the GCC 13 build of the same source) |
| A project opened without the module, or on a unit without it | the track must read as Flex and no bank may be refused | Not run on a unit; the stored bytes were chosen to pass stock's check | not run: no unit run without the module |
| A sample picked from another folder through the sample pool | the pool opens from a Grain track and its file browser can hide the track from the machine | Picked samples from other folders on the MKI (the author, 0.4.x builds) and in `ot_emu`; the track stays Grain | pass (MKI, emulator) |
| Moving between Grain tracks and other pages while the full-screen page is open | the third press of PLAYBACK and the draw hook act on stock pages | On the MKI (the author, 0.4.x builds) and in `ot_emu`: other Grain tracks keep it open; AMP, LFO, FX pages and a non-Grain track leave it | pass (MKI, emulator) |
| Scenes, the crossfader and LFOs on the SRC knobs | POS and the other knobs are read from the track's live lane, where scenes and LFOs are applied | Moved the crossfader between scenes holding POS and others; LFOs on the SRC knobs, on the MKI | pass (MKI by the author) |
| Parameter locks on a trig | a locked POS takes a whole number; the fine eighths are for the knob | Locked knobs on trigs on the MKI (the author, 0.4.x builds) | pass (MKI) |
| A sample replaced while a note plays | the grains read the sample's own pages | The same on a Flex track: it stops until the next trig | pass: behaves as a Flex track does (MKI) |
| Pitch, pan and direction extremes, mono and stereo samples | the read paths are optimized for pitch 0 and for no pan | `verify.py` renders them with the optimized and the plain paths and compares the samples byte for byte: mono and stereo 16-bit, five read steps (pitch 0 and fractional steps, forwards and backwards), five settings with PAN 0 and 127, forwards, backwards and SYNC | pass (host) |
| 24-bit samples, slices, reverse playback and a recorder buffer as the source | the engine reads the top 16 bits of the sample pages; a recorder buffer's pages change while it records | Not run: the host gate uses 16-bit samples; the module reads the pages stock keeps, as AMIGA does | not run: the bit depth of the samples played on the MKI was not recorded |
| Installing over USB, replacing the module, removing it, Undo, a trial that expires | the loader and the machine list | Not run: the module was loaded as a card set only | not run: no USB session |
| An MKII unit | the keymap and the panel differ between the models | Not run | not run: no MKII at hand; the emulator was used in MKII mode, which is not hardware evidence |

An emulator result never counts as hardware evidence; every row says which it is.
