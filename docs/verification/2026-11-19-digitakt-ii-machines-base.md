# Digitakt II base a3ced45e: added machines and their sound-chip players

The Digitakt II Modwerk base (OS 1.17) as this pull request vendors it: **a3ced45e** (`modwerk-base-digitakt-ii-a3ced45e.elemod`, `sdk/machines/digitakt-ii/base-binding.json`, pinned by `sdk/imports/elekloader-modwerk-base-digitakt-ii-2026-11-19.json`). It adds:

- added track machines (`core_machines`, table 5 after `core_mixer_pages`);
- their own knob and value names on the stand-in's parameters;
- on the sound chip: the selector table, the player dispatcher with its registry slots, and the frame receiver with its frame slots;
- the machine wire (the pattern's tempo, each track's step, the view track and each track's type), only while a machine is registered;
- the machine view back from the sound chip, for drawing over the sample page.

Built by `npm run machine:base -- digitakt-ii` with the reviewed toolchain (GCC 16.2.0, binutils 2.47, Elekloader kit `3b31ef3`).

## Changes after review (22 November 2026)

- The interface keeps the cumulative branch's order: `core_machines` is table 5, after `core_mixer_pages` (4); `ev_audio_frame` stays event 10.
- The sound chip's base code is the same for every set: players are reached through one registry slot per type 7-10, and frame receivers (a render plan's bridge, such as the sidechain prototype's) through four frame slots of the base's receiver, which keeps the receive site.
- Types 7-10 take the selector of the stock type each registered machine stands for. The stock table's words are read from the owner's OS at composition, checked by SHA-256; the repository keeps only its address, length and hash.
- A player must start in its own package's code and play a type its package registers.
- With no machine registered the ColdFire writes no wire words and reads no reply; the reply is read only while a page has set a view track.
- `scripts/link-image.mjs` builds a Digitakt II set through the website's path (the kit's build, then `composeDt2MachineBuild`).

## Checks

Revision `c6f1d5774` (branch `base/digitakt-ii-machines`), stock OS 1.17 `26c22f66…`, base `a3ced45e…`.

| Set | Final image SHA-256 |
|---|---|
| base alone | `a4b3cab2aa27357f1deae652186260dcc95bbe6ba565c83c0eda0b656b05f532` |
| base + Mikrotakt (a development build of the first machine module, type 7, as the test machine) | `838c14622c410c1deff648cc2238817acfe9d5f00cd707676e77decacdf8b17a` |

Host, with the owner's OS (`MODWERK_DT2_STOCK`):

- `dt2-link.test.ts`: both sets give the same final SHA-256 through the website's builder plus preflight and through `link-image.mjs`.
- `dt2-render-build.test.ts`: an empty set leaves the sound chip stock; a machine with no player takes its stand-in's selector and leaves every player slot empty; two machines beside the stock types, one with a player, build through the same base code bytes and sites; frame receivers are called through the frame slots.

Emulator only (coupled ColdFire and sound chip, scripted panel, from a ready point saved with each image):

| Image | Run | Result |
|---|---|---|
| base + Mikrotakt | SAMPLE on track 1, two trigs | PCM since ready `da40d90b…`, byte-identical to the stock OS reference; no halt, no missing blocks |
| base + Mikrotakt | Mikrotakt chosen through the machine menu on track 1, two trigs | plays through its own player (PCM `556067f6…`, peaks 0.05-0.11); no halt, no missing blocks |
| base alone | SAMPLE on track 1, two trigs | PCM `da40d90b…`, as stock |
| base alone | the same menu steps | the menu lists only the stock machines (the steps land on MIDI: silent) |

`npm run test:procedure -- --base digitakt-ii --package <base + Mikrotakt image>` at `c6f1d577499d` (85 s), package SHA-256 `838c1462…`:

| # | Step | Result |
|---|---|---|
| 1 | Software checks (`sdk:check`) | passed |
| 2 | Beside every other module | not run: Digitakt II has no such gate yet (the link refuses two modules on one site) |
| 3 | Name the build | passed |
| 4 | DSP cost model | not run: the scan models the Octatrack's DSP only |
| 5 | Emulator rehearsal | not run by the procedure: Digitakt II has none scripted (the coupled runs above stand in) |
| 6, 7, 10 | Read the unit, large set and Undo, put back | not run: Digitakt II has no USB link the procedure drives yet |
| 8 | Soak | not run: no Digitakt II soak yet |
| 9 | Cost on the unit | not run: no Digitakt II price tool yet |
| 11, 12 | By hand, then the submitter | run by the submitter on the unit with this image (below) |

On a unit (hands and ears, @Claptom-music's Digitakt II, OS 1.17, a new project, 22 November 2026), reported by the tester:

| # | Image | Case | Result |
|---|---|---|---|
| 1 | base + Mikrotakt `838c1462…` | a SAMPLE track plays as usual | pass |
| 2 | base + Mikrotakt | Mikrotakt on track 1, track 9 and track 16 plays grains | pass |
| 3 | base + Mikrotakt | a stereo sample on tracks 1 and 16: both channels | pass |
| 4 | base + Mikrotakt | knob D on a Mikrotakt track: the list scrolls and the chosen sample plays | pass |
| 5 | base + Mikrotakt | tempo change, then a pattern change, while Mikrotakt plays: no freeze or dropout | pass |
| 6 | base + Mikrotakt | the project saved with Mikrotakt on a track and reloaded: Mikrotakt still there | pass |
| 7 | base + Mikrotakt | per-track length, tracks 1 and 2 of different lengths, FUNC+PAGE extends track 1: track 2's trigs do not appear on track 1's new pages | pass |
| 8 | base alone `a4b3cab2…` | the same project loaded: the Mikrotakt track comes back as SAMPLE and plays, no crash | pass |

Earlier, base 1a052a38 with Mikrotakt (same ColdFire hooks; the sound chip's dispatcher then compared types inline) played on tracks 1, 9, 10 and 11 on both channels, its sample list scrolled and chose, and its drawing showed on the sample page only and not during a firmware transfer, on @Claptom-music's Digitakt II with a 5:40 stereo sample.

Not checked on a unit: a kit with two machine modules (none exists yet), and a machine with no player of its own (covered by the host test only).
