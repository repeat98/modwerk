# DigiTriad testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 files, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `digitriad-0.2.elemod` (`3a3459c3…`), `digitriad-0.2-os1.44.elemod` (`af56ad2e…`), pinned unchanged in `sdk/imports/elekloader-digitriad-2026-11-27.json`. They match elekloader 0.11.0's catalog pins. `src/` is the author's source at `3a75bb0`, the revision the files were released from.
- **Linked.** The author's released 0.2 files, pinned unchanged, linked locally with core 5.4 and Modwerk's fxkit 0.1.0: alone, beside each of the other five effect pedals, all six together, and beside DigiHealth and DigiTables on OS 1.43; on OS 1.44 every pair but KitBank (core 2.x only). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 28,300 B of the mods' RAM, no fast RAM, as the builder reads the files.
- **Source compile.** Modwerk's GCC 16.2 refuses the source's function-pointer initialisations that mix `int` and `int32_t` (GCC 14 made them errors; the author's compiler accepted them), so `build.json` adds `-Wno-error=incompatible-pointer-types`. The library builds the author's released files, not this compile.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and DigiTriad (`126415d4…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. Holding T1 opened the Mod Menu with DIGITRIAD; YES opened its page 1 (title bar Pitch off), as captured. Built with Modwerk's own compile of fxkit, the page did not open in the emulator; with the author's released fxkit 0.1, which the library pins, it did. Sound through the inputs, MIDI CCs, locks and the other pages were not driven.

## Upstream

The author tested DigiTriad 0.2 on a Digitone mk1 (release v0.2, 18 October 2026; built before the effects' rename, which changed only names) and checked it in digikit's emulator on OS 1.43 and 1.44. It is still a beta. This module pins the released files.

- The author's report names no OS release, date or duration: testedOn is the v0.2 release date, and 1.44 is the newest OS its files support.
- Not run on a Digitone Keys.
- Not tested in Modwerk on a unit.

## Test procedure: digitriad 0.2.0, 2026-11-27

Build: revision `193a17aa8c6f` with uncommitted changes, package `imp-digitriad.syx` SHA-256 `126415d486c1b6b9c38ec57efa134be5067988fdb360c0b35f762e7177fac974`. `npm run test:procedure -- digitriad --no-unit --package <private>/imp-digitriad.syx --out <private>/procedure`, 7 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- digitriad` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: modules:compat compares the Octatrack's modules only; Digitone has no gate beside every other module yet: its link refuses two modules on one site, so link the image beside the modules it must work with |  |  |
| 3 | Name the build | host | passed |  | logs/03-build.log |
| 4 | DSP cost model | contract | not run: the DSP cycle scan models the Octatrack's DSP only |  |  |
| 5 | Emulator rehearsal | emulator | not run: Digitone has no scripted emulator rehearsal yet |  |  |
| 6 | Read the unit | unit | not run: Digitone has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 7 | Scripted unit pass | unit | not run: Digitone has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 8 | Soak | unit | not run: no soak for Digitone yet (scripts/octatrack-soak.mjs drives the Octatrack) |  |  |
| 9 | Cost on the unit | unit | not run: no price on the unit for Digitone yet (device:price reads the Octatrack's frame interrupt) |  |  |
| 10 | Put back | unit | not run: Digitone has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 11 | Agent by hand | unit | emulator only: the captures and checks above; no unit |  |  |
| 12 | Submitter's own stage | unit | not run: no unit; the owner takes the author's hardware report |  |  |

### Edge cases for this change

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Mod Menu entry and page 1 | core_menu, fxkit's effects list and the audio owner | emulator, OS 1.44 build with core 5.4 and fxkit 0.1 | pass: DIGITRIAD in the menu, YES opened its page (Pitch off) |
| Beside the other five effect pedals and all six together | shared fxkit, separate buffer regions | linked through the site build path, OS 1.43 and 1.44 | pass |
| Beside the Digitone library mods | core 5.4 and the library | linked, OS 1.43 and 1.44 | pass, except KitBank on 1.44 (core 2.x only) |
| Sound through the inputs, CCs, locks | it owns the audio while active | not run: no Digitone unit here | not run: no Digitone unit here |
| NO gives the synths and the stock effects back | the audio owner must let go | not run: no Digitone unit here | not run: no Digitone unit here |

### For the pull request

Not tested on a unit: Digitone has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Sound through the inputs, MIDI CCs from a controller, p-locks and the LFOs.
- Opening a second effect while one is active, MIDI and back, a project save and reload.
- Three or more mods together.
