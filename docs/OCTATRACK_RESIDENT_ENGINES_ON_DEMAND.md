# Resident controller engines on demand (design, work in progress)

Status, 15 October 2026: the DSP side and the ColdFire side are written and
wired into `build_core.py --resident-stock-hooks --resident-on-demand`, and
host-tested. The ColdFire side places, runs and removes all three engines on
the unit (below). Clearing the region of live FX code (evacuation) is written
and host-tested, not yet run on a unit.

Update, 22 October 2026 (evening): an engine now loads when a track uses its feature, not when its module is installed
(owner: "the mods shouldn't go into the memory when we install"; "Use, not install" below). Until then "on demand" here
meant "while the module is installed": effect code had loaded on use since 20 October, the engines had not, and an
install could be refused for room an engine only needs once a track uses it.

Update, 22 October 2026: Analog BD's engine and tables are no longer base data. Its controller package carries them
(ABI 10), the base keeps its stub, base word and X region, and its trust row pins only the package's ColdFire part
(docs/OCTATRACK_PACKAGE_DSP_HOOKS.md, "Phase 1 as built"). Every resident build is now on demand: the permanent-engine
build (`--resident-stock-hooks` alone) is retired. Below, Analog BD's figures are its engine's, which are unchanged.

## Goal

`--resident-stock-hooks` links the Sidechain Compressor, Output Matrix and
Analog BD engines into the top of each core's program memory for good. The
owner's decision is to load an engine's DSP code only while a track uses its feature (22 October 2026; from 15 October
until then, while its module was installed). The hard rules are:

- No placement or code move at a Part switch, pattern or bank change, Part reload or project load, or while playing.
- No extra flash or card writes.
- Negligible runtime overhead.

## Measured sizes

Words, assembled in the reviewed toolchain image with `assemble_resident`/`engine_unit`:

| Core | Permanent block today | With every engine on demand | Engines (words, relocations) | Receiver growth |
| --- | --- | --- | --- | --- |
| A (core 0) | 2228 | 37 (stubs + 3 base words) | SC 423 (9), Matrix 773 (26, 4 negative), AB 998 (6, 1 negative) | +147 |
| B (core 1) | 1441 | 22 | SC 423 (9), AB 998 (6, 1 negative) | +114 |

Net freed with no controller active: about 2044 words on core 0 and 1305 on
core 1. With only Matrix on demand on core 0, the block is 1456 words and the
receiver grows by 81. Sidechain grew by 35 words on 15 October 2026 (the key
phase change below); the measurements on the unit below were made before it,
with 388. Arena numbers from a full base build are still to be
measured.

## Design

