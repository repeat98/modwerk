# Module guides

How to write a module that behaves like part of the instrument and fits every Modwerk workflow. Read this page, then the guide for your module's category, before you write code.

A module's category is the `category` field of its manifest (`octamod.module.json`, or `modwerk.module.json` on Digitakt and Digitone). The manifest picks the guide, not the library grouping: the library lists Scale Quantizer, Repitch and Preview Vol under System and MIDI Scenes under MIDI & USB (`src/catalog/modules.ts`).

| Category | Guide | Covers | Modules that already follow it |
| --- | --- | --- | --- |
| `effects` | [effects.md](effects.md) | FX1 and FX2 effects: knobs, modes, modulation, locks, DSP space | Mini Verb, Tape Echo, Euclid, TapeHead, Sidechain Compressor, Spectrum, Modulation, Character |
| `machines` | [machines.md](machines.md) | Track machines in the machine chooser and SRC SETUP; project-wide sequencer machines | Analog BD (track machine), Scale Quantizer (project machine) |
| `playback` | [playback.md](playback.md) | Sample playback behaviour: pitch, rate, timestretch, preview | Repitch, Preview Vol |
| `scenes` | [scenes.md](scenes.md) | Scenes, crossfader and per-track state recall | MIDI Scenes |
| `midi-usb` | [midi-usb.md](midi-usb.md) | MIDI messages and USB: what is consumed, mapped and enumerated; MIDI generators and MIDI effects | CC Map, USB Audio |
| `system` | [system.md](system.md) | Project and system menus and settings | none yet; Scale Quantizer, Repitch and Preview Vol are shown here by the library |
| `standalone` | [standalone.md](standalone.md) | Complete firmware that replaces the whole OS | none yet; MIDI Scenes is built standalone |
| any | [sequencing.md](sequencing.md) | Anything that acts in time: follow the instrument's transport, tempo, track speed, scale, length and swing | Euclid, Repitch |

## The workflow, in order

