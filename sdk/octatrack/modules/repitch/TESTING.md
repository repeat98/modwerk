# Repitch testing

Version: 0.2.0-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

0.2.0 changes the runtime package only: on a base that owns 0x40004100, REPITCH subscribes to `ev_play_increment` (order 50) instead of patching the site. The historical evidence below is retained; no new hardware or DSP qualification is claimed.

## 0.2.0: the playback-increment event (prepared 14 October 2026, not released)

- **Native builds unchanged.** `repitch.s` assembled without `MODWERK_EVENTS` (`m68k-elf-as -mcpu=54455`) gives the same `.text` bytes and relocations as 0.1.2-experimental (SHA-256 `cbf8ce918648f752731e22538ef4f88f7e3766bcc1f4f293f2697535ba824326`); only the local label `.rh_restore` became a macro label. `verify_repitch.py` was not rerun: its input bytes did not change.
- **Runtime package.** `runtime.json` replaces the `rate_hook` detour with `repitch_play_increment`, the same `RP_SCALE` arithmetic on the increment the base passes. The package has 14 sites (was 15) and one hook word; a base without site events refuses it.
- **Emulator comparison** (loader-integration `loader_events_fixture.cpp`, 14 October 2026; synthetic register and stack state at the site, PROJECT 120 BPM, sample 100 BPM): the 0.1.2 raw package on a base without events and this package on an events base give the same increment and registers on a REPITCH track, a plain track and a POLY track; beside POLY8's subscriber, POLY tracks get POLY8's result and the other tracks REPITCH's, in either install order. The 0.1.2 package is refused on an events base (`RUNTIME_EVENT`).
- Not run: hardware, audio, the native gates.


## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The README records MKII operation on image OCTABAM81 and emulator checks. MKI, slices and recorder buffers were not measured in that record.

## Commands and results

Declared native gates:

`tools/verify/verify_repitch.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Uses tempo-driven playback speed with timestretch off in the voice renderer. No quantitative load comparison has been published.

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

### Loaded sample and ATTR capture

A second UI-only image adds the reviewed Repitch source to the explicitly
owner-authorized Analog BD, MIDI Scenes and Scale Quantizer capture profile.
Stock DSP is resident (`OCTABAM_STATIC_STOCK=1`), SPRING REV excluded; build
is restricted to a private temporary macOS sandbox. The source pins, exact
profile/environment, wrapper hash and both panel sessions are recorded in
[media/capture.json](media/capture.json). The first session's SRC SETUP image
is retained; its empty main-page image was replaced with the loaded-sample capture.

Local MAIN OS SHA-256: `fd48ea8b84227dfbd31ed2824661087ddfe53d9ade8c82535e5da43c9a41fd38`.
Capture uses the maintained script with `--key-ms 50 --card <scratch-card>`
and the second recorded panel plan. The fixture is an original two-second,
44.1 kHz, mono 16-bit sine, staged as `ONE/AUDIO/UI_120.WAV`; its exact
recipe and hash are recorded without retaining the audio or card image.

The actual ATTR page shows TIMESTRETCH = REPITCH, reached with UP/DOWN to
select the row and RIGHT to change the value. The main page shows a loaded
sample with track TSTR = RPCH and PTCH reading OFF. These are separate panel
states; AUTO playback, sample saving and audio behavior were not tested.
Transport remained stopped and no qualification/stress/firmware-parity gates ran.

Publication metadata was synchronized with current main without changing native code.
The capture record preserves the original draft version and records the source-file
comparison binding these exact pixels to this documentation/media-only update.
