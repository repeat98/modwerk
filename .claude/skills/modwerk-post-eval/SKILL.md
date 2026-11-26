---
name: modwerk-post-eval
description: Look back at an agent session for what slowed the developer down - where the time went, what used too much processor time, what the developer corrected, repeated or interrupted - then turn each concrete fix into its own Workflow pull request. Use at the end of a session that did real work, when pr:ready prints the session-review line, or when the developer asks what went wrong, what took so long or how to make the workflow faster.
---

# /modwerk-post-eval

Follow `docs/AGENT_SESSIONS.md#review-the-session-first`. The aim is a quicker next session for every developer, not a verdict on this one.

1. **Measure.** Run `npm run session -- review` (this session; `--file <transcript>` for an earlier one in `~/.claude/projects/` or `~/.codex/sessions/`). Nothing is sent. It prints:
   - wall time per tool, the slowest calls, failed calls and what ran three times or more;
   - the times the developer stopped the agent or refused a tool call, and their prompts that read like a correction or frustration;
   - the development processes on this computer that used the most processor time: an editor indexing worktrees, Spotlight, an emulator or check left running.
2. **Find the friction.** Read each flagged prompt where it stands in the conversation and name its cause: a wrong guess, a guide that misled, a check or error that said nothing, a rule the agent missed, a step the developer did by hand. Add what the figures cannot show: what the developer said twice, where you waited for them without need, and what you worked around every time (a Node version prefix, a retried command, a polling loop).
3. **Find the cost.** Time: the slowest calls and the repeats, such as a full `pr:ready` after a one-line fix instead of `npm run check -- --rerun-failed`, a wait loop instead of a background task, or `npm ci` instead of `npm run lane`. Processor: a transcript holds none, so judge from the process list and what the slow calls ran, and name the process, its minutes and what made it run.
4. **Check it is not known.** `gh pr list --label workflow --state all --limit 50` and `git log origin/main --oneline --grep "^Workflow:" -50`: extend or cite an existing fix rather than open a second one.
5. **Tell the developer** at most three findings, a line each: what cost time or processor, how much, why, and the fix. A fix outside the repository (the computer's default Node, the developer's own editor settings) is told, not committed. When nothing would spare a later session, say so in a line and stop.
6. **Open the Workflow pull requests.** Each concrete fix is its own pull request from current `main` (`npm run lane -- <name> --branch workflow/<topic>`): one change, titled `Workflow: …`, labelled `workflow`, with its changelog file, finished through `/modwerk-pr-ready`. Prefer a check, a script or a quicker command to a sentence; a sentence goes in the file a reader of that task opens. The description says what cost time, what the review measured and what changes, without names or quotes from the session. In a contributor's fork, ask first; what you cannot fix becomes an issue.
7. **Offer to share the session** once, as `docs/AGENT_SESSIONS.md#ask-once-at-the-end` says.