1. **Stubs and their off paths stay resident**, unchanged, together with the stock-site JSRs and the COMPRESSOR bridge.
   - Each on-demand feature adds one P word to the block (`hwbase1/2/4`). It holds the absolute address of the placed engine, and is 0 while the engine is not placed (the boot upload's zero).
   - Only the receiver writes this word.
2. **Each engine is a relocatable unit** (`resident_dsp.engine_unit`): its P table, then its code. It is assembled at two high origins, so only long forms are used.
   - A word that moves with the origin is an address relocation. A word that moves against it is a displacement to a fixed stock address (`index | 0x8000`, transfer.c's convention).
   - At four arena bases, a fresh assembly must equal the relocated words, or the build stops.
3. **Receiver (generated, op 10)**. The packet's word 7 picks the operation, and an on-demand base keeps the default bytes.
   - **CAS (word 7 = 0).** CAS is unchanged, except that it refuses to enable an on-demand feature whose base word is 0. That check runs before any state or branch word changes. The "on" displacement is computed from the base word: `base + entry offset − stub`.
   - **PLACE (word 7 = 1).** Word 4 is one feature bit and word 5 a table offset; offset 0 unplaces.
     - PLACE is accepted only while the feature is dormant on this core. The engine must fit whole between offset 64 and the permanent block.
     - Placing again needs an unplace first.
   - **Neither the host nor a module names a DSP address.**
4. **ColdFire side** (`resident-runtime/resident_engines.c`, its build seams in `resident_engines.py`). Written and host-tested.
   - **Region.** Engines take the top of the core's arena, directly under the permanent block. The manager keeps a per-core reserve; the FX allocator's `capacity` is the arena less that reserve, so it stops at the lowest engine. Compaction (`dl_arena`), `dl_move`, the journal's holes and the big-blocks-from-the-top rule all read that capacity.
   - **Holes.** Each engine takes the highest span that meets no other engine (top-down first fit). A removed engine above another one leaves a hole, which the next engine reuses without a new claim.
   - **When a claim can happen.** Only while the manager is idle: no transaction, no queued pick, no open journal, no allocator or buffer transaction. Everything on the DSP loads on demand (owner, 20 October 2026), so only what the tracks run must fit under the engine; of the bank's Parts as much stays beside it as fits. The claim tries three sets on its core, each with what runs now: all four Parts' effects (modules and stock), then those of the Parts the bank's patterns play (and the current and queued Part), then none. For each it plans where live FX code of that set in the new region would move (below) and dry-runs the set under the lowered capacity (`dl_allocator_prepare` with every slot empty and the set as `keep`, then `dl_allocator_cancel`), with the region's code at its planned new place and the other core holding what it runs. The first set that fits wins. Cached code outside it (loaded for the bank, run by no slot) is retired first, in a trim of its own (`make_room`'s transaction with no request behind it: nothing a track runs changes, the retired ids go to the stub; `dl_engine_why` 9), and the claim is asked again on the next tick. A Part switch to that code loads it then. Until 20 October 2026 the claim needed every module the four Parts name (and their stock effects, if they fitted before) beside the engine, so no Part switch ever loaded code because of an engine; Analog BD was refused on a bank with E-Verb, BBD and Air Chorus on tracks 5-8 although no track ran them.
   - **Admission.** An engine takes no room at install. For an incoming trusted controller (`modwerk_controller_admit`) the claim's dry run still runs, but only an engine stuck for this boot refuses it (`RUNTIME_CONFLICT`; for a reader's key bus `RUNTIME_FEATURE`). With no room, the module installs and its engine waits (`MW_WAIT_ROOM`, or the claim refused) until a track uses it and room appears. Until 22 October 2026 admission answered `RUNTIME_MEMORY` when there was no room even for what ran or live FX code in the region could not move. A key-bus reader's tap price is likewise checked at admission only: a set's rows switch one at a time, an earlier row can start an effect the project already names and take that room, and a refusal at the switch repeats at every retry (beta finding 64). At its switch the reader goes in and the bus waits for its price.
   - **Clearing the region (evacuation).** Live FX code reaching into the region moves below it before the claim takes it, in one manager transaction of its own (phase 10), the way `dl_move` moves code:
     1. *Plan* (`engine_plan`, on every claim): each package reaching into the region, largest first, gets a new place below it, clear of every live copy (its own old copy included: it runs until its entry is rebound) and of the new places planned before it. Code of a quarter of the lowered arena or more goes top-down from the region, the rest first fit from the bottom, as the allocator places them, so compaction finds nothing to undo. No place: refused (`dl_engine_why` 2).
     2. *Dry run*: the chosen set, with that code at its new place, under the lowered capacity (above). Not even what runs fits: refused (3), nothing moved.
     3. *When*: only from the engine's own claim on the board's tick, while the transport is stopped and no pattern change is queued (the placement's own guard), at least 2 s after the last key or knob (`modwerk_status_key_at`), no pick waiting, no self-test or rebind (`modwerk_dsp_moves_idle`, as compaction waits), and the manager idle (no transaction, queued pick, open journal, allocator or buffer transaction). Until then the claim answers "not yet" (7) and the engine waits (`MW_WAIT_EVACUATION`). Never at a Part switch, pattern or bank change, Part reload or project load: those start nothing here, and they press keys.
     4. *Move*: one transaction for every package of that core. The new copies are uploaded first (legacy WRITE, every chunk read back by the receiver) while the old ones run, then each id's dispatch entry is rebound to its new copy (one BIND each, applied between two frames; the slot's state stays in X and Y and init does not rerun, as compaction relies on). Then, in one step, the allocator commits and retires (the old copies become free) and the capacity drops below the region, so neither compaction nor a pick can place code there in between. The engine's claim then takes the reserve the evacuation already lowered and proceeds as before. A Part switch meanwhile waits for it (queued, as behind a compaction move) and then loads nothing.
     5. *Rollback*: a refused or timed-out step (upload or BIND) rebinds every entry the evacuation sent a BIND for back to its old copy (the old copies are still held), each sent again until acknowledged, then frees the new copies (`dl_allocator_cancel`). That core then evacuates nothing more this boot (`dl_engine_why` 8; admission answers `RUNTIME_MEMORY` while live code sits in a region there). A transport that stays busy for 600 attempts counts as a failed step.
     6. *Cost*: nothing on the frame path; one compare in `advance()`; the plan on each claim attempt, the dry runs only when the move may start or for admission. No flash or card writes.
   - **Upload.**
     1. The words are relocated on the UI task into a per-core buffer (`mw_engine_relocate`, linear in words plus relocations), so the frame interrupt scans no relocations: the owned WRITE carries no relocation list.
     2. They are uploaded with an owned `DL_WRITE` at the engine's table offset. The receiver reads every chunk back through P and refuses a chunk whose sum differs.
     3. An owned PLACE follows (op 10, word 7 = 1, word 4 the feature, word 5 the table offset).
     4. Only once PLACE is acknowledged on every required core does the board send its first RESET chunk, then ENABLE. The receiver also refuses to enable a feature whose base word is 0.
   - **When it runs.** From the board's tick only (`controller_board.c`), when a controller generation of the feature is bound, its feature is used ("Use, not install" below) and it is not yet reset. Never at a Part switch, pattern or bank change, Part reload or project load. A placement or an unplacement starts only while the sequencer is stopped and no pattern change is queued (`modwerk_machine_stopped` and the queued bank/pattern bytes, as compaction reads them); otherwise it waits. Nothing new runs in the frame interrupt.
   - **Lifetime.**
     - An engine belongs to its feature, not to one generation. A new generation of the same feature (a replacement, a restore) finds it placed and adopts it without reloading. The code is base data, the same for every generation.
     - An engine is unplaced (PLACE offset 0) and its span freed only when no slot of that feature wants it (none is held, or its holder is parked, below), the board knows the feature is disabled on that core, and the sequencer is quiet. Quarantine holds it for good.
   - **Rollback.**
     - A failed WRITE (no PLACE sent) frees the span. The owned transport has closed that core for the boot, so nothing more is placed there; an engine already placed on the other core stays until no holder is left, then it is unplaced.
     - An uncertain PLACE or UNPLACE keeps the span for the rest of the boot, and admission refuses that feature (`RUNTIME_CONFLICT`).
     - The owned channel's existing fail-closed rule stands.
     - An evacuation's failure: every touched entry back on its old copy before anything is freed, that core closed to evacuation (above).
     - An engine let go while its evacuation runs: the evacuation finishes (moving back would be another move), and the reserve it lowered goes back to the FX code once no held engine on that core is still waiting for it (`mw_engines_collect`).

## Use, not install (22 October 2026)

What uses each engine's feature (`controller_board.c` `use_tick`, once a board tick):

| Feature | Used while | Read from |
| --- | --- | --- |
| Analog BD (any packaged feature) | its controller asked for the write lease since the current bank was entered | `controller_write_lease.c` marks every request it resolves to a trusted controller, granted or refused; Analog BD's renderer asks every frame for each track carrying its machine, which only the current Part shows, so the bank keeps the mark until it changes |
| Sidechain | a track runs stock COMPRESSOR (FX id 24), or one of the bank's four Parts, working or saved, names it | `modwerk_dsp_bank_names` (dsp.c) |
| Key bus | Sidechain is used, or a reader's effect is named the same way | the reader's handle (`modwerk_dsp_catalogue_handle`) |
| Output Matrix | always, while installed | with CUE CFG on MATRIX its routing codes are cue levels to stock, so its engine must already run when MATRIX is chosen; moving it to use needs Matrix to handle MATRIX without its engine first |

- **Never placed.** A slot whose feature is not used stays BOUND: nothing written, placed or reset, no room taken.
- **Placed when used**, as at install before: written, PLACEd, reset, enabled, its page applied, under the same guards (stopped, no pattern change queued; a move only when settled).
- **Parked when no longer used.** Once the unit is stopped and settled (two seconds after the last key or knob, no pick waiting: `mw_engines_settled`) the board reverts its page and disables the feature, the removal's own path, and leaves the slot RETIRING. The engines then collect its words. A page that is not what was written keeps it running instead of quarantining it. Sidechain stays wanted until its DISABLE is complete, so it always goes off before the key bus, as it does at removal. Its regions stay held for buffers while it is installed, so coming back never waits for a buffer.
- **All its cores or none.** Before an unplaced engine takes any core's words, the board runs admission's dry run (`mw_engines_admit`) for every core it needs, beside the other wanted engines. With no room on one of them it waits whole and wants no core meanwhile, so the engines give back a partial claim. Room found again waits one tick, so the key bus Sidechain implies is placed first, above it. Until this rule (22 October 2026), Analog BD, used in a bank whose core 1 had no room, was placed on core 0 alone and held 998 words there it could never run (seen on the owner's MKII while chasing beta finding 63, whose cause turned out to be another one, below).
- **The self-test charges no new machine voice** (dsp.c, beta finding 63). Its emptied-core attempts would let a machine's voice in (Analog BD's track on T1 took 726 cycles of core 1), after which the Part's own effects on that core no longer fit back and every later set was refused for DSP time. While it runs, a voice not charged when it started waits for its end (the track renders stock meanwhile); one charged before keeps its claim. On the owner's MKII (`a898fd46`, dev twin of `d6bfff70`) bank A's self-test then passed 7/7 with all 19 modules.
- **Back when used again.** `mw_controller_restore`, then placed, reset from offset 0 and enabled as at install (Analog BD's package unit is offered again on the way).
- **Removal.** A parked module goes at once (RETIRING, its UI clear); one never used is cancelled while BOUND.
- **What this costs.** A track that first uses a feature while the unit plays stays dry (Sidechain: the stock compressor, no KEY page) until the transport stops and the engine is placed, about two seconds later. Within a bank a Part switch never waits: Sidechain and readers read all four Parts, and Analog BD keeps its mark for the bank. A bank change while playing to a bank that first uses Analog BD waits for the stop.
- **Why.** On the owner's MKII (22 October 2026, development twin of `a408c505`), a tester's 19-module set (#791) installed 17 modules and was refused Analog BD and Sidechain with refusal 2 ("not enough module memory"): the loaded bank played Mini Verb, E-Verb, Tape Echo and BBD, whose code filled core 1, and admission dry-ran the engines' claims against it. With every track on a stock effect the same 19 installed and the self-test passed (19/19 intact, 7 DSP effects together, CPU peak 57 %).
- **Checked in software.** `test_resident_engines_board.py` modes 2, 3, 15 and 21 (admitted without room, the engine waiting) and 54-58 (never placed without use; placed on Analog BD's lease; parked in a new bank only when quiet and settled, feature off before unplace; back again; removal of a parked and of a never-used module; Sidechain on and off with stock COMPRESSOR, off before the key bus; a reader's key bus on and off with its effect). `test_dsp.c` covers `modwerk_dsp_bank_names`.
- **On the unit** (owner's MKII, 22 October 2026, `df19fdca`, the development twin of `a849d17e`; beta finding 62): the same 19 modules installed in the state that refused two of them before, with Analog BD and Sidechain left BOUND and nothing placed, and Output Matrix placed at install. COMPRESSOR picked on a track brought Sidechain and the key bus in within seconds; FILTER back put both away (unplaced on both cores), twice. A bank without an Analog BD track put Analog BD away; a bank with one brought it back. Not yet: the release image, a power cycle, an Analog BD track first set while playing, audio around a placement.

## Measured on the unit (15 October 2026)

- **Arena.** A private development build with `--resident-on-demand` (base `25ab5804…`, nothing placed) leaves 4,418 words on core 0 and 4,546 on core 1. The beta base `362fb24d…` leaves 2,396 and 3,269.
- **Why it matters.**
  - On #619's development twin, SPRING REV was refused "DSP MEMORY FULL" on T5–T8 of bank A Part 2: core 0 held FILTER plus the PLATE and DARK REV that Part 1 names (2,102 words), so Spring's 1,063 did not fit beside them.
  - On the on-demand build all eight picks loaded beside them, 3,165 words on core 0. Playing: T1-4 62 %, T5-8 67 %, ColdFire 50 %, no loader error.
  - Stock keeps 6,158 words of effect code per core, so a Part with all three reverbs on T5–T8 cannot load on the beta base at all.
- **Runnable since the ColdFire side (below), not yet on a unit.** That build could not run Sidechain, Output Matrix or Analog BD: nothing placed their engines.

## Switch artifacts (first take, 15 October 2026, on the build above)

**Method.** Bank A Part 2's only sounding track (T3) repeats every 4 s bit for bit. Around each switch, the take is compared with the same spot a loop earlier and a loop later.

**Results.**
- **Stock hard switch (DELAY ↔ NONE):** stays within 38,819 steps (24-bit) of one or the other.
- **Switches between byte-identical Parts (2 → 3 → 4 → 2), and FILTER → LO-FI:** about 0.5 s where T3 matches neither loop, up to about 9 % of full scale.
  - It starts about 50 ms after the switch and ends at the same point in the loop each time.
  - No dropout, no extra click, no loader error.

**Resolved (15 October 2026, second session).** The resident base does the same: see the next section. The on-demand build does not cause it; whether stock does it is still unproven (stock has no USB audio to record it with).

## Artifact checks on the unit (15 October 2026)

Method: as above, all 20 USB audio channels as float32, every comparison against the loop before or a take of the same command sequence from a fresh boot (two plays with different histories differ; the recorder's floor is about 5e-7). Twins built from one tree: A resident (`--resident-stock-hooks --dev`), B and C on demand (C with the ColdFire side).

- **Idle, nothing placed (B against A).** Same command sequence from a fresh boot: T3 and MAIN equal within 5e-7. Load equal: ColdFire 49.7 %, core 1 34.6 %, core 0 41.9 %, the same idle passes.
- **Part switches between identical Parts.** Same on A and B: T3 differs from the loop before until its next trig (about 140-900 ms, set by where in the step the switch lands), never above the loop's own peak, no click. With a DELAY on T3 it is an echo of the last 500 ms (the delay becoming audible); without, a small added sound. It looks like the Part's values replacing the current trig's locks until the next trig. Not caused by on demand.
- **DSP code uploads while playing.** Ten picks on silent tracks on both cores while T3 plays (the path an engine placement takes): T3 and MAIN bit-exact on A and on B.
- **Placement (C).** Sidechain Compressor: arena 4,418/4,546 to 4,030/4,158 words, back to 4,418/4,546 on removal, placed again on reinstall; no rejection, error or stall.
- **Placed equals resident.** T5 FX1 COMPRESSOR with KEY T3 and MON ON (T3's key across cores, through both cores' engines): T5 on C equals T5 on A in every sample, once aligned.
- **Key latency per enable (both builds).** T5 lags T3 by 89 samples after one enable, 121 after another, on A as on C: each core seeds its key counter at its own first frame after its own CAS, and the board enables core 0 a tick or more before core 1. So the key was 1 to 4 blocks late, set by the enable offset, and at 4 the reader read the slot being written (about 1 enable in 4).
  - **Fix (15 October 2026, resident engine only, not yet run on the unit).** `resident_dsp.REVIEWED` changes the pinned source for both the resident and the on-demand builds: a core not yet seeded follows the other core's counter at its local track 0 and adopts it for good at its local track 2, half a frame from the other core's advance. Both counters then agree, as when native octabam boots both cores together, and `scdet` keeps reading its own counter, two blocks behind. In the interpreter (both cores, enable offsets −5 to 5, core skews up to 1.5 track slots and one that moves every frame) the key is 2 blocks late every time and never the slot being written. A skew of more than two track slots would make it 1 or 3 blocks, still the same on every enable.
  - **Not chosen: reading the writer's counter at each read.** A reader on its core's first track (T5) races the writer's advance at the writer's first track every frame, so the key jumps between 2 and 3 blocks as the cores' loads shift (XBUS's "rotation read" defect; the test shows it).
  - **MON.** `moncommit` now consumes MON_ON. Before, a COMPRESSOR taken off a track with MON on left that track replaying the last 16-sample key stash until the next RESET (seen in the interpreter, not on the unit).
- **Output Matrix (C, rebuilt twin `43fe3fc4…`).** Placed on core 0 only (state 5 at 3,645, arena 4,418 to 3,645, slot ACTIVE). OUT CFG MATRIX with T3 routed MNL: MAIN L = 0.711853 x (T3 L + T3 R) / 2, MAIN R exact zero, CUE empty, on C as on the resident twin; MAIN L on C equals the resident twin's within 2.4e-7 over a whole loop. No engine job while playing.
- **Analog BD (C).** With the trusted package (`packages/` of the twin build; the recipe capture's own output is not trusted and stays inert), placed on both cores (2,647 and 3,548, minus 998 each), all 3,776 reset words acknowledged per core, slot ACTIVE with both enables. T3 as ANALOG BD plays a clean bass drum: body 51-53 Hz, 95 % of the energy below 150 Hz, no clipping, no DC, no click spikes; no loader error or stall, no engine job while playing. No resident reference: on the resident twin it rendered silence, as in beta finding 24.
- **Fixture.** Loading the project from the card (to recover a bank rejected after T3 was left as ANALOG BD, issue #363's case) replaced the unsaved test fixture; MODWERK-TEST2 is now saved with four trigs on T3 (bank A, 4.000 s loop, bit-exact).
- **All three together (C).** Sidechain, Output Matrix and Analog BD placed (arena 2,259/3,160, as predicted; three slots ACTIVE). While playing: eight switches between identical Parts (3, 4, 1), a pattern change A01 to A02 and back, and a Part reload. T3 and MAIN stayed bit-exact through every Part switch (no deviation at all in this project, which has no locks), the pattern change only changed the content, no click anywhere; no loader packet was sent (accepted counts unchanged) and no engine job started (`jobs` unchanged). Removing all three unplaced all five engine copies, the arena returned to 4,418/4,546 and every slot ended RELEASED with its disables acknowledged.
- **Analog BD on a restored Part (both builds, open, finding 24).** A Part that already names ANALOG BD when the module arrives (a boot, a power cycle) stays silent, even after choosing ANALOG BD again; switching T3 to STATIC and back to ANALOG BD plays the drum. The fault is in how a restored Analog BD track is bound, not in the engine.
- **Silence after a Sidechain enable (both builds, open).** 4 of about 13 enables in a series of RAM boots between different twins without a power cycle silenced every track (exact zeros where the base captures the DSP output, USB stream running, DSPs running, loader clean), until the next boot. Each had a COMPRESSOR with KEY set in the Part. After a power cycle, 0 of 21 enables. T5's monitored copy of T3 was zero too, so T3 is silent before its FX1: the Sidechain DSP code has no path to it (code review), which points at the ColdFire side (renderer, stream) or state left by earlier RAM boots. `snap.sh` snapshots of the renderer slots, running effects and Part are ready for the next occurrence.
- **Test tooling trap.** A development session left running (`device.mjs serve` restart loop) during `device.mjs boot` knocked the unit off USB until a power cycle, twice: stop and verify it before every boot.

## How the ColdFire side plugs in

- **Board.** `controller-policy/controller_board.c`, under `#ifdef MODWERK_RESIDENT_ON_DEMAND` (a default base preprocesses to the same code):
  - Before a bound generation's first RESET, `mw_engines_place` drives the placement on every required core; the slot waits (BOUND) until PLACE is acknowledged everywhere.
  - Each tick drains the engines' own owned jobs first (`mw_engines_poll`) and ends with `mw_engines_collect`, which unplaces and frees what no held slot names.
  - `modwerk_controller_admit` dry-runs the claim for an incoming trusted controller (`mw_engines_admit`).
  - `resident-runtime/stock_hook_driver.c` is not the seam: its enable path is closed in this preparation (`modwerk_stock_hook_begin` refuses every enable), and the board drives the controllers.
- **Transport.** The engines use the generated owned transport (`resident_driver.py`): `dl_owned_upload_reserve` for the WRITE (no relocation list), `dl_owned_command_reserve(core, generation, 10, feature, table offset, 1)` for PLACE and the same with offset 0 to unplace. `resident_engines.transport` lets the validator accept word 7 = 1 only with one feature bit the core carries and an offset of 0 or inside the arena; word 7 = 0 stays the CAS it was, and any other word 7 is refused.
- **Manager.** `resident_engines.manager` adds the reserve, `dl_engine_claim` (the plan and dry run, above), the evacuation (`engine_plan`, `engine_evacuate`, phase 10, handed over by one line in `advance()`), `dl_engine_release` and `modwerk_dsp_arena_now`, and the first probe sets the capacity to the arena less the reserve. `dl_engine_claim`'s `commit`: 0 dry run, 1 take it but let live code in the region wait, 2 take it and move that code first.
- **dsp.c.** `resident_engines.dsp` adds `modwerk_dsp_moves_idle` (no self-test, rebind or waiting pick) for the evacuation's wait.
- **Status.** The STATUS page, the box after a pick (`modwerk_dsp_budget`) and the host's ARENA word read `modwerk_dsp_arena_now`, the arena less the engines. Admission's own size check and the descriptor check keep the build's arena.
- **Data.** `resident-engines-data.c` (generated by `resident_engines.data_c`) holds each core's engine units, three bytes a word, their relocations, and a buffer per core sized to its largest engine. `data_c` refuses a unit whose words do not match its SHA-256 or whose relocations are out of order.
- **Diagnostics.** On a development base (`--dev`), `mw_engines_view` ("MWEV", 192 bytes since the key bus (180 before), in initialized data, so inside the dev MEM window; layout in `resident_engines.h`) is refreshed every board tick: per core and feature (Sidechain, Output Matrix, Analog BD, the key bus) the engine's state (0 free, 1 claimed, 2 writing, 3 written, 4 placing, 5 placed, 6 unplacing, 7 stuck), its arena offset and why it waits (1 own job in flight, 2 the board's job, 3 playing or a pattern queued, 4 no room, 5 manager busy, 6 claim refused, 7 transport busy, 8 stuck, 9 an evacuation runs or waits); the arena and reserve per core; the last admission verdict per feature (1 fits, 2 memory, 3 stuck); the last claim's reason per core (`dl_engine_why`: 1 manager busy, 2 live FX code in the region with no place below it, 3 not even what runs fits (or a trim made no room), 4 inconclusive, 5 too large, 6 an evacuation started or runs, 7 an evacuation or trim waits for 2 s without a key or a waiting pick, 8 an evacuation failed on this core, 9 a trim retires cached code first); byte 51 the evacuation (step 1 upload, 2 bind, 3 rebinding the old copies, | core << 2, | cores closed to it << 4) and byte 52 evacuations done (low nibble) and failed (high), mod 16 (bytes 42 and 43 on a base before the key bus); byte 53 the key bus (1 wanted, | core 0's lane op << 1, | core 1's << 4: 1 reset, 2 enable, 3 disable, 4 stuck, 5 scrub; | 128: the bus cannot come up this boot, the board closed or a core's state lost, so readers are refused with `RUNTIME_FEATURE` and a live one fails the self-test) and bytes 54-55 its reset words / 8 per core; the counters; and each controller slot's module, generation, state, ACKs and reset words. Its MEM window also reaches the base's statics up to 0x46000000. A default or beta base has none of it.
- **Install the rows' packages.** A trusted controller is the exact package its trust row names. On the first twin, Analog BD was installed from the recipe-capture run (built without the recipe applied): the base took it as an ordinary package, never bound it, and nothing placed (board test mode 11). The twin build now copies the three trusted packages beside the base (`packages/`) and deletes the capture run's output.
- **Measuring on the unit.**
  - Build: `build_core.py --dsp-loader --usb-midi --usb-audio 'USB AUDIO OUT TRACKS MAIN CUE' --site-events --table-owners sdk/machines/octatrack/module-adapters/table-owners.json --resident-stock-hooks --resident-on-demand --dev`, with the beta base's stock image and upstream. Then recapture Analog BD's recipe against that build's symbols into a scratch copy of the tree (below), build the controller rows (`base_bound.py rows`) and the base again with `--controller-policies` and `--controller-layout`.
  - RAM-boot it with `npm run device -- boot DIR`.
  - `octatrack-measure.py` and `octatrack-clicks.py` work on it unchanged.

## Checked in software (15 October 2026)

- **Host, ColdFire side** (`sdk/tests/test_resident_engines_board.py`, ASan/UBSan): the actual board, loader, generated manager and generated owned transport against a modelled receiver and made-up engine units. Place, switch on, run, switch off, unplace and free; the order WRITE, PLACE, RESET, ENABLE on each core and disable before unplace; the playing guard (no job while playing, none for an unplace either); a full core refused at admission; live FX code in the region refused until it is gone, and a later pick loading below the engines; the bank's Part union refused when it would no longer fit; a WRITE refused part way (that core's span freed, the other core placed, nothing enabled, then unplaced at removal); an uncertain PLACE (span kept, the feature refused afterwards); twelve Part switches starting no engine job, changing no reserve or capacity and loading no code; a successor adopting the placed engine with no new job; hole reuse; Output Matrix on core A only. The C relocator against `resident_dsp.relocate` at eight bases, edge words included.
- **Host, evacuation** (the same test, modes 12-21; its receiver model keeps a dispatch table and checks after every frame that each slot runs its id's whole, correct code from where the manager holds it, never a stub, freed or half-written words):
  - a 900-word effect at the top of core A's arena: admitted, moved below the region (to 136, clear of its old copy), new copy whole before its one BIND, the engine's first word after it, then placed and ACTIVE; the old copy's freed words overwritten afterwards with no effect on the slot; removal gives the capacity back and the effect stays;
  - while playing, within 2 s of a key, with a pick waiting, and playing again: nothing moves (core B, which needs no move, places at once); stopped and settled: moved, placed;
  - the bank's Part union not fitting even after the move (a Part naming a 700-word module; and a 600-word one that would fit under the engine from scratch but not beside the moved effect): refused at admission and on the tick, nothing moved; without it, moved and placed;
  - code with no place below the region (1,000 words at the top, 400 at the bottom): refused, nothing moved;
  - the new copy's upload refused part way: no BIND sent, old copy running, claim refused, that core closed to evacuation (Output Matrix then refused too); once the effect is gone the claim proceeds without a move;
  - two packages in the region moved in one transaction (both uploads before either BIND); a Part switch during it waits and loads nothing; twelve Part switches afterwards start no job and no move;
  - the second BIND refused, or applied but never answered (the transport times out): both entries back on their old copies (one of those BINDs refused once and sent again), new copies freed, claim refused, nothing of the engine on core A;
  - both cores, one evacuation each; Sidechain let go mid-move: the move finishes, the reserve comes back.
  - Mutation check (scratch, not committed): each of 14 mutants of the guards is caught by a mode: no 2 s/pick wait, a claim while playing, no reverse on failure, touched only once acknowledged, the capacity left high, old copies freed without the BINDs, the union dry run with the code where it was, a failed core evacuating again, a new copy allowed over its own old copy, an orphaned reserve kept, a claim over live code without moving it, the region test missing code that reaches into it, a failed forward step taken as done, a way back that did not land given up.
- **DSP side** (`sdk/tests/test_resident_engines.py`, in the modwerk-source-tools image; its interpreter is not the chip):
  - The real units (423, 773 and 998 words) relocated three ways agree word for word at ten arena bases: a fresh assembly at the base, `resident_dsp.relocate`, and the base's C relocator over `data_c`'s data.
  - `resident_engines_native.cpp` runs the on-demand receiver: it refuses an enable before PLACE, a second PLACE and an unplace while enabled, and its base word names the placed engine. Each stub then runs the engine placed at the arena's top and lower down, against the resident build's stub, from the same X/Y memory and registers: X, Y, the data ALU registers and the instruction counts are equal; an address register differs only where it holds a P address in the engine.
  - Each stub runs twice: from filled memory (mostly the early return), then from the feature's reset state steered down its working path. Output Matrix's mix and phones paths (188 and 22 instructions, until they leave for stock code) and Analog BD's source on core B (167) ran there. On core A, Analog BD's voice block pointer from that synthetic record lands at X:$f598xx, which the interpreter has no memory for (both builds fault there), so its first 160 instructions are compared. Sidechain's entries ran 30, 18 and 11 interpreter steps in both scenarios (a DO loop counts as one step), so how far into its detector the steered state reached is not shown.
  - Sidechain's key phase on two cores (each its own P/X/Y, their shared windows one memory, whole hook calls interleaved as the dispatcher orders them): the changed engine keys T5 from T3 and T1 from T6 two blocks late for every enable offset and skew above; upstream's delay follows the offset and reads the slot being written at an offset of 2 mod 4; a reader of the writer's counter jumps between 2 and 3 blocks under a moving skew. MON ends with its COMPRESSOR. The changed instructions disassemble as written, and each is a form upstream's code already uses.
- **Default builds unchanged.** A base built without `--resident-on-demand` links to the same bytes as before this slice, but for the identity fields (`modwerk_base_digest`, `olog_build`, `olog_configuration`, `olog_source`): checked on the resident development twin, the resident beta configuration (with and without controller rows) and the plain DSP-loader base. `controller_board.c`'s text changed, its object did not.
- **Default builds unchanged by the evacuation** (same method as above, twins built from the commit before and after it): the resident development twin and the resident beta configuration, each with and without controller rows, and the plain DSP-loader base link to the same bytes but for the identity fields; `controller_board.c`'s text changed, its object did not; the plain base's sources are all identical.
- **Default builds after the two manager fixes** ("Two manager fixes", below): they change, by design. The `dl_move` rollback fix changes every `--dsp-loader` base; the owned-job wait changes the resident ones.
- **Analog BD's recipe.** The on-demand base moves the write-lease entries Analog BD's package calls, so its reviewed hash recipe (`machine-recipes.json` imageSha256) has to be recaptured from the stock OS for any base that ships this, as for every base change that moves them (`OCTATRACK_BETA_TEST_PLAN.md`, finding 17). A development twin recaptures it privately (`build.py --capture-stock-recipe`).

## Evacuation: the on-unit test

Not yet run. Twin: `~/.cache/modwerk-local/ot/eod/int/C-dev`, built from the integration branch (the evacuation, Sidechain's key phase at 423 words, the restored-Part fix and the two manager fixes; private, configuration `76e15b41…`), the rows' three trusted packages beside it in `packages/`; Analog BD's recipe recaptured for it as before. Its resident block starts where the earlier on-demand twins' did (P 8,122 on core A, 7,561 on core B), so the arena with nothing placed should still be 4,418 words on core A and 4,546 on core B (measured on the earlier on-demand twins, not on this one). The resident twin to compare with is `int/A-dev` (`b39873b4…`). The first version of this test named `ev/C-dev` (`efbe190c…`), built before the merge.

**Why Output Matrix first.** With nothing placed no stock effect is a quarter of core A's arena (SPRING REV 1,063 and DARK REV 1,067 words are under 1,105), so they load from the bottom. With Output Matrix placed (773 words, core A's arena 3,645), SPRING REV is a quarter or more and the allocator puts it at the top, where Sidechain's engine then goes.

**Steps** (stopped, a scratch project whose bank A runs nothing but FILTER/DELAY on T5–T8; the diagnostics addresses are this twin's):

1. RAM-boot the twin; `loader` for the baseline counters.
2. `try …/packages/output-matrix.mwrm`. View (`mem:0x40ac89e0:44`): core A Output Matrix state 5 at offset 3,645, arena 3,645.
3. `pick:T5:FX2:SPRING_REV`. `mem:0x40d0ae40:6` (the allocator's live record of id 21 on core A, `allocator` + 150: offset, words, present) reads `0a16 0427 01`: 2,582, 1,063 words, at the top. (`ev/C-dev`'s `0x40d0a634` was `allocator` + 1,686, the target record; it equals the live one once a transaction is retired, and reads zero after a rollback.)
4. Make T5 sound through it while stopped (best a steady tone into a THRU machine on T5, else a hit with SPRING's decay up and its tail ringing), record the 20 USB channels, then press no key for at least 2 s.
5. `try …/packages/sidechain-compressor.mwrm` (refused with `RUNTIME_MEMORY` on the previous twin). Within about a second: view byte 42 goes 1 (upload) and 2 (bind) back to 0, byte 43 reads 1; `mem:0x40d0a358:14` (failures, moves, evacuations, then `dl_engine_why` per core) reads 0, 1, 1; `mem:0x40d0ae40:6` reads `05ef 0427 01` (moved to 1,519, below its old copy). Then Sidechain as before, at 423 words: core A state 5 at 3,222, arena 3,222, reserve 1,196; core B at 4,123; slot ACTIVE.
6. `loader`: no rejected packet, no error, no rollback; one more commit.

**Listening.** On T5 (and MAIN), around step 5. Pass: the tone or tail carries on with no step, spike or gap; `octatrack-clicks.py` finds nothing there that is absent from a take of the same sequence without step 5. An artifact would be:
- a click: a one- to few-sample step or spike at the BIND;
- a dropout: a frame or more of T5 dry (the dry stub) or silent;
- distortion: noise or a burst from code running from wrong words, possibly followed by a DSP stall (frames stop, the sequencer sticks, silence until a power cycle; `report` shows it).

The move itself is `dl_move`'s mechanism (upload beside the running copy, one BIND), the one compaction uses while playing and `octatrack-movelisten.py` listens to; this test is for the evacuation's own transaction, which runs only while stopped.

**Guards.**
- PLAY before step 5: nothing moves or places (view wait 3, byte 42 stays 0, id 21 stays at 2,582); STOP, and two seconds later it moves and places.
- STOP, then a key every second: no move until two seconds after the last.
- Placed: Part switches, a pattern change and a Part reload while playing send no WRITE or BIND (`loader` counts, `dl_engine_moves` unchanged).
- Removal: `remove` Sidechain; arena back to 3,645, SPRING REV stays at 1,519.

## Two manager fixes (15 October 2026; they change default builds)

Both were found while writing the evacuation and are fixed in the integration branch, host-tested, not run on a unit.

- **`dl_move`'s rollback rebinds the old copy.** Before, a compaction move whose upload or BIND failed rolled back through phase 7, which sent BYPASS for every id whose target differed from its live place: the moved effect, still running, went to the dry stub (silent) while the allocator kept it live at its old place, until its id changed. Now phase 7 sends the moved id one BIND back to its old copy, which still runs and stays held until the cancel (`dl_allocator_move` places the new copy clear of every live copy), sent again until acknowledged, as the evacuation's way back is; the journal keeps that copy's generation and the id is not counted as stubbed. Only if a span the transaction uploads meets the old copy (no planner makes such a move) does the id go to the stub, as before.
  - Source: `build_core.py`'s manager edits (`moved_back`, `sent_back`; the width edit of the ACK bookkeeping follows) and the journal seam in `resident_journal.py`. Every base built with `--dsp-loader` changes: the plain DSP-loader base, the resident beta and development bases, on demand or not.
  - Host: `test_resident_engines_board.py` modes 22-25 (upload refused part way; BIND refused, its way back refused once; BIND applied but never answered, so the transport times out; an old copy not provably intact goes to the stub), with the receiver model's per-frame check that the running slot runs whole code from where the manager holds it; `test_resident_journal.py` modes 11-12 (the generation the journal reads after the way back, from a refused BIND and from a refused upload).
- **A Part switch waits for an owned job.** While an owned job holds a core (the board's RESET or CAS, an engine's WRITE or PLACE), a legacy start refuses and `dl_job_status` answers -2 for that core, which `advance()` took as the transport refusing: the selection rolled back (`DL_SELECT_UNAVAILABLE`), so a Part switch needing an upload in that window could fail. Now `advance()` and the table step (phase 8) wait for it, as for another legacy job, and start again on the next tick: at most 600 refused starts per owned job (the evacuation's patience), then it refuses as before.
  - Source: `resident_driver.py` (`dl_owned_holder`, the ticket of the owned job holding a core) and `resident_journal.py`'s manager seam (`owned_wait`). Resident bases only (`--resident-stock-hooks`): the resident beta and development bases, on demand or not; the plain DSP-loader base has no owned jobs and keeps these bytes.
  - Host: `test_resident_engines_board.py` modes 26-28: a Part switch during Sidechain's engine WRITE on core A and one during the board's RESET there both complete after the job, with no rollback or failure, and the RESET goes on; two owned jobs in a row holding the core for 800 frames, then the switch completes; a reservation that never ends refuses after 600 refused starts and the switch goes through once it is gone; the same wait in the table step, with an owned job on core B.
- **Mutation check** (scratch, not committed): each of 12 mutants is caught: the rollback to the stub (the old code), the BIND back to the new copy, no overlap check, a BIND back counted as stubbed, a BIND back outside a rollback, the journal clearing or not recording the generation, -2 a refusal again in `advance()` or in the table step, an unbounded wait, no owned holder reported, one bound shared by every owned job.

## The integration build on the unit (15 October 2026)

Twin built from this branch before the base regeneration (on demand, `--dev`, configuration `76e15b41…`), on the owner's MKII:

- **All three engines:** placed at boot restore and by install, arena 2,224 / 3,125 (Sidechain 423 words). Eight switches between identical Parts while playing: T3 and MAIN bit-exact, no loader packet, no engine job.
- **Sidechain key phase:** T5 (COMPRESSOR, KEY T3, MON ON) lags T3 by 32 samples on 5 of 5 enables (two blocks); the earlier base gave 89 or 121 depending on the enable. On the key-phase twin, 9 of 9 equal. MON: swapping T5's COMPRESSOR for FILTER with MON on gives exact silence.
- **Evacuation:** SPRING REV at the top of core 1 (under Analog BD), sustained as a drone (all six knobs up, HP 0); installing Sidechain moved it and placed the engine. Under the drone (T3 0.34-0.36 RMS): no click (no 20 ms block above the drone's own second-difference texture), no dropout. Counters: moves and evacuations up by one, no failure.
- **Picks during an engine job:** three PLATE REV picks on T5 while Output Matrix installed: all taken, no selection refused or rolled back. Before the fix the same timing gave DSP LOAD FAILED once on the unit.
- **Analog BD on a restored Part (finding 24):** T3 left as ANALOG BD survives a RAM boot with the module in the saved set: FLEX type and marker kept, the drum plays. Before the fix the bank restore was refused: a default bank without trigs, which the unit's autosave then kept ("total silence", first blamed on Sidechain).
- **Development trap:** a RAM boot after a session of resident engine installs and removals sometimes drops the unit off USB until a power cycle (seen twice without a stray session).

## Where this stands (end of 15 October 2026)

The beta base is regenerated on demand on top of main after #619 (`acf91e0a…`, which adds the startup without the wave's outline and the two-section MODWERK STATUS page; Analog BD's recipe recaptured again, only its image hash changed). Steps 1 and 2 are done (merged with main, 15 October evening). Next:

1. Changelogs: a 15 October note on the current version of the five base-bound modules (four rebuilt, CC Map bytes unchanged); the Sidechain key-phase note now ships in the beta base.
2. This note's Status and Open → Beta base, and one line in the beta test plan naming tester base `acf91e0a…` and the finding 17 recapture.
3. The checks `npm run pr:ready` runs, serially and memory-capped (the parallel run OOMs the WSL test PC), including `import-module-build --check-only --verify-existing` for the rebuilt packages.
4. A development twin of exactly this configuration plus `--dev`, then on the unit: boot, the three engines, a Part sweep, an Analog BD reboot. Then the pull request.

## Open

- **Evacuation on the unit.** Written and host-tested (above), not yet run on hardware; the test is above ("Evacuation: the on-unit test"). Still unproven there: that the move is inaudible while an effect rings (no click, dropout or distortion on its track), its frame cost, and that the boot restore of a project whose bank holds big effects now comes up without "SOME MODULES FAILED" (that failure was inferred, never seen).
- **Hardware.** Sidechain's install, activation, removal and reinstall ran on a unit (above). Still to run:
  - that no Part switch, pattern change or reload starts an engine job with an engine placed (`mw_engines_jobs` sits outside the development MEM window; use the loader's accepted counts) and that switching still sounds as on the resident base;
  - the silence after a Sidechain enable (above), on the resident base first: it is not on-demand's, but it blocks calling Sidechain artifact-free;
  - the receiver's op-10 frame cost, and the first-frame behaviour of an engine at a new address;
  - the key phase change: T5 against T3 (KEY T3, MON ON) must lag by the same number of samples over repeated removals and reinstalls;
  - Analog BD's X tables stay at `$2840` in the DMA block (an existing trap).
- **Beta base.** `build_core.py` and the resident sources are part of the base's source hash, so any change to them needs the base regenerated (`npm run octatrack:base -- --stock OS.bin --beta --write`: `--beta` is every flag of the beta base, `--cached-modules` and `--usb-audio-variants` among them, and `--write` takes no other) and Analog BD's recipe recaptured when its lease entries moved. The committed beta base is on-demand (since `acf91e0a`). A fresh worktree with a linked `node_modules` first needs `prepare`'s generators (`node scripts/machine-modules.mjs && node scripts/module-changelogs.mjs --write && node scripts/elekloader-vendor.ts --write`). Then relink the five base-bound packages with `npm run octatrack:module-packages` (it rebuilds every package; since #734 the standalone and table recipes match main and the kit's Elekloader checkout) and check that only `requiredBase` moved; on `aba30393` all five came out byte-identical.
- **Arena numbers.** Done: 4,418 / 4,546 words with nothing placed (above); with all three placed, core A keeps 2,259 and core B 3,160 (measured with Sidechain at 388 words; at 423, 2,224 and 3,125 by arithmetic).
