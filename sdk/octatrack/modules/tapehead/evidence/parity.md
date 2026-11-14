# TapeHead browser and native integration

## 0.1.2-experimental (5 Oct 2026)

0.1.2 changes only `tapehead.asm` (422 words instead of 416); the manifest,
descriptor, chooser rows and ID are unchanged.

- **Package.** `scripts/build-module-packages.py` on this source, imported
  with `import-module-build.mjs --development`: the TapeHead DSP package is
  422 words, SHA-256 `c54070fcb616da026d59875a91945818dc58ede2ebcf23023bf3c769c8f0376f`,
  with its four-origin relocation proofs (`dsp-package.test.ts`: it matches
  native fresh assembly at all four). Every other package recompiled byte for
  byte; the ColdFire, ROM, bootstrap, requested and utility packages were
  carried over unchanged with the new version pins (their sources did not
  change, and this machine had no pinned m68k-elf toolchain to recompile
  them; the release build recompiles all of them and refuses any byte
  difference from these committed packages).
- **Browser against native.** With the author's local 1.40C (`164f3122…`),
  the browser composer's TapeHead selection and the native `build_bus.py`
  build of `tapehead-spring` place TapeHead at P:0x1252 (core A) and
  P:0x1012 (core B), 422 words each, and the **complete DSP payloads of both
  cores are word-for-word identical** (26,221 and 25,408 words). The browser
  also built and round-tripped TapeHead with Repitch, with Mini Verb and
  Euclid, with Preview Vol and CC Map, and with Scale Quantizer and USB
  Audio, both chooser settings, and refused TapeHead with Analog BD as
  before.
- **Native profiles.** The 32 static-stock profiles over Modulation,
  Character, Mini Verb and TapeHead (the ones this machine can build without
  the m68k-elf toolchain) were rebuilt natively: the 16 without TapeHead
  reproduce the committed identities exactly, which checks the setup; the 16
  with TapeHead build or refuse exactly as with 0.1.1 (Modulation +
  Character + TapeHead now overruns by 262 words instead of 256; the
  four-module set still refuses on Mini Verb).
- **Not regenerated.** The committed 512-, 224- and 48-profile proof files
  below are the 0.1.1 record. They already predate the built-in logger
  (docs/VERIFICATION.md, 3 Oct 2026), so they are no longer complete-image
  identities of what the site builds, for any module. Re-exporting them for
  0.1.2 needs the pinned m68k-elf toolchain.

The 0.1.1 record follows.

Version 0.1.1-experimental. The DSP and manifest remain identical to the
contributor's corrected source at c53daa9c5855b8bd0bd113bf7fbce3d2a394e89c.
The updated documentation, licences and metadata preserve the original port.
Canonical catalog order is preserved when placing native ROM units.

The native oracle runs only in a network-disabled disposable container with
a read-only toolchain, dropped capabilities and bounded CPU/memory. The owner's
original 1.40C inputs stay read-only and private; temporary outputs are deleted.
Only SHA-256 identities, lengths, chooser facts and refusal reasons are retained.
CI compiles authored source without firmware and reproduces these packages.

## Complete original-module matrix

Every subset of Spectrum, Modulation, Character, Mini Verb, Tape Echo, Euclid,
Repitch and TapeHead, with stock FX2 retained and with compact FX2: **512 profiles**.
The pinned vendored native builder produces 264 accepted full-image identities
and 248 placement refusals. Every accepted identity includes a native ELEK
container and ELUP upgrade fingerprint. The private browser composer verifier
matches all 264 images and all 248 refusals, with nine representative complete
containers/upgrades matching exactly. Changed firmware, wrong effect slot and
unsupported chooser entries are rejected; the original remains unchanged.
The original seven-module subset still matches all 256 previous proof records.

## Requested-module matrix

224 profiles include TapeHead plus Analog BD, USB Audio/MIDI or Scale Quantizer,
with every subset of Mini Verb, Tape Echo, Euclid and Repitch and both FX2 choices.
The native oracle records 80 accepted full-image/package identities and 144
refusals (112 Analog BD stock-DSP restrictions, 32 crowded-placement refusals).
The browser matches all 80 full images and 144 refusals, with 22 representative
complete ELEK/ELUP packages identical. The direct compiler preserves the
stock-DSP restriction; selection
checks explain it before build. Refer to the private verifier output and
`src/engine/assets/tapehead-composition-proofs.json` for exact profile identities.

## Approved utilities

Every TapeHead combination with CC Map and/or Preview Vol, plus every subset
of Repitch, Scale Quantizer and USB Audio/MIDI, with both FX2 choices:
48 native accepted full-image/container/upgrade identities. All 48 browser
images match; six representative complete containers/upgrades match. No firmware is
retained. The already approved utility code packages are unchanged byte for byte.
4,096 TapeHead declaration combinations with the complete buildable source
catalog are recorded by the native ledger, separately from placement checks.

## Actual browser worker

The real browser worker (local site, final authored packages) builds TapeHead
with stock FX2 retained and passes its finished-file packaging integrity check.
Complete upgrade SHA-256:
`247ec72998252f364908c2be7a2702425d83e8f8f1c2cd75963a29428056bdc3`.
It matches the native oracle byte for byte, 445,548 bytes. Original FX1 effects
and other stock FX2 effects remain available; Spring Reverb supplies its space.
No firmware download was saved or uploaded. The temporary browser base was
removed with the Remove from device control after verification.

## Reproduction

Use Node 24 to precompute the exact site menus with
`scripts/export-composition-menus.mjs original` (or `tapehead` /
`tapehead-utilities`). Enter the reviewed native toolchain container with network
disabled, no credentials, the reviewed app read-only, a disposable copy of
`sdk/octabam` and your fingerprinted original firmware mounted read-only under
its `out/raw/section_3_MAIN_OS.bin`. Copy `hardware-test-remix.py` to the private
`remixes/tapehead-spring/remix.py`. Keep the reviewed elektron-firmware-tool
sources under the private SDK's `vendor-elek`; never put firmware in that vendor.

Run the repository's `scripts/export-composition-proofs.py` with the private SDK
and new output path, `--app` pointing to the reviewed app, `--vendored-sdk
--static-stock --menus <precomputed-json> --packing-vendor <private-sdk>/vendor-elek
--stock-bin <own-original-upgrade>`. Its source comparison refuses drift before
importing any module. `--suite tapehead` checks the requested-module matrix;
`--suite tapehead-utilities` checks the approved utility combinations.
`--shard N --shards M` partitions the profile matrix without changing identities.
Keep canonical catalog module order: native cave placement depends on it.
Combine disjoint shards, checking unique complete coverage and identical headers.

On the host, `scripts/verify-static-composition-native.mjs <own-original-upgrade>
--packing=representative` checks the 512-profile matrix; `--packing=all` checks
every accepted container too. `scripts/verify-tapehead-native.mjs
<own-original-upgrade>` checks the TapeHead requested/utility matrices.
These developer checks read firmware in memory and write no firmware or extracted
content. They are never part of `npm run check`, CI or a visitor build.

This is integration/render evidence and static resource accounting. It is not a
physical maximum-load stress test. The actual attributed hardware coverage and
unknowns remain in hardware.md; no hardware timing or stress pass is invented.
