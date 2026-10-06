# Contributing to Modwerk

Contribute modules, fixes, documentation, screenshots and audio as pull requests to this repository. The owner merging your pull request approves it; the website has no second approval step. Guest comments and author issue reports on the site need no registration.

## Modules

Follow [Add or port a module](docs/ADD_A_MODULE.md). It covers porting from octabam or elekloader and writing your own, for every machine, with the commands to run. Read [the guide for your module's category](docs/module-guides/README.md) before you write it: it says how a module must behave beside parameter locks, LFOs, scenes, saved projects and other modules, and a module that acts in time uses the instrument's own tempo, track speed and swing. `npm run module:doctor -- <id>` must be green.

What review expects for a new module, or for a change to how a module runs:

- worst-case cycle counts and exact memory accounting (Octatrack, see [qualification](docs/MODULE_QUALIFICATION.md));
- a hardware report from a real unit that states its model, how long it ran, what was tested and the limitations. There is no minimum duration or track count;
- complete documentation with a short tutorial, and real black-and-white screenshots of where the module is selected and of its controls ([captures](docs/MODULE_UI_CAPTURES.md));
- every author's credit and licence.

A change to a module's documentation or media alone can keep its existing test evidence ([retained evidence](docs/MODULE_QUALIFICATION.md#risk-based-update-checks--3-october-2026)).

## Versions

Any change to a module's code needs a strictly higher semantic `version` than on `main`. Code is what a compiler reads: source files, `manifest.py`, licences and the manifest's build fields (`version`, `key`, `author.github`, `source`, `compatibility.effectId` and `build.status`). Documentation and media do not: README and other Markdown, `media/`, `presentation/`, `evidence/` and the rest of the manifest's text can change under the same version, and need no rebuilt packages or fresh approval. (The eleven frozen baseline modules, `cc-map`, `previewvol` and MIDI Scenes keep their exact-folder exemptions, so a documentation edit to them still uses the retained-evidence path.) Update the module's entry in `sdk/catalog.json` to match when it is listed. Never reuse a released version for different code. Explain parameter-layout or ID changes and what happens to existing projects. `npm run modules:check -- --base origin/main` checks this after you rebase onto current `main`.

## Intellectual property

Submit only original or properly licensed source and media.

- Do not include Elektron firmware, extracted instructions, routines or tables, stock slices, upgrade or SysEx files, or anyone else's work you have no licence for. Firmware-dependent content comes from each user's own verified OS at build time, matched by address, length and hash.
- For adapted components, keep their copyright notices and full terms in the module's `LICENSE`. Add their provenance to `sdk/octabam/licenses/manifest.json`, and declare every licence as an SPDX expression, for example `MIT AND ISC`.
- Run `npm run licenses:generate` and `npm run licenses:check`.

Review and contributor declarations are not legal clearance.

## Screenshots and audio

Put assets in the module's `media/` folder and declare them in the manifest with caption, alt text, credit, licence and provenance. Screenshots must be real LCD captures from hardware or the headless emulator, never mock-ups or redrawn labels. Label which one each capture is.

Limits: up to eight assets; images (PNG, JPEG or WebP) up to 5 MB; audio (WAV, MP3 or Ogg) up to 12 MB. Audio is optional.

## Review and release

The owner reviews behaviour, tests, resource claims, provenance and compatibility, and merges when the checks pass on the latest commit.

After the merge, release automation:

1. recompiles the reviewed commit without network, credentials or firmware;
2. publishes only if the result reproduces the committed packages.

A failed release keeps the previous one available. A pull request that changes compiled packages must include them, rebuilt as described in the guide.
