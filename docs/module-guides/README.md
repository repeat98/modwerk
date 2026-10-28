# Module guides

How to write a module that behaves like part of the instrument and fits every Modwerk workflow. Read this page, then the guide for your module's category, before you write code.

## Choose the category

A module's category is the `category` field of its manifest (`octamod.module.json`, or `modwerk.module.json` on Digitakt and Digitone). It picks the guide; the library may group the module elsewhere.

**Choose it by where the module acts, not by the menu you would like to switch it on from.** An FX processes the audio its slot receives. A module that makes or replaces a track's sound (reads the sample itself, renders voices on the ColdFire) is a machine. A module that makes or changes notes is a MIDI generator or MIDI effect. A module in the wrong category is sent back, so when it is unclear, ask the owner in an issue before you write code.

| Category | Guide | Choose it when the module | For example |
| --- | --- | --- | --- |
| `effects` | [effects.md](effects.md) | processes the audio its FX1 or FX2 slot receives, on the DSP | Mini Verb, Tape Echo, Euclid, Sidechain Compressor |
| `machines` | [machines.md](machines.md) | makes or replaces a track's sound (a track machine, in `ot_machines`), or changes the sequencer project-wide | Analog BD, POLY8, Scale Quantizer |
| `playback` | [playback.md](playback.md) | changes how a stock machine plays its sample: pitch, rate, timestretch, preview | Repitch, Preview Vol |
| `scenes` | [scenes.md](scenes.md) | changes scenes, the crossfader or per-track state recall | MIDI Scenes |
| `midi-usb` | [midi-usb.md](midi-usb.md) | makes, changes or maps MIDI (generators in `ot_midi_generators`, MIDI effects), or USB | CC Map, USB Audio |
| `system` | [system.md](system.md) | changes project and system menus and settings | Mute Modes, Output Matrix |
| `standalone` | [standalone.md](standalone.md) | replaces the whole OS | none yet |
| any | [sequencing.md](sequencing.md) | also acts in time: follow the instrument's transport, tempo, track speed, scale, length and swing | Euclid, Repitch |

## The workflow, in order

