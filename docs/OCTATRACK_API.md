# Octatrack module API

What an Octatrack module builds against: how it runs, the hooks it can use, where it keeps its state and what stays stable. Everything here exists on the current base. Planned pieces are marked as planned. The detail lives in the files this page links. The [module guides](module-guides/README.md) say how a module should behave, and [ADD_A_MODULE.md](ADD_A_MODULE.md) how one is listed.

Try anything on this page on your unit with `npm run module:dev -- <id>`, and add `--watch` to rebuild and try again on every save.

## How a module runs

A module is one runtime package (`.mwrm`) that the Modwerk base loads over USB, beside the other modules, without a reboot. It is declared in an Octabam-format `manifest.py`, and `octamod.module.json` describes it to the site. A module has one of three shapes:

| Shape | What you write | How it is reached |
| --- | --- | --- |
| DSP effect | DSP56300 assembly with `init:` and `proc:` (`DspSection`), a `MenuEntry` and twelve `Param`s | The base adds it to the FX1/FX2 lists and builds its two pages from the `Param`s |
| ColdFire code | GNU-as units (`Linked`); C compiled into a checked-in unit, as Butter Fingers does | The base's hooks (below), declared in `runtime.json`; a site no hook covers yet, through a detour or poke the manifest declares |
| Both | The two above in one manifest | Both, as Tape Echo and Euclid do |

