# Add or port a module

This page is for contributors and for the coding agents they point at this repository. Read it, then the section for your machine. The other module documents are field references; open one only when a step links to it.

Start with the [developer workflow and distribution context](DEVELOPER_WORKFLOW.md) for submission, release verification, report handling and catalogue boundaries. Instruments without an SDK follow [Add a machine](ADD_A_MACHINE.md) before module scaffolding.

For an existing published module, start with [author updates](MODULE_AUTHOR_UPDATES.md). Telling a coding agent “fix issue <link>” in your fork starts the guided fix, version, hardware-test and release flow. The owner approves first releases; registered authors can publish their own later updates after checks pass.

## Read the guide for your category first

Every module follows [the guide for its category](module-guides/README.md): effects, machines, playback, scenes, MIDI & USB, system or standalone. They say how a module must behave beside parameter locks, LFOs, scenes, saved projects and other modules, and anything that acts in time follows [sequencing.md](module-guides/sequencing.md): the instrument's own transport, tempo, track speed and swing, never a clock of your own. `npm run module:doctor -- <id>` checks the integration points a program can see.

## Choose your path

| You want to | Go to | Start with |
| --- | --- | --- |
| Port an octabam module | [Octatrack](#octatrack) | the module's folder in octabam at an exact commit |
| Write a new Octatrack module | [Octatrack](#octatrack) | `npm run module:new -- my-filter --kind dsp --author <github-login>` (`--kind coldfire` for a CPU module) |
| Bring an elekloader mod to Digitakt or Digitone | [Digitakt and Digitone](#digitakt-and-digitone) | the author's released `.elemod` files |
| Write a new Digitakt or Digitone mod | [Digitakt and Digitone](#digitakt-and-digitone) | `npm run module:new -- my-mod --machine digitakt --author <github-login>` |

## Rules that always apply

- Never commit firmware, extracted stock code or tables, memory dumps, emulator cards or built images. Firmware stays on your computer. Stock code is referenced by address, length and SHA-256 and copied from each user's own OS file when they build.
- Keep every author's credit and full licence text. Pin ported source to an exact commit. Both module contracts accept an optional `author.contributors` array of `{ "github": "handle", "name": "Display name" }` entries (`name` is optional). Each contributor appears on a separate line below the primary author in library cards, page headers and module information; describe their contribution in `author.credits` and the README. This attribution does not grant module ownership, report access or release authority; those continue to use the primary author and declared maintainers.
- Code or behaviour changes inside a module folder need a higher semantic `version` in its manifest, and the same version in `sdk/catalog.json` once listed. Documentation/media/prose-only edits need a version bump only when requesting automatic author publication.
- One module per pull request. The owner approves the first release and changes beyond the registered author's scope. Later scoped updates can use automatic author publication after evidence verification and required checks.

## Persistence and multiple instances

For every stateful module, project saving and reload/reboot survival are
essential acceptance checks. Always exercise multiple simultaneous instances
with different settings: different tracks, both FX slots when supported and
both DSP cores when applicable. Verify that editing, replacing or resetting one
instance does not change another. Single-instance operation is insufficient.

Check Part save/reload, project save/load/reload and a restart with volatile RAM
discarded, retaining only the card and battery-backed RAM. After each operation,
verify every instance's machine/FX assignment, sample or engine selection,
parameters and usable audio. Include a saved baseline followed by unsaved edits
so reload must restore the expected baseline. An emulator that explicitly loads
the project after a fresh boot proves project loading, not power-cycle survival.
Bind results to the exact source/image and record physical reboot evidence
separately; failures or unavailable paths remain explicit qualification gaps.

## Setup

- Node 24 (see `.nvmrc`), then `npm ci`. This is all you need for documentation, metadata and the website.
- Octatrack native work also needs Python 3.10+, Docker and your own Octatrack OS 1.40C update file, kept outside the repository. Build the pinned toolchain image once: `docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .`

## The fast loop

Run this after every edit. It takes about 15 seconds, never reads firmware and never runs module code.

```sh
npm run modules:generate                      # regenerate the catalog from the module folders
npm run check -- --base origin/main            # scopes docs to metadata/provenance; code runs the full app suite
npm run module:doctor -- <id>                 # does the module fit every workflow? lists each gap and the command that fixes it
npm run modules:check -- --base origin/main   # version and publication rules for the folders you changed
```

## What CI runs

- **Documentation-only pull requests:** licence, generated catalogue, release-note coverage, module contract, tutorial and screenshot-provenance validation. No application test suite, bundle, Windows runner or native compiler.
- **Application or behaviour changes:** the full `npm run check` (lint, tests, types, build).
- **Only a pull request that changes module source, the module build or the committed packages:** the Docker compile that must reproduce the committed packages. Changes to module folders or their path handling also run the Windows check. These are the same inputs the release uses to decide whether to rebuild the modules.
- **After the merge:** the release verifies the merge approval, re-verifies the generated files, licences and module records, then type-checks and bundles what the pull request already tested. It rebuilds the modules only if module inputs changed.

## Optional creator support

Once your module is in the reviewed catalog, you can link your own Ko-fi page without changing its source or publishing a new module version. On Modwerk, open **Your account → Developer account**, verify the author/maintainer GitHub identity, claim the module, and save its HTTPS Ko-fi profile URL in **Developer workspace → Your Ko-fi page**. Visitors can then click the small cup beside your name to open an embedded tip dialog. You can replace or remove the link at any time. Support links are stored per module, including separate Digitakt and Digitone IDs. See [the developer workspace](DEVELOPER_WORKSPACE.md) for ownership rules.

## Release notes (required for every module version)

Before publishing a new module or updating its version, add an entry under its community ID in `src/community/module-changelogs.json`. Octatrack IDs are the module ID (`euclid`); Digitakt and Digitone IDs include the machine (`digitakt-digihealth`, `digitone-digihealth`). Keep earlier entries. The module page’s Changelog tab shows these notes, including when live version history is unavailable.

```json
{
  "version": "0.1.5-experimental",
  "date": "2026-10-08",
  "changes": ["Describe the user-visible fix or feature and any compatibility or saved-project limits."]
}
```

Use the exact catalog/manifest version and the source-update date (`YYYY-MM-DD`). An optional `sourceCommit` is a full 40-character repository commit SHA; omit it until the referenced commit exists. Explain what changed, not just “updated module”. Mention changed controls, migration requirements and remaining limitations when relevant. Never imply hardware or audio testing that did not happen. Imported releases must distinguish upstream implementation changes from Modwerk packaging or documentation changes.

`npm run check -- --base origin/main` and `npm run build` reject missing current-version notes, duplicate/invalid versions, malformed dates and unknown module IDs. `node scripts/module-changelogs.mjs` runs just this inexpensive metadata check. Regenerate catalogs after a manifest version changes, then validate before committing. Notes live outside module source folders so adding them does not invalidate retained qualification records or trigger native compilation.

The published release inventory includes these exact version-matched notes. Update emails include every change and limitation from that entry in HTML and plain text, with a link to the module’s Changelog tab. The Worker retains the published notes for delayed digests and refuses to announce a new version without them.

Documentation-only changes do not need a version bump: update the current entry with a clearly marked documentation-only note if the change belongs in its release history. A new version, including a metadata-only version when deliberately published, must always have its own entry.

## Documentation-only updates

Fixing a README, a tutorial, a caption or a screenshot of a module that already has its qualification record needs none of the heavy steps: no version bump, no rebuilt packages, no fresh approval, and no Docker compile in CI when only README, Markdown, `media/`, `presentation/` or `evidence/` files change. The packages and the owner's approval bind to the module's code fingerprint (`moduleSourceFingerprint` in `scripts/module-source.mjs`), which ignores those files and the manifest's prose. Open a normal pull request and run `npm run check -- --base origin/main`. The same classifier drives PR checks and deployment: prose and media on all three machines skip native compilation, while firmware source, linking/build inputs and compiler changes retain it. The site still bundles and publishes the documentation; unchanged Worker inputs skip its deploy. The frozen baseline modules, `cc-map`, `previewvol` and MIDI Scenes keep their older exact-folder rules (see [retained evidence](MODULE_QUALIFICATION.md#risk-based-update-checks--3-october-2026)).

## What a finished module contains

Its folder, `sdk/<platform>/modules/<id>/`, holds:

- the source and its native declaration: `manifest.py` on the Octatrack, `build.json` on Digitakt and Digitone;
- the manifest, `octamod.module.json` on the Octatrack or `modwerk.module.json` on Digitakt and Digitone. It lists every control, how to reach the module on the unit, compatibility and conflicts, resource gauges, test evidence, licence and media;
- `README.md` with the sections Overview, Controls, Usage, Compatibility and limitations, Tests and measurements, Authorship and licences, and Screens and audio. It also has a tutorial of at least three steps (set it up and select it, use one control, hear the result and stop or bypass it), which must match the manifest;
- `TESTING.md` with the commands, the exact source revision and every result;
- `LICENSE` with every author's terms;
- `media/` with real black-and-white screenshots of where the module is selected and of its control pages, and their provenance in `capture.json`;
- an original 320×192 SVG thumbnail: `presentation/thumbnail.svg` on the Octatrack, `media/thumbnail.svg` on Digitakt and Digitone.

The checks reject missing sections, coloured screenshots and a version that did not increase. They cannot tell whether the documentation is true; the owner reviews first releases and registered authors verify their scoped updates.

## Screenshot walkthroughs

Make the gallery a short usage tutorial for every machine: two to five
essential images in find/enable → control example → expected result and
stop/reset/bypass order. Captions explain the actual buttons or encoders and
what they do; label inventories and fixture descriptions are insufficient.
Keep alt text about the visible screen and reserve extra pages for supplementary
screenshots. Read the complete gallery as a first-time user and follow the
[screenshot caption standard](MODULE_UI_CAPTURES.md#write-a-short-screenshot-walkthrough).

## Octatrack

1. **Create the folder.**
   - *Porting:* copy the module's folder from octabam at an exact commit into `sdk/octabam/modules/<id>/`, and put the author's original files it depends on under `upstream/`. Record every copied file with its source path and SHA-256 in `sdk/imports/<id>-<short-commit>.json`; `sidechain-compressor-f80ecfe.json` is an example. Add the licence to `sdk/octabam/licenses/manifest.json`, then run `npm run licenses:generate`.
   - *New:* `npm run module:new` creates the folder. Pick a free effect ID, and replace `verify.py`, which fails on purpose until you do.
   - Either way, read the traps in [octabam's AGENTS.md](../sdk/octabam/AGENTS.md) before writing DSP or ColdFire code. The DSP assembler silently mis-encodes some instructions, and several of these traps assemble cleanly into the wrong machine code.
2. **Fill in the manifest** from [the template](../public/module-repository.example.json): every control, the access steps, compatibility and conflicts. Add the resource gauges (`resources.impact`, see [gauges](MODULE_RESOURCE_GAUGES.md)) and the qualification record (`tests.qualification`, see [fields](MODULE_QUALIFICATION.md)).
3. **Measure and test.**
   - Record the worst-case cycles for each processor and the exact memory regions and totals. New FX should aim for DSP cost in the same ballpark as worst-case stock SPRING REV. Plan around that reference before implementation and compare expensive types/settings, moving controls and trigger splits under matched conditions on both cores. This is a design target without a fixed ratio or hard per-effect ceiling; substantially higher cost needs optimization and review of the remaining headroom.
   - For an effect, also check how it sounds: aliasing, clipping, DC and idle behaviour (`npm run fx:audit`, [effects guide](module-guides/effects.md#sound-quality)). Paste the table into TESTING.md, or write "not tested". No gate in CI runs it.
   - Add a hardware report from a real unit, stating its model, how long it ran, what was tested and the limitations. There is no minimum duration or track count.
   - If you could not test on hardware, say so in the pull request. Only the owner can waive this, for one exact version.
   - Hardware tests are planned to run automatically over USB with a customised test firmware ([decision](DECISIONS.md#5-october-2026--a-faster-module-workflow)).
4. **List it and compile the packages without firmware.** The build compiles every module in `sdk/catalog.json`, so add an entry for yours first: `id`, `version` and `addedAt`, the UTC time it was first added (for example `2026-10-05T12:00:00Z`). From then on, `modules:check` also requires the complete qualification record, documentation and screenshots. Commit, then run this from the clean checkout. The output folder must not exist yet.
   ```sh
   image=$(docker image inspect modwerk-source-tools --format '{{.Id}}')
   bash scripts/build-modules-isolated.sh . ../module-packages "$image"
   npm run modules:import -- ../module-packages/packages --development
   ```
   Commit what the import changes. CI compiles the same packages again and fails if they differ.
5. **Compare with native octabam** on your own 1.40C update file:
   ```sh
   npm run module:verify -- <id> --os ~/path/to/OCTATRACK_OS1.40C.bin
   ```
   - **What it builds.** Native octabam builds your module inside the toolchain image, without network: alone, beside each other module, in the fullest selections and in a fixed sample in between, each with and without the stock FX2 effects.
   - **What must match.** Modwerk's browser builder must refuse what native refuses, and reproduce what native builds.
   - **What it updates.** It records the declaration checks and your module's chooser entry, and writes `sdk/native-comparisons/<id>.json`. Commit everything it changed.
   - **Reruns.** Native results are cached, so after a fix only the affected builds run again. After a change to `src/engine/` alone, `npm run module:verify -- --all --os <file> --check` repeats only the browser side for every recorded module.
   - **Your firmware.** The MAIN OS extracted from your file stays in `~/.cache/modwerk-native`, outside the checkout, with the cache. `npm run module:verify -- --clean` deletes it.
   - **New shapes.** A module with a shape no earlier module had, such as one that replaces a stock effect or claims new memory, needs changes in both `src/engine/` and `sdk/octabam/tools/build/build_bus.py`. Expect the comparison to point at them.
6. **Capture the screenshots** in the headless emulator with `scripts/capture-module-ui.py` ([how](MODULE_UI_CAPTURES.md)). Open every image before keeping it.
7. **Check how it shows on the site.** The catalog entry puts the module in the library and the configurator; `npm run dev` shows it.
   - The library card draws `presentation/thumbnail.svg` (320×192). Hand-drawn art in `src/components/ModulePreview.tsx` is optional.
   - Analog BD automatically refuses any module with an `effectId`, since it builds only beside stock effects. If your effect builds beside the stock FX2 effects, add it to `FITS_BESIDE_STOCK_FX2` in `src/catalog/selection-conflicts.ts`.
   - Add a short entry to `docs/VERIFICATION.md` with what you compared and the result.
8. **Open the pull request.** Say what you tested, what you did not test and why.

## Digitakt and Digitone

Firmware for these machines is built by elekloader's builder, vendored unchanged and run in the browser ([vendor/elekloader](../vendor/elekloader/README.md)). It decides which mods combine, so there is no comparison with a native builder to run.

**Porting an elekloader mod:**

1. Take `elekloader-catalog.json` (and the kit zip when the kit changes) from an elekloader release, then run `npm run elekloader:update -- [elekloader-kit-<version>.zip --sha256 <hash>] elekloader-catalog.json [--library]`. It downloads each mod from its author's release, checks every hash, writes `vendor/elekloader/catalog/` and the lock, and prints what is left by hand. Details: [vendor/elekloader/README.md](../vendor/elekloader/README.md#updating). A module's id is its catalog id.
2. Create `sdk/<machine>/modules/<id>/` with the same layout as [digihealth](../sdk/digitakt/modules/digihealth/):
   - `modwerk.module.json`, with `source` pinned to the author's commit;
   - the author's source under `src/`, and `build.json`;
   - README, TESTING, and LICENSE with the author's own licence text;
   - `upstream/` for the author's own README;
   - `media/`.
3. Record the import in `sdk/imports/`, as in `elemod-2026-10-04.json`.
4. Build it in `npm run dev` with your own stock OS file, flash it and test it. Then set `evidence.tier` to what you actually did ([tiers](SDK.md#evidence-tiers)).

**Writing a new mod:** `npm run module:new -- my-mod --machine digitakt --author <github-login>` creates the folder (`--machine digitone` for Digitone).
- Write `src/`, and subscribe to core events in `build.json` ([events and budgets](../sdk/machines/digitakt/README.md)).
- Modwerk compiles the source in its pinned toolchain ([source builds](ELEMOD_SOURCE_BUILDS.md)).
- The browser builds only from the `.elemod` files in elekloader's catalog, so to appear in the configurator a new mod needs an `.elemod` release, added with `npm run elekloader:update` as above.
- `npm run module:doctor -- <id>` checks the module's manifest, category guide, catalog pin and module rules.

## Reference

| Topic | Document |
| --- | --- |
| How to write a module that behaves like the instrument, per category | [module-guides/](module-guides/README.md) |
| Octatrack manifest fields | [MODULE_REPOSITORIES.md](MODULE_REPOSITORIES.md) |
| Qualification record: cycles, memory, hardware, exceptions | [MODULE_QUALIFICATION.md](MODULE_QUALIFICATION.md) |
| Screenshots and the capture tool | [MODULE_UI_CAPTURES.md](MODULE_UI_CAPTURES.md) |
| Resource gauges | [MODULE_RESOURCE_GAUGES.md](MODULE_RESOURCE_GAUGES.md) |
| Contract v3 and evidence tiers | [SDK.md](SDK.md) |
| Writing native Octatrack code | [MODULES.md](../sdk/octabam/docs/remixer/MODULES.md) and [PLACEMENT.md](../sdk/octabam/docs/remixer/PLACEMENT.md) |
| Assembler and hardware traps that already cost real work | [octabam's AGENTS.md](../sdk/octabam/AGENTS.md) |
| What has been verified, and how | [VERIFICATION.md](VERIFICATION.md) |
