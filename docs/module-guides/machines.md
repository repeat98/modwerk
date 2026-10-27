# Machines

Read [the module guides index](README.md) first. A machine that sequences notes or steps also follows [sequencing.md](sequencing.md).

**Applies to** modules with manifest `category: machines`. Two shapes exist today.

- **Track machine:** a new entry in a track's machine list. [Analog BD](../../sdk/octabam/modules/analog-bassdrum/README.md) (808 and 909 models).
- **Project machine:** a project-wide behaviour of the sequencer. [Scale Quantizer](../../sdk/octabam/modules/quantizer/README.md).

## Behave like the instrument

### Track machines

A new machine must be a first-class entry wherever the instrument lists machines. Analog BD shows what that takes: about twenty guarded detours, each named for the place it covers (`sdk/octabam/modules/analog-bassdrum/manifest.py`).

- [ ] **The machine chooser.** The track's machine list opens on your machine for a track that uses it, highlights it, and admits it when the choice is committed (`ab_chooser_open`, `ab_chooser_row`, `ab_main_commit`). It shows six rows at a time and stock's draw loop never scrolled, so with four machines the last three were hidden; the USB base draws the rows from the list's scroll offset (`mw_chooser_name`, `mw_chooser_row`). Check your row is reachable with every other machine installed.
- [ ] **SRC SETUP.** The same machine is selectable there, with its row highlighted, and every commit path admits it (`ab_src_names`, `ab_setup_open`, `ab_setup_row`, `ab_src_commit`, `ab_src_commit2`, `ab_setup_edit6`, `ab_setup_draw6`).
- [ ] **Its name everywhere the stock machine names appear,** including the main page (`ab_machine_name`, `ab_name_a`, `ab_name_b`).
- [ ] **Closing a window does not clear its retained callbacks.** Snapshot the exact original handler, label and destination roots; fence current and paused consumers, then restore those roots before retiring the outgoing image. A null window handle alone is not a lifetime proof.
- [ ] **Analog BD lifetime gate.** Its Part, whole-image and UI foreign-root closure is an independent gate before a generation may be retired. A bounded root observer never reports semantic completeness: scan completion or zero matches is insufficient, and unknown, partial or overflow results retain both owners. The same coherent snapshot and entry context must stay valid across chunks (rereading endpoints cannot exclude ABA). On Undo or removal the owner-approved path converts every AB track in the source-known Part copies back to FLEX (12-byte restore, marker last) and fails closed on any unverified copy; copies outside that set are a named residual risk ([analog-bd-parts](../../sdk/machines/octatrack/module-adapters/analog-bd-parts/README.md)). Native instruction counts are not physical interrupt timing.
- [ ] **A model list** if you have several engines, drawn in the stock pool layout (`ab_pool_open`, `ab_list_draw`, `ab_pool_title`).
- [ ] **Its parameter pages are published through the descriptor,** so the page the panel draws is the page the DSP reads (`ab_tick_hook`).
- [ ] **Other tracks are untouched.** Analog BD resolves its page "without changing other FLEX tracks" (`ab_resolve_pb`). Prove that a neighbouring Flex track plays and edits as stock.
- [ ] **Guarded stock reads.** Every detour names the stock address, length and SHA-256 it expects (`stock_guard`). Never copy stock bytes.
- [ ] **Parameter locks.** Each machine parameter can be locked per step and returns afterwards. Locks are stored per parameter slot, by page: PLAYBACK slots 0–5, LFO 6–11, AMP 12–17, FX1 18–23, FX2 24–29. A slot can draw a knob and publish nothing, so test each one. **Verify** with `ot_spec.py` (locks by knob name on every page) and the emulator.
- [ ] **LFO destinations.** Every continuous machine parameter works as an LFO destination without a crash or a step. **Verify** with `stress_project.py` (three LFOs per track) and record which parameters you modulated.
- [ ] **Save and reload.** A project saved with the machine reloads it, with its parameters and model. Say what a build without the module shows for that track. **Verify.**
- [ ] **The stock machines still work,** on the same track and on others.
- [ ] **A bounded render.** A machine that renders on the ColdFire (POLY8, FM Synth, VECTOR) runs in the frame interrupt, and USB, the UI and every task wait while it runs. Time your render with DTCN3 and bound it, as POLY8 0.3.1's voice governor does. On USB bases the base's frame guard gives the frame interrupt 80 % of each frame and renders stock's silent source for a machine track whose render would overdraw that, so an unbounded machine drops out in a busy project instead of freezing the unit; card builds have no guard. **Verify** with `npm run device -- guard` on a development base: in the busiest pattern you support, it reports no skips ([traps](../OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)).
- [ ] **Muted trigs.** A mute module drops a muted track's trig where stock binds the track's voice (`ev_voice_bind`). A machine that starts its own note from the trig, in its renderer, gets there first: ask the base's raised hook `ev_trig_muted` before the note starts (`raise` in `runtime.json`) and start no note on a track whose bit is set; 0 means play every trig, as stock does. Card builds have no base hooks ([HOOKS.md](../../sdk/machines/octatrack/HOOKS.md), #777).

