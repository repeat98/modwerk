# Effects

Read [the module guides index](README.md) first. If your effect does anything in time (a delay, a gate, an envelope, a rhythm), also read [sequencing.md](sequencing.md).

**Applies to** modules whose manifest has an `effectId` and a `compatibility.location` of `FX1`, `FX2` or `FX1 / FX2`. An effect processes the audio its slot receives, on the DSP. A module that makes or replaces its track's sound is a machine, whichever slot switches it on ([choose the category](README.md#choose-the-category)).

**Already follow it:** [Mini Verb](../../sdk/octabam/modules/miniverb/README.md), [Tape Echo](../../sdk/octabam/modules/tapeecho/README.md), [Euclid](../../sdk/octabam/modules/euclid/README.md), [TapeHead](../../sdk/octabam/modules/tapehead/README.md), [Sidechain Compressor](../../sdk/octabam/modules/sidechain-compressor/README.md), Spectrum, Modulation, Character. Copy the shape of the one closest to yours.

## One effect per module

On every machine, a module is one effect. A MODE select may switch between ways of doing the same job, as Modulation's JUNO, DIM, FLNG, COMB and PHSR and Spectrum's filter models do. A set of different effects in one module, picked with a type select (a send rack with a chorus, a filter bank, a drive and two delays, say), is sent back: split it into one module per effect.

