# Platform licensing

Modwerk's independent API/backend and its pipeline files (workflows and build,
release, device and service tools) are source available under **Elastic License
2.0 (ELv2)**. Its licensor is Jannik Aßfalg (`repeat98`). The browser frontend
remains GPL-3.0-or-later. This is a component licensing change, not a blanket
relicensing of the repository or an additional restriction on its GPL code.

The authoritative scope is [LICENSE](../LICENSE), with full unmodified texts in
[LICENSES/Elastic-2.0.txt](../LICENSES/Elastic-2.0.txt) and
[LICENSES/GPL-3.0-or-later.txt](../LICENSES/GPL-3.0-or-later.txt).

## Scope

| Component | Licence in this revision |
| --- | --- |
| Original backend code in `server/`, `worker.ts`, `functions/` and `migrations/` | Elastic-2.0 |
| Original pipeline files listed as `pipelineFiles` in `LICENSES/platform.json` | Elastic-2.0 |
| Original shared helpers listed as `sharedFiles` in `LICENSES/platform.json` | GPL-3.0-or-later OR Elastic-2.0 |
| Browser frontend and other original Modwerk code without a separate declaration | GPL-3.0-or-later |
| SDKs, module source/packages, vendored builders, media, dependencies and contributed catalogue/machine data | Their existing component licences and notices |

The shared helpers have an alternative licence so the GPL frontend and the
ELv2 backend can each use them under compatible terms. This alternative does
**not** apply to the backend as a whole: its implementation is ELv2-only in this
revision. The inventory is explicit; it does not cover all of `src/`.

Generated catalogues retain their module/machine provenance and attribution.
The inventory's `dataFiles` records independently licensed data consumed by the
backend, not permission to relicense those records or their underlying modules.
Community posts, user data and submitted media are not relicensed by this change.

## Permissions and limits

ELv2 permits use, inspection, modification and redistribution subject to its
full terms. It prohibits providing the covered software to third parties as a
hosted or managed service that exposes a substantial set of its features or
functionality. The restriction is not limited to paid services. Local development
and internal use remain possible; a public fork exposing the covered backend's
account, forum, reporting or other substantial functionality needs separate
permission from the licensor. Contact [support@modwerk.app](mailto:support@modwerk.app)
for permission requests.

