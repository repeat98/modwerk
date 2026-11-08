# Working in sdk/machines/

You are changing a machine: its profile, core, base, hooks or USB link. Every machine, unlocked or in the works, gets the Octatrack's stack. Read [docs/MACHINE_RECIPE.md](../../docs/MACHINE_RECIPE.md) first, then the machine's own guide here: its Modwerk stack section says where it stands and what comes next.

- The base is Modwerk's and lives in this repository, started from a pinned upstream core's source where one exists. A hook goes into the base; do not wait for an upstream release to carry it.
- What several modules share (a send bus, an FX list, shared pages or menu rows, per-kit state) belongs to the base, and each module adds one record to it. A module never carries it for the others.
- Extend the Octatrack's loader, USB link, builder, MCP and page with the machine's glue. Do not design a second one.
- When a piece moves, update the recipe's table and the machine's guide in the same pull request.
- A new device starts with a message to the owner ([talk to the owner first](../../docs/ADD_A_MACHINE.md#talk-to-the-owner-first)). A base, a link or a loader port is shared SDK work in its own owner-reviewed pull request, never inside a module release.
- Never commit firmware, stock code or tables, memory dumps or built images.
