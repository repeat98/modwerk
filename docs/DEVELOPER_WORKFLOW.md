# Developer workflow and distribution

This is the common context for the **Start developing** page and its coding-agent prompts. Follow [Add or port a module](ADD_A_MODULE.md), [Author updates](MODULE_AUTHOR_UPDATES.md) and [Add a machine](ADD_A_MACHINE.md) for the implementation details. The concise page and complete copied prompt describe the same workflow.

## Choose an instrument

The instrument dropdown lists every profile in `sdk/machines/<id>/machine.json`, through the generated registry. A listing is not evidence that a module builder exists. Octatrack, Digitakt mk1 and Digitone mk1/Keys have published SDK guides; other instruments currently enter the integration flow: research the stock format/rebuild/recovery, integrate the SDK/core/toolchain/browser builder, qualify the exact build on hardware, and obtain owner review before publishing modules. Read the selected profile and its credited research. Do not apply another instrument's core slots, hooks, build commands or memory budgets by analogy.

## Submit a first release

1. **Prepare:** fork Modwerk, branch from current `main`, and build or port the module. Keep source pins, credits and licences; prepare the manifest/version/catalog, README/tutorial, release notes, real UI captures and matching stock-free packages.
2. **Verify:** follow the machine/category guide, regenerate metadata, run `module:doctor` and `npm run check -- --base origin/main`, and qualify the exact private source/build. Give the contributor concrete hardware steps and record only their actual results. Test different simultaneous instances and track/FX-slot/DSP-core isolation and Part/project/physical-reboot persistence where applicable. Emulator project loading is not physical reboot evidence.
3. **Submit:** commit, push and open a Modwerk PR. Follow checks and fix failures. Every new module currently needs owner review; the first approved release registers its GitHub author for later scoped updates. Website sign-in or claiming does not grant release authority.
4. **Publish and verify:** after owner merge, follow the exact commit's site/API deployments. Confirm the live version, save a compatible firmware download, and verify its version/source identity and deterministic hash where applicable. A push, merge or ready/download-requested state alone does not prove a saved release download.

Keep firmware, extracted stock bytes/tables, dumps, projects/cards and complete built images private. Submit only original or properly licensed source/media and approved stock-free module packages. Keep the previous approved download available while a new release is pending or failed.

## Update or fix an approved module

Read the report and reproduce it where possible. Change the module, explicitly bump its semantic version, and synchronize the catalog pin, shipped packages, docs and version-matched release notes. Pushing commits neither increments the version nor publishes the frontend.

The registered author personally verifies the exact source, rights, UI and qualification evidence. Missing, failed or untested required hardware acceptance checks block automatic publication. An agent records only reported results and never attests on the author's behalf without that actual verification. Editorial updates retain approved evidence only through the documented checked path.

