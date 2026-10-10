# Module folder and website contract

Existing published module authors may use the [automatic author-update workflow](MODULE_AUTHOR_UPDATES.md): verified ownership, changes confined to their modules, explicit evidence review and successful checks on the exact source/base permit bot merge and publication. Other changes retain owner review. Existing qualification gates and exact-version owner exceptions are unchanged.

A module is a folder under `sdk/octabam/modules/<id>/` containing native source, `manifest.py`, `octamod.module.json`, README, TESTING, licence and real OT UI screenshots (audio is optional). The steps are in [Add or port a module](ADD_A_MODULE.md); this page is the field reference for `octamod.module.json`. Submissions and all updates use PRs; merging the PR is owner approval. No direct module upload or separate website approval remains.

## Schema version 2

[The downloadable template](../public/module-repository.example.json) and `src/catalog/module-contract.ts` define the strict contract. Unknown fields, missing sections, invalid versions, unsafe paths, impossible control defaults, mismatched label counts and invalid media declarations are rejected. Source is never executed by metadata validation.

| Field | Required content |
| --- | --- |
| id, key, name, version, category | Stable folder/build identity, readable name, semantic module version and category |
| author | GitHub author login, optional display `name`, and complete credits; names never replace GitHub links or issue-routing logins |
| source (optional) | Exact per-module HTTPS GitHub repository, 40-character commit and source directory; required for pending imports |
| build (optional) | `status: pending` and a user-facing reason; source import does not imply browser/native qualification |
| nativeManifest | `manifest.py` beside this file |
| presentation | Library summary, page overview, family/label, highlights and practical usage |
| access | OT location, prerequisites, exact button/menu steps and declared screenshot paths; narrow no-UI declaration for automatic USB modules |
| controls | Every active control: name, default, count, description, labels or null |
| compatibility | Original OS 1.40C, location, conflicts and explicit limitations |
| resources | Storage/processing label, display, optional numeric value, unit, evidence method, exact conditions/source; unknown numbers are null |
| tests | TESTING path, honest result summary, hardware status, exact evidence commit and declared gates |
| tests.qualification | Mandatory for new modules/updates: this version/source/image identity, worst-case cycles under modulation, exact memory regions/totals, attributed owner-reviewed hardware evidence, complete README/tutorial and real black-and-white documentation screenshots; see [qualification gates](MODULE_QUALIFICATION.md) |
| license | SPDX expression, local licence file and accurate source/media declaration |
| media | Relative path, hardware/emulator/audio type, caption, alt text, credit, licence and original/source provenance; `otUi` page, version, local build hash and setup for OT captures |

A display string may report a range or several quantities while its scalar value stays null. `method: unmeasured` forbids a numeric claim. Static prices and emulator instruction counts are not hardware percentages. Historical hardware results do not qualify a later revision.

These display fields retain existing-module evidence and may describe an incomplete draft. They cannot substitute for `tests.qualification` on a new submission or update. The [qualification template](../public/module-qualification.example.json) starts incomplete and deliberately fails validation until populated with actual results. Required counts are integers; memory words/bytes and allocation totals must agree; maximum cycle load must fit the declared budget; hardware must have owner-reviewed test evidence, labelled with actual coverage and limitations, with no minimum duration or track count. The tested-source hash is recomputed without executing source, and text reports must exist and contain evidence. The reviewer verifies the actual test results before merge: the owner for first releases, the registered author for scoped updates.

## Build and version checks

`npm run modules:generate` validates source folders and writes `src/catalog/module-documents.json`. It also derives `src/catalog/compatibility-checks.json`, the compact form of the native declaration checks the site ships, from `src/catalog/native-metadata.json`, which the exporters keep writing, and `src/catalog/compatibility-pairs.json`, the module pairs those checks record as passing. Pair rules on every page read only the small pairs file; the full checks load with the configuration page's compatibility panel and in the firmware worker. The module library, pages, controls and resource explanations consume that generated content. `sdk/catalog.json` lists the modules the site offers, each at an exact version. Its `sourceRevision` is the native composition pin; per-module `source` pins identify imports separately. New source folders do not silently enter the configurator.

`npm run modules:check` rejects stale generated content and missing local documentation/media. `--base origin/main` also requires a strictly greater semantic version whenever the module's code changes (source, native manifest, licences or the manifest's build fields); documentation and media edits need none. PR CI runs it against the exact base SHA. New or changed module folders and modules newly added to the catalog also require version-matched real OT UI location/control captures and access instructions; unchanged legacy publications remain readable. Verified editorial updates may retain real UI captures with their original tested-version/build provenance. See [the capture workflow](MODULE_UI_CAPTURES.md). Sources, docs and media are reviewed together. No `.bin` or `.syx` file belongs in the source or media folder. No symlink may escape the folder.

Qualification is enforced even without `--base`, during generation and release validation. [The frozen 2 October 2026 baseline](../sdk/module-qualification-baseline.json) preserves the eleven existing modules only while their version and complete folder fingerprint match. Any file change loses that exact exemption; a new ID cannot inherit it. Editorial-only updates can instead use the approved-history, byte-identity checks in `tests.retainedEvidence`; runtime/resource changes still require full qualification. See [risk-based update checks](MODULE_QUALIFICATION.md#risk-based-update-checks--3-october-2026). PR checks prohibit rewriting or expanding the baseline once it exists on the base branch. Pending imports, suspensions and download restrictions remain independent of this grandfathering policy.

## Temporary frontend availability

As of 1 October 2026, Spectrum, Modulation and Character are temporarily hidden because of reported audio crackling. `src/catalog/availability.ts` controls this suspension. The original seven modules, source provenance and saved configuration pins remain intact. Suspended modules cannot be added or validated for a build through the frontend; older configurations remain readable and identify the modules that must be removed. Reinstatement requires a verified fix and owner approval.

## Publication

An owner merge or independently verified scoped author merge is approval for the exact update. The subsequent release must compile original/licensed code in isolation, record the merged commit, module versions and checksums, and preserve the previous release if a build fails. Release packages must reproduce the locally verified source packages; generating web content alone does not install arbitrary third-party code. Stock firmware must never reach automation or the community API.
