# UNGEMACH testing

Everything here was observed by the author (GnocchiBalboa) and the coding agent working with them. A result names its build; "not tested" means not run.

## 0.1.0-experimental, 22 November 2026

This version's source (commit 8a5d506a, `module/ungemach`) is the engine of the diagnostic build v68d with the measurement code compiled out; its output renders identically to v68 (see Host tests). On the author's live-set MKI, v68d was kept, played and measured (Performance below), and its sound accepted.

On 24 November 2026 the release package of this source, `a8bcdca3`, was priced and qualified on the same MKI (CPU price and Qualification below). The package now carries that price in its descriptor (`reserved[0]` = 15), which is the only byte that differs: `37d7a278`. That package went through the persistence checks the same day (Persistence below). Moved out of `sdk/drafts/` for the release (25 November 2026), with only include paths and a comment changed, the source still builds `37d7a278` byte for byte.

## Persistence

Package `37d7a278`, the author's MKI, OS 1.40C, flashed base 0.7.10 (`6070a4e4`), 24 November 2026, observed by the author; the inventory was read over USB.

- **Keep and power cycle:** kept with `device -- try --accept`. In a scratch project T1 was set to UNGEMACH, a pattern with trigs on T1 played and the drone sounded; Part and project were saved. After a power cycle the inventory still listed UNGEMACH (`ee55bea9`), the project loaded with T1 on UNGEMACH, and it played as before.
- **The project without the module:** another project loaded, UNGEMACH removed with `device -- remove --accept` (inventory empty), then the scratch project loaded again without saving. The unit showed a message that UNGEMACH is missing, T1 read FLEX, the sequencer ran normally and T1 stayed silent (no sample on it).

## Units and base

- **Live-set unit:** Octatrack MKI, OS 1.40C, Modwerk USB base 0.7.10 (`6070a4e4`), the author's own live set: seven Flex tracks with many trigs, LFOs and scenes, plus E-Verb, LOFI2, Analog BD, Mute Modes, Amiga and Mini Verb installed.
- **Test unit:** a second Octatrack MKI ("Probe-Octa"), OS 1.40C, an older USB base (`9680e9ac`), used for the early builds.
- Builds were loaded over USB with `npm run device -- try <package> --accept` (a Keep), run through the USB bridge (`scripts/octatrack-usb-bridge.py`).

## Host tests

`python3 -B verify.py` (or `test_ungemach.py`) compiles `engine.c` with `test_engine.c` under UBSan and ASan and runs it: levels, DC and clipping at every corner of the controls and at every DISS value, DISS's glide (34 to 35: 3 % of the way after one block, all of it after 0.5 s), a split frame sounding as one, three minutes of drone, PNCH standing out and ending (PNCH 127: the first 10 ms 13.1 dB over no trig, back to the drone within 0.3 s, peak -6.0 dBFS), and a synced RATE that pulses. Result on the source of this draft, 22 November 2026: all passed, with and without the sanitizers.

The cleanup for this draft (removed measurement and PC-only code, unused tables, LCUT) was checked by rendering 30,000 frames with moving controls and PNCH from the old and the new engine: the output is identical.

`gen_tables.py` writes `tables.h` and reproduces it; `calib_waves.c` measures each waveform's level for `WAVE_TRIM_DB`.

## Hardware: what was played

- **One track a Part** (package v32 `d3b5f1e4`, Probe-Octa, 19 November 2026): a second track shows UNGEMACH in the machine list but cannot pick it. After T1 went back to FLEX, T2 could pick it.
- **Controls** (live-set unit, builds v60 to v68, 21-22 November 2026): every SRC knob and SPRD and PNCH were turned while the pattern played; parameter locks on PTCH ran on every trig; an LFO on DIRT moved it (the diagnostic log showed DIRT's range moving with it); a crossfader scene changing UNGEMACH parameters was moved and held. The author judged PNCH, WAVE, DIRT, RATE and DISS by ear and accepted v68's sound.
- **Keeps:** each build was kept with `device -- try --accept` and played; the author replugged USB or power-cycled between builds when the bridge needed it.
- **Not tested:** MIDI floods and any MKII. Part and bank changes ran in `device:qualify`; the power cycle and a project without the module under Persistence (below).

## Performance on the live-set unit

The diagnostic builds (`UG_DIAG` in `machine.c`, never released) time the whole render callback with the 132 MHz DTCN3 timer, as the base's frame guard does, on the first UNGEMACH track, and report each second the mean a frame and the frames not rendered (the guard's skips) through `npm run device -- status` (DIAG value). The frame is 362.8 microseconds; the base gives all renders together about 290 of them.

| Build, date | What | Mean a frame | Skipped frames |
| --- | --- | --- | --- |
| v66d, 22 Nov, 12:49-12:56 | free play, every control turned | 39-58 µs | 0 to 52 a second, 76 of 191 s with any |
| v66d, 22 Nov, 13:04-13:09 | one control at a time (PNCH 127, WAVE, PTCH, DISS, RATE free and synced, TONE) | 38-42 µs playing, 37 stopped | 0-41 a second while playing, in every step; none stopped |
| v66d, 22 Nov, 13:11-13:14 | crossfader scene: off, moving, middle, on | 38-39 µs | 0-8 a second |
| v66e, 22 Nov, 13:27-13:33 | free play | 38-59 µs | none in the 53-59 µs stretches, up to 15+ in others |
| v67d (no LCUT), 22 Nov, 21:01 | pattern playing, about 1 minute | 36-37 µs | 0-9 a second |
| v68d (DISS order), 22 Nov, 21:29-21:39 | free play, about 10 minutes | 37-43 µs and 49-60 µs | 0 in 63 % of playing seconds; never with the high means |

