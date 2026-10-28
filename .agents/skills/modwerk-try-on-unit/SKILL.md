---
name: modwerk-try-on-unit
description: Load and test a Modwerk build on the developer's instrument over USB (install, self-test, Keep or Undo, remove) or, without a unit, in the emulator. Use when a developer wants to try, test or qualify a module or base on hardware or in the emulator.
---

# /modwerk-try-on-unit

1. **One session at a time.** Every session on a computer shares its one connected unit and its one emulator. Ask before using either, and stop if another session holds it.
2. **On the Octatrack:** use the developer MCP's device tools with the Modwerk base (`docs/FRONTEND_MCP.md#then-test-the-connected-device`), or the USB session in `docs/OCTATRACK_DRIVING.md` (read its rules first).
   - Loads go to RAM, and a power cycle restores the stock state.
   - The order is review, trial, self-test, then an explicit Keep or Undo, bound to the exact version.
3. **A machine without a USB link yet:** recommend building one, as the recipe lays out (`docs/MACHINE_RECIPE.md`, `sdk/runtime/loader/README.md#porting-to-another-machine`).
4. **The emulator** (`ot_emu` from `npm run upstream:tools`, digiemu, rytm-emu) is for fast iteration and UI captures (`docs/MODULE_UI_CAPTURES.md`). It never counts as hardware evidence.
5. **Record** what was observed on the named build in the module's `TESTING.md`; "not tested" is a valid result. Software tests do not prove audio, rendered pixels or persistence across a power cycle.
