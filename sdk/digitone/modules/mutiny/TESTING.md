# MUTINY testing

## In Modwerk

Modwerk 0.2.1 is the author's released 0.2.1 file, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.1 is not tested on a unit in Modwerk yet.

## Import — 27 November 2026

- **Files.** The author's released `mutiny-0.2.1.elemod` (`c77e2c42…`), pinned unchanged in `sdk/imports/elekloader-mutiny-2026-11-27.json`. It matches elekloader 0.11.0's catalog pins. `src/` is the author's source at `1d9f65b`, the revision the file was released from.
- **Linked.** The author's released 0.2.1 file, pinned unchanged, linked locally with core 5.4 and the seq-events build it was tested with: alone, beside KitBank (refused: KitBank builds only on core 2.x), and beside the six Digitone effect pedals, all seven together. Through the site's build path on the vendored kit 0.7.0, against stock OS files recognised by their hashes.
- **Memory.** 0 B of the mods' RAM, no fast RAM, as the builder reads the file.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4 and MUTINY (`76515781…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. TRIG PARAMETERS on synth track 1 opened the MUTINY page (Mutiny: Native P1, MODEL OFF), and turning encoder A picked TB3P with its seven controls, as captured; a second TRIG press goes back to the stock page. Generating, committing and undoing were not driven.

## Upstream

The author tested MUTINY for about an hour on their Digitone mk1 on OS 1.44, through every feature: the three models, page commits and undo, project save and reload, pattern switches and four tracks generating at once (release v0.2.1, 8 November 2026). This module pins the released file and the seq-events build it was tested with.

- One unit and one session, as the author says.
- Other mods on hardware and a measured timing margin were not tested by the author.
- Not tested in Modwerk on a unit.

## Test procedure: mutiny 0.2.1, 2026-11-27

Build: revision `93b2d9440f17`, package `imp-mutiny.syx` SHA-256 `765157814bfa688f71a0d835a24c9c3f111af83b8b686456a8343aa11fb65b52`. `npm run test:procedure -- mutiny --no-unit --package <private>/imp-mutiny.syx --out <private>/procedure`, 7 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- mutiny` | logs/01-software.log |
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
| The MUTINY page from TRIG PARAMETERS | a stock key on the TRIG page | emulator, OS 1.44 build with core 5.4 and seq-events 0.1 | pass: the page opened (MODEL OFF), encoder A picked TB3P |
| Beside every Digitone library mod | seq-events' step-fire sites and core 5.4 | linked, OS 1.44 | pass, except KitBank (core 2.x only); also beside all six effect pedals together |
| Generating, YES and NO, four tracks at once | it writes trigs into the pattern | not run: no Digitone unit here | not run: no Digitone unit here |
| Project save and reload, pattern switches | its settings live in the project | not run: no Digitone unit here | not run: no Digitone unit here |

### For the pull request

Not tested on a unit: Digitone has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Generating while the pattern plays, YES commits, NO undo, four tracks at once.
- Project save and reload, pattern switches.
- Three or more mods together.
