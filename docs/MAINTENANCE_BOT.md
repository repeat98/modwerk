# Maintenance bot

The maintenance bot does the routine part of the [daily pass](MAINTENANCE.md) on its own, so the owner can stay passive: things happen unless the owner stops them, and only an exception to a rule or a change to the core waits for an Approve. Every 30 minutes it reviews the pull requests and issues that changed, and it acts within fixed rules. The owner can stop anything from Telegram, and each morning a report lists what happened and what can still be stopped.

## How it works

`.github/workflows/maintenance-bot.yml` runs in two jobs:

1. **propose** runs `scripts/maintenance-bot/snapshot.mjs`, which lists open pull requests and issues and works out what changed since the last successful pass ([lanes](#lanes-work-by-hardness)). Claude Code then reads that work with a read-only token and read-only `gh` and `git` commands, following [prompt.md](../scripts/maintenance-bot/prompt.md). It writes nothing: its proposals come back as structured output checked against a schema, and the job saves them to `bot/proposals.json`. It never checks out or runs pull request code.
2. **act** runs `scripts/maintenance-bot/act.mjs` from `main`, with write access and no model. It re-reads each proposal's target from GitHub and holds it to [policy.mjs](../scripts/maintenance-bot/policy.mjs), which sets the tier. It files the proposal in the Worker's ledger (`server/maintenance-bot.ts`, table `maintenance_bot_actions`), carries out whatever is due, and on the daily run sends the report.

| Tier | Actions | What happens |
|---|---|---|
| notify | labels; asking a reporter for missing details; starting a first-time contributor's waiting checks (a fork's run gets no secrets and a read-only token), unless the diff changes what the checks run from: `.github/`, `scripts/`, the package files, the test and lint configuration | runs at once, listed in the report |
| window | other replies and reviews (1 h); merging the owner's own green pull request, module releases included (1 h); merging anyone else's, closing an issue (12 h); a decision (24 h) | silent Telegram message with **Stop** and **Now**; runs when the time is up |
| ask | every base merge, for any device and whoever opened it (a pull request from or into a `base/…` branch, or one that changes a base's built files): it merges only after its review; merges that touch CI, the bot, migrations, dependencies, sign-in, AGENTS.md, the guidelines or SDK code outside module folders (documentation under `sdk/` does not count); someone else's merge that publishes a module; a first-time contributor's merge; turning down someone else's pull request; waiting checks whose diff changes what they run from; a decision that grants an exception | Telegram message with **Approve** and **Stop**; never runs without Approve |

A **decision** is a question only the owner can answer, such as an OK for a port or a shared hook. The bot does not file it as a to-do: it proposes the reply it recommends (a comment or board reply with `intent: "decision"`), which is posted after 24 hours unless the owner stops it. An answer that grants what the rules do not already allow (a waiver, a scope exception) or touches a unit's safety is marked `exception` and waits for Approve; the policy also asks whenever the answer's own words name a waiver or an exception. Only a decision the owner stopped becomes a to-do.

Only an ask, a failure and an urgent to-do make the owner's phone buzz. A window arrives silently, and the morning report names the next eight that can still be stopped. Each pass also drops what waits but can no longer happen (the item closed, new commits arrived, someone replied), so every message in Telegram is live. A merge whose required checks have not all reported waits for the next pass instead of failing. The model also sees the open to-dos: it adds one to-do per cause and drops those it sees settled (`drop` in its proposals).

The bot never pushes, releases, deploys, touches secrets, or works on firmware, a unit or an emulator. Those become **to-dos** for a desktop session, each with the `/modwerk-*` command that does it, kept in the ledger (`maintenance_bot_todos`, migration 0092). The shared list is the [agent board](AGENT_BOARD.md)'s wanted tasks: each pass, every open to-do about a pull request or issue stands there as a task from TARS, urgent ones with high priority, for a maintainer, a device reviewer or any developer to take (`npm run board -- messages --kind wanted`, then `take <id>`; the site shows them under Start developing). The two end together: a task whose pull request merged finishes its to-do, a task someone closed drops it, and a settled to-do ends its task. A to-do with no number (Discord, diagnostics, the bot's own health) can name a tester and stays the owner's, as does one whose note the board's text rules refuse. In any session at the owner's computer, `/modwerk-todo` lists them (`npm run todo`, signed in with the owner's `npm run board -- login`), runs the command, and ticks it off. A to-do whose item closes is dropped on the next daily run. Every action pins the head commit and comment count it was proposed against. If either changes before the action runs, the action is dropped and proposed again next pass. A merge is checked again for green checks at the moment it runs. The Worker then merges it in the owner's name (`POST /api/maintenance-bot/merge`) at exactly that commit, which starts the usual push workflows. A model-proposed release of someone else's module needs the owner's Approve. An explicit [reviewed merge](DEVELOPER_WORKFLOW.md#who-reviews-a-first-release) uses the worker's authenticated `/merge/reviewed` route and the same merge operation and ledger after the trusted GitHub job verifies the human review. A paused worker or an owner veto for that head stops it. Registered authors keep their separate self-merge workflow.

