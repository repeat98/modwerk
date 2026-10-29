# Octatrack module edge cases

Owner and Claude, 11 October 2026, after the persistence run on a scratch project. What can go wrong when
modules, projects, Parts and the base meet, what the base does today, and what is proven. Status: **done**
(proven on the unit), **built** (code exists, not proven on the unit), **open** (not built or not tested).

Persistence run (LIVE/MODWERK-TEST, S44: E-Verb on T1 and T5 FX2, Euclid on T3 and T7 FX1, TapeHead on
T2 FX1, each with its own knobs; `scripts/octatrack-persist.py`): a Part reload (the `reload` step: the old
PART+FUNC+PLAY recipe clears the Part), a project reload and a RAM boot each brought back every assignment,
every knob and both Part copies exactly. Euclid removed while only the saved Part named it: MISSING listed it,
the unit said `MISSING EUCLID`, both slots ran dry (NONE) with every stored byte kept, and reinstalling it
brought back the baseline exactly. Not yet: another project and back, a real power cycle.

## Projects and the installed modules

| # | Case | Today | Status |
|---|---|---|---|
| 1 | A project names modules that are not installed | The unit opens MISSING MODULES (status.c, owner: a list to close, not a popup): every module the project names in any bank or Part that is not installed, UP and DOWN to scroll, YES or NO to close (12 October 2026: modules that went missing while the page showed reopened it at once after NO, which looked like NO doing nothing; now what the open page shows counts as told, `test_status.c`; on the unit, the tester image `dc1d7a39…`: one NO closed it for good); it opens when the list gains one and has held still for half a second, once the boot's restore is over, and closes itself when nothing is missing. Selecting a track running one still says `MISSING <NAME>` briefly. Those slots play dry and keep their knobs. The site reads the same list every 3 s while the unit is idle and offers Add to set, or says a load brings them back. | unit: done (S45); site: built, not seen in a browser with the unit |
| 2 | A new base build: the saved set belongs to another build and is not restored | The page lists every module the project names (S45: E-Verb, Euclid, TapeHead); reinstalling them brought back every assignment, knob and both Part copies | done (unit) |
| 3 | The restore installs only some modules (`SOME MODULES FAILED`) | The ones the project names show as missing on the site (1); the unit's popup does not name them | built (as 1) |
| 4 | Another project gives a handle to a different module | Two-step rebind: the old module lets go, then the new one takes the handle. On the unit: MODWERK-TEST, then a second scratch project with E-Verb on another track, then back: identical to the baseline (both projects used the catalogue handles, so no handle actually moved) | built (host test, emulator); switch and back done |
| 5 | More than 13 different modules in one project | 13 free handles; the 14th is refused as FULL (host test `test_dsp.c`) and the site says the Octatrack has no room for another module. Too few for configurations of ~90 modules: see 21 | superseded by 21: 128 ids, 109 for modules (S63 ran 14 module effects at once) |
| 6 | A module update changes what its knobs mean | The map records a layout number, but nothing converts or warns. Detecting it needs `modwerk_fxmap_assign`: a module taking a handle overwrites the project's map entry with its own layout at once, so the mismatch has to be caught there (old layout against new) before it is lost; a project loaded over an installed module keeps the project's layout and could be compared later. No module has layout 2 yet | open (design noted) |
| 7 | Updating a module a track plays | Refused as `RUNTIME_IN_USE`, and the site now says why; the user must pick another effect first | done, poor experience |
| 8 | A module removed while a saved or another Part or bank names it | Removal is allowed (only playing tracks hold it). MISSING lists it at once; reloading the Part runs those slots dry (NONE) with their bytes kept, `MISSING EUCLID` shows when the track is selected, and reinstalling restores everything | done |

## Copying and saving

| # | Case | Risk | Status |
|---|---|---|---|
| 9 | Copy and paste of a Part, track or pattern between projects | The handle byte travels, not the module: in the other project it can name another module, or none. The wrong effect plays with the wrong knob meanings | open (owner: not now) |
| 10 | Saving while a module is on trial, then rolling the trial back | The project names a module that is gone: case 1 | built (as 1) |
| 11 | SAVE TO NEW, EXPORT TO SET, a project folder copied on a computer | Whether the `#MODWERK_FX` lines go along is not tested | open |
| 12 | The map in battery RAM and the project file disagree (battery reset, a project saved on another unit) | Which wins is not tested | open |
| 13 | Parameter locks, LFO destinations, scenes and the crossfader on module knobs | A parameter lock on E-Verb's SIZE (A01, T1, step 1) came back byte for byte after a RAM boot and the restore (the pattern's 36,568 bytes); LFO setups and scenes live in the Part, which came back byte for byte too | done (bytes); not listened to |

