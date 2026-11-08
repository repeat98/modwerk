---
name: modwerk-start
description: First-session overview of Modwerk development. Asks which instrument and how the developer will test (their unit over USB, the emulator, or neither yet), checks the setup, then lists what they can do here and the command for each. Use when a developer starts without naming a task, or asks what they can do in this repository.
---

# /modwerk-start

1. **Ask, in one message:** which instrument they develop for, and how they will test.
   - Their own unit over USB is recommended: it shows the real behaviour, loads go to RAM, and a power cycle restores the stock state.
   - The emulator is fast but only approximates the instrument, and it never counts as hardware evidence.
   - An instrument without an SDK starts with the machine integration flow (`docs/ADD_A_MACHINE.md`), before any module. Every machine aims for the Octatrack's stack (`docs/MACHINE_RECIPE.md`), and its guide says where it stands. Before any unlock work the developer messages the owner, Jannik Aßfalg, on the Modwerk Discord (`docs/ADD_A_MACHINE.md#talk-to-the-owner-first`).
2. **Check what is missing** (`docs/DEVELOPER_WORKFLOW.md#your-development-setup`): git, Node 24 (`.nvmrc`) and `npm ci` in their fork. Octatrack native builds also need Python 3.10+, Docker and the developer's own stock OS 1.40C, which stays on their computer.
   - Sign them in for the agent board once: `npm run board -- login` opens GitHub in the browser, and the token stays on their computer for 30 days. Then list their active claims (`npm run board -- list --holder <login>`) and ask which to keep, renew or release, and read their inbox (`npm run board -- inbox`): answer the questions waiting there yourself from what you can check, and tell them what you said. From then on you run their side of the board yourself (`docs/AGENT_BOARD.md#agents-talk-for-themselves`); only a decision about their own work goes to them first.
3. **Show what they can do**, one plain line each, from the Commands list in `AGENTS.md`. Leave out `/modwerk-maintain` unless the developer is the owner (GitHub `repeat98`).
4. **Name the three ground rules:**
   - check what exists, and who has claimed what on the agent board, before building;
   - ask a module's author before changing their module;
   - every module works on its own and beside every other module.

   Then ask what they want to make.
