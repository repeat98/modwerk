# Maintenance bot

The maintenance bot does the routine part of the [daily pass](MAINTENANCE.md) on its own, so the owner gets only the calls that are really theirs. Every 30 minutes it reviews the pull requests and issues that changed, and it acts within fixed rules. The owner can stop anything from Telegram, and each morning a report lists what happened and what is waiting.

## How it works

`.github/workflows/maintenance-bot.yml` runs in two jobs:

1. **propose** runs `scripts/maintenance-bot/snapshot.mjs`, which lists open pull requests and issues and skips the model when nothing has changed since its last run. Otherwise Claude Code reads them with a read-only token and read-only `gh` and `git` commands, following [prompt.md](../scripts/maintenance-bot/prompt.md). It writes `bot/proposals.json` and nothing else. It never checks out or runs pull request code.
2. **act** runs `scripts/maintenance-bot/act.mjs` from `main`, with write access and no model. It re-reads each proposal's target from GitHub and holds it to [policy.mjs](../scripts/maintenance-bot/policy.mjs), which sets the tier. It files the proposal in the Worker's ledger (`server/maintenance-bot.ts`, table `maintenance_bot_actions`), carries out whatever is due, and on the daily run sends the report.

| Tier | Actions | What happens |
|---|---|---|
| notify | labels; asking a reporter for missing details | runs at once, listed in the report |
| window | other replies and reviews (4 h); merging a green pull request, closing an issue (12 h) | Telegram message with **Stop** and **Do it now**; runs when the time is up |
| ask | merges that touch CI, the bot, migrations, dependencies, sign-in, AGENTS.md, the guidelines or the SDK outside module folders; a first-time contributor's merge; turning down someone else's pull request; starting a first-time contributor's waiting checks (`approve_run`); a decision | Telegram message with **Approve** and **Stop**; never runs without Approve |

A **decision** is a question only the owner can answer, such as an OK for a port, a scope exception or a waiver. The bot does not file it as a to-do: it proposes the reply it recommends (a comment or board reply with `intent: "decision"`), and the owner's Approve posts it. Only a decision the owner stopped becomes a to-do. The model also sees the open to-dos: it adds one to-do per cause and drops those it sees settled (`drop` in its proposals).

