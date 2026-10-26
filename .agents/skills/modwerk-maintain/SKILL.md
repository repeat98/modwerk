---
name: modwerk-maintain
description: The owner's daily Modwerk maintenance pass - parallel workers for pull requests, issues, the beta and upstream, then one briefing. Only when the owner (GitHub repeat98) says "maintain" or "maintain prs|issues|beta|upstream"; never in a contributor's session.
---

# /modwerk-maintain [prs|issues|beta|upstream]

If the developer is not the owner, say that this is the owner's pass and offer `/modwerk-start` instead.

Otherwise run the pass in `docs/MAINTENANCE.md` exactly. It holds the steps, each worker's section, and what needs the owner's yes.
- With an argument, run only that worker.
- Text pasted with the command, such as Discord feedback, goes to the beta worker.
- Start from the newest briefing in `~/.cache/modwerk-local/maintain/`, and write today's there.
- Nothing is merged, closed, declined, posted, or run on the unit or the emulator without the owner's yes.
