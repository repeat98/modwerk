# fxkit

Effects on the Digitone's audio inputs as a framework: the effects list (`fx_effects`) every effect pedal adds itself to, the audio owner that hands the active effect the inputs and the output, parameter locks on an effect's controls kept in a track's lock table and replayed on their steps through the note queue, and the project data that saves each effect's settings.

Shared dependency, GPL-2.0-or-later: irpina's fxkit 0.1 for the Digitone mk1 from [elekloader tag fxkit-v0.1](https://github.com/irpina/elekloader/tree/a60e3baa410090e51d52594d470439351ea0b05c/mods/fxkit-dn1), source unchanged with the two SDK headers it includes. Its `mod.json` became `build.json`; it patches no stock site. The library builds the author's released fxkit 0.1 files (`sdk/imports/elekloader-fxkit-2026-11-27.json`), the build the effect pedals were tested with: Modwerk's GCC 16.2 build of the same source linked and exported the same interface, but in the emulator the effects' pages did not open with it, while they did with the author's build (27 November 2026; cause not found). It needs core 4.1 or newer (the note queue and the audio owner table), which the pinned core 5.4 provides.

No controls; included only when an effect that builds on it is chosen. On its own it changes nothing the unit does. The author's notes are in [upstream/README.md](upstream/README.md).
