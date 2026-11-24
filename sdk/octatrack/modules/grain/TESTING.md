# GRAIN testing

Grain 0.1.3-experimental · by A Force Truly Evil.

## 0.1.3-experimental: trig keys, CHROMATIC keys and MIDI notes play grains, in tune, 23 November 2026

The package is `07b6e497b3513a7d9b1d32c278e26c0385d068e5d4a5dc2e1d96be04d916d865` (30,424 bytes), rebuilt with
`npm run octatrack:module-packages` (`--check`: identical). Two changes against 0.1.2: which START takes the plain Flex
path, and PTCH's units. The rest of the render path is 0.1.2's.

- **The report (owner, MKII):** Grain played the sample as a plain Flex when triggered from the trig keys, and CHROMATIC
  mode did not work.
- **Plain Flex, the cause (OS 1.40C):** stock calls START with `0xc0 | (the track's trig byte & 0x20)` (`0x4000d486`),
  and every manual trig sets that bit: trig keys (TRACKS mode, TRIG9-16 for tracks 1-8, `0x40044668`), CHROMATIC keys
  and MIDI notes all go through `0x40005030` with `0x1d`, as the pool's FUNC+YES audition does. 0.1.1 took every START
  with `0x20` for the audition. **Fix:** a START with `0x20` is the audition only while the pool window is open and the
  track is the selected one.
- **Out of tune, the cause:** stock writes a note's pitch into the trig's PTCH lock in Flex's units, 5 a semitone and 60
  an octave (CHROMATIC: `5 × key + 4`, `0x4004fc58`; MIDI: `5 × note − 100`, `0x4000e74c`; a value past 127 is not
  applied). Grain 0.1.2 read 1 unit as 1 semitone, so neighbouring keys played 5 semitones apart. **Fix (owner's
  choice):** PTCH in Flex's units, 4 to 124 (−12 to +12 semitones). The engine steps `2^((PTCH − 64) / 60)` from a
  128-entry table whose whole semitones are 0.1.2's Model-TG ratios; the knob keeps 0.1.2's feel (a semitone a detent
  on the 64 + 5n grid, FUNC to −12, 0, +12, a pressed knob seven semitones); the display shows semitones and a tenth
  between them. A PTCH saved by 0.1.2 now plays at a fifth of its transposition. The migration that added 40 to a PTCH
  below 40 (Parts from before 0.1.0) is gone: those values are valid now.
- **Host checks:** `verify_lanes.py` checks a `0xe0` START with the pool shut on all eight tracks (granular) and on another
  track while the pool is open (granular; the 0.1.2 build fails this), the compiled step for eight PTCH values against
  `2^((v − 64) / 60)` with their labels, and the knob step in the new units.

### Unit run on `e0bd4977` (the trig fix alone), 23 November 2026

