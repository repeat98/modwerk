---
name: modwerk-try-on-unit
description: Load and test a Modwerk build on the developer's instrument over USB (install, Keep or Undo, remove, and the self-test of the running set) or, without a unit, in the emulator. Use when a developer wants to try, test or qualify a module or base on hardware or in the emulator.
---

# /modwerk-try-on-unit

1. **One session at a time on the unit.** Every session on a computer shares its one connected unit. Ask before using it, and stop if another session holds it. Emulators need no turn: each session may run its own, with its own socket path, card copy and MCP (`--data-dir`, `--device-socket`); never attach to one another session started. On the owner's computer, sessions share one emulator (`docs/OWNER_OPERATIONS.md`).
2. **On the Octatrack:** use the developer MCP's device tools with the Modwerk base (`docs/FRONTEND_MCP.md#then-test-the-connected-device`), or the USB session in `docs/OCTATRACK_DRIVING.md` (read its rules first).
   - A trial loads to RAM and a power cycle ends it. A Keep writes the set to the card, and the unit starts with it until it is removed: on a RAM-booted test base it replaces the owner's kept set (`docs/OCTATRACK_DRIVING.md`).
   - The order is review, trial, then an explicit Keep or Undo, bound to the exact version.
   - A module under development, draft or listed: `npm run module:dev -- <id>` builds it from source and trials it in one command, and `--watch` repeats that on every save (`docs/ADD_A_MODULE.md#the-fast-loop`). A trial it starts is undone when it ends; Keep only with the developer's OK.
   - For the scripted run a release needs, `npm run device:qualify -- --keeps-ok --testing-entry run.md <package>` (`docs/ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle`). It Keeps each install and removal: note the flashed set first. Listening, the power cycle and persistence stay the developer's. No self-test runs at install; SELF TEST (PROJ > MODWERK, or Status on the site) checks the running set.
3. **A machine without a USB link yet:** recommend building one, as the recipe lays out (`docs/MACHINE_RECIPE.md`, `sdk/runtime/loader/README.md#porting-to-another-machine`).
4. **The emulator** (`ot_emu` from `npm run upstream:tools`, digiemu, rytm-emu) is for fast iteration and UI captures (`docs/MODULE_UI_CAPTURES.md`). It never counts as hardware evidence.
5. **Record** what was observed on the named build in the module's `TESTING.md`; "not tested" is a valid result. Software tests do not prove audio, rendered pixels or persistence across a power cycle.