Open a PR against Modwerk `main` and include the two exact opt-in checkboxes from [Author updates](MODULE_AUTHOR_UPDATES.md#prepare-the-release). Leave them unchecked until the author personally verifies the evidence and opts in. Successful exact-head/base checks and scope verification permit bot merge and site/API publication for updates to that author's approved modules. New modules, shared SDK/builder code, ownership/licence changes and exceptions still require owner review.

Follow checks, the author publisher and deployments; then verify the live version and an actual saved compatible download. For a reported fix, obtain actual version-matched results from the author's unit before resolution. Use `Related to #<number>` in PRs rather than merge-time closing keywords.

## Manage reports on GitHub

Public reports and GitHub replies share a thread, with replies/status synchronized to Modwerk. Replying, closing and reopening need no fork; code changes use a fork and PR. Registered authors post commands as **new comments** on their module's mapped public reports:

```text
/modwerk resolve <published-version> verified-download
/modwerk close configuration <public explanation>
/modwerk reopen <public explanation>
```

A report titled `[configuration] …` covers a whole saved configuration and lists its modules; every module's registered maintainer can use `close` and `reopen` on it. Name the module in `resolve`, `/modwerk resolve <module-id> <version> verified-download`, because the fix ships in one module; it closes the whole report.

Use `resolve` only after the exact published download and hardware fix have actually been verified. Push and merge alone leave the report open. Other closure reasons are `duplicate`, `not_reproducible` and `withdrawn`; these claim no firmware fix. GitHub-only issues use authorized native GitHub closure. Private details remain access-controlled and consent-based.

Verify GitHub status, Modwerk synchronization and reporter notification. Release completion uses the existing idempotent follower/downloader fanout, preserving opt-outs and push/email preferences. Report actual queue counts separately from provider acceptance or delivery/digest delays; do not create another scheduler or send a separate blast.

## Separate catalogues and current builders

| Project | Role |
| --- | --- |
| Octabam | Octatrack source modules and native firmware remixer |
| Modwerk | Reviewed catalogue and browser firmware builder |
| Elekloader | Its own loader/shop/frontends and reusable builder kit |

Publishing in one catalogue does not automatically list the module in another. Submit or port directly to Modwerk through a PR; an Elekloader shop listing is optional. Authors can keep research/source in their own repository and submit a pinned release to Modwerk when ready. Users of published modules just select modules, build locally from their own stock OS, save the firmware and flash their unit; they need not develop modules.

Today Modwerk's Octatrack path uses Octabam-derived tooling, and Digitakt/Digitone use the vendored Elekloader builder kit. Sharing builder code does not combine catalogues or retire Elekloader's frontend.

**Planned, not active:** one shared Elekloader-based builder will replace Modwerk's two current builder paths. Verified developers will also be able to publish entirely new modules without another owner approval. Neither roadmap item changes today's first-release, integration, qualification or author-update gates.

The shared machine entry point and private Octatrack format-2 verification now exist. The [Octatrack migration record](OCTATRACK_ELEKLOADER_MIGRATION.md) names the source ports, actual parity results, remaining cutover requirements and proposed USB update path. Public Octatrack builds continue through the approved composer while these requirements are completed.

After publication, authors can verify their developer account, claim their module and add, change or remove a Ko-fi link in Creator settings. Preserve the existing cup/dialog flow and per-module ownership checks; see [creator support](APP_DEVELOPMENT.md#module-creator-support).

## Share what you learn

The guides are the context every prompt and agent reads, so a finding that helps all development belongs in them, not only in a session, a PR comment or private notes. Examples: a trap in the shared builder, a tool that behaves differently than its help says, a measured budget, a step a guide omits or states wrongly. Put it in the file a reader would open for that task: the category guide under `docs/module-guides/`, [Add or port a module](ADD_A_MODULE.md), this page, or `AGENTS.md` when it affects every task. Because the prompts point at these files, no prompt change is needed for a new lesson. A rule that must reach every contributor's agent without a file being read goes in `DEVELOPER_RULES`.

- Correct a stale or wrong statement instead of adding a contradicting one. Keep the entry short and general, and say a hardware behaviour only as observed on a named build, otherwise "not tested".
- Keep it stock-free: no firmware bytes, code, tables or dumps. `sdk/octabam/AGENTS.md` stays unchanged because octabam's code cites it; put Modwerk-specific traps in a Modwerk guide.
- Send it as its own docs-only pull request. Inside a module release it is outside a registered author's scope and would remove the update from the automatic path, and one pull request should hold one piece of work. Docs-only edits use the lightweight checks. The owner reviews the wording, and the agent tells the contributor what it added.

## Keep the prompt and page aligned

`src/community/developer-guidance.ts` supplies shared readable flow steps and full prompt guidance; `starter-prompts.ts` adds task/instrument/category instructions and repository reading paths. Keep the frontend to one configurable copyable prompt, a short visual flow and compact ecosystem context. Full requirements, release checkboxes and issue commands belong in the base prompt, with the long preview collapsed by default. Keep personal owner names out of this page and its prompts. Populate instruments from the registry rather than maintaining a second list, and send machines without SDKs to integration prompts with existing reading paths.
