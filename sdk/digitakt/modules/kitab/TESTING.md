# Kit A/B testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 file, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `kitab-0.2.elemod` (`e19f3c2f…`), pinned unchanged in `sdk/imports/elekloader-kitab-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `e6a2aab`, the revision the file was released from.
- **Linked.** The author's released 0.2 file, pinned unchanged, linked locally on OS 1.54 with core 4.4 beside every Digitakt mod in the library: it builds beside all of them except Digi EQ 1.0.2 (core 2.1 only). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 3,572 B of the mods' RAM, no fast RAM, as the builder reads the file.
- **Source compile.** Modwerk's GCC 16.2 compiles `kitab.c`'s byte copies into `move.b (a0)+,(0,a0,d0.l)`, which stores one byte late on the ColdFire, and the build refuses it. `build.json` therefore adds `-fno-late-combine-instructions`. Disassembled, the author's released file has no such instruction; the library builds that file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and Kit A/B (`8f9b3d32…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. The emulator's first-boot project refused a temp save ("Prj must be re-saved!"), and TRK + NO then showed NO TEMP SAVE YET. After saving the project once through SETTINGS > PROJECT > SAVE PROJECT AS and temp-saving with FUNC + YES, TRK + NO showed KIT B: SAVED and the B in the top-right corner, as captured. Hearing the kits, switching back to A and changing pattern while on B were not driven.

## Upstream

The author tested Ctrl All, Kit A/B and Real Units 0.2 on a Digitakt MKI on OS 1.54, together with seven other FLEXMODS mods, elekloader's core and seq-events (FLEXMODS 1.0, 16 November 2026; the same files ship unchanged through FLEXMODS 1.5). This module pins that released file.

- The author's report gives no duration: testedOn is the FLEXMODS 1.0 release date.
- Tested with elekloader's core and other FLEXMODS mods in the build, not with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Test procedure: kitab 0.2.0, 2026-11-27

Build: revision `2a95fbcdd2fe` with uncommitted changes, package `imp-kitab.syx` SHA-256 `8f9b3d320529106aa8992929321fd9bf0b9a9b712aef28b292e62e826b334c76`. `npm run test:procedure -- kitab --no-unit --package <private>/imp-kitab.syx --out <private>/procedure`, 4 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- kitab` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: modules:compat compares the Octatrack's modules only; Digitakt mk1 has no gate beside every other module yet: its link refuses two modules on one site, so link the image beside the modules it must work with |  |  |
| 3 | Name the build | host | passed |  | logs/03-build.log |
| 4 | DSP cost model | contract | not run: the DSP cycle scan models the Octatrack's DSP only |  |  |
| 5 | Emulator rehearsal | emulator | not run: Digitakt mk1 has no scripted emulator rehearsal yet |  |  |
| 6 | Read the unit | unit | not run: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 7 | Scripted unit pass | unit | not run: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 8 | Soak | unit | not run: no soak for Digitakt mk1 yet (scripts/octatrack-soak.mjs drives the Octatrack) |  |  |
| 9 | Cost on the unit | unit | not run: no price on the unit for Digitakt mk1 yet (device:price reads the Octatrack's frame interrupt) |  |  |
| 10 | Put back | unit | not run: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands) |  |  |
| 11 | Agent by hand | unit | emulator only: the captures and checks above; no unit |  |  |
| 12 | Submitter's own stage | unit | not run: no unit; the owner takes the author's hardware report |  |  |

### Edge cases for this change

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| TRK + NO with no temp save | the reload fails and must leave the kit as it was | emulator, first-boot project | pass: NO TEMP SAVE YET |
| TRK + NO after FUNC + YES, then back to A | it copies 2,334 kit bytes both ways | emulator after SAVE PROJECT AS and FUNC + YES | pass for A to B (KIT B: SAVED, B in the corner); back to A not run: needs listening |
| Pattern change while on B | edits must go back to the pattern left | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Project save, reload and power cycle | it writes kit memory | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Beside every Digitakt library mod | shared stock sites and core 4.4 | linked through the site build path, OS 1.54 | pass, except Digi EQ (core 2.1 only) |

### For the pull request

Not tested on a unit: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Hearing A against B, switching back to A, and changing pattern while on B.
- Three or more mods together.
