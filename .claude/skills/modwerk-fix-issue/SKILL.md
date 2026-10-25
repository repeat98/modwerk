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

Then, in every flow:
1. **Read the report in full** (`gh issue view <n> --json body,comments`). Reproduce it where possible, and keep a confirmed fix apart from a mitigation.
2. **Ship the fix with its changelog entry** in the same pull request: a file in `changelog/`, or the module's own file in `src/community/module-changelogs/`. Name the limits that remain.
3. **Close only after the live version is verified.** Keep closing keywords out of the pull request.
4. **Handle reports and diagnostics** as `docs/DEVELOPER_WORKFLOW.md#manage-reports-on-github` describes. Quote nothing from private diagnostics on GitHub.
