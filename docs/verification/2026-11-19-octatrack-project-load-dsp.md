# Octatrack DSP stall during a project load

19 November 2026, physical MKII. The scratch card held `TARGET` and `FLEX07` in one Set. Both assign stock Spring Reverb to T1 FX2 and stock Spatializer to T5 FX1. `FLEX07` has seven triggered stereo FLEX tracks.

- **0.7.9 Tracks Post development base `c6345a32`.** Loading `FLEX07` from `TARGET` passed once with no modules and four times with Tape Echo, Euclid, LOFI2, Sidechain Compressor, POLY8 and Slow LFO in a USB trial. After a card restore of the same packages, the first `TARGET` to `FLEX07` load stalled twice before PLAY. On the second run the module file had the same bytes across both boots. Replacing the file was unnecessary.
- **DSP trace.** Both runs started at 32/66 acknowledged loader packets and three residency commits. The stall stopped the frames at 85/112 acknowledgements and seven commits. Core 0 had completed Spatializer's bind. The manager was waiting for core 1's Spring Reverb bind, with its last transmitted command still the final write. Both effect slots were dry, and the incoming project's effect map had yet to be published. The trace leaves the precise cause of the missing frame edge open.
- **Development base `1df94302`, same 0.7.9 source plus the observer gate.** The automatic manager continues existing requests and parks unbound slots while a project loads. New automatic plans wait for the complete effect map. With the same six package binaries restored from the card, the first `TARGET` to `FLEX07` load passed on two separate RAM boots, including a restart with the module file untouched. Both effects stayed loaded and no extra residency commit or DSP packet was needed. Playback advanced with sampled CPU readings up to 67.3%. An intentional temporary change of T5 FX1 from Spatializer to Filter followed by a project reload restored Spatializer and advanced the frames without a stall.

The DSP glue, effect-handle map and allocator host checks passed.

## Base 0.7.11

20 November 2026. 0.7.10 shipped without the gate, so it was rebuilt on shipped 0.7.10 as base 0.7.11: default layout `bd1ed4323f053874308bd42f9c96a332f3c3c90aab8636038455e6077e4fe409`, Tracks Post `239d55a42bcba500a5f2f2cb3b2e7eff0332dc7f9ed98b390175c5c6ed52d901`. All seven layouts matched the native and browser builds byte for byte and passed the bootloader recovery checks. No lease entry moved, so the base-bound packages kept their bytes. `sdk/tests/test_project_load_residency.py` builds the observer as the base build generates it and counts its automatic plans across a load that keeps the effects, one that changes them, and one that ends with a transaction open. All three modes fail without the gate.

### On the unit

