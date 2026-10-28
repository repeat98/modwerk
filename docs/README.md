# Documentation

Every document in `docs/`, one line each. [AGENTS.md](../AGENTS.md) says which to read first for a task.

**Keep them short.** `AGENTS.md` and every document here may grow to 32 KB, and one already longer may shrink but not grow: `npm run check` refuses an edit that only adds to it. Make room by cutting what is stale or said elsewhere; Git keeps the history. A new document gets a line here (a test checks).

**History goes in dated records, not in a guide.**

| Record | Where a new one goes |
| --- | --- |
| A module's test results | the module's own `TESTING.md` |
| Any other verification: a base, kit, core or builder change | `docs/verification/<YYYY-MM-DD>-<topic>.md` |
| An owner decision | [decisions/](decisions/)`<YYYY-MM-DD>-<topic>.md` |
| A change to the site or the tools | [changelog/](../changelog/)`<YYYY-MM-DD>-<topic>.md` |

[VERIFICATION.md](VERIFICATION.md) and [DECISIONS.md](DECISIONS.md) hold the entries up to 25 October 2026, [CHANGELOG.md](../CHANGELOG.md) up to 22 October; none of them takes new ones.

## Start here

- [MODDING_GUIDELINES.md](../MODDING_GUIDELINES.md): what Modwerk mods may and may not do, toward makers and other people's work; also published at modwerk.app/#modding-guidelines.
- [DEVELOPER_WORKFLOW.md](DEVELOPER_WORKFLOW.md): the shared context for Start developing: setup, submissions, reports, a mergeable pull request.
- [ADD_A_MODULE.md](ADD_A_MODULE.md): add, port or update a module, per machine.
- [module-guides/](module-guides/README.md): how a module should behave, per category.
- [ADD_A_MACHINE.md](ADD_A_MACHINE.md): bring a machine up before it gets modules.
- [MACHINE_RECIPE.md](MACHINE_RECIPE.md): the Octatrack's stack (base, hooks, USB link, loader, MCP, page) every machine gets, and where each one stands.
- [MODULE_AUTHOR_UPDATES.md](MODULE_AUTHOR_UPDATES.md): registered authors publishing their own updates.
- [OWNER_OPERATIONS.md](OWNER_OPERATIONS.md): the owner's issue-fix and release flow, mail sendouts, locks and disk rules.
- [MAINTENANCE.md](MAINTENANCE.md): the daily pass the owner starts with "maintain": pull request, issue, beta and upstream workers, one briefing.
- [MODULE_ADDITION_WORKFLOW.md](MODULE_ADDITION_WORKFLOW.md): moved to ADD_A_MODULE.md.

## Module reference

- [SDK.md](SDK.md): machine profiles, module contract v3, evidence tiers and the shared commands.
- [MODULE_REPOSITORIES.md](MODULE_REPOSITORIES.md): the module folder and its manifest fields.
- [MODULE_QUALIFICATION.md](MODULE_QUALIFICATION.md): qualification gates: cycles, memory, hardware, exceptions.
- [MODULE_RESOURCE_GAUGES.md](MODULE_RESOURCE_GAUGES.md): the CPU, DSP and memory gauges a release needs.
- [MODULE_UI_CAPTURES.md](MODULE_UI_CAPTURES.md): screenshots and the capture tool.
- [MODULE_AUDIO_PREVIEWS.md](MODULE_AUDIO_PREVIEWS.md): a module's audio clip.
- [ELEMOD_SOURCE_BUILDS.md](ELEMOD_SOURCE_BUILDS.md): Digitakt and Digitone source builds in the pinned toolchain.
- [BUILDER_MEMORY.md](BUILDER_MEMORY.md): Octatrack DRAM regions and patch contracts.
- [NATIVE_TEST_PERFORMANCE.md](NATIVE_TEST_PERFORMANCE.md): the native assembler cache.

## Octatrack

