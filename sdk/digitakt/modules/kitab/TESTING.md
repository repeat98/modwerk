# Kit A/B testing

## In Modwerk

The evidence tier is `author-hardware`, the author's own report below. Nothing has been run on a unit in Modwerk.

## Import — 27 November 2026

- **Files.** The author's released `kitab-0.2.elemod` (`e19f3c2f…`), pinned unchanged in `sdk/imports/elekloader-kitab-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `e6a2aab`, the revision the file was released from.
- **Linked.** The author's released 0.2 file, pinned unchanged, linked locally on OS 1.54 with core 4.4 beside every Digitakt mod in the library: it builds beside all of them except Digi EQ 1.0.2 (core 2.1 only). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 3,572 B of the mods' RAM, no fast RAM, as the builder reads the file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and Kit A/B (`8f9b3d32…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. The emulator's first-boot project refused a temp save ("Prj must be re-saved!"), and TRK + NO then showed NO TEMP SAVE YET. After saving the project once through SETTINGS > PROJECT > SAVE PROJECT AS and temp-saving with FUNC + YES, TRK + NO showed KIT B: SAVED and the B in the top-right corner, as captured. Hearing the kits, switching back to A and changing pattern while on B were not driven.

## Upstream

The author tested Ctrl All, Kit A/B and Real Units 0.2 on a Digitakt MKI on OS 1.54, together with seven other FLEXMODS mods, elekloader's core and seq-events (FLEXMODS 1.0, 16 November 2026; the same files ship unchanged through FLEXMODS 1.5). This module pins that released file.

- The author's report gives no duration: testedOn is the FLEXMODS 1.0 release date.
- Tested with elekloader's core and other FLEXMODS mods in the build, not with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Hearing A against B, switching back to A, and changing pattern while on B.
- Three or more mods together.