ELv2 also preserves licensing/copyright notices and prohibits circumvention of
licence-key functionality. The licence text governs; this explanation does not
add terms. [Official text](https://www.elastic.co/licensing/elastic-license) and
[official FAQ](https://www.elastic.co/licensing/elastic-license/faq).

ELv2 is source available, not an OSI open-source licence. It does not prohibit
every form of competing software: redistribution is permitted under its terms,
independent implementations can use the same technology choices, and versions
already released under GPL remain available under GPL. This change cannot
prevent someone hosting a compliant fork of an earlier GPL revision.

## Ownership and dependency audit

The implementation audit used `main` at
`65452618de82a23ea56a7f0cd864044740e0b810` on **9 October 2026**.

- All commits touching `server/`, `worker.ts`, `functions/` and `migrations/`
  in that history were attributed to the owner (`repeat98` / Jannik Aßfalg) or
  the owner's coding assistant. Human co-author trailers identify the owner;
  the other trailers identify coding assistants. No outside human contribution
  was identified in this backend scope.
- The 35 shared runtime source files listed in `LICENSES/platform.json` have
  the same owner/assistant history. Existing source notices and imports were
  inspected; no Elekloader or other GPL third-party implementation was found in
  the backend's runtime source graph. Direct backend npm dependencies declare
  MIT; dependencies retain their own terms.
- Outside contributors have changed frontend/build tooling and generated
  module/machine data. Those works retain their licences. In particular,
  `src/catalog/module-contract-v3.ts` contains an outside contribution and is
  **not** in the alternative-licence inventory. Backend references to it are
  type-only, erased during compilation; the source itself stays GPL.
- The frontend directly imports Elekloader's GPL kit, including its client and
  helpers. Its current integration and other outside frontend contributions
  remain GPL. It is not presented as ELv2, and separating a worker alone is not
  treated as evidence of an independent copyright work.

The production Worker was also bundled with `wrangler deploy --dry-run --config
wrangler.worker.jsonc --outdir <private-temp-folder> --metafile <private-temp-file>`.
Its actual input manifest contains no Elekloader kit, firmware engine, Octabam
implementation or `module-contract-v3.ts`. No deployment was performed by this
audit.

This is a repository provenance audit, not legal clearance or a claim that Git
attribution alone proves copyright ownership. The owner reviews this scope at
merge. Extending ELv2 to the frontend needs a separate ownership and dependency
review, and any required permissions from the relevant rights holders.

### Pipeline files (25 October 2026)

`pipelineFiles` extends ELv2 to 23 files outside the backend folders: the six
GitHub workflows (module checks, author releases, pull request flags and triage,
site and Worker deployment), the isolated module and Elemod build scripts, the
USB Audio base-variant patch, release sync, device and diagnostics tools, and
service operations (administrator key, backups, push keys, domain check, forum
preview seed). The audit used `main` at `7c725e98` on 25 October 2026.

- All 74 commits touching a listed file, followed through renames, were by the
  owner or the owner's coding assistant. Every pull request they arrived in was
  opened by the owner, except #10, whose two commits on these files are the
  owner's own. `git blame -w -M -C` attributes no current line to anyone else.
- The listed scripts' runtime imports reach only the backend, the shared helpers,
  other pipeline files and MIT or Apache-2.0 npm packages. The Python and shell
  files use only the standard library and run other tools as separate programs.

What stays GPL, and why:

- The in-browser builder, USB link and configurator: the frontend bundles
  Elekloader's GPL kit, and `src/engine/` has outside contributions.
- The submission checks (`change-scope`, `release-approval`, `author-update-git`,
  `pr-ready`, `module-doctor` and the scripts that import them): they assemble the
  served catalogue with the kit's `parseCatalog` through `scripts/elekloader-vendor.ts`,
  which outside contributors co-wrote, and the outside contribution
  `scripts/machine-modules.mjs` imports `change-scope`. Moving them needs those
  contributors' permission and a catalogue check that does not link the kit.
- The firmware download and API bundle the GPL builder at run time. The developer
  MCP contains outside contributions. `build-utility-packages.py` is pinned by
  hash in approved packages and loaded in-process by GPL code, as
  `octatrack-qualify.py` is by seven GPL scripts.
- The Octatrack base, loader and SDKs keep their component licences.

## Contributions and maintenance

Contributions to the backend are submitted under ELv2. Contributions to an
inventoried shared helper are submitted under GPL-3.0-or-later OR Elastic-2.0.
Contributors retain copyright and must have authority to grant the applicable
licence; no copyright assignment or general permission for future relicensing
is implied. SDK/module contributions retain their declared licences.
Contributions to a listed pipeline file are submitted under ELv2.

A new tool the owner writes for the workflows, releases, builds, the device or
running the service can join `pipelineFiles` with the Elastic-2.0 header shown in
the listed files. `licenses:check` then refuses it if it imports GPL code, or if
GPL code imports it or loads it in-process (Python `importlib`, `exec`, shell
`source`); running it as a separate program is fine.

Run `npm run licenses:generate` after changing scope or notice inputs, then
`npm run check -- --base origin/main`. The licence check verifies the backend's
runtime imports against the explicit shared/data inventory and rejects backend
implementation imports from the production frontend. New cross-boundary imports
require an ownership/compatibility review; do not silence the check by adding
third-party GPL code to the shared inventory.

The public licence page includes this component scope and the full platform
terms alongside third-party notices. The native SDK notice bundle is kept
separate so this change does not alter module packages or their licences.
