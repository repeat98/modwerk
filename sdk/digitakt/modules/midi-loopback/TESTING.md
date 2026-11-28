# MIDI Loopback testing

## In Modwerk

Modwerk 1.6.0 is the author's released 1.6 files, unchanged. Its evidence tier is `author-hardware`, the author's own report below. 1.6.0 is not tested on a unit in Modwerk yet.

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

## Test procedure: midi-loopback 1.6.0, 2026-11-27

Build: revision `8054b729f990`, package `imp-midi-loopback.syx` SHA-256 `0871b328595028bf44d76a6abb1b97a4aac8f34ba9165150f59d06e015941a04`. `npm run test:procedure -- midi-loopback --no-unit --package <private>/imp-midi-loopback.syx --out <private>/procedure`, 5 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- midi-loopback` | logs/01-software.log |
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
| SETTINGS > MIDI LOOPBACK toggles | a new SETTINGS row | emulator, OS 1.54 | pass: last row, YES ticks it |
| CC Select labels for Digitakt parameters | it repoints stock label strings | emulator: CC 10 on MIDI track A | pass: AMP PAN |
| Beside CC Names | both label MIDI CC pages | emulator build with both | pass: CC Names on CC Value, MIDI Loopback on CC Select |
| A MIDI track on an audio track channel: CCs, locks, notes, LFO | it routes MIDI into the internal input | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Off: everything leaves by MIDI OUT and USB | stock behaviour must return | not run: no Digitakt unit here | not run: no Digitakt unit here |
| Beside every Digitakt library mod, OS 1.53 and 1.54 | shared MIDI code | linked through the site build path | pass, except FX Track and MIDI Expression on 1.54 (declared) and Digi EQ (core) |

### For the pull request

Not tested on a unit: Digitakt mk1 has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands).
Edge cases: the table above, one row a case (or "Edge cases: none, because …").

## Not tested

- Any Modwerk build on a unit: behaviour, CPU, saving and reloading a project, a power cycle.
- MIDI routed into an audio track or the Master FX: CCs, locks, notes, the MIDI LFO.
- Messages on other channels leaving by MIDI OUT and USB while it is on.
- Three or more mods together.
