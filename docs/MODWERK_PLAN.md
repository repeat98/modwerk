# Modwerk: plan of record (draft, 4 October 2026)

Octamod becomes **Modwerk** (modwerk.app): custom firmware for every Elektron machine, built locally from each owner's stock OS file. This draft records what the owner decided and what is still open. It is not yet a DECISIONS.md entry; AGENTS.md is unchanged until each phase is approved.

## Decided

- Rebrand to Modwerk. The owner is buying modwerk.app. octamod.app is public and must redirect, with a handoff for data that browsers keep per origin.
- Every Elektron machine appears. Machines with mods today (Octatrack 1.40C, Digitakt mk1, Digitone mk1/Keys) get SDKs in this repository. Every other machine gets a designed empty page that invites PRs.
- Digitakt/Digitone mods should combine as freely as octabam modules: one core per device, many linked mods, live clash checks and resource gauges.
- The UI is reorganized around the machine. The prototype is built on branch `modwerk/multi-device`, based on the forum branch (PR 64).
- Contributions stay PR-based. The owner cannot review everything, so maintainers must be able to update and moderate their own mods.
- 4 October 2026, SDK standard ([docs/SDK.md](SDK.md)):
  - Modwerk builds Digitakt/Digitone firmware with its own TypeScript engine, interoperable with `.elemod`; elekloader is only a local byte-comparison reference.
  - Module source lives in Modwerk module folders (or a pinned commit) and is compiled by Modwerk CI.
  - New machines use tiered evidence: author-hardware evidence to publish, and owner verification as a badge.
  - Modwerk's own code was GPL-3.0-or-later at this decision. The [9 October platform licensing decision](DECISIONS.md#independent-platform-backend-licensing--9-october-2026) supersedes this blanket statement: the independent backend uses ELv2, while the frontend and SDK/component licences remain as documented in [LICENSE](../LICENSE).
  - "Standalone firmware" is a shared library category for exclusive, uncombinable complete builds.

## Phases

1. **Forum first.** Merge PR 64 with `REGISTRATION_OPEN=false`, so no accounts are created under the old name.
2. **Rebrand.** A focused PR covering:
   - Names, notices, social preview, the Worker's app URL, CORS and CSP.
   - A Resend domain and sender for modwerk.app.
   - Renaming the repo to `modwerk` (GitHub redirects the old URL).
   - The octamod.app handoff (below).
   - Then open forum registration on modwerk.app.
3. **Devices in the UI** (prototype in progress). A device registry, a machine picker home, device pages, empty pages, a machine switcher, and configurations and stored firmware scoped to each device.
4. **Repo and SDK restructure.** `sdk/devices/<id>.json` profiles; `sdk/octatrack/` (today's `sdk/octabam/`); `sdk/digitakt/` and `sdk/digitone/` each with `core/`, `modules/` and `templates/`. `octamod.module.json` becomes `modwerk.module.json` with `device` and `maintainers`.
5. **Digi engine.** Build Digitakt/Digitone firmware in the browser with `.elemod` interoperability. The engine choice and licence are open (below).
6. **Maintainer self-service** (below).
7. **More machines** as research lands. A PR that adds a device profile or a first mod changes the machine's page automatically.

## octamod.app handoff

IndexedDB, localStorage and sessions belong to one origin. An iframe of octamod.app inside modwerk.app gets partitioned storage in current browsers, so it cannot read the old data.

- octamod.app must therefore stay a small top-level page, for example a separate Pages repository with that custom domain.
- On first visit, the page reads the local configurations (and, with consent, the stored base firmware).
- It then opens modwerk.app and passes them over `postMessage`, with strict origin checks on both sides.
- It keeps the old data until modwerk.app confirms receipt, then redirects every hash route to its new path.
- Firmware never leaves the device in this exchange.
- Guest sessions, and any forum sessions if the forum launches before the rebrand, need the same handoff or a fresh sign-in.

## Maintainer self-service, keeping PRs

The aim is that the owner reviews new modules, new maintainers and shared infrastructure once, and routine updates merge without the owner.

- **Maintainers in the manifest.** Each module lists `maintainers` (GitHub logins, optionally a forum username). A generated CODEOWNERS file maps each module folder to its maintainers. Changes to the maintainer list always need owner review.
- **Self-service lane for updates.** An update merges automatically when all of these hold:
  - the PR touches only one existing module folder;
  - its author is one of that module's maintainers;
  - the version strictly increases;
  - every automated gate passes: schema, licence, no firmware, reproducible build, resource budgets, required docs, media and evidence fields.
  - The bot merges after a cooling-off period (for example 48 hours), during which the owner or a co-maintainer can block it with a label.
- **Owner review lane:** new modules, new devices, cores and platform, SDK and tooling, the frozen baseline, and maintainer changes.
- **Easy updates.** When an author tags a release in their own repository, a workflow opens the version-bump PR in Modwerk, in the style of Renovate. A planned `module:update` command would open the same pull request from the author's checkout.
- **Channels.** Maintainers can publish `beta` versions that users opt into; promotion to stable uses the same lane.
- **Community moderation by maintainers.**
  - A maintainer links their forum account by listing it in the manifest (the merged PR proves GitHub identity) and confirming the claim from the account page. Both sides have to agree.
  - Linked maintainers get an Author badge on their mod's page and threads. They can hide or lock posts there and triage, answer and close their mod's bug reports.
  - The owner keeps global moderation; every action is recorded in private history.
- **Emergency pause.** A maintainer can pause downloads of their own module instantly from the website. Resuming takes a PR or the owner.
- **Device maintainers.** Trusted experts can own `sdk/<device>/` through CODEOWNERS and review that device's modules.

This replaces today's rules that the owner's merge is the only approval and that the owner verifies every report before merge. That change needs an explicit owner decision before AGENTS.md and DECISIONS.md are updated.

- 4 October 2026, follow-up:
  - Modwerk writes its own Digitakt/Digitone core, implementing the documented interface (`sdk/<machine>/core/interface.json`) so existing mods link unchanged.
  - The existing Digitakt/Digitone mods are imported as module folders under their licences ([import record](../sdk/imports/elemod-2026-10-04.json)).
  - No automatic merges for now; the owner reviews and merges every pull request.

## Open decisions

1. **Developer management and bug reporting across machines.** Machine-aware bug reports (Octatrack keeps `OCTAMOD.LOG`; other machines need their own log or a structured form), maintainer inboxes, and a developer view of each module's reports, ratings and releases.
