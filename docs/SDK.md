# The Modwerk SDK

One standard for every Elektron machine: a machine profile, a module contract, one set of commands and one review process. Machines differ only in their **platform**: how mods are built and combined on that hardware.

Modwerk never hosts, uploads or redistributes Elektron firmware. Every build starts from the stock OS file each owner downloads from Elektron, identified by its hash. Module folders contain only their authors' own source, documentation and media.

## Machines

Each machine has a profile at `sdk/machines/<id>/machine.json`, validated by [`src/devices/machine-contract.ts`](../src/devices/machine-contract.ts). `npm run machines:generate` writes the website's machine registry from them, and `npm run check` rejects a stale registry.

A profile records:

- name, models, status and summary;
- stock OS releases with their file names and SHA-256 identities (hashes only, never contents);
- flashing and recovery instructions shown to users;
- progress on the five steps to a first mod, and credit for the public research behind them;
- for machines with mods, the SDK: platform, module folder, catalog, guide, core and toolchain, plus the **budgets** every combination of mods must fit (memory, fast memory, slots).

| Status | Meaning |
| --- | --- |
| `available` | Mods can be built and downloaded in Modwerk. |
| `preview` | Mods and an SDK exist; Modwerk's build engine for the machine is in development. |
| `research` | Public research has started; no mods yet. |
| `open` | Nothing published yet. |

The contract keeps statuses honest. Machines with mods have firmware, an SDK and every step done. Research credits its sources. Nobody can mark a machine's mods done without a published SDK.

To add a machine, follow [Add a machine](ADD_A_MACHINE.md).

## Platforms

| Platform | Machines | How mods combine | Guide |
| --- | --- | --- | --- |
| `octabam` | Octatrack MKI/MKII (OS 1.40C) | octabam's platform runtime and stock-loader hooks; DSP effects and ColdFire modules composed by Modwerk's browser engine | [Octatrack](../sdk/machines/octatrack/README.md) |
| `elemod` | Digitakt mk1 (1.53, 1.54), Digitone mk1 and Keys (1.43, 1.44) | one core per machine with shared hooks (the hook bus), linked into one image; interoperable with the `.elemod` format | [Digitakt](../sdk/machines/digitakt/README.md), [Digitone](../sdk/machines/digitone/README.md) |

