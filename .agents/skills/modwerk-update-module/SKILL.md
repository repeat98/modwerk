---
name: modwerk-update-module
description: Change, fix or update a Modwerk module the developer wrote or maintains, through the version, release notes, private build, hardware evidence and release. Use when a developer wants to improve or update their own module; for a numbered report use /modwerk-fix-issue.
---

# /modwerk-update-module

1. **Whose module?** Read its manifest. If the developer is neither its author nor a listed maintainer, they need the author's OK first (`docs/DEVELOPER_WORKFLOW.md#ask-the-author-first`). Stop until they have it.
2. **Read** `docs/MODULE_AUTHOR_UPDATES.md`, then the module's README, TESTING, manifest and category guide.
3. **Change it.** Pick the next semantic version and write that version's own release notes in `src/community/module-changelogs/<id>.json`, keeping the earlier entries.
4. **Build and test.** Build the exact private image and give the developer concrete steps for it on their unit (`/modwerk-try-on-unit`).
   - Record only the results they report: several instances, slot and core isolation, and persistence where it applies.
   - Emulator results never count as hardware evidence.
5. **Release.** Run `/modwerk-pr-ready` (with `-- --author <login>`), then open the pull request.
   - A registered author checks the release boxes only after verifying the evidence personally; never check them for them. Missing, failed or untested required checks block automatic publication.
   - Link a report with `Related to #<number>`, never a closing keyword.
   - Tell them that publishing notifies the module's followers, by email too unless they opted out.
6. **After the merge,** verify the live version and a saved download. A push or merge alone never resolves a report: only the published download, with the fix confirmed on their unit, does.
