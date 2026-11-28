# seq events

The Digitone's step fire as events, so several mods that change what the sequencer plays combine: generators (does a track's step fire, which notes it plays) and effects over what every fire plays (the trig, its condition, notes, velocity and locks), plus a step clock per track and the playing pattern's facts when asked.

Shared dependency, GPL-2.0-or-later: Dracyr's seq-events 0.1 for the Digitone mk1 from [elekloader commit b893c93](https://github.com/elekloader/elekloader/tree/b893c9317936633d7a32829b618c2867ee99277c/mods/seq-events-dn1), source unchanged (the same as elekloader 0.11.0). Its `mod.json` became `build.json`: each of its 15 sites keeps its address and length, with a SHA-256 guard in place of the stock bytes. OS 1.44 only for now.

The library builds the `seq-events-0.1-os1.44.elemod` that MUTINY's author built from this source and tested MUTINY with (`sdk/imports/elekloader-seq-events-dn-2026-11-27.json`), not a Modwerk compile: Modwerk's GCC 16.2 build of irpina's fxkit did not behave like its author's build in the emulator (27 November 2026), so the Digitone frameworks pin the tested builds.

No controls; included only when a module that builds on it is chosen. On its own it changes nothing the unit does. The author's notes on the API are in [upstream/README.md](upstream/README.md).
