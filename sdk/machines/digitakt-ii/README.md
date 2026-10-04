# Digitakt II SDK — OS 1.17

Digitakt II support is staged from [elekloader PR #38](https://github.com/irpina/elekloader/pull/38), authored by toonst. The pinned head is `71a5156781838fb5ef1c3e963b3949b781043a0d`. The [machine profile](machine.json) credits this and digikit’s public research. The first mod is [Perform Direct](../../drafts/perform-direct/README.md), pending qualification and owner review.

## Local firmware

Choose your own extracted `Digitakt_II_OS1.17.syx`. Its SHA-256 is `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`; the unpacked main OS is 3275616 bytes with SHA-256 `a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964`. The website verifies the complete file, main image and HMAC seal locally, saves only in this device’s IndexedDB, revalidates on restore and offers Remove from device. Firmware and the transient derived sealing key never leave the browser.

The ELE3 container’s device byte is `0x14`, main load `0x40000400`, staging `0x40400000`, flash start `0x80000`, and end limit `0x380000`. It has a 32-byte HMAC-SHA256 trailer after the final aligned section. The pinned draft-only native writer reads its key material from the user’s bootstrap; no key or stock constant is bundled.

## Core and module interface

[core-dt2 1.0](../../drafts/digitakt-ii-core/README.md) exports six UI events: tick, draw, key, encoder, settings and personalize. The prototypes, tables and allocation areas are in [interface.json](../../drafts/digitakt-ii-core/interface.json). There are no render events and DTIM0 must not be started by this core. Shared DDR is 256 KiB; fast SRAM is 3840 bytes. SRAM is initialized at reset, so fast code is copied only on the first tick. Keep key/encoder handlers in DDR.

## Local preparation

Use Node 24 for application checks. Pending source stays in `sdk/drafts/`; the empty module directory is intentional. `scripts/prepare-digitakt-ii-draft.py` reconstructs the sanitized recipe locally from your exact verified OS and compiles with m68k-elf GCC/binutils and the pinned SDK, composed and verified from draft-only loader overlays in the temporary workspace. The approved public browser engine is unchanged. Run it only inside an isolated, network-free workspace with no credentials. The generated `.elemod`, OS, extraction, card and snapshots remain temporary and local. `scripts/capture-digitakt-ii-ui.py` drives real emulator panel inputs and captures its rendered framebuffer; it never fabricates labels or edits guest RAM.

## Flashing and recovery

Modwerk does not offer Digitakt II builds/downloads until qualification and byte parity pass. Upstream reports installing its build through Elektron Transfer over USB using the running OS updater. If a modified OS does not boot, hold FUNC while powering on, press TRIG 4 for OS UPGRADE and send your original OS over the MIDI ports, not USB. Back up projects before any future qualified installation.

## Remaining release work

The source draft includes three visually reviewed real monochrome LCD captures, full documentation/tutorial and an original thumbnail. Its handler uses 28 bytes DDR, and the combined core/module/tables/BSS use 576 bytes with no fast SRAM. Screenshot metadata records both shared-contract `capture` and the explicit `otUi` page/location/control provenance; the parser rejects disagreement between them. See [the source/build-bound report](../../drafts/perform-direct/TESTING.md).

Measure worst-case cycles under maximum load and mode changes, obtain the required passed 60-minute/eight-audio-track hardware stress-project report, verify memory/capture rights with the owner, prove browser/native composition and rejection parity, then request owner review. The profile’s completed format/rebuild/boot/core steps describe upstream evidence; its mods step remains open. The eleven-module Octatrack baseline is unchanged.
