# CC Map testing

Release version: `0.1.2-experimental`. Native source SHA-256: `85ac180b75837d7681c74325b29a3a78416d3b2a8890fb6394f033c27993393d`.
Native reference image (stock effects retained, BUILD=79): `2ca87b1313e1f6a1776eb11314dfd2082ec273fad3fa8c0432dc23a35ab59812`.

## Release evidence and owner waiver

Released with the owner’s 2 October 2026 waiver for these exact source versions. Physical hardware stress and real-chip worst-case cycles are **untested/unmeasured**. The frozen eleven-module baseline is unchanged; later versions require ordinary qualification.

[The source-bound software report](evidence/software-verification.json) is paired with `tests.releaseWaiver` and the immutable two-entry [owner waiver record](../../../module-release-waivers.json). Folder and native-source hashes must match exactly. The manifest alone cannot approve a submission; public contributions still require full qualification. No passed hardware status, measured cycles or one-hour stress project is claimed. Authored source files and capture provenance remain unchanged; this release raises the version for documentation/browser integration.

## Native/browser composition and rejection

The native `build_bus` oracle ran in the existing source-tools container with no network or credentials, read-only inputs/root, dropped capabilities, unprivileged UID/GID and resource limits. Only the user's SHA-256-verified local MAIN OS was supplied. 512 subsets of miniverb, tapeecho, euclid, repitch, analog-bassdrum, usb-audio-out-tracks-main-cue, quantizer, previewvol and cc-map use hidden stock FX2; the same 512 subsets also use main’s stock-retaining menus, omitting only the required DSP donors. Browser composition matches all 522 successful complete MAIN OS byte identities; all 502 native compatibility/space refusals agree. Proof identities live in `src/engine/assets/utility-composition-proofs.json`, never firmware bytes.

Source-only utility compilation checks upstream/vendored assembly and manifest identities, disallows includes/binary transclusion, assembles authored ELF, compares relocations at 0x400d6b80, 0x400d7080 and 0x400d24d0, and compares CC Map with its native authored oracle. Source compilation cannot read firmware. Preview Vol follows native linked-unit ordering after Repitch/Scale Quantizer; CC Map follows native cave ordering after Tape TIME. Eight complete native ELEK containers and ELUP upgrades match byte for byte, including both utilities with Repitch, USB Audio/MIDI and Scale Quantizer. Altered/truncated base and unknown-module rejections pass, and original inputs remain unchanged. The actual browser worker built both utilities with compact and retained-stock FX2 menus; both downloads match the native full-upgrade identities. Saved selections and base restore/revalidation, 390px mobile layout/media/tutorials and keyboard tutorial toggling pass. No firmware/DSP/audio/stress suite runs in ordinary application checks or visitor builds.

## Memory accounting and control bounds

The cave is 724 bytes: authored instructions occupy 712 bytes and VCOUNT/DCOUNT occupy 12 bytes. There is one shared copy regardless of track count. Native placement aligns to 128 bytes in the main cave, or four bytes in the overflow run. Zero-run guards and bounds reject overlaps; padding is 0..127 bytes. The four-byte vector replaces existing flash and allocates no extra flash. No new heap/persistent RAM/DSP memory is allocated. Authored stack peak is 56 bytes above entry: 28 saved-register bytes + two nested 4-byte BSR returns + 16 adapter-save bytes + one 4-byte JSR return. MAPBUILD is an existing stock helper; its existing frame and existing channel/Part/live/shadow state remain stock resources, not new module allocations. Whole-firmware stack headroom and memory canaries under physical load remain untested.

Static bounds: eight track iterations per MIDI event; no unbounded loop in authored code. CC 62–67 only write FX2 IDs 6/7, which are absent from current stock/catalog effects. FX1 NONE skips; FX1 values clamp to its descriptor. AUDIO CC IN disabled consumes this range without writes; other CCs tail-call stock. Neither MODE DEFAULTS nor SCENES KITS overrides is installed.

The selected build's free-space writer verifies each address/length and zero guard before the transaction. Actual padding/placement depends on the selected modules, not track count. Both utilities together add 760 authored ROM bytes; each allocation's alignment is priced separately. These are exact authored allocation bounds, not a whole-chip free-memory or hardware timing claim. CPU/DSP/memory gauges use source estimates of incremental workload; chip worst-case cycles remain null.