The base shares the effect slots so that effects from different authors sit side by side: on the Octatrack it gives each installed effect module its own effect id in the FX lists. One effect per module lets a musician choose, combine, update and remove exactly the effects they want, lets the gates judge each effect's cost and conflicts on its own, and keeps a fix to one effect from shipping as an update to all. Where the effects need the same stock site, such as a send return the machine's core has no hook for yet, that site becomes a shared hook first, in its own owner-reviewed pull request ([propose a hook](README.md#propose-a-hook); [on the elemod machines](README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)), and each effect subscribes to it.

Design the effect yourself. One modelled on another current product of the same maker waits for the owner, even in your own DSP and under new names ([refuse infringing work](../DEVELOPER_WORKFLOW.md#refuse-infringing-work)).

## Plan the DSP budget first

New FX should aim for DSP cost in the same ballpark as stock SPRING REV at its worst settings. Choose the algorithm, filter order, interpolation and feedback topology with that target in mind, then measure and optimize as features are added. Benchmark Spring's expensive types/settings, moving controls and trigger splits under matched conditions on both cores. This is a design target without a fixed ratio or hard per-effect ceiling. Substantially higher cost needs optimization and review of the remaining headroom. See [Performance](README.md#performance) for the evidence and audit.

## Plan compatibility before implementation

Include Analog BD, stock effects and common custom companions in the design matrix on both cores. Record actual P/X/Y reservations and available contiguous openings, including live stock tenants inside allocator-owned FX2 buffers. Total free words alone do not show that a package fits. For a fixed P table, `DspSection(split_ptable=True)` permits separately placed table and code when contiguous placement fails; source compilation proves both relocation origins against fresh assembly. Keep table precision and delay range unless a documented design tradeoff requires changing them.

Before release, verify accepted and refused native/browser compositions, stock helpers, dispatcher entries and both physical table/code spans. Do not treat absence from Analog BD's reviewed-companion list as an inherent incompatibility: evaluate and prove the layout first, then update the matching native/browser lists. If an incompatibility is necessary, document its actual resource or ownership conflict and obtain owner review before publishing.

## Decide the kind first

Octabam names three (`sdk/octabam/docs/remixer/MODULES.md`, "Decide first"). Choose an **insert** unless you need the shared bus.

- **Insert:** processes its own track in place, runs on any track and several at once, placed in both DSP payloads. Almost every hazard in the trap list does not apply. Character is the worked example.
- **Server** (owns a bus accumulator, bound to one core) and **bus client** (taps its track into the bus): only when the effect is genuinely shared across tracks. There are two servers; `sdk/octabam/docs/effects/XBUS.md` explains why.
- A module that replaces a stock effect in place (Sidechain Compressor replaces COMPRESSOR and keeps its dispatch) has its own rules: `MODULES.md`, "Replacing a stock effect", and the module's TESTING.md.

## Declare

- **Twelve parameters** (two pages of six). Each has a name, count, default and formatter. Write every field; the descriptor is cloned from a stock donor and anything you omit stays the donor's.
- **Names are short.** The abbreviation is 4 characters, the full name 12. A 5-character abbreviation "threw a line-F exception the moment a parameter was LFO-modulated" (`MODULES.md`). The schema now rejects it; do not work around the schema.
- **A one-line `doc` on every named, drawn parameter.** The selftest requires it. `labels` give a stepped select its words. A USB package carries a select's labels as consecutive strings, and the stock-free scans (`sdk/machines/octatrack/elekloader/module_packages.py`) refuse a run that repeats stock: RINGMOD SC's OFF, T1-T8 repeated a 25-byte stock list and failed both scans. Pad or reword such labels (it stores " T1 ", drawn centred like "T1").
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

## Sound quality

For a THRU regression, record the input routing and level, amp settings and
the machine trigger. Route a known signal, trigger with **TRACK + PLAY** and
confirm nonzero dry output before judging the FX. The [MKII manual](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf)
also documents TRIG 9–16 for machines connected to audio tracks. An untriggered
or unrouted silent render cannot establish clean audio. Exercise tracks on
both DSP cores and retain the exact image and settings with the result.

The checklist above is how the effect behaves in the instrument; this is how it sounds. The DSP works in 24-bit fixed point at 44.1 kHz, so the usual effect-design hazards are the fixed-point ones. `npm run fx:audit` measures the four a program can: aliasing, clipping, DC and what the effect does once the input stops. No gate in CI runs it, because the renders it reads come from the native harness and CI never has firmware; a green `npm run check` says nothing about it. Run it, or write "not tested" in TESTING.md.

- [ ] **Aliasing.** Anything that bends a waveform makes harmonics: saturation, waveshaping, folding, clipping, bit reduction, ring modulation, and a compressor or gate whose gain moves at audio speed. At 44.1 kHz a harmonic above 22.05 kHz does not disappear, it folds back below Nyquist as a tone unrelated to the note, and it gets harsher the higher a musician plays. A delay, grain or playback read at a fractional position (chorus, flanger, pitch shift) has the same problem twice over: interpolation error, which is largest at high frequencies, and content that a faster read pushes above Nyquist. **Check:** `fx:audit` plays four tones (about 1.1, 2.7, 5.3 and 9.1 kHz, each at -12 and -1 dBFS) through the effect at its dearest settings and prints, per tone, the true harmonics and the aliased energy in dBc. It places each tone so that a folded harmonic never lands on a true one, which is how the two are told apart. The audit's default limit is -60 dBc: a judgement, not a repository rule (`--alias-limit` moves it; say in TESTING.md why). **Fix**, usually cheapest first: limit the bandwidth that reaches the nonlinearity; use a smoother curve, since an abrupt corner makes far more high harmonics than a rounded one; smooth any gain applied to audio; interpolate modulated reads better than linearly (cubic or Hermite); oversample around the nonlinearity, or use antiderivative antialiasing for a static waveshaper. Every fix costs cycles per sample, so measure the cycles again afterwards. A deliberately lo-fi mode (bit or rate reduction) may exceed the limit: record the figure in the README and say it is intended.
- [ ] **Headroom and clipping.** A result larger than full scale is limited to full scale when it is stored (octabam's [AGENTS.md](../../sdk/octabam/AGENTS.md) calls it the store's limiter), and a limit is a hard clip: it makes harmonics, and they alias. A wet plus dry sum, a resonant peak or a gain stage after a boost can all reach it. `fx:audit` counts the samples on the limit for every tone and notes them. **Verify** whether the effect meant to limit there, in which case give it a deliberate soft limit, or whether something unintended is limiting (see the accumulator-extension trap in AGENTS.md). The audit cannot tell the two apart; a full-scale 100 Hz sine rendered through the effect and opened as a waveform can. Check accumulator-to-register transfers before the final store too: a wet-minus-dry difference can clip even when the final mix fits. For a linear mixer regression, measure wet audio before mixing; a full-wet render is an oracle only after its own mixer headroom is verified. Count and exclude samples limited by the raw-wet measurement store from that comparison.
- [ ] **DC offset.** An asymmetric curve, a biased filter state or a truncation bias adds DC. It costs headroom downstream and thumps when the effect is bypassed or changes mode. `fx:audit` reports it for every tone; its default limit is -60 dBFS (`--dc-limit`). Use a symmetric curve, or a DC blocker (a one-pole high-pass below about 20 Hz) after the asymmetric stage.
- [ ] **After the input stops.** A fixed-point feedback loop can latch into a one-LSB limit cycle or a DC value, and a loop that is too hot never decays. `fx:audit` sends a burst and then 3 seconds of silence and looks at the last half second: digital silence is ok, activity of a few LSB is noted, and anything above -90 dBFS fails (`--idle-limit`): not settled, because of a runaway, a limit cycle, or a tail longer than the render (`plan --tail` lengthens it for a long reverb or delay). `verify_dirtystate.py` is the neighbour: it starts from garbage state on silence.
- [ ] **Denormals.** Not a concern here: the DSP is fixed point and has none. Its counterparts are the clipping and idle checks above.
- [ ] **Extremes of filters and feedback.** **Verify** every endpoint of every cutoff, resonance and feedback knob, and with the knob parked there, not only passing through: a filter that is stable at 1 kHz can ring forever or overflow near Nyquist or at a very low cutoff once its coefficients are 24-bit. Feedback at its maximum must decay or be limited deliberately. Excite it with an impulse and with noise; the idle row of the audit covers "does it settle".
- [ ] **Dry and wet stay aligned.** **Verify.** A wet path with latency (a look-ahead, a linear-phase filter, a delay) is matched by the same delay on the dry path, or the mix combs at partial settings. State the latency in the README. The mix has no dip or jump in level across its range.

**Run it.**

```sh
npm run fx:audit -- plan out/fx            # nine signals, as .raw and .wav; nothing runs yet
# render each through your effect (below), keeping the file names, then:
npm run fx:audit -- check out/fx out/fx-renders
```

Render with every knob at its dearest setting and any modulation off, so that sidebands do not read as aliasing; render a modulated read separately with its modulation on and read the *residual* column, which holds sidebands and noise. The signals are mono and the effect sees them on both channels. `dsp_host` reads the `.raw` files with `-in` (mono is copied to both channels) and writes interleaved stereo int32 words with `-out`; `verify_knob_clicks.py`'s `render()` builds that command for a module. `rig_render.py` reads the `.wav` files as stems and writes `T1.wav`; `--mixer off --amp 1.0` makes the level in the table the level the effect sees (with the mixer model on, a 0 dBFS stem enters the effect at 0.254 FS):

```sh
cd sdk/octabam      # a built image and your own OS 1.40C: SDK README, "Octatrack native development"
for f in ../../out/fx/*.wav; do n=$(basename "$f" .wav)
  python3 tools/harness/rig_render.py --remix <remix> --tracks T1=<KEY> --set T1:<KNOB>=<value> \
    --mixer off --amp 1.0 --stem T1="$f" --out ../../out/fx-renders/"$n"
  mv ../../out/fx-renders/"$n"/T1.wav ../../out/fx-renders/"$n".wav
done
```

**Verify** the loop on your first run: it uses the harness's documented options, but nothing in CI runs it. `check` reads `.raw` renders as interleaved stereo (`--mono` for one channel) and 44.1 kHz WAV renders, judges the worse channel, and exits 1 on a FAIL. Paste its table into TESTING.md with the knob values you rendered at. The analysis itself is tested without firmware (`scripts/fx-audit.test.mjs` proves that it flags a known aliasing drive and passes the same drive computed at 8x oversampling), so a surprising number is as likely to be the render as the effect: compare the `out dBFS` column with the level you sent first. What it cannot hear: voicing, which is judged by ear (see Traps), and anything the render does not exercise.

## Performance

How much it costs and whether it survives being worked hard: see [Performance](README.md#performance) for the three measurements and the record. For an effect:

- [ ] **Cycles.** `tools/build/cycle_count.py` for the static floor, `dsp_host` at the dearest knob and mode settings with the knobs moving for the measured cost. State `instancesPerCore`, the most you support.
- [ ] **Stock.** Name the stock effect closest in function (a delay against COMPRESSOR is not a comparison; a reverb against PLATE REV is), and benchmark worst-case stock SPRING REV as the cost target for new FX. Aim for the same ballpark under matched conditions, including expensive modes/settings, moving controls and trigger splits on both cores. Read the closest-counterpart ratio from `benchmark_stock_dsp.py`; explain additional cost and remaining headroom in TESTING.md, and revisit substantially heavier designs for optimization and review.
- [ ] **Stress.** `stress_project.py` and `pressure.py render` with `dsp_host -guard -dirty`: your instances on both cores, three LFOs per track, locked slots on every step.
- [ ] `npm run perf:audit -- check <module>/evidence/performance.json` passes, and its table is in TESTING.md.

## Integrate

- [ ] `sdk/catalog.json` has the entry (`id`, `version`, `addedAt`), so the library, the configurator and the module page show it.
- [ ] The manifest's `controls[]` match the native parameters one for one: name, count, default, description. The README table and tutorial match too.
- [ ] `compatibility.location` matches where the native manifest places it (FX1, FX2 or both); `module:verify` compares the chooser with native octabam's.
- [ ] Declare compatibility for card builds and USB loading separately. A card companion for Analog BD or stock FX needs actual native/browser placement evidence; update its reviewed list (`analogBdCompanions`, `FITS_BESIDE_STOCK_FX2` in `src/catalog/selection-conflicts.ts`) only after that proof. Those lists describe baked card placement, not the USB arena. USB eligibility needs the published package and the base's ownership/resource admission; do not apply card donor-space filters to USB sets.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` passes. Refusals for crowded selections are expected; each must match native's.
- [ ] A 320×192 `presentation/thumbnail.svg` that shows what the effect does.
- [ ] `resources.impact` for CPU, DSP core and memory, with a rationale and a source record.
- [ ] Real screenshots show where the effect is chosen (the FX1 or FX2 chooser) and each parameter page.
- [ ] `npm run module:doctor -- <id>` is green.

## Test

Octabam's behaviour tests run through its DSP host and need a native toolchain ([SDK README](../../sdk/README.md#octatrack-native-development)). The pattern to copy is `verify_<module>.py`: render through `dsp_host` against predictable arithmetic or a reference. Drive any knob offline with `send_probe.py --set NAME=VALUE`. For sound quality, only the render needs the toolchain: `npm run fx:audit` analyses it offline (see Sound quality). In TESTING.md say which you ran, and mark everything else "not tested".

**Running a module's own gate here.** The vendored SDK ships no named remixes, so `verify_<module>.py <id>` (for example `verify_tapeecho_cpu.py`) stops at "no remix". Build a disposable one the way `scripts/export-composition-proofs.py` composes a selection: in a private copy of `sdk/octabam` (`modules`, `platform`, `tools`, `dsp`, `licenses`, your own MAIN OS at `out/raw/section_3_MAIN_OS.bin`, `vendor` pointing at `/opt/toolchain/vendor`) inside the `modwerk-source-tools` image, set `registry.remix` to a `Remix` holding the site's own keep-stock menu for your module (`defaultChoosers([id], true)` from `src/engine/choosers.ts`, run with Node 24), call `build_bus.main()`, then run the gate in the same process. Mount `vendor/mc68k` from `npm run upstream:tools`' octabam checkout at `/opt/toolchain/vendor/mc68k`: the image lacks it, and the ColdFire emulator test needs it. Run the unmodified source through the same recipe first; if it reproduces the figures in the module's README, the setup is faithful and before/after numbers compare like for like. After editing only a test or a kernel, `cmake --build out/emu --target ot_<module>_cpu_test` and the test binary alone take about a minute.

## Traps

- No `rep` anywhere in a DSP source (`npm run modules:check` refuses one in a module listed from 23 October 2026; `do #n,>label / <one instruction> / label:` is bit-identical and interruptible): a `rep` cannot be interrupted, so the host-port handlers that arm the ColdFire's DMA answer late. The audio crackles, a core's tracks go silent or ColdFire RAM is written out of place, on hardware only. A `do` loop is bit-identical. Keep dense X work out of the 8K memory blocks a DMA uses as well; both are in [OCTATRACK_HARDWARE_TRAPS.md](../OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code).
- `dsp56kDisassemble` prints a `DO` endpoint as the exclusive next-instruction address (`LA+1`); the encoded loop-address word is the inclusive last loop word. CFG/cycle tooling must use `pc < printed_endpoint`. Do not reprice existing effects by confusing the two representations.
- The DSP assembler silently mis-encodes some instructions: [octabam's AGENTS.md](../../sdk/octabam/AGENTS.md). Disassemble what you assemble.
- A knob rename or count change is a stored-data change. Stamp every project before anyone plays it.
- A formatter overrides the count it sits beside; declare `formatter=` per slot.
- FUNC + turn comes from the donor too. The descriptor word at P+0x12a (`Param.word_12a`) is a knob's edit handler. With FUNC held, `0x400328e4` (the stock reverbs' MIX and BAL, most bipolar knobs) steps through 0, 64 and 127; `0x40032814` (DARK REV's TIME to LP, the MIX of PHASER, FLANGER, CHORUS and COMB FILTER) jumps between 0 and 127 only; 0 does not jump. The builder writes the word for `BIPOLAR` and stepped slots; `PLAIN` and `INHERIT` keep the donor's. For three stops on a plain knob, set `formatter_word=0, widget_word=0, word_12a=0x400328e4`. E-Verb 0.1.0 inherited two stops on four knobs this way (#438). Measured on the ColdFire emulator with OS 1.40C, not on hardware.
- A labelled select wider than five values falls back to a plain dial unless it uses `Formatter.WIDE_STEPPED`.
- Sidechain Compressor keeps its cross-core key window in the last 514 words (+$3DFE..+$3FFF) of the bank-track-3 FX2 slots: Y:$30000 for T7 on core A and Y:$38000 for T3 on core B. An FX2 effect that uses its whole 16K slot writes that window on those tracks, and in card builds that also carry Sidechain, Sidechain writes into the effect's buffer every block (#696). `npm run modules:pairs` compares every allocator effect's `Claims(buffer_words=...)` (the whole slot when undeclared) with ranges other modules declare in that slot, and refuses the pair for card builds until the effect stops short of the window or flags it. Over USB the base refuses the buffer on that block at run time instead (`stock_hook_resources.c`). On a base with the key bus ([OCTATRACK_PACKAGE_DSP_HOOKS.md](../OCTATRACK_PACKAGE_DSP_HOOKS.md)) the window is the bus's, so that refusal holds while Sidechain or any package that requires the key bus is installed, and while the base does not know whether a core's bus is off (an owned job that failed or is uncertain). E-Verb's and Mini Verb's rings end at +$3DFD, so a word added below the window meets them. A ring with modulus 16,384 covers every word of the slot, whatever its segments add up to. The FX2 slot bases are 16K-aligned, so a non-power-of-two modulus wraps cleanly: `$3dfd` stops a ring at +$3DFD. Keep any clearing loop inside the same span, and declare it in `Claims(buffer_words=...)`. E-Verb 0.1.2 does this, and its `verify.py` window gate checks it. Measured in `dsp_host`, not on hardware.
- One render of `verify_knob_clicks.py`'s census reads one alignment. Two things change what it sees: where a knob event falls in the effect's refresh cycle (E-Verb refreshes its knobs in four groups, one per block), and the test tone's phase there. E-Verb 0.1.1 passed at the gate's alignment, yet the same census flagged SIZE and SPD at 4 to 6 of 16 other alignments, up to −59 dBFS. A control build whose SIZE glide slope changed only every fourth block flagged at only 7 of 16 alignments, so whether the gate catches it depends on where it happens to measure. A ratio of two maxima over noise behaves the same way: E-Verb's DPTH-lock step test failed 0.1.1 at another noise seed. Before calling a flag a regression, run the old build over the same grid of alignments and seeds. If the gate needs changing, prove the new rule against a control build that puts the fault back, such as a knob with its smoothing removed, and check that the control still fails.
- Voicing is judged by ear, level-matched, A/B/A/B, wet only. Render locally rather than flashing.
- Raising a feedback effect's wet level to match its input raises its self-oscillation ceiling by the same amount. Tape Echo's wet path sits 6 dB below its input at small signals, and a +5.6 dB makeup (feedback table divided by the same factor, so repeat decay did not change) matched a 1 kHz tone to 0.15 dB but clipped the output on 25% of samples at FDBK 102 and 68% at FDBK 127, full wet, where the shipped level never clips. Measure output clipping and peak with the feedback at its maximum and MIX full wet, for 20 seconds, before and after any level change. The cheaper fix for "it turns the track down" was the dry gain, not the wet gain (Tape Echo 0.1.4, TESTING.md).

## Digitakt and Digitone

An effect there is a mod that subscribes `ev_render_in` and `ev_render_out` and links into the machine's core. Budgets: 128 KiB of shared mod memory and 2,304 bytes of fast SRAM for time-critical code. Claim every resource (settings rows, SysEx ids) in `platform.claims`; two mods may never claim the same one. Because the point is combining mods, test your mod together with at least one other in the browser builder, and state which combinations you built.
