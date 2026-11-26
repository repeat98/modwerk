# Euclid testing

Version: 0.1.6-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

## 0.1.6-experimental: one release, at rest on base 0.8.1 (25 November 2026)

0.1.6 is now one release: the resting detours below (#1868) together with octabam's three DSP speed-ups (#2057, `filter.asm`), on main `75a8c5c69`. Packages were rebuilt in the pinned image (`build-modules-isolated.sh`, `modules:import --development`), and Euclid's and Tape Echo's standalone recipes re-pinned to the new `dsp-packages.json` and `filter.asm`. `octatrack:module-packages -- --check`: every package identical (Play Modes held, #764). Published package `27263940…`.

- **At rest, on a unit** (MKII, OS 1.40C, development twin `493c9cc5` of base 0.8.1, project Dev17, `npm run device:price`, three readings of 8 s per state, 25 November 2026). The plain runtime build of this source was used (`module:dev --build-only`, `91af771d`, all three detours flagged resting).

  | | at rest: frame / CPU | in use: frame / CPU / DSP (peak) |
  | --- | --- | --- |
  | 0.1.5 (published) | +1.1 / +0.7 | +3.7 / -0.3 / +4.8 (+6.0) |
  | 0.1.6 | +0.0 / -0.1 | +3.9 / +4.2 / +5.7 (+5.9) |

- **In use:** the DSP reading isn't lower despite the speed-ups (one run of three readings, peaks equal within 0.1); the cycle scan's -9.1 cycles a sample is the static figure. Not re-measured by ear.
- Not run on this release: the instance curve, the test procedure, Part/project reload and power cycles, an MKI.
- **Performance record, on a computer** (26 November 2026, `evidence/performance.json`): from `sdk/octabam`, `python3 tools/build/cycle_count.py` (the module's `measure`), `python3 tools/harness/benchmark_stock_dsp.py`, `python3 modules/euclid/perf.py bench OUT` and `python3 modules/euclid/perf.py stress OUT --seconds 2`, then `npm run perf:audit -- check … --stamp`. The DSP filter alone, on a private image (`0c23ac7d…`); not hardware.

  | | |
  | --- | --- |
  | cycles | 4 x 182 = 728 of 3120 per sample per core (23 %), measured 187.75 per instance |
  | stock benchmark | 187.75 vs FILTER 284.88 (0.66x); the dearest stock effect is 330.94 |
  | stress | 4 per core, eight tracks, 3 LFOs and 20 locked slots, 2 s, no clobber, no hang |
- **Module pool, on a unit** (26 November 2026): two rolled-back trials of `27263940…` on development twin `46c30886` of base 0.8.2 read 10,480 bytes each, the loader extent of base 0.8's module record (#2284).

## 0.1.6-experimental: rests while no slot uses it (prepared 20 November 2026, tested on 0.7.11 below)

No code change. A `runtime.json` holding only `"rests"` marks its ColdFire detours `eu_frame_hook` (0x4000d562, every frame), `eu_start_hook` (0x4009c3d4) and `eu_resume_hook` (0x4009c4d4). On a base that judges
effect modules (#1849, base 0.7.11, loader capability 2048) the base rests the module while no slot of the project,
working or saved, names its effect id and no live slot runs it: those detours hold stock's bytes. Its DSP code is
resident on demand as before.

- **Why:** 2.5 points of the frame interrupt at rest in its `evidence/cpu-price.json` (`npm run device:price`, playing; MKII, development twin `d3d71297` of base 0.7.8, the Tresor Prep scene, 18 November 2026). The owner's goal (20 November 2026): an installed module nobody uses costs nothing.
- **Note:** PLAY resets Euclid's phase through `eu_start_hook`: while it rests no slot names Euclid, so no phase is kept; it wakes before a pick lands.
- **Not built yet:** the builder change that takes a rests-only `runtime.json` for an effect is in #1849; the package
  row then needs `requiresCapabilities: 2048`, and the standalone recipe re-pins after #1862.
- **Test procedure:** not run (no build; the unit was off USB, then held by another session, on 20 November 2026).

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Installed, no slot names it | the detours must hold stock's bytes and cost nothing | `device:price` at rest, same scene as before | not run: not built, unit unavailable |
| Picked while playing | the wake writes its sites masked before stock writes the pick | frame guard over the pick window, a stock effect pick as control | not run |
| A Part, pattern or bank change bringing it in | must not need a wake | any slot of the project keeps it awake (base host test) | pass (host, #1849); unit not run |
| A paste or a project load putting it on a live slot | it runs unpatched until the next tick | the live slot wakes it within a tick (base host test) | pass (host); unit not run |
| Both slots and two instances | the effect id is one for every slot | picks on T1 and T5 | not run |
| Undo of the trial that brought this version | resting sites restored while resting | whole-set trial and Undo | not run |

## 0.1.5-experimental — 18 November 2026 (#1690)

Fix: the filter path clears AMP's gain (`x:(r7+$26)`) with the three filter tap weights. Before it, TYPE passing AMP
(on the way from HP to NOTCH) left the dry signal mixed into every later filter type.

- **Emulator, not hardware:** `test_filter_type_history.py` assembles `filter.asm` and runs it under the vendored
  DSP56300 interpreter on a stereo 440 Hz sine, FREQ mid, MIX fully wet: LP for 200 blocks against LP, one AMP
  block, LP. On 0.1.4 the AMP gain stayed at `0x400000` and the settled output differed by up to half its peak
  (-6.2 dB); on 0.1.5 the gain is 0 and the output is identical, sample for sample. The test fails on 0.1.4's file.
- **Not tested:** this version on a unit (owner-approved update, `sdk/approvals/euclid-build-approval.json`), chip
  cycles (one instruction a block more), BP, HP and NOTCH after AMP (the same cleared weight serves them).

## Earlier versions

This revision updates author credits only. The historical evidence below is retained; no new hardware or DSP qualification is claimed.


## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The source describes pattern, timing, changing-type and cutoff-sweep verification. No current hardware-load percentage or final storage measurement is claimed here.

## Commands and results

Declared native gates:

`tools/verify/verify_euclid.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: untested. ColdFire modulation drives the filter/amplitude path. A comparable CPU/DSP utilization measurement is not available.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## OT UI captures — 1 October 2026

Module version: 0.1.2-experimental. Actual firmware-rendered LCD pixels captured
through the headless `ot_emu` interactive panel and `lcd_view.py`;
128×64 LCD, integer scale 6, MKII panel, transport stopped. Empty
scratch FAT16 card; no samples, personal projects or hardware connection.

The image was compiled from a temporary copy of the original seven module
sources and their required internal loader; pending imports were excluded.
Build environment: `REMIX=ui-capture XBUS=1 SPEC=1 DEV=0 BUILD=79
OCTABAM_STATIC_STOCK=0 OCTABAM_NO_CACHE=1`; native `build_bus.main()`
uses the catalog's seven-module profile (`MINIVERB`, `TAPE ECHO`, `EUCLID`
on FX2; the three station modules and Euclid added to FX1). No native
qualification, stress, audio-render or firmware parity gates were run.

Local MAIN OS build SHA-256: `5162680d8bc342deb623cef00307f2a343f539a90f0bfcef59b59ceb4c60bb83`.
Emulator binary SHA-256: `93484e4b71c70f48f795825103146a36ef95ef9ac06ee627e28608ae3e3bb3eb`.

Panel sequence and PNG hashes are recorded in [media/capture.json](media/capture.json).
Capture command: `ot_emu --image <local-image> --card <empty-scratch-card>
--dsp --frame --ms 3000 --interactive --lcd <temporary-plane> --main-level off
--rtc host --mkii`; input uses panel key rows and encoder detents. Export:
`lcd_view.png(lcd_view.screen(lcd_view.read_plane(<temporary-plane>)), <png>, 6)`.
The maintained equivalent is `scripts/capture-module-ui.py`; see
[the capture workflow](../../../../docs/MODULE_UI_CAPTURES.md).

Only screenshots, hashes and documentation are retained. This evidence
does not alter the existing hardware status or qualify a firmware release.

Publication metadata was synchronized with current main without changing native code.
The capture record preserves the original draft version and records the source-file
comparison binding these exact pixels to this documentation/media-only update.

## 0.1.4 clock reset safety

The reset fix is imported from octabam #620 at 6f9e5bc9. Generated ColdFire assembly is rebuilt from control.c and hooks.s with the same toolchain that reproduces the previous source exactly. Both PLAY paths still call one reset routine, now with the full status register saved and audio interrupts masked.

Hardware restart under interrupt load, chip worst-case timing, aliasing, DC, clipping and idle audio: **not tested for this version**. Historical software and UI records above do not qualify this changed runtime. Software verification passed: the 16 upstream control checks cover all step/pulse counts, seven track speeds, swing, rotation/loop state, envelope/gate edges and counter wrap. The generated assembly was compiled with the baseline-reproducing toolchain. Native/browser comparison passed all 98 selected configurations (42 matching builds and 56 matching refusals), including rejection of altered original firmware. No hardware or chip timing is inferred from these checks.

The owner approved retaining the existing 0.1.3 UI documentation for this clock-only update. PNGs and their historical capture metadata remain unchanged; no new UI capture or hardware test is claimed. The exact-source approval records `retainedUiVersion`, and publication validation still checks the documented access and control views.
