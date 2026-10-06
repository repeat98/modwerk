# Machines

Read [the module guides index](README.md) first. A machine that sequences notes or steps also follows [sequencing.md](sequencing.md).

**Applies to** modules with manifest `category: machines`. Two shapes exist today.

- **Track machine:** a new entry in a track's machine list. [Analog BD](../../sdk/octabam/modules/analog-bassdrum/README.md) (808 and 909 models).
- **Project machine:** a project-wide behaviour of the sequencer. [Scale Quantizer](../../sdk/octabam/modules/quantizer/README.md).

## Behave like the instrument

### Track machines

A new machine must be a first-class entry wherever the instrument lists machines. Analog BD shows what that takes: about twenty guarded detours, each named for the place it covers (`sdk/octabam/modules/analog-bassdrum/manifest.py`).

- [ ] **The machine chooser.** The track's machine list opens on your machine for a track that uses it, highlights it, and admits it when the choice is committed (`ab_chooser_open`, `ab_chooser_row`, `ab_main_commit`).
- [ ] **SRC SETUP.** The same machine is selectable there, with its row highlighted, and every commit path admits it (`ab_src_names`, `ab_setup_open`, `ab_setup_row`, `ab_src_commit`, `ab_src_commit2`, `ab_setup_edit6`, `ab_setup_draw6`).
- [ ] **Its name everywhere the stock machine names appear,** including the main page (`ab_machine_name`, `ab_name_a`, `ab_name_b`).
- [ ] **A model list** if you have several engines, drawn in the stock pool layout (`ab_pool_open`, `ab_list_draw`, `ab_pool_title`).
- [ ] **Its parameter pages are published through the descriptor,** so the page the panel draws is the page the DSP reads (`ab_tick_hook`).
- [ ] **Other tracks are untouched.** Analog BD resolves its page "without changing other FLEX tracks" (`ab_resolve_pb`). Prove that a neighbouring Flex track plays and edits as stock.
- [ ] **Guarded stock reads.** Every detour names the stock address, length and SHA-256 it expects (`stock_guard`). Never copy stock bytes.
- [ ] **Parameter locks.** Each machine parameter can be locked per step and returns afterwards. Locks are stored per parameter slot, by page: PLAYBACK slots 0–5, LFO 6–11, AMP 12–17, FX1 18–23, FX2 24–29. A slot can draw a knob and publish nothing, so test each one. **Verify** with `ot_spec.py` (locks by knob name on every page) and the emulator.
- [ ] **LFO destinations.** Every continuous machine parameter works as an LFO destination without a crash or a step. **Verify** with `stress_project.py` (three LFOs per track) and record which parameters you modulated.
- [ ] **Save and reload.** A project saved with the machine reloads it, with its parameters and model. Say what a build without the module shows for that track. **Verify.**
- [ ] **The stock machines still work,** on the same track and on others.

Test in layers, as Analog BD does: the DSP engine, the ColdFire glue, the port (emulator) and the UI are four verifiers (`verify_analog_bassdrum.py`, `verify_analog_bassdrum_cf.py`, `verify_analog_bassdrum_port.py` and `verify_analog_bassdrum_ui.py`). Real screenshots must show the chooser, SRC SETUP and the parameter pages.

### Project machines

- [ ] It lives in the stock menu where the setting belongs. Scale Quantizer's rows are PROJ → CONTROL → SEQUENCER.
- [ ] **OFF restores stock behaviour** exactly (SCALE OFF is stock pitch behaviour). Test it.
- [ ] It works on every track type it claims, and the README lists the ones it does not (Flex, Static and Pickup are covered; synth behaviour depends on a machine outside this catalog).
- [ ] It acts on everything that makes pitch, not only live edits. Scale Quantizer snaps the PTCH knob, chromatic trig keys **and parameter locks** to the scale. **Verify** locked values at both ends of the range.
- [ ] **Persistence.** A setting and its defaults survive Part Save and project save and load, or the README says they do not. Settings storage today is "nowhere, or a private file" ([MODULES.md](../../sdk/octabam/docs/remixer/MODULES.md#settings-on-the-card)); do not invent a file format.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots as in [Add or port a module](../ADD_A_MODULE.md).
- [ ] Conflicts are declared. Analog BD runs with stock effects only and is refused beside every module with an effect ID. A machine that brings its own DSP engine needs the same, in `compatibility.conflicts` and in the ledger.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

## Digitakt and Digitone

New SRC machines go in slots 4–7 through the core's `core_machines` table, and the OS treats them "like the stock machine they stand in for", so the machine list comes from the OS. Claim the slot in `platform.claims`. There are four slots for the whole machine: test your mod beside another that also adds a machine ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