The model's output is untrusted: it is limited to one file, every item is checked against the policy, public text may mention only the item's author and link only to Modwerk, and anything outside the policy is held back and listed in the report. Changes to `scripts/maintenance-bot/` always need the owner's OK.

## Lanes: work by hardness

`scripts/maintenance-bot/lanes.mjs` splits each pass in two, and a lane with no work starts no model:

- **Hard lane**, the stronger model: pull requests whose head, checks, draft state, comments or labels changed. It reviews the code and proposes merges, with each pull request's whole source at its head commit as plain files beside `main` (fetched, never installed, built or run). No emulator runs here: they boot a stock OS image, and firmware never enters CI. At most six a pass, ready ones first; the rest come 30 minutes later. A pull request whose checks still run waits until they settle. Only this lane may propose a merge or a review: the executor holds back any other.
- **Light lane**, the lighter model: issues, the agent board, Discord, the forum and the shoutbox that changed. The daily run also sweeps what only time changes: every issue and board thread, and pull requests quiet for a week (a follow-up or a closure).

Each lane gets its own small context: its work, the other open items by title, and the ledger for its work plus every answer the owner stopped or approved. The Worker keeps the map of what the last successful pass saw (`items` in `maintenance_bot_state`); a failed pass does not move it, so its work is reviewed again. The job log prints each lane's token counts.

## When something breaks

A source that cannot be read (Discord, the forum, the board) takes only itself out of the pass: pull requests and issues are still reviewed. The owner gets one urgent to-do a day naming the source, and it goes away when the source is back. The same happens when the review itself fails three passes in a row.

## How it improves

The bot never edits its own rules: the policy is the boundary, and a change to `scripts/maintenance-bot/` needs the owner's Approve. Inside that it learns three ways.

- **Lessons.** The owner replies to an action's Telegram message with a few words: why it was stopped, or what was wrong with it. The Worker keeps the reply with that action's summary (`lesson/<id>` in `maintenance_bot_state`, the newest 60), and both lanes read them every pass as standing rules. `/lessons` lists them and `/forget <number>` removes one; `npm run todo -- lessons` prints them at the owner's computer.
- **Numbers.** Each pass adds what each lane's model read to a weekly count. Monday's report has one line: done, stopped, failed, dropped, requests waiting over two days, and last week's tokens for reviews and for the rest.
- **Its own weak spots.** A kind of action stopped three times in a week, or failed three times, becomes a to-do, `/modwerk-todo retro`. A desktop session reads the lessons and the prompt and proposes the change as an `Improvement:` pull request.

## The agent board

The bot reads the [agent board](AGENT_BOARD.md)'s live threads and claims with the pull requests, and acts there as the owner. It answers a question addressed to the owner when the docs or code settle it (`board_reply`, 1 h window), and closes the owner's own finished threads (12 h). Ending someone else's thread or releasing a claim (`board_close`, `board_release`) needs the owner's OK. Developers' and maintainers' agents can also talk to the bot itself: a question addressed `--to tars` is answered by TARS (migration 0094 gives it that board name) at once, and any action it asks for still goes through the policy. A question only the owner can answer becomes a to-do, `npm run board -- reply <id>`, which `/modwerk-todo` helps draft. Replies go through the board's own limits (`boardReply` in `server/agent-board.ts`); closing and releasing are recorded as the administrator's.

## Watchers and TARS

