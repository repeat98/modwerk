---
name: modwerk-fix-issue
description: Fix a Modwerk issue or report end to end, from diagnosis and the fix to the changelog, checks, release, live verification, closure and notifications. Use when someone asks to fix an issue or report by number or link.
---

# /modwerk-fix-issue <number or link>

Who is asking decides the flow:
- **The owner (`repeat98`):** the full issue-fix flow in `docs/OWNER_OPERATIONS.md#finish-the-issue-fix-flow`, through the live download, closure and notification counts. It is one task: a pull request or a merge is progress, not completion.
- **A registered author of the module:** the guided flow in `docs/MODULE_AUTHOR_UPDATES.md#start-with-an-issue`.
  - Release steps wait for their actual hardware results.
  - After live verification they post `/modwerk resolve <version> verified-download` on the issue.
- **Anyone else:** ask the module's author first (`docs/DEVELOPER_WORKFLOW.md#ask-the-author-first`). A fix to shared code is its own `Fix:` pull request.
  - With their OK linked and the author @mentioned, the fix is an ordinary pull request the owner reviews (`docs/DEVELOPER_WORKFLOW.md#update-or-fix-an-approved-module`).
  - Record results from your own unit as yours, on the named build; never attest for the author.
  - Resolving the report is for the module's registered author (`/modwerk resolve`) or the owner's flow, once the live download is verified.

Then, in every flow:
1. **Read the report in full** (`gh issue view <n> --json body,comments`).
2. **Reproduce it before you change anything,** on the reported build and with the reported steps:
   - on the unit, as stage 1 of `/modwerk-test-on-unit` (the developer's OK first, trials only), for sound, timing, load, USB and anything only the instrument shows;
   - in the emulator for screens, menus, crashes and freezes, or where there is no unit.
   - Write down the steps and what they showed, and say where: reproduced on the unit, in the emulator, or not reproduced. A fix for a report you could not reproduce is a mitigation until the reporter confirms it; keep the two apart.
3. **Read the module's claim on the agent board** before changing it: `npm run board -- list module <machine>/<id>`. Someone else holding it is changing it now: stop, ask them yourself (`npm run board -- ask module <machine>/<id> "…"`), tell the developer who and that you asked, and settle it before you go on.
4. **Test the fix** with `/modwerk-test-on-unit` on the build you will ship: the reproduction first, which must no longer fail, then stage 1, then the developer's own check of what only a person can judge. Record both stages in `TESTING.md`.
5. **Ship the fix with its changelog entry** in the same pull request: a file in `changelog/`, or the module's own file in `src/community/module-changelogs/`. Name the limits that remain.
6. **Close only after the live version is verified.** Keep closing keywords out of the pull request.
7. **Handle reports and diagnostics** as `docs/DEVELOPER_WORKFLOW.md#manage-reports-on-github` describes. Quote nothing from private diagnostics on GitHub.