The cost does not follow UNGEMACH's settings: with the same settings the mean moved from 58 to 43 µs within a minute, and the stretches with the highest means had no skipped frames. Each sequencer stop showed one second at 44-53 µs. That looks like the base's or stock's own state; it is reported on issue #1790.

**Comparisons on the live-set unit, the same evening, switched in one build** (22 November 2026, each twice):

| Variant | Mean a frame |
| --- | --- |
| as released, with LCUT (three one-poles a side) | 39-41 µs |
| the render loop compiled for speed (`-O2`, helpers inlined) | 51-52 µs |
| without LCUT | 39 µs (LCUT cost about 2 µs) |
| the sixteen voices as six loops / two loops instead of unrolled | 42 / 45 µs |

LCUT was removed for this reason; the code size of the render loop matters more than its instruction count.

**Earlier history** (summarised; the full log is in the pull request): the first full build cost about 76 µs a frame with 55 % of frames skipped in the live set (base `dbdf7e5d`, 19 November). The hits were removed, the slow figures moved to every eighth frame, the voices read at the nearest sample, the filter became a trapezoidal state-variable filter once a step, per-call state moved from BSS to initialised data (BSS is reached slowly), and RATE's timing is read only when needed. A busy-wait test machine (`UG_NULL`, issue #1790) showed that a machine in this set crackles from about 40-45 µs a frame on base 0.7.10.

## CPU price

Measured 24 November 2026 on the author's MKI, OS 1.40C, RAM-booted with a development twin of the beta base (`4c7eb79b`, built with `--dev` from `d0dc7166`), release package `a8bcdca3`, as a trial that was rolled back. A scratch project, bank A: A01 a medium pattern (T1-T7 with trigs on steps 1, 5, 9 and 13, samples on T2 and T3), A02 empty, A03 only T1 with a trig on every step and no sample. UNGEMACH at its Part defaults.

| Reading (`PLAY w2500 guard w6000 guard STOP`, the second line, twice each) | In the frame interrupt | Skipped |
| --- | --- | --- |
| T1 UNGEMACH, A03 | 43.9 %, 43.9 % | 0 |
| T1 UNGEMACH, A02 (no trigs) | 43.6 %, 43.5 % | 0 |
| T1 FLEX, A03 | 29.8 %, 29.8 % | 0 |

**Price: 14.1 points, so 15 %** (`resources.cpuPrice`, `reserved[0]`). UNGEMACH renders while the sequencer runs whether or not its track trigs, so the price is the machine against the same track on FLEX.

**Instance curve** (`device:price --curve T1`, `evidence/frame-cost.json`): installed on no track it added nothing (rest 0). On A03 the first instance raised the longest frame from 63.1 to 77.7 % (first 14.6). On the medium pattern A01 it read 78.7 to 102.2 % (+23.5): past 100 % that is the overload, not the module's cost, so the curve is A03's. Admission: picked on A02 and played there, admitted, longest frame 70.8 %, 0 dropped renders, 0 stalls; played on A01, admitted, longest frame 97.6 %, 0 dropped, 0 stalls. The `cpu` line after the pick showed the base booking the default 12 % (this package named no price yet).

The price tool's trial did not roll back by itself in any of its three runs (it printed "THE TRIAL DID NOT ROLL BACK"); each time `recover` rolled it back and the inventory read empty.

## Qualification

`device:qualify --keeps-ok --seconds 30` on the same twin and scratch project, release package `a8bcdca3`, 24 November 2026 (on Windows through a small wrapper that maps the script's Unix socket to the session's TCP port; the script itself unchanged). **Result: passed, no failures.**

- UNGEMACH alone, playing: on T1 its longest render 39.2 % of a frame, T1-4 core peak 394 per mille, CPU 602 per mille; on T5 its longest render 65.3 %, T5-8 core peak 419, CPU 612. Mean frame interrupt quiet against triggered: T1 42.7 / 43.2 %, T5 45.0 / 45.4 %.
- On T1-T8 at once: T1 ran UNGEMACH, T2-T8 were refused (one track a Part, as intended). CPU 608, core peaks 395 and 483 per mille.
- The six SRC knobs swept while playing; Part switches 12 of 12 ran their own effects within 3 s; a queued pattern change into another bank and back.
- Afterwards the Part reloaded from its saved copy byte for byte, the module was removed and the inventory was empty. No crash or stall recorded.
- Not covered: listening, a power cycle and what survives it, MIDI, scenes and recording, UNGEMACH beside other installed modules.

## Stock flows

Not compared systematically with and without the module. Seen in play with it installed: the machine list shows UNGEMACH as a row beside the stock machines, the other Flex tracks, their locks, LFOs and scenes, PLAY and STOP behaved as usual in the author's live set. Not tested: saving and loading projects and Parts, copying Parts, recording, MIDI, USB audio.

UNGEMACH changes no stock flow. Its SRC SETUP A to D are empty and stay 0, so a track switched back to FLEX finds stock's defaults there.

## OT UI captures

Hardware captures, 24 November 2026: the author's MKI, OS 1.40C, the development twin `4c7eb79b` RAM-booted over USB, package `37d7a278` in a trial, the scratch project with T1 on UNGEMACH at its Part defaults, transport stopped. The LCD was read over USB (`png:`) and scaled 3x without changing pixels.

- `media/ot-machine-list.png`: FUNC + SRC on T1, PLAYBACK SETUP with UNGEMACH selected in the machine list and its SPRD and PNCH knobs.
- `media/ot-src.png`: SRC, the main page with PTCH, DISS, TONE, WAVE, RATE and DIRT.

While the trial ran, the base's `cpu` line booked 15 % for the track, the package's price. When the trial ended with T1 set back to FLEX, the base refused the rollback with "needs-recovery"; a power cycle returns the unit to its flashed base, and nothing was kept.