For the combined launch, Modwerk builds Digitakt and Digitone firmware with elekloader's kit: its TypeScript engine, builder worker and catalog, vendored unchanged with a lock file and run in the owner's browser ([vendor/elekloader](../vendor/elekloader/README.md)). Modwerk's own TypeScript linker, OS writer and core are frozen until work on them resumes; their target is a builder that matches elekloader's online builder. Each core's contract is `sdk/<machine>/core/interface.json`: the hooks, tables and exports it provides. `npm run modules:check` rejects modules that use anything else, so mods written for an interface link unchanged. The Digitakt II preview builds on toonst's core-dt2 1.0 (`sdk/digitakt-ii/core-profile/interface.json`). On every machine a site the core does not expose is proposed as a hook rather than patched ([Octatrack](module-guides/README.md#propose-a-hook); [Digitakt, Digitone and Digitakt II](module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).

## Modules

A module is a folder in its machine's module directory (`machine.sdk.modules`) with:

- the manifest: `modwerk.module.json` (contract v3) or, for existing Octatrack modules, `octamod.module.json` (contract v2);
- `README.md` with every control, how to reach the mod on the unit and a short tutorial;
- `TESTING.md` and any text reports under `evidence/`;
- a licence file;
- source under `src/` (elemod) or the octabam layout (Octatrack);
- `media/` with an original thumbnail and actual screenshots.

Source may instead live at a pinned commit in the author's repository (`source.repository`, `source.revision`). Modwerk CI still compiles it from that exact reviewed commit.

Create a module with:

```sh
npm run module:new -- my-mod --machine digitakt --author your-github-login   # elemod, contract v3
npm run module:new -- my-filter --kind dsp --author your-github-login        # Octatrack, contract v2
```

### Contract v3

[`src/catalog/module-contract-v3.ts`](../src/catalog/module-contract-v3.ts) defines the shared core for every machine:

- identity: `id`, `name`, semantic `version`, `machine`, `category`, `exclusive`;
- people: `author` with credits, and `maintainers`, the GitHub logins who update and moderate the module (the author is always included);
- presentation, access (location, exact steps, screenshots) and controls;
- compatibility: the OS releases from the machine profile it supports, plus requirements, conflicts and limitations;
- `platform`: the machine's own section, for example the elemod core release, build spec, subscribed hooks and claimed resources;
- resources measured against the machine's budgets: memory, fast memory and load;
- evidence (below), tests, licence and media.

Categories are shared by every machine, so the library keeps one shape: Effects, Playback, Machines, Scenes, MIDI & USB, System and **Standalone firmware**. Standalone firmware replaces the whole OS image: it is `exclusive`, links with no core and is always used on its own.

The elemod build spec (`build.json`) is what Modwerk's toolchain compiles and links ([source-only compilation](ELEMOD_SOURCE_BUILDS.md)):

- the C or assembly sources under `src/`, defines and flags;
- each subscribed core hook with its handler and order;
- contributions to core tables;
- reserved memory regions and copied blocks;
- the claimed resources;
- mod storage fields (`storage`: `sym`, `scope`, `bits`), for a core that keeps them (core-ar2 from 0.2): the linker places them from the build's lockfile as elekloader does ([Analog Rytm MKII](../sdk/machines/analog-rytm-mkii/README.md#mod-storage-core-03));
- for each supported OS release, the patch sites.

A patch site names its address, its length and the SHA-256 of the stock bytes it expects in the owner's own file. Stock bytes never appear in the repository. Steps that need the stock OS itself (`derive`) run only during the owner's local build, never in CI. The spec must agree with the manifest.

The existing Digitakt and Digitone mods (DIGISLICER, NEIGHBOR, SOPHIE, digihealth) are imported this way, with their authors' sources and licences, and pinned commits in [the import record](../sdk/imports/elemod-2026-10-04.json).

Octatrack modules move to contract v3 at their next version. Until then, contract v2 and its frozen eleven-module baseline stay exactly as they are.

## Evidence tiers

Every version records one evidence tier, bound to that version and its tested source hash:

| Tier | Shows | Requires |
| --- | --- | --- |
| `none` | Nothing yet (drafts) | — |
| `emulator` | Runs in an emulator | text reports |
| `author-hardware` | The author ran it on a real unit | the hardware report: model, OS release, date, tester, duration, summary, limitations |
| `owner-verified` | The owner checked the actual reports on hardware | as above, plus the verifying owner |

To publish, a version needs at least `author-hardware`, measured memory and load, and actual screenshots of where the mod appears. `owner-verified` is a badge shown to users, not a gate.

The Octatrack keeps its stricter qualification contract ([MODULE_QUALIFICATION.md](MODULE_QUALIFICATION.md)) for contract v2 modules.

## Checks

`npm run check` runs machine-profile validation, the module checks for every machine, licence notices, lint, tests, type checking and the production build. Checks read manifests and text only: they never execute submitted source or read firmware. Module folders reject firmware images, dumps, build outputs, binaries, symlinks and paths that leave the folder.

## Contributions

Every new module, update, document and media change is a pull request. Every change to a module's code needs a strictly greater semantic version; documentation and media edits do not. A merged pull request approves that exact version. See [CONTRIBUTING](../CONTRIBUTING.md).

Maintainers listed in a module's manifest are its contacts for updates, reviews of changes to their folder and bug reports. The owner reviews and merges every pull request; there are no automatic merges for now.

## Licences

The Modwerk browser frontend and original SDK/tooling code remain GPL-3.0-or-later unless a component declares another licence. The independent platform API/backend is source available under Elastic-2.0; its licence does not apply to firmware modules or vendored builders. See [licence scope](../LICENSE) and [platform licensing](PLATFORM_LICENSING.md). Vendored components keep their licences: octabam is MIT, and modules carry their authors' licences. elekloader and digikit are GPL-2.0-or-later and elekloader's TypeScript engine is GPL-3.0-or-later; their reuse must satisfy those licences, including attribution and applicable source/distribution obligations. Elektron product names identify the machines only; Modwerk is not affiliated with Elektron.
