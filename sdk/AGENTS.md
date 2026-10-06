# Working in sdk/

You are about to write or change a module: an Octatrack module under `octabam/modules/`, a Digitakt or Digitone mod under `digitakt/modules/` or `digitone/modules/`, or a draft under `drafts/`. Read the rules first.

@../docs/module-guides/README.md

1. Find the module's `category` in its manifest and read `docs/module-guides/<category>.md`. The index above lists them. Anything that acts in time also follows `docs/module-guides/sequencing.md`: use the instrument's own transport, tempo, track speed and swing, as Euclid does, and never keep a clock of your own.
2. Follow `docs/ADD_A_MODULE.md` for the folder, the manifest, the packages and the comparison with native octabam.
3. Walk the category guide's checklists. Tick an item only when you did it; write "not tested" in TESTING.md for what you could not verify. Never record a hardware behaviour you did not observe.
4. Run `npm run module:doctor -- <id>` until every line is green, then `npm run check`.
5. Octatrack DSP or ColdFire code: read `octabam/AGENTS.md` (the assembler and hardware traps) before writing it.

Never commit firmware, extracted stock code or tables, memory dumps or built images.
