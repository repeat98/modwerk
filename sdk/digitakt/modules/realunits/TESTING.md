# Real Units testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 file, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `realunits-0.2.elemod` (`57ccb6c5…`), pinned unchanged in `sdk/imports/elekloader-realunits-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `e6a2aab`, the revision the file was released from.
- **Linked.** The author's released 0.2 file, pinned unchanged, linked locally on OS 1.54 with core 4.4 beside every Digitakt mod in the library: it builds beside all of them except Digi EQ 1.0.2 (core 2.1 only) and Note Accumulator (the same code). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 4,188 B of the mods' RAM, no fast RAM, as the builder reads the file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and Real Units (`aeb82670…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. On the FLTR page the attack showed Attack Time=22.0 ms and FREQ showed Frequency=20773 Hz (20.8k under the knob), as captured. The AMP and LFO pages were not captured.

## Upstream

The author tested Ctrl All, Kit A/B and Real Units 0.2 on a Digitakt MKI on OS 1.54, together with seven other FLEXMODS mods, elekloader's core and seq-events (FLEXMODS 1.0, 16 November 2026; the same files ship unchanged through FLEXMODS 1.5). This module pins that released file.

- The author's report gives no duration: testedOn is the FLEXMODS 1.0 release date.
- Tested with elekloader's core and other FLEXMODS mods in the build, not with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- The AMP and LFO pages, and Real Units beside a Machine Pages machine.
- Three or more mods together.