1. Read the category guide, then [octabam's trap list](../../sdk/octabam/AGENTS.md) before any DSP or ColdFire code.
2. Follow [Add or port a module](../ADD_A_MODULE.md) for the folder, the manifest, the packages and the comparison with native octabam.
3. Walk the guide's checklists: **Behave like the instrument** and **Integrate**, and for an effect **Sound quality** (aliasing, clipping, DC, idle behaviour). Tick an item only when you did it.
4. Measure the [performance](#performance) and write `evidence/performance.json`: worst-case cycles, a benchmark against stock and a stress run. `npm run perf:audit -- check <that file>` must pass.
5. Run `npm run module:doctor -- <id>` until every line is green. It reads the repository only: no firmware and no module code runs. For a module listed from 7 October 2026 it also refuses a missing or failing performance record.
6. Run `npm run check`, and `npm run module:verify -- <id> --os <your 1.40C update>` for an Octatrack module.
7. If you learned something the next developer needs and no guide says, write it into the guide that fits, as its own docs-only pull request ([Share what you learn](../DEVELOPER_WORKFLOW.md#share-what-you-learn)).

## Rules for every module

**Integrate with what exists.** A module is built by the shared builder beside other modules, listed from `sdk/catalog.json`, compared with native octabam and released by the same pipeline as every other. Do not write module-specific builder, library or CI code. If your module has a shape no earlier module had, change the shared code once (`src/engine/`, `sdk/octabam/tools/build/build_bus.py`) and let `module:verify` prove it.

- *Build beside others.* `npm run module:verify` builds your module alone, beside every other offered module, in the fullest selections and in a fixed sample, with and without the stock FX2 effects. A refusal is fine when it is the right one; it must match native octabam's.
- *Declare conflicts; never hope.* Put what you cannot share in `compatibility.conflicts` and in the resource claims (FX2 ids, caves, hook sites, DSP data ranges). The ledger refuses collisions by name. Analog BD refuses every module with an effect ID automatically; an effect that builds beside the stock FX2 effects is named in `FITS_BESIDE_STOCK_FX2` (`src/catalog/selection-conflicts.ts`). The library reads the same conflicts to flag a module on its card, and offer a swap, before anyone adds it (`src/catalog/add-blocks.ts`), so a declared conflict needs no extra interface work.
- *Appear everywhere from the manifest.* The `sdk/catalog.json` entry (`id`, `version`, `addedAt`) puts the module in the library, the configurator and its module page. Add `presentation/thumbnail.svg` (320×192) or hand-drawn art in `ModulePreview.tsx`, and `resources.impact`.
- *Survive saved work.* Saved configurations pin module versions, and saved Octatrack projects store knob bytes. A new version must load what an old one saved, or the README says exactly what breaks and how to migrate.
- *Use the same documentation contract.* README sections, a tutorial of at least three steps, TESTING.md, real black-and-white screenshots. See [MODULE_QUALIFICATION.md](../MODULE_QUALIFICATION.md).
- *Ship by the same CI.* Every PR gets the quick check. Only code changes get the Docker compile, the Windows check and a version bump; documentation and media edits need none.

**Sequence with what exists.** A module that acts in time uses the instrument's own transport, tempo, track speed, track scale and length, and swing, as Euclid does. It never keeps a second clock. See [sequencing.md](sequencing.md).

**Leave stock flows alone, and fit every flow.** A module is a guest in the instrument's own workflows. By default, with it installed every stock flow a musician already uses behaves exactly as it did without it: the menus and pages it does not own, button combinations and their shortcuts, the chooser and its order, saving, loading and copying projects, Parts and patterns, scenes, recording and sampling, MIDI in and out, USB, and the instrument's timing and audio. Its own controls appear where a musician would look for them, in the stock style, reachable with the stock gestures, and do nothing until used. Where it must take something over (a MIDI message, a menu row, a hook site), the README names exactly what, and everything else passes through untouched.

A **minor change to a stock flow** is allowed when the module cannot do its job without it or the change is a clear improvement, and when it is well thought out and documented. For every such change the README has an entry that says: what changes and for whom; why it is needed and what was considered instead (an own page, a new gesture); what a musician sees and does differently; that it applies only while the module is enabled, or how to turn it off; and which neighbouring flows you checked for side effects. A change that is not listed is a defect. A change that moves a stock gesture, makes a stock page behave differently by default, can lose or alter saved work or timing, or that a musician cannot opt out of is not minor: agree it with the owner before you build it, and expect a no. The owner approves each listed change when reviewing the pull request. **Verify** by running the stock flows with and without the module, on the emulator or a unit, and record the flows you compared and every change you made in TESTING.md; a flow you did not run is "not tested".

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
| Worst-case cycles, a benchmark against stock and a stress run | `npm run perf:audit` ([Performance](#performance)); `module:doctor` enforces it for new modules |
| Aliasing, clipping, DC and idle behaviour of an effect, from renders you make with the harness | `npm run fx:audit` ([effects.md](effects.md#sound-quality)); not a CI gate |
| Mode words, chooser tables, hidden engines, stock ids | `verify_labels.py`, `verify_menu.py`, `verify_hidden.py`, `verify_replaces.py` |
| Screenshots of the real LCD | `scripts/capture-module-ui.py` ([guide](../MODULE_UI_CAPTURES.md)) |

Most of these need a native toolchain and your own original OS 1.40C kept outside the repository ([SDK README](../../sdk/README.md#octatrack-native-development)). Say in TESTING.md which you ran.

## Performance

A module that is slow, or that only works when it is the only thing running, takes the room of every other module and of the stock instrument. Every new module therefore carries `evidence/performance.json`, a record of three measurements that `npm run perf:audit -- check <file>` judges and `module:doctor` enforces for modules listed from 7 October 2026. Earlier modules keep their [qualification evidence](../MODULE_QUALIFICATION.md). Like `fx:audit`, the judgement runs offline and the numbers come from the native harness, which CI never has: a green `npm run check` says nothing about them. Start from `npm run perf:audit -- template dsp` (an effect, machine or other DSP module) or `npm run perf:audit -- template coldfire` (a MIDI generator, MIDI effect or other ColdFire code).

New FX should aim for DSP cost in the **same ballpark as stock SPRING REV at its worst settings**. DSP cycles are tightly budgeted, so plan around that reference before implementation and measure as features are added. Benchmark Spring's expensive types/settings, endpoints, moving controls and trigger splits on both cores. Match units, audio buffers, sample/block sizes, core layouts and harness-overhead treatment. This is a design target without a fixed ratio or hard per-effect ceiling. A substantially more expensive design needs optimization and explicit review of the cost and remaining headroom. The complete supported configuration must still fit the instrument's real-time budget.

1. **Cycle count.** The static floor of the worst mode loop (`tools/build/cycle_count.py`: words in the per-sample loop, no contention) and the dearest case you measured, with the knobs moving. Instances multiply: `instancesPerCore` times the static cost must fit what a core can spend (3120 per sample), and a ColdFire module's worst event must fit its deadline. Average or nominal load does not count; this is the same worst case [MODULE_QUALIFICATION.md](../MODULE_QUALIFICATION.md) asks for.
2. **A benchmark against stock.** A DSP module is compared with the stock effect closest in function, from `benchmark_stock_dsp.py` (`out/stock_dsp_bench/results.json`, made from your own OS file, so never committed; the record copies only the comparator's figure, the dearest stock figure and the stock image's SHA-256). Up to 1.5x its cost is fine, up to 3x needs a sentence on what the extra cost buys, and above that, or dearer than every stock effect, fails unless `stock.justification` explains it and the owner accepts. A ColdFire module is compared with the stock image under the same flood: `cfmeter.py` reports the longest frame interrupt and the idle time, and the module may add at most 10% of a 362.8 us frame to the interrupt and 10 points of idle time.
3. **A stress run.** A DSP module: the most instances you claim per core, eight tracks, three active LFOs per track and a dozen locked slots per step (`stress_project.py`), rendered for at least 30 s through `dsp_host -guard -dirty` (`pressure.py render`), with no clobber and no hang. DSP code reached only through stock-code hooks, with no effect id, has no instance for `dsp_host` to render: its record sets `stress.harness` to `ot_emu` and runs the same stress project on the whole built image under the ColdFire port, every track routed through the hooked path, for at least 30 s, with no hang and no late DSP read-back (`guard` and `dirty` stay null). `module:doctor` accepts that only for a module without an effect id. A MIDI module: a flood of notes, CC and clock at the wire rate (about 1040 three-byte messages a second) at 240 BPM or more for at least 60 s, stopping mid-note and changing Part while it runs, with no stuck note, no hang and every dropped message counted and explained.

The limits are audit defaults, a judgement and not a repository rule: `--usable`, `--ratio-note`, `--ratio-fail` and `--load-fail` move them, and TESTING.md says why. `scripts/perf-audit.test.mjs` proves the judgement on known-good and known-bad records without firmware, so a surprising verdict is as likely to be the measurement as the module. What it cannot tell is whether the numbers are true: the owner reads the commands and reports behind them, and a number nobody measured is "not tested", never a guess.

**One builder for every machine.** A shared elekloader builder is planned to replace the separate builders (octabam's native build for the Octatrack, the in-browser elekloader build for the Digitakt and Digitone) and to extend easily to other machines. The record is built for that: its fields (static cost, measured cost, a stock comparison, a stress run) do not name a machine, only the unit. When the builder lands, the commands that produce the numbers will move into it and the same record will be written for every machine; until then the Octatrack commands above are the only ones that exist, and a Digitakt or Digitone module states its measured budgets (shared memory, fast SRAM, time at the render hooks) in TESTING.md. Write modules against the contract and the manifest, not against one builder's internals, so that the move costs nothing.

## Digitakt and Digitone

Mods there are linked by one core per machine and built by elekloader's builder in the browser, so there is no native octabam comparison. Each guide has a short section on what applies. Start from [the Digitakt guide](../../sdk/machines/digitakt/README.md) for the core events, budgets and claims, and test a two-mod build, since combinations are the point.
