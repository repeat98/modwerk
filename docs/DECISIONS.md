# Architecture decisions

## Repository and source provenance

The React frontend, community API, Octamod SDK, module sources, developer documentation and release tooling live in one repository. The SDK is a distinct directory and developer entry point. Preserve upstream octabam provenance, module authorship and applicable licences. Firmware, downloads, native build outputs, caches, secrets and local development notes do not belong in the public source tree.

Module page content comes from `sdk/octabam/modules/<id>/octamod.module.json`, generated through `scripts/modules.mjs`. Keep the strict schema, README, TESTING, licences and version pins synchronized.

## Hosting and API boundary

GitHub Pages serves the static frontend, supporting project URLs and root/custom-domain URLs. Hash routes work without server-side rewrites. Releases must come from an exact owner-merged PR commit; manual runs must prove the same approval.

A separate Cloudflare Worker with D1 serves the initial community backend. R2 remains an optional media store; reviewed module media is served with the static site, so the current Worker has no R2 binding. The frontend uses a configurable public API URL. Same-origin Cloudflare Pages remains a supported fallback.

Keep the HTTP contract independent of the hosting provider. A future self-hosted backend can use SQLite and file/object-storage adapters; these adapters and a self-hosted entry point remain unimplemented. Keep the core experience free of paid dependencies and within initial hosting free-tier constraints.

Cross-origin account requests use a signed session in a bearer header, without third-party cookies. CORS and mutations are restricted to the configured frontend origin. No session token appears in a URL. See [app development and operations](APP_DEVELOPMENT.md) for setup.

## Local firmware and build qualification

Firmware stays on the user's device throughout import, persistence, composition and download. Verified original OS 1.40C is stored in browser IndexedDB, revalidated on restore and removable from the device. Firmware never enters uploads, synchronization, logs or configuration exports.

Never distribute Elektron firmware, extracted routines/tables or stock-containing generated artifacts. Derive stock content from the user's own verified file at composition time. SDK automation compiles original or properly licensed module source only, without firmware.

Configuration builds perform compatibility, placement and packaging integrity checks. They do not run the octabam stress/emulator suite. Downloads require real browser composition, native byte-parity and rejection evidence and container validation. The active path composes verified selections without the dynamic DSP loader, which remains disabled after its hardware failure. Byte parity does not establish hardware safety. See [verification status](VERIFICATION.md) for evidence and remaining qualification.

## Contributions and approval

New modules, updates, documentation and media are submitted through GitHub pull requests. Owner merge approves that exact module version; there is no second website approval step. Every source, documentation, evidence or media change requires a strictly greater semantic version. Pending or rejected updates and failed release builds preserve the previous approved publication. Public firmware builds and downloads must remain enabled for every visible module. Develop and verify pending core/module updates on their own branches; do not merge a global download pause to represent review progress. Keep the deployed approved implementation until its replacement is ready. The release checks in `src/engine/download-policy.test.ts` enforce public download enablement and buildable compiled versions.

Approved packages bind source commits, versions, compiler records and immutable artifact hashes. No arbitrary repository code runs in the website or metadata importer. Isolate source compilation from network, credentials, firmware and publishing rights; publish only packages reproduced from the reviewed source.

New modules and updates with an OT UI require actual location/control screenshots and manifest access steps, with version/build/setup provenance. Automatic USB modules without an OT page use the narrow reviewer-verified exception. See [OT UI captures](MODULE_UI_CAPTURES.md).

On 2 October 2026, the owner required hard gates for worst-case cycle counts under parameter modulation/mode changes/maximum load, exact memory accounting, and passed real-hardware stress-project evidence. `tests.qualification` binds numeric counts, budgets, memory regions/totals and hardware records to the submitted version, native-source hash and local image hash. The owner subsequently removed the mandatory one-hour/eight-track requirement on 2 October 2026 and accepted attributed functional hardware reports, labelled as reported with explicit unknowns. Detailed passed stress records remain supported; failed checks still block that record form. Local/PR/release validation rejects missing or inconsistent evidence; the owner verifies actual reports before merge. Release additionally requires complete module documentation, a short practical tutorial and real PNG screenshots matching the black-and-white/gray style of the online modules. The gate checks populated README sections, matching tutorial steps, screenshot references and actual monochrome pixels; yellow captures fail. The owner verifies documentation completeness and authenticity. Metadata validation does not perform the physical test.

