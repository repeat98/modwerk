# Digitakt II base source

Modwerk's base for Digitakt II OS 1.17 starts from core-dt2 1.1 at `0df8409`, the reviewed head of
[Elekloader PR #221](https://github.com/elekloader/elekloader/pull/221). Modwerk pins the reviewed commit
directly. The imported `core-dt2/`, shared `core/` sources and `../include/digitakt-mk2/core.h` are
byte-for-byte copies. The core is irpina's and the 1.1 additions are toonst's. The
[import record](../../../imports/core-dt2-source-0df8409.json) lists each file and its SHA-256.
Modwerk's additional firmware bindings and hooks live under `modwerk/`.

Core 1.1 keeps the six events and every site of core 1.0 and adds, in new code after the old:

- `ev_frame_params`: each frame's per-track parameter values, before the stock modulators;
- `ev_key_leds`: the key-LED frame, before the stock views set theirs;
- `core_projdata` and `core_kitdata`: a mod's block in the project file's header gap and in each kit record, saved
  and loaded with the project, carried through the firmware's kit copies, and written only over zeros or core's own
  data;
- `core_addvalue` for PERSONALIZE and SETTINGS rows, and the LED setter for key-LED handlers.

The entries are proposed in [core-profile/interface.json](../../../digitakt-ii/core-profile/interface.json) (marked
`since` 1.1), with each new site's address, length and SHA-256 guard.

## Local base candidate

[base.json](base.json) stages the imported sources and adds Modwerk's [sequencer and project hooks](modwerk/README.md).
The recipe checks that the candidate retains the stock sites and interface entries of the released `core-1.0.elemod`.
It pins the same compiler and assembler as `sdk/build/Dockerfile`. To reproduce the local candidate, build with
that toolchain, the kit-pinned Elekloader SDK and your local copy of the exact stock OS:

```sh
npm run machine:base -- digitakt-ii --stock /private/Digitakt_II_OS1.17.syx --out /private/dt2-base
```

Two isolated builds with GCC 16.2.0 and binutils 2.47 produced byte-identical packages and verified the
[previous binding](../base-binding.json). The `0df8409` source refresh is pending a new pinned build.
A Windows GCC 13.1.0 diagnostic reproduced all 19 sites, linked with both Perform modules, and linked
with the Euclidean Scale and Chord Arp test modules separately and together. In digikit, the
Euclidean Scale fixture restored its settings after clearing and reloading the project, and the
swung Chord Arp fixture reached the scheduler commit routine 16 times.

## Release status

- **The site still builds with core 1.0.** The machine's core version stays 1.0 until the base ships, so a module that
  needs a 1.1 entry cannot validate yet (`module.platform.core`).
- **Hardware.** Earlier base builds have reported hardware results for the Euclidean pitch hook and kit-data reload.
  On the exact integration build, verify the phrase scheduler with a subscriber, **Create New** with kit data present,
  and **SAVE KIT** followed by **LOAD KIT** after changing the module's state. Record the base and image hashes.
