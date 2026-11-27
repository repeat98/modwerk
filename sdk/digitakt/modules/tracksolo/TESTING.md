# Track Solo testing

## In Modwerk

Modwerk 0.2.0 is the author's released 0.2 file, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 0.2.0 is not tested on a unit in Modwerk yet.

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

## Test procedure: tracksolo 0.2.0, 2026-11-27

Build: revision `a52ff872527b`, package `imp-tracksolo.syx` SHA-256 `8cbf0f543a950cc935f5b60a0ddb936abdd3ad3e81b436c076f4e64e02194951`. `npm run test:procedure -- tracksolo --no-unit --package <private>/imp-tracksolo.syx --out <private>/procedure`, 5 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- tracksolo` | logs/01-software.log |
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
| TRK + DOWN latches, S and the track show | a new key gesture | emulator, OS 1.54 | pass: S1 in the top bar |
| Hold TRK + UP, release; unlatch; move to another track | held-key state per step | not run: no Digitakt unit here | not run: no Digitakt unit here |
| A MIDI track | it answers the MIDI fire too | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Pattern change and stop while soloed | the decision is made once per step | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Beside every Digitakt library mod, with seq-events | the sequencer fire is a shared site | linked through the site build path, OS 1.54 | pass, except Digi EQ (core) and Euclidean (declared conflict) |

### For the pull request

Not tested on a unit: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- Hearing the solo on audio and MIDI tracks, TRK + UP held, unlatching and moving the solo.
- Track Solo beside the FLEXMODS mods in this library (Ctrl All, Kit A/B, Real Units): they use other keys and patch no shared site.
- Three or more mods together.
