# Developer workflow and distribution

This is the common context for the **Start developing** page and its coding-agent prompts. Follow [Add or port a module](ADD_A_MODULE.md), [Author updates](MODULE_AUTHOR_UPDATES.md) and [Add a machine](ADD_A_MACHINE.md) for the implementation details. The concise page and complete copied prompt describe the same workflow.

## Choose an instrument

The instrument dropdown lists every profile in `sdk/machines/<id>/machine.json`, through the generated registry. A listing is not evidence that a module builder exists. Octatrack, Digitakt mk1 and Digitone mk1/Keys have published SDK guides; other instruments currently enter the integration flow: research the stock format/rebuild/recovery, integrate the SDK/core/toolchain/browser builder, qualify the exact build on hardware, and obtain owner review before publishing modules. Read the selected profile and its credited research. Do not apply another instrument's core slots, hooks, build commands or memory budgets by analogy.

## Check what already exists

Before planning a new module, look at the library on modwerk.app or, in an up-to-date checkout (`git fetch upstream`), `sdk/catalog.json` (Octatrack), `sdk/digitakt/modules/` and `sdk/digitone/modules/` (Digitakt, Digitone) and `sdk/drafts/`, plus the open pull requests (`gh pr list`). If a module already does the job, or a port is already listed, extend it through [the update workflow](#update-or-fix-an-approved-module), with [its author's OK](#ask-the-author-first), instead of building a duplicate. A new module goes ahead only when it is clearly different, and the proposal says how.

## Refuse infringing work

Decline a machine, effect or other module that breaks the [modding guidelines](../MODDING_GUIDELINES.md): one that copies someone else's protected work (another product's source code or firmware, factory samples or recordings, artwork or a trademarked name, or a port without its author's permission or a licence that allows it), unlocks what a maker sells or keeps for another model, carries one instrument's firmware code, tables or sounds into another, or needs a maker's encryption or signature broken. Say why in a sentence or two and offer an original take on the sound or behaviour. Ideas, techniques and published algorithms are free to use; copied code, samples and branding are not. When the source or licence is unclear, ask for them before writing anything.

## Your development setup

Most work runs through three things: the developer MCP for the site, the instrument itself, and the emulators when the instrument is not at hand.

**The developer MCP.** `npm run --silent mcp -- --data-dir PRIVATE_DIR` starts a local MCP server that gives a coding agent the site's own code: the catalogue and module pages, compatibility and USB package checks, saved configurations, the API (reads by default, writes only with `--allow-api-writes`) and saved firmware downloads. Register it with the agent as described in [the MCP guide](FRONTEND_MCP.md). It runs on macOS, Linux and WSL; native Windows is refused for now.

**On the instrument (recommended).** Working on the unit is a little riskier than an emulator, but more rewarding: it is the real behaviour, and only results from a real unit qualify a module. It has been safe so far. Modules load into RAM, a power cycle restores the stock state, and the safety rules below (no saving over the owner's project, ask before a power cycle or a flash) have kept every development unit intact.

- *Octatrack:* with the Modwerk base on the unit and its USB connected, start the USB bridge and give the MCP its socket (`--device-socket`; [Then test the connected device](FRONTEND_MCP.md#then-test-the-connected-device)). The agent can read status, inventory and load, and with `--allow-device-writes` review, trial, Keep or Undo without a card copy or reboot. A candidate base with feature 512 supports whole-set transactions; older bases support one change. Qualify the exact candidate on hardware before release. [Driving the Octatrack](OCTATRACK_DRIVING.md) has the session, panel steps and safety rules, and the [hardware traps](OCTATRACK_HARDWARE_TRAPS.md) say what has gone wrong on real units.
- *Digitakt, Digitone and every other machine:* there is no live link yet, and the aim is to give each one [the Octatrack's interface](ADD_A_MACHINE.md#aim-for-the-octatracks-interface). Build the firmware, send the `.syx` with Elektron Transfer, and test on the unit ([Digitakt guide](../sdk/machines/digitakt/README.md#flash-and-recover)). Building a USB interface for the machine is recommended and is the bigger win: the [runtime loader](../sdk/runtime/loader/README.md#porting-to-another-machine) does not depend on a machine, so a ColdFire machine needs its glue and a USB transport like the Octatrack base's, and then the MCP device tools can drive it the same way. That is shared SDK work and needs owner review.

**In the emulators.** Emulators only approximate the instrument. Use them for fast iteration without a unit, or for UI captures: `ot_emu` for the Octatrack, built from the octabam checkout that `npm run upstream:tools` keeps outside Git, digiemu for the Digitakt and Digitone mk1 at the revision [the capture guide](MODULE_UI_CAPTURES.md) pins, and [rytm-emu](https://github.com/trigcondition/rytm-emu) for the Analog Rytm MKII ([its captures](MODULE_UI_CAPTURES.md#analog-rytm-mkii)). All three run your own stock OS, which stays on your computer. An emulator run proves the code paths it exercised, never audio, timing, saved-project survival or a physical reboot; record it as emulator evidence and keep the hardware checks open.

For a Modwerk Octatrack base, use [the adapted emulator builder](../scripts/octatrack-emulator/build.py), which bounds the relocated idle loop precisely while leaving upstream files unchanged. The plain port's guessed detour range can skip initialization and leave task `p1b` absent. On private base `d41ede89` (24 October 2026), the plain port failed the M6a startup gate and the adapted port passed it; that startup result alone does not qualify project loading or USB. When driving a USB trial in an emulator, schedule HELLO keepalives against emulated time as well as host time: accelerated panel runs can trigger the normal host-silence Undo before a wall-clock timer fires. Verify the trial phase before expecting contributed controls.

## Make it mergeable

Keep source worktrees in a persistent location, such as the ignored `.claude/worktrees/` directory. macOS can clear `/private/tmp` on restart, including uncommitted worktrees; reserve it for reproducible builds and logs, and preserve needed evidence separately.

Submit only what the owner can merge as it is, and what the bot merges on its own for an author update. Run this before every push, and again after you merge `main`:

```sh
npm run pr:ready                       # a new module or any other change
npm run pr:ready -- --author <login>   # a registered author's update: also the bot's merge scope
```

It fetches Modwerk's `main` (from `upstream` when your fork has it, else `origin`), refuses uncommitted changes and a branch that does not contain current `main`, regenerates the catalogues and licence notices, and runs the same `npm run check -- --base <main>` CI runs. With `--author` it also runs the scope inspection the author-update bot runs and says whether the bot can merge the update, and if not, why. Fix what it names until it says **Ready**, then push and watch the PR with `gh pr checks <number> --watch` until every check is green.

These stumbling blocks have each cost a contributor and the owner a repair round:

- **main moved.** An author update merges automatically only when its CI ran against the current `main`; the scope job's name records both commits. When `main` moves first, merge it, run `pr:ready` again and push.
- **A narrow clone kept a stale ref.** `pr:ready` updates the remote's `main` tracking ref even in a single-branch clone. A manual `git fetch origin main` can update only `FETCH_HEAD` under a narrow fetch refspec; fetch `refs/heads/main:refs/remotes/origin/main` before following a `git merge origin/main` instruction in that setup.
- **Stale generated files.** `src/catalog/module-documents.json` and the compatibility files go stale whenever `main` moves under your branch. `pr:ready` regenerates them; commit what it names. Never edit them by hand.
- **Letter case.** macOS and Windows find `Foo.s` when you wrote `foo.s`; Linux CI does not. `modules:check` refuses a manifest path in the wrong case, but not an `.include` line inside an assembly source, so check those yourself.
- **A merge that breaks the code.** Merging `main` can leave a duplicate declaration or a stale call without any conflict marker. `pr:ready` runs the full check after the merge for exactly this reason.
- **Two pieces of work in one PR.** A guide edit, shared code or another module inside an author update takes it off the automatic path; send a finding, fix or improvement on a different pull request ([Fixes and improvements](#fixes-and-improvements)).
- **The first failure hides the next.** `npm run check` runs every catalogue, licence and changelog check of a stage and reports them together, but stops before the tests and build when one fails, so a fix can still uncover another. Run `pr:ready` until it is Ready instead of pushing after each fix.
- **Two PRs, one changelog line.** Application changelog entries are one file each, `changelog/<YYYY-MM-DD>-<topic>.md`; module notes are one file per module in `src/community/module-changelogs/`. Never add entries to `CHANGELOG.md`: the check refuses them.
- **Merged before green.** The `main` ruleset requires the `module-pr-ok` check, which passes only when every other PR check passed or was skipped by scope. The owner approves a first-time contributor's run and turns on auto-merge, and GitHub merges once it is green; a red or unfinished PR does not merge.
- **Compiled packages.** The `octatrack-source` and `elemod-source` jobs rebuild packages in the pinned Docker toolchain and require the committed ones to match. Reproduce them before you push: `bash scripts/build-modules-isolated.sh <clean checkout> <new dir> <image id>` for the Octatrack, `bash scripts/build-elemod-isolated.sh` and `node scripts/verify-elemod-release-exports.mjs <dir>` for the Digitakt and Digitone, from a clean, committed tree.
- **Checking a draft.** `module:doctor` and `build.py --octabam` look only in `sdk/octabam/modules/`, and refuse a symlink there ("Source symlinks are prohibited"). Copy the draft's folder there for the run, then delete the copy. The listing lines (catalog entry, packages, native comparison, pair table, package fingerprint) stay red for a draft; every other line should be green.
- **Archived source snapshots.** Before browser-builder scripts, run `node scripts/machine-modules.mjs` and `node scripts/module-changelogs.mjs --write`: their ignored catalogue/changelog JSON is absent from `git archive`.
- **Relocated host addresses.** Loader fixtures must compare the complete relocated jump/address; an individual address byte can equal the saved stock sentinel under ASLR. Check restoration separately.
- **Local Python helpers.** Use `python3 -B` or `PYTHONDONTWRITEBYTECODE=1`: bytecode caches under preserved imports fail the import-integrity check, even when the authored source is unchanged.
- **Red checks leave the review queue.** An hourly job labels a pull request with a failing check `needs-work` and comments once; the label goes away when the checks are green. A PR still red 14 days after the label, without a new commit, is closed; reopen it once `pr:ready` says Ready. Until your first module is published, a second open module PR is labelled `one-at-a-time` and waits for the first.
- **Your first PR waits for the owner.** GitHub holds a first-time contributor's CI runs until the owner approves them, after every push. Run `pr:ready` locally and push once, rather than often, so each approval counts.


1. **Prepare:** fork Modwerk, branch from current `main`, and build or port the module. Keep source pins, credits and licences; prepare the manifest/version/catalog, README/tutorial, release notes, real UI captures and matching stock-free packages.
2. **Verify:** follow the machine/category guide, regenerate metadata, run `module:doctor` and `npm run check -- --base origin/main`, and qualify the exact private source/build. Give the contributor concrete hardware steps and record only their actual results. Test different simultaneous instances and track/FX-slot/DSP-core isolation and Part/project/physical-reboot persistence where applicable. Emulator project loading is not physical reboot evidence.
3. **Submit:** commit, push and open a Modwerk PR. Follow checks and fix failures. Every new module currently needs owner review; the first approved release registers its GitHub author for later scoped updates. Website sign-in or claiming does not grant release authority.
4. **Publish and verify:** after owner merge, follow the exact commit's site/API deployments. Confirm the live version, save a compatible firmware download, and verify its version/source identity and deterministic hash where applicable. A push, merge or ready/download-requested state alone does not prove a saved release download.

Keep firmware, extracted stock bytes/tables, dumps, projects/cards and complete built images private. Submit only original or properly licensed source/media and approved stock-free module packages. Keep the previous approved download available while a new release is pending or failed.

For repeated release checks, the [local firmware download API](FIRMWARE_DOWNLOAD_API.md) saves and hashes builds from the deployed catalogue without a browser. Its receipt identifies this local verification method; interaction, rendered-layout and hardware evidence remain distinct where applicable.

Use the beta [frontend and device MCP](FRONTEND_MCP.md) for developer site checks: `npm run --silent mcp -- --data-dir PRIVATE_DIR` with isolated private state, fixed startup paths/URLs and normal member/developer authentication. Source/domain, HTTP/API and MCP/DOM regressions come first, then authorized physical-device qualification; screenshots are allowed without opening, navigating or controlling a browser, but computer-use and browser-control site testing remain excluded. Review supplied/retained images when direct capture is unavailable. MCP screenshot capture is [requested, not implemented](FRONTEND_MCP.md#screenshots-and-visual-evidence). Writes need the explicit API/device flags, and USB trials retain exact identity/version review, actual self-test and explicit Keep/Undo. See [testing and evidence limits](APP_DEVELOPMENT.md#testing-through-the-developer-mcp). Never treat MCP availability or a passed software test as proof of whole-catalogue compatibility, audible output or physical reboot persistence.

## Ask the author first

Modwerk shows a module's author on its page, and players take their problems to them. So before you start work on a module someone else wrote, ask them, unless you are its author or a maintainer named in its manifest (`author`, `maintainers`). Ask on GitHub, in an issue or comment that @mentions them, or message them on Discord (the [Modwerk development server](https://discord.gg/vzfAdMBtn5) is one place to find them). Say what you want to change and why, and wait for their yes before you write any code. Link it in the pull request, or say it came on Discord and on which day. Review closes a pull request that changes someone else's module without its author's OK. If they say no or do not answer, open an issue or a report with what you found instead.

A coding agent asked to change a module checks its manifest first. When the author is someone else and the developer has no OK yet, it stops and tells them to ask; it writes no change and opens no pull request.

## Update or fix an approved module

Read the report and reproduce it where possible. Every fix must include a changelog update in the module’s `src/community/module-changelogs/<id>.json` in the same PR; it is part of the fix, not a later follow-up. Write it for players, in at most five short lines: what changed for them, the issue number, and a `Known issue:` line only for a limit they need to know ([release notes](ADD_A_MODULE.md#release-notes-required-for-every-fix-and-module-version)). Test evidence and unverified details go in the pull request. When the module names someone else as its author, start only once they have said yes ([Ask the author first](#ask-the-author-first)) and @mention them on the pull request. Change the module, explicitly bump its semantic version for behavior changes, and synchronize the catalog pin, shipped packages, docs and the exact version in the changelog. Preserve previous entries. Documentation/media-only fixes add a clearly marked note to the current version unless publishing a new version. Pushing commits neither increments the version nor publishes the frontend.

The registered author personally verifies the exact source, rights, UI and qualification evidence. Missing, failed or untested required hardware acceptance checks block automatic publication. An agent records only reported results and never attests on the author's behalf without that actual verification. Editorial updates retain approved evidence only through the documented checked path.

Open a PR against Modwerk `main` and include the two exact opt-in checkboxes from [Author updates](MODULE_AUTHOR_UPDATES.md#prepare-the-release). Leave them unchecked until the author personally verifies the evidence and opts in. Successful exact-head/base checks and scope verification permit bot merge and site/API publication for updates to that author's approved modules. New modules, shared SDK/builder code, ownership/licence changes and exceptions still require owner review.

Follow checks, the author publisher and deployments; then verify the live version and an actual saved compatible download. For a reported fix, obtain actual version-matched results from the author's unit before resolution. Use `Related to #<number>` in PRs rather than merge-time closing keywords.

## Manage reports on GitHub

Public reports and GitHub replies share a thread, with replies/status synchronized to Modwerk. Report handling needs no fork, coding agent, repository write access or owner review. Registered authors can act immediately. Other declared maintainers verify their GitHub identity and claim the module once in **Creator settings**; that permits triage and ordinary closure, while release completion retains its registered-author check. Post commands as **new comments** on mapped public reports:

```text
/modwerk needs-info Which steps reproduce this, and on which track?
/modwerk close insufficient_information No reproduction details yet. Reply with them and I can reopen.
/modwerk confirm <affected-version|unknown> <reproduction evidence>
/modwerk reopen <public explanation>
/modwerk resolve <published-version> verified-download
```

Commands require current module-maintainer authorization; owning the GitHub repository does not grant it. A module whose author opted out of maintenance can therefore refuse the owner's command too. Use the existing administrator report workspace for triage, or an ordinary GitHub reply to ask reproduction questions through the signed reply/notification bridge. Check the command acknowledgement, public report state and signed webhook verdict: HTTP 200 with `command: denied` means no triage or reporter notification was performed for that command. Do not change module ownership or grant a role to get around that refusal.

A report titled `[configuration] …` covers a whole saved configuration and lists its modules; every module's registered maintainer can use `close` and `reopen` on it. Name the module in `resolve`, `/modwerk resolve <module-id> <version> verified-download`, because the fix ships in one module; it closes the whole report.

Use `needs-info` to keep a report open while waiting; an unconfirmed report does not establish a module defect. Use `confirm` only after reproduction, naming the exact affected semantic version or `unknown`. Whole-configuration reports use `unknown` and never count against every included module. Once a bug is confirmed, asking for more information keeps that confirmation visible. `/modwerk investigate <explanation>` records an investigation; `/modwerk awaiting-verification <explanation>` keeps a confirmed bug open while its candidate fix is tested. `/modwerk unconfirm <explanation>` explicitly removes a mistaken confirmation. Questions and suggestions use `/modwerk classify question|feature <explanation>`; reclassify as `bug` before confirming. `/modwerk help` shows the commands on an existing issue.

A beta report from a USB sync has no device log (its build fingerprint reads "Not recorded"). On the owner's computer, `npm run diagnostics:pull` shows what that member chose to share: sync failures with error, refusal and modules, self-test results and load readings ([private diagnostics](APP_DEVELOPMENT.md#private-diagnostics)). Quote nothing from it in a public issue beyond what the reporter wrote; ask them instead.

Use `resolve` only after the exact published download and hardware fix have actually been verified. Push and merge alone leave the report open. Other closure reasons are `configuration`, `duplicate`, `not_reproducible`, `insufficient_information` and `withdrawn`; each needs an explanation and claims no firmware fix. Private reports offer the same triage and closure choices on their access-controlled page. GitHub-only issues use authorized native GitHub closure. Private details remain access-controlled and consent-based.

Routine updates to an author's approved modules use the existing automatic PR workflow: prepare the fix, pass CI, personally verify the evidence and check both publication boxes. The bot merges and starts site/API publication without an owner review. First releases, shared code, ownership/licence changes and exceptions still need owner review. See [Author updates](MODULE_AUTHOR_UPDATES.md).

For a specific GitHub reply, check its signed webhook delivery, each intended recipient's bell entry, and that member's email/push preferences and digest due time. A successful webhook response proves processing, not that every participant received a notification; check members who joined through Modwerk separately, and never route by a typed GitHub mention of a Modwerk username. The `emailed` flag also settles read or expired entries and turned-off topics, so it is not a delivery receipt. Aggregate provider-acceptance counters cannot prove that a particular message arrived in an inbox.

Verify GitHub status, Modwerk synchronization and reporter notification. Release completion uses the existing idempotent follower/downloader fanout automatically for published versions. Published module versions automatically notify their followers, including eligible prior downloaders. Update email is enabled by default and uses the existing daily module digest; members can unfollow a module or opt out of update/activity email. No per-release announcement opt-in is required, and legacy `announce` flags do not suppress notifications. Equal-version media or documentation edits do not replay an update, and superseded inventories never announce an older release. Before pushing a module update, the coding agent must tell the maintainer in chat that successful publication will notify followers, including by email according to their preferences; a push alone does not send mail. Reporter status notifications remain separate. Report stored queue counts separately from provider acceptance or delivery/digest delays; use the existing scheduler.

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

The guides are the context every prompt and agent reads, so a finding that helps all development belongs in them, not only in a session, a PR comment or private notes. Examples: a trap in the shared builder, a tool that behaves differently than its help says, a measured budget, a step a guide omits or states wrongly. Put it in the file a reader would open for that task: the category guide under `docs/module-guides/`, [Add or port a module](ADD_A_MODULE.md), this page, or `AGENTS.md` when it affects every task. Because the prompts point at these files, no prompt change is needed for a new lesson.

- It is asked for. Before every push, `npm run pr:ready` lists the guide edits on your branch and asks what the guides lacked or got wrong; the pull request template has the same line, and the starter prompts ask the agent to answer it. "Nothing" is a fine answer; a lesson left in the session is not.
- Correct a stale or wrong statement instead of adding a contradicting one. Keep the entry short and general, and say a hardware behaviour only as observed on a named build, otherwise "not tested".
- Make room instead of appending. `AGENTS.md` and every document in `docs/` may grow to 32 KB, and one already longer may not grow, so `npm run check` refuses an edit that only adds to it: cut what is stale or said elsewhere first. A guide holds what is true now; results, decisions and changes go in dated records ([where each goes](README.md)).
- Keep it stock-free: no firmware bytes, code, tables or dumps. `sdk/octabam/AGENTS.md` stays unchanged because octabam's code cites it; put Modwerk-specific traps in a Modwerk guide.
- Put it on the pull request you already have open for this work, or in a small docs-only pull request when none is open. Inside a module release it is outside a registered author's scope and would remove the update from the automatic path. Docs-only edits use the lightweight checks. The owner reviews the wording, and the agent tells the contributor what it added.

### Fixes and improvements

When work turns up a bug, a fix, or an improvement that makes Modwerk easier to use or to develop for, in the SDK, the tools, the site or a guide, and it is not the task at hand, commit it to the pull request you already have open for this work and say in its description what it is and how you checked it; never fold it into a module release. With no pull request open, send it as its own small one. These are welcome and quick to merge when they are easy to read, and the points below apply to a stand-alone pull request:

- **Flag it in the title:** `Fix: …` for something broken, `Improvement: …` for something made easier or better, `Docs: …` for a guide-only finding. A workflow labels the PR from that prefix (`bug`, `enhancement`, `documentation`).
- **One change, in plain words.** A title a musician could follow, a small diff and a description that answers what was wrong or hard, what this changes and how you checked it. The PR template has those three lines.
- **Mergeable as it is.** Branch from current `main`, run `npm run pr:ready` until it says Ready, and keep generated files, versions and other modules out of it unless the change needs them.
- **Ask first in someone's fork.** An agent working for a contributor offers the PR and opens it with their OK. If you can't fix it, open an issue or a site report instead, saying what you saw and on which build.

## Keep the prompt and page aligned

The rules live in the repository, not in the prompts. Every coding agent reads `AGENTS.md`, and the prompts send it on to this page, the module guides and the machine guide, so a rule written there reaches every contributor's agent without a prompt change. `src/community/developer-guidance.ts` holds the release stages the page shows and names them in the prompts; `starter-prompts.ts` adds the task for each instrument and category and the files to read. Keep the prompts to what a file cannot do: the contributor's idea and choices, the order of work (check for duplicates, propose and wait for an OK, scaffold, the four stages) and the few rules that protect the contributor and other authors (asking a module's author before changing it, owner review of a first release, never checking a release box for them, recording only results they report, keeping firmware private). Keep the frontend to one configurable copyable prompt, a short visual flow and compact ecosystem context, with the long preview collapsed by default.

Every prompt opens with a fork: a coding agent in a checkout skips setup, while a plain chat assistant (ChatGPT, Gemini), which cannot read the repository, must not design or write the module and instead walks a newcomer through GitHub, fork, clone, Node 24 and a coding agent, ending with a reminder. Keep that block at the top and the reminder at the end; a mid-prompt block was ignored by Gemini. Keep personal owner names out of this page and its prompts. Populate instruments from the registry rather than maintaining a second list, and send machines without SDKs to integration prompts with existing reading paths.
