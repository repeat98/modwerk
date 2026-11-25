# Digitakt II base 948be0c4: linked voices, full-resolution knobs C and E

The Digitakt II Modwerk base (OS 1.17) as this pull request vendors it: **948be0c4** (`modwerk-base-digitakt-ii-948be0c4.elemod`, `sdk/machines/digitakt-ii/base-binding.json`), the base of `base/digitakt-ii-next` after #2005. Over `a3ced45e` it adds:

- linked voices: SETTINGS > VOICES makes a track lead the tracks after it, which belong to it while linked (`elekloader/modwerk/VOICES.md`);
- one more machine-wire word a track: knobs C and E at full resolution for added machines (`MACHINES.md`, "Knobs at full resolution");
- the SHARC assembler's conditional `RTS` as type 11a (it hung the unit when not taken).

Built by `npm run machine:base -- digitakt-ii --write` with the reviewed toolchain (GCC 16.2.0, binutils 2.47, Elekloader kit `3b31ef3`): 15,626 bytes `.run`, 12,664 bytes `.bss`, 47 sites.

## Checks

On a unit (hands and ears, @Claptom-music's Digitakt II, OS 1.17, 23 November 2026), reported by the tester, with the image **27dfadf8** (this base, byte for byte the build recorded here, with the Morpha module, an added machine, as the lead):

| Case | Result |
|---|---|
| Chords from the keys with VOICES 3-4 on the Morpha track, knobs turned while playing | pass: every chord note keeps the lead's settings |
| Morpha's knobs C (AMT) and E (POS) turned while notes play | pass: smooth, as the full-resolution wire word gives them |
| Morpha's WARP at FOLD | pass |

Earlier development builds of the same work on the same unit (`063eea9a`, `629ee977`, `e6ffc45b`) and what each changed are in `VOICES.md`; among them, saving a project with VOICES set and reloading it kept the setting.

Emulator (coupled ColdFire and sound chip, from a ready point saved with each image): every track at 1, a first note identical sample for sample to `a3ced45e`'s and the project's pattern identical; a linked lead's second note on track 2 at the lead's level; a linked track's own trig key silent. Host: the assembler and builder tests (550) pass.

`npm run test:procedure` was not run for this base: the Digitakt II steps it would add (USB link, soak, price) do not exist yet, as for `a3ced45e`.

Not checked on a unit: MIDI chords, sequencer trigs on a lead, a stock machine as the lead, muted voices.

## Pinned for the browser builder

After #2130 merged, the pin record `sdk/imports/elekloader-modwerk-base-digitakt-ii-2026-11-19.json` names this package (SHA-256 `948be0c4…`) at the merge commit `d3eada36c`. `npm run elekloader:update -- --overlay` fetched it from there, checked the catalog (12 cores, 91 mods) and the licence notices, and vendored it as `vendor/elekloader/catalog/modwerk-base-digitakt-ii-948be0c4.elemod`. The `a3ced45e` package left the imports and the vendored catalog, as `1a052a38`'s did when `a3ced45e` was pinned.
