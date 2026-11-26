# Shared agent sessions: show the owner where contributing gets in the way

Since 19 November 2026. Developers build with coding agents on their own computers, and what slows them down (a guide that sent the agent the wrong way, a check that failed without saying why, a setup step that took an hour) mostly stays in their sessions. A developer can now send the owner the conversation of one session, so the owner can fix what got in the way. Sharing is voluntary, one session at a time, and never needed to contribute.

## Review the session first

Since 20 November 2026. Before the final message of a session that did real work (about half an hour or 40 tool calls, not a short question), the agent looks back at it once with `/modwerk-post-eval`. `pr:ready` prints the reminder.

1. **Measure.** `npm run session -- review` reads this session's transcript and prints the wall time per tool, the slowest calls, the failed calls, what ran three times or more, how long questions waited for the developer, the times the developer stopped the agent or refused a call, the prompts that read like a correction or frustration (pasted text left out), and the development processes that used the most processor time on this computer. Nothing is sent. A transcript holds no processor time, so wall time is the measure for calls, and it includes waiting for a permission prompt.
2. **Add what the figures cannot show:** where you guessed and were wrong, which guide, check or error message sent you the wrong way or said nothing, and what the developer had to correct or say twice.
3. **Tell the developer at most three findings**, a line each: what cost time, why, and the fix. When nothing would spare a later session time, say so in a line and stop.

A finding with a concrete fix becomes a pull request of its own, titled `Workflow: …` and labelled `workflow` from that: a check that names its cause, a quicker command, a script for what you ran by hand, a corrected guide line. It holds one change, branched from current `main`, and stays off the task's pull request and out of a module release, so every one can be found under the label. Its description says what cost time, how much the review measured, and what changes, without names or quotes from the session. The rest of [Fixes and improvements](DEVELOPER_WORKFLOW.md#fixes-and-improvements) applies: prefer a check to a sentence, ask first in a contributor's fork, and open an issue for what you cannot fix.

## Ask once, at the end

When a task is done (`npm run pr:ready` says Ready, or the developer stops) and the review is told, the agent asks the developer once whether to share this session, and says why it helps:

- What slowed a session down stays in it. The owner sees the pull request, not the hour before it.
- The owner turns what a session shows into a guide edit, a check or a fix, which spares the developer's next session and every other developer the same.
- The conversation shows what was tried and in which order. The review and the note hold only what the agent noticed.

`pr:ready` prints the reminder, and `npm run session -- status` says what to do:

- **ask** (the default): ask, and share only on a yes. Write the developer's answer and the agent's own short account of what got in the way as the note: `npm run session -- share --note "…"`.
- **always**: the developer said to share every session. Share it and say so in a line.
- **never**: the developer said not to be asked. Don't offer it.

A session that goes on after it was shared is shared again with `--new`: what the developer's earlier shares of it already hold stays out, so the owner gets only the rest, without working out `--skip` by hand.

When the developer answers "always" or "never", save it with `npm run session -- prefer always|never` (in `~/.config/modwerk/session-sharing.json`). Never share without a yes or a standing "always". Ask once per session, never twice.

## What leaves the computer

Only the conversation: the developer's prompts, the agent's replies, and one line per tool call (the command or file it touched, and whether it failed). The script finds the session's transcript (Claude Code's in `~/.claude/projects/`, Codex's in `~/.codex/sessions/`) and removes, before anything is sent:

- every tool output (including the output of commands the developer ran with `!`, which keep only the command), the agent's thinking, injected context (skill bodies, hook output, compaction summaries, context files) and subagent turns;
- code blocks longer than 12 lines, hex dumps, runs of hex values and long data blobs;
- secrets (tokens, keys, passwords, bearer headers), email addresses, IP addresses, home folders, the computer's user and host name, and the developer's names as git knows them (`user.name`, and `user.email` before the @).

What remains still looking like firmware or stock code (disassembly, long hex or number tables) stops the upload: the script names the entries, and `--skip 3,7` leaves them out. `npm run session -- preview` writes what would be sent to `~/.cache/modwerk/session-preview.json` without sending anything; offer it when the developer wants to look first. The Worker runs the same checks again and refuses what fails them.

## Who reads it, and for how long

Only the developer who shared it and the site's administrators. The owner may analyse sessions with Claude, which sends them to Anthropic. Nothing reaches GitHub, module authors or other developers. A session is kept 90 days, then deleted; `npm run session -- list`, `get <id>` and `delete <id>` show and remove your own at any time. Suspending an account deletes its sessions at once, deleting the account deletes them too, and the account export lists them. At most 30 kept per developer and 10 shares a day. The record of processing is in [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md).

## The owner's side

`npm run session -- pull` saves every shared session into `~/.cache/modwerk-local/sessions/` with an `INDEX.md`. It signs in to the owner's Modwerk account, the one with the administrator role, as the site's sign-in does: email and password at a prompt (the password hidden), or from `MODWERK_EMAIL` and `MODWERK_PASSWORD` for that one command. The password is never stored, and the pull signs out when it is done. A board session never reads other developers' sessions, even on an administrator's account. The owner runs it in their own terminal, so the password never passes through an agent. Developers' names and quotes stay there and in chat, like diagnostics ([MAINTENANCE.md](MAINTENANCE.md)). What a session shows becomes a guide edit, a check or a fix, written without names.

## API

Writes need the board session (`X-Modwerk-Developer`) and the site's `Origin`.

- `POST /api/agent-sessions` `{consent, data}`: `data` is the session JSON, gzip, base64, at most 1 MB packed. `consent` is `SESSION_CONSENT_VERSION`; a stale client is refused.
- `GET /api/agent-sessions`: your own; `?all=1` everyone's, for administrators (`X-Octamod-Admin` from `POST /api/auth/admin`, or a member account with the administrator role).
- `GET /api/agent-sessions/<id>` and `DELETE /api/agent-sessions/<id>`: yours, or any for administrators.

The format, the scrubbing and the checks are in `src/community/agent-sessions.ts`, shared by the client (`scripts/agent-session.mjs`) and the Worker (`server/agent-sessions.ts`); the table is `agent_sessions` (migration 0099).