Test in layers, as Analog BD does: the DSP engine, the ColdFire glue, the port (emulator) and the UI are four verifiers (`verify_analog_bassdrum.py`, `verify_analog_bassdrum_cf.py`, `verify_analog_bassdrum_port.py` and `verify_analog_bassdrum_ui.py`). Real screenshots must show the chooser, SRC SETUP and the parameter pages.

### Project machines

- [ ] It lives in the stock menu where the setting belongs. Scale Quantizer's rows are PROJ → CONTROL → SEQUENCER.
- [ ] **OFF restores stock behaviour** exactly (SCALE OFF is stock pitch behaviour). Test it.
- [ ] It works on every track type it claims, and the README lists the ones it does not (Flex, Static and Pickup are covered; synth behaviour depends on a machine outside this catalog).
- [ ] **Shared audio/MIDI drawers keep their calling convention.** Before replacing a ColdFire span, inspect every branch target inside it, including MIDI paths that enter after an audio-only load. Reproduce the displaced argument pushes on every entry path. Exercise FUNC+UP/DOWN on MIDI tracks while holding the popup through a redraw; brief taps can miss stack corruption. Quantizer 0.1.3 moves its octave detour to the common argument push for this reason ([#181](https://github.com/repeat98/modwerk/issues/181)).
- [ ] It acts on everything that makes pitch, not only live edits. Scale Quantizer snaps the PTCH knob, chromatic trig keys **and parameter locks** to the scale. **Verify** locked values at both ends of the range.
- [ ] **Persistence.** A setting and its defaults survive Part Save and project save and load, or the README says they do not. Settings storage today is "nowhere, or a private file" ([MODULES.md](../../sdk/octabam/docs/remixer/MODULES.md#settings-on-the-card)); do not invent a file format.
- [ ] **Runtime retirement.** Before a physical machine Trial, read-only preflight must show that the dropped-Part guard permits Undo. Retained LEG/legacy SYNTH references, including conservative stock TRIG matches, can hold an outgoing image; never clear the owner's Parts to make a trial pass. Admission and retirement also check current/paused consumers and RAM aliases.
- [ ] **Full descriptor notifications.** A reset/randomize observation stopped before its notification tail does not verify the complete list/window path. Execute that tail and preserve the stock input layer and window baseline. A bounded stock window pool does not by itself prove full boot, resource exhaustion or hardware UI behavior.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots as in [Add or port a module](../ADD_A_MODULE.md).
- [ ] Conflicts are declared with actual ownership and placement reasons, in `compatibility.conflicts` and in the ledger. Analog BD supports reviewed custom DSP companions (`analogBdCompanions`), subject to space; inspect both cores rather than inheriting a blanket effect exclusion. A machine that brings its own DSP engine needs the same review. Follow the [base/USB lifecycle requirements](../ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle), including shared machine registration, missing-module behaviour and Keep/Undo. Unavoidable limits require owner review.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

## Digitakt and Digitone

New SRC machines go in slots 4–7 through the core's `core_machines` table, and the OS treats them "like the stock machine they stand in for", so the machine list comes from the OS. Claim the slot in `platform.claims`. There are four slots for the whole machine: test your mod beside another that also adds a machine ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