## Ordinary validation

Use Node 24: `npm run check`, `npm run modules:check -- --base origin/main`, `git diff --check`. These read data and run domain checks; no submitted native Python is evaluated. The private developer parity command is `node scripts/verify-utility-native.mjs <local-1.40C.bin> <native-proof.json> <native-packaging-proof.json>`; it writes no firmware. Module source/version changes invalidate this release waiver and need new full qualification.

## Actual LCD captures — 2 October 2026

The owner requested a thumbnail, complete documentation and actual OT
screenshots. The original 0.1.1 capture session used only isolated UI builds; the 0.1.2 release separately adds owner approval and software parity. The capture profile contains
CC MAP and stock effects, with `static_stock=True`. BusDelay, BusVerb,
MODE DEFAULTS, SCENES KITS and every other source module are excluded.

The native builder is the SDK's `tools/build/build_bus.py` at tool revision
`b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. A local wrapper supplies the
stock-plus-CC-MAP `Remix` profile and calls `build_bus.main()` in an ephemeral
Docker container: network disabled, capabilities dropped, no new privileges,
read-only container filesystem, unprivileged UID, only the private temporary
workspace mounted and no host credentials. The local image builder received
the owner's fingerprint-verified 1.40C extraction. Firmware never entered
source-release automation or the PR.

The 724-byte linked cave matched `legacy_bytes()` at its native placement.
Capture image SHA-256:
`2ca87b1313e1f6a1776eb11314dfd2082ec273fad3fa8c0432dc23a35ab59812`.
The emulator was built from the SDK source using the existing patched local
cores in the same isolated container. No CTest/native gate suite was run.
[media/capture.json](media/capture.json) records exact source/tool identities,
profile, build settings, capture plans, hashes and reproduction details.

Capture uses `scripts/capture-module-ui.py`, a fresh empty scratch FAT card,
MKII panel, stopped transport, `--dsp --frame --main-level off`, and actual
128×64 LCD pixels at scale 6. Docker shared memory is 512 MiB. The LCD
renderer maps its two pixel values to `(235,235,235)` and `(24,24,24)` before
creating PNGs; label shapes and control pixels are unchanged. A temporary
adapter for the second session accepts one bounded MIDI CC action and sends
the emulator's documented `midi b0 44 01` command followed by `run 200`.
The adapter changes and exact plans are recorded, not hidden behind a UI poke.

Verified UI-only results:

- PROJ > MIDI > CONTROL shows AUDIO CC IN enabled.
- MIDI > CHANNELS shows T1 TRIG CH 1 and AUTO CH 11 as separate settings.
- T1 FX1 and FUNC+FX1 reach FILTER's main and SETUP pages.
- Real UART0 input CC 68 value 1 on channel 1 changes FILTER's HP from
  12 dB to 24 dB. Closing/reopening SETUP refreshes the display, because the
  cave omits the stock editor's redraw call. No memory poke changed the control.

Every committed capture was visually inspected. The thumbnail is a separate
original routing illustration, explicitly labelled as such. These captures
prove only the documented MKII emulator UI paths and one visible control write.
MKI behavior, other effect controls, audio response, Part save/reload,
maximum audio workload and physical hardware remain unverified. Native/browser composition now passes the matrix above. Temporary images, cards, raw LCD/RAM files and logs are removed;
only reviewed PNGs and sanitized metadata enter module media.

## Historical upstream results

[Pinned upstream notes](OCTABAM.md) describe `tools/verify/verify_ccmap.py`
under Unicorn: CC 62 writes and clamps Part/live/shadow bytes for tracks 0–7;
CC 40 passes onward without page-2 writes. The ColdFire port reports CC 68
reaching FX1 page 2 and its DSP record on 15 September 2026. These gates are
not imported or run here and their results do not prove current physical behavior.

Historical MKII image 96 is described as moving SHMR via CC 63 and changing
reverb-tail bands; image 97 exercised FX1 MODE via CC 69. The native manifest
labels its proof as hardware use on 13 September 2026. Earlier images wrote
the wrong page-2 byte. Preserve these notes as historical evidence, not a
passed current-version hardware stress record.


