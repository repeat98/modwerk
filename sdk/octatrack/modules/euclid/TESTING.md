# Euclid testing

Version: 0.1.2-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

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