1. Read the category guide, then [octabam's trap list](../../sdk/octabam/AGENTS.md) and its later [register](../../sdk/octabam/docs/TRAPS.md) before any DSP or ColdFire code.
2. Follow [Add or port a module](../ADD_A_MODULE.md) for the folder, the manifest, the packages and the comparison with native octabam.
3. Walk the guide's checklists: **Behave like the instrument** and **Integrate**, and for an effect **Sound quality** (aliasing, clipping, DC, idle behaviour). Tick an item only when you did it.
4. Measure the [performance](#performance) and write `evidence/performance.json`: worst-case cycles, a benchmark against stock and a stress run. `npm run perf:audit -- check <that file>` must pass.
5. Run `npm run module:doctor -- <id>` until every line is green. It reads the repository only (no firmware runs) and names the fix for each red line, for example octabam's two DSP source gates (`scripts/dsp-source-gates.py`), a missing or failing performance record, and an effect that renders audio on the ColdFire.
6. Run `npm run check`, and `npm run module:verify -- <id> --os <your 1.40C update>` for an Octatrack module.
7. If you learned something the next developer needs and no guide says, write it into the guide that fits, as its own docs-only pull request ([Share what you learn](../DEVELOPER_WORKFLOW.md#share-what-you-learn)).

## Rules for every module

**Integrate with what exists.** A module is built by the shared builder beside other modules, listed from `sdk/catalog.json`, compared with native octabam and released by the same pipeline as every other. Do not write module-specific builder, library or CI code. If your module has a shape no earlier module had, change the shared code once (`src/engine/`, `sdk/octabam/tools/build/build_bus.py`) and let `module:verify` prove it.

- *Build beside others.* `npm run module:verify` builds your module alone, beside every other offered module, in the fullest selections and in a fixed sample, with and without the stock FX2 effects. A refusal is fine when it is the right one; it must match native octabam's.
- *Declare conflicts; never hope.* Put what you cannot share in `compatibility.conflicts` and in the resource claims (FX2 ids, caves, hook sites, DSP data ranges). The ledger refuses collisions by name. A declared conflict never makes an overlap with another module acceptable: the [cross-compatibility gate](#cross-compatibility) refuses it anyway. Analog BD admits only its reviewed DSP companions (`analogBdCompanions`), subject to actual placement; an effect that builds beside the stock FX2 effects is named in `FITS_BESIDE_STOCK_FX2` (`src/catalog/selection-conflicts.ts`). The library reads the same conflicts to flag a module on its card, and offer a swap, before anyone adds it (`src/catalog/add-blocks.ts`), so a declared conflict needs no extra interface work.
- *Appear everywhere from the manifest.* The `sdk/catalog.json` entry (`id`, `version`, `addedAt`) puts the module in the library, the configurator and its module page. Add `presentation/thumbnail.svg` (320×192) or hand-drawn art in `ModulePreview.tsx`, and `resources.impact`.
- *Survive saved work.* Saved configurations pin module versions, and saved Octatrack projects store knob bytes. A new version must load what an old one saved, or the README says exactly what breaks and how to migrate.
- *Use the same documentation contract.* README sections, a tutorial of at least three steps, TESTING.md, real black-and-white screenshots. See [MODULE_QUALIFICATION.md](../MODULE_QUALIFICATION.md).
- *Ship by the same CI.* Every PR gets the quick check. Only code changes get the Docker compile, the Windows check and a version bump; documentation and media edits need none.

**Octatrack USB is part of the module.** Follow [the base and USB lifecycle requirements](../ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle): plan and prove common companion ownership on both cores, browser/runtime packages and their stock-free scans, install/self-test/Keep/Undo, removal/missing fallbacks and persistence. Native builds and isolated packages alone do not finish integration. A beta-set selection must have a working USB path; unavoidable limits need explicit owner review. Pending loader/ABI adapters remain staging and keep their real hardware qualification gaps.

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

## Cross-compatibility

**No module depends on another, on any machine.** Every module builds, installs and works when it is the only module chosen, on the stock OS, the base and the shared SDK. It never calls, extends or hooks another module's code, engine, rows, tables or files, and it declares no `requires`. No "needs X" selection rule, and no module pull request stacked on another's. When two modules need the same code, put it in the base or the shared SDK first, as a hook, in its own owner-reviewed pull request, or ship both features as one module. Review refuses a module that depends on another, and no exception entry covers it.

**A module owns what it saves.** Its state goes only into records it owns: the core's mod storage where the machine has one, otherwise a tagged record of its own (a kit tail, pattern padding). Never into bytes another module saves, even one in `compatibility.conflicts`: projects move between builds, and the other module reads them as its own (#980).

Every Octatrack module must install beside every other active module and the Modwerk base. `npm run modules:compat` checks this on every pull request, as part of `npm run check` and `npm run module:doctor`, so registered authors' automatic updates pass it too. It reads declarations only: your manifest's detours, hooks, pokes, references, caves, grown tables, kept bytes and stock copies, the port recipes, the committed base package and octabam's DSP resource rules. It needs no firmware and runs in under a second. It checks every pair and the whole set.

- **One owner per byte.** No two modules, and no module and the base, may patch overlapping stock bytes or relocate the same stock table (Elekloader's rule 5).
- **Share behaviour through hooks.** When two modules need to act at the same stock site, the base owns that site as a [hook](#hooks), and each module subscribes to it or contributes to its table. Never patch a site the base owns (Elekloader's rule 4).
- **Copy stock bytes only from bytes nobody patches.** A copy taken from bytes that another module or the base patches depends on install order. Take the identical bytes from an unpatched location instead. For example, a Tape Echo runtime port copied 13 bytes from 0x4000230e, under the machine group's Part-validator hook at 0x40002318; its fix takes the same instruction bytes from 0x4003886a.
- **Pinned effect IDs and chooser rows are exclusive.** Pick a free one.

The only exceptions are the reviewed entries in `sdk/machines/octatrack/compatibility.json`. Each names both modules, the exact addresses and a reason:

- `group-owned`: one module's reviewed composition owns every listed site. None today: the machine modules are independent packages that share the chooser, the SEQUENCER page and the chromatic keyboard through the base's tables and take hooks.
- `pending-migration`: two modules still patch the site of a planned hook and may do so only `until` both subscribe. None today: Repitch, POLY8 and Mute Modes subscribe ([replaces](#hooks)).

An entry fails once a named module is no longer active or nothing meets at a listed site, so the file stays exact. A new entry needs owner review, and is the last resort: propose a hook instead. The base's own exceptions are `BASE_OWNS` in `sdk/machines/octatrack/elekloader/build_core.py`.

The gate does not prove runtime behaviour, DSP placement, cycles or hardware compatibility. `module:verify` and the qualification steps still cover those.

### Choose how a module hooks in

A module reaches the musician and the instrument through an entry point: a key gesture, a page, a menu row, a stock site. The first module to use one decides how every later module fits beside it, so choose it with the next one in mind, on every machine.

1. **Look at what exists first.** List what the base or core already offers on this machine: its hooks ([HOOKS.md](../../sdk/machines/octatrack/HOOKS.md) on the Octatrack, the core hooks in the machine's SDK guide elsewhere), newer upstream core releases not yet pinned, and how the modules already there place their pages and controls. Use what fits.
2. **Decide it with the developer.** Before you build, set out where a musician would look for the controls, how they get there with stock gestures, and what happens when a second and a third module want the same key, page or site. Bring the options with their trade-offs and let the developer choose, and the owner for a new machine. A gesture only one module can hold, such as a second press on a stock page key, leaves no room for the next one. On a machine just being unlocked the first modules set the pattern every later one copies.
3. **Add a base or core hook only when many modules will use it.** A hook is code every unit carries, an ABI that is never renumbered, and an owner-reviewed base or upstream core release. It pays off for an entry point or site many modules will share, such as a list of pages behind a stock key. When only your module needs a site, patch it in the module and declare it (`compatibility.uiClaims` on the Octatrack, `platform.claims` on the elemod machines); the module that needs it second proposes a shared hook ([Octatrack](#propose-a-hook), [elemod](#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).

### UI claims

Build your module to work with everything else: that is the default. Two modules must not take the same key gesture or the same stock screen, because the musician would get whichever one runs first. Declare what yours takes in `compatibility.uiClaims` in `octamod.module.json`, and the gate compares it with every active module:

- `key:HELD+PRESSED`: the keys held, in any order, then the key pressed or the encoder turned, for example `key:UP+TEMPO` or `key:CUE+LEVEL`. Add `@PAGE` when it only works on one page (`key:FUNC+LEFT@CHROMATIC`); without it, the gesture counts on every page. `TRACK` and `TRIG` stand for any track or trig key, `A`-`F` and `LEVEL` for turning an encoder. The contract lists every name.
- `screen:NAME`: a stock window or page your module draws over or replaces, for example `screen:TEMPO`.
- `[]` when it takes neither. What it adds through the base's FX list, machine list or menu rows is not a claim: the base shares those.

New modules must declare it (`module:doctor` checks). If the clash with another module is deliberate, add that module to your `compatibility.conflicts`. The gate then accepts it, and the configurator never lets anyone choose both together.

### Hooks

Shared behaviour on the Octatrack follows Elekloader's hook bus ([ADAPTING.md](https://github.com/irpina/elekloader/blob/main/docs/ADAPTING.md), "Do not patch the shared sites: subscribe"). The Modwerk base owns every stock site that more than one module needs and shares it as a hook of one of four kinds. The registry is `sdk/machines/octatrack/events.json`. `sdk/machines/octatrack/HOOKS.md` lists every hook with its prototype or record, what a result means, its order rule and where it runs. C modules include `sdk/machines/octatrack/include/modwerk_events.h`. The next base build renames these files and `runtime.json`'s `event` key.

| Kind | What the base does | What your `runtime.json` declares | Example |
| --- | --- | --- | --- |
| Call hook | Runs every handler at its stock site, lowest `order` first, then stock. A handler's result passes, takes or drops the call, as the hook's contract says. | `subscribe`: `event`, `fn` (a C function) and `order` | `ev_play_increment`: Repitch changes a track's playback increment |
| Raised hook | Has no stock site. A module asks it, and the base runs every handler and returns their answers OR'd. | To ask it: `raise`, and a zero word `raise_<hook>` in initialized data, which the loader points at the base's entry at install. To answer it: `subscribe`, as for a call hook | `ev_mute_keep`: Mute Modes asks which tracks another module still reads while they are muted |
| Take hook | Gives its site to one subscriber: the first record, in `order`, whose `claims` is 0 or accepts the call. Its `entry` runs with every register as at the site, replays the stock instructions and returns to stock itself. | `subscribe`, with `fn` naming a `struct modwerk_take` {claims, entry} | `ev_octave_key`: POLY8, FM Synth and Scale Quantizer each claim their own tracks |
| Table | Has no site. Modules contribute fixed-size records, and base code reads them in `order`. | `contribute`: `to`, `data` (the record's symbol) and `order` | `ot_machines`: each track machine's chooser row, page and renderer; `ot_midi_generators`: each MIDI generator's list row and pages |

A `runtime.json` needs `schema` and at least one subscription or contribution. The other keys are optional:

```json
{
  "schema": 1,
  "subscribe": [{ "event": "ev_play_increment", "fn": "mymod_rate", "order": 50 }],
  "contribute": [{ "to": "ot_machines", "data": "mymod_machine", "order": 40 }],
  "raise": ["ev_mute_keep"]
}
```

- **Order.** 0-254; equal orders run in module-id order. 255 marks a raise and is never an order. Each entry gives its bands, for example 10-29 for a machine that claims its own tracks.
- **Replaces.** `replaces` names what your native octabam build patches at that site instead: a detour's symbol, or for a take hook or a table a list of detour symbols and `0x` addresses of pokes and references. The runtime package leaves it out, and the gate stops counting it.
- **Room.** Each take hook and table holds a fixed number of subscribers: 8, and 4 for `ot_machines`. The loader refuses a package past it, and `modules:compat` refuses more active modules on one than its room, counting each module once as the loader does. It also lists the ones that are full: a module that needs a full one proposes more room first. Before anything is sent, the site also refuses a raise on anything but a raised hook and a take or table record that runs past the package's image.
- **Context.** Handlers run where the entry says: short, with no firmware call that can block. Call-hook handlers use the C convention and keep every register but d0-d1/a0-a1.
- **Base.** A subscriber needs a base built with site hooks (loader capability 128). Before it sends anything, the site asks for a base update when the connected base can't take the package.
- **Hook indices are an ABI.** Released packages carry them. Add new hooks at the end of the registry, and never renumber a released one.

Machine modules whose native source predates these hooks declare the same subscriptions and contributions in `sdk/machines/octatrack/module-adapters/machine-ports.json` instead of a `runtime.json`.

### Propose a hook

Propose a hook, or a table, when the gate says two module hooks meet, when you need a site that another module or the base already patches, or when many modules will plainly need the same site. A site only your module uses needs no shared hook ([choose how a module hooks in](#choose-how-a-module-hooks-in)):

1. Open a pull request that adds one entry at the end of `sdk/machines/octatrack/events.json`, then regenerate the dispatch, headers, HOOKS.md and hook list with `python3 -B sdk/machines/octatrack/events.py --write`. A hook needs its name (`ev_` and what happens), its kind, its stock site (address, length in whole instructions and a SHA-256 guard), or none for a raised hook, when it runs, its C prototype and its order rule. A table needs an `ot_` name, its record size and C declaration, its room and the sites its reader owns. Addresses, lengths and hashes only: no stock bytes. A [take hook](../../sdk/machines/octatrack/elekloader/README.md#take-hooks) needs a stock tail, not a prototype. CI has no firmware: rebuild the base with your OS.
2. Say which modules patch that site today. Until they subscribe, list each such pair in `compatibility.json` as `pending-migration`, with the hook and `until`.
3. The owner reviews the entry. Every later module subscribes or contributes instead of patching.

### Propose a hook on the Digitakt, Digitone or Digitakt II

On the elemod machines (also the Rytm and the Analog Four) the core owns the shared sites. Its contract is `sdk/<machine>/core/interface.json` (`core-profile/interface.json` on the Digitakt II, Rytm and Analog Four), and `modules:check` refuses a mod that uses anything else. So when several mods will need a stock site the core does not expose (an LFO or voice path, the render, the FX returns, a page the OS builds, state another mod could want), the mod does not patch it: propose the hook, and the mod ships once the machine's base carries it. A site only this mod needs, it patches and claims ([choose how a module hooks in](#choose-how-a-module-hooks-in)).

1. Write the proposal as one pull request, before the module. For each hook: its name (`ev_` and what happens), the stock site (OS release, address, length in whole instructions and a SHA-256 guard; addresses, lengths and hashes only, no stock bytes), when it runs and in which context (UI tick, key, sequencer, render), its C prototype, what a nonzero result means and its order rule. For shared state: a named table with its record size, room and reader. Hook indices are an ABI: a released one is never renumbered.
2. Say which mods patch that site or hold that state privately today, and what each would subscribe to instead. On the Digitakt mk1 the SRC machines share the SRC page, render and LFO destination sites, so a proposal there covers them together.
3. The owner reviews it. The hook goes into the machine's Modwerk base in this repository, started from the pinned core's source while the base does not exist yet; Modwerk does not wait for an upstream core release (owner, 28 October 2026; [recipe](../MACHINE_RECIPE.md)). The module pull request follows, subscribing in `build.json`, and it builds and runs on its own: a mod that shares another mod's state or code is refused ([no module depends on another](#cross-compatibility)).

### Flag every incompatibility

Build your module to work beside everything else. Machine lists, effect lists and menu rows belong to the base, so modules that add to them never collide. Where your module truly cannot run beside another, that is allowed, but say exactly which: add the other module's id to `compatibility.conflicts` in `octamod.module.json`. The configurator then never offers both together.

Collisions are caught automatically, so nothing ships incompatible without its author deciding:

- **Card builds.** `npm run modules:pairs` runs octabam's ledger on every catalogue module alone and beside every other, in each context POLY8's shared machine list creates, and writes `src/catalog/compatibility-pairs.json`. A pair the ledger refuses that neither module flags fails the check. It also refuses an effect whose declared FX2 buffer reaches a range another module declares in that slot (Sidechain Compressor's key window); over USB the base refuses that buffer per block at run time, so only card builds need that flag. The configurator refuses every refused or flagged pair by itself, so no rule is written by hand. The table grows with the square of the number of modules, and the same check proves with the full ledger that pairs decide every larger selection.
- **USB sets.** `npm run modules:compat` still refuses every byte collision, flagged or not: beta sets install whatever is chosen, so subscribe to a hook or [propose one](#propose-a-hook).
- **Digitakt and Digitone.** `npm run modules:check` refuses two mods that patch overlapping bytes on a release both support unless one names the other in `compatibility.conflicts`. The website already refused those pairs; the flag makes the author's decision explicit.
- **Who flags.** The module whose change makes the pair collide flags it in its own manifest: the newer module, or the one being updated, and it fixes the collision instead when that is no big refactor. Nobody edits another author's module to add a flag. A flag names an existing module id of the same machine; the check refuses any other. Changing only `compatibility.conflicts` needs no new module version, but still runs every check and needs a marked note in the module's changelog.
- **What no gate sees.** A flag can also name a limit the ledger cannot see, such as DSP placement or behaviour. Say why in the README's Compatibility section. `npm run module:doctor -- <id>` lists the collisions the ledger finds, so a flag that no longer applies can go at the next version.

### Shared sites still to build

The more of these the base owns, the more modules combine. Each is a hook to [propose](#propose-a-hook), in its own owner-reviewed pull request, before a module uses it:

| Site | Today |
| --- | --- |
| Track machine list (SRC SETUP) | Base table `ot_machines`; on the card, POLY8's shared machine list |
| Effect lists (FX1, FX2) | USB: the base has 128 effect ids, 109 of them for modules, and gives each installed effect module its own ([wider ids](../OCTATRACK_MORE_EFFECT_IDS.md)); card: stock's 32, 13 of them for modules, pinned |
| SEQUENCER rows | Base table `ot_sequencer_rows` |
| MIDI generators on a MIDI track (MIDI NOTE SETUP's list, the ARP page) | Base table `ot_midi_generators`; on the card, VECTOR's own registry ([midi-usb.md](midi-usb.md#midi-generators-and-midi-effects)) |
| MIDI effects on a MIDI track's notes | Pitch: take hook `ev_midi_note_key`. Velocity, timing, added notes: not built |
| Stock DSP effects a module hooks (Sidechain Compressor, Output Matrix) | Not built: DSP-side taps, one owner per stock site |
| Module settings | Not built: upstream octabam's [OTX settings store proposal](https://github.com/sambanks/octabam/blob/main/docs/proposals/OTX_PROJECT_PROPOSAL.md) |

### Read the gate's message

Each problem is one line naming the modules, the byte ranges and what each one patches, followed by a `fix:` line with the route and a link to this section. `npm run modules:compat -- <id>` lists only what involves your module.

| The message says | Do this |
| --- | --- |
| `X patches A..B (…), which is the hook ev_N` | Subscribe to `ev_N` instead of patching |
| `X (detour …) and Y (detour …) both claim A` | Two module hooks meet: [propose a hook](#propose-a-hook) |
| `X (poke …) and Y (…) both claim A` | One owner per byte: patch other bytes, or propose a hook |
| `X copies stock bytes A..B (…), but Y patches C..D` | Copy the identical bytes from an unpatched location |
| `X (table …)` meets another claim | The table already has an owner: propose a hook or a shared table |
| `X (cave …)` or `linked unit` meets another claim | Pick free space, or let the build place the unit |
| `fx2 id: X and Y both claim 0x…` | Pick another chooser row (a free effect ID) |
| `core-private Y`, `DSP data range`, `FX2 instance buffers` | Claim free words, or request a base-owned region |
| `relation …` | Correct `compatibility.json`; every entry needs owner review |
| `X (key:…) and Y (key:…) take the same key gesture` (or screen) | Change one so both work, or list the other module in `compatibility.conflicts` ([UI claims](#ui-claims)) |

## Performance

A module that is slow, or that only works when it is the only thing running, takes the room of every other module and of the stock instrument. Every new module therefore carries `evidence/performance.json`, a record of three measurements that `npm run perf:audit -- check <file>` judges and `module:doctor` enforces for modules listed from 7 October 2026. Earlier modules keep their [qualification evidence](../MODULE_QUALIFICATION.md). Like `fx:audit`, the judgement runs offline and the numbers come from the native harness, which CI never has: a green `npm run check` says nothing about them. Start from `npm run perf:audit -- template dsp` (an effect, machine or other DSP module) or `npm run perf:audit -- template coldfire` (a MIDI generator, MIDI effect or other ColdFire code).

New FX should aim for DSP cost in the **same ballpark as stock SPRING REV at its worst settings**. DSP cycles are tightly budgeted, so plan around that reference before implementation and measure as features are added. Benchmark Spring's expensive types/settings, endpoints, moving controls and trigger splits on both cores. Match units, audio buffers, sample/block sizes, core layouts and harness-overhead treatment. This is a design target without a fixed ratio or hard per-effect ceiling. A substantially more expensive design needs optimization and explicit review of the cost and remaining headroom. The complete supported configuration must still fit the instrument's real-time budget.

1. **Cycle count.** The static floor of the worst mode loop (`tools/build/cycle_count.py`: words in the per-sample loop, no contention) and the dearest case you measured, with the knobs moving. Instances multiply: `instancesPerCore` times the static cost must fit what a core can spend (3120 per sample), and a ColdFire module's worst event must fit its deadline. Average or nominal load does not count; this is the same worst case [MODULE_QUALIFICATION.md](../MODULE_QUALIFICATION.md) asks for.
2. **A benchmark against stock.** A DSP module is compared with the stock effect closest in function, from `benchmark_stock_dsp.py` (`out/stock_dsp_bench/results.json`, made from your own OS file, so never committed; the record copies only the comparator's figure, the dearest stock figure and the stock image's SHA-256). Up to 1.5x its cost is fine, up to 3x needs a sentence on what the extra cost buys, and above that, or dearer than every stock effect, fails unless `stock.justification` explains it and the owner accepts. A ColdFire module is compared with the stock image under the same flood: `cfmeter.py` reports the longest frame interrupt and the idle time, and the module may add at most 10% of a 362.8 us frame to the interrupt and 10 points of idle time.
3. **A stress run.** A DSP module: the most instances you claim per core, eight tracks, three active LFOs per track and a dozen locked slots per step (`stress_project.py`), rendered for at least 2 s through `dsp_host -guard -dirty` (`pressure.py render`), with no clobber and no hang. Two seconds take about a minute or two in `dsp_host`; keep test runs that short (owner, 15 October 2026). DSP code reached only through stock-code hooks, with no effect id, has no instance for `dsp_host` to render: its record sets `stress.harness` to `ot_emu` and runs the same stress project on the whole built image under the ColdFire port, every track routed through the hooked path, for at least 30 s, with no hang and no late DSP read-back (`guard` and `dirty` stay null). `module:doctor` accepts that only for a module without an effect id. A MIDI module: a flood of notes, CC and clock at the wire rate (about 1040 three-byte messages a second) at 240 BPM or more for at least 60 s, stopping mid-note and changing Part while it runs, with no stuck note, no hang and every dropped message counted and explained.

The limits are audit defaults, a judgement and not a repository rule: `--usable`, `--ratio-note`, `--ratio-fail` and `--load-fail` move them, and TESTING.md says why. `scripts/perf-audit.test.mjs` proves the judgement on known-good and known-bad records without firmware, so a surprising verdict is as likely to be the measurement as the module. What it cannot tell is whether the numbers are true: the owner reads the commands and reports behind them, and a number nobody measured is "not tested", never a guess.

**One builder for every machine.** A shared elekloader builder is planned to replace octabam's native build and the in-browser elekloader build. The record names no machine, only the unit, so the same record will be written for every machine once the builder lands; until then the Octatrack commands above are the only ones, and a Digitakt or Digitone module states its measured budgets (shared memory, fast SRAM, time at the render hooks) in TESTING.md. Write against the contract and the manifest, not one builder's internals.

## Digitakt and Digitone

Mods there are linked by one core per machine and built by elekloader's builder in the browser, so there is no native octabam comparison. Start from [the Digitakt guide](../../sdk/machines/digitakt/README.md) for the core hooks, budgets and claims, and test a two-mod build, since combinations are the point.
