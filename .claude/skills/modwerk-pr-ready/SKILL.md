---
name: modwerk-pr-ready
description: Make a Modwerk pull request mergeable without the owner repairing it - merge main, regenerate generated files, run pr:ready until Ready, push and watch the checks. Use before every push, after merging main, or when checks are red.
---

# /modwerk-pr-ready

Follow `docs/DEVELOPER_WORKFLOW.md#make-it-mergeable`.

1. **Merge** current `origin/main` into the branch. Never rebase: catalogue rows pin the pull request's own commit.
2. **Regenerate** generated files rather than resolving them by hand: `npm run modules:generate`, `npm run modules:pairs -- --write`, `npm run licenses:generate`, `npm run machines:generate`.
3. **Run** `npm run pr:ready` until it says Ready. For a registered author's update, use `npm run pr:ready -- --author <login>`.
4. **Push** and open or update the pull request. A change outside a module is titled `Fix: …`, `Improvement: …` or `Docs: …`.
   - Watch `gh pr checks <n> --watch` until green. For a red job, read `gh run view <id> --log-failed`.
   - If `main` moves before the merge, start again at 1.
5. **Answer what pr:ready asks:** a guide edit for what you learned, or "nothing" in the pull request.
