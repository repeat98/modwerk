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