MKII, OS 1.40C, development twin `95adb64b` (base 0.8's source with `--dev` and the beta flags, no trust rows), RAM-booted;
four timed trials of 200 to 300 s, each rolled back with "no crash, stall, freeze or skipped track logged". Bank E,
Part 1 (equal to its saved copy, saved once, then reloaded), Grain picked on T1 with slot 1 (16-bit stereo), one trig on
step 1 for F (removed afterwards). Grain's own memory lies above the development MEM range, so each case was told
apart by T1's longest guarded render in the `cpu` report, read in a window starting 0.3 s after the press: about 4 % of a
frame idle, 8 to 17 % for a plain Flex note, 23 to 35 % with Grain's engine. These are my readings, not the sound.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Trig key, pool shut | the reported fault | TRACKS mode, TRIG9 (T1) | pass: engine, 27.9 % |
| CHROMATIC keys | the report | CHROMATIC on T1: TRIG9, TRIG10, TRIG16, one octave up | engine, 26 to 30 %; lane PTCH 44, 49, 79, 104: 5 units a key, which 0.1.3 then made Grain read in tune |
| MIDI notes | the same START as a trig key | notes 60, 61, 72, 48 on channel 1 | pass: engine, 32 to 35 % |
| FUNC+YES in the pool on T1 | the audition must stay plain | double tap T1, FUNC+YES | pass: plain, 16.8 % |
| Trig key while the pool is open on T1 | a manual trig on the pool's own track | TRIG9 with the pool open | plain, 16.9 % (known limit, below) |
| Sequencer trig after the audition, pool open | the audition must end at the next trig | FUNC+YES, then PLAY | pass: engine, 26.6 % |
| Trig key after the pool closed | the audition must not stick | FUNC+YES, NO NO, TRIG9 | pass: engine, 23.0 % |
| Pool open on T5, trig key on T1 | only the selected track auditions | double tap T5, TRIG9 | pass: engine, 22.7 % |
| Put back | the owner's bank and Part | reload, step 1 trig removed, trig mode TRACKS, bank D | pass: bank E Part 1 equal to saved, bank D Part 1 working and saved copies byte-identical to before |

**Known limit:** a trig key pressed while the pool window is open on that same track plays a plain Flex, like the
audition: both arrive as the same START.

### Unit run on `07b6e497` (the release candidate), 23 November 2026

Same unit, twin and setup, RAM-booted again after the unit had come back on the flashed base; one timed trial of 240 s,
rolled back with "no crash, stall, freeze or skipped track logged", no loader refusal. Every case above was run again with
the same results (engine 23 to 29 %, plain Flex 8 %, the known limit unchanged). The PTCH knob on T1's SRC page, read in
the working Part:

| Case | How run | Result |
| --- | --- | --- |
| One detent is one semitone | `encA+1`, `encA+2` from 64 | pass: 69, then 79; the knob reads "+1" |
| FUNC + turn: octaves, always back to 0 | FUNC with `encA-1`, `+1`, `+1`, `-1` | pass: 64, 124, 124, 64 |
| A note reaches the engine at the knob's value | `encA-3`, `encA+1` (54, "-2"), TRIG9 | pass: the lane's PTCH word is 0x3600, engine |
| Put back | reload, step 1 trig removed, trig mode TRACKS, bank D, boot of the flashed base `e1152583` | pass: the same eight kept modules restored from the card, bank D Part 1 byte-identical |

### Frame cost on `07b6e497`: not releasable on a medium pattern, 23 November 2026

`npm run device:price -- --write --curve T1,T3 --pick-pattern 2 --measure-pattern 4 grain` on the same unit and twin,
after a power cycle (the Zoom pedal on USB had kept a RAM boot from coming back): C04 at 126 BPM, trigs on steps
1/5/9/13 of T1-T4, T6, T7 (the scene FM Synth 0.1.5's curve used), picks on empty C02; Grain on T1 and T3, the two
tracks whose Flex slots hold loaded samples. At rest Grain adds +0.1 points (it rests). Its first instance adds 33.3
points of the frame, so the medium pattern read 113.4 %, past the 100 % where the guard drops renders; the pick on T3
was refused, and alone on the medium pattern the base refused Grain's pick (on the empty pattern it was admitted, longest
frame 50.9 %, nothing dropped, no stall). That run asked for two tracks and wrote nothing; a second run the same
evening with `--curve T1` alone read the same (+33.3 points, 114.4 % on the medium pattern, refused there, admitted on
the empty one at 51.3 %) and wrote `evidence/frame-cost.json` (first 33.3, each 33.3), which admission charges. Bank C's
Part and both patterns were unchanged afterwards. The render path is 0.1.2's, so 0.1.2 costs the same. This release is
dated before 24 November 2026 (`RELEASE_COST_FROM`), so the overload is reported, not refused; the next Grain release is
held to a first instance that fits a medium pattern.

**Not tested:** listening (whether CHROMATIC keys and MIDI notes sound in tune is shown only by the host check of the
step and stock's units), a recorded CHROMATIC take, SCALE, a project saved with 0.1.2 and reloaded, MKI.

## 0.1.2-experimental: the sample is a ring, PTCH steps and 3 dB per grain, 22 November 2026

The package is `f961b458deb9f93bad68435630b4c55110d3d0ef732bdfc7886df461a6250f66` (30,308 bytes), rebuilt with
`scripts/octatrack-module-packages.py` (`--check`: identical; every other package unchanged). It loads 28,944 bytes of code and
data and reserves 2,864 of BSS (31,808 bytes of static memory); the deepest Grain-only audio stack is 768 bytes (`grain_render`
176, `gran_render` 392, `stereo_paged` 92 and `stereo_page` 84 by GCC's stack-usage report, plus four return addresses and 8 for
the frame pointers `link.w` saves; 760 in 0.1.1, where `gran_render` was 384).

- **The sample is a ring**, as in typical granular engines (the author's choice, 22 November 2026). A grain born past
  the end starts at the beginning and one born before the beginning starts at the end; a grain reading past an edge
  continues on the other side in its own direction. `mix_voices` splits each grain's frames so that no run reads past an
  edge; away from both edges a grain takes one run as before. Before the 3 dB cut below, the audio there was bit-identical to
  0.1.1 (host renders of a 12 s sample, until the sweep reaches the end); the 3 dB tables change every sample, so no render is
  identical to 0.1.1 now. On the marks sample, the far side of the edge went from 15-19 dB to
  76-77 dB in all four cases (POS at the end or the start, forwards or backwards). `range_test.c` checks both edges.
- **PTCH** has its own knob step (slot 0): one semitone a detent without the base's accumulation, FUNC + turn stops at
  -24, -12, 0, +12 and +24, a pressed knob moves 7. `verify_lanes.py` runs the compiled step on 18 cases.
- **3 dB per grain.** The window tables (`gen_tables.py`) peak 3 dB below full scale. On the author's
  `Ras_01_SineSteps` (mono, peak -0.3 dBFS) at POS 60.7, SIZE 79, DENS 127, the sum of six grains clipped in
  `gran_render` on 2.0 % (SPRY 4), 2.6 % (SPRY 5) and 2.0 % (SPRY 8) of the output samples; now 0.005 %, 0.02 % and
  0.04 %. Over 90 settings (SIZE 64-127, SPRY 2-64, three positions) 32 clipped, at worst 3.7 %; now 10, at worst
  0.04 %. SPRY 0 never clipped. The tables are the only change in `grain_core.s` from the build without the cut, so the cut
  itself costs nothing; the ring's cost is measured below.
  The `verify.py` and `verify_lanes.py` references were regenerated; the previous ones pass with the previous tables.

**On the MKI** (the author, OS 1.40C, official base `6d23e888` flashed, card set with Grain, E-Verb, Mini Verb,
syntiz, FM Synth, BBD Delay and Tape Echo): first with build `ee8419c2` (this release without the 3 dB), the set loaded,
PTCH stepped one semitone a detent and FUNC + turn reached 0, the edges wrapped, the pool kept Grain playing and the
audition played plain Flex. PTCH first jumped by several semitones per detent (+1, +11, +16): the project had SCALE =
MINOR, and the scale quantizer bundled with FM Synth steps PTCH in Flex units (5 a semitone); with SCALE OFF it stepped
correctly. A second Grain track was refused (CPU FULL), as the base's CPU price allows. Then the exact package
`f961b458` (card set `f6ca36c3`): `Ras_01_SineSteps` at POS 60.7, SIZE 79, DENS 127 and SPRY 4, 5 and 8 played clean;
the author heard the odd click only at extreme settings. PTCH, the edges, the pool and the audition behaved as with
`ee8419c2`. With `f961b458` the author then saved the project, powered the unit off and on, and Grain, its settings and the
sound came back as left. **Not recorded:** a power cycle with `ee8419c2`, more than one Grain track on the official base
(refused by its CPU price), MKII.

**CPU on the MKI, asked for in review** (the author, exact package `f961b458`, official base `6d23e888`, the stock CPU meter read by
eye, Grain on one track, DENS and SPRY at maximum, both samples 24-bit stereo). With the track stopped the meter read 49.5 %.

| Sample | PTCH | Meter | Grain adds |
| --- | --- | --- | --- |
| Kick, 0.03 MB (about 5,000 frames) | +24 | 70-71 % | about 21 |
| Stereo sample, 1.55 MB (about 6 s) | +24 | 68-69 % | about 19 |
| Stereo sample, 1.55 MB (about 6 s) | 0 | 66-67 % | about 17 |

At the same settings, repeated wraps on a very short sample cost about 2 meter points more than a long sample, and PTCH +24 about
2 more than PTCH 0. The price reserved in the descriptor is 17, from 0.1.1's largest paired run at PTCH 0; the long sample at
PTCH 0 matches it, the other two rows are 2 and 4 above it. The author heard no dropouts or artefacts, which at these settings is
hard to judge; skipped renders were not counted. 0.1.1 was not measured on these samples, so how much of the difference
belongs to 0.1.2 is not known. The 0.1.0 measurements in `evidence/performance.json` are historical.

## 0.1.1-experimental: the pool keeps Grain playing, 21 November 2026

The package is `1b3728c04f521b84…` (29,344 bytes; 27,988 bytes of code and data and 2,864 of BSS; the deepest Grain audio stack is 760 bytes, `grain_render` 176). It differs from the unit-tested build `c841ea878f467105…` in one byte, the descriptor's `reserved[1]` (0 there, 17 here), compared byte for byte.

- **The pool no longer stops Grain.** In 0.1.0 a Grain track played as a plain Flex for as long as the pool window was open on it, so opening the pool silenced the cloud and played the sample from its start on every trig. A probe build that logged every START on the owner's MKII showed the difference: sequencer trigs arrive with flags `0xc0`, with the pool shut or open, and the pool's FUNC+YES audition with `0xe0`. Now only a START with `0x20` takes the plain Flex path, for that track until its next ordinary trig. `verify_lanes.py` checks the pool open on T5 and T1 across all eight tracks (all granular) and an audition START on the pool's track (plain).
- **The meter it adds.** `resources.cpuMeter` and `reserved[1]` are 17: the largest of three paired runs in [cpu-meter.json](evidence/cpu-meter.json), +16.55 meter points on T5 with dense six-voice 24-bit stereo (side-first build), rounded up. A base that reads `reserved[1]` charges this in place of the 35-point price when it decides whether the unit is too busy for a pick; an older base ignores it.

**On the MKII** (OS 1.40C, base twin `0449ed78` in RAM, card in, the owner's project; `c841ea87`): with T1 playing Grain, the pool opened on T1 by a double tap, and Grain's six voices kept advancing. FUNC+YES held over USB stopped them (the plain path), and after the next trig they advanced again. The trial rolled back.

**Not tested:** listening to the pool and the audition on this build, the exact 0.1.1 package `1b3728c0` on a unit (only `reserved[1]` differs from what ran), the meter cost with 24-bit stereo on this build, project save and reload, MKI. **Still open, not in 0.1.1:** a click on every trig at SIZE 86, DENS 127, TRI and SYNC (owner's project, 134 BPM: one-sample steps every 1.791 s on T1's stem, with no frame-guard skips and no clipping).

## Release build: pool fixes, 21 November 2026

The release package is `ff5ac017118aa58850212e9bb7243ad933d654edadca1dc0f4db65c25dda56f5` (29,248 bytes; 27,908 bytes of code and data and 2,860 of BSS). It is the side-first build below plus three pool changes. Both the SDK and catalogue builders reproduce it.

- **The author's pool fixes (`3733d94f`).** With the sample pool open, a Grain track plays as a plain Flex with its factory SRC and SETUP values, so FUNC+YES auditions the sample rather than Grain's cloud. Pressing a Grain track's key while the pool is open on another track now lists that track's samples instead of an empty list.
- **The jump fix (maintainers, with the owner's OK).** On the MKII, after such a jump and closing the pool, the machine list kept seeing the track as Flex: FLEX could not be picked until another track was selected. It reproduced twice. A pool adopted on a jump now ends when the pool window closes. A pool opened on the Grain track itself still lasts until its SRC or SRC SETUP page is shown, so a sample loaded through the file browser keeps the track Grain.
- **The selected-track audition (`cc6bb25e`, the author).** With the pool window open, only the selected track, whose pool it is, takes the plain Flex path. Before, a pool opened on any track turned every Grain track plain; Grain on another track now keeps its granular sound. `verify_lanes.py` checks the pool open on T5 and on T1 across all eight tracks.

Only `grain_render` and `grain_start` changed on the audio path: each now checks whether the pool window is open on its own track. `gran_render` and `stereo_page` differ only in one table address. The deepest Grain audio stack is 756 bytes (`grain_render` 172; 764 and 180 in `394fa397`), including return addresses and saved frame pointers.

**On the MKII,** RAM only on the trace twin, card-free:
- `043e4485`, the author's commit without the jump fix, played the 100 BPM phrase with USB audio capture closed for one minute per track. T1 peaked at 345.1 µs and T5 at 329.1 µs. Neither track skipped a render or ran a frame over 362.8 µs, and six grains played.
- `394fa397`: the pool opened on T5 and a jump to T1 listed the recordings. After closing it, FLEX was picked on T1 at once. Grain played on T1 (stem RMS 0.36 and 0.56), the panel answered track selection, and the trial rolled back.
- After a pool opened on the Grain track and closed, a double tap and LEFT changed the track to FLEX.
- `ff5ac017`, the release, on a fresh boot after a power cycle: while T1 played Grain, its six voices kept advancing with the pool open on T5. With the pool open on T1 itself they stopped, because the audition took the plain Flex path, and they advanced again once it closed. The `394fa397` steps then gave the same result at every step: FLEX picked after the jump, Grain picked again and played (stem RMS 0.56 and 0.63), the panel answered, and the trial rolled back. Run straight after six-voice playback, the base's CPU guard refused the Grain re-pick (CPU FULL, 62 %, WAS BUSY PLAYING). That refusal comes from the guard's memory of the playing load, not from Grain.

**Known limit, also in the earlier builds:** after a pool opened on the Grain track from a page other than SRC and closed, FUNC+SRC cannot pick FLEX or STATIC until the SRC page is shown or another track is selected. A double tap and LEFT works.

**Not tested on this build:** the audition's sound (FUNC+YES over USB played nothing on any output, probably because the remote keys were not held; the plain path it takes was seen on `ff5ac017`), project save and reload, a full module set and the MKI. [Pool results](evidence/timing/pool-fixes.json)

## Side-first stereo mixer, 21 November 2026

The SDK and catalogue produce package `db843bc231090ede8e663fe603226cca1c429d614b3755e49200af0e36a7dfc8`. The stereo loop computes side first and then adds the right channel to recover mid exactly, including odd-valued samples, which removes one instruction per stereo voice sample. Constant-gain spans keep the loop end in the register otherwise used for the envelope phase. The page-edge path (`stereo_paged`) and the generic mixer (`mix_other`) are separate functions, keeping those paths outside the packed stereo loop. Six voices, Q15 arithmetic and the 35-point reservation are unchanged. Inlining the voice mixer instead barely changed the workload and was discarded.

| Compiled callback workload | Previous mean instructions | Side-first mean | Previous peak | Side-first peak |
| --- | ---: | ---: | ---: | ---: |
| Held controls | 2,783 | 2,726 | 7,315 | 7,140 |
| Moving position | 2,838 | 2,781 | 7,499 | 7,303 |
| SRC and window moving every callback | 2,736 | 2,707 | 9,629 | 9,427 |
| Packet lengths from the unit profile (2,789 callbacks) | 2,728 | 2,651 | 4,916 | 4,786 |

These are emulator instruction counts. Each 3,072-callback workload matched the previous package's PCM and all six voice states. A second comparison matched 4,096 combinations of sample format, pan, direction, pitch, window and short spans. Two-minute compiled runs on T1 and T5 each matched 5,292,000 stereo frames of the portable reference and reached six active voices. The recorder, Part and control-change workload of the previous section was not rerun.

The package occupies 28,404 bytes on disk. Its executable and static state occupy 29,988 bytes in RAM. The deepest Grain-only audio stack path is `grain_render` (156 bytes), `gran_render` (384), `stereo_paged` (92) and `stereo_page` (84) by GCC's stack-usage report, plus four return addresses: 732 bytes. GCC's figures leave out the frame pointer that `link.w` saves, so the path is 740 bytes on the unit. The same correction makes the previous package's 676 bytes 684.

The [static timing analysis](evidence/timing/candidate_bound.py) checks the linked executable byte for byte against the package. It bounds Grain's zero-wait render work at 157,940 core cycles for 16 source frames and 279,860 for 32 (18,386 and 32,850 instructions); a start callback stays at 796 cycles. The previous package's 247,832 and 453,976 were loose: its compiler emitted two copies of the silent page advance and the analysis counted one. Counting both under the same limit gives 167,120 and 297,616, so the side-first build is about 6% lower like for like. Both bounds exceed the 95,782-cycle frame budget before stock work, memory waits or interrupts are included, so the deadline is not certified.

### Card-free MKII comparison with Flex, one minute per arm

Each machine and track ran for one minute on RAM base `3a4c07fe` with the 20-channel USB layout linked into it; the developer chose one-minute arms over five. All four used one fresh 37,800-frame 24-bit stereo R3 recording, 44.1 kHz capture, 100 BPM and the same musical MIDI phrase (2,400 clocks, 200 note-ons, 200 note-offs and 50 modulation changes). The two tracks were tested separately, and stock Flex played the other track over MIDI in each arm. The developer physically removed the CF card before boot.

| Machine | Track | Slowest frame during playback | Skipped during playback |
| --- | --- | ---: | ---: |
| Stock Flex | T1 | 288.4 µs | 0 |
| Side-first Grain | T1 | 385.0 µs | 0 |
| Stock Flex | T5 | 287.1 µs | 0 |
| Side-first Grain | T5 | 388.7 µs | 1 |

Six grains played in both Grain arms. The longest guarded Grain callback was 127.4 µs on T1 and 123.7 µs on T5. Grain still exceeds the 362.8 µs whole-frame deadline on both tracks. Median CPU load during playback was 62.3% with Flex and 76.85% with Grain on T1, and 61.7% and 78.25% on T5. The captures recorded no timestamp gaps, and the unit recorded no MIDI receive errors or transmit drops.

All four post-STOP checks switched Parts, selected Flex and changed tracks; the UI and audio counters advanced through 29.4–29.7 seconds, and the crash and stall counters held. The recording fingerprint and the starting RAM state were verified on return. The shipping 0.7.12 base then ran the exact package alone for 12 seconds and rolled it back to the empty inventory. [Timing, MIDI, capture and restoration](evidence/timing/side-first-comparison.json)

In the first minute of its five-minute arms the previous package skipped 10 renders on T1 and 12 on T5, but on another recording and boot. The same-boot comparison below is the fair one.

### What the frame guard saw at each skip

A development twin of base `3a4c07fe`, identity `62ac89ff`, recorded the guard's inputs at every skip and every frame over 362.8 µs. It has the same sources and flags with only that trace added to the frame guard, and it is not part of any base release. On another fresh recording, T1 and T5 each played this package for one minute, then T5 played the previous package `0e4fc8dd` for one minute, all on the same boot.

| Package | Track | Skipped during playback | Frames over 362.8 µs | Slowest frame |
| --- | --- | ---: | ---: | ---: |
| Side-first `db843bc2` | T1 | 2 | 10 | 392.6 µs |
| Side-first `db843bc2` | T5 | 1 | 8 | 379.4 µs |
| Previous `0e4fc8dd` | T5 | 4 | 18 | 381.3 µs |

Skip counts this small vary between runs: the side-first T1 arm skipped 0 times above and 2 here.

The guard compares the time already spent in the frame, plus the render's recent cost and the work that followed it last frame, with an 80% share of the frame and its accumulated credit. All three side-first skips fell on the track's second render pass. Each came after one or two frames of 303–314 µs had drained the credit, and the prediction exceeded the share by 1.7–6.6 µs. Had Grain rendered at its predicted cost, those frames would have ended at 297–352 µs, inside the deadline. Two of the previous package's four skipped frames would have ended past it, at 366 and 420 µs.

In the frames over the deadline, the side-first package's two passes took 117–154 µs on T1 and 90–106 µs on T5. Everything else in the frame interrupt took 223–247 µs and 262–275 µs. Eleven of the eighteen were over by less than 4 µs and the worst by 29.8 µs. Meeting the deadline therefore needs the Grain render up to about 30 µs shorter in the frames where stock's own work peaks. At their predicted cost, the remaining skips came from the guard's 80% margin, not from frames that would have missed the deadline. The trace adds a few stores per render. [Skip and overrun records](evidence/timing/guard-trace.json)

### The shipping setup: USB audio closed, a MIDI flood and the stems

USB audio is optional on a shipping unit, and its default layout is the leanest one; the twenty-channel layout above is the heaviest option. On the same trace twin, card-free, this package played one minute per arm with the host's USB audio capture closed, so the base streamed no audio. The lean Main layout lies between the two cases and was not measured.

| Arm | Track | Skipped | Frames over 362.8 µs | Slowest frame | Longest Grain callback |
| --- | --- | ---: | ---: | ---: | ---: |
| Capture closed, 100 BPM phrase | T1 | 0 | 0 | 326.5 µs | 118.3 µs |
| Capture closed, 100 BPM phrase | T5 | 0 | 0 | 317.8 µs | 113.6 µs |
| Capture closed, MIDI flood | T1 | 0 | 0 | 358.2 µs | 124.9 µs |
| Twenty-channel capture, 100 BPM phrase | T1 | 0 | 12 | 383.3 µs | 124.1 µs |

The flood sent a 240 BPM clock plus a note-on, note-off or CC message every millisecond on channels 1 and 5, 1,096 messages a second for 50 seconds. It ended holding a note on both tracks. STOP then came mid-note, followed by a change to Part 1 and back to Part 3. The unit recorded no MIDI receive errors or transmit drops. The panel switched Parts, returned the track to Flex and answered track selection through 30.6 seconds after STOP, and the crash and stall counters held. The flood's notes and CCs also started the stock T1 and T5 recorders, which the recorder reset emptied afterwards.

A separate 40-second capture held a note on both tracks through STOP, a second STOP and the note-off. In the second before STOP the Grain stem's RMS was 0.68 and the Flex stem's 0.63. From half a second after STOP until the note-off both were silent (0.0000 and 0.0001), so no Grain note was left sounding. Grain's voice-state words stay nonzero after STOP; they are retained state, not sounding voices.

The capture tool's count of repeated 128-frame blocks on the Grain stem (557 here) is clipping, not a stutter. The stem was saved and analysed: every repeated block is constant, 387 of them pinned at full scale, and none repeats changing audio. 53% of the Grain stem's samples sit at full scale with this loud recording and dense setting, against 3.4% for stock Flex on the same recording. The level of six overlapping grains is for the listening check.

The RAM boot back to the shipping base after these arms hung: the startup animation kept running, the controls and USB did not respond, and the unit's log holds no crash or stall record for that boot. Grain's trial had already been rolled back and no module was live. A power cycle with the CF card booted the flashed base and the card set. [Arms, flood, held-note probe and stem analysis](evidence/timing/release-bar.json)

### USB Keep and power cycle on the shipping base

On the MKII's flashed shipping base `254c5a75`, with the CF card in, the owner's kept set held screen-off and USB AUDIO. Over USB, `npm run device -- try public/octatrack-modules/grain/0.1.0-experimental.mwrm --accept` kept this exact package (`db843bc2`) beside them. The trial verdict logged no crash, stall, freeze or skipped track, and the card set read 3 modules saved and 3 live. After a power cycle the set restored at start with all three live, Grain included. `remove … --accept` then took Grain out again, leaving 2 saved and 2 live. After a second power cycle the original two-module set restored at start. Grain was not assigned to a track in the owner's project, and no project was saved.

## Compact six-voice synthesis loop, 21 November 2026

The SDK and catalogue produce package `0e4fc8dd6a3bfc60ee60321a83bda82866adaedad8b555834ecdfb6b6dee6f21`. Its stereo loop reads the fractional sample step from a register and mixes one sample per iteration. It keeps the improved page check, Q15 arithmetic, six voices and 35-point reservation. The four-sample build below is retained as a comparison.

| Compiled callback workload | Previous mean instructions | Compact mean | Previous peak | Compact peak |
| --- | ---: | ---: | ---: | ---: |
| Held controls | 3,041 | 2,783 | 7,604 | 7,315 |
| Moving position | 3,079 | 2,838 | 7,643 | 7,499 |
| Recorder, Part and control changes | 2,971 | 2,610 | 11,603 | 10,184 |
| SRC and window moving every callback | 3,126 | 2,736 | 12,615 | 9,629 |

All 12,288 compiled callbacks matched the preceding draft’s PCM and voice state. A second comparison matched all 4,096 combinations of short spans, formats, pan, direction, pitch, window and source edges. A further 2,789 callbacks used the packet-length distribution from the previous unit profile. Two-minute compiled runs on T1 and T5 each matched 5,292,000 stereo frames of the portable reference.

The package occupies 28,612 bytes on disk. Its executable and static state occupy 30,196 bytes in RAM. The deepest Grain-only audio stack path uses 676 bytes including three return addresses. The static bounds for Grain’s zero-wait work are 247,832 core cycles for 16 source frames and 453,976 for 32. They exceed the 95,782-cycle frame budget before stock work, memory waits or interrupts are included.

### Card-free MKII synthesis comparison with Flex

Each machine and track ran for five minutes on RAM base `3a4c07fe` with the 20-channel USB layout linked into it. All four used the same 37,800-frame stereo R3 recording, 24-bit samples, 44.1 kHz capture, 100 BPM and the same musical MIDI phrase. The two tracks were tested separately. The Flex controls ran before the compact arms on the same boot. Stock Flex played the other track over MIDI in each arm. The developer physically removed the CF card before boot.

| Machine | Track | Slowest frame during playback | Skipped during playback | Total through STOP and panel checks |
| --- | --- | ---: | ---: | ---: |
| Stock Flex | T1 | 296.0 µs | 0 | 0 |
| Six-voice Grain | T1 | 392.0 µs | 15 | 15 |
| Stock Flex | T5 | 310.7 µs | 0 | 0 |
| Six-voice Grain | T5 | 395.4 µs | 33 | 33 |

The skip counter records occasions when the base substitutes silence for a guarded machine render to preserve frame headroom. Stock Flex runs directly. Whole-frame timing and USB capture continuity were measured in all four arms.

The compact build exceeded the 362.8 µs whole-frame deadline on both tracks. Its longest guarded Grain callback was 130.3 µs on T1 and 124.5 µs on T5.

All four post-STOP checks switched Parts, selected Flex and changed tracks. The UI and audio counters advanced through 29.1–30.6 seconds. The recording fingerprint and the starting RAM state were verified on return. The shipping 0.7.12 base subsequently ran the exact compact package alone for 12 seconds and rolled it back. An independent USB session confirmed the original base and an empty inventory before the hardware reservation was released. The earlier high-rate panel freeze remains open. [Timing, MIDI, capture and restoration](evidence/timing/synthesis-comparison.json).

The first build (`d09bd8f8`) used a four-sample loop and read the fractional step from the stack. It skipped 2,837 renders in T1 playback and 3,338 on T5 (3,346 including STOP and panel checks on T5). The compact loop keeps that step in a register. Both builds matched the reference PCM. The register placement and the loop size changed together.

The previous draft (`7d5cf2e7`) ran a separate one-minute T1 comparison on this recording and skipped 25 renders. In their first measured minute the four-sample build skipped 563 and the compact build skipped 10. All three used the same MIDI phrase. The earlier five-minute measurements of the previous draft are recorded below.

Median CPU load during playback on T1 was 62.1% with Flex and 77.6% with Grain. On T5 it was 62.2% and 78.1%. Across the four runs the captures recorded 0 timestamp gaps. The unit recorded 0 MIDI receive errors and 0 transmit drops.

The hardware kernel fixture ran 512 six-voice calls per build with no capture or MIDI. The compact fixture matched all 64 PCM digests. Its trial rollback reported the cumulative 6,183 guard skips already counted in the four earlier playback runs. The full musical runs above record their own before/after counters. Maximum fixture timings include preemption by the audio interrupt.

The compact package also passed the MKII emulator's T1/T5 transport, Part-recall, Flex-selection and rollback checks on development base `fac1523234f4bb0b`. The paced transport reported zero live audio frames. A separate tick-driven fixture with the same mixer object ran 512 six-voice renders and matched all 64 reference PCM fingerprints.

## Four-sample synthesis experiment, 21 November 2026

SDK and catalogue builds reproduced package `d09bd8f8ce95acd398d13ab91191da6d5288313c9c442988435b1224641234a5`. Both stereo widths use the page-bounded mixer. It processes four frames per loop and enters the first group at the correct sample for shorter spans. The Q15 rounding and intermediate mid/side clipping are preserved. The voice limit is six and the reservation is 35 points.

| Compiled callback workload | Previous mean instructions | Candidate mean | Previous peak | Candidate peak |
| --- | ---: | ---: | ---: | ---: |
| Held controls | 3,041 | 2,734 | 7,604 | 7,105 |
| Moving position | 3,079 | 2,790 | 7,643 | 7,307 |
| Recorder, Part and control changes | 2,971 | 2,592 | 11,603 | 10,184 |
| SRC and window moving every callback | 3,126 | 2,717 | 12,615 | 9,629 |

All 12,288 full callbacks matched the preceding package's PCM and six voice states. A separate 4,096-case comparison covered lengths 1 through 32, mono and stereo, 16- and 24-bit data, four windows, fractional and integer pitch, forward and reverse voices, pan and source edges. Two-minute T1 and T5 runs each matched all 5,292,000 portable reference stereo frames. The compiled split-span regression checks a guard word after each output and compares the summed spans to the existing reference fingerprint.

The MKII emulator on development base `fac1523234f4bb0b` loaded this package, recalled the prepared Grain assignment on T1 and T5, reported PLAY and STOP on each, switched Parts, returned each track to Flex and rolled back. Its live audio-frame counter stayed at zero under paced transport. A separate tick-driven emulator fixture linked the same compiled mixer object and verified all 64 portable PCM fingerprints across 512 six-voice 24-bit stereo renders on T1 and T5. These emulator timings do not qualify the unit.

The 31,232-byte package loads 29,960 bytes of code/data and 2,856 bytes of BSS. GCC's stack-usage build produced identical assembly and bounds the deepest Grain-only audio call chain at 672 bytes including three return addresses. The conditional zero-wait [timing model](evidence/timing/candidate_bound.py) does not establish the 95,782-core-cycle frame deadline.

## Six-voice preparation candidate, 21 November 2026

The private SDK and catalogue builds produced `7d5cf2e739a0f99d5c8be4f5a0629e2a46691314cacf2ee5dace54ccf517aa1b`. The render callback reuses validated Flex geometry while checking the live recorder, descriptor and page map on every call. POS slides update only position when the other controls hold. Six occupied voices can skip the remaining spawn attempts within a block. The voice limit, 35-point admission price and mixer arithmetic are the same as in `9ad52855`.

| Compiled callback workload | Previous mean instructions | Candidate mean | Previous peak | Candidate peak |
| --- | ---: | ---: | ---: | ---: |
| Held controls | 3,174 | 3,041 | 7,845 | 7,604 |
| Moving position | 3,289 | 3,079 | 7,962 | 7,643 |
| Recorder, Part and control changes | 3,058 | 2,971 | 11,769 | 11,603 |
| SRC and window controls moving each callback | 3,166 | 3,126 | 12,608 | 12,615 |

Each row compares 3,072 compiled callbacks with stock packet framing simulated. PCM and six voice states matched the preceding binary on all 12,288 calls. Across 512 calls per preparation measurement, average instructions before entering the mixer fell from 512 to 382 with held controls and from 619 to 412 with moving position. The largest candidate preparation count was 657, compared with 628 and 636 respectively. A separate 512-case kernel comparison matched all PCM and cursors. Two-minute T1 and T5 engine runs each matched 5,292,000 reference stereo frames.

The package loads 27,220 bytes of code and data and 2,856 bytes of zero-initialized state. GCC bounds the deepest Grain-only audio path at 680 stack bytes including return addresses. The [static timing analysis](evidence/timing/candidate_bound.py) bounds the module's zero-wait render work at 188,024 core cycles for 16 source frames and 344,312 for 32. Both exceed the 95,782-cycle whole-frame budget before stock work, memory waits and interrupts. Hardware qualification remains open.

### Card-free MKII comparison with Flex

Four five-minute playback runs used RAM base `3a4c07fe` with the 20-channel USB layout linked into it. All four used the same 37,800-frame stereo R3 recording, 24-bit samples, 44.1 kHz capture, 100 BPM and the same musical MIDI phrase. The two tracks were tested separately. Stock Flex played the other track over MIDI in each arm. The developer physically removed the CF card before boot.

| Machine | Track | Slowest frame during playback | Skipped during playback | Total through STOP and panel checks |
| --- | --- | ---: | ---: | ---: |
| Stock Flex | T1 | 307.0 µs | 0 | 0 |
| Six-voice Grain | T1 | 373.1 µs | 141 | 141 |
| Stock Flex | T5 | 308.1 µs | 0 | 0 |
| Six-voice Grain | T5 | 368.8 µs | 259 | 259 |

The skip counter records occasions when the base substitutes silence for a guarded machine render to preserve frame headroom. Stock Flex runs directly. Whole-frame timing and USB capture continuity were measured in all four arms.

All four post-STOP checks switched Parts, selected Flex and changed tracks. The UI and audio counters advanced through 28.7–30.1 seconds. The recording fingerprint and the starting RAM state were verified on return. The shipping base returned with zero saved and live modules, and the hardware reservation was released. The earlier high-rate panel freeze remains open. [Timing, MIDI, capture and restoration](evidence/timing/preparation-comparison.json).

A separate profiling build sampled one in 97 callbacks during a one-minute T1 run. For the longest sampled 16-source-frame callback (120.15 µs), lane and stock Flex work accounted for 20.84 µs, packet, control and source preparation for 8.85 µs, granular synthesis for 90.15 µs and control restoration for 0.31 µs. The profiler matched the candidate in 3,072 compiled PCM and cursor comparisons.

The profiler sampled 2,789 callbacks, including 702 with 16 source frames. Across that group the preparation stage averaged 6.64 µs and synthesis averaged 43.53 µs.

Two further five-minute runs on the same boot and R3 recording measured the previous package `9ad52855`. On T1 it skipped 2,540 renders during playback and peaked at 399.2 µs. On T5 it skipped 4,542 and peaked at 380.1 µs. The preparation changes reduced playback skips by 94.4% on T1 and 94.3% on T5.

Median CPU load during playback on T1 was 62.2% with Flex and 78.3% with Grain. On T5 it was 62.2% and 79.4%. Across the four runs the captures recorded 0 timestamp gaps. The unit recorded 0 MIDI receive errors and 0 transmit drops.

## Packed stereo mixer candidate, 21 November 2026

The private SDK build and the catalogue builder produced package `9ad5285502117695e906dc90770840990008cea1a19398b8d2f395e870238443`. It keeps six voices and the 35-point admission price. The ColdFire mixes a 24-bit stereo page in one register-resident loop and reads the Flex page map once per callback. A second take in the same recorder slot can replace the first take's physical pages between callbacks. The compiled test remapped R3 and verified both its page address and the change in output PCM.

The 512 ColdFire comparisons matched the previous six-voice package (`ac1e5540`) for every PCM word and every voice cursor. Both 120-second compiled soaks reached six voices. T1 and T5 each matched all 5,292,000 stereo frames of the portable reference, SHA-256 `7f45ce08b48ea409323cd4bad3df6088283e31d1ab628d0f7a7e4b8e8979bb47`. The 1,600 paged blocks, 48 sparse-page cases, 256 SCAN values, and assignment and return-to-Flex checks also passed.

All 64 six-voice timing fixtures executed fewer instructions. Counts cover the granular kernel and its synthetic page resolver.

| Source frames | Page crossing | Previous mean | Candidate mean | Previous peak | Candidate peak |
| --- | --- | ---: | ---: | ---: | ---: |
| 16 | No | 5,780.1 | 4,684.9 | 5,961 | 4,793 |
| 16 | Yes | 6,932.8 | 5,853.2 | 7,195 | 6,030 |
| 32 | No | 10,257.5 | 8,054.2 | 10,617 | 8,281 |
| 32 | Yes | 11,411.9 | 9,224.4 | 11,855 | 9,522 |

The full callback matched PCM and all six voice states in 3,072 comparisons across T1 and T5, including changes to pitch, fine position, window and mode. Of those callbacks, 2,560 ran with six active grains. The largest observed instruction count fell from 9,740 to 7,962.

In the MKII emulator, STOP, switching away from and back to the Grain Part, choosing Flex again, and selecting another track worked on both T1 and T5. These panel checks used development base `fac1523234f4bb0b`. On the card-free shipping base `254c5a75a139255e`, Grain and USB Audio each ran and rolled back in a single-package emulator trial. The two-package set request stopped at verification. The base requires its card-set restore before it can verify a whole-set trial. The card-free hardware comparison therefore uses a development build with the 20-channel layout linked into the base.

The [static timing analysis](evidence/timing/candidate_bound.py) checks the identity of the linked package. A start callback is bounded at 70 instructions and 796 zero-wait core cycles. For 16 source frames, the render bounds are 21,453 instructions and 186,620 cycles. For 32 frames they are 39,517 instructions and 343,420 cycles. These conservative bounds exceed the 95,782-cycle frame budget before stock calls, memory contention and interrupts are accounted for. They do not certify the deadline.

The package is 27,280 bytes. The loaded image is 26,076 bytes with 2,440 bytes of BSS, totaling 28,516 bytes of static RAM. GCC's Grain-only stack bounds include return addresses and reach 668 bytes for the audio callback.

### Card-free MKII playback on the packed stereo build

The MKII loaded package `9ad52855` alone on shipping base 0.7.12 (`254c5a75a139255e`) in a 12-second RAM trial and rolled it back to the empty inventory. For the four playback runs, development base `3a4c07fe4df32e41` supplied the 20-channel USB layout and panel telemetry. The source was a 37,800-frame 24-bit stereo recording in R3. Seven inspected pages contained distinct channels and nonzero low bytes. Each five-minute run used 20-channel CoreAudio capture at 44.1 kHz and the same 100 BPM MIDI phrase with 12,000 clocks, 1,000 note-ons, 1,000 note-offs and 250 modulation changes. T1 and T5 shared R3. One track played Grain per run within the 45-point Part budget.

| Machine | Track | Longest observed frame | Playback skips | Total skips including STOP and chooser |
| --- | --- | ---: | ---: | ---: |
| Stock Flex | T1 | 296.0 µs | 0 | 0 |
| Grain, six voices | T1 | 382.1 µs | 3,185 | 3,187 |
| Stock Flex | T5 | 300.1 µs | 0 | 0 |
| Grain, six voices | T5 | 385.9 µs | 3,924 | 3,941 |

The audio-frame deadline is 362.8 µs. Six grains played on both tested tracks. All four captures contained stereo signal, had continuous host timestamps, and recorded zero MIDI receive errors or transmit drops. Following STOP, the panel switched Parts and restored the assignment, returned the track to Flex, and responded to track selection through the final 29–31-second observation. The crash and stall counters held. The earlier panel freeze remains unresolved. This normalized recorder-input test covers render load and transport behavior. Musical listening and reboot qualification remain open.

The isolated timing fixture sampled the release renderer on a preemptible UI tick. Across 512 calls, all 64 PCM fingerprints matched, and the longest observed call took 36,282 timer ticks (274.9 µs). The frame numbers above measure live playback with stock work, USB capture and musical MIDI. [Per-phase timing, audio checks and restoration](evidence/timing/packed-stereo-comparison.json).

A private profiling build sampled one in 97 callbacks during a one-minute T1 run. All 3,072 compiled PCM and voice-state comparisons matched the tested package. The 2,717 physical samples included a 129.3 µs callback for 16 source frames. Its measured components were 30.4 µs for the lane and stock Flex render, 38.2 µs for packet handling, controls and source lookup, 60.5 µs for granular synthesis, and 0.2 µs for restoring the lane. A bit-identical instruction scheduling experiment had a lower single maximum in the preemptible timing fixture, but its 512-call mean rose from 83.5 to 86.5 µs. The tested package keeps the original schedule.

The original R3 fingerprint matched after the runs. The scratch and starting patterns and Parts matched their snapshots. The eight empty recorders, original tempo and track selection were restored. The normal shipping base returned with zero saved and live modules, and the hardware reservation was released.

## Six-voice private build, 21 November 2026

The SDK reproduced private package `ac1e55403bf37b39c529501d30c610c5f055ef73b04a359c25b07b023d6d51bd`. The comparison package was the draft at `402780562`, SHA-256 `0c5632f677aecd873b11ae71a82ac5d72c3357d1dd43ccdb1dfc545cd3a5f38a`. Both have six voices and a 35-point reservation. The new package occupies 26,860 bytes on disk with 25,696 bytes of image and 2,120 bytes of BSS. GCC's stack-usage output, checked against identical production assembly, gives 688 bytes for the deepest Grain-owned render chain including return addresses.

**Render drops.** In the saved hardware comparison below, the guard skipped the six-voice T1 callback 648 times during playback with MIDI and 20-channel USB capture. The guard uses the previous callback cost, the remaining work in the frame and available credit. The counters identify the skipped callback but do not identify its sample position. In the previous renderer, one voice crossing a Flex page boundary sent its entire packet through the scalar mixer. The candidate runs the stereo mixer up to each boundary, then resumes it on the next mapped page. In the packed 24-bit loop, two indexed loads address each stereo frame and the grain's pan direction is chosen outside the loop.

The original 64 timing fixtures use six voices, native 1,024-frame pages, fractional pitch, forward and reverse grains and all four windows. The figures below count instructions executed in `gran_render`, including its synthetic page lookup, in the ColdFire emulator. Each row covers 16 cases. All 64 improved and matched the saved reference PCM fingerprints.

| Source frames | Page crossing | Mean instructions, draft → candidate | Largest observed, draft → candidate |
|---|---|---:|---:|
| 16 | No | 6,288 → 5,780 | 6,608 → 5,961 |
| 16 | Yes | 10,004 → 6,933 | 10,011 → 7,195 |
| 32 | No | 11,306 → 10,258 | 11,936 → 10,617 |
| 32 | Yes | 18,839 → 11,412 | 18,849 → 11,855 |

To repeat, export `sdk/octatrack/modules/grain/grain_core.s` from commit `402780562` and pass that file and the candidate assembly to [compare_render.py](evidence/timing/compare_render.py). The 512-case compiled comparison matched the draft PCM and all six grain states. Two 120-second software soaks, on engine tracks T1 and T5 separately, each rendered 5,292,000 stereo frames with six voices reached. Every sample matched the portable reference, SHA-256 `7f45ce08b48ea409323cd4bad3df6088283e31d1ab628d0f7a7e4b8e8979bb47`. The native paged tests also passed with address and undefined-behavior sanitizers, including 48 cases with holes, short final pages, and grains crossing into and out of silence.

**Panel freeze.** The saved hardware run that froze used two voices. It had zero render skips. Audio frames continued after STOP while the UI tick stayed at 72,115 for at least 27 seconds. The chooser never confirmed a switch to Flex. The stock control kept responding to track selection. The trace contains no faulting UI program counter and does not establish that Grain's unassignment callback ran.

On a successful switch back to Flex the base already reloads the track from the Part. The draft also queued six stock SRC writes and six live SETUP writes on the next UI tick for each changed track. The candidate removes that second update. On entry from Flex it uses the same per-track refresh as the base's standard machine assignment. The compiled callback tests check the stock call counts, both copies of the Part, reselecting Grain, and changes to an inactive Part.

The full-system emulator ran the OS 1.40C development twin `fac1523234f4bb0b` twice, once with the draft and once with the candidate. With a simulated existing Grain Part on each track separately, stock applied the six live SETUP values, the panel played and stopped, the ordinary chooser switched T1 and T5 back to Flex, and T2/T5 track selection responded afterward. Both trials rolled back. The normal transition also passed on the draft, so this comparison does not reproduce the hardware freeze. A separate fresh-entry chooser attempt on the 0.7.13 emulator showed CPU FULL at 100%. These checks exercise control transitions. The matched hardware test below uses the same STOP, machine chooser and track-selection actions with both machines.

### Card-free MKII comparison against stock Flex

On OS 1.40C, development base `fac1523234f4bb0b`, the six-voice `ac1e5540` candidate missed renders on both tracks. Each run used the same 37,800-frame 24-bit stereo recording from recorder 3. The two channels differed and contained nonzero low bytes. The Part was A16, Part 3 at 100 BPM, with no effects and six untriggered THRU tracks. T1 and T5 each took a turn as the test track with 16 trigs. The other Flex track received notes through MIDI. One Grain instance booked 35 of the 45 available points. SIZE, DENS, SPRY and PAN were at maximum, with fractional pitch, mixed direction, SYNC and opposite SCAN endpoints on the two tracks. Both Grain runs reached six voices.

Each capture received all 20 USB audio channels at 44.1 kHz. During 60 seconds of playback, the same musical MIDI phrase sent 2,400 clocks, 200 note-ons, 200 note-offs and 50 modulation changes. The audio deadline was 362.8 µs per frame. The two callback columns give the largest first and second pass individually. The guard instruments custom machines. Whole-interrupt timing provides the common measure for stock Flex.

| Playback with USB capture | Peak interrupt | Mean frame load | Peak callback, first / second pass | Skips during playback | Skips through STOP and panel checks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flex T1 | 270.3 µs (74.5%) | 48.2% | — | 0 | 0 |
| Flex T5 | 303.4 µs (83.6%) | 48.3% | — | 0 | 0 |
| Grain T1 | 383.0 µs (105.6%) | 72.0% | 125.8 / 136.2 µs | 842 | 842 |
| Grain T5 | 392.2 µs (108.1%) | 73.0% | 120.8 / 132.0 µs | 1,039 | 1,043 |

With USB audio capture closed, both Grain tracks reached six voices and completed the same MIDI passage with zero skips. T1 peaked at 337.5 µs (93.0%) and T5 at 333.5 µs (91.9%). Opening capture raised the mean interrupt load by 14.5 percentage points on both tracks. This isolates a loss of frame headroom under the combined workload. The timing traces do not resolve the individual memory access or instruction responsible for a skip.

The four captures had continuous CoreAudio timestamps, stereo signal on each test stem and MAIN, and zero MIDI receive errors or transmit drops. During the 55 seconds analyzed, 1,398 nonzero 128-frame blocks on the T1 Grain stem exactly repeated the preceding block. The T5 count was 725. Stock Flex had zero in either run. The block comparison and the render guard count different events. The panel accepted STOP, the Flex chooser and T2/T5 selections in all four runs. Panel ticks and audio frames kept advancing for at least 29 seconds after STOP, with no new crash, stall or loader error. The earlier high-rate MIDI freeze remains unverified with this candidate. [Hardware measurements](evidence/timing/six-voice-comparison.json)

The full R3 PCM hash matched before and after all six runs. Both trials for each track rolled back. The original working Part, A02 and scratch A16 pattern bytes, both scratch Part copies, T3 selection and 140 BPM matched preflight. All eight recorders returned to their empty 16-bit settings. The initial base `254c5a75a139255e` came back with zero saved and zero live modules on the card-free boot. The first T5 stock attempt stopped before playback when the host could not write its log. The table uses the complete repeat.

### Static timing of the six-voice candidate

The [candidate timing analysis](evidence/timing/candidate_bound.py) checks the linked executable byte for byte against package `ac1e5540`. It bounds the module's own code across six voices, including page crossings and failed page lookups. Each result covers one callback. Both passes on a track can contribute to the same audio interrupt.

| Callback | Source frames | Instruction upper bound | Core-cycle upper bound in the zero-wait model |
| --- | ---: | ---: | ---: |
| Start | 16 or 32 | 187 | 1,680 |
| Render | 16 | 32,651 | 298,008 |
| Render | 32 | 62,091 | 566,936 |

These conservative bounds allow combinations of branches that may never occur together. The core model assumes instructions are available and memory has zero wait states. Stock Flex calls, SDRAM contention and interrupts require separate accounting. The bounds exceed the 95,782-core-cycle frame budget and leave the end-to-end deadline unproven.

## Sustained MIDI with 24-bit playback and USB audio on base 0.7.11

The card-free MKII ran the 0.7.11 development twin `fac1523234f4bb0b` on OS 1.40C. Both test tracks addressed a fresh 37,800-frame stereo recording in R3. Its channels differed and the low byte carried signal. In the 13-second run with 20-channel USB capture and the same 12-second MIDI trace, stock Flex dropped zero machine renders on T1 and T5. The six-voice draft on T1 dropped 658 from stream open through stop, including 648 during playback. Its longest guarded callback was 18,310 ticks, or 36,620 core cycles. All runs used one test machine at a time.

The two-voice trial on T5 completed 61 seconds of uninterrupted playback with 60 seconds of MIDI and USB capture. The T1 Flex and T5 Grain stems both carried stereo audio. The render skip, MIDI receive error and transmit drop counters stayed steady. A frame reached 107.3% of budget. After stopping, audio frames advanced while the UI tick stayed fixed for at least 27 seconds. The panel failed to change machines, and the USB rollback and RAM restart could not complete. A card-free power cycle restored the original production base with an empty module inventory. Two earlier short two-voice windows had a near-silent T5 stem and are excluded from this comparison.

After the power cycle, stock Flex on the same development base ran the 61-second T5 control against a fresh R3 recording of the same length and format. Both stems carried audio, the frame peak was 81.9%, and the health and MIDI error counters held steady. UI ticks advanced during all 24 seconds of post-stop observation and the panel selected T2 and T5. This control used an empty module inventory. The cause of the freeze after the Grain trial is still open.

A six-voice experiment reused page and parameter calculations between samples or callbacks and used a precomputed pitch table. The compiled engine produced identical PCM and grain state on the host comparisons. On T1 it still skipped 489 renders during the short combined test. This trial used the fresh recording after reboot, so the difference from 658 does not isolate the effect of the optimization. The draft retains its existing six-voice package.

The draft package occupies 26,236 bytes on disk, loads 25,016 bytes of image and reserves 2,124 bytes of BSS. The deepest Grain-only audio call chain uses 692 stack bytes, including return addresses (164 for `grain_render`, 448 for `gran_render`, 68 for `stereo_page`, and 12 for the three return addresses). The drawing path uses 392 bytes. The compiler emitted identical assembly with stack reporting enabled. [Measurements and build identities](evidence/timing/combined-load.json)

A16 and both copies of scratch Part 3 matched the original snapshots. A02, its working Part 1, track T2 and 140 BPM were restored. All eight recorders were empty and in 16-bit mode. The normal production base dfa438130710fea9 returned with zero saved and zero live modules. The hardware reservation was released.

## Voice limits under USB audio and MIDI

The MKII recorded a fresh 37,800-frame, 24-bit stereo source into R3. All three binaries used the same dense settings, A16 Part 3 at 100 BPM, one Grain assignment, six untriggered THRU tracks and a trig on every step of the test track. The comparison builds change the loop limit for spawning and mixing. The six-voice package matched the draft byte for byte.

| Voices | 5 s capture T1 / T5 | 65 s capture T1 / T5 | MIDI alone T1 / T5 | Capture + MIDI T1 / T5 |
|---|---|---|---|---|
| 6 | 3 / 2 | — / — | 0 / 0 | — / — |
| 5 | 0 / 0 | 1 / 0 | 0 / 0 | — / — |
| 4 | 0 / 0 | 0 / 0 | 0 / 0 | 138 / 79 |

Counts include startup and stop. A dash marks an unmeasured window. The stock Flex short capture on each track counted zero. The guard counts skipped machine renders. Short-window results varied with the Part and do not establish a worst-case limit.

All three host renders were sample-identical at defaults, with at most two grains active. With the same dense plucked-chord phrase and output gain, six, five and four voices averaged 5.86, 4.90 and 3.93 simultaneous grains. RMS levels were −18.82, −19.39 and −20.48 dBFS respectively. The caps preserve the individual grain algorithm and change which overlaps play.

[Build hashes, guard windows, MIDI counters and listening measurements](evidence/timing/voice-limits.json)

- Grain, 3 voices on T1, 13-second combined window, 6 skipped renders and 74.6 % mean frame-interrupt time during the first ten seconds.
- Amiga on T1, 13-second combined window, 0 skipped renders and 68.4 % mean frame-interrupt time during the first ten seconds.
- POLY8 on T1, 13-second combined window, 0 skipped renders and 64.3 % mean frame-interrupt time during the first ten seconds.
- Stock Flex on T1, 13-second combined window, 0 skipped renders and 60.1 % mean frame-interrupt time during the first ten seconds.

The A16 pattern and both copies of Part 3 matched their starting bytes on return. A02, its pattern, 140 BPM and T2 were restored. The original working Part matched before correcting T4’s two recorder inputs to their stereo pairs, as observed at the beginning of the first turn. Recorder RAM returned to 16 bits with empty slots. The original production base booted with zero saved and zero live modules.

## Card-free 24-bit playback, render timing and USB recording

On 20 November 2026 a queued Octatrack MKII running OS 1.40C and RAM base `06e08f35c62c02ce` recorded 37,800 stereo frames into recorder 3 at 24 bits. Normalization in the audio editor produced a source with distinct left and right samples and nonzero low bytes. Stock Flex played that recording through MAIN. The CF card was physically out throughout. [Run measurements](evidence/timing/recorder.json)

The SCAN package `371e2e19` triggered grains but returned silence from recorder 3. It treated the physical arena limit of 14,602 pages as a limit on the entire page map. Recorder 3 starts at map index 58,408. Each of the eight recorders has its own row. The repair checks the row, the sample offset and the resulting physical page separately. The compiled regression exercises all eight recorder rows, ordinary Flex slots and invalid mappings.

The six-voice candidate below is `0c5632f677aecd873b11ae71a82ac5d72c3357d1dd43ccdb1dfc545cd3a5f38a`. It keeps pan selection outside the constant-gain 24-bit loop, skips the silent span of a grain that has left the sample, and reuses the flat portion of the square window. The reference checks preserve PCM and cursors. A 100 BPM Part with both FX slots empty and six untriggered THRU tracks had room for one 35-point Grain. The chooser refused the second instance against the 45-point allowance. Each track was measured separately. Both produced stereo on their own USB stem and on MAIN.

| Physical window | Peak / mean frame load | New skipped renders |
| --- | ---: | ---: |
| Stock Flex on T1 and T5, 12 s MIDI trace, empty inventory | 70.3% / 50.9% | 0 |
| Grain on T1, Flex on T5, same trace | 89.6% / 68.1% | 0 |
| Flex on T1, Grain on T5, same trace | 93.0% / 67.9% | 0 |
| T1 Grain, trace with Part 2 then Part 1 | 87.8% / 58.7% | 0 |
| T1 Grain, 70 s sequencer soak, SCAN +2.00 | 86.4% / 60.2% | 0 |
| T5 Grain, 70 s sequencer soak, SCAN −2.00 | 85.9% / 61.9% | 0 |

Each soak reached six voices with SIZE, DENS, SPRY and PAN at 127, SYNC, fractional pitch and a trig on every step. The trace delivered 288 note-ons, 288 note-offs, 11,520 CC119s, 1,152 clocks at 240 BPM and a STOP to the host MIDI endpoint. The receive-error and transmit-drop counters held steady. The highest single guarded callback in these six-voice windows was 17,845 timer ticks (135.2 µs or 35,690 core cycles). The whole interrupt has 362.8 µs. A median 100% CPU meter during the flood, including on stock, leaves no measured panel headroom.

**20-channel USB recording still drops renders.** The same stock Flex control added zero skips. The six-voice candidate added 724 on T1 and 755 on T5 from stream open through settling after STOP. During the 4.6-second sustained portion alone the counts were 566 and 376. T5 had added 913 in that portion on the silent SCAN build and 726 with just the page-map repair. The repaired stereo MAIN response and the cumulative skip deltas were measured independently. The 120-second soaks on the earlier SCAN package exercised a silent output path. The intermediate recorder repair `9471a4cc` produced stereo and completed a 120-second T5 soak with zero new skips outside USB audio capture.

For the six-voice binary, the static bounds for 16 and 32 source frames are 20,689 and 38,481 Grain-owned instructions. The zero-wait-state core model gives 192,656 and 359,568 cycles. The analysis counts each voice's choice of one mixing path and allows a scalar page lookup for every sample. These upper bounds exceed the frame budget. External SDRAM service, stock callees and interrupt interference remain outside the calculation. The release still needs a clean USB capture, full qualification, a musician's listening check and a reboot check on the chosen package. [Bound calculation](evidence/timing/bound.py)

Rollback returned the original base `dfa438130710fea9` with zero saved and zero live modules, matching card-free preflight. All eight working track machine and sample assignments, FX choices, grid masks and 140 BPM were checked. Recorder RAM returned to 16-bit and all buffers were empty. The saved Part copy matched. A full fingerprint of the starting card-free working Part and pattern was unavailable. The T4 recorder input menu ended on summed input pairs; its starting screen showed stereo pairs. The test issued no project Save, Keep or flash.

## Physical 24-bit engine timing and stock Flex MIDI comparison, 20 November 2026

The queued MKII ran OS 1.40C and development base `06e08f35c62c02ce`. The SCAN package was `371e2e19169814750c4bf844a2b907b1871328f8919fd32b5bddd869859c60b0`. All eight loaded Flex samples were stereo 16-bit and all eight recorder buffers were empty and set to 16-bit stereo. The current bank's four working Parts and four saved copies had no Grain assignment. Elektron documents that edits to an active project are cached to CompactFlash and that entering the set-change menu syncs it. The run used a generated sample entirely in private RAM. [Octatrack MKII manual, sections 4.12 and 7.1](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf)

### Time on the physical ColdFire

A private timing probe linked the same Grain object verified against the catalogue package. It rendered two native-size pages of deterministic 24-bit stereo into a private PCM buffer, using engine track indices 0 and 4. Each run covered 64 cases eight times, with six active voices, all four windows, fractional pitch, alternating direction and pan, page crossings, both SCAN endpoints and 140/240 BPM. The ColdFire's 132 MHz timer surrounded `gran_params` and `gran_render`. Both runs returned 512 calls and the expected final PCM fingerprint for each of the 64 cases, independently reproduced with the portable renderer's fast paths disabled.

| Engine track and source frames per call | Highest elapsed time without MIDI | Highest elapsed time during the MIDI run |
| --- | ---: | ---: |
| T1, 16 | 266.5 µs | 401.5 µs |
| T5, 16 | 292.1 µs | 347.7 µs |
| T1, 32 | 333.9 µs | 617.2 µs |
| T5, 32 | 327.0 µs | 372.2 µs |

The probe ran one call per UI tick. Interruptions count towards its elapsed time. The largest observation was 81,476 timer ticks, or 162,952 core cycles. The stock audio interrupt continued to run and logged zero skips in the measured MIDI window. The test exercises 24-bit rendering on the physical chip. Guarded assignment, delivery to MAIN, and frame-interrupt timing with Grain selected on the two physical tracks remain open. [Per-case timer readings and PCM fingerprints](evidence/timing/measurements.json)

### Static bound for the submitted binary

For one call to `grain_render`, the conservative upper bound on Grain-owned instructions is **56,887** for a packet of up to 16 source frames and **109,527** for up to 32. The linked wrapper accepts both lengths. `grain_start` is bounded at 187 instructions. The analysis follows both sides of branches, bounds the six voices, packet length, spawn attempts, page accesses and control copies, and accounts for calls into other Grain routines. It excludes the stock Flex callees. The linear-program dual is verified in exact rational arithmetic.

The accompanying zero-wait-state core model gives upper bounds of 449,864 and 861,384 modeled cycles respectively. It allows incompatible paths and does not characterize instruction-fetch stalls, external SDRAM service or interrupt interference. These bounds exceed the 95,782-cycle frame budget and do not certify that the playing track meets its deadline. [Reproducible calculation](evidence/timing/bound.py) · [NXP MCF54455 reference manual, section 3.3.5](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)

### MIDI on stock Flex tracks

One paired run on the same development base compared an empty module inventory with the exact Grain release candidate installed. The voice monitor showed stock Flex active on T1 and T5 in both windows. CoreMIDI sent the same 12-second trace of 288 chromatic notes and their releases, 11,520 unmapped CC119 messages, 1,152 clocks at 240 BPM and one STOP during a held note. This corresponds to 31,200 DIN bits/s before the single STOP. The transport was USB MIDI. The host trace contains 13,249 timestamped messages.

| What ran on the instrument | Longest frame interrupt | Mean frame-interrupt load | Median idle from the CPU meter | Skipped renders |
| --- | ---: | ---: | ---: | ---: |
| Stock Flex, empty inventory | 243.8 µs (67.2%) | 36.6% | 0.8% | 0 |
| Stock Flex, Grain installed and unassigned | 245.6 µs (67.7%) | 37.7% | 0.0% | 0 |

Both voices were observed in both windows and the USB receive-error and transmit-drop counters held steady. Those counters do not establish delivery of every individual message. A four-window repeat was rejected. Its first stock window recorded a USB receive error and subsequent windows showed no responding voices. After a RAM restart both voices responded again. The final kernel timing run with MIDI had zero new receive errors. A matched comparison with Grain assigned and sounding, including a Part change under load, remains open. [Observed and rejected windows](evidence/timing/measurements.json) · [MIDI trace generator](evidence/timing/midi_trace.c)

All four working Parts, four saved Parts and the active pattern matched their starting fingerprints through the four-window comparison. A later check after RAM restarts found a different checksum for **working Part 1**. All four saved Parts and the other three working Parts still matched. The comparison did not identify the changed field or its cause. The original base `dfa438130710fea9` returned with its complete original inventory and all ten modules saved and live. The run issued no project Save, Reload, Keep, flash or card-file commands.

At commit `4987a977` the commands below reproduce this historical probe and bound. On the current checkout they build and bound the current catalogue ELF. The host reproducer uses the SDK toolchain, Python with SciPy for the bound and a native C compiler for the reference. The probe's SHA-256 is `ad52e8af91b33cdd97531ff7d390e57162d20b0cf259ce788e54d7d02037d652`.

```sh
out=$(mktemp -d)
timing=sdk/octatrack/modules/grain/evidence/timing
python3 -B "$timing/build_probe.py" "$out"
python3 -B "$timing/bound.py" "$out/grain.elf"
```

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
