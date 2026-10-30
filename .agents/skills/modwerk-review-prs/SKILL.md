---
name: modwerk-review-prs
description: Review Modwerk's open pull requests, answer their authors where something must change or is unclear, then present the invoker with options for each (merge, refresh, wait, decline). Use when the owner or a maintainer asks to review pull requests, or names some to review.
---

# /modwerk-review-prs [number ...]

**The goal is to finish pull requests.** A pass should leave as many as it can merged or declined. Each one still open should have one concrete next step and a named owner.

**What to review:** the pull requests named. With none named, every open one not labelled `needs-work` or `one-at-a-time` that has changed since your last comment, or has gone quiet since your last request.
- Contributors' drafts count. Many authors open a draft without knowing it and expect a review; the triage bot skips drafts, so nobody else sees them. Review a draft like any other, and when it is otherwise ready, offer to mark it ready (`gh pr ready`).
- The invoker's own drafts are theirs to finish: skip them unless named.

1. **Review** each by the pull request worker's checklist in `docs/MAINTENANCE.md#pull-request-worker`:
   - read the code it touches, not only the diff;
   - judge it against `MODDING_GUIDELINES.md` and the whole stack: the base, the USB lifecycle, module splits, cross-compatibility and, for a machine, the recipe (the checklist names each);
   - the rules contributions most often break;
   - claims that cut across pull requests, and the agent board's: a module, hook index or migration it adds that someone else holds, or that nobody claimed;
   - red checks, and whose fault they are;
   - runs waiting for approval (`action_required`): nothing else moves until they run;
   - what the triage bot's next run would do.
2. **Talk back where needed**, at most one comment per pull request: a change it must make, a question only its author can answer, or a refresh it needs.
   - Ask for everything it still needs in that one comment, so the next pass can finish it.
   - Write plainly and friendly, in the invoker's voice, and post from a file.
   - Post nothing when nothing is needed, and never repeat a request already on the thread.
   - Name no tester and quote no diagnostics.
   - Comments only, until the invoker picks: no labels, pushes, approvals, ready marks or closes.
3. **Present the options** in chat, one line per pull request: its verdict and why, then the choices that fit, your pick first. List first the ones that can merge now.
   - The choices: merge; merge after a refresh; finish it ourselves, then merge (push a refresh, the regenerated files, a changelog line or another small mechanical fix to the author's branch, or `/modwerk-pr-ready`); approve its waiting runs; mark a draft ready; wait on the author; decline with a reason; hand it to `/modwerk-fix-issue`.
   - Pick the choice that ends it this pass. When the only gap is mechanical, finishing it ourselves beats asking the author. When the author has been quiet for a week since your last request, offer to decline it with a reason.
   - Carry out what the invoker picks in the same session, then follow each merge's runs to green. Before a module update merges, say that publishing notifies its followers.
