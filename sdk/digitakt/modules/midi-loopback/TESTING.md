# MIDI Loopback testing

## In Modwerk

The evidence tier is `author-hardware`, the author's own report below. Nothing has been run on a unit in Modwerk.

## Import — 27 November 2026

- **Files.** The author's released `midi-loopback-1.6-os1.53.elemod` (`2e8ea38c…`), `midi-loopback-1.6-os1.54.elemod` (`2d63627d…`), pinned unchanged in `sdk/imports/elekloader-midi-loopback-2026-11-27.json`. They match elekloader 0.11.0's catalog pins. `src/` is the author's source at `02c1638`, the revision the files were released from.
- **Linked.** The author's released 1.6 files, pinned unchanged, linked locally with core 4.4 beside every Digitakt mod in the library: on OS 1.53 it builds beside all of them; on OS 1.54 beside all but FX Track and MIDI Expression (the same MIDI code). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 3,396 B of the mods' RAM, no fast RAM, as the builder reads the files.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and MIDI Loopback (`0871b328…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. MIDI LOOPBACK is the last row of SETTINGS; YES ticks it, as captured. On MIDI track A's CC Select page (AMP) CC 10 showed AMP PAN. A second build with CC Names showed both: CC Names renamed VAL1 on CC Value while CC Select still showed AMP PAN, so the two are not declared incompatible (the author's README names a cc-labels mod that is not CC Names). MIDI routed into the audio tracks was not driven.

## Upstream

The author reports testing MIDI Loopback 1.6 on their Digitakt mk1, the version they use (release v1.6, 18 November 2026). This module pins those released files for OS 1.53 and 1.54.

- The author's report gives no OS release, date or duration: testedOn is the v1.6 release date, and the release names 1.54 among the OS files it was built for.
- Not tested with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- MIDI routed into an audio track or the Master FX: CCs, locks, notes, the MIDI LFO.
- Messages on other channels leaving by MIDI OUT and USB while it is on.
- Three or more mods together.
