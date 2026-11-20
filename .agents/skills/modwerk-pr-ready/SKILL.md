---
name: modwerk-pr-ready
description: Make a Modwerk pull request mergeable without the owner repairing it - merge main, regenerate generated files, run pr:ready until Ready, push and watch the checks. Use before every push, after merging main, or when checks are red.
---

# /modwerk-pr-ready

Follow `docs/DEVELOPER_WORKFLOW.md#make-it-mergeable`.

1. **Merge** current `origin/main` into the branch. Never rebase: catalogue rows pin the pull request's own commit.
2. **Regenerate** generated files rather than resolving them by hand: `npm run modules:generate`, `npm run licenses:generate`, `npm run machines:generate`.
3. **Check once.** For a new commit, stage the intended files and run `npm run pr:ready -- --commit "Message"`. For an existing commit, run `npm run pr:ready`. For a registered author, use `npm run pr:ready -- --author <login>` and include the same `--author` option when committing. Let each command manage its own machine slot so other worktrees can run while you push or watch GitHub.
   - It also claims on the agent board what the branch adds (a new module, hook or table index, migration) and stops when someone else holds one. Never work around a claim: renumber, rename or ask its holder yourself. Signed out, it asks for `npm run board -- login` first. When it notes questions or replies in the developer's board inbox, read them (`npm run board -- inbox`), answer them yourself from what you can check, close your settled ones, and tell the developer what you said; only a decision about their own work goes to them first. When it offers a finding, post it yourself.
4. **Push** and open or update the pull request. If it changes what runs on an instrument (a `.mwrm` package or `.elemod` base), open it as a draft (`gh pr create --draft`) and mark it ready only after the developer has tested that exact build on a unit; the description then names it on a line of its own ("Tested on a unit: base 8d1db124, MKII, what ran", or "Not tested on a unit: <why>") and lists the change's edge cases under a line "Edge cases", as the table `npm run test:procedure` writes, or "Edge cases: none, because …" (`docs/TEST_PROCEDURE.md`). CI checks both. A base change opens no pull request of its own: commit it to its machine's cumulative draft from `base/<machine>-next`, or open yours against that branch (`gh pr create --base base/<machine>-next`). That draft stays a draft until the base has been tested extensively on a unit; never mark it ready, only the owner does ([Change a base](../../../docs/DEVELOPER_WORKFLOW.md#change-a-base)). Ready from pr:ready means the checks pass, not that it was tested. A change outside a module is titled `Fix: …`, `Improvement: …` or `Docs: …`. Write the description in the template's shape: what changed, how you checked it, and a line that answers the guides question ("Guides: nothing" is fine). CI checks it.
   - Watch `gh pr checks <n> --watch` until green. For a red job, read `gh run view <id> --log-failed`.
   - If `main` moves before the merge, start again at 1.
5. **Answer what pr:ready asks:** a guide edit for what you learned, or "nothing" in the pull request.
6. **Offer to share the session** when pr:ready prints the session-sharing line: ask the developer once whether to share this session with the owner, and on a yes run `npm run session -- share --note "…"` with a few sentences on what got in the way. "Always" or "never" from the developer goes into `npm run session -- prefer always|never` (`docs/AGENT_SESSIONS.md`).
