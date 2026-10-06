# Module guides

How to write a module that behaves like part of the instrument and fits every Modwerk workflow. Read this page, then the guide for your module's category, before you write code.

A module's category is the `category` field of its manifest (`octamod.module.json`, or `modwerk.module.json` on Digitakt and Digitone). The manifest picks the guide, not the library grouping: the library lists Scale Quantizer, Repitch and Preview Vol under System and MIDI Scenes under MIDI & USB (`src/catalog/modules.ts`).

| Category | Guide | Covers | Modules that already follow it |
| --- | --- | --- | --- |
| `effects` | [effects.md](effects.md) | FX1 and FX2 effects: knobs, modes, modulation, locks, DSP space | Mini Verb, Tape Echo, Euclid, TapeHead, Sidechain Compressor, Spectrum, Modulation, Character |
| `machines` | [machines.md](machines.md) | Track machines in the machine chooser and SRC SETUP; project-wide sequencer machines | Analog BD (track machine), Scale Quantizer (project machine) |
| `playback` | [playback.md](playback.md) | Sample playback behaviour: pitch, rate, timestretch, preview | Repitch, Preview Vol |
| `scenes` | [scenes.md](scenes.md) | Scenes, crossfader and per-track state recall | MIDI Scenes |
| `midi-usb` | [midi-usb.md](midi-usb.md) | MIDI messages and USB: what is consumed, mapped and enumerated | CC Map, USB Audio |
| `system` | [system.md](system.md) | Project and system menus and settings | none yet; Scale Quantizer, Repitch and Preview Vol are shown here by the library |
| `standalone` | [standalone.md](standalone.md) | Complete firmware that replaces the whole OS | none yet; MIDI Scenes is built standalone |
| any | [sequencing.md](sequencing.md) | Anything that acts in time: follow the instrument's transport, tempo, track speed, scale, length and swing | Euclid, Repitch |

## The workflow, in order

1. Read the category guide, then [octabam's trap list](../../sdk/octabam/AGENTS.md) before any DSP or ColdFire code.
2. Follow [Add or port a module](../ADD_A_MODULE.md) for the folder, the manifest, the packages and the comparison with native octabam.
3. Walk the guide's **Behave like the instrument** and **Integrate** checklists. Tick an item only when you did it.
4. Run `npm run module:doctor -- <id>` until every line is green. It reads the repository only: no firmware and no module code runs.
5. Run `npm run check`, and `npm run module:verify -- <id> --os <your 1.40C update>` for an Octatrack module.

## Rules for every module

**Integrate with what exists.** A module is built by the shared builder beside other modules, listed from `sdk/catalog.json`, compared with native octabam and released by the same pipeline as every other. Do not write module-specific builder, library or CI code. If your module has a shape no earlier module had, change the shared code once (`src/engine/`, `sdk/octabam/tools/build/build_bus.py`) and let `module:verify` prove it.

- *Build beside others.* `npm run module:verify` builds your module alone, beside every other offered module, in the fullest selections and in a fixed sample, with and without the stock FX2 effects. A refusal is fine when it is the right one; it must match native octabam's.
- *Declare conflicts; never hope.* Put what you cannot share in `compatibility.conflicts` and in the resource claims (FX2 ids, caves, hook sites, DSP data ranges). The ledger refuses collisions by name. Analog BD refuses every module with an effect ID automatically; an effect that builds beside the stock FX2 effects is named in `FITS_BESIDE_STOCK_FX2` (`src/catalog/selection-conflicts.ts`).
- *Appear everywhere from the manifest.* The `sdk/catalog.json` entry (`id`, `version`, `addedAt`) puts the module in the library, the configurator and its module page. Add `presentation/thumbnail.svg` (320×192) or hand-drawn art in `ModulePreview.tsx`, and `resources.impact`.
- *Survive saved work.* Saved configurations pin module versions, and saved Octatrack projects store knob bytes. A new version must load what an old one saved, or the README says exactly what breaks and how to migrate.
- *Use the same documentation contract.* README sections, a tutorial of at least three steps, TESTING.md, real black-and-white screenshots. See [MODULE_QUALIFICATION.md](../MODULE_QUALIFICATION.md).
- *Ship by the same CI.* Every PR gets the quick check. Only code changes get the Docker compile, the Windows check and a version bump; documentation and media edits need none.

**Sequence with what exists.** A module that acts in time uses the instrument's own transport, tempo, track speed, track scale and length, and swing, as Euclid does. It never keeps a second clock. See [sequencing.md](sequencing.md).

**Behave like the stock instrument.** A musician should not be able to tell your module from a built-in feature by how it handles the surrounding workflow: defaults are safe, every control has a one-line description, values stay inside their counts, parameters can be locked and modulated, a project saves and reloads, and switching Parts or patterns does not leave state behind.

**Say what you verified, and only that.** Octabam's proof levels are `CHECK` (builds and boots under the port), `RENDER` (heard or measured locally, never flashed), `PORT` (a gate under the ColdFire port pins its behaviour) and `HARDWARE` (ran on a unit). Do not claim a level you did not reach. Items marked **Verify** in the guides have no recorded gate in this repository: test them on the emulator or a unit, record the method and result in TESTING.md, or write "not tested". Never write a hardware behaviour you did not observe or find documented.

**Use the tools that exist.**

| Need | Tool |
| --- | --- |
| Build a test project: tracks, machines, FX, knobs by name, trigs, parameter locks on every page, with `clear` | `sdk/octabam/tools/hw/ot_spec.py` (`apply`, `report`, `diff`) |
| Count and strip parameter locks | `sdk/octabam/tools/hw/ot_bank.py` (`report`, `strip --pages fx1,fx2`) |
| Rewrite stored defaults after a layout change | `sdk/octabam/tools/hw/ot_project.py stamp-defaults <project> <remix>` |
| Eight Flex tracks, three active LFOs per track, 15 locked slots per step | `sdk/octabam/tools/harness/stress_project.py` |
| A real project on the built image under the ColdFire port | `sdk/octabam/tools/verify/verify_set.py` |
| Drive any knob of a DSP module offline | `sdk/octabam/tools/harness/send_probe.py --set NAME=VALUE` |
| Zipper noise on every continuous knob while it moves | `sdk/octabam/tools/verify/verify_knob_clicks.py` |
| Mode words, chooser tables, hidden engines, stock ids | `verify_labels.py`, `verify_menu.py`, `verify_hidden.py`, `verify_replaces.py` |
| Screenshots of the real LCD | `scripts/capture-module-ui.py` ([guide](../MODULE_UI_CAPTURES.md)) |

Most of these need a native toolchain and your own original OS 1.40C kept outside the repository ([SDK README](../../sdk/README.md#octatrack-native-development)). Say in TESTING.md which you ran.

## Digitakt and Digitone

Mods there are linked by one core per machine and built by elekloader's builder in the browser, so there is no native octabam comparison. Each guide has a short section on what applies. Start from [the Digitakt guide](../../sdk/machines/digitakt/README.md) for the core events, budgets and claims, and test a two-mod build, since combinations are the point.
