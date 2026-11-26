# Midi Mode 2 — historical C15 combined card build

**Superseded:** the local site now builds the USB-capable ZIP installer described
in [USB_CARD_INSTALLER.md](USB_CARD_INSTALLER.md). This page records the older
C15 baked image and its tests at source revision e5b3a539. C15 does not include
the USB loader; do not use these steps for the new installer.

The normal local configuration page can build Midi Mode 2 alone or with any
subset of **Sidechain Compressor, Play Modes and Mute Modes**. This is an
opt-in development feature, not a public catalogue release. The USB package
and local listing stay at 0.0.13; the card adapter is 0.0.15-experimental and
its firmware label is **MIDI2 C15**. The download report records the separate
card package identity. Other companion combinations remain unreviewed and
are refused before composition.

## Build on the local site

1. Open the local site's Modules page, add Midi Mode 2 and the companions you
   want, then open that configuration.
2. Choose the original, unmodified **Octatrack OS 1.40C** file in the firmware
   build panel. Do not use the installed Modwerk/custom BIN as the input.
3. Keep the stock FX2 setting and choose your startup preference. Build and
   download the firmware through the normal card firmware controls.
4. Before installing, back up the CF card and have your known Modwerk base
   firmware available for returning to USB. Use a disposable test project.
   The card build replaces the installed firmware and includes the selected
   features, **not the Modwerk USB loader**. No Keep or Sync step is needed.
5. Follow the card upgrade procedure in [CARD_TEST.md](CARD_TEST.md), using
   the new download. Verify **MIDI2 C15**, then test names, channels, INIT,
   PB/AT-to-CC controls and independent bank names. Save and power-cycle.
6. Check each companion too: Play Modes' TRACK + UP/DOWN gesture and actual
   playback, Mute Modes in PERSONALIZE and actual mute behavior, and Sidechain
   Compressor's setup and audio response. Software composition and emulator
   MIDI checks do not qualify those audio/timing interactions on hardware.

Combined hardware testing is pending. The user's successful standalone
MIDI2-C14 test, including saved settings after a power cycle, does not qualify
this different card boot integration. No physical card is copied to or flashed
by the builder or verifiers.

## Development setup

Run the existing local server with Python and the ColdFire tools on PATH,
`VITE_LOCAL_CC_SLOTS=1` in `.env.local`, and a clean Elekloader checkout at the
commit in `vendor/elekloader/kit/kit.json`. `npm run upstream:tools` creates the
default checkout at `~/.cache/modwerk-upstream/elekloader`. For a checkout in
another location, set `MODWERK_ELEKLOADER` in `.env.local` or when starting
`npm run dev`. This server-only path is not exposed to the browser.
The compiler is development-only; packages are compiled on demand, digest
checked against `local-card-build.json`, never bundled into production.

The adapter retains the exact reviewed MWRM image and 25 hash-backed stock
copies. It assembles the unchanged pinned shared bus and makes its event tables
refer to the module's reviewed entry offsets. The ordinary ColdFire linker,
existing bootstrap, logger, startup and arena reservation own the resulting
image. There is no second boot copier, arena owner or runtime publication.
Only the core's three tick/key/encoder bus sites are added; all 24 module
sites and every existing module/platform write remain checked for overlaps and
stock guards before any output is changed. Generic resident-object reconstruction
and site relocation live in `src/engine/resident-card.ts`.

Reproduce the local composition check with original firmware and a new output
folder outside Git (the last argument is from the reviewed USB runtime build):

```sh
node sdk/drafts/midi-cc-slots/verify_local_card.mjs \
  /private/original-OCTATRACK_OS1.40C.bin /private/new-combined-check \
  /private/reviewed-runtime-symbols.json
python3 -B sdk/drafts/midi-cc-slots/template/verify_card.py \
  --emulator /private/ot_emu --build /private/new-combined-check \
  --saved-tree /private/copied-saved-project-tree --output /private/new-boot-check
```

The first check uses the actual local package HTTP route and engine session,
all eight subsets with both startup modes, representative packed downloads,
independent GNU relocation parity, refusal of unreviewed companions, and
unchanged original firmware. The second boots the full four-module card MAIN
in fresh emulator processes and exercises MIDI setup/persistence via the panel.
No physical or audio qualification is implied. Source, metadata and tests go
into Git; firmware, packages and personal project data remain private.

Shared bus source is irpina, GPL-2.0-or-later, from the exact pinned Elekloader
checkout. Midi Mode 2 remains Cooper Scobey, MIT; adapter/browser integration
is GPL-3.0-or-later. Preserve the full source licences. Underlying Elektron
firmware remains private and is not covered by these source licences.

The local combination gate is bound to the published source-tree fingerprint
and exact companion versions in local-card-build.json. A future companion or
SDK source update requires rechecking the local combinations before building;
matching module names alone do not retain review.
