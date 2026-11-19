# Shared agent sessions: show the owner where contributing gets in the way

Since 19 November 2026. Developers build with coding agents on their own computers, and what slows them down (a guide that sent the agent the wrong way, a check that failed without saying why, a setup step that took an hour) mostly stays in their sessions. A developer can now send the owner the conversation of one session, so the owner can fix what got in the way. Sharing is voluntary, one session at a time, and never needed to contribute.

## Ask once, at the end

When a task is done (`npm run pr:ready` says Ready, or the developer stops), the agent asks the developer once, in one line, whether to share this session. `pr:ready` prints the reminder, and `npm run session -- status` says what to do:

- **ask** (the default): ask, and share only on a yes. Write the developer's answer and the agent's own short account of what got in the way as the note: `npm run session -- share --note "…"`.
- **always**: the developer said to share every session. Share it and say so in a line.
- **never**: the developer said not to be asked. Don't offer it.

When the developer answers "always" or "never", save it with `npm run session -- prefer always|never` (in `~/.config/modwerk/session-sharing.json`). Never share without a yes or a standing "always". Ask once per session, never twice.

## What leaves the computer

Only the conversation: the developer's prompts, the agent's replies, and one line per tool call (the command or file it touched, and whether it failed). The script finds the session's transcript (Claude Code's in `~/.claude/projects/`, Codex's in `~/.codex/sessions/`) and removes, before anything is sent:

- every tool output, the agent's thinking, injected context (skill bodies, hook output, compaction summaries, context files) and subagent turns;
- code blocks longer than 12 lines, hex dumps, runs of hex values and long data blobs;
- secrets (tokens, keys, passwords, bearer headers), email addresses, IP addresses, home folders, the computer's user and host name.

What remains still looking like firmware or stock code (disassembly, long hex or number tables) stops the upload: the script names the entries, and `--skip 3,7` leaves them out. `npm run session -- preview` writes what would be sent to `~/.cache/modwerk/session-preview.json` without sending anything; offer it when the developer wants to look first. The Worker runs the same checks again and refuses what fails them.

## Who reads it, and for how long

Only the developer who shared it and the site's administrators. The owner may analyse sessions with Claude, which sends them to Anthropic. Nothing reaches GitHub, module authors or other developers. A session is kept 90 days, then deleted; `npm run session -- list`, `get <id>` and `delete <id>` show and remove your own at any time. Suspending an account deletes its sessions at once, deleting the account deletes them too, and the account export lists them. At most 30 kept per developer and 10 shares a day. The record of processing is in [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md).

## The owner's side

`npm run session -- pull`, signed in for the board with the administrator account, saves every shared session into `~/.cache/modwerk-local/sessions/` with an `INDEX.md`. Developers' names and quotes stay there and in chat, like diagnostics ([MAINTENANCE.md](MAINTENANCE.md)). What a session shows becomes a guide edit, a check or a fix, written without names.

## API

Writes need the board session (`X-Modwerk-Developer`) and the site's `Origin`.

- `POST /api/agent-sessions` `{consent, data}`: `data` is the session JSON, gzip, base64, at most 1 MB packed. `consent` is `SESSION_CONSENT_VERSION`; a stale client is refused.
- `GET /api/agent-sessions`: your own; `?all=1` everyone's, for administrators.
- `GET /api/agent-sessions/<id>` and `DELETE /api/agent-sessions/<id>`: yours, or any for administrators.

The format, the scrubbing and the checks are in `src/community/agent-sessions.ts`, shared by the client (`scripts/agent-session.mjs`) and the Worker (`server/agent-sessions.ts`); the table is `agent_sessions` (migration 0099).
