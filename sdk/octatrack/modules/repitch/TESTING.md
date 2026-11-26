# Repitch testing

Version: 0.2.2-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

## 0.2.2: rests while no track uses REPITCH (released 26 November 2026 as an owner-approved update)

Repitch answers `ev_in_use` (`repitch_in_use`: REPITCH in force on a track of the live Part, by the same `rp_find` the
increment builder uses) and marks `rate_gate` and `pitch_gate` `"rests"`. While it answers 0 its `ev_play_increment`
handler leaves the frame and those two detours hold stock's bytes; `tstr_resolve` stays patched, since it keeps the
voice renderer away from TSTR 4, a value only Repitch adds. Needs a base with `ev_in_use` (0.7.8 on).

- **Why:** 0.2.1 installed on no track added 1.4 points of the frame interrupt with seven FLEX tracks playing (MKII,
  OS 1.40C, development build of base 0.7.10 `acc111da`, `npm run device:price`, 20 November 2026). A development
  twin of 0.7.8 measured the same idea at 0.1 points (17 November 2026, #1694).
- **Built:** `build.py --octabam repitch` gives module `5c49f0f0`, 708 bytes, two hooks (`ev_play_increment`,
  `ev_in_use`), `rate_gate` and `pitch_gate` flagged resting.
- **Part changes:** the answer also sweeps every Part of the project, working and saved, half a Part a UI tick (all 128
  within about four seconds; trimmed 25 November 2026, below), for a STATIC or FLEX track whose SRC SETUP TSTR is REPITCH (the Part's byte at
  0x1da + 30 * track + 6 * pool + 4, as POLY8's registration writes it), so a Part, pattern or bank change while
  playing finds Repitch awake. Built: module `5c49f0f0`, 872 bytes, 8 of bss.
- **Known gap, narrower:** a track on TSTR AUTO whose sample carries REPITCH as its own TIMESTRETCH is seen only on the
  live Part (`rp_find`): the Part names the slot, not the attribute, and the sample-slot tables are not mapped in the
  repository. Such a track brought in by a Part or bank change while playing plays up to one UI tick at stock speed,
  rendered dry, until Repitch wakes. A track set to REPITCH directly is covered, and so is a change made a sweep
  (about four seconds) before it plays.
- **Sweep trimmed (25 November 2026):** installed alone on the owner's MKII (development twin `493c9cc5` of base
  0.8.1, stopped, `profile:3`), the first sweep added about 20 µs to every UI tick (178.9 against 159.1 for 0.2.1): one
  Part a tick was 8 type bytes and up to 8 TSTR bytes of the banks, which the base reads uncached. Now half a Part a
  tick, its four type bytes in two word reads: at most 6 bank reads a tick instead of 16. While the live Part uses
  REPITCH there is no sweep at all (the answer is 1 anyway); the sweep then restarts from the first Part and the answer
  stays 1 until it ends, so a Part with REPITCH elsewhere is never missed. Module `5c49f0f0`, 912 bytes, 8 of bss
  (`module:dev --build-only`, `e3c37df6`).
  - **Emulator** (ot_emu, the same twin, the package in a trial, `call` on `repitch_in_use` with `poke`; the base's own
    rest poll calls it each tick too): nothing anywhere, 300 calls answer 0; REPITCH poked into T6 of bank C's saved
    Part 2, 1 after 29 calls (a sweep is 256); that byte restored, still 1 at once, 0 after 114 calls (at most two
    sweeps); T1's SETUP TSTR on REPITCH with a bound voice, 1 at once, the sweep back at the first Part and holding 1;
    T1 cleared, still 1 at once, 0 after 62 calls. All five pass. Not measured on the unit yet: the tick's µs.
- **Released package:** `e3c37df6` (1,872 bytes), built in the pinned toolchain from this source
  (`build-modules-isolated.sh`, then `octatrack:module-packages`); it is the build the emulator checks above ran. The
  owner approved it on 26 November 2026 (`sdk/approvals/repitch-build-approval.json`), waiving hardware qualification of
  this exact build, chip worst-case cycles and complete memory bounds; 0.1.2's captures stay, as the screens are unchanged.
- **On the unit, with the build before the sweep trim** (package `c97b00a4`, the owner's MKII, OS 1.40C, every trial
  rolled back): at rest +0.2 and +0.1 points of the frame interrupt against +2.2 for 0.2.1 (development twin `be86323a`
  of base 0.7.11, A01 on Part 4, seven FLEX tracks triggered, 20 November 2026); it woke when T1 was set to TSTR RPCH
  while playing and rested again after; Undo restored the empty inventory. On 21 November: 12 Part switches and Undo;
  T1 and T5 on RPCH together, 5,855 frames with zero skipped renders, T1 to OFF left T5 on RPCH; with Euclid and Tape
  Echo beside it, Part Reload, project Save and Reload kept every assignment, then 42.0 % over 5,858 frames with zero
  skipped renders. On 22 November (twin `9203cdf6` of base 0.7.14), in a scene where T5's loop resolves REPITCH, 0.2.1
  and 0.2.2 both added +2.7 points. In the ColdFire interpreter that build passed 3,072 stored Part and track cases,
  5,760 sample lookups and 288 increment cases (longest sweep 489 instructions, longest handler 28).
- **Not run on the released package:** the test procedure (`device:qualify`, a power cycle, removal), the trimmed
  sweep's UI tick on the unit, a listen to a REPITCH track, an MKI.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Installed, no track on REPITCH | must cost about nothing | `device:price` at rest, two paired windows | pass on `c97b00a4` (+0.2, +0.1 points); pass on `e3c37df6` (+0.0 and +0.0 points of the frame interrupt, twin `46c30886` of base 0.8.2, 26 November 2026) |
| A track switched to TSTR REPITCH while playing | the first tick plays at stock speed | USB capture across the switch, increment read before and after | woke on `c97b00a4`; the first tick's increment not captured |
| A sample with TSMODE REPITCH on a TSTR AUTO track | `rp_find` must see it | set AUTO, read the increment | not run: AUTO on a populated sample slot was not confirmed on the unit |
| A Part change bringing a REPITCH track in while playing | the sweep must have seen it | capture across the Part change | emulator pass (five `repitch_in_use` checks); live switch not captured on the unit |
| A REPITCH sample without a tempo | Repitch does nothing there, so it may rest | read the increment | interpreter pass on `c97b00a4`; not run on the unit |
| Undo of the trial over a resting Repitch | its resting sites go back | whole-set trial and Undo | pass on `c97b00a4` (empty inventory, next window 51.4 %); pass on `e3c37df6` (two rolled-back trials, empty inventory after) |

### Test procedure: repitch 0.2.2-experimental, 26 November 2026

Build: revision `0bc26a00c96c`, package SHA-256 `e3c37df63692c4a91675f0e8741d47837929ea6256fecb03d082d059c94b02b7`, the
released package byte for byte. `npm run test:procedure -- repitch --no-unit --no-emulator`, 12 s.

| # | Step | Result |
| --- | --- | --- |
| 1 | Software checks (`npm run module:doctor -- repitch`) | passed |
| 2 | Beside every other module (`npm run modules:compat -- repitch`) | passed |
| 3 | Name the build (`npm run module:dev -- repitch --build-only`) | passed: `e3c37df6` |
| 4 | DSP cost model (`node scripts/cycle-scan.mjs check`) | passed |
| 5-10 | Emulator rehearsal and the unit steps | not run in this run: left out with `--no-emulator` and `--no-unit` |
| 11-12 | By hand, and the submitter's own stage | to do: the owner's |

On the unit the same evening, outside the runner: two rolled-back `npm run device:price -- --memory` trials of
`e3c37df6` on the owner's MKII (development twin `46c30886` of base 0.8.2, built from main `48f4a9b9c`; Dev17 C02):
installed alone, used nowhere, +0.0 points of the frame interrupt both times, module pool 2,720 bytes (the loader
extent of base 0.8's module record, #2284), inventory empty after each.

Not tested on a unit: the runner's unit steps (scripted pass, soak, cost and curve, put back), a power cycle, a listen.

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
