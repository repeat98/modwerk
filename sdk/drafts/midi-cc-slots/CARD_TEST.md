# Midi Mode 2 — standalone card test

Private candidate **0.0.14-experimental**, firmware label **MIDI2-C14**.
This packages the unchanged reviewed 0.0.13 USB implementation into a firmware
image that starts the module at boot. No Keep step or saved USB module set is
needed. The normal local site's USB listing remains 0.0.13.

This image replaces the installed OS with stock 1.40C, the shared Elekloader
core, Modwerk startup artwork and Midi Mode 2. It does **not** include the
Modwerk USB loader, Sidechain Compressor, Play Modes or Mute Modes. Existing
saved module-set files are not used by this firmware. Mixed-module packaging
and public catalogue publication remain separate work.

## First hardware test

The card image is software-tested, **not yet tested on hardware**. Keep a full
card backup and your current Modwerk base firmware available before installing,
so you can return to that setup. No current-base rollback image has been
independently verified as part of this packaging task. Use a backed-up test
project and stable power.

1. Enter USB DISK MODE. Copy **only `Midi-Mode-2-card-test.bin`** to the top
   level of the CF card. Other firmware `.bin` files should be kept off the
   card's top level during this test to avoid selecting the wrong image.
2. Safely eject the card from the computer, leave USB DISK MODE, then open
   PROJECT → SYSTEM → OS UPGRADE. Confirm the upgrade on the device and let
   it complete without disconnecting power. This uses the normal card upgrade
   procedure in [Elektron's MKII manual, §8.5.2](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf#page=33).
3. Check the installed firmware label **MIDI2-C14**. Open the test project,
   switch to MIDI mode and double-tap SRC. Check NAME/PUSH on F and INIT with
   FN+/PUSH on D. Name a track, set its channel and check the displayed name.
4. For initialization, set Bank A / Part 1 names and channels, then complete
   PROJECT → SAVE PROJECT. After Save to New, perform this separate full save
   in the destination too. Hold FUNC and click/release D at INIT. For an
   already initialized project, confirm REPLACE ALL with YES. This replaces
   every bank's names and channels from Bank A / Part 1, including blanks/OFF.
   NO cancels. Wait for MIDI SETUP SAVED before changing projects or restarting.
5. Check another bank's names and channels. Rename a track there, save, and
   confirm Bank A kept its own name. Change banks several times; no automatic
   initialization should occur.
6. Double-tap FX1 on MIDI CONTROL 1. Click A/B to choose CC mode, select CC0
   and CC127, exit setup, enable the controls with FUNC + push and check their
   output with a receiver or MIDI monitor. Click A/B in setup again to restore
   PB/AT, and check native output. Also check normal CC labels and audio tracks.
7. Save normally, power-cycle and reopen the same test project. Check names,
   channels, CC assignments and independent bank names again. Report any
   failure with the screen message and firmware label.

To return to the USB setup, reinstall your known Modwerk base firmware using
its normal upgrade procedure, then reconnect and review its installed set.
Do not install the USB copy of Midi Mode 2 on top of this standalone firmware.

## Reproduce privately

Use Node 24, the ColdFire cross-toolchain and a clean Elekloader checkout at
`3b31ef3c0e43c810e3acd0be6257e2484b20fc40`, the app's pinned kit revision.
The builder requires the user's original full Octatrack OS 1.40C file, verifies
the reviewed USB bytes and stock guards, and refuses an existing output folder
or a folder inside Git. It never changes the original firmware or a CF card.

```sh
python3 -B sdk/drafts/midi-cc-slots/build_card.py \
  --stock /private/original-OCTATRACK_OS1.40C.bin \
  --upstream /private/elekloader \
  --output /private/new-midi-mode2-card
node sdk/drafts/midi-cc-slots/verify_card_package.mjs \
  /private/original-OCTATRACK_OS1.40C.bin /private/new-midi-mode2-card
python3 -B -m unittest sdk.tests.test_midi_card_package
```

The output includes BIN/SYX, format-2 packages, a build receipt and private
raw MAIN for emulator boot. Keep firmware and project data private. The module
package contains authored literals and guarded stock references, not copied
stock routines. Core attribution is irpina, GPL-2.0-or-later; the original
Modwerk artwork is GPL-3.0-or-later; Midi Mode 2 is Cooper Scobey, MIT. Preserve
the source licences. These licences do not grant redistribution rights to
Elektron's underlying firmware.

## Recorded candidate

BIN SHA-256:
`fe4d539ae304a4fd8143fbb5b1ca11f0ea9f62c8dcd0d0b1dbdf402327581fa3`

Original firmware SHA-256:
`34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad`

Reviewed USB implementation SHA-256:
`086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a`

See [TESTING.md](TESTING.md) for observed checks and remaining qualification.
