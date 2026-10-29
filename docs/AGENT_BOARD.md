# Agent board: claims every developer's agent can see

Since 29 October 2026 ([decision](decisions/2026-10-29-agent-board.md)). Several developers build modules with agents, each on their own computer, and before the board Modwerk learned about overlapping work only when the second pull request opened: two ports of the same module, or two hook proposals taking the same index in `events.json`, where a released index is never renumbered. The board is a shared list of **claims**, "this developer is working on this, until this date", that agents read before they plan and write as they start. Everyone can read it, on Start developing (`#submit`) or with `npm run board -- list`.

## Claims

A claim has a kind and a key, and each key has one holder at a time:

| Kind | Key | Example |
| --- | --- | --- |
| `module` | machine and module id | `octatrack/tape-echo`, `digitone/swarm` |
| `hook` | machine and hook or table index: its `index` in `sdk/machines/octatrack/events.json`, or its place in the core's `interface.json` on the elemod machines | `octatrack/39`, `digitakt/events/7`, `digitakt/tables/1` |
| `migration` | D1 migration number | `0085` |
| `dsp-region` | machine and DSP memory claim name; no file declares these yet, so they are claimed by hand | `octatrack/fx2-delay-line` |

A claim also records the holder's GitHub login, the branch, the pull request once there is one, and a note of at most 120 characters of plain prose: the server refuses links, paths, addresses, hashes, code and anything token-like in it.

- **Lifetime.** Without a pull request a claim lapses after 14 days; claiming it again renews it. Once a pull request is linked it holds while that pull request is open. The Worker's hourly run links a claim to the open pull request on its branch (`<holder>:<branch>`), releases claims whose pull request was merged or closed and those of suspended accounts, and records why.
- **Limits.** At most 10 active claims per person and 30 claim writes an hour.
- **Numbers.** The board does not know which numbers `main` uses. Take the highest on current `origin/main`, skip the active claims above it, and claim the next; a conflict means someone was first, so take the next one.
- **Release** your own claim with `npm run board -- release <id>`; administrators release any on Start developing.

## The commands do it

Agents use the board because the commands they already run read and write claims, and the context files say only what those cannot.

- **`npm run board -- login`** opens GitHub in the browser. GitHub answers on a one-shot listener on `127.0.0.1`, which trades a one-time code (bound to a challenge only the script knows) for a 30-day board session, saved in `~/.config/modwerk/developer.json` (0600). Any GitHub account can sign in; a board session never opens the creator routes a developer session does. `list`, `claim`, `renew`, `release`, `whoami` and `check` are the other commands; `npm run board` prints them.
- **`npm run module:new`** stops before writing anything when someone else holds the module, and claims it when the developer is signed in.
- **`npm run module:doctor`** has a `board claim` line: red for a new module (its folder is not on `main`) nobody claimed, or for anyone's module someone else holds.
- **`npm run pr:ready`** reads what the branch adds that needs a claim: a new module folder, a new `events.json` index or core `interface.json` entry, a new migration. It claims each for the signed-in developer, and stops Ready when someone else holds one or the developer is signed out.
- **CI** (`npm run check -- --base`, the `board` step) fails a pull request that adds what someone other than its author holds.
- **The developer MCP** has `board_claims`, `board_claim` and `board_release` ([FRONTEND_MCP.md](FRONTEND_MCP.md#the-agent-board)).

An unreachable board, or one not yet deployed, is a warning everywhere, never a failure. Tests and `MODWERK_BOARD=off` never reach it; `MODWERK_API` and `MODWERK_SITE` point the script at another Worker and the site it trusts.

The context files carry the rest: the Modules rules in [AGENTS.md](../AGENTS.md#modules), the skills (`/modwerk-new-module`, `/modwerk-pr-ready`, `/modwerk-start`, `/modwerk-update-module`, `/modwerk-review-prs`), [Check what already exists](DEVELOPER_WORKFLOW.md#check-what-already-exists), [Propose a hook](module-guides/README.md#propose-a-hook) and the maintenance pass's [pull request worker](MAINTENANCE.md#pull-request-worker). `src/catalog/agent-board-context.test.ts` fails when an edit drops the board from any of them or from the commands.

## Safety

Claims come from other people's agents and reach your agent's context. The only free text is the note; the MCP returns it as `untrusted_note`, and the skills act only on the structured fields (kind, key, holder, expiry), never on what a note says. The board stores no firmware bytes, addresses or stock code: the [modding guidelines](../MODDING_GUIDELINES.md) apply to claims too. Claims belong to accounts, so suspending one releases them, and deleting one removes them. Ended claims are deleted 90 days after they end, as the [privacy notice](https://modwerk.app/#privacy) says; the record of processing is in [LEGAL_COMPLIANCE.md](LEGAL_COMPLIANCE.md).

## API

Reads are public; writes need the `X-Modwerk-Developer` token from `npm run board -- login` or the creator sign-in, and the site's `Origin`.

- `GET /api/agent-board/claims?kind=&key=&holder=&released=1`: active claims, newest first; `released=1` adds the last 100 released or lapsed ones.
- `GET /api/agent-board/me`: the signed-in login.
- `POST /api/agent-board/claims` `{kind, key, branch?, pullRequest?, note?}`: claim, or renew your own; `409` names the holder.
- `POST /api/agent-board/claims/<id>/renew` `{branch?, pullRequest?, note?}` and `DELETE /api/agent-board/claims/<id>`.

The table is `agent_claims` (migration 0084), in `server/agent-board.ts`; the client is `scripts/agent-board.mjs`.

## Later

Findings and questions between agents (a trap one agent hit, a question to a module's owner) are left out until claims have run for a while, and would get their own review.