## Boot and power

| # | Case | Today | Status |
|---|---|---|---|
| 14 | Power lost while the set is being saved | Two files in turn: the older set stays | built (host test) |
| 15 | FUNC held at boot skips the restore | Everything the project names is missing; the card's set is left alone, and the next normal boot restores it | done (flashed beta, 12 October 2026; below) |
| 16 | A real power cycle into a flashed base that restores | MODULES LOADED, the set back from the card | done (flashed beta, 12 October 2026; below) |
| 17 | The restore held back past 10 s (playback or USB disk mode right after boot) | Hosts then go ahead, and a late restore could still overwrite a change made before it. Installs need the transport stopped, so this needs the card unavailable or USB disk mode for 10 s after boot while installing | open (rare; shortcut in ep0.c) |

## While playing

| # | Case | Status |
|---|---|---|
| 18 | A pattern or bank change, playing, into a Part that names a missing module | Playing A01 (Part 1), queued A02 (Part 2 names the removed Air Chorus on T4): T4 took Part 2's effect at its trig and ran dry (NONE), frames went on, no stall | done |
| 19 | The arranger switching banks and Parts with modules | open |
| 20 | The self-test while the project names missing modules | Passed: 3/3 intact and ran, peaks and frames fine, card set saved | done |

## Key gestures in windows

A module that takes a stock key gesture (FUNC + YES, a SCENE chord) decides where it acts. Measured under the port for Temp Save (OS 1.40C):

- The FUNCTION key's layer sits over every window, so a hook on a FUNCTION-layer handler sees the keys in menus, SETUP pages and dialogs too; only windows with a layer of their own (TEMPO, SRC SETUP's sample preview) keep them away.
- Every window, and the message box (`0x4005a2b8`), is the same popup record (`0x460d175c`, flags `0x21` while open). Test the message by its handle (`0x460d1e70`): a "window open" check that does not, sends a quick second press to stock while the message still shows.
- Stock's window table (`0x460d1188` close routine, `0x460d119c` kind, entry 0) names the open window, but entries stay after a close: read it only while the popup is open. A yes/no dialog is `0x460e5cd0` (its window, cleared on close), wherever it opens.

## The effect list

