# Effects

Read [the module guides index](README.md) first. If your effect does anything in time (a delay, a gate, an envelope, a rhythm), also read [sequencing.md](sequencing.md).

**Applies to** modules whose manifest has an `effectId` and a `compatibility.location` of `FX1`, `FX2` or `FX1 / FX2`.

**Already follow it:** [Mini Verb](../../sdk/octabam/modules/miniverb/README.md), [Tape Echo](../../sdk/octabam/modules/tapeecho/README.md), [Euclid](../../sdk/octabam/modules/euclid/README.md), [TapeHead](../../sdk/octabam/modules/tapehead/README.md), [Sidechain Compressor](../../sdk/octabam/modules/sidechain-compressor/README.md), Spectrum, Modulation, Character. Copy the shape of the one closest to yours.

## Decide the kind first

Octabam names three (`sdk/octabam/docs/remixer/MODULES.md`, "Decide first"). Choose an **insert** unless you need the shared bus.

- **Insert:** processes its own track in place, runs on any track and several at once, placed in both DSP payloads. Almost every hazard in the trap list does not apply. Character is the worked example.
- **Server** (owns a bus accumulator, bound to one core) and **bus client** (taps its track into the bus): only when the effect is genuinely shared across tracks. There are two servers; `sdk/octabam/docs/effects/XBUS.md` explains why.
- A module that replaces a stock effect in place (Sidechain Compressor replaces COMPRESSOR and keeps its dispatch) has its own rules: `MODULES.md`, "Replacing a stock effect", and the module's TESTING.md.

## Declare

- **Twelve parameters** (two pages of six). Each has a name, count, default and formatter. Write every field; the descriptor is cloned from a stock donor and anything you omit stays the donor's.
- **Names are short.** The abbreviation is 4 characters, the full name 12. A 5-character abbreviation "threw a line-F exception the moment a parameter was LFO-modulated" (`MODULES.md`). The schema now rejects it; do not work around the schema.
- **A one-line `doc` on every named, drawn parameter.** The selftest requires it. `labels` give a stepped select its words.
- **A default inside its own count.** A default or stored value outside the count is used as an index and stalls the sequencer. The schema rejects the default; it cannot see a stored value.
- **`active=True` on every slot the panel draws.** A slot the panel does not draw is unreachable, however complete the DSP.
- **Draw a knob only if the DSP reads it.** The inverse is also true: a slot can draw a knob and publish nothing.
- **A MODE select goes on an even slot of page 2** (slot 6 is hardware-confirmed). Declare `mode_slot` and `ModeView` so the knob names and defaults follow the mode.
- **Claims.** FX2 id (a free, non-stock id; `registry.modules()` refuses duplicates), caves, hook sites, DSP data ranges, `Claims(fx1_only=True)` for an FX1-only station. The ledger refuses collisions by name.
- **`dear`:** every knob at its dearest setting. Pressure renders and the stress project read it.
- **`gates`:** the verifiers `make check` runs when a remix carries your module.

## Behave like the instrument

