---
name: modwerk-review-prs
description: Review Modwerk's open pull requests, answer their authors where something must change or is unclear, then present the invoker with options for each (merge, refresh, wait, decline). Use when the owner or a maintainer asks to review pull requests, or names some to review.
---

# /modwerk-review-prs [number ...]

**What to review:** the pull requests named; with none, every open one that is not a draft and not labelled `needs-work` or `one-at-a-time`, and that changed since your last comment on it.

1. **Review** each by the pull request worker's checklist in `docs/MAINTENANCE.md#pull-request-worker`:
   - read the code it touches, not only the diff;
   - the rules contributions most often break;
   - claims that cut across pull requests;
   - red checks, and whose fault they are;
   - what the triage bot's next run would do.
2. **Talk back where needed**, at most one comment per pull request: a change it must make, a question only its author can answer, or a refresh it needs.
   - Write plainly and friendly, in the invoker's voice, and post from a file.
   - Post nothing when nothing is needed, and never repeat a request already on the thread.
   - Name no tester and quote no diagnostics.
   - Comments only: no labels, pushes, approvals or closes.
3. **Present the options** in chat, one line per pull request: its verdict and why, then the choices that fit, your pick first.
   - The choices: merge; merge after a refresh; wait on the author; decline with a reason; hand it to `/modwerk-fix-issue` or `/modwerk-pr-ready`.
   - Carry out only what the invoker picks. Before a module update merges, say that publishing notifies its followers.
