# Midi Mode 2 — USB-capable card installer candidate

Version 0.0.19-experimental packages the **unchanged published Modwerk USB
base** with the original USB-managed module packages. The local configuration
page's Build firmware action now produces an **installer ZIP**, containing:

- `Modwerk-USB-base.bin`: the standard base with its USB loader, label ELEKLOADER.
- `MODWERK0.SET` and `MODWERK1.SET`: matching initial saved sets, generations 1/2.
- `INSTALL.txt` and `installer-receipt.json`: steps and exact file/package hashes.

The reviewed selections contain Midi Mode 2 alone or with any subset of
Sidechain Compressor, Play Modes and Mute Modes. Module code is not baked into
a second runtime; first boot uses the same loader path as a previously kept
USB set. Future updates, self-test, Keep, Undo and removal use the normal USB
workflow. The current-base MIDI package is 0.0.19: the same controls/storage logic, with
the NOTE SETUP label hook moved to a private drawer epilogue. The base now owns
the original entry for its generator registry. This is a private
installer candidate, not a production catalogue release or hardware qualification.

## Install the test candidate

1. Back up the entire CF card and keep your known firmware available. Use a
   backed-up test project. Download the ZIP from the local configuration page,
   using the original unmodified OS 1.40C file as input. The installer uses the
   standard published base/startup and its default USB Audio layout; choose
   Docking startup for this candidate. Other layouts are outside this test.
2. Extract the ZIP. Enter USB DISK MODE. Back up the existing MODWERK0.SET and
   MODWERK1.SET off the card, then replace **both** with the included pair at
   the card root. This replaces the complete kept module set with the selected
   set. Do not merge with an older peer: its higher generation could win.
3. Copy the included base BIN to the card root; keep other firmware BIN files
   away from the root during this test. Safely eject, leave disk mode, then
   PROJECT → SYSTEM → OS UPGRADE and confirm. Let it finish on stable power.
4. Boot normally without holding FUNC, and wait for MODULES LOADED. The boot
   label is **ELEKLOADER**, not MIDI2-C14 or MIDI2 C15. Connect through Your
   Octatrack in the local app. Verify the exact base and every selected module;
   run the device self-test. Do not Keep a partial/failed restoration.
5. Check MIDI names/channels/CC and independent bank names, plus playback,
   mute behavior and Sidechain Compressor audio. Fully save, power-cycle,
   reconnect and confirm the complete set and saved settings. Complete or
   cancel any project INIT before updating/removing modules; Undo reverses
   module code, not a completed project-wide name/channel replacement.
6. On a test project, exercise an actual USB update and Undo, then Keep and a
   separate restart check. Removing and reinstalling Midi Mode 2 should retain
   the companions. Record the exact installer hash/base identity and results.

Holding FUNC during startup skips saved-module restoration. To return, install
your known previous firmware and restore its backed-up saved-set files. Project
and sample backups are separate. No builder/verifier writes a physical card.
See [Elektron's card-upgrade procedure, §8.5.2](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf#page=33).

## Format and source audit

`card-seed.ts` writes the existing **MWST v1** format consumed by `modset.c`:
84-byte header, exact base digest, generation/count/logical length, body SHA-256,
then module ID/length/original package and four-byte padding. Files are padded
to 512-byte sectors as the base writes them. MWMS is the USB transaction format,
not an on-card saved file. The packages are unrelocated; pointers/hooks are
resolved by the existing loader after boot. They are validated through the same
`prepareModuleSet` path used by Sync, with exact package/base pins. A new base
or package requires renewed review. Do not copy a saved set between base identities.

No published base, loader, controller, DSP or shared site-owner source is modified
by the local adapter. The earlier 0.0.13 package targets its older base and is
kept separately for the completed lifecycle test; it must not patch the current
base’s owned NOTE SETUP entry.
The current Sidechain package retains the published base's existing bound
controller/engine limitations; this work does not claim the pending package-carried
engine migration is released. First public release still needs the lifecycle,
performance/memory, hardware, media/documentation, CI and owner-review gates.

Reproduce privately, with the local dev server running and its toolchain on PATH:

```sh
node sdk/drafts/midi-cc-slots/build_usb_installer.mjs \
  /private/original-OCTATRACK_OS1.40C.bin /private/new-usb-installer
python3 -B sdk/drafts/midi-cc-slots/verify_installer_host.py \
  --main /private/new-usb-installer/base-MAIN.private.bin \
  --installer /private/new-usb-installer
```

The native probe is `template/verify_usb_card.py`. It takes an emulator, build
folder, private saved-tree fixture, reviewed runtime-symbol receipt and new private
output folder. Tool/model failures remain explicit; a source build and format
validation do not imply native or physical restoration. See TESTING.md for actual
observations. Firmware, seed sets, ZIPs, project/card data, maps and raw logs stay
outside Git. Original authors and full licence texts remain in the source and
installer notices; underlying Elektron firmware stays private.

## Historical 0.0.18 upstream integration identity

The previous 0.0.18 installer targeted published base
`c1ae2ee92a829e06aa9398d35981b8228efdd34c578c9583ef36fba8f5bc637f`.
Its MIDI package SHA is
`8d971baca19198b9e35d7644c7c8810f917471f980eadc2db03fab8de3668451`;
the 33,434-byte package retains 24 sites, 25 copies and 533 relocations.
It leaves the base-owned 0x40036548 entry intact and uses a guarded private
0x4003678a epilogue. Controls and project format are unchanged. The current
Sidechain controller package is pinned to this new base too. Physical/native UI
qualification of this combination is pending. Do not reuse the earlier C16 saved
sets on this different base; the builder produces a new matching pair.
The original C14/C16 artifacts and old-base USB test remain private/unchanged.