Without the model, every pass checks the latest run of each workflow on `main`. A red one becomes an urgent to-do, and the owner hears about it on Telegram at once, at most once a day per workflow; it drops when the workflow is green again. Each morning the Worker counts shared diagnostics by failure, never by person (`/maintenance-bot/diagnostics`), and a failure that is new or more than twice its usual rate becomes a `/modwerk-diagnostics` to-do for the week. On Mondays, new commits in the upstreams of `sdk/upstream-tools.json` that are not frozen become a `/modwerk-maintain upstream` to-do.

TARS reads every Discord channel and active thread it can see, minus the repository variable `DISCORD_IGNORE_CHANNELS`, and the model drafts a reply to anyone who needs help (`discord_reply`). There is no daily cap. What stops spam is the rule set: only a message nobody has answered (no later message from TARS or `DISCORD_OWNER_ID`, no reply to it), one reply per message ever, 1 h for a Stop, no mentions at all (`allowed_mentions` is empty), and links only to Modwerk. Anything the model is unsure of becomes a `/modwerk-discord <message link>` to-do. Discord needs the secret `DISCORD_BOT_TOKEN` and the variable `DISCORD_GUILD_ID`.

On the site, TARS answers in the forum and the shoutbox as the system account `tars` (migration 0093), with the same rules: a thread whose last post is not from TARS or the owner, or a shout no helper has answered since, one reply each, 1 h for a Stop (`forum_reply`, `shout_reply`). The Worker posts through the site's own forum and shoutbox handlers, so limits and notifications are the same as anyone's, and refuses with 409 if someone answered first. Like the `modwerk` system author, `tars` has no verified email, so it stays out of member lists, @-suggestions and announcement audiences. `POST /api/maintenance-bot/tars/avatar` sets its picture through the site's avatar upload. Every public reply follows the prompt's "How you write": the answer first, plain words, kind, one step at a time.

The repository is public, and so are the job logs and artifacts. The model's output is never printed, the executor logs counts only, and the proposals travel between the jobs encrypted with the bot key.

The [five-fix eval pilot](AGENT_EVALS.md#five-fix-pilot) checks newly merged Node fixes for gaps in the replay suite. TARS posts one wanted task per gap and reports how many independently verified cases land.

## Telegram

Each action is one message of two lines, what and when, with **Stop**, **Now** or **Approve**, and **Why?** for the reason. The report at 07:00 UTC is a few lines: what waits, what was done (counted), failures, and how many to-dos wait, naming the urgent ones. `/pause` stops all proposals and actions until `/resume`, `/status` shows what is waiting, `/todos` lists the open to-dos with their commands, and `/lessons` lists what the owner's replies taught it. Only the owner's private chat counts.

## The clock

GitHub starts scheduled workflows hours late in this repository, so the workflow has no schedule. The Worker's 5-minute cron starts it instead (`dispatchMaintenance` in `server/maintenance-bot.ts`): a pass at :05 and :35, the daily run at 07:00 UTC, each slot once and none while paused. It needs the Worker secret `MAINTENANCE_BOT_GITHUB_TOKEN`: a fine-grained token for this repository only, with **Actions**, **Contents** and **Pull requests: read and write** and nothing else; it also makes the bot's merges. If GitHub refuses a start, the owner gets one Telegram line that day, and `/status` shows the last start. When the token expires, make a new one and put it again: `npx wrangler secret put MAINTENANCE_BOT_GITHUB_TOKEN --config wrangler.worker.jsonc`.

## Setup and settings

After the pull request that adds the bot is merged and the Worker has deployed (migration 0091), the owner runs `npm run maintenance-bot:setup`. It needs `gh` signed in, `CLOUDFLARE_ACCOUNT_ID` set for wrangler, a bot token from @BotFather and a token from `claude setup-token`. It finds the owner's chat and generates the key, then sets four Worker secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `MAINTENANCE_BOT_KEY_SHA256`), two GitHub secrets (`MAINTENANCE_BOT_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) and the webhook. It switches the bot on last, with the repository variable `MAINTENANCE_BOT_ENABLED=true`. Setting that variable to anything else switches the bot off.

The optional repository variables `MAINTENANCE_BOT_MODEL` (light lane, default `claude-sonnet-5-5`) and `MAINTENANCE_BOT_HARD_MODEL` (hard lane, default `claude-opus-5-5`) pick the models. The window lengths are `WINDOW_HOURS` in the policy. `gh workflow run maintenance-bot.yml -f mode=daily` runs a pass with a report now.
