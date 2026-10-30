# Digitakt II base source

The start of Modwerk's own base for the Digitakt II on OS 1.17 ([recipe](../../../../docs/MACHINE_RECIPE.md)). Today it is
the source of the Digitakt II core 1.1, copied unchanged: `core-dt2/` (its `mod.json` and eight sources) and `core/`
(the shared `core.s`, `settings.s` and `fast.s`, which `mod.json` builds with the Digitakt II's addresses), and the
header `../include/mk2/core.h` that describes its additions to mods. Provenance and hashes:
[sdk/imports/core-dt2-source-3d7c2e3.json](../../../imports/core-dt2-source-3d7c2e3.json). The files are
GPL-2.0-or-later and keep their SPDX lines. The core is irpina's, from elekloader; toonst wrote the 1.1 additions on a
branch of their fork (commit `3d7c2e3`, no release tag yet). Modwerk's own sources go beside these, so the imported
files stay exact.

Core 1.1 keeps the six events and every site of core 1.0 and adds, in new code after the old:

- `ev_frame_params`: each frame's per-track parameter values, before the stock modulators;
- `ev_key_leds`: the key-LED frame, before the stock views set theirs;
- `core_projdata` and `core_kitdata`: a mod's block in the project file's header gap and in each kit record, saved
  and loaded with the project, carried through the firmware's kit copies, and written only over zeros or core's own
  data;
- `core_addvalue`, `core_notice`, `core_view_top` and the `fw_*` firmware locations.

The entries are proposed in [core-profile/interface.json](../../../digitakt-ii/core-profile/interface.json) (marked
`since` 1.1), with each new site's address, length and SHA-256 guard.

## What is not here yet

- **No build.** There is no `base.json` and no `base-binding.json`, so `npm run machine:base` does not build it. Both
  need a build from your own `Digitakt_II_OS1.17.syx` with the reviewed toolchain, and a decision on what to compare it
  with: the release `core-1.0.elemod` has no 1.1 to match. Nothing here was assembled or run by Modwerk.
- **The site still builds with core 1.0.** The machine's core version stays 1.0 until the base ships, so a module that
  needs a 1.1 entry cannot validate yet (`module.platform.core`).
- **Hardware.** By their author's report, core 1.1's additions have run in digikit's emulator only, and a unit has
  run core 1.0 with a mod on its key events. Modwerk has qualified none of it on hardware.
