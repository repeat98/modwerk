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
- No module depends on another. Each builds, installs and works when it is the only module chosen: no `requires`, no hooks into another module's code, no "needs X" selection rule, no pull request stacked on another module's. Shared code goes into the base or the shared SDK first, or the features ship as one module. Review refuses a dependent module, with no exception ([cross-compatibility](module-guides/README.md#cross-compatibility)).
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

Keep unqualified Octatrack work under `sdk/drafts/<id>/`, with its draft
release notes in `CHANGELOG.json`. Every folder in `sdk/octabam/modules/` is
validated for publication even when absent from `sdk/catalog.json`; placing
a draft there blocks catalogue generation for everyone. Move it into that
directory and move its notes into `src/community/module-changelogs/` only
when the publication requirements are met.

Run this after every edit. It takes about 15 seconds, never reads firmware and never runs module code.

```sh
npm run modules:generate                      # regenerate the catalog from the module folders
npm run check -- --base origin/main            # scopes docs to metadata/provenance; code runs the full app suite
npm run module:doctor -- <id>                 # does the module fit every workflow? lists each gap and the command that fixes it
npm run modules:check -- --base origin/main   # version and publication rules for the folders you changed
npm run modules:compat -- <id>                # Octatrack: installs beside every other active module and the base? each clash and its fix
```

## What CI runs

- **Documentation-only pull requests:** licence, generated catalogue, release-note coverage, module contract, tutorial and screenshot-provenance validation, plus the catalogue tests (`src/catalog`, about 15 seconds), because some of them check that the guides link to files that exist. No full application test suite, bundle, Windows runner or native compiler.
- **Application or behaviour changes:** the full `npm run check` (lint, tests, types, build).
- **Only a pull request that changes module source, the module build or the committed packages:** the Docker compile that must reproduce the committed packages. Changes to module folders or their path handling also run the Windows check. These are the same inputs the release uses to decide whether to rebuild the modules.
- **After the merge:** the release verifies the merge approval, re-verifies the generated files, licences and module records, then type-checks and bundles what the pull request already tested. It rebuilds the modules only if module inputs changed.

## Optional creator support

Once your module is in the reviewed catalog, you can link your own Ko-fi page without changing its source or publishing a new module version. On Modwerk, open **Your account → Developer account**, verify the author/maintainer GitHub identity, claim the module, and save its HTTPS Ko-fi profile URL in **Developer workspace → Your Ko-fi page**. Visitors can then click the small cup beside your name to open an embedded tip dialog. You can replace or remove the link at any time. Support links are stored per module, including separate Digitakt and Digitone IDs. See [the developer workspace](DEVELOPER_WORKSPACE.md) for ownership rules.

## Release notes (required for every fix and module version)

Every module fix must include its changelog update in the same PR; do not defer it until after the fix or release. Before publishing a new module or updating its version, add an entry to the file named by its community ID in `src/community/module-changelogs/`. Octatrack IDs are the module ID (`euclid.json`); Digitakt and Digitone IDs include the machine (`digitakt-digihealth.json`, `digitone-digihealth.json`). Keep earlier entries. Each file is that module’s list of releases. `npm ci` and `npm run check` combine them into the generated, uncommitted `src/community/module-changelogs.json`, and the module folders into `src/catalog/machine-modules.json`, so two module PRs never edit the same file. The module page’s Changelog tab shows these notes, including when live version history is unavailable.

```json
{
  "version": "0.1.5-experimental",
  "date": "2026-10-08",
  "changes": ["Fixes the step lights staying lit after STOP (#123)."]
}
```

Use the exact catalog/manifest version and the source-update date (`YYYY-MM-DD`). An optional `sourceCommit` is a full 40-character repository commit SHA; omit it until the referenced commit exists. Write for the people who play the module: they read these notes on the module page and in the update email. Use at most five lines, each one plain sentence of at most 200 characters about what changed for them: a new feature, a fixed bug with its issue number, a changed control, something to redo after updating. “Updated module” is not enough. Leave out how it was done, measurements, addresses, internal names, test evidence and owner waivers; they belong in the pull request and the verification record. When players need to know a limit, add one line that starts with `Known issue:` in plain words, for example `Known issue: not yet tested on the MKI.` Never imply hardware or audio testing that did not happen. For an imported release, say in a few words whether upstream changed the module or Modwerk only repackaged it.

```json
{
  "version": "0.3.1-experimental",
  "date": "2026-10-23",
  "changes": [
    "Fixes the Octatrack freezing while POLY8 plays (#646). When the CPU runs short, POLY8 now drops voices: release tails first, then the oldest notes.",
    "Uses much less CPU on the beta base. The sound is unchanged.",
    "Known issue: not yet tested on the MKI or after reloading a project."
  ]
}
```

`npm run check -- --base origin/main` and `npm run build` reject missing current-version notes, duplicate/invalid versions, malformed dates, unknown module IDs and entries over five lines or with a line over 200 characters. `node scripts/module-changelogs.mjs` runs just this inexpensive metadata check. Regenerate catalogs after a manifest version changes, then validate before committing. Notes live outside module source folders so adding them does not invalidate retained qualification records or trigger native compilation.

The published release inventory includes these exact version-matched notes. Published module versions automatically notify their followers, including eligible prior downloaders. Update email is enabled by default and uses the existing daily module digest; members can unfollow a module or opt out of update/activity email. No per-release announcement opt-in is required, and legacy `announce` flags do not suppress notifications. Equal-version media or documentation edits do not replay an update, and superseded inventories never announce an older release. Before pushing a module update, the coding agent must tell the maintainer in chat that successful publication will notify followers, including by email according to their preferences; a push alone does not send mail. Update emails include the saved change list and limitations in HTML and plain text, with a link to the Changelog tab.

Documentation/media-only fixes do not need a version bump unless requesting automatic author publication, but must add a clearly marked documentation-only or media-only note to the current entry in the same PR. A new version, including a metadata-only version when deliberately published, must always have its own entry.

## Documentation-only updates

Local module `README.md`, `TESTING.md` and `CPU.md` can be edited without updating import checksums. Their recorded hashes remain import history. Code, licences, archived snapshots and preserved `upstream/` documentation retain exact checksums. The lightweight `npm run sdk:imports:check` uses Node alone and runs on documentation PRs; the full SDK check at publication uses the same policy.

Fixing a README, a tutorial, a caption or a screenshot of a module that already has its qualification record needs none of the heavy steps: no version bump, no rebuilt packages, no fresh approval, and no Docker compile in CI when only README, Markdown, `media/`, `presentation/` or `evidence/` files change. Compiled packages bind to the module’s code fingerprint (`moduleSourceFingerprint` in `scripts/module-source.mjs`), which ignores those files and the manifest’s prose. Older native evidence can also bind the presentation thumbnail; use the [shared preview artwork path](#module-thumbnail-style) for those replacements. Open a normal pull request and run `npm run check -- --base origin/main`. The same classifier drives PR checks and deployment: prose and media on all three machines skip native compilation, while firmware source, linking/build inputs and compiler changes retain it. The site still bundles and publishes the documentation; unchanged Worker inputs skip its deploy. The frozen baseline modules, `cc-map`, `previewvol` and MIDI Scenes keep their older exact-folder rules (see [retained evidence](MODULE_QUALIFICATION.md#risk-based-update-checks--3-october-2026)).

For imported files outside the three editable local guides, refresh affected `vendoredSha256` records in `sdk/imports/` after reviewed media or attribution edits, and record the local update while preserving upstream source fingerprints. Instrument capture checks must select `otUi` media; audio previews share the media list.

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

## Module thumbnail style

Always use the library's shared signal-art style for new or replacement module
thumbnails. Reuse the SVG classes and drawing conventions in
`src/components/ModulePreview.tsx` and `src/devices/DigiModPreview.tsx`; keep saved
SVG thumbnails consistent with the displayed illustration.

- Use a `320×192` viewBox, the shared dark preview surface (or transparency in
  the preview component), and the faint grid at y=52/97/142 and x=64/128/192/256.
- Use the module/category `--signal` accent from the shared styles. Primary,
  secondary and ghost strokes follow the existing widths and opacity levels;
  use the shared dot and rhythm classes for filled marks.
- Draw a clear signal, routing, rhythm or control diagram that explains the
  module. Keep it readable at card size, with quiet space around the drawing.
- Use small monospace labels with the shared letter spacing. The preview
  already carries the module title; avoid oversized repeated titles, unrelated
  colours, heavy frames, decorative badges and generic placeholder waveforms.
- Keep diagrams conceptual. They must not imply measured audio, processor
  load, hardware verification or instrument-screen authenticity.

Some older native qualification/approval fingerprints include the original
`presentation/thumbnail.svg`, even though the compiled-package fingerprint
excludes presentation files. For these modules, replace the displayed artwork
through the existing `ART` entry in `ModulePreview.tsx` and preserve the bound
asset; do not rewrite evidence hashes for an illustration change.

## Screenshot walkthroughs

Make the gallery a short usage tutorial for every machine: two to five
essential images in find/enable → control example → expected result and
stop/reset/bypass order. Captions explain the actual buttons or encoders and
what they do; label inventories and fixture descriptions are insufficient.
Keep alt text about the visible screen and reserve extra pages for supplementary
screenshots. Read the complete gallery as a first-time user and follow the
[screenshot caption standard](MODULE_UI_CAPTURES.md#write-a-short-screenshot-walkthrough).

A module that makes or changes sound can also carry one short [audio preview](MODULE_AUDIO_PREVIEWS.md): an isolated sample comparison or an explicitly requested musical phrase that makes its controls audible.

## Octatrack base and USB lifecycle

New Octatrack development must deliver the browser-built base and USB module
lifecycle alongside its card build. Plan common companions before writing
code: stock FX, Analog BD and common custom machines/effects, on both DSP
cores. Record shared hook/data ownership, contiguous P/X/Y placement, live
stock tenants and fixed/instance cycle costs. A native composition or a
standalone package that links is not completion.

Release evidence must cover the exact source-built browser/runtime packages,
regeneration and stock-free scan, base compatibility and truthful inventory,
installation and self-test, Keep/Undo, replacement/removal, missing-module
fallback and distinct instances through Part/project reload and physical
reboot where applicable. Give hardware steps and record actual results;
emulator/host tests do not fill missing hardware qualification. Preserve the
previous approved download while preparing candidates.

**Growing a stock table over USB.** A runtime package carries no `TableGrow`
(`sdk/runtime/loader/build.py --octabam` refuses `tables`). Keep the grown
table in the module's own unit instead: zero placeholders that `StockCopy`
fills from the guarded stock entries at install, your entries after them,
and a `SymbolRef` on every stock reference to the table. One stock copy
spans at most 32 bytes (`SITE_BYTES` in `loader.h`), so split a longer table
into chunks with their own symbols. Card builds take the same growth as
`TableGrow`: Modwerk's card builder accepts a stock copy only where it
replays instructions a detour displaced, and refuses table copies at import.
Elekloader's port runs a manifest as `octabam_<name>`, so a manifest can
pick the form by `__name__` (`sdk/octabam/modules/dejavu/manifest.py`).

**The strict stock-free scan can match original data.** Small, regular data
such as a sparse icon bitmap or a full-cell mask can equal stock bytes over
the scanner's minimum run, and the package is refused. Find the run with the
scanner's own `module_packages.runs` and `check_stock_free.stock_runs`, then
vary bits the data's reader ignores (for an LCD icon column word, the low
bits below its rows).

A new module version rebuilds its USB package in the same pull request:
`npm run octatrack:module-packages` with the m68k-elf toolchain and the
Elekloader checkout (`npm run upstream:tools`), then `-- --check` until every
package says identical. CI has no toolchain, but `--check` still fails there
when a package in `src/engine/assets/octatrack-module-packages.json` is at an
older version than the catalogue. A deliberate lag names the catalogue version
in `lagsBehind` and the reason with its issue in `lagReason`; remove both when
the package is rebuilt. The standalone and table recipes in
`sdk/machines/octatrack/module-adapters/` pin whole shared files (the engine
asset JSON, the remix tools, `module_packages.py`, the Elekloader checkout),
so another module's release can make them stale. Refresh a pin only after the
full check proves the package unchanged; a changed package is a new release.

A newly developed module selectable in beta module sets must have a working
USB path, not a card-only fallback; existing card-only modules need a reviewed
migration before USB rollout. An unavoidable compatibility limit needs its
actual resource/ownership reason and explicit owner review. This does not
assert that pending loader ABI work (ABI 7), shared machine registration,
table support or hooked DSP work is released: those adapters and new bases
remain private staging until their checks and qualification are complete. See
the [loader compatibility guide](../sdk/machines/octatrack/elekloader/README.md#runtime-compatibility-and-the-card-builder).

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
   On macOS with colima, Docker sees only your home folder, and the script stages the source with `mktemp -d`, which on macOS makes it under `/var/folders` and ignores `TMPDIR`. Put a `mktemp` shim first on `PATH` for that run so the staging folder lands under `$HOME`:
   ```sh
   mkdir -p ~/.cache/mktemp-shim ~/.cache/tmp-isolated
   printf '#!/bin/sh\nexec /usr/bin/mktemp -d "$HOME/.cache/tmp-isolated/tmp.XXXXXXXX"\n' > ~/.cache/mktemp-shim/mktemp
   chmod +x ~/.cache/mktemp-shim/mktemp
   PATH=~/.cache/mktemp-shim:$PATH bash scripts/build-modules-isolated.sh . ../module-packages "$image"
   ```
5. **Compare with native octabam** on your own 1.40C update file:
   ```sh
   npm run module:verify -- <id> --os ~/path/to/OCTATRACK_OS1.40C.bin
   ```
   - **What it builds.** Native octabam builds your module inside the toolchain image, without network: alone, beside each other module, in the fullest selections and in a fixed sample in between, each with and without the stock FX2 effects.
   - **What must match.** Modwerk's browser builder must refuse what native refuses, and reproduce what native builds.
   - **What it updates.** It records the native pair checks (`npm run modules:pairs`) and your module's chooser entry, and writes `sdk/native-comparisons/<id>.json`. Commit everything it changed.
   - **Reruns.** Native results are cached, so after a fix only the affected builds run again. After a change to `src/engine/` alone, `npm run module:verify -- --all --os <file> --check` repeats only the browser side for every recorded module.
   - **Your firmware.** The MAIN OS extracted from your file stays in `~/.cache/modwerk-native`, outside the checkout, with the cache. `npm run module:verify -- --clean` deletes it.
   - **New shapes.** A module with a shape no earlier module had, such as one that replaces a stock effect or claims new memory, needs changes in both `src/engine/` and `sdk/octabam/tools/build/build_bus.py`. Expect the comparison to point at them.
6. **Capture the screenshots** in the headless emulator with `scripts/capture-module-ui.py` ([how](MODULE_UI_CAPTURES.md)). Open every image before keeping it.
7. **Check how it shows on the site.** The catalog entry puts the module in the library and the configurator; `npm run dev` shows it.
   - The library card draws `presentation/thumbnail.svg` (320×192). Hand-drawn art in `src/components/ModulePreview.tsx` is optional.
   - Analog BD admits only the custom DSP effects named in `analogBdCompanions` in `src/catalog/selection-conflicts.ts` and refuses every other module with an `effectId`. Add yours there only after native/browser placement evidence on both cores. If your effect builds beside the stock FX2 effects, add it to `FITS_BESIDE_STOCK_FX2` in the same file. Both lists describe baked card placement, not the USB arena; see the [USB lifecycle](#octatrack-base-and-usb-lifecycle).
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
- Write `src/`, and subscribe to core events in `build.json` ([events and budgets](../sdk/machines/digitakt/README.md)). A stock site the core does not expose is proposed as an event before the mod ([propose an event](module-guides/README.md#propose-an-event-on-the-digitakt-digitone-or-digitakt-ii)); a mod never patches it.
- Modwerk compiles the source in its pinned toolchain ([source builds](ELEMOD_SOURCE_BUILDS.md)).
- The browser builds only from the `.elemod` files in elekloader's catalog, so to appear in the configurator a new mod needs an `.elemod` release pinned in its own record, `sdk/imports/elekloader-<id>-<date>.json`, and downloaded with `npm run elekloader:update -- --overlay <that record>`. Never edit `vendor/elekloader/catalog/catalog.json`: it is generated from the upstream catalog and the records.
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
