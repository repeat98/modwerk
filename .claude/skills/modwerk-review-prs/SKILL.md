---
name: modwerk-review-prs
description: Review Modwerk's open pull requests, answer their authors where something must change or is unclear, then present the invoker with options for each (merge, refresh, wait, decline). Use when a device reviewer, the owner or a maintainer asks to review pull requests, or names some to review.
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
   - base work sent as a module (`AGENTS.md`, Modules): a speed-up, a fix to the stock OS or the base, or a load warning, with nothing new to play, pick or set, goes back to its author for the machine's cumulative base draft;
   - claims that cut across pull requests, and the agent board's: a module, hook index or migration it adds that someone else holds, or that nobody claimed;
   - the test record, for a change to what runs on an instrument (`docs/TEST_PROCEDURE.md#who-runs-it`): the submitter tests, you read. Is it there, on the named build (revision and package SHA-256), did the fixed steps run or say why not, do the edge cases match what the diff touches? If not, ask the submitter for it in your one comment; never test it in their place;
   - red checks, and whose fault they are;
   - runs waiting for approval (`action_required`): nothing else moves until they run. Approve only those on the current head (`headSha`): an older one, once approved, cancels the head's checks (`module-pr.yml` keeps one run per pull request);
   - what the triage bot's next run would do.

   A device reviewer handles first releases for their assigned device and checks any new author registry entry against the submitting GitHub account. A repository maintainer can review across devices. Nobody merges their own first release, a maintainer included: for the invoker's own, ask another reviewer. When the invoker picks merge on a reviewed submission, get the head SHA they reviewed, submit an APPROVE review bound to it (`gh api repos/OWNER/REPO/pulls/N/reviews -f event=APPROVE -f commit_id=SHA`), then post `/modwerk merge SHA` as a new PR comment. Follow **Merge a reviewed submission** in GitHub Actions. If it starts held first-contributor checks, wait for green and repost the same command on the same head. Follow publication to completion (`docs/DEVELOPER_WORKFLOW.md#who-reviews-a-first-release`).
2. **Talk back where needed**, at most one comment per pull request: a change it must make, a question only its author can answer, or a refresh it needs.
   - Ask for everything it still needs in that one comment, so the next pass can finish it.
   - Write plainly and friendly, in the invoker's voice, and post from a file.
   - Read our earlier comments on it first. Post nothing when nothing is needed, and never repeat a request or suggestion already on the thread; a follow-up adds something new or asks someone not yet asked.
   - Name no tester and quote no diagnostics.
   - Comments only, until the invoker picks: no labels, pushes, approvals, ready marks, closes or runs on the unit.
3. **Present the options** in chat, one line per pull request: its verdict and why, then the choices that fit, your pick first. List first the ones that can merge now.
   - The choices: merge; merge after a refresh; finish it ourselves, then merge (push a refresh, the regenerated files, a changelog line or another small mechanical fix to the author's branch, or `/modwerk-pr-ready`); approve its waiting runs; mark a draft ready; wait on the author (for its test record too); test it on the unit ourselves; decline with a reason; hand it to `/modwerk-fix-issue`.
   - Before finishing a contributor's pull request ourselves, make its one comment a request that the author hold pushes until it merges; anything pushed later goes into the next version. A push mid-release forces a rebuild, a new approval and another unit trial (Grain #1858 needed two of each).
   - "Test it on the unit ourselves" is optional, never a duty and never a stand-in for a missing record: offer it only for a change whose record is complete, when a unit or emulator is connected and its checks are green: stage 1 of `/modwerk-test-on-unit` on the pull request's own build, only after the invoker's yes, one pull request at a time, trials only. Its result goes into that line's verdict; on the pull request, give only the build's readings, naming no tester. A failure turns the pick into a request to the author. The emulator's result is never hardware evidence.
   - Pick the choice that ends it this pass. When the only gap is mechanical, finishing it ourselves beats asking the author. When the author has been quiet for a week since your last request, offer to decline it with a reason.
   - Carry out what the invoker picks in the same session, then follow each merge's runs to green. Before a module update merges, say that publishing notifies its followers.