The same MKII and card, Set `MWREPRO`, on Tracks Post development twins built with the beta flags: 0.7.11 candidate `a328967d`, shipped-0.7.10 control `700f8e4f` (main's source). Each twin kept Tape Echo 0.1.6, Euclid 0.1.5, LOFI2 0.1.1, Sidechain Compressor 0.2.2 (bound to that twin), POLY8 0.3.3 and Slow LFO 0.1.0 as one set while in `TARGET`. Each try is a RAM boot that restored them from the card (card result 1, six saved and live), then the first `TARGET` to `FLEX07` load, with `health` read every 200 ms for 14 s from the YES. Between tries the unit RAM-booted the flashed base's own image (`dfa43813`, rebuilt from `25f9888ea`), so no boot went from a twin into itself.

| Build | Try | Loader before → after the load | Frames during the load | Playback CPU (10 reads) |
|---|---|---|---|---|
| 0.7.11 `a328967d` | 1 | 32/66 packets, 3 commits → unchanged | advanced on all 61 reads, no stall | 66.9-70.6 %, mean 69.1 |
| 0.7.11 `a328967d` | 2 | 32/66, 3 → unchanged | advanced on all 61 reads, no stall | 66.5-70.5 %, mean 68.9 |
| 0.7.10 `700f8e4f` | 1 | 32/66, 3 → 85/113, 9 | advanced on all 61 reads, no stall | 66.9-70.5 %, mean 69.2 |
| 0.7.10 `700f8e4f` | 2 | 32/66, 3 → 85/113, 9 | advanced on all 61 reads, no stall | 66.6-70.0 %, mean 69.0 |

Shipped 0.7.10 did not stall in two tries, so on this unit the stall itself did not reproduce. It did make the residency changes the stall trace recorded (85/112 packets and seven commits at the stall), here without stopping the frames. 0.7.11 made none. The stall and crash records stayed at 48 and 12 throughout, and the guard skipped no track.

On 0.7.11 try 1, Tape Echo on T2 FX2 and T3 FX2 raised playback to a mean of 76.5 % and then 81.4 %. A third Tape Echo, and LOFI2 after it, were refused CPU FULL at a judged 86 %. Back-to-back USB reads then held the meter at a median of 84.8 % (max 85.8 %, 310 of 500 reads within 84-87 %), and the frames advanced on every read with no stall or skipped track. The picks were undone and every knob turned back: all four Parts' working and saved copies matched their state before the test byte for byte.

Earlier the same day, the candidate's first restoring RAM boot went from the twin into itself, seconds after its Keep, and never enumerated (the trap "A RAM boot can come back without USB"). The owner power-cycled the unit. The first restoring boot afterwards, from the freshly cycled flashed base, took 72 s to answer on USB; every later one took 18 s.

The flashed base's kept set was read before and after on its own image: ten modules, whole-set identity `100ed1fc…`, card result 1, ten saved and live, both times and after the power cycle. A twin's Keep writes `/MODWERK1.SET`, and the flashed base's set is in `/MODWERK0.SET`. The unit was left on the flashed base's image in `MWREPRO/FLEX07`, bank A pattern 1, Part 1.

### Test procedure: octatrack base 0.7.11, 2026-11-20

Build: base package SHA-256 `7e51c8f32f2b430d72d0459d644c04076c3f3f630f213e12137b8cda1b68ba94`. Steps 1 to 4: `npm run test:procedure -- --base --no-unit`, revision `ef61384d0` with #1862 merged, all four passed. Steps 6 to 10 were run by hand with the commands the runner names, on candidate `a328967d` through the unit queue, because the runner stopped at step 1 before #1862 fixed the Tape Echo and Euclid recipe pins.

| # | Step | Layer | Result | Command |
|---|---|---|---|---|
| 1 | Software checks | host | pass: 714 cases, 27 skips (before #1862 it failed on the stale Tape Echo and Euclid recipe pins, unrelated to this change) | `npm run sdk:check` |
| 2 | Beside every other module | contract | pass: 42 modules, 861 pairs and the whole set, 0 problems | `npm run modules:compat` |
| 3 | Name the build | host | pass: the SHA-256 above | hash of `src/engine/assets/octatrack-base.elemod` |
| 4 | DSP cost model | contract | pass: 10 records current, none under-reported | `node scripts/cycle-scan.mjs check` |
| 5 | Emulator rehearsal | emulator | not run: no emulator session | |
| 6 | Read the unit | unit | pass (by hand): active `a328967d`, the six restored modules | `node scripts/device.mjs status`, `do inventory` |
| 7 | Large set and Undo | unit | fail as the runner names it: its 36 packages (439,244 bytes) do not fit the module pool, and the base refused the set whole (loader refusal 2, RUNTIME_MEMORY), changing nothing. By hand, the runner's first 24 packages (308,444 bytes) ran a 30 s whole-set trial: no crash, stall, freeze or skipped track, rolled back to the six | `node scripts/device.mjs set A,B,… --seconds 30` |
| 8 | Soak | unit | pass (by hand): 2,400 operations at 19.7 a second, 295 pattern changes (145 a minute), health read median 17 ms, CPU at most 79.5 %, no new crash or stall. The MIDI bridge left from before the power cycle refused every message; a new one on port 50125 carried the run | `node scripts/octatrack-soak.mjs --seconds 120 --pc-channel 11 --midi 127.0.0.1:50125` |
| 9 | Cost on the unit | unit | pass (by hand): 36 packages priced at rest beside the six. Largest at rest: FM Synth +1.3 frame and +1.6 CPU points, Repitch +1.3 and +1.0; in use Tape Echo +8.5 and +9. SC Ringmod's in-use pick failed ("No SC Ringmod in the FX2 chooser") | `npm run device:price -- --share SOCK --out price.json` |
| 10 | Put back | unit | pass (by hand): the six, as at step 6 | `do inventory` |
| 11 | Agent by hand | unit | pass: the four tries above, the 84-87 % range, the Parts restored byte for byte | |
| 12 | Submitter's own stage | unit | not run: no one at the unit | |

The soak and the step-7 trial moved pattern, levels, scenes, mutes and FX knobs. They were put back over MIDI CCs and panel keys and checked against the Parts' bytes.

#### Edge cases for this change

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| First load after six modules were restored from the card (`TARGET` to `FLEX07`) | the case that stalled; the gate holds new plans for the whole load | 0.7.11 twin `a328967d`, two restoring RAM boots, `health` every 200 ms | pass 2 of 2: frames ran, no extra loader packet or commit |
| The same load on shipped 0.7.10 | shows what the gate removes | 0.7.10 twin `700f8e4f`, two restoring RAM boots | pass 2 of 2 (no stall), with the loader's acknowledged packets going 32/66 → 85/113 and 6 more commits each time |
| A load to a project with the same effects | the gate must leave the resident effects bound and ask the DSP for nothing | host, `test_project_load_residency.py` mode 1; the tries above | pass |
| A load to a project whose effect map differs | one plan must follow, for the completed map, never an intermediate Part | host, mode 2; unit, 0.7.9 plus the gate: T5 FX1 to Filter and a reload (19 November) | pass on the host and on 0.7.9 plus the gate; not run on 0.7.11 |
| A load while a residency transaction is in flight | a second plan must not start, and the open one must still finish | host, mode 3 | pass on the host; not run on a unit |
| A load during playback | stock rewrites the slots while frames and trigs run | 0.7.11, `FLEX07` playing, PROJECT > CHANGE | not reachable: stock asks "PLAYBACK WILL BE STOPPED. CONTINUE?" and stops first; the load after it passed |
| A reload of the same project with modules installed | the observer sees the same map before and after | 0.7.11, `FLEX07` to `FLEX07` | pass: frames ran, no stall, Parts unchanged |
| The 84-87 % CPU range after the load | the handoff asks for the range where the guard engages | 0.7.11 try 1: two Tape Echos, then USB read pressure | pass: median 84.8 %, frames advanced, picks above 86 % refused |
| Undo or a trial's rollback during a load | a rollback asks for residency while the observer waits | | not run: a trial's end cannot be timed into the 2 s load by hand |
| No modules installed | the gate sits in the stock-effect path too and must not change a plain load | | not run on 0.7.11 |
