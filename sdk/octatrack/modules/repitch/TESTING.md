# Repitch testing

Version: 0.2.1-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

0.2.1 makes the idle case cheaper and nothing else; 0.2.0 changed the runtime package only (REPITCH subscribes to `ev_play_increment`, order 50, on a base that owns 0x40004100). The historical evidence below is retained. 0.2.1's only unit result is its cost at rest, so no new hardware or DSP qualification is claimed.

## 0.2.1: less work on tracks without REPITCH (14 November 2026)

- **Why.** The owner measured 0.2.0 on an MKII (development twin `0277c5c5` of main, 14 November 2026; four FLEX tracks sounding one loop, T5-T8 silent, 126 BPM; reported, not observed here): installed with no REPITCH on any track it added 7.9 points of frame interrupt and 2.7 of CPU. `rate_gate` (0x4000406a) ran its whole REPITCH test (a divide, two multiplies, five reads, ten stack moves) on every call of the increment builder, for every STATIC/FLEX/PICKUP track, before the recompute-flag test, though only the recompute path uses the result.
- **Change.** `rate_gate` tests the flag first and takes stock's reuse path at once. On a recompute it calls `rp_find` without saving d0-d2/a0, which stock writes before reading after 0x4000407a; `rp_source` keeps every register for the PTCH widget. `rp_find` tests the SETUP TSTR byte first: OFF, NORM and BEAT return after that read, AUTO goes on to the sample's TSMODE as before. The sites, the result and the hooks it feeds are unchanged.
- **Emulator comparison** (a scratch harness on the events base built as `test_events_execute_under_the_emulator` builds it, the owner's local 1.40C MAIN, synthetic state): 0.2.0 and 0.2.1 installed, run from 0x4000406a to 0x40004178 (after stock sets d3 itself) over 10,368 track states (tracks 0/3/7; flag on and off; TSTR 0-5; STATIC, FLEX, PICKUP; TSMODE 0/2/3/4; sample bound or not; sample and project tempo in and out of range; two PTCH/RATE settings): every register, the track's state, the output records and the builder's frame identical. The PTCH widget run to the stock knob over 256 states: identical registers and knob arguments. Instructions added to the base alone per builder call, 0.2.0 → 0.2.1: recompute with TSTR OFF/NORM/BEAT 55 → 41, AUTO without REPITCH 55 → 50 (the scene's FLEX track: 63 → 54), REPITCH in force 68 → 64; a call that reuses the increment 37-45 → 2. The per-frame call is the recompute; a second call comes only in a frame with a trig at a sub-frame offset.
- **What stays.** Each recompute still pays the base's call into `repitch_play_increment` (about 12 instructions), `pitch_gate` (4) and, for AUTO, the four reads that find the sample's TSMODE; the renderer's `tstr_resolve` stays at 3.
- **On a unit: the cost at rest** (measured by the owner's session, 17 November 2026; reported, not observed here; `resources.cpuPrice`). MKII, development twin of base 0.7.8 (`98637a13`), the owner's project bank C pattern C01 playing three static loops on T2-T4. Those loops carry REPITCH as their own TIMESTRETCH, so TSTR was set to OFF on T2 and T3 for the reading (put back afterwards) and each track's playback increment was read at unity with Repitch installed: Repitch acted on no track. `npm run device:price`, 8 s per reading, two runs alternating: this package (`public/octatrack-modules/repitch/0.2.1-experimental.mwrm`, sha256 `4b927846…`) added +0.8 and +0.8 points of the frame interrupt, the published 0.2.0 +1.2 and +1.2. With TSTR AUTO, Repitch acting on T2 and T3, the same package added +0.8 and +0.8 and 0.2.0 +1.7 and +1.5 (another twin, same day).
- Not run: the sound of a REPITCH track on a unit (the emulator comparison above is its only check), a track with REPITCH in force on a unit, Part/project reload and power cycles, the MKI, `verify_repitch.py` and the other native gates.

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
