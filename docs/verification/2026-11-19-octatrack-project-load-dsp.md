# Octatrack DSP stall during a project load

19 November 2026, physical MKII. The scratch card held `TARGET` and `FLEX07` in one Set. Both assign stock Spring Reverb to T1 FX2 and stock Spatializer to T5 FX1. `FLEX07` has seven triggered stereo FLEX tracks.

- **0.7.9 Tracks Post development base `c6345a32`.** Loading `FLEX07` from `TARGET` passed once with no modules and four times with Tape Echo, Euclid, LOFI2, Sidechain Compressor, POLY8 and Slow LFO in a USB trial. After a card restore of the same packages, the first `TARGET` to `FLEX07` load stalled twice before PLAY. On the second run the module file had the same bytes across both boots. Replacing the file was unnecessary.
- **DSP trace.** Both runs started at 32/66 acknowledged loader packets and three residency commits. The stall stopped the frames at 85/112 acknowledgements and seven commits. Core 0 had completed Spatializer's bind. The manager was waiting for core 1's Spring Reverb bind, with its last transmitted command still the final write. Both effect slots were dry, and the incoming project's effect map had yet to be published. The trace leaves the precise cause of the missing frame edge open.
- **Development base `1df94302`, same 0.7.9 source plus the observer gate.** The automatic manager continues existing requests and parks unbound slots while a project loads. New automatic plans wait for the complete effect map. With the same six package binaries restored from the card, the first `TARGET` to `FLEX07` load passed on two separate RAM boots, including a restart with the module file untouched. Both effects stayed loaded and no extra residency commit or DSP packet was needed. Playback advanced with sampled CPU readings up to 67.3%. An intentional temporary change of T5 FX1 from Spatializer to Filter followed by a project reload restored Spatializer and advanced the frames without a stall.

The DSP glue, effect-handle map and allocator host checks passed.

## Base 0.7.11

20 November 2026. 0.7.10 shipped without the gate, so it was rebuilt on shipped 0.7.10 as base 0.7.11: default layout `bd1ed4323f053874308bd42f9c96a332f3c3c90aab8636038455e6077e4fe409`, Tracks Post `239d55a42bcba500a5f2f2cb3b2e7eff0332dc7f9ed98b390175c5c6ed52d901`. All seven layouts matched the native and browser builds byte for byte and passed the bootloader recovery checks. No lease entry moved, so the base-bound packages kept their bytes. `sdk/tests/test_project_load_residency.py` builds the observer as the base build generates it and counts its automatic plans across a load that keeps the effects, one that changes them, and one that ends with a transaction open. All three modes fail without the gate.

Unit run, the same MKII and card (Set `MWREPRO`), on Tracks Post development twins built with the beta flags: 0.7.11 candidate `a328967d`, 0.7.10 control `700f8e4f`. Before it, a RAM boot of the flashed 0.7.9 base's own image (`dfa43813`, rebuilt from `25f9888ea`) restored the kept set from the card: ten modules, whole-set identity `100ed1fc…`, whose ten package files were matched byte for byte by that identity. On the candidate, `TARGET` loaded with the frames running, and Tape Echo, Euclid, LOFI2, Sidechain Compressor (bound to the twin), POLY8 and Slow LFO were kept as one set (card result 7, six saved and live). The first RAM boot meant to restore them from the card did not come back on USB: Windows saw no Elektron device. This is the trap recorded as "A RAM boot can come back without USB" in the hardware traps guide, and only a power cycle ends it. No `FLEX07` load ran after a card restore on 0.7.11 and the control did not run, so the exact 0.7.11 build still needs its hardware qualification.

### Test procedure: octatrack base 0.7.11, 2026-11-20

Build: revision `e056c91c6a52`, base package SHA-256 `7e51c8f32f2b430d72d0459d644c04076c3f3f630f213e12137b8cda1b68ba94`. `npm run test:procedure -- --base --no-unit` (the unit was off USB, above), 77 s. The runner stopped after step 1; steps 2 to 4 were then run by hand with the commands it names.

| # | Step | Layer | Result | Command |
|---|---|---|---|---|
| 1 | Software checks | host | failed: `test_runtime_loader.py` only, its published-package rebuild refusing a standalone module's reviewed recipe ("does not name the exact source/image inputs") against this computer's stock image. The test does not build the base, and this computer has failed it before; 707 cases ran, 27 skips | `npm run sdk:check` |
| 2 | Beside every other module | contract | pass (by hand): 42 modules, 861 pairs and the whole set, 0 problems | `npm run modules:compat` |
| 3 | Name the build | host | pass (by hand): the SHA-256 above | hash of `src/engine/assets/octatrack-base.elemod` |
| 4 | DSP cost model | contract | pass (by hand): 10 records current, none under-reported | `node scripts/cycle-scan.mjs check` |
| 5 | Emulator rehearsal | emulator | not run: no emulator session | |
| 6-10 | Unit steps | unit | not run: the unit was off USB from 10:27 until a power cycle | `device.mjs status`, `do inventory`, the whole-set trial, the soak, `device:price` |
| 11 | Agent by hand | unit | partly run, above: the flashed base's kept set read, `TARGET` loaded, the six modules kept on the candidate; the restoring RAM boot lost USB | |
| 12 | Submitter's own stage | unit | not run | |

#### Edge cases for this change

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| First load after six modules were restored from the card (`TARGET` to `FLEX07`) | the case that stalled; the gate holds new plans for the whole load | on the unit, 0.7.11 twin `a328967d`, two restoring RAM boots | not run: the first restoring RAM boot came back without USB |
| A load to a project with the same effects | the gate must leave the resident effects bound and ask the DSP for nothing | host, `test_project_load_residency.py` mode 1; unit, 0.7.9 plus the gate (`1df94302`), 19 November | pass on the host; pass 2 of 2 on 0.7.9 plus the gate; not run on 0.7.11 |
| A load to a project whose effect map differs | one plan must follow, for the completed map, never an intermediate Part | host, mode 2; unit, 0.7.9 plus the gate: T5 FX1 to Filter and a reload | pass on the host; pass on 0.7.9 plus the gate; not run on 0.7.11 |
| A load while a residency transaction is in flight | a second plan must not start, and the open one must still finish | host, mode 3 | pass on the host; not run on a unit |
| A load during playback | stock rewrites the slots while frames and trigs run, and the gate holds plans for the whole load | | not run: the unit was off USB |
| Undo or a trial's rollback during a load | a rollback asks for residency while the observer waits | | not run: the unit was off USB |
| No modules installed | the gate sits in the stock-effect path too and must not change a plain load | | not run: the unit was off USB |
| The 84-87 % CPU range after the load | the record's playback reached 67.3 %; the handoff asks for the range where the guard engages | | not run: the unit was off USB |
| Shipped 0.7.10 control | shows whether 0.7.10 has the stall | on the unit, twin `700f8e4f` | not run: left for last, since a stall needs a power cycle, and the unit went off USB before it |