The eleven current module versions and complete folder fingerprints are retained through a frozen baseline, with existing measurements, historical labels, suspensions, pending builds and download restrictions intact. Later source, documentation or media changes lose the exemption and must qualify. Never expand/rewrite the baseline or invent missing measurements. See [the qualification contract](MODULE_QUALIFICATION.md). Visitor builds remain lightweight and never run the qualification suite.

Require original or properly licensed sources and media, attribution, contributor declarations and reviewer verification. Distinguish illustrations, emulator evidence and hardware results. Review is not automatic legal clearance. See [contribution rules](../CONTRIBUTING.md).

## Registered community and private administration — 3 October 2026

The owner superseded the earlier guest-only/no-email decision: public reading stays account-free, while threads, replies, comments, ratings, likes and issue reports require a verified account. On 4 October 2026 the owner also requested Google, GitHub and Discord community single sign-on, member-only firmware builds, editable public profiles and self-service account deletion. Better Auth provides password hashing, verification, social authentication, recovery and revocable sessions behind a restricted API facade. PR authentication happens on GitHub itself. See [account access and SSO](SINGLE_SIGN_ON.md).

The forum has general discussion, module help, public bug reports and immutable shared configuration snapshots. Existing private issue reports remain private and are never migrated by matching display names. New accounts cannot claim historical guest content. Config snapshots contain only named module selections, versions and chooser settings; firmware stays local.

Keep octamod.app registered at Hetzner. Domain registration alone does not provide a transactional mail service. Resend is the initial mail adapter for verification/recovery only, with secrets in the Worker and DNS verification at the registrar. This change does not authorize DNS edits or deployment. See [forum operation and security](FORUM.md).

Administration uses separate server-side authorization. Every administrator route must reject access without valid backend authorization. Moderation history remains private; reporters can list only their own reports on the site. Do not expose private routes or use frontend-only access checks.

On 3 October 2026 the owner chose to mirror issue reports to public GitHub issues so module authors see and answer them directly. Before that, reports were private and passed on by the administrator. The owner also chose to require the on-device `OCTAMOD.LOG` in reports, with an explicit stated-reason escape (for example, a unit that does not boot), and a step-by-step tutorial in the form. Reports carry structured configuration context. The form tells reporters that their name, report, module list and log are public. Logs must pass the strict OCTAMOD.LOG grammar; binary firmware and arbitrary file attachments are rejected. Authors still need no website sign-in: GitHub provides identity and notifications. The owner clarified that the [logger](../sdk/runtime/logging/README.md) is mandatory core infrastructure in every composed build, never a module or catalog entry. Logging uses bounded RAM records and throttled card checkpoints. The owner subsequently explicitly approved all current module versions and the logger for release, lifted the logger addition’s qualification restrictions, authorized firmware/DSP testing here and waived hardware testing. Keep the logger in downloadable builds, preserve lightweight build rejection/integrity checks, and report unmeasured timing and hardware limits honestly. This exception applies to this logger addition; it does not expand module qualification baselines or authorize firmware redistribution.

The account/forum draft preserves structured reports and strict device-log validation but keeps new account reports private. It grants no GitHub publication permissions and blocks private-report retries; previously published GitHub links and status synchronization are retained. Re-enabling public mirroring requires a separately reviewed consent workflow. This limitation follows the automatic approval review during forum integration, not a new owner decision.

## GitHub developer access and machine-aware community — 4 October 2026

The owner explicitly requested GitHub login to claim/manage modules, superseding the earlier restriction on website GitHub sign-in for this developer flow. The reviewed module author/maintainer handle plus a verified stable GitHub identity permits claiming that module. Developer access is separate from verified email membership and administrator access; no GitHub email or repositories are requested. Maintainers receive only reports their authors explicitly share, can reply and resolve/reopen, and lose access when sharing is withdrawn, the claim is revoked or the reviewed maintainer list changes. Historical private reports remain unshared. Updates remain owner-reviewed PRs, without automatic publication. See [DEVELOPER_WORKSPACE.md](DEVELOPER_WORKSPACE.md).

Digitakt/Digitone now use machine-specific community module IDs, immutable configuration sharing and structured private reports without Octatrack-only fields/log requirements. Octatrack keeps its existing context/log validation. Firmware and arbitrary attachments remain rejected.

## Catalog scope and pins

