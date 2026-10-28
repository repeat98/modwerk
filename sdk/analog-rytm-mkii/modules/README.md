# Analog Rytm MKII modules

Each folder here is a library module for the Analog Rytm MKII on OS 1.74 and core-ar2 0.7 (modules built for 0.3 link with it, but for mods that patch a page's entry or a page key's list themselves: see the [SDK guide](../../machines/analog-rytm-mkii/README.md#parameter-pages-core-04-and-later)): [Filter Hz](filter-hz/) and [Loop Sync](loop-sync/). Unpublished modules wait in `_submissions/` until they have documentation, licensed source, captures, a resource record and hardware evidence, and the browser can build them. Loop Sync 0.2.0-experimental entered on the owner's approval with emulator evidence for its source; its [TESTING.md](loop-sync/TESTING.md) records what is still open.

Create one with `npm run module:new -- my-mod --machine analog-rytm-mkii --author your-github-login`; see [the Analog Rytm MKII SDK guide](../../machines/analog-rytm-mkii/README.md).
