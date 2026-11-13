---
name: modwerk-diagnostics
description: The owner's diagnostics pass - pull the diagnostics members share, sort the failures into causes, then fix what the records and a reproduction prove, each fix as its own pull request. Only when the owner (GitHub repeat98) asks to fix, analyse or go through the diagnostics; never in a contributor's session.
---

# /modwerk-diagnostics [username, module or symptom]

If the developer is not the owner, say that shared diagnostics are private to the owner and offer `/modwerk-fix-issue <link>` for a report instead.

The records are private. Tester names and anything quoted from a record stay in chat and in `~/.cache/modwerk-local/`: never in a commit, pull request, issue, changelog or document. There, write "a tester" and only the technical fact.

1. **Pull.** `git fetch`, then `npm run diagnostics:pull` on Node 24. The summary is long, so write it to `~/.cache/modwerk-local/diagnostics/pull-<today>.txt` and read its Problems section first; every record is in `~/.cache/modwerk-local/diagnostics/latest.json` (UTC). What the summary means, its known noise and an HTTP 403 are in `docs/MAINTENANCE.md#beta-worker`; the record schema is `src/community/octatrack-diagnostics-contract.ts`. With an argument, read only that member's, module's or symptom's records.
2. **Sort the failures into causes**, not records: sync and link failures, build failures, browser errors, unresponsive units, stalls and crashes in device logs, restores that were not `RESTORED`, CPU or DSP near the limit. One cause is one line: what happens, on which base, set, browser and OS, how many units, first and last seen.
3. **Drop what is not open.** For each cause check, in this order: the unit's base and module versions against what is live (an old build's bug that `changelog/` or the module's changelog already fixed is done), the open issues and pull requests (`gh issue list`, `gh pr list`), the findings in `docs/OCTATRACK_BETA_TEST_PLAN.md`, and the stock OS's own behaviour. Say which it was.
4. **Prove the rest before fixing it.** Find the code the record points at and reproduce the failure in a test, over HTTP, or with the developer MCP. The emulator and the unit are shared: use them only once the owner says they are free (`/modwerk-test-on-unit`). A cause you cannot reproduce is a hypothesis: say what would confirm it, and add the missing diagnostic field or log line as the fix if that is what stands in the way. Never ask a tester to run tests.
5. **Fix what is proven**, worst first: anything that risks a unit or a project, then crashes and stalls, sync, builds, the site.
   - Site, app, Worker, SDK or base: one `Fix:` branch off `main` per cause, with the test that reproduces it and its `changelog/` entry. A base change is not done until it ran on a unit.
   - A module: the owner's own, by `/modwerk-update-module`; anyone else's needs its author first (`docs/DEVELOPER_WORKFLOW.md#ask-the-author-first`), so draft the message instead of the fix.
   - Matches an open issue: `/modwerk-fix-issue <n>` carries it through to closure.
   - Run `npm run pr:ready` on each branch. Push and open pull requests only on the owner's yes.
6. **Brief the owner**, short, one line each: fixed and ready to push, proven but needs the unit, hypothesis and what would confirm it, needs the owner's call, and not a bug with the reason. Write the same to `~/.cache/modwerk-local/diagnostics/<today>.md`, where the next pass starts.
7. **Fold it back.** A finding goes in the findings log or a dated record in `docs/verification/`, without names; a noise pattern the summary should have filtered goes into `scripts/diagnostics-pull.mjs` in its own pull request.
