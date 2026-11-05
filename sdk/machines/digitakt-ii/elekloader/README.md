# Digitakt II base source

The start of Modwerk's own base for the Digitakt II on OS 1.17 ([recipe](../../../../docs/MACHINE_RECIPE.md)). Today it is
the source of the Digitakt II core 1.1, copied unchanged: `core-dt2/` (its `mod.json` and eight sources) and `core/`
(the shared `core.s`, `settings.s` and `fast.s`, which `mod.json` builds with the Digitakt II's addresses), and the
header `../include/digitakt-mk2/core.h` that describes its additions to mods. Provenance and hashes:
[sdk/imports/core-dt2-source-0df8409.json](../../../imports/core-dt2-source-0df8409.json). The files are
GPL-2.0-or-later and keep their SPDX lines. The core is irpina's, from elekloader; toonst wrote the 1.1 additions,
proposed to elekloader as [elekloader#221](https://github.com/elekloader/elekloader/pull/221) (commit `0df8409`,
rebased on elekloader's main, no release tag yet). Modwerk's own sources go beside these, so the imported
files stay exact.

Core 1.1 keeps the six events and every site of core 1.0 and adds, in new code after the old:

- `ev_frame_params`: each frame's per-track parameter values, before the stock modulators;
- `ev_key_leds`: the key-LED frame, before the stock views set theirs;
- `core_projdata` and `core_kitdata`: a mod's block in the project file's header gap and in each kit record, saved
  and loaded with the project, carried through the firmware's kit copies, and written only over zeros or core's own
  data;
- `core_addvalue`, a value row for PERSONALIZE or SETTINGS, and `fw_led_set` for `ev_key_leds` handlers.

The entries are proposed in [core-profile/interface.json](../../../digitakt-ii/core-profile/interface.json) (marked
`since` 1.1), with each new site's address, length and SHA-256 guard.

## What is not here yet

- **No build.** There is no `base.json` and no `base-binding.json`, so `npm run machine:base` does not build it. Both
  need a build from your own `Digitakt_II_OS1.17.syx` with the reviewed toolchain, and a decision on what to compare it
  with: the release `core-1.0.elemod` has no 1.1 to match. Nothing here was assembled or run by Modwerk.
- **The site still builds with core 1.0.** The machine's core version stays 1.0 until the base ships, so a module that
  needs a 1.1 entry cannot validate yet (`module.platform.core`).
- **Not elekloader's release yet.** `0df8409` is elekloader#221's branch, not merged. If it lands changed,
  elekloader's core-dt2 1.1 and this source differ: take the source again from its merged release before the base
  ships. Changes to core-dt2 itself go to elekloader ([contributing](../../../../CONTRIBUTING.md#elekloader-mods-and-cores)).
- **Hardware.** This copy's source (`0df8409`), built by elekloader with macro mode, passed digi_macro's digikit
  emulator scenarios (5 November 2026) and, by toonst's report, works on a Digitakt II on OS 1.17; a unit has run core
  1.0 with a mod on its key events. Modwerk's own base build has not run anywhere yet, and Modwerk has qualified none
  of it on hardware.