- [ ] **Safe defaults.** Say what the effect does with every knob at its default. An insert that should be transparent is a bit-exact passthrough at defaults (Spectrum checks exactly that).
- [ ] **No zipper noise.** A knob the DSP applies once per 16-frame block steps at the block rate while it moves. Ramp per sample. `verify_knob_clicks.py` moves every continuous knob mid-render and flags steps above -70 dBFS.
- [ ] **Parameter locks.** Each of your knobs can be parameter-locked per step and returns to its set value on the next unlocked step. Lock bytes live per parameter slot: FX1 slots 18–23, FX2 slots 24–29 (`0xff` = none), and a lock overrides the knob on its trig. Author the test with `ot_spec.py` (locks on `fx1`/`fx2` by knob name, with `clear`). **Verify** every knob, at both ends of its range and on adjacent steps.
- [ ] **Stale locks.** Changing a slot's count or moving a knob leaves old locks pointing at whatever now sits there. After a layout change, run `ot_bank.py strip --pages fx1,fx2` and `ot_project.py stamp-defaults <project> <remix>` on every test project (a saved Part feeds a new layout its old bytes).
- [ ] **LFO and modulation.** Every continuous (count 128) knob accepts LFO modulation without a crash or a click. Selects step through discrete values; do not put a select where a musician expects a smooth sweep. **Verify** with `stress_project.py`: eight Flex tracks, three active LFOs per track, 15 locked slots per step.
- [ ] **Scenes and the crossfader.** Knobs morph sensibly between scenes. **Verify** and record; no repo gate covers a custom effect's scene behaviour.
- [ ] **Mode words.** Selects print words, not numbers (`verify_labels.py`), names follow the mode (`verify_modenames.py`), defaults follow the mode (`verify_modedefaults.py`).
- [ ] **Instances.** It runs on any track, in both FX slots, on both cores, and several at once. Record the number you measured, not the number you hope for.
- [ ] **Clean state.** Switching Part, pattern or mode, and a stop and restart, leave no ringing, stale buffer or wrong phase. The "dirty-state render" gate exists; **Verify** the rest.
- [ ] **A missing module degrades safely.** A project that selects your effect on a build without it falls back to SEND (a bus) or NONE (no bus); `MODULES.md`, "What an unimplemented id falls back to". State what a musician sees.
- [ ] **Timing.** Anything tied to steps, tempo or swing follows [sequencing.md](sequencing.md).

## Integrate

- [ ] `sdk/catalog.json` has the entry (`id`, `version`, `addedAt`), so the library, the configurator and the module page show it.
- [ ] The manifest's `controls[]` match the native parameters one for one: name, count, default, description. The README table and tutorial match too.
- [ ] `compatibility.location` matches where the native manifest places it (FX1, FX2 or both); `module:verify` compares the chooser with native octabam's.
- [ ] Conflicts are declared. Analog BD refuses every module with an effect ID; if your effect fits beside the stock FX2 effects, add it to `FITS_BESIDE_STOCK_FX2` in `src/catalog/selection-conflicts.ts`, otherwise it needs their space.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` passes. Refusals for crowded selections are expected; each must match native's.
- [ ] A 320×192 `presentation/thumbnail.svg` that shows what the effect does.
- [ ] `resources.impact` for CPU, DSP core and memory, with a rationale and a source record.
- [ ] Real screenshots show where the effect is chosen (the FX1 or FX2 chooser) and each parameter page.
- [ ] `npm run module:doctor -- <id>` is green.

## Test

Octabam's behaviour tests run through its DSP host and need a native toolchain ([SDK README](../../sdk/README.md#octatrack-native-development)). The pattern to copy is `verify_<module>.py`: render through `dsp_host` against predictable arithmetic or a reference. Drive any knob offline with `send_probe.py --set NAME=VALUE`. In TESTING.md say which you ran, and mark everything else "not tested".

## Traps

- The DSP assembler silently mis-encodes some instructions: [octabam's AGENTS.md](../../sdk/octabam/AGENTS.md). Disassemble what you assemble.
- A knob rename or count change is a stored-data change. Stamp every project before anyone plays it.
- A formatter overrides the count it sits beside; declare `formatter=` per slot.
- A labelled select wider than five values falls back to a plain dial unless it uses `Formatter.WIDE_STEPPED`.
- Voicing is judged by ear, level-matched, A/B/A/B, wet only. Render locally rather than flashing.

## Digitakt and Digitone

An effect there is a mod that subscribes `ev_render_in` and `ev_render_out` and links into the machine's core. Budgets: 128 KiB of shared mod memory and 2,304 bytes of fast SRAM for time-critical code. Claim every resource (settings rows, SysEx ids) in `platform.claims`; two mods may never claim the same one. Because the point is combining mods, test your mod together with at least one other in the browser builder, and state which combinations you built.
