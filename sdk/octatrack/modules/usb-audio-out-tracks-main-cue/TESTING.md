# USB Audio 0.2 testing

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
