---
name: modwerk-todo
description: The owner's to-do list from the maintenance bot - work only a session at the owner's computer can do (fixes, hardware runs, refreshes), each with the /modwerk-* command that does it. Use when the owner (GitHub repeat98) says "todo", asks what the bot left for them, or names a to-do; never in a contributor's session.
---

# /modwerk-todo [id or #number]

If the developer is not the owner, say that this is the owner's list and offer `/modwerk-start` instead.

The [maintenance bot](../../../docs/MAINTENANCE_BOT.md) adds to-dos; this skill works them off. Keep every reply short: the owner wants as little text as possible.

1. `npm run todo` lists the open to-dos, urgent first: id, command, item, note. If it asks for a sign-in, run `npm run board -- login`.
2. With an argument, take that to-do. Without one, show the list in a few lines, recommend the first urgent one (else the oldest) and start it unless the owner picks another.
3. Check that it still applies (`gh issue view <n>`, `gh pr view <n>`). If it no longer does, `npm run todo -- drop <id>` and say why in one line.
4. Run its command: invoke that `/modwerk-*` skill with its argument, and follow that skill's rules (unit steps, approvals, the pull request).
5. When the work is finished, or handed to a pull request the bot can take from here, `npm run todo -- done <id>`. If it stopped halfway, leave it open and say in one line what is left.
6. Offer the next to-do in one line.
