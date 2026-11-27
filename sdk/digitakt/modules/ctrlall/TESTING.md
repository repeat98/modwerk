# Ctrl All testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 file, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `ctrlall-0.2.elemod` (`a89cb867…`), pinned unchanged in `sdk/imports/elekloader-ctrlall-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `e6a2aab`, the revision the file was released from.
- **Linked.** The author's released 0.2 file, pinned unchanged, linked locally on OS 1.54 with core 4.4 beside every Digitakt mod in the library: it builds beside all of them except Digi EQ 1.0.2 (core 2.1 only). Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 1,049 B of the mods' RAM, no fast RAM, as the builder reads the file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and Ctrl All (`de8fb78b…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. TRK + YES shows CTRL ALL ON and ALL in the top-right corner, as captured. Copying a lock to other tracks was not driven in the emulator.

## Upstream

The author tested Ctrl All, Kit A/B and Real Units 0.2 on a Digitakt MKI on OS 1.54, together with seven other FLEXMODS mods, elekloader's core and seq-events (FLEXMODS 1.0, 16 November 2026; the same files ship unchanged through FLEXMODS 1.5). This module pins that released file.

- The author's report gives no duration: testedOn is the FLEXMODS 1.0 release date.
- Tested with elekloader's core and other FLEXMODS mods in the build, not with Modwerk's library mods.
- Not tested in Modwerk on a unit.

## Test procedure: ctrlall 0.2.0, 2026-11-27

Build: revision `2a95fbcdd2fe`, package `imp-ctrlall.syx` SHA-256 `de8fb78bc42ff5f6f4af2c5bd93ab6939f84b4b86501660c46e00941054790d8`. `npm run test:procedure -- ctrlall --no-unit --package <private>/imp-ctrlall.syx --out <private>/procedure`, 4 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- ctrlall` | logs/01-software.log |
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
| TRK + YES toggles, ALL shows | a new key gesture on every page | emulator, OS 1.54 build with core 4.4 | pass: CTRL ALL ON, ALL in the corner |
| A lock lands on every track with a trig on that step, none on trig-less steps | it hooks the stock lock setter | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Lock memory full | copies multiply the locks written | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Beside every Digitakt library mod | shared stock sites and core 4.4 | linked through the site build path, OS 1.54 | pass, except Digi EQ (core 2.1 only) |

### For the pull request

Not tested on a unit: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Copying a lock to other tracks, live-recorded knob moves and the full lock memory message.
- Three or more mods together.
