# Preview Vol testing

Release version: `0.1.2-experimental`. Native source SHA-256: `86deed960c094df1d0d2a4a9d3a955a62e804175f2f22d8ac53f5eff141aeaca`.
Native reference image (stock effects retained, BUILD=79): `3900e54e9154d66df6001b0f96da2ca07c42bf5c7be7f1157ddd9a071601f2cc`.

## Release evidence and owner waiver

Released with the owner’s 2 October 2026 waiver for these exact source versions. Physical hardware stress and real-chip worst-case cycles are **untested/unmeasured**. The frozen eleven-module baseline is unchanged; later versions require ordinary qualification.

[The source-bound software report](evidence/software-verification.json) is paired with `tests.releaseWaiver` and the immutable two-entry [owner waiver record](../../../module-release-waivers.json). Folder and native-source hashes must match exactly. The manifest alone cannot approve a submission; public contributions still require full qualification. No passed hardware status, measured cycles or one-hour stress project is claimed. Authored source files and capture provenance remain unchanged; this release raises the version for documentation/browser integration.

## Native/browser composition and rejection

The native `build_bus` oracle ran in the existing source-tools container with no network or credentials, read-only inputs/root, dropped capabilities, unprivileged UID/GID and resource limits. Only the user's SHA-256-verified local MAIN OS was supplied. 512 subsets of miniverb, tapeecho, euclid, repitch, analog-bassdrum, usb-audio-out-tracks-main-cue, quantizer, previewvol and cc-map use hidden stock FX2; the same 512 subsets also use main’s stock-retaining menus, omitting only the required DSP donors. Browser composition matches all 522 successful complete MAIN OS byte identities; all 502 native compatibility/space refusals agree. Proof identities live in `src/engine/assets/utility-composition-proofs.json`, never firmware bytes.

Source-only utility compilation checks upstream/vendored assembly and manifest identities, disallows includes/binary transclusion, assembles authored ELF, compares relocations at 0x400d6b80, 0x400d7080 and 0x400d24d0, and compares CC Map with its native authored oracle. Source compilation cannot read firmware. Preview Vol follows native linked-unit ordering after Repitch/Scale Quantizer; CC Map follows native cave ordering after Tape TIME. Eight complete native ELEK containers and ELUP upgrades match byte for byte, including both utilities with Repitch, USB Audio/MIDI and Scale Quantizer. Altered/truncated base and unknown-module rejections pass, and original inputs remain unchanged. The actual browser worker built both utilities with compact and retained-stock FX2 menus; both downloads match the native full-upgrade identities. Saved selections and base restore/revalidation, 390px mobile layout/media/tutorials and keyboard tutorial toggling pass. No firmware/DSP/audio/stress suite runs in ordinary application checks or visitor builds.

## Memory accounting and control bounds

The linked text is 36 bytes: two 18-byte stubs, one shared allocation. Each stub contains four instructions, reproduces the overwritten envelope write, adds default AMP VOL and jumps back to its exact continuation. No loop, call, stack frame, new heap/persistent RAM or DSP allocation is introduced. Native main-cave placement aligns to 128 bytes, adding 0..127 padding bytes. The two six-byte detours replace existing flash and allocate no additional flash. Pending stock state at 0x46c7dfda + 32*track reuses byte 15; no per-track buffer is allocated. Free-space, source and hook guards must match the original firmware. Existing stop paths restore ordinary Part values; physical audio/restoration remains untested.

The selected build's free-space writer verifies each address/length and zero guard before the transaction. Actual padding/placement depends on the selected modules, not track count. Both utilities together add 760 authored ROM bytes; each allocation's alignment is priced separately. These are exact authored allocation bounds, not a whole-chip free-memory or hardware timing claim. CPU/DSP/memory gauges use source estimates of incremental workload; chip worst-case cycles remain null.

## Ordinary validation

Use Node 24: `npm run check`, `npm run modules:check -- --base origin/main`, `git diff --check`. These read data and run domain checks; no submitted native Python is evaluated. The private developer parity command is `node scripts/verify-utility-native.mjs <local-1.40C.bin> <native-proof.json> <native-packaging-proof.json>`; it writes no firmware. Module source/version changes invalidate this release waiver and need new full qualification.

## Capture build identities and isolation

| Input/result | SHA-256 or identity |
| --- | --- |
| Native source inventory | `86deed960c094df1d0d2a4a9d3a955a62e804175f2f22d8ac53f5eff141aeaca` |
| Locally verified base MAIN OS | `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e` |
| Local capture MAIN OS | `a19a0bf4352a6ebf98546cf33f68e44cbd101757ec16b17ca44efdfa49215302` |
| Reviewed local `ot_emu` binary | `93484e4b71c70f48f795825103146a36ef95ef9ac06ee627e28608ae3e3bb3eb` |
| Reviewed SDK checkout | `504b602a770a085016a8a1b9fd1d5a4a3ba19981` |
| Local container image | `sha256:b6d07c32790744c38874da842380e766349a699103d2c1b88ff9d986b7a827fb` |

The native source hash uses `moduleNativeSourceSha256`: sorted relative native
file hashes, excluding documentation, licences, media, the website manifest and
the incomplete qualification template. Assembly is unchanged from upstream;
the textual import replaces two embedded stock spans with lazy local
address/length/SHA-256 guards. See the original/vendored file identities in
[the import record](../../../imports/previewvol-906fc354.json).

