---
name: modwerk-new-module
description: Build a new Modwerk module or port an existing one, from the duplicate and permission checks to an open pull request. Use when a developer wants to make, create or port a module for an Elektron instrument.
---

# /modwerk-new-module

Follow `docs/ADD_A_MODULE.md` and the rules in `AGENTS.md`, in this order.

1. **Check what exists** (`docs/DEVELOPER_WORKFLOW.md#check-what-already-exists`): the library, `sdk/catalog.json`, the machine's module folder, `sdk/drafts/` and open pull requests. If something already does the job, suggest extending it with `/modwerk-update-module`, after its author's OK.
2. **Refuse protected work** (`docs/DEVELOPER_WORKFLOW.md#refuse-infringing-work`). A port needs its author's permission or a licence that allows it. When either is unclear, ask before writing anything. A module modelled on another current product of the same maker (Tonverk's FX machines, say) waits until the owner has agreed it with the maker, even in your own DSP and under new names.
3. **Read** `docs/module-guides/README.md` and the guide for its category.
   - For the Octatrack, also `sdk/octabam/AGENTS.md` and `sdk/octabam/docs/TRAPS.md`.
   - Anything that acts in time follows `docs/module-guides/sequencing.md`.
4. **Plan, then wait for the developer's OK.** The plan covers:
   - its category, by where it acts (`docs/module-guides/README.md#choose-the-category`): an effect processes its slot's audio, a module that makes or replaces a track's sound is a machine, one that makes notes is a MIDI generator. When it is unclear, the developer asks the owner in an issue first;
   - the id, the controls and the exact button steps to reach it;
   - how it hooks in: the base's existing hooks first (`docs/module-guides/README.md#choose-how-a-module-hooks-in`); on any machine but the Octatrack, also what its planned base will own (the Modwerk stack section of `sdk/machines/<id>/README.md`, `docs/MACHINE_RECIPE.md`), which no module builds for the others;
   - its UI claims;
   - on the Octatrack, the base and USB lifecycle (`docs/ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle`);
   - for a new FX, one effect per module (`docs/module-guides/effects.md#one-effect-per-module`): a set of different effects becomes one module each, and a stock site they share a hook first;
   - for a new FX, a DSP budget measured against SPRING REV.
5. **Scaffold and build.** Use `npm run module:new` (the guide's "Choose your path"), work in its fast loop, and run `npm run module:doctor -- <id>` until it is green.
6. **Test** on their unit (`/modwerk-try-on-unit`) or in the emulator. Record only what was observed, on the named build.
7. **Finish:**
   - docs, credits, and a thumbnail in the shared style (`docs/ADD_A_MODULE.md#module-thumbnail-style`);
   - release notes in `src/community/module-changelogs/`;
   - then `/modwerk-pr-ready` and the pull request.

   A new module ships in a pull request of its own, and the owner reviews its first release.
