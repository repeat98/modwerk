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
| ask | merges that touch CI, the bot, migrations, dependencies, sign-in, AGENTS.md, the guidelines or the SDK outside module folders; a first-time contributor's merge; turning down someone else's pull request | Telegram message with **Approve** and **Stop**; never runs without Approve |

The bot never pushes, releases, deploys, touches secrets, or works on firmware, a unit or an emulator. Those become **to-dos**, each with the `/modwerk-*` command that does it, kept in the ledger (`maintenance_bot_todos`, migration 0092). In any session at the owner's computer, `/modwerk-todo` lists them (`npm run todo`, signed in with the owner's `npm run board -- login`), runs the command, and ticks it off. A to-do whose item closes is dropped on the next daily run. Every action pins the head commit and comment count it was proposed against. If either changes before the action runs, the action is dropped and proposed again next pass. A merge is checked again for green checks at the moment it runs, then publishes through `workflow_dispatch` the way [author updates](MODULE_AUTHOR_UPDATES.md) do. The job's token cannot merge a change to `.github/workflows/`; the owner merges those.

The model's output is untrusted: it is limited to one file, every item is checked against the policy, public text may mention only the item's author and link only to Modwerk, and anything outside the policy is held back and listed in the report. Changes to `scripts/maintenance-bot/` always need the owner's OK.

## The agent board

The bot reads the [agent board](AGENT_BOARD.md)'s live threads and claims with the pull requests, and acts there as the owner. It answers a question addressed to the owner when the docs or code settle it (`board_reply`, 4 h window), and closes the owner's own finished threads (12 h). Ending someone else's thread or releasing a claim (`board_close`, `board_release`) needs the owner's OK. A question only the owner can answer becomes a to-do, `npm run board -- reply <id>`, which `/modwerk-todo` helps draft. Replies go through the board's own limits (`boardReply` in `server/agent-board.ts`); closing and releasing are recorded as the administrator's.

## Telegram

Each action is one message of two lines, what and when, with **Stop**, **Now** or **Approve**, and **Why?** for the reason. The report at 07:00 UTC is a few lines: what waits, what was done (counted), failures, and how many to-dos wait, naming the urgent ones. `/pause` stops all proposals and actions until `/resume`, and `/status` shows what is waiting. Only the owner's private chat counts.

## Setup and settings

After the pull request that adds the bot is merged and the Worker has deployed (migration 0091), the owner runs `npm run maintenance-bot:setup`. It needs `gh` signed in, `CLOUDFLARE_ACCOUNT_ID` set for wrangler, a bot token from @BotFather and a token from `claude setup-token`. It finds the owner's chat and generates the key, then sets four Worker secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `MAINTENANCE_BOT_KEY_SHA256`), two GitHub secrets (`MAINTENANCE_BOT_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`) and the webhook. It switches the bot on last, with the repository variable `MAINTENANCE_BOT_ENABLED=true`. Setting that variable to anything else switches the bot off.

The optional repository variables `MAINTENANCE_BOT_MODEL` (passes, default `claude-sonnet-5-5`) and `MAINTENANCE_BOT_DAILY_MODEL` (daily run, default `claude-opus-5-5`) pick the models. The window lengths are `WINDOW_HOURS` in the policy. `gh workflow run maintenance-bot.yml -f mode=daily` runs a pass with a report now.
