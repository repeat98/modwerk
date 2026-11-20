# Digitakt II base 8f3fedc9: added machines and their sound-chip players

The Digitakt II Modwerk base (OS 1.17) with added track machines (`core_machines`), their own knob and value names on the stand-in's parameters, the player dispatcher and selector table on the sound chip, and the machine wire (the pattern's tempo and each track's step), as this pull request vendors it: **8f3fedc9** (`modwerk-base-digitakt-ii-8f3fedc9.elemod`, `sdk/machines/digitakt-ii/base-binding.json`, pinned by `sdk/imports/elekloader-modwerk-base-digitakt-ii-2026-11-19.json`), built by `npm run machine:base -- digitakt-ii` with the reviewed toolchain (GCC 16.2.0, binutils 2.47, Elekloader kit `3b31ef3`). Two builds gave the same package.

Emulator only (coupled ColdFire and sound chip, scripted panel; design notes and every run in `sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md`):

- Development builds of this base with a test machine: the machine menu lists it, kits save and load it, the SRC page shows its knob and value names and SAMPLE's again on a SAMPLE track, and its second page is SAMPLE's sample view; stock SAMPLE playback through the player dispatcher is unchanged; the wire's tempo and seventeen step words arrive every block.
- This base with Mikrotakt (its own pull request), composed by `composeDt2MachineBuild`: image `5bb862bddaa5d3a23ab475d847b8bd2782cc79c19e0153bb9395e4644c75d3cb` passes the build preflight (sections 2, 4, 5 and 8 stock, flash headroom 1,392,848 bytes), plays through the module's player without halts or missing blocks, and opens SAMPLE's sample view as Mikrotakt's second SRC page.

Not tested on a unit: the exact image above is with Claptom-music for a hardware run.