- [OCTATRACK_HARDWARE_TRAPS.md](OCTATRACK_HARDWARE_TRAPS.md): what fails on a real unit: the base, the USB link, RAM boot, the DSP loader.
- [OCTATRACK_TWO_SLOT_BASE.md](OCTATRACK_TWO_SLOT_BASE.md): base updates a power cut can't brick: two slots, a boot stub, the update on the unit's screen.
- [OCTATRACK_DRIVING.md](OCTATRACK_DRIVING.md): working a unit over USB from an agent.
- [FRONTEND_MCP.md](FRONTEND_MCP.md): the developer MCP for the site and a connected unit.
- [OCTATRACK_MODULE_EDGE_CASES.md](OCTATRACK_MODULE_EDGE_CASES.md): what can go wrong across projects, Parts and power cycles.
- [OCTATRACK_MORE_EFFECT_IDS.md](OCTATRACK_MORE_EFFECT_IDS.md): more than 32 effect ids.
- [OCTATRACK_PACKAGE_DSP_HOOKS.md](OCTATRACK_PACKAGE_DSP_HOOKS.md): design: stock-DSP hooks and DSP memory claims that packages carry.
- [OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md](OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md): design: resident engines loaded on demand.
- [OCTATRACK_ELEKLOADER_MIGRATION.md](OCTATRACK_ELEKLOADER_MIGRATION.md): the move to one Elekloader builder and USB loading, as dated plans and checkpoints from 9 October.
- [OCTATRACK_BETA_TEST_PLAN.md](OCTATRACK_BETA_TEST_PLAN.md): the beta test plan and its findings log.
- [STARTUP_ANIMATION.md](STARTUP_ANIMATION.md): the docking startup animation.
- [OCTABAM_INFRASTRUCTURE.md](OCTABAM_INFRASTRUCTURE.md): pinned backports of octabam's infrastructure.
- [PRIVATE_RUNTIME_CAVES.md](PRIVATE_RUNTIME_CAVES.md): private cave packages for CC Map and Recorder Loop Fix.

## Other machines and research

- [SYNTAKT_OS_RESEARCH.md](SYNTAKT_OS_RESEARCH.md), [TONVERK_OS_RESEARCH.md](TONVERK_OS_RESEARCH.md), [DIGITONE_II_OS_RESEARCH.md](DIGITONE_II_OS_RESEARCH.md): what each stock OS has shown so far.
- [LXR_02.md](LXR_02.md): the Erica Synths LXR-02, in research.
- [ZOOM_MULTISTOMP.md](ZOOM_MULTISTOMP.md) and [ZDL_MODULE_CONTRACT.md](ZDL_MODULE_CONTRACT.md): proposals for Zoom MultiStomp pedals and their effect files.
- [MACHINE_IMAGES.md](MACHINE_IMAGES.md): where each machine photo comes from, and its terms.

## Site and backend

- [APP_DEVELOPMENT.md](APP_DEVELOPMENT.md): the web app and API: running, testing, deploying.
- [FORUM.md](FORUM.md): the forum, accounts and transactional email.
- [SINGLE_SIGN_ON.md](SINGLE_SIGN_ON.md): accounts and single sign-on.
- [DEVELOPER_WORKSPACE.md](DEVELOPER_WORKSPACE.md): creator settings and private report details.
- [STATISTICS.md](STATISTICS.md): the admin statistics.
- [WEB_PUSH.md](WEB_PUSH.md): device push notifications.
- [FIRMWARE_DOWNLOAD_API.md](FIRMWARE_DOWNLOAD_API.md): building and saving firmware without a browser.
- [EXTERNAL_PROJECTS.md](EXTERNAL_PROJECTS.md): the Other projects directory.
- [SOCIAL-PREVIEW.md](SOCIAL-PREVIEW.md): sharing preview artwork.
- [COMMUNITY_OPERATIONS.md](COMMUNITY_OPERATIONS.md): running the community: registrations, moderation, [email sendouts](COMMUNITY_OPERATIONS.md#preparing-an-email-sendout).
- [DOMAIN_AND_MAIL.md](DOMAIN_AND_MAIL.md): the modwerk.app domain, hosting and mail setup.
- [PLATFORM_LICENSING.md](PLATFORM_LICENSING.md): the backend's and frontend's licences.
- [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md): German and EU compliance preparation.

## Dated records and snapshots

History, not current instructions.

- [OCTATRACK_USB_CHECKPOINT.md](OCTATRACK_USB_CHECKPOINT.md) and [OCTATRACK_BETA_HANDOVER.md](OCTATRACK_BETA_HANDOVER.md): handovers frozen on 12 October 2026.
- [REPITCH_ORIGINAL_TEMPO_CHECK.md](REPITCH_ORIGINAL_TEMPO_CHECK.md): a check of 8 October 2026.
- [FORUM_LAUNCH.md](FORUM_LAUNCH.md), [MODWERK_INTEGRATION.md](MODWERK_INTEGRATION.md) and [MODWERK_PLAN.md](MODWERK_PLAN.md): the launch evidence, the combined release and the draft plan of record, 3 to 4 October 2026.

## Folders

- `news/` and `announcements/`: member mail and news drafts.
- `media/` and `social-preview/`: images and artwork that the documents and the site use.
