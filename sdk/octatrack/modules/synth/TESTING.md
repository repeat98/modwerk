# FM Synth 0.1.3: what it costs on no track

0.1.3 makes FM Synth cheaper on the CPU, above all while it is installed and on no track. Sound and controls are meant to be unchanged; one stock bug FM Synth caused is fixed (below). It changes `upstream/synth/poly.s`, the LFO site's kind in `upstream/synth/manifest.py` and the machine port (no RENDER_FLEX); no base change. The 0.1.2 report follows unchanged below.

## The report and the readings (14 November 2026)

**Report** (owner's MKII, development twin `0277c5c5` of main): four FLEX tracks sounding one loop, T5-T8 STATIC and silent, 126 BPM, playing. The frame interrupt takes 41-42 % without modules; with only FM Synth 0.1.2 installed, on no track, 19.1 points more, the CPU meter 7.8 more, the longest frame 86 % -> 109 %.

**Measurements** (`node scripts/octatrack-price.mjs` from the `price-sweep` worktree on that twin and scene, each package tried in RAM for 8 s and rolled back by itself, its own reading without modules just before it; points of the frame interrupt at rest, CPU meter in brackets). Every run included the first 0.1.3 source as its reference: +15.6 / +15.7 / +15.7 / +15.6. Bisect variants are measurement builds, never published: "without X" removes that site or flag from the package, "stub" makes the routine return at once.

| Package | Frame (CPU) | Tells |
| --- | --- | --- |
| 0.1.2 (published) | +19.0 (+8.5) | reference |
| 0.1.3, first source (`e9ae3e5e…`, 13 November) | +15.6 (+5.3), +15.6 (+6.6) | reference |
| ...every frame-interrupt site and RENDER_FLEX removed | +0.0 (-0.7) | nothing else of FM Synth costs at rest |
| ...without RENDER_FLEX | +6.8 (+2.6) | the base's FLEX route to FM Synth's render: 8.8 |
| ...RENDER_FLEX kept, `sy_render` jumps to stock at once | +13.3 (+4.4) | of that, the base's guarded route 6.5, `sy_render`'s fast path 2.3 |
| ...without the STATIC entry | +15.8 | 0 here (T5-T8 STATIC but silent) |
| ...without the slot copy `0x4000d514` | +13.4 | 2.2 |
| ...without the LFO depth sites | +12.8 | 2.8 |
| ...without the retrig site | +15.7 | 0 |
| ...without the trig-time sites (start, release, kill, stop) | +17.2 | none (noise or a side effect) |
| fix, first: frame masks, no RENDER_FLEX, the Part read every frame | +4.3 (+1.7) | |
| ...without the slot copy | +3.9 (+1.3) | the slot copy 0.4 |
| ...without the LFO depth sites (no clock, no masks) | +0.2 (+0.8) | the LFO pass's part 4.1 |
| ...`fm_frame` stub | +2.1 (+1.3) | the Part read every frame 2.2 |
| fix, second: the Part read a word at a time | +4.9 (+2.7) | no gain |
| ...`po_tick` stub | +4.3 (+1.8) | the clock about 0.6 |
| ...`fm_frame` stub | +2.4 (+0.9) | the Part read every frame 2.5 |
| **0.1.3 as committed**: the Part read only for tracks that may need the engine | **+3.2 (+2.2)** | |

**Cause.** Installed on no track, FM Synth's code and data were on every stock track's frame path, and every line of it a track touched missed the cache, since the renders between evict it: the base's route for unowned FLEX tracks to a RENDER_FLEX machine (its frame guard around each render), the slot copy, the LFO pass (24 calls a frame: eight tracks, three LFOs) and `sy_render`'s fast path. Reading the Part's bytes (bank, Part index in battery RAM) every frame for all eight tracks then cost 2.2-2.5 points by itself. This is reasoned from the readings above; no cache counters were read.

**Fix** (no new site, no base change):
- FM Synth's machine declares no RENDER_FLEX: the base renders a FLEX track nobody owns as stock, and FM Synth never sees it.
- `fm_frame` works out once a frame, from the LFO pass's track 0 (it runs every frame before the packer; nothing jumps into 0x4000cf40..0x4000d3fc from outside), which tracks the engine must render: FM tracks that have started, sample tracks while GLIDE is on, a sample track with a voice of ours on it (a legacy FMSYNTH* sample) and a sample track a voice starts on. It reads the Part only for those (FM last frame, a voice of ours on, a start this frame, every track while GLIDE is on); at rest it reads GLIDE and the packer's event bytes only.
- The slot copy (`fm_source_dispatch`) tests one bit of one line inline and gives the engine only those tracks; any other track keeps its renderer, and a STATIC track bound under the STATIC entry gets stock's back. The STATIC entry stays `sy_render` so that the base retargets every slot holding `sy_render` when FM Synth leaves (`runtime.c`).
- The LFO depth site in the frame builder is a `jsr` whose LFO 1 and 2 return within one line; LFO 3 tests one bit (`FR_ON`, kept by `sy_set` and `po_kill`, the only writers of `S_ON`) instead of the track's record.

**Fixed on the way: track 1's LFO 3.** In 0.1.2 and 0.1.3's first source the frame builder's LFO site called the clock (`po_tick`) for track 1's LFO 3 before the displaced `lea (a0,d4.l*2),a1`, and `po_tick` leaves `a0` at FM Synth's clock: so whatever track 1 played, its LFO 3 wrote into FM Synth's clock instead of its destination (emulator, the first 0.1.3 image: `a1` = `po_clock + 10` for destination 5, the target for every other track). With a depth of 0 nothing changes; with any other depth track 1's LFO 3 did nothing and FM Synth's frames-per-step and tick count took the values. Now the displaced instructions come first. Not heard on a unit.

**Can it differ in use?**
- A FLEX track counts as another machine's when its signature bytes (the NEIGHBOR page's first three) are two capitals, or a capital and a digit, then 1..15 (PL/1, S2/1-2, AB/1, WV/1-15, FR/1); the module cannot see the base's rows. Such a track is never given to the engine, as the base never gave a machine's track to FM Synth. A plain FLEX track whose NEIGHBOR bytes only look like that plays without the GLIDE slide and plays a legacy marker as its sample (0.1.3's first source slid it). A future machine whose signature falls outside that pattern would get FM Synth's render on its tracks while GLIDE is on.
- A track that becomes an FM track is given to the engine at its first START; until then it renders through the base, its stock voice stopped, which is silence as before.
- A STATIC track bound before FM Synth was installed slides with GLIDE at once, where the first source waited for the track's next binding.
- `po_rtlog`'s pass counter still counts every pass of the retrig site (unchanged).
- The longest frame stays about 110 % at rest, as with 0.1.2 and 0.1.3's first source, and goes away only when no start on a sample track is given to the engine (two bisect builds read 88-89 %): at a START on a FLEX sample track `sy_render` resolves a legacy marker by scanning the slot's path in battery RAM. Not changed here.

**Emulator equivalence probe** (scratch, not committed: the octabam ColdFire emulator with the local stock MAIN for memory, the package's image relocated). It ran 3,000 frames of random bank pointers (valid, odd and out of range), Part indices, machine bytes (0-5, 0x81), signatures (FM/1, FM/2, PL/1, S2/2, AB/1, WV/7, WV/16, FR/1 and near misses), GLIDE, event bytes and `FR_ON`, then every LFO of every track and every track's slot copy with six kinds of renderer:
- `fm_frame` gave the masks the rules above give, `FR_NAT` matched 0.1.2's `fm_is_native` on every track it read, and it kept every register it must;
- `po_lfo3b` gave `po_lfo3_depth`'s depth and target on all 72,000 calls, ran the clock and the masks once, on track 1's LFO 3, and kept every register;
- `fm_source_dispatch` stored and passed the expected renderer on all 24,000 calls and pushed the second call's end.

1,508,128 checks, 0 failures. Not probed: `sy_render` and the engine (unchanged code), the start and release paths.

**Build checks.** The USB package is built through the site's builder (`19e7e08c…`, 30,498 bytes, 24 sites, 39 stock copies), the build the readings above measured, and is stock-free (longest run shared with the OS 11 bytes, `check_stock_free.py` none); its recipe was recaptured and the machine port's pins moved, and the other machine recipes' pin of `machine-ports.json` moved with it.

**What remains** (+3.2 at rest): the LFO pass's 24 entries and the clock (`po_tick`, which FM Synth's HOLD timing and the recording's note lengths need every frame), `fm_frame`'s reads of GLIDE (battery RAM) and the event bytes, the slot copy's eight entries, and the work at each START on a sample track (the engine's start path through the base's guard). Only a dispatch that never enters FM Synth's code for a stock track removes it all: the base calling the machine for its own tracks only, and a clock and LFO mute the base raises, a base change that is not part of this version.

**Not tested on hardware:** FM tracks by ear (notes, chords, glide with LEG MONO and POLY, MIDI notes, STOP and pattern changes), GLIDE with LEG MONO on a FLEX and a STATIC sample track, a legacy FMSYNTH* sample, track 1's LFO 3, a track changed from FM back to FLEX, Part and project save and reload, a restart, removing FM Synth while it plays, MKI. The emulator gates of 0.1.2 were not rerun.

## The first 0.1.3 source (13 November 2026)

The first source read the Part, GLIDE and each track's FM test once a frame in the render path, and `sy_render` gave stock a track that is not FM, holds no synth voice, has GLIDE off and starts no voice in that call. Measured on the owner's MKII (a development twin `55ab6215` of the base at `main` `bd9b5b0df`, one busy project at 126 BPM, fourteen other modules installed, FM Synth on no track; `npm run device -- guard`, `stats` and `profile`, three 5 s windows playing and two stopped):

| Build | Frame interrupt, playing | CPU meter, playing | Frame interrupt, stopped after playing | UI tick chain | Longest frame | Renders skipped in 10 s |
| --- | --- | --- | --- | --- | --- | --- |
| No FM Synth | 63.1 % | 73-76 % | 31.8 % | 574 us | 98 % | 0 |
| 0.1.2 | 76.6 % | 84-88 % | 43.6 % | 1,083 us | 110 % | about 12,200 |
| 0.1.3, first source | 73.9 % | 81-85 % | 40.2 % | 942 us | 111 % | about 230 |

That package was the build `e9ae3e5e…`. The frame guard's figure is its guarded window; the CPU meter is what the panel feels (docs/MODULE_PERFORMANCE.md). The committed 0.1.3 was not measured on this project.

# FM Synth 0.1.2 regression testing

This is the experimental 0.1.2 update for [#264](https://github.com/repeat98/modwerk/issues/264) and [#273](https://github.com/repeat98/modwerk/issues/273), tested on 8 October 2026. It is included in the catalog. Current hardware, chip worst-case timing and complete stack/memory bounds remain unknown. The owner explicitly authorized this new release and issue closure without current hardware validation: “please release them and close. I green light no hardware validation for now”. This is a new exact-source update approval; the 0.1.1 approval is historical.

## Changes and reproduced failure

The privately bundled quantizer's octave-number hook originally replaced eight bytes at `0x400449b8`. The stock MIDI branch targets `0x400449be`, inside that replacement, and skips the required octave argument push. The drawer then consumes one more argument than was pushed and corrupts its caller's stack. On the released browser image, selecting a MIDI trig mode freezes the UI; the debugger finds the stock HALT diagnostic after a bad return into a data address. The baseline does not reach the post-selector SRC gate.

The replacement starts at the common argument push, `0x400449be`, with a fresh eight-byte stock hash guard. MIDI uses the octave already in d0, pushes it once, preserves the stock format argument and resumes at `0x400449c6`. Audio retains the scale/root rendering. Normal MIDI/audio paths no longer branch into detour padding. The patched browser image passes repeated selector DOWN/UP navigation and returns to the Synth SRC controls. The repeatable `verify-regressions.py --case midi` runner also passes, including both pre- and post-selector display gates.

FM source output now shifts right three bits: mono after its output conversion, and each paraphonic contribution before accumulation. This leaves 18.06 dB more headroom before the stock AMP path and voice sum. Existing envelope gains, relative voice normalization and crossfade state are preserved. Every existing sound is quieter at the same mixer settings. Effects, resonant filtering and multiple tracks can still clip.

**The reported hardware static has not been reproduced.** Both baseline audio configurations below remain below signed 16-bit full scale. The measurements verify attenuation and continued playback/STOP recovery, not resolution of every artifact in #273. A physical MKI/MKII retest with the reporter's sound/settings is still needed.

## Private software builds

The current 0.1.2 source and metadata are compiled together with the ordinary shared compiler. The earlier development-image report is retained separately in `evidence/development-regressions.json`. Current-main builder inputs produce a slightly different browser image, so MIDI, mono and four-voice regressions were all rerun on that exact release image. The standalone native image reproduces the freshly captured LCD image byte for byte. The compiler/exporter run in the isolated stock-free toolchain container with network disabled, a read-only root and private tracked-source/output mounts. No firmware enters Git.
Compilation passes. Only the private Synth `poly`/`fm_qz` objects and their linked group change in requested-packages; unrelated packages remain identical. Build identities are recorded in `evidence/regressions.json`:

- Patched browser MAIN: `64beb992dd65cad096d2c70f23bb3064c715464d651da22dd3ad9024901831e9`.
- Patched upgrade: `c1a57f818998923e27ee9ae36061f2c1fe050788619ccceec6d0c24dac04d392`.
- Patched standalone native MAIN: `d5464195fac0033852546fbbc8f809b64d16646309c21ab25e2f203fbf123157`.
- Released 0.1.1 browser MAIN baseline: `c1fbc0b2eaf284e72692b7048d1dfd3693f3e3e90c71229159a619d585b52c95`.

The native proof's `osSha256` is the module-owned image before platform writes; it is not the emitted MAIN's file hash. Capture/replay checks use the actual emitted file hash.

All **110 current coverage selections** pass the existing `compareSelection` native/browser comparator: **31 built** (module-owned bytes equal outside the established platform/logger spans), **79 matching refusals**, **zero mismatches**. This covers standalone Synth, pairings, fuller selections and both stock-FX2 policies. The input stock image remains unchanged. An altered stock byte is rejected and that input also remains unchanged. See `evidence/composition.json`. Mixed images have composition evidence only, not audio stress qualification.

## Panel and audio regressions

Octemu binary SHA-256: `3ce6cebde0de2c61edc4228436338a1e115ce227373351a5ca84aefc9cf90acb`. The local source checkout is dirty, so its HEAD alone is not claimed as the tested executable identity. A private copied, sample-free firmware-created project has a step-1 T1 trig and FX1/FX2 NONE. Card/battery identities are recorded in `evidence/regressions.json`. Every image/case starts with a fresh copy of the battery state. Native UI capture uses the separately fingerprinted headless `ot_emu` in `media/capture.json`. The extra Octemu regression screenshots retain their original development-image bindings in `media/regression-capture.json`; they are not relabelled as new browser-image captures.

Actual panel input selects FM SYNTH, sets INDX=0, AMP REL raw 40 and AMP VOL maximum (display +63), starts PLAY, then sends STOP twice. The four-voice case additionally sets VOIC=4 and CHRD raw 127 (display M7S2). The retained LCD exports confirm these controls. Recordings are stereo 44.1 kHz signed 16-bit PCM, including boot/settle silence. Peak comparisons therefore measure the full captured take rather than time-aligned samples.

| Configuration | Released peak | Patched peak | Peak change | Final half-second peak, patched |
| --- | ---: | ---: | ---: | ---: |
| One voice, INDX=0 | 14,630 | 1,827 | −18.07 dB | 0 |
| Four voices, CHRD=127 | 21,912 | 2,740 | −18.06 dB | 1 |

Both mono takes have an autocorrelation period of 169 frames, about 261 Hz. This is a coarse period estimate, not a precision tuning claim. Both four-voice takes sound and stop; their 149-frame autocorrelation minimum is not interpreted as a single-note pitch. Host scheduling and audio delivery behavior are not measurements of real chip timing.

Sanitized measurements, fixture hashes and PCM fingerprints are in `evidence/regressions.json`; panel walks are the adjacent JSONL files. Raw logs, WAVs, card images, battery files, firmware and debugger memory stay private.

Reproduce with a reviewed local Octemu checkout and the sample-free fixture above, inside a restricted local sandbox with reads limited to tool/runtime, emulator and private fixture/image folders, writes limited to a fresh private output folder, and only local emulator IPC:

```sh
python3 -B verify-regressions.py \
  --octemu /path/to/octemu --image /private/patched-main.bin \
  --image-sha256 64beb992dd65cad096d2c70f23bb3064c715464d651da22dd3ad9024901831e9 \
  --card /private/sample-free/card.img --battery /private/sample-free/nvram.bin \
  --output /private/new-midi-run --case midi --timeout 300
```

Use `--case mono` or `--case poly` and a fresh output path to record audio. The runner verifies its supplied image hash, copies the fixture, gates on firmware displays/transport, checks sustained audio and double-STOP silence, and checks the mono carrier period. Run the same audio walks against the baseline image for a paired gain comparison. All three runner cases were executed against the exact 0.1.2 browser image. The earlier screenshot walks are retained separately as development evidence; their LCD controls are unchanged.

## LCD captures and remaining qualification

All seven control/chooser LCD images were captured again from the patched standalone native MAIN, then opened and visually reviewed. Their pixels are unchanged from 0.1.1, while their provenance binds the new emitted image. `media/capture.json` records the emulator, image, plan and screenshots. The maximum-AMP, four-voice and MIDI-selector screenshots have separate Octemu regression provenance.

Browser runtime reservation remains 10,586,112 bytes (native shared arena plus logger reservation), with a reported runtime extent of 90,268 bytes. These are shared build extents, not complete Synth ownership or worst-case stack/lifetime bounds. Worst-case ColdFire cycles and DSP transport overhead are unmeasured. Hardware on both models, maximum simultaneous tracks, external MIDI note/CC traffic, modulation, p-locks, scene sweeps, effects, saved project/Part reloads, non-default speed/length, swing, loop/restart transitions and neighbouring sample playback remain untested.

`evidence/release-0.1.1/` retains the previous reports and approval as historical context. They do not qualify 0.1.2. `qualification.example.json` remains an incomplete worksheet. The owner authorized this experimental release despite the disclosed qualification limits. The current source-bound approval is in `sdk/synth-build-approval.json`; version-matched release notes, catalog and compiled packages are updated together. Hardware, timing and memory quantities remain unknown.

## Repository validation

The fixes originated at `73490ef77f36bf523bc28f2b385d62e331ec7c5c`; current compiled code and exact release-image identities are recorded in `evidence/regressions.json`. The earlier draft's 167-file / 1,077-test result remains in `evidence/software-checks.json` as historical evidence. The 0.1.2 release runs `npm run check -- --base origin/main` and `module:doctor -- synth` against the promoted source and current compiled packages.

The release preserves every non-Synth package payload and recipe against the main-branch baseline. The retained Analog BD native matrix is checked against the current packages: 130 native OS and GNU bootloader comparisons, six matching refusals and five complete firmware round trips. Its global source-inventory binding changes only after those checks; Analog BD source and package bytes are unchanged. These software comparisons do not qualify hardware.
