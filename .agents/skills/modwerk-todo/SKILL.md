---
name: modwerk-todo
description: The owner's to-do list from the maintenance bot - work only a session at the owner's computer can do (fixes, hardware runs, refreshes), each with the /modwerk-* command that does it. Use when the owner (GitHub repeat98) says "todo", asks what the bot left for them, or names a to-do; never in a contributor's session.
---

# /modwerk-todo [id or #number]

If the developer is not the owner, say that the shared list is the agent board's wanted tasks, show them with `npm run board -- messages --kind wanted`, and take the one they pick with `npm run board -- take <id>`, then run the command its text names. The rest of this skill is the owner's list, which also holds the to-dos that cannot be shared.

The [maintenance bot](../../../docs/MAINTENANCE_BOT.md) adds to-dos; this skill works them off. Keep every reply short: the owner wants as little text as possible.

1. `npm run todo` lists the open to-dos, urgent first: id, command, item, note. If it asks for a sign-in, run `npm run board -- login`.
2. With an argument, take that to-do. Without one, show the list in a few lines, recommend the first urgent one (else the oldest) and start it unless the owner picks another.
3. Check that it still applies (`gh issue view <n>`, `gh pr view <n>`; a board to-do, item #0, names its thread in `npm run board -- messages`). If it no longer does, `npm run todo -- drop <id>` and say why in one line.
4. Run its command: invoke that `/modwerk-*` skill with its argument, and follow that skill's rules (unit steps, approvals, the pull request). For `npm run board -- reply <id>`, show the question in a line or two, draft the answer with the owner, and post it with the answer in quotes once they agree. For `gh run view <id> --log-failed` (main is red), read the failure and fix it in its own `Fix:` pull request; it drops by itself once the workflow is green on main.
   For `/modwerk-todo retro` (the bot's weekly look at itself found a kind of action that keeps being stopped or failing): read `npm run todo -- lessons`, `scripts/maintenance-bot/prompt.md` and `policy.mjs`, and propose the smallest change that would have avoided the pattern as its own `Improvement:` pull request. A lesson the prompt now states can go: tell the owner its number for `/forget`.
5. When the work is finished, or handed to a pull request the bot can take from here, `npm run todo -- done <id>`. If it stopped halfway, leave it open and say in one line what is left.
6. Offer the next to-do in one line.