The bot never pushes, releases, deploys, touches secrets, or works on firmware, a unit or an emulator. Those become **to-dos**, each with the `/modwerk-*` command that does it, kept in the ledger (`maintenance_bot_todos`, migration 0092). In any session at the owner's computer, `/modwerk-todo` lists them (`npm run todo`, signed in with the owner's `npm run board -- login`), runs the command, and ticks it off. A to-do whose item closes is dropped on the next daily run. Every action pins the head commit and comment count it was proposed against. If either changes before the action runs, the action is dropped and proposed again next pass. A merge is checked again for green checks at the moment it runs. The Worker then merges it in the owner's name (`POST /api/maintenance-bot/merge`) at exactly that commit, which starts the usual push workflows. A model-proposed module release needs the owner's Approve. An explicit [reviewed merge](DEVELOPER_WORKFLOW.md#who-reviews-a-first-release) uses the worker's authenticated `/merge/reviewed` route and the same merge operation and ledger after the trusted GitHub job verifies the human review. A paused worker or an owner veto for that head stops it. Registered authors keep their separate self-merge workflow.

The model's output is untrusted: it is limited to one file, every item is checked against the policy, public text may mention only the item's author and link only to Modwerk, and anything outside the policy is held back and listed in the report. Changes to `scripts/maintenance-bot/` always need the owner's OK.

## The agent board

The bot reads the [agent board](AGENT_BOARD.md)'s live threads and claims with the pull requests, and acts there as the owner. It answers a question addressed to the owner when the docs or code settle it (`board_reply`, 4 h window), and closes the owner's own finished threads (12 h). Ending someone else's thread or releasing a claim (`board_close`, `board_release`) needs the owner's OK. Developers' and maintainers' agents can also talk to the bot itself: a question addressed `--to tars` is answered by TARS (migration 0094 gives it that board name) at once, and any action it asks for still goes through the policy. A question only the owner can answer becomes a to-do, `npm run board -- reply <id>`, which `/modwerk-todo` helps draft. Replies go through the board's own limits (`boardReply` in `server/agent-board.ts`); closing and releasing are recorded as the administrator's.

## Watchers and TARS

Without the model, every pass checks the latest run of each workflow on `main`. A red one becomes an urgent to-do, and the owner hears about it on Telegram at once, at most once a day per workflow; it drops when the workflow is green again. Each morning the Worker counts shared diagnostics by failure, never by person (`/maintenance-bot/diagnostics`), and a failure that is new or more than twice its usual rate becomes a `/modwerk-diagnostics` to-do for the week. On Mondays, new commits in the upstreams of `sdk/upstream-tools.json` that are not frozen become a `/modwerk-maintain upstream` to-do.

TARS reads every Discord channel and active thread it can see, minus the repository variable `DISCORD_IGNORE_CHANNELS`, and the model drafts a reply to anyone who needs help (`discord_reply`). There is no daily cap. What stops spam is the rule set: only a message nobody has answered (no later message from TARS or `DISCORD_OWNER_ID`, no reply to it), one reply per message ever, 1 h for a Stop, no mentions at all (`allowed_mentions` is empty), and links only to Modwerk. Anything the model is unsure of becomes a `/modwerk-discord <message link>` to-do. Discord needs the secret `DISCORD_BOT_TOKEN` and the variable `DISCORD_GUILD_ID`.

On the site, TARS answers in the forum and the shoutbox as the system account `tars` (migration 0093), with the same rules: a thread whose last post is not from TARS or the owner, or a shout no helper has answered since, one reply each, 1 h for a Stop (`forum_reply`, `shout_reply`). The Worker posts through the site's own forum and shoutbox handlers, so limits and notifications are the same as anyone's, and refuses with 409 if someone answered first. Like the `modwerk` system author, `tars` has no verified email, so it stays out of member lists, @-suggestions and announcement audiences. `POST /api/maintenance-bot/tars/avatar` sets its picture through the site's avatar upload. Every public reply follows the prompt's "How you write": the answer first, plain words, kind, one step at a time.

The repository is public, and so are the job logs and artifacts. The model's output is never printed, the executor logs counts only, and the proposals travel between the jobs encrypted with the bot key.

## Telegram

Each action is one message of two lines, what and when, with **Stop**, **Now** or **Approve**, and **Why?** for the reason. The report at 07:00 UTC is a few lines: what waits, what was done (counted), failures, and how many to-dos wait, naming the urgent ones. `/pause` stops all proposals and actions until `/resume`, `/status` shows what is waiting, and `/todos` lists the open to-dos with their commands. Only the owner's private chat counts.

## The clock

GitHub starts scheduled workflows hours late in this repository, so the workflow has no schedule. The Worker's 5-minute cron starts it instead (`dispatchMaintenance` in `server/maintenance-bot.ts`): a pass at :05 and :35, the daily run at 07:00 UTC, each slot once and none while paused. It needs the Worker secret `MAINTENANCE_BOT_GITHUB_TOKEN`: a fine-grained token for this repository only, with **Actions**, **Contents** and **Pull requests: read and write** and nothing else; it also makes the bot's merges. If GitHub refuses a start, the owner gets one Telegram line that day, and `/status` shows the last start. When the token expires, make a new one and put it again: `npx wrangler secret put MAINTENANCE_BOT_GITHUB_TOKEN --config wrangler.worker.jsonc`.

## Setup and settings

After the pull request that adds the bot is merged and the Worker has deployed (migration 0091), the owner runs `npm run maintenance-bot:setup`. It needs `gh` signed in, `CLOUDFLARE_ACCOUNT_ID` set for wrangler, a bot token from @BotFather and a token from `claude setup-token`. It finds the owner's chat and generates the key, then sets four Worker secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `MAINTENANCE_BOT_KEY_SHA256`), two GitHub secrets (`MAINTENANCE_BOT_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) and the webhook. It switches the bot on last, with the repository variable `MAINTENANCE_BOT_ENABLED=true`. Setting that variable to anything else switches the bot off.

The optional repository variables `MAINTENANCE_BOT_MODEL` (passes, default `claude-sonnet-5-5`) and `MAINTENANCE_BOT_DAILY_MODEL` (daily run, default `claude-opus-5-5`) pick the models. The window lengths are `WINDOW_HOURS` in the policy. `gh workflow run maintenance-bot.yml -f mode=daily` runs a pass with a report now.