`npm run module:new -- my-filter --kind dsp` (or `--kind coldfire`) writes a draft with a starting manifest. [The templates](../sdk/templates/) explain every manifest field, and [octabam's AGENTS.md](../sdk/octabam/AGENTS.md) lists the assembler and hardware traps to read before any DSP or ColdFire code.

## Core entry points

Every ColdFire module can define these. They run in the UI task, never at interrupt level ([modwerk_module.h](../sdk/runtime/loader/modwerk_module.h)):

| Entry | Called | Return |
| --- | --- | --- |
| `void module_tick(struct modwerk_runtime_api *api)` | every UI tick, 60 a second | nothing |
| `void module_draw(unsigned char *frame)` | each composed frame, before it reaches the screen | nothing |
| `int module_key(int code, int pressed)` | each key press and release | nonzero takes the key from the firmware |
| `int module_enc(int encoder, int delta)` | each encoder turn | nonzero takes the turn from the firmware |

Subscribe to them in `runtime.json` like any hook. Butter Fingers ([its draft](../sdk/drafts/butter-fingers/runtime.json)) does it this way:

```json
{ "schema": 1, "subscribe": [{ "event": "module_key", "fn": "bf_key" }, { "event": "module_tick", "fn": "bf_tick" }] }
```

A key gesture or a stock screen you take goes in `compatibility.uiClaims`, so the configurator never offers two modules that want the same one ([UI claims](module-guides/README.md#ui-claims)).

## Hooks

The base owns every stock site that more than one module needs and shares it as a hook. A module subscribes to the hook and never patches the site. There are four kinds:

| Kind | What the base does | In `runtime.json` |
| --- | --- | --- |
| Call hook | Runs each handler at its stock site, lowest `order` first, then stock. The result passes, takes or drops the call. | `subscribe`: `event`, `fn`, `order` |
| Raised hook | Has no site. A module asks it, and the base ORs every handler's answer. | `raise` to ask, `subscribe` to answer |
| Take hook | Gives its site to the first subscriber whose `claims` accepts the call; its `entry` replays the stock instructions and returns to stock. | `subscribe`, with `fn` naming a `struct modwerk_take` |
| Table | Has no site. Modules contribute fixed-size records that base code reads in order. | `contribute`: `to`, `data`, `order` |

[HOOKS.md](../sdk/machines/octatrack/HOOKS.md) lists each hook's prototype or record, result, order bands, context and current subscribers. By area, the hooks today are:

- **Playback:** `ev_play_increment` (Repitch changes a track's playback rate), `ev_voice_bind`, `ev_voice_bind_run`.
- **Mutes and stops:** `ev_mute_keep` and `ev_trig_muted` (raised), `ev_tail_kill`.
- **MIDI and the keyboard:** `ev_midi_note_on`, `ev_midi_note_off`, `ev_midi_note_key`, `ev_octave_key`, `ev_octave_number`, `ev_keyboard_draw`, the `ev_chromatic_*` hooks, `ev_arp_setup_knob`, `ev_arp_setup_text`.
- **Editing:** `ev_plock_store` (a lock byte is stored), `ev_knob_store` (a knob turn stores a Part byte).
- **Projects and settings:** `ev_project_load`, `ev_project_line`, `ev_project_write`, `ev_project_defaults`, `ev_settings_sanitise`.
- **Tables:** `ot_machines` (track machines), `ot_sequencer_rows` (rows in PROJECT > CONTROL > SEQUENCER), `ot_midi_generators`, `ot_sample_editor_actions`, `ot_machine_starts`.

```json
{ "schema": 1, "subscribe": [{ "event": "ev_play_increment", "fn": "repitch_play_increment", "order": 50 }] }
```

The rules that apply to every hook:

- **Order** runs from 0 to 254, and equal orders run in module-id order.
- **Room:** each take hook and table holds a fixed number of subscribers, usually 8. The loader refuses a package past it.
- **Registers:** handlers keep every register except d0-d1/a0-a1 and return in d0.
- **Context:** handlers are short and never block.
- **Base:** a subscriber needs a base with site hooks. The site offers a base update when the connected one lacks them.

C modules include [modwerk_events.h](../sdk/machines/octatrack/include/modwerk_events.h). It holds the results (`MODWERK_EV_PASS`, `MODWERK_EV_DROP`, `MODWERK_EV_STOCK`), `struct modwerk_take` and each table's record.

**Raising a hook.** Declare `"raise": ["ev_mute_keep"]` and define a zero word `raise_ev_mute_keep` in initialized data. The loader points it at the base's entry when the module is installed, and the module calls through it. Mute Modes does this in assembly.

**When no hook fits.** A site only your module needs, your module patches and declares in the manifest. When a second module needs the same site, or one another module or the base already patches, [propose a hook](module-guides/README.md#propose-a-hook): one entry at the end of [events.json](../sdk/machines/octatrack/events.json), reviewed by the owner. `npm run modules:compat` refuses two modules that patch the same bytes, and it names the hook to use instead.

## Keeping state

There is no per-module store yet; the base's store is planned ([shared sites still to build](module-guides/README.md#shared-sites-still-to-build)). Until it lands, keep state only in records your module owns:

- **Effect knobs** live in the Part's own bytes, so stock saves and reloads them with the project. A new version that changes what a stored value means raises the package's parameter-layout number ([loader README](../sdk/runtime/loader/README.md)).
- **Project settings** go in your own lines in the project file, through `ev_project_write`, `ev_project_line` and `ev_project_load`, as the Scale Quantizer does with its `#SEQUENCER_SCALE=` lines.
- **Global settings** that survive a power cycle go in a range of battery RAM that your module holds in [battery-ram.json](../sdk/machines/octatrack/battery-ram.json). `npm run check` refuses an address outside its owner's range.

Never write into bytes another module saves, even one listed in your `compatibility.conflicts` ([a module owns what it saves](module-guides/README.md#cross-compatibility)).

## Pages and controls

- **An effect** has twelve knobs on two pages: slots 0-5 and 6-11. Each `Param` gives a short label, a default, a value count and a formatter. Put a MODE switch on an even slot. The page comes from the manifest. A draft's page is derived from it by `module:dev`, which shows stepped knobs as numbers until the module is listed.
- **ColdFire code** draws with `module_draw`, reads keys and encoders with `module_key` and `module_enc`, or contributes to a table. For example, a row in `ot_sequencer_rows` is a `struct modwerk_sequencer_row` with `label`, `get` and `set`. Each module's controls sit where a musician would look for them ([choose how a module hooks in](module-guides/README.md#choose-how-a-module-hooks-in)).
- **A window or key layer of its own** (the stock window manager, an input layer pushed onto stock's): the base will not remove, replace or undo the module while stock still names any of its memory, or while a task is paused in its code. The sync is refused with `RUNTIME_UI_OPEN` until the musician closes it. So close everything you open, on every path out (NO, another page, the stock window that evicts yours). A package that opens one names `requiresCapabilities: 1024` in `src/engine/assets/octatrack-module-packages.json`, so only a base with this check (loader capability 1024) is offered it.

## What stays stable

- **Hook indices are an ABI.** A released hook is never renumbered or removed; new ones go at the end of `events.json`.
- **Versioned formats:** `runtime.json` is schema 1. `events.json` is schema 1, for OS 1.40C. The loader ABI is `RUNTIME_ABI` in [loader.h](../sdk/runtime/loader/loader.h). The table records carry their own ABI numbers in `modwerk_events.h`.
- **Renames:** the next base build renames `events.json`, `events.py`, `modwerk_events.h` and the `event` key in `runtime.json`. This page changes with it.

## Coming from Octabam

Modwerk's Octatrack modules use Octabam's manifest format, so a module's `manifest.py`, units and DSP source carry over. Octabam's hooks and events correspond to the hooks above: the base follows Elekloader's hook bus. Octabam's store has no counterpart yet (see [Keeping state](#keeping-state)). Detours into a site the base owns become subscriptions. To port a module, follow [ADD_A_MODULE.md](ADD_A_MODULE.md#octatrack), then run `npm run module:dev` and `npm run module:doctor -- --draft <id>` as for a new one.
