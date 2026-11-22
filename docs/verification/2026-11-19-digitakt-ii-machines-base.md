# Digitakt II base 1a052a38: added machines and their sound-chip players

The Digitakt II Modwerk base (OS 1.17) as this pull request vendors it: **1a052a38** (`modwerk-base-digitakt-ii-1a052a38.elemod`, `sdk/machines/digitakt-ii/base-binding.json`, pinned by `sdk/imports/elekloader-modwerk-base-digitakt-ii-2026-11-19.json`). It adds:

- added track machines (`core_machines`);
- their own knob and value names on the stand-in's parameters;
- the player dispatcher and selector table on the sound chip;
- the machine wire (the pattern's tempo, each track's step and the view track);
- the machine view back from the sound chip, for drawing over the sample page.

Built by `npm run machine:base -- digitakt-ii` with the reviewed toolchain (GCC 16.2.0, binutils 2.47, Elekloader kit `3b31ef3`). Two builds gave the same package.

Fixes since the first package (2f8a60d2), each found on a unit with the first machine module:

- the wire brings each track's machine type from the kit, so the dispatcher reaches an added machine's player on every track (before, track 1 only);
- both of the render pass's stock player calls reach a machine, so a stereo sample's right channel plays through it too;
- the SRC page's per-type sample-slot table answers an added machine as its stand-in, so its sample list scrolls and chooses;
- the sample view is counted at its own draw call, so a module draws over that page and no other, and nothing during a firmware transfer.

On a unit (Digitakt II, OS 1.17), base 1a052a38 with the Mikrotakt module (its own pull request), a 5:40 stereo sample:

- the machine plays on tracks 1, 9, 10 and 11, both channels;
- its sample list scrolls and changes the sample;
- the module's drawing shows on the sample page only, and not during a firmware transfer.

Emulator (coupled ColdFire and sound chip, scripted panel; design notes and every run in `sdk/machines/digitakt-ii/elekloader/modwerk/MACHINES.md`):

- Development builds of this base with a test machine:
  - the machine menu lists it, and kits save and load it;
  - the SRC page shows its knob and value names, and SAMPLE's again on a SAMPLE track;
  - its second page is SAMPLE's sample view;
  - stock SAMPLE playback through the player dispatcher is unchanged;
  - the wire's tempo and step words arrive every block;
  - the receiver's view words come back intact in the reply.
- The first package (2f8a60d2) with Mikrotakt, composed by `composeDt2MachineBuild`, image `a9d9ec0631da0601be13053334863fe8bbaf5a9c89dd8d017976bd81c51183c7`:
  - it passes the build preflight (sections 2, 4, 5 and 8 stock, flash headroom 1,392,032 bytes);
  - it plays through the module's player without halts or missing blocks;
  - the reply carries Mikrotakt's play head and grains while a note plays on the open sample view;
  - with the reply copy bypassed and a fixed view written (panel probe), Mikrotakt's page draws it over the waveform on the second page and nothing on the first.

Not checked on a unit: a pattern's trig copy between tracks of different lengths (reported once, not reproduced in the emulator, where it matches stock).
