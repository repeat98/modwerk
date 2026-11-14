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

## Local base candidate

[base.json](base.json) stages the imported sources and adds the proposed [sequencer pitch hook](modwerk/README.md).
The recipe checks that the candidate retains the stock sites and interface entries of the released `core-1.0.elemod`.
It pins the same compiler and assembler as `sdk/build/Dockerfile`. To reproduce the local candidate, build with
that toolchain, the kit-pinned Elekloader SDK and your local copy of the exact stock OS:

```sh
npm run machine:base -- digitakt-ii --stock /private/Digitakt_II_OS1.17.syx --out /private/dt2-base
```

Two isolated builds with GCC 16.2.0 and binutils 2.47 produced byte-identical packages and verified the
[recorded binding](../base-binding.json). The [emulator results](modwerk/README.md) cover that exact base.

## Release status

The browser builder selects the reviewed Modwerk core 1.1 package for OS 1.17. The package matches the base binding and the Z117 hardware test, including reopening a saved project with its kits intact on official OS 1.17. The package and its provenance are pinned in the Modwerk catalog. The existing download gate remains in effect.