The catalog scope is Spectrum, Modulation, Character, Mini Verb, Tape Echo, Euclid and Repitch, plus Analog BD, MIDI Scenes, USB Audio (tracks + MAIN/CUE) and Scale Quantizer and OctaKit and TapeHead (requested on 2 October 2026). Include their required internal platform dependencies; other octabam modules remain outside scope. Scope does not imply current availability or hardware qualification: Spectrum, Modulation and Character are temporarily suspended. See the app guide and verification record for current supported selections and hardware limits.

The original seven retain their initial native composition revision `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. The four additions are imported from octabam revision `363861e31ee963c478fab2b190a0fabe1d7ce37b`; MIDI Scenes retains its author's `63ca127bc99638602957f2b05747f8ed3bd9ba52` (1.40MIDISC8.2), and Quantizer retains `525f4b19b04dc3ba3f3bae3b25abbf48df34a10a` (v2.9).

OctaKit is staged outside native discovery and the public catalog under `sdk/drafts/octakit/`, pinned to octabam `8d0ad6f4f82c2efbc10e1c65eefbce0ad1cec4bf` and June Kiff's `emuyia/ems-octakit` at `c6d3f3927b13fda0cf03711157237b837acdb1f9` (`ot-26914-152100`). Authored runtime source, licences and the sparse local reconstruction recipe are retained as regular text files; no stock bytes, generated runtime, firmware or extra modules are imported. See [the draft](../sdk/drafts/octakit/README.md) and [source identities](../sdk/imports/octakit-8d0ad6f.json). It requires current-version cycle/memory/hardware qualification, documentation/tutorial and real OT UI evidence, owner review and browser/native integration before promotion. Existing proofs do not cover it, and the frozen eleven-module baseline remains unchanged.

CC Map and Preview Vol, requested on 2 October 2026, are released at `0.1.2-experimental` in native discovery, source-only compilation and the frontend catalog. The owner explicitly approved these two exact source versions with software verification and chip timing marked unmeasured. The immutable two-entry waiver is separate from the unchanged eleven-module baseline; hardware stress remains untested and later updates require full qualification. Both have original thumbnails, complete tutorials and actual monochrome MKII LCD captures preserving their original source/build provenance. Native/browser parity and complete upgrade identities pass. Preserve Sam Banks’ MIT CC Map source and the pinned octamad Preview Vol provenance. CC 68–73 map FX1 SETUP controls; the upstream FX2 block requires BusDelay/BusVerb, still outside scope. See [the qualification exception](MODULE_QUALIFICATION.md#owner-approved-cc-map--preview-vol-exception--2-october-2026), [CC Map](../sdk/octabam/modules/cc-map/README.md) and [Preview Vol](../sdk/octabam/modules/previewvol/README.md).

USB Audio uses the output-only TRACKS MAIN CUE implementation and its internal USB MIDI dependency under `sdk/octabam/platform/usb-midi/`. This choice follows documented MKI/MKII hardware coverage, sustained multitrack captures and concurrent MIDI traffic; it is not a new comparative hardware test. USB input and other output layouts are outside scope. Preserve documented startup artifacts, host coverage gaps and alignment limits.

The additions retain their own source pins and separate loader-free composition, packaging and rejection evidence; the original seven modules' historical proofs do not cover later integrations by themselves. No firmware/DSP/emulator/stress tests ran during the source import. See [the import record](../sdk/imports/octabam-363861e.json), each module's TESTING.md and the [current verification record](VERIFICATION.md).

## Every Elektron machine — 4 October 2026

The owner expanded the project from the Octatrack to every Elektron machine. The site will move to modwerk.app in one combined launch with the forum. Recorded decisions:

- **One standard for every machine** ([SDK guide](SDK.md)):
  - Each machine has a validated profile in `sdk/machines/<id>/machine.json`, which generates the site's machine registry.
  - Modules for elemod machines use contract v3 (`modwerk.module.json`). Octatrack modules keep contract v2 and the frozen eleven-module baseline until their next version.
- **Library categories** are shared by every machine. **Standalone firmware** is an exclusive category for complete builds that never combine with other mods.
- **Digitakt and Digitone:**
  - Modwerk builds their firmware with its own TypeScript engine and its own core, implementing the documented core interface (`sdk/<machine>/core/interface.json`).
  - elekloader is used only locally, to compare bytes.
  - Module source lives in Modwerk module folders (or a pinned commit) and is compiled by Modwerk CI.
  - The existing mods are imported under their licences, with attribution ([import record](../sdk/imports/elemod-2026-10-04.json)).
- **Patch sites** name an address, a length and the SHA-256 of the expected stock bytes; stock bytes never enter the repository. Steps that need the stock OS run only in the owner's local build.
- **Evidence on new machines is tiered.** Publication needs measured memory and load, the author's hardware report and actual screenshots. Owner verification is a badge.
- **Downloads** for a machine stay disabled until its engine and core pass verification. Digitakt and Digitone builds must work at the combined launch.
- **Contributions** remain pull requests reviewed and merged by the owner. Maintainers named in a manifest are a module's contacts. There are no automatic merges for now.
- **Licence:** Modwerk's own code is GPL-3.0-or-later. Vendored components and modules keep their licences.

## Digitakt/Digitone builds use elekloader's builder — 4 October 2026

The owner froze Modwerk's own Digitakt/Digitone builder and chose elekloader's builder for the combined launch, so work can focus on the interface and the launch.

- **Vendored builder.** [`vendor/elekloader`](../vendor/elekloader/README.md) holds elekloader's unchanged Python package and web bridge at a pinned commit, its release cores and the five shop mods' author release files, each pinned by SHA-256. Pyodide runs it in a browser worker that loads only from the site. Owners' files stay in their browser.
- **Parity target.** Builds must match elekloader's online builder. Modwerk keeps its own interface; elekloader's site is not copied.
- **Own builder later.** The original core and TypeScript engine stay frozen at their recorded state ([verification record](VERIFICATION.md)). Work resumes later with the same target: a builder that matches elekloader's online builder.
- **Downloads** of Digitakt/Digitone files need the owner's separate approval. Checking and building already run locally.
- **Licences.** elekloader, the cores and DIGISLICER, NEIGHBOR and digihealth are GPL-2.0-or-later; SOPHIE is MIT; Pyodide is MPL-2.0 with CPython under the PSF licence. Their notices ship with the site. Modwerk stays GPL-3.0-or-later.

## Domain and mail: modwerk.app — 4 October 2026

The owner bought modwerk.app on 4 October 2026. It stays registered, with its DNS, at Hetzner, like octamod.app; the earlier decision about mail stands: Resend sends verification and recovery messages only, with its key and sender as Worker secrets and its DNS records at the registrar.

The community API keeps trusting exactly one origin, set by `APP_URL`; the launch moves it from octamod.app to modwerk.app with the Worker, the sender and the Pages custom domain in one ordered cutover. octamod.app is not retired: it becomes a plain redirect to the same path on modwerk.app, so shared links and mail links already sent keep working. Browser storage is per site, so saved configurations are not carried over; the move is announced first so people can export them.

Whether the public support contact becomes a `support@modwerk.app` forwarder is left to the owner; the Gmail contact chosen on 3 October stays until a forwarder is proven. Nothing in the repository edits DNS or a provider account. The order, records and checks are in [DOMAIN_AND_MAIL.md](DOMAIN_AND_MAIL.md); `npm run domain:check` reads public DNS and pages to report progress.


## 4 October 2026 — Bug Reports forum and automatic developer delivery

The owner requested that issue reports reach developers and appear in the Bug Reports forum. New module forms disclose public posting before submission and explicitly request `visibility: "forum"`. A transaction creates the forum thread and scoped developer notifications alongside the private report. Public fields are the title, reproduction details, device/base OS and affected module version; full configuration, build fingerprint, log/missing-log notes and private replies stay authorized. Developer notification and follow recipients require current reviewed maintainer metadata and an active GitHub-verified claim. Reports submitted through older clients and all existing private reports remain private. Resolution/reopening synchronizes both records. Migration 0020 adds the nullable forum link; no production rollout is authorized by implementation.

## Digitakt II / elekloader PR #38 — 4 October 2026

The owner requested [elekloader PR #38](https://github.com/irpina/elekloader/pull/38), including Perform Direct. Pin the native Digitakt II loader changes to toonst/elekloader `71a5156781838fb5ef1c3e963b3949b781043a0d` as draft-only overlays; all remaining files match the existing vendored baseline. Preserve the approved public Digitakt/Digitone browser engine and core/mod artifacts unchanged while new-machine qualification is pending. Add read-only local OS 1.17 verification and machine research progress credited to the upstream reports. Stage core-dt2 and Perform Direct under `sdk/drafts/`, with hash-only stock guards, original artwork, full tutorial and actual capture provenance. Pending modules stay outside discovery, compilation CI and the public catalog. Digitakt II downloads require the existing qualification and actual browser/native parity/rejection gates; this request supplies no waiver. Do not modify the frozen eleven-module baseline or run firmware/DSP tests in ordinary application checks.