Only Preview Vol and reviewed SDK tooling were staged into the private build
workspace. The draft manifest/assembly were evaluated and compiled inside the
existing local source-tools container, with no network, dropped capabilities,
no new privileges, a read-only container root, unprivileged UID/GID, CPU/memory/
PID limits and a temporary filesystem. No unreviewed source ran on the trusted
host. The reviewed host emulator operated the resulting private image.

Build profile: stock effects retained, fallback NONE, static stock enabled,
no dynamic loader, `XBUS=0`, `SPEC=0`, `DEV=0`, `BUILD=84`, `STATIC_STOCK=1`.
The local capture driver limited native discovery to Preview Vol plus reviewed
stock definitions, called the native `build_bus` oracle and read back both
six-byte detours. Each resolved to the linked authored stub that queues AMP VOL
64 and returns to its expected continuation: Static `0x4009429c`, Flex
`0x40096eb8`. The stock guards matched the user's verified local image.
This is a two-hook wiring check, not full composition/rejection or byte parity.

Only hashes and authored sources are retained. Firmware, built images,
project/card fixtures, generated sample files, raw LCD/RAM data and private logs
are temporary local inputs and do not enter this PR.

## Reproducing the LCD session

Use the reviewed SDK `tools/verify/verify_repitch.py` helpers `make_loop` and
`build_project`; do not run that module's qualification gates for UI capture.
Start with a disposable valid local project template and retain its fingerprint.
Generate an original two-second 440 Hz stereo sine: 44,100 Hz, signed 16-bit,
identical channels, `round(16000 * sin(2*pi*440*n/44100))`, 88,200 frames.
Name the local sample `AUDIO/PREVIEW_440_120.wav` and set its BPM to 120.

Set T1 to Flex, slot 1; T2 to Static, slot 1, in every bank A Part. Retain
exactly one `[SAMPLE]` entry per machine/slot, both pointing to
`../AUDIO/PREVIEW_440_120.wav`. Remove duplicate inherited slot-1 entries and
stage the matching sample; an unstaged inherited path produces an ERROR slot.
Set both marker records to trim 0..88,200, loop point 0, no slices, and update
the marker checksum. Enable sample looping and disable the first T1/T2 trig in
A01. Leave transport stopped. Use reviewed `ot_project` bank writers for
checksums and `emu_card` staging/FAT helpers for a 32 MiB disposable card under
`OCTABAM/RIG`. Capture record fixture fields contain template/project/card/tone
fingerprints, helper identities and the recipe; these inputs remain private.

```sh
python3 -B scripts/capture-module-ui.py \
  --emulator /local/reviewed/ot_emu \
  --image /local/private/mainos_bus.bin \
  --image-sha256 a19a0bf4352a6ebf98546cf33f68e44cbd101757ec16b17ca44efdfa49215302 \
  --card /local/private/capture-card.img --set-name OCTABAM --project-name RIG \
  --key-ms 50 --plan /local/private/plan.json \
  --output /local/reviewed-screenshots
```

Use the exact panel plan in [media/capture.json](media/capture.json): AMP,
encoder D down; T1 double-tap; hold/release FUNC+YES and CUE+YES; YES to enter
the Flex file browser; NO to leave; MKII AED for the sample editor; select T2,
then double-tap and select its Static slot. The tool validates the fixture
and referenced audio paths before launch, rejects duplicate sample slots, confirms native load/bank events, dismisses the date popup using
NO and refuses export if any startup window remains. It uses a temporary card
copy, checks the local image hash, keeps transport stopped and renders actual
128×64 LCD pixels at scale 6 with the monochrome palette. PNGs/metadata export
only after the complete plan succeeds.

The AMP image shows track VOL -64. Slot-list captures while holding main and
cue shortcuts have the same LCD pixels; the plan records the different keys,
but the screenshots alone cannot prove output routing or audio level. The
sample editor shows actual tabs and the selected slot name; its waveform/audio
rendering is not validated. The module has no dedicated switch/control page.
Images document existing preview access and the affected track AMP control,
not a newly introduced OT menu. MKI navigation still needs its own check.

## Historical emulator evidence

The pinned [preview analysis](https://github.com/repeat98/octamad/blob/906fc354536d9a1d6ccd90a87fcf3c1f6edb6488/docs/firmware/PREVIEW.md)
records ColdFire emulator observations from 16 September 2026. With a generated
440 Hz loop, T1 and no trig, Flex previews had RMS 515,375 and Static previews
513,054 at each tested AMP VOL (0/64/127); stock was silent at VOL 0. These
are historical fixture observations, not measurements of this adapted draft.

The pinned [verification tool](https://github.com/repeat98/octamad/blob/906fc354536d9a1d6ccd90a87fcf3c1f6edb6488/tools/verify/verify_previewvol.py)
declares two hook checks, Flex/Static equal-level cases (spread below 0.1 dB),
a Flex stop restoring VOL 0 and a silent stock control. Its command is
`python3 tools/verify/verify_previewvol.py [REMIX] --project <local-project>`
in the exact upstream tree. It skips port cases without a project/toolchain;
a skip is not passing evidence. Direct routine calls cannot establish physical
panel shortcuts or hardware timing. That upstream suite was not run for this
draft; it remains a reference, not an installed SDK gate.


