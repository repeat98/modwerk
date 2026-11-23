# UNGEMACH testing

Everything here was observed by the author (GnocchiBalboa) and the coding agent working with them. A result names its build; "not tested" means not run.

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
- **Not tested:** a project reloaded without the module, Part and bank changes with an UNGEMACH track, a power cycle after a Keep with the project reloaded, MIDI floods, `npm run device:qualify`, and any MKII.

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

Not measured yet (`npm run device -- do`, `guard`).

## Stock flows

Not compared systematically with and without the module. Seen in play with it installed: the machine list shows UNGEMACH as a row beside the stock machines, the other Flex tracks, their locks, LFOs and scenes, PLAY and STOP behaved as usual in the author's live set. Not tested: saving and loading projects and Parts, copying Parts, recording, MIDI, USB audio.

UNGEMACH changes no stock flow. Its SRC SETUP A to D are empty and stay 0, so a track switched back to FLEX finds stock's defaults there.

## OT UI captures

Not captured yet.
