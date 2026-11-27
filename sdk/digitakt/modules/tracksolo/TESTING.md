# Track Solo testing

## In Modwerk

The evidence tier is `author-hardware`, the author's own report below. Nothing has been run on a unit in Modwerk.

## Import — 27 November 2026

- **Files.** The author's released `tracksolo-0.2.elemod` (`2fca50ad…`), pinned unchanged in `sdk/imports/elekloader-tracksolo-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `e6a2aab`, the revision the file was released from.
- **Linked.** The author's released 0.2 file, pinned unchanged, linked locally on OS 1.54 with core 4.4 and Modwerk's seq-events 0.1.0 beside every Digitakt mod in the library. Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 684 B of the mods' RAM, no fast RAM, as the builder reads the file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and Track Solo (`8cbf0f54…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. TRK + DOWN latched the solo on track 1 and S1 showed in the top bar, as captured. Hearing the solo, holding TRK + UP and unlatching were not driven: the emulator records no audio here.

## Upstream

The author tested Track Solo 0.2 on a Digitakt MKI on OS 1.54 together with nine other FLEXMODS mods, elekloader's core and seq-events (FLEXMODS 1.0, 16 November 2026). Modwerk builds seq-events from Dracyr's source in elekloader 0.11.0, the same interface as the seq-events 0.1 it was tested with; this module pins the author's released Track Solo file.

- The author's report gives no duration: testedOn is the FLEXMODS 1.0 release date.
- Tested with elekloader's core and other FLEXMODS mods in the build, not with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Hearing the solo on audio and MIDI tracks, TRK + UP held, unlatching and moving the solo.
- Track Solo beside the FLEXMODS mods in this library (Ctrl All, Kit A/B, Real Units): they use other keys and patch no shared site.
- Three or more mods together.
