# seq events

The Digitakt's step fire as events, so several mods that change what the sequencer plays combine: generators (does an audio track's step fire, which note it plays) and effects over what every fire plays, on audio and MIDI tracks (the step it reads, the trig, its condition, notes, velocity and locks), plus a step clock per track and the playing pattern's facts when asked.

Shared dependency, GPL-2.0-or-later: Dracyr's seq-events 0.1 for the Digitakt mk1 from [elekloader v0.11.0](https://github.com/irpina/elekloader/tree/f20ffda0a9d3ac008b7285ab01ca4dd8da58341f/mods/seq-events-dt1), source unchanged. Its `mod.json` became `build.json`: each of its 15 sites (the audio and MIDI tracks' fire, the same addresses on OS 1.53 and 1.54) keeps its address and length, with a SHA-256 guard in place of the stock bytes. It runs on core 2.1 and newer: it uses only the hook bus's `ev_tick`.

No controls; included only when a module that builds on it is chosen. On its own it changes nothing the unit does. The author's notes on the API are in [upstream/README.md](upstream/README.md).
