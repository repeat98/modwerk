# Digitakt II base 1a052a38: added machines and their sound-chip players

The Digitakt II Modwerk base (OS 1.17) as this pull request vendors it: **1a052a38** (`modwerk-base-digitakt-ii-1a052a38.elemod`, `sdk/machines/digitakt-ii/base-binding.json`, pinned by `sdk/imports/elekloader-modwerk-base-digitakt-ii-2026-11-19.json`). It adds:

- added track machines (`core_machines`);
- their own knob and value names on the stand-in's parameters;
- the player dispatcher and selector table on the sound chip;
- the machine wire (the pattern's tempo, each track's step and the view track);
- the machine view back from the sound chip, for drawing over the sample page.

Built by `npm run machine:base -- digitakt-ii` with the reviewed toolchain (GCC 16.2.0, binutils 2.47, Elekloader kit `3b31ef3`). Two builds gave the same package.

Emulator only (coupled ColdFire and sound chip, scripted panel; design notes and every run in `sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md`):

- Development builds of this base with a test machine:
  - the machine menu lists it, and kits save and load it;
  - the SRC page shows its knob and value names, and SAMPLE's again on a SAMPLE track;
  - its second page is SAMPLE's sample view;
  - stock SAMPLE playback through the player dispatcher is unchanged;
  - the wire's tempo and step words arrive every block;
  - the receiver's view words come back intact in the reply.
- This base with Mikrotakt (its own pull request), composed by `composeDt2MachineBuild`, image `a9d9ec0631da0601be13053334863fe8bbaf5a9c89dd8d017976bd81c51183c7`:
  - it passes the build preflight (sections 2, 4, 5 and 8 stock, flash headroom 1,392,032 bytes);
  - it plays through the module's player without halts or missing blocks;
  - the reply carries Mikrotakt's play head and grains while a note plays on the open sample view;
  - with the reply copy bypassed and a fixed view written (panel probe), Mikrotakt's page draws it over the waveform on the second page and nothing on the first.

Not tested on a unit: the exact image above is with Claptom-music for a hardware run.
