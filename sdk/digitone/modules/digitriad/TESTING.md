# DigiTriad testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 files, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `digitriad-0.2.elemod` (`3a3459c3…`), `digitriad-0.2-os1.44.elemod` (`af56ad2e…`), pinned unchanged in `sdk/imports/elekloader-digitriad-2026-11-27.json`. They match elekloader 0.11.0's catalog pins. `src/` is the author's source at `3a75bb0`, the revision the files were released from.
- **Linked.** The author's released 0.2 files, pinned unchanged, linked locally with core 5.4 and Modwerk's fxkit 0.1.0: alone, beside each of the other five effect pedals, all six together, and beside DigiHealth and DigiTables on OS 1.43; on OS 1.44 every pair but KitBank (core 2.x only). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 28,300 B of the mods' RAM, no fast RAM, as the builder reads the files.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and DigiTriad (`126415d4…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. Holding T1 opened the Mod Menu with DIGITRIAD; YES opened its page 1 (title bar Pitch off), as captured. Built with Modwerk's own compile of fxkit, the page did not open in the emulator; with the author's released fxkit 0.1, which the library pins, it did. Sound through the inputs, MIDI CCs, locks and the other pages were not driven.

## Upstream

The author tested DigiTriad 0.2 on a Digitone mk1 (release v0.2, 18 October 2026; built before the effects' rename, which changed only names) and checked it in digikit's emulator on OS 1.43 and 1.44. It is still a beta. This module pins the released files.

- The author's report names no OS release, date or duration: testedOn is the v0.2 release date, and 1.44 is the newest OS its files support.
- Not run on a Digitone Keys.
- Not tested in Modwerk on a unit.

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Sound through the inputs, MIDI CCs from a controller, p-locks and the LFOs.
- Opening a second effect while one is active, MIDI and back, a project save and reload.
- Three or more mods together.
