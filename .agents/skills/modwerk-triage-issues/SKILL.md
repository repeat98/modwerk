---
name: modwerk-triage-issues
description: Triage Modwerk's open issues in one pass - read and sort each, reply where a reporter must answer or a fix already exists, then present the closures and a work plan for the rest, aiming to close as many as possible. Use when the owner or a maintainer asks to triage, go through or plan the issues, or names several; to fix one issue use /modwerk-fix-issue.
---

# /modwerk-triage-issues [number ...]

**The goal is to get issues off the table.** A pass should leave as many as it can closed. Each one still open should have one concrete next step and a named owner.

**What to triage:** the issues named. With none named, every open issue that changed since your last comment on it, or has gone quiet since your last question (`gh issue list --state open --limit 200 --json number,title,labels,author,updatedAt`). With more than about ten, split the reading across subagents where the agent supports it, each returning one line per issue.

1. **Read and sort** each by the issue worker's section in `docs/MAINTENANCE.md#issue-worker`:
   - read the body and every comment (`gh issue view <n> --json body,comments`);
   - list what we already said on it: each of our comments, what it asked or suggested, of whom, and whether it was answered. On a mirrored report every comment shows as repeat98: one that starts `Reply from **[… on Modwerk]**` is the reporter's, the rest are ours;
   - sort it: fixed or answered, duplicate, superseded (the module, version or feature it is about has changed or gone), needs details, confirmed, question or feature, stale;
   - look for its fix in merged pull requests and live releases first, then in open pull requests; its cause in the beta findings; and other issues with the same cause.
2. **Reply where needed**, at most one comment per issue: ask for missing details, answer a question, or point to the release or pull request that fixes it.
   - Ask for everything still missing in that one comment, so the next pass can close or fix it.
   - Ask with `/modwerk needs-info …` on a module you maintain, a plain reply elsewhere (`docs/DEVELOPER_WORKFLOW.md#manage-reports-on-github`).
   - Write plainly and friendly, in the invoker's voice, and post from a file.
   - Post nothing when nothing is needed, and never repeat a question, request, suggestion or workaround already on the thread, closing comments included. A follow-up adds something new or asks someone not yet asked.
   - Name no tester and quote nothing from private diagnostics.
   - Replies only, until the invoker picks: no labels, confirms, closes or resolves.
3. **Present the closures** first, in chat as one list, a reason for each. Lean toward closing:
   - fixed in a version that is live, answered, a duplicate of #N, withdrawn or superseded;
   - no answer a week after your question: insufficient information, and a reply reopens it;
   - a request that breaks `MODDING_GUIDELINES.md`, or that nobody will build: not planned, with the reason;
   - several issues one fix closes: keep one open and close the rest as its duplicates.

   Close those the invoker approves in the same session, each with a short comment and the closure reason the report flow names: `/modwerk close|resolve` on a module you maintain, `gh issue close --reason … --comment …` elsewhere.
4. **Plan the rest** in chat: the confirmed bugs and the features worth doing, one line each, in the order to work on them.
   - Say what breaks for whom, how many issues share the cause, and where in the code it likely sits.
   - Put first what loses work or stops the instrument, then what most people hit. Mark the quick ones (copy, docs, a small fix) to finish this session.
   - Say who does it: the owner with `/modwerk-fix-issue`, the module's author (someone else's module waits for their OK), or a `Fix:` pull request for shared code. Name whoever holds the module on the agent board (`npm run board -- list module <machine>/<id>`): they are changing it now.

   Start what the invoker picks in the same session, each through `/modwerk-fix-issue`, and close each issue once its fix is live.