| # | Case | Today | Status |
|---|---|---|---|
| 21 | More module effects than the list holds (owner, 11 October 2026: "I just want a longer list than 32 entries"; categories in the choosers: not now) | The chooser itself scrolls any length (stock's 7 is only its viewport, build_bus.py CHOOSER_ROWS); the 32 is the base's lists and the 32 effect ids, of which stock keeps 19. Owner: more than 13 different module effects at once are needed, so ids handed out on pick are not enough; the DSP dispatch and stock's per-id tables have to grow, or one id has to dispatch to a second-level table. Research under way | done: 128 effect ids, the default from `d3f13a60` ([OCTATRACK_MORE_EFFECT_IDS.md](OCTATRACK_MORE_EFFECT_IDS.md)); 14 module effects at once on the unit (S63) |

## Loading and memory, measured (11 October 2026, S47/S48, `scripts/octatrack-loadbench.py`, `memory`)

- **Speed.** Every pick, module or stock, ran 114-123 ms after YES whether it moved 0 or 68 packets (E-Verb's
  1,588 words): the time is the key hold and the tool's polling, not the load. The longest gap between two audio
  frames during loads was 403-420 us, the same as idle (420 us; a frame is about 363 us). A Part switch with
  modules preloaded sent no packet, and five idle seconds sent none.
- **Code leaves a core when no working Part names it**, so a second pick sends the same packets again (Mini Verb
  24, E-Verb 68); that costs nothing measurable. Modules a working Part names stay loaded (Air Chorus, named by
  Part 2, came free on core 1).
- **Packing.** Fresh, each core's code sits packed from the arena's start with no holes (core 1: 3,641 of 5,075
  words in five blocks). The allocator places first-fit and never moves live code: taking E-Verb off T1 left a
  1,588-word hole, and Mini Verb (532) then filled its start, leaving a 1,056-word hole (2,490 free, the largest
  run 1,434). A placement that fits the free words but not one run is refused as memory
  (`DL_ALLOC_TRANSITION`) after the base lets go of what it holds; live code is never moved. On the unit the
  cycle ledger refused first: E-Verb on T4 was refused for cycles (manager result -2) with core 1's code
  memory 51 % used.
- **Holes now close by moving code (S51).** A block moves into a hole the way a copying collector moves an object:
  its new copy is uploaded while the old one runs, the dispatch entry is bound to it at a frame, and the old copy
  is freed (`dl_move` in manager.c and `dl_allocator_move`, build_core.py's edits; the planner in dsp.c). A slot's
  state lives in X and Y and stock reruns init only when the id changes, so the effect never goes dry. A move whose
  upload or BIND fails rebinds the entry to the old copy, which is still held (since 15 October 2026; before, the
  rollback sent the running effect to the dry stub until its id changed). One move at
  a time, when the manager is idle and two seconds after the last key, playing or not. On the unit: a 532-word hole
  closed in 4 moves and 507 ms (about 125 ms a move); playing, a 422-word hole closed by itself within 5 s with
  Euclid running on T3 throughout; frame gaps 408-415 us, no errors, stalls or rollbacks. MAIN through a moving
  module stays identical (below). A first version silenced every module
  slot and reloaded (373-425 ms, stopped only); it is gone.
- **Testing the moves (state frozen 11 October 2026).**
  - Churn while playing, S51: 60 random picks, 8 holes closed, frame gaps 404-421 us, no errors, stalls or
    rollbacks. S52: 131 steps, 23 holes closed, again no errors or stalls, but holes on core 0 stayed open
    (422 and 774 words): the planner only worked the lowest hole and gave up on a core too early.
  - The planner is now a pure function (`modwerk_compact_plan`) with a host simulation in test_dsp.c over 20,000
    random layouts, every planned copy checked clear of live code: 99.8 % of roomy layouts (free at least twice the
    largest block) pack, in at most 15 moves; 49 % of tight ones. A copy needs one free run as big as its block, so
    a large module (E-Verb, 1,588 words) above a hole on a busy core cannot move at all; that hole stays until the
    layout changes. So far the cycle ledger always refused before such a hole mattered.
  - S53 on the unit (the new planner, no moves while a USB host session is open or a pattern change is queued, knob
    turns counting as keys), 12 October 2026:
    - **Heard nothing, measured nothing** (`scripts/octatrack-movelisten.py`). A sustained bass sample retriggered
      every half second on T2 makes MAIN repeat, so each half second can be compared with the one before it. Through
      TapeHead (T2 FX1), moving twice a round (up past the hole Euclid left, then down into it), MAIN stayed
      identical sample for sample across every move: 10 takes, 19 moves, not one 24-bit step different. TapeHead
      changes 24 % of MAIN, so it is heard. E-Verb (T2 FX2, 1,588 words, 74 % of MAIN), moving twice a round over
      Mini Verb's hole: its tail leaves 12-15 steps (-115 dBFS) of difference anyway, and around its 18 moves in 9
      takes the difference stayed there (2.9 steps RMS per 10 ms, near the moves and elsewhere). A frame of the wrong code or a lost
      state would show as some 10^5 steps. The only other difference: one 12-sample step of 15 at a pick on T3.
    - Churn while playing (`octatrack-movestress.py --steps 40 --seed 7`): 32 picks, 8 refused by the cycle ledger,
      5 holes closed, longest frame gap 408 us, no error, stall or rollback. Then the Part reload, and the self-test
      read every module's code back: 6/6 intact, all ran, longest frame 401 us.
    - Collisions (`octatrack-movecollide.py --playing`): a Part switch 12/12 and a pick 12/12 (stock COMPRESSOR on
      T6; Air Chorus there is refused by the cycle ledger before any move matters) just as moves start. USB installs
      22/24: twice the remove, 1.8 s after the last key, met a move and the loader said busy (refusal 5). The site
      now waits and tries again, as it does while the transport plays (octatrack-link.ts).
  - **A hole that cannot close**: E-Verb above a hole on a core whose free words, all together, are fewer than its
    1,588. A copy needs a free run as big as the block, so no sequence of moves reaches it; the hole stays until a
    module comes off. Seen twice on core 1 at 64-72 % used: after Euclid came off below E-Verb (395 words), and
    after the self-test put the set back (774). Nothing is heard; a module bigger than the largest run is then
    refused as memory though the words are free.
  - **Big blocks at the top (owner: "fix it"; S54, 12 October 2026).** Big blocks (a quarter of the arena or more:
    E-Verb, and the 1,391- and 1,575-word packages) are placed as high as they fit (build_core.py's allocator edit),
    the rest as low; the planner packs big ones down from the top and the rest up from the bottom, lifts a big block
    that sits low once the room under the top ones is free, and moves whenever it has a move, not only when there is a
    hole (dsp.c). A hole now means free words outside the largest free run (dsp.c `modwerk_compact_left`, device.mjs
    `memory`). Host tests pass (test_move.c placement, test_dsp.c).
    - **What it gains (host churn, 200,000 steps, three seeds, 12 October 2026).** With sizes drawn from the real
      catalogue (5-1,588 words), placements refused with the words free fall from 2.0 % to 0.6 %, steps that end with
      the free words split from 9.9 % to 3.0 %, and the words copied per step from 485 to 286. A lower threshold (an
      eighth) copies less (244) but leaves more split (4.9 %) and refused (0.9 %); with today's catalogue a quarter and a
      sixth pick the same blocks. test_dsp.c's synthetic sizes: 2.3 % to 1.56 % refused, 8.3 % to 4.9 % split. Kept
      at a quarter; the residual is mid-sized blocks (800-1,200 words) stuck over a hole.
    - **On the unit (S54, `ee76c36f`, RAM-booted; LIVE/Dev12 bank B).** E-Verb lands at the top of both cores (@3487
      of 5,075 words on core 1, @3491 of 5,079 on core 0). Air Chorus coming off under TapeHead left a 795-word hole,
      closed two seconds after the last key by moving TapeHead down. Movestress (`--steps 40 --seed 7`, playing): 34
      picks, 6 refused by the cycle ledger, 10 holes closed, longest frame gap 428 us, no error, stall or rollback.
      Movecollide (`--playing`, its hole now opened under Air Chorus by Mini Verb, 532 words): 35/36; the miss is the
      known one, a remove meeting a move refused as busy (refusal 5), which the site retries and `device.mjs remove`
      does not. The self-test afterwards: 5/5 modules intact, all ran together, longest frame 426 us, and no hole
      left. Not run: movelisten (needs a recorder on Windows; its E-Verb setup still assumes E-Verb moves).
  - **A RAM boot after heavy churn (S54, 12 October 2026).** After a 60-step movestress (49 picks, 11 refused by the
    ledger, no failure), a RAM boot into the same base restored the card's set by itself (5 modules, the same 25,984
    pool bytes, nothing missing, no loader error or stall). The self-test then passed (5/5 intact, longest frame
    428 us), a 15-step movestress on top of it too, with no hole left, no new crash or stall record, and the Part
    as saved.
- **The module pool** (256 KB) held six modules in 26 KB with no hole; removing Euclid from the middle and
  installing it again left none (first fit at the lowest address; nothing moves).

A ColdFire unit with a large `.bss` (Temp Save keeps 42 KB) reaches it by absolute address (`lea (sym).l`, relocated at load): in the fullest card selections the shared DRAM link puts `.bss` past a 16-bit PC offset ("relocation truncated"; `module:verify` finds it).

## Order

1. ~~Cases 1, 2 and 3~~: done (the unit's page, the site's note).
2. Case 21: more than 13 module effects at once and a list longer than 32 (owner's priority). Designed: wider ids,
   128 of them so every installed effect module keeps its own, up to 128 modules installed, and longer lists
   (owner, 12 October 2026); the plan is in
   [OCTATRACK_MORE_EFFECT_IDS.md](OCTATRACK_MORE_EFFECT_IDS.md#decision-and-plan-owner-12-october-2026).
3. Case 7: an update with the same layout swaps in place instead of being refused (design first: the DSP
   manager must retire the old code from the slots running it before the new code binds, as the rebind does).
4. Case 6: layout numbers, before the first module update that changes its knobs.
5. Needing the owner at the unit: 11 (SAVE TO NEW, EXPORT TO SET: read project.work in USB disk mode), 19 (the
   arranger), the site's note in a browser. 15 and 16 are done (12 October 2026).
6. Case 9: paste between projects (owner, 11 October 2026: not now).

## Owner steps for 15 and 16, on the flashed beta (12 October 2026)

Flash the tester image once (`Modwerk-octatrack-beta3.bin`, `9a86d7e1…`, flash-safety checked):

1. On the Octatrack, press STOP.
2. PROJECT > SYSTEM > USB DISK MODE, then YES.
3. On the computer, copy `Modwerk-octatrack-beta3.bin` to the top level of the Octatrack drive.
4. Eject the drive in Finder and wait until it is gone.
5. On the Octatrack, press NO to leave USB DISK MODE.
6. PROJECT > SYSTEM > OS UPGRADE, select the file, YES, confirm.
7. Leave the power on until it has restarted and shows the project.

The agent then installs two modules over USB, keeps them, and checks that the card set was saved.

Case 16, a real power cycle restores the set:

8. Press STOP, switch the Octatrack off, and wait 5 seconds.
9. Switch it on, holding no key.
10. About 3 seconds after the project shows, read the message: MODULES LOADED, SOME MODULES FAILED or MODULES NOT LOADED.

Case 15, FUNC skips the restore:

11. Switch off and wait 5 seconds.
12. Switch on, holding no key.
13. When the startup animation begins, press and hold FUNC until MODULES SKIPPED shows, then let go. If the Startup
    Menu appears, FUNC came too early: switch off, wait 5 seconds and repeat from step 12.
14. Switch off, wait 5 seconds, and switch on holding no key: MODULES LOADED again, because the skip leaves the card's
    set alone.

After steps 10, 13 and 14 the agent reads INVENTORY and MISSING over USB and records them here.

### Results on the owner's MKII (12 October 2026)

The owner flashed `Modwerk-octatrack-beta3.bin`. The agent then read the unit with vendor requests only:

- **After the flash** (18:12): base `dc1d7a39…` from flash (DIAG ticks from about 18:11:54, the upgrade's own restart; no
  RAM boot armed), idle, DIAG clean. The restore record said RESTORED: the flashed base took the card set that the
  RAM-booted copy of the same build had written (an empty set). INVENTORY was empty.
- **Install:** on bank C, transport stopped, the site's OctatrackLink loaded E-Verb 0.1.1 and Mini Verb 0.2.1 from
  `public/octatrack-modules` as one set, with the self-test as its stress test, and kept it: 2 changes in 7.7 s.
  - The self-test passed: 2/2 intact and ran, peaks T1-4 40.0 %, T5-8 56.8 %, CPU 44.2 %, longest frame 433 us.
  - The card set was saved and read back, 2 of 2.
  - INVENTORY: E-Verb (handle 27), Mini Verb (handle 23).
- **Case 16:** the owner power-cycled with no key held and saw MODULES LOADED, then MISSING with Euclid, Air Chorus and
  TapeHead. The restore record said RESTORED, 2 of 2, and INVENTORY listed E-Verb and Mini Verb.
  - HELLO then shows generation 0 and the base's own digest as the active set: a restore installs through the loader,
    not as an upload. INVENTORY, not HELLO, says what is installed.
- **Case 15:** the owner held FUNC from the start of the startup animation; MODULES SKIPPED showed. The restore record
  said SKIPPED. INVENTORY was empty, and MISSING listed E-Verb, Euclid, Air Chorus and TapeHead (Mini Verb is named by no
  bank).
- **The next normal power cycle:** MODULES LOADED again; RESTORED, 2 of 2; INVENTORY E-Verb and Mini Verb; MISSING
  Euclid, Air Chorus and TapeHead. The skip had left the card's set alone.

**Open, deferred past the beta** (so the qualified image stays as tested): MODULES SKIPPED and MODULES LOADED show only
for a moment. They are stock popups (`modset.c`, `SAY`), and the MISSING MODULES page covers them half a second after
its list stops changing, so the owner could hardly read MODULES SKIPPED. Either keep MISSING back for a few seconds
after the restore's message, or put the restore's result on the MISSING page.
