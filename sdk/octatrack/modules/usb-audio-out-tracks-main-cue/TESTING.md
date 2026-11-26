# USB Audio testing

## 0.4.1-experimental (draft), 25 November 2026

**Windows 11 shows Code 10 with 0.4.0 and INPUTS AB, the reporter's error; 0.4.1 starts and plays with INPUTS ABCD, and all three Undos reconnected.** One agent-run unit turn on the owner's Octatrack MKII, base 0.8.1 `e11525835106` RAM-booted from its release image with an empty set (24 November had the owner's kept set of four modules loaded), Windows 11 (usbaudio2 10.0.26100.9974), RAM trials only, nothing kept. Each trial was rolled back and the unit checked 30 s later.

- **0.4.0, Main + INPUTS AB** (published package with the preset `0x8100010C`, `443ca2b0…`, 150 s): the audio function (MI_04, `usbaudio2`) stopped with **Code 10** for the whole trial (31 samples), and Windows offered no Octatrack playback device. This is the Windows 10 report's error, so Windows 11 rejects the implicit-feedback input stream as well and can stand in for Windows 10. Undo: the unit came back on `e11525835106`.
- **0.4.1, Main + INPUTS ABCD** (`5a16b47e…`, 150 s): MI_04 started with `usbaudio2`, status OK, problem 0 (29 samples). WASAPI shared mode played a −30 dBFS 440 Hz tone on all four channels for 60.15 s (2,646,000 frames), no stream status flags. Vendor request 0x56 over 55 s: the host 56.4 ppm faster than the unit, 137 frames absorbed, none repeated; fill 92-112, no underrun, overrun, bad packet or reprime until the tone ended (then one underrun as the stream stopped). Undo: the unit came back.
- **0.4.1, Main + INPUTS AB** (`1c8f7da4…`, the 24 November package, 150 s): MI_04 started, status OK. The player opened the four-channel endpoint Windows still listed from the ABCD trial and failed ("Invalid device"), so no audio was sent in this trial. Undo: the unit came back.
- **The 24 November failure did not recur** in three Undos, one of them after 60 s of four-channel input. Not known whether it depends on the kept set, on the longer stream (240 s), or is intermittent.

### Performance (25 November 2026)

`evidence/performance.json`, measured on the owner's MKII on base 0.8.1 `e11525835106` (release image, RAM-booted, empty set, transport stopped: a release base answers no PLAY key and no `stats` or `guard` request), from the base's own 5-minute load windows (`device.mjs diaglog`):

| | Base alone | 0.4.1, INPUTS ABCD, Windows 11 duplex (4 ch in, 2 ch out) |
| --- | --- | --- |
| CPU meter mean / peak | 43.8 / 44.1 % | 62.7 / 87.9 % |
| DSP T1-4 mean / peak | 32.9 / 33.9 % | 33.6 / 34.8 % |
| DSP T5-8 mean / peak | 41.9 / 43 % | 42.7 / 99.4 % |
| Longest time between two audio frames | 427 µs | 403 µs |
| Longest run of frames without a UI tick | 47 | 2,780 (about 1.0 s; no freeze incident; cause not isolated) |
| Renders skipped, late frame entries | 0, 0 | 0, 0 |

Streaming both ways costs about 19 points of the CPU meter with nothing playing, past the audit's default of 10 points of idle time; not separated into output and input, not measured with a pattern playing, and 0.4.0 not measured the same way. 600 s of duplex: no underrun, overrun or bad packet, 1,511 frames absorbed (57 ppm), no stream status flag on Windows; the Undo reconnected. What changed against the audit's ColdFire template, and why: no static cycle bound and no cfmeter capture (the owner's 0.4.1 approval waives worst-case cycles and current-build hardware evidence), and no MIDI flood (the package has no MIDI path of its own); the measured figures are in the record's method texts and the scored fields stay empty, as `ownerWaivedPerformanceRow` requires.

## 0.4.1-experimental (draft), 24 November 2026

**Windows 11 accepted the input stream and played into INPUTS AB for four minutes; the unit then left USB after the trial's Undo.** Release package `6d7bf894418653feee4aa32a5fb5f74996274edc78f766cc72420bf2193a5502`, tried with the install preset Main + INPUTS AB (`1c8f7da4…`, word `0x8143210c`) as a 330 s RAM trial on the owner's Octatrack MKII, on base 0.8.1 `e11525835106` RAM-booted from its release image, the owner's kept set (Tape Echo, Air Chorus, Grain, Analog BD) loaded. Windows 11 (usbaudio2 10.0.26100.9974), agent-run, nothing kept.

- **Enumeration:** the audio function (MI_04) started with `usbaudio2`, status OK, problem 0, through the whole trial (86 samples, every 2 s). Windows read 343 bytes: EP 0x83 attributes 0x05, EP 0x03 0x09 (adaptive), 96 bytes, bInterval 2.
- **Playback:** WASAPI shared mode played a −30 dBFS 440 Hz tone on both channels of "Line (Elektron Octatrack DPS-1)" for 240.08 s, 10,584,000 frames, no stream status flags.
- **Drift:** vendor request 0x56 every 5 s over 235 s: the host sent 58.1 ppm more frames than the unit consumed (10,374,491 against 10,373,888). The trim absorbed 606 frames (2.58 a second, none repeated), matching the excess with the fill change (603). The ring stayed between 98 and 119 frames: no underrun, overrun, bad packet or reprime.
- **Undo:** the trial rolled back with no crash, stall, freeze or skipped track logged, and the unit answered on base `e11525835106` right after. About a second later it left USB; 15 s later Windows reported an unknown device whose port reset failed (`VID_0000&PID_0001`). It had not come back by 14:44, six minutes later; the owner's power cycle is needed. Whether 0.4.0 does the same after a duplex Undo on Windows is not known.
- **Not run:** INPUTS ABCD (the unit was away), CD, listening (owner), Windows 10 (the reporter's computer), macOS, Linux, the soak, the price and frame cost, Keep and a power cycle. The emulator rehearsal ran on twin `678843ccf3d6`, which refuses USB Audio packages (refusal 3, the published 0.4.0 too).

Host: the trim's tests (`sdk/tests/test_usb_audio_input_trim.py`: bit-for-bit copy with no drift, ±100 ppm and 40 ppm absorbed with no underrun, the interpolated block exact on a ramp and bounded on full-scale input), the descriptor tests, the package tests and the site's USB Audio tests.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Windows enumerates the audio function with INPUTS on | the endpoint attributes | trials with INPUTS AB and ABCD, PnP status and descriptor on Windows 11; 0.4.0 with INPUTS AB for comparison | pass on Windows 11 (0.4.0: Code 10, as reported on Windows 10); not run on Windows 10 |
| Minutes of playback into INPUTS with the host on its own clock | the trim must hold the ring | 240 s tone, 0x56 counters every 5 s | pass: 58.1 ppm absorbed, no underrun |
| Undo of a duplex trial on Windows | the reconnect after the package leaves | the trial's rollback | 24 Nov fail (kept set loaded, after 240 s of input): the unit left USB, port reset failed; 25 Nov pass three times (empty set; 0.4.0 AB, 0.4.1 ABCD after 60 s of input, 0.4.1 AB) |
| INPUTS ABCD | four channels, 192-byte packets | trial with INPUTS ABCD | pass on Windows 11: 60 s on four channels, 56.4 ppm absorbed, no underrun |
| Sound of the trims | an interpolated block every 0.4 s at 58 ppm | by ear | not run: the owner's |
| macOS, Linux | they no longer get implicit feedback | — | not run: not available here |

## 0.4.0-experimental, 23 November 2026

**Not tested on a unit as this exact package.** The owner released it without that run: "Let's just release it, it's been well tested in the other repos it's fine" ([approval](../../../approvals/usb-audio-out-tracks-main-cue-build-approval.json)).

Package `7c144b24ffebfd651db2eefc7dbd364ac7e1750ad5d90358460ca01c543f13f9` (19,948 bytes) requires base 0.8.1 `eb6679620d0c`. It is byte-identical to `0cb56b0c269c` except at offset 66, the inventory kind (8, was 7), so the site can tell it from 0.3.0. `0cb56b0c269c` ran on an Octatrack MKII on 21 November 2026 on the 0.7.13 draft base `8cd1320411a6` and an instrumented twin of it: all four INPUTS modes routed as expected, R1 and R2 recorded the host's tones, and 17 min 34 s of four-channel duplex audio with Vibrato showed no faults ([record](../../../../docs/verification/2026-11-21-octatrack-usb-input.md)). Nothing of that run was repeated on base 0.8.1.

Software: the Python package tests (the input build reports kind 8), the release `--check` against the owner's OS 1.40C, the site's USB Audio, module-set and migration tests, `module:doctor` and the isolated package build from `2d234c770`.

**Captures.** The five [menu captures](media/capture.json) come from `ot_emu` on a development twin of base 0.8.1 with this package installed over the emulator's USB host. Under the emulator's scripted host, the base's USB attach watchdog (#1985) took the unit off the bus about two seconds into the trial, which undid it; keeping the package on the emulator's scratch card avoided that. The watchdog did not fire under macOS on the 0.8.1 unit runs. This is emulator evidence only.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| A unit on 0.3.0 syncs to 0.4.0, then Undo | new inventory kind, 0.3.0 kept for its exact Undo | `usb-audio-package.test.ts` (synthetic packages) | pass (site logic only); not run on a unit: owner waiver |
| INPUTS OFF enumerates like 0.3.0 | the input build's descriptors | 21 November run of `0cb56b0c` (OFF: 4 output channels, none in) | pass on the 0.7.13 draft; not run on 0.8.1 |
| INPUTS AB, CD, ABCD route to the right inputs | the receiver and the DMA scheduler | 21 November run of `0cb56b0c` | pass on the 0.7.13 draft; not run on 0.8.1 |
| INPUTS row on COMPUTER, gone on OUTBOX 8 | the settings page | emulator captures | pass (emulator) |
| INPUTS changed while a host streams | reconnect mid-stream | — | not run: owner waiver |
| Trial ends or the module is removed with ABCD active | crossbar priority and the jacks must come back | — | not run: owner waiver |
| Full speed or Outbox 8 with INPUTS set | must stay output only | — | not run: no full-speed host or Outbox |
| MKI, Windows, Linux | other hosts and panels | — | not run: not available |

## 0.3.0-experimental on an Octatrack MKII, 20 November 2026

The four [menu captures](media/capture.json) show the 0.7.12 release candidate `254c5a75a139` running the migrated Outbox set in the MKII emulator. They show the settings list, USB Audio fields, both stem taps and the four output assignments. The images were taken from the display bytes sent to the emulated panel.

**Release build 0.7.12 `254c5a75a139` passed reconnect, Keep and physical cold restoration.** The MKII recorded and undid eight migrated sets across all five channel counts. Both Track 8/Master trials reconnected, every Undo restored the baseline, and the instrument self-test passed. After Keep and a physical power cycle the release base read the same preset and saved-set checksum from the card without uploading a module. macOS recorded 89,088 stereo frames. A final power cycle restored the original ten modules and their full checksum. The [release record](../../../../docs/verification/2026-11-20-octatrack-usb-audio-package.md#release-verification-on-base-0712) gives the image hashes, channel and frame counts, Outbox pair results and hardware limits.

**Earlier development base 0.7.11 `c7eba65fa9ec` also passed reconnect, Keep and card restoration.** On the owner’s Octatrack MKII, macOS recorded eight RAM trials at 44.1 kHz. The widths in order were 16, 2, 2, 4, 8, 16, 20 and 2 channels. Both Track 8/Master trials recorded 88,576 frames. Every Undo restored the starting set checksum and the base’s four USB interfaces. The panel tick advanced after all eight. The base counted 16 attachments across eight installs and eight Undos. The additional attachment retry did not run during this sequence.

The standalone self-test reported one intact module and zero failures. Keep reported one saved module. The owner power-cycled the unit with its usual card seated. The flashed base restored the ten original modules. RAM-booting the identical 0.7.11 base after the physical power cycle restored the kept Track 8/Master preset `0x80000110` and the exact pre-cycle set checksum without a module upload. macOS then recorded 89,088 stereo frames. A final power cycle restored the ten original modules and their complete starting checksum. The release base ran from RAM throughout. Windows, Linux and physical Outbox outputs were unavailable. The eight-channel USB recording had identical nonzero audio on the two Main assignments and silence on the Off pair in all 88,576 frames.

**Earlier candidate failed on Track 8/Master.** The rebuilt base `e0cbd7173d0b` passed seven RAM trials on the MKII. On the eighth trial it acknowledged the migrated Track 8/Master set and disappeared from USB before recording. The hub failed to enable the port. A software Undo could not be confirmed. The candidate was never kept. The same configurable module recorded at 2, 4, 8, 16 and 20 channels. Both 16-channel post-LEVEL trials returned to the original USB configuration and set checksum after Undo. The UI tick continued advancing after each of the seven successful reconnects. During the eighth trial the owner confirmed that the panel still responded. A cold start restored the original flashed base and all ten modules, with an exact match to the starting saved-set checksum. A physical Outbox was unavailable.

**The previous base `a2ae64eb82bc` failed during Undo.** Two saved 0.2 configurations restored the selected destination, layout and routing on an Octatrack MKII. macOS recorded 89,600 frames each on eight and sixteen channels. Undo restored USB after the Outbox trial. After the sixteen-channel post-LEVEL trial the panel froze and USB disappeared. A cold start restored the responsive instrument and all ten original modules. That earlier candidate did not reach Keep or the cold-start test.

The release package is 11,804 bytes. Its loader header declares 10,288 bytes of initialized image and 94,152 bytes of zero-initialized storage, 230 relocations, and three guarded sites. These figures exclude loader bookkeeping, stack use, and shared base reservations. The [0.3 owner exception](../../../approvals/usb-audio-out-tracks-main-cue-build-approval.json) covers worst-case ColdFire cycles and the complete memory bound including stack and DMA. It is conditional on reconnect, Keep and physical power-cycle verification on the release build.

Build identities, retained freeze diagnostics and the recovery check are in the [unit verification record](../../../../docs/verification/2026-11-20-octatrack-usb-audio-package.md#migrated-sets-on-the-03-release-candidate).

## Historical 0.2 testing

Version: `0.2.0-experimental`. Selected-layout source revision:
`7b2984c859732ae6c797ae49c7d61d250b1b6519`.

The owner requested: “ok let's push and release, I approve no hardware
testing” on 8 October 2026. This experimental release has no physical
Octatrack/Outbox test result. Real-chip worst-case cycles, complete hardware
memory bounds and canaries remain unmeasured. The exact-source approval
is in `sdk/usb-audio-out-tracks-main-cue-build-approval.json`.
No historical or emulator result is relabelled as hardware evidence.

## Software verification

The selected layouts use the shared composer. Source-only packages include
six mutually exclusive audio / descriptor pairs and common MIDI, MIDI RX,
and clamp units. Descriptor MSC spans and the post-LEVEL sine table are
zero placeholders, restored only from the verified original local OS.
The isolated shared source build reproduces the packages; the importer
validates source identities, ELF checksums and placeholders.

Release-tree software commands:

- `npm run check -- --base origin/main`
- `npm run module:doctor -- usb-audio-out-tracks-main-cue`
- `npm run module:verify -- usb-audio-out-tracks-main-cue --os <private original OS>`
- `node scripts/verify-usb-audio-native.mjs <private original OS> <new private directory>`

The classic implementation is compared with full native Octabam coverage.
For each selected layout alone, with Quantizer and with Tape Echo + Euclid,
the layout verifier compares complete GNU runtime bytes and symbols,
checks guarded USB hooks and a single combined ISR, preserves stock input,
round-trips complete update packaging and rejects changed stock. These
layout checks do not claim complete native Octabam image parity, hardware
operation or measured chip timing. Fingerprints / section sizes only are
committed under evidence/layouts.json.

Manual GUI checks cover labels, signal tap / CPU explanation, unavailable
routing feedback, sequential assignments, computer input maps, save state,
discard, and draft preservation across destinations and tabs. No new
Octatrack panel UI is introduced. No hardware cable, rate, audio, load,
startup, MIDI timing or recovery case was tested for this release.

## Current software results — 8 October 2026

- Isolated stock-free source build and guarded import: passed. Six layout
  packages were assembled in the shared toolchain container with network
  disabled. Public provenance uses the native SDK revision plus the exact
  selected-layout upstream pin.
- Eighteen selected-layout cases: passed (six layouts, each alone, with
  Quantizer, and with Tape Echo + Euclid). Complete GNU runtime bytes and
  symbols, guarded USB/reset hooks, one combined ISR, immutable stock,
  full update round trips and changed-base refusal passed. Public builder
  output matched all eighteen compositions. The public worker inspected
  the original and produced packaged firmware for all six standalone
  layouts, reporting USB Audio 0.2.0-experimental.
- Analog BD compatibility: all 136 regenerated native identities and
  refusals equal the previous results. Browser/native and GNU bootstrap
  checks passed for 130 accepted selections and six refusals; five
  complete update packaging round trips passed.
- SDK source integrity: 49 tests passed. GUI labels, smaller-source routing
  feedback, CPU tier updates, configure-first navigation, and compact
  desktop/mobile layout were checked. Saved configurations were preserved.
- Full classic USB module comparison and app release checks are recorded
  with their final results in docs/VERIFICATION.md.

Only hashes and linked section metadata are in evidence/layouts.json.
Firmware and reconstructed stock remained private outside the repository.
No physical test is claimed.

## Historical classic implementation evidence

The following record describes older versions and their actual source,
conditions and limits. It does not qualify physical operation of 0.2.

# USB Audio testing

Version: `0.1.3-experimental`. Octabam evidence pin: `363861e31ee963c478fab2b190a0fabe1d7ce37b`; USB MIDI receive path from `4caa196594bb16ab0dc4710f1b8d2adf95010cdf`.

Selected for the broadest recorded hardware evidence: MKI and MKII, sustained multi-track 24-bit captures and high MIDI receive traffic. The latest source includes track/MAIN alignment and a hardware-tested master-on CUE correction; startup artifacts and unmeasured host/platform cases remain.

## Integration status

Octamod loader-free composition is implemented at this version. The native matrix covers all 256 subsets of the eight visible modules with stock FX2 omitted, plus 32 stock-FX2 profiles: 156 byte-identical OS compositions and 132 matching refusals. The actual production-bundle browser worker produced complete native-identical files for the six-module and Analog BD five-module combinations and rejected altered base firmware. GNU link proofs cover all 15 nonempty combinations of the four requested runtime groups. See docs/VERIFICATION.md for file identities, reproduction and coverage limits. No DSP execution, emulator, audio-render or stress suite was run.

## Historical gates

- `tools/verify/verify_usb.py` (upstream record; not run here).
- `tools/verify/verify_usb_align.py` (upstream record; not run here).

These gate references belong to the pinned upstream tree. Author encoder/regeneration tooling and the updated native builder are not all part of this trimmed SDK. Use the exact pinned upstream for reproduction in isolation; never run unreviewed code on a trusted host.

## Release and hardware requirements

- Review imported rights, source pins and authored code; owner merge approves this exact module version.
- Release automation must reproduce the committed source packages from the exact owner-merged commit.
- Recover every stock instruction/helper/table locally with fingerprint validation. Never put stock into automation or committed packages.
- Renew native and actual-browser parity and rejection evidence when composition code or module sources change.
- Record hardware limits separately; historical results do not qualify the imported revision.

USB MIDI lives under `../../platform/usb-midi/`. It is an internal requirement, not another public catalog option. The output-only twenty-channel layout was selected for MKI/MKII and sustained-stream evidence. USB input and USB CROSSBAR are not imported because this selected output does not require them.

Octamod 0.1.1-experimental: browser composition uses reviewed source packages and derives inherited bytes from local 1.40C. The native matrix passed 156 byte identities and 132 refusals. The owner reported both combined native test images working on 1 October 2026; detailed feature/load qualification is not claimed.

## OT UI publication exception

Version 0.1.2-experimental adds host/device access instructions and the
`access.noUiReason` declaration. No dedicated OT page or controls are added
by this automatic USB contribution; no unrelated stock screenshot is supplied.
The reviewer must verify the exception against the exact upstream pin before
publication. No source was executed and no USB or firmware tests were run for
this documentation change.

## 0.1.3-experimental: USB MIDI clock sets the tempo (7 Oct 2026)

Reported for 0.1.2-experimental on an MKI (issue #223): with CLOCK RECEIVE
on and clock arriving over USB, the sequencer followed but the TEMPO page
kept the old value. The firmware's clock handler (`0x40005a48`) builds the
tempo from the DTCN0 interval the UART0 ISR stores for each `0xF8`; the USB
decoder enqueued the byte without that interval.

- `usbmidi_rx.s`: octabam's file at `4caa1965`, unchanged (octabam #629,
  #633). It timestamps each `0xF8` as the UART0 ISR does and makes room in
  the 32-byte MIDI FIFO before each event.
- `usbaudio.s`: `audio_isr_shim` jumps to `usbmidi_rx_isr_shim` instead of
  `usbmidi_isr_shim` (octabam `97a781c0`). The rest of `usbaudio.s` is the
  `363861e` source.
- Not taken: octabam's SET_CONFIGURATION shim, which re-sizes the high-speed
  RX transfer to 512 bytes. Installing it would change the shared USB MIDI
  platform package; without it `usbmidi_rx_state` stays 0 and the receive
  transfer keeps the firmware's 64 bytes, as in 0.1.2.

Upstream evidence: `verify_usbmidi_clock` under the ColdFire port read 1200
and 1498 for USB runs at 50 and 40 ms per tick (want 1200 and 1501), and
2400 for both before the change; Kazeko's MKI reported USB clock working
after the change (octabam #633, 6 Oct 2026). Those runs used octabam's
`usb-midi` remix, not this module. Here nothing was run on a unit or under
the port: the verify gates and the emulator's DTIM0 change are not part of
this SDK.

## 0.1.4 lifecycle update

Ported reset/session-end hooks, bounded EP3 flush polling, and closed-stream producer gating/startup cushion clearing from octabam 6f9e5bc9. The USB MIDI clock receive shim from 0.1.3 is retained. The new stock hook sites are protected by SHA-256 guards against the user's original OS 1.40C; no firmware bytes are stored in the repository.

Current hardware cable pull/reconnect, host crash/reopen, startup capture, stalled-controller timing, Windows and Linux host behavior: **not tested**. Earlier hardware captures do not qualify this new version. Software rebuild and native/browser comparison results are recorded separately after verification.

Software verification on 7 October 2026: isolated stock-free package compilation passed; `npm run module:verify -- usb-audio-out-tracks-main-cue --os <local original OS>` compared 98 selections, with 46 matching module-owned images, 52 matching native refusals and zero mismatches. The logger/platform writes account for the deliberate full-image difference. Modified original firmware is refused. `npm run module:doctor -- usb-audio-out-tracks-main-cue` is green. Fingerprint-only evidence is in `sdk/native-comparisons/usb-audio-out-tracks-main-cue.json`; no firmware or extracted stock bytes are committed.
