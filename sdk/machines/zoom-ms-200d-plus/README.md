# MS-200D+

Where the MS-200D+ stands and what comes next. Its progress is recorded in [machine.json](machine.json): the steps to the first mod, then each piece of the stack.

## Modwerk stack

The MS-200D+ is to get the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)), each piece built by extending the Octatrack's:

- **Modwerk base** (`stack.base`). A base whose hooks own the sites mods share and admit each mod by its budgets.
- **USB link** (`stack.link`). The site and the developer tools identify the unit over USB and read what is installed.
- **Setup and updates over USB** (`stack.flash`). A guided first install, then base updates over USB. The maker’s recovery always restores the unit.
- **Loading without a reflash** (`stack.loader`). Mods load for a trial, then Keep or Undo. A power cycle ends a trial.
- **Status page** (`stack.status`). The machine page shows the connected unit: its base, its mods and its load.
- **Diagnostics** (`stack.diagnostics`). Load meters, self-test results and the unit’s log, shared only with consent.
- **Device tools** (`stack.tools`). A coding agent drives the connected unit through the developer MCP’s device tools.

None of it is started. When a piece moves, set it in the profile, say here what exists and how it was checked, and update the recipe's table.
