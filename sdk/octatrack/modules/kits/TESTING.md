# Kits testing

## Kits 0.1.1-experimental on base 0.8: agent's run, 24 November 2026

Build: this branch with `main` `29c22d7a5` merged (base 0.8, with the Part Edit popup fixes of #1947). A development
twin of base 0.8 (`build_core.py` with the beta flags and `--dev`, without the controller rows) booted from RAM as
`95adb64b…` on the developer's MKII (OS 1.40C); the flashed base `254c5a75…` (0.7.12) stays in flash. Package: Kits
0.1.1 `c1cb63e5…` (`npm run module:dev -- kits --build-only`; the same bytes as the base 0.7.13 twin runs below this
section's date). No other module installed. Bank C, pattern C02, Part 2, transport stopped unless named. Every install
was a 120 s trial without a Keep and was rolled back (inventory empty afterwards; the crash 1 and stall 13 records
predate these runs). Screens read with `png:` over USB.

- `npm run device:test` (Kits 0.1.1): installed, self-test passed, meters (CPU 363, core 1 peak 339, core 0 peak
  429), twelve Part switches with PART+arrow while playing all landed, a queued change of bank and back landed. The
  next Part switch did not become active and the run stopped there, as on base 0.7.9 above (PART is LOAD KIT while
  Kits is active). Verdict: no crash, stall, freeze or skipped track.
- Kits alone: FUNC+PART draws the one-row Part Edit window with SAVE KIT, RELOAD KIT and RENAME KIT; it reopened on
  the row used last. The status line shows the pattern's Kit (`010 TWO`).
- FUNC+PASTE+PART: FUNC+REC on C02 (COPY PATTERN), PATTERN+TRIG16, then FUNC+STOP (PASTE PATTERN) and PART with FUNC
  and STOP still held: `KIT COPIED TO NEXT`, and C16 played `065 TWO`, a copy of C02's `010 TWO` in the next empty
  Kit, instead of its `009 ONE`. The Part Edit window did not open. A second stock FUNC+STOP pastes again (stock has
  no paste undo there; Kits' own PTN+FUNC+TRIG paste is the one a repeat undoes).
- Performance, C16 playing with crossfader sweeps, ten CPU readings and the frame guard per run:

  | Run | CPU meter (mean of 10) | Longest frame interrupt |
  | --- | --- | --- |
  | Stock, no Part change | 41.8 % | 40.9 % |
  | Stock, six Part switches (PART+arrow) | 41.8 % | 49.3 % |
  | Kits, six LOAD KIT loads | 41.9 % | 49.0 % |

  A Kit load's longest frame is a stock Part switch's; no skipped render. `evidence/performance.json` holds these.

Developer's report (twwwy), 24 November 2026, the same twin and package, Kits alone as a trial, given: PART to load
another Kit while playing and listen at the switch, then FUNC+CUE; a knob changed, SAVE KIT into an empty Kit, another
Kit loaded and the saved one again: "they all work". Verdict of that trial: no crash, stall, freeze or skipped track.

With Pattern Sample Locks: Pattern Sample Locks 0.1.9 `6fea272e…` kept on the same twin (with the developer's OK), then
Kits as a trial beside it. FUNC+PART drew PART EDIT with LOCKS (LOCK SAMPLES, CLEAR LOCKS) and KITS; PART was left out
(agent's screen). Developer's report (twwwy), 24 November 2026, given: SAVE KIT from KITS and the Kit back after
another load; LOCK SAMPLES and CLEAR LOCKS from LOCKS; a Kit loaded with PART while playing, listening at the switch;
FUNC+PASTE+PART after a pattern paste: "they all work". Verdict of that trial: no crash, stall, freeze or skipped
track; Locks stayed kept and Kits was rolled back.

Developer's report (twwwy), 21 November 2026, a base 0.7.13 development twin `5b9c4b1e…` with the same package beside
kept Pattern Sample Locks 0.1.9 `6fea272e…`: "they all works. the menu works too".

Not tested: FUNC+PASTE+PART on an MKI (FUNC+PASTE+MIDI), a Keep of Kits, the flashed base 0.8, a power cycle.

## Kits 0.1.1-experimental on base 0.7.9: agent's run, 19 November 2026

Build: source `f8e443f33` (branch `module/kits-0.1.1`, base sources as `main` `7b2f35abb`). A development twin of base
0.7.9 (`build_core.py` with the beta flags and `--dev`, without the controller rows) booted from RAM as `87830783…`
on the developer's MKII; the flashed base `27c9d36f…` stays in flash. Packages: Kits 0.1.1 `8ce226a5…` (the same
bytes as the 17 November restyled-window run's), Pattern Sample Locks 0.1.9 `6fea272e…`. Bank H, pattern 1, Part 1,
transport stopped unless named. Every install was a timed trial without a Keep and was rolled back (inventory empty
afterwards). Screens read with `png:` over USB. Agent's run, not the developer's.

- `npm run device:test` (Kits 0.1.1), twice: installed, self-test, meters (CPU 372, core 1 peak 357, core 0 peak 233
  with Kits alone; 369 before), twelve Part switches with PART+arrow all landed, a queued change to bank A and back
  landed. The next Part switch (PART+RIGHT) did not become active and the run stopped there; verdict both times: no
  crash, stall, freeze or skipped track. Kits 0.1.0 `main` package fails at the same step; Pattern Sample Locks
  0.1.9 passes it. With Kits active, PART is LOAD KIT and the pattern plays its Kit's slot, so the script's PART+arrow
  Part switch does not apply to Kits (design, not a fault of 0.1.1).
- Kits alone, as a trial on this base: Kits is active (the base lent the pages). PART opens LOAD KIT (026 TWO to
  029 ONE), the status line shows `029 ONE`. FUNC+PART draws the Part Edit window with PART and KITS; KITS shows
  SAVE KIT; YES on it showed `SAVE PART FIRST!` (bank H's Parts have no saved copy). NO closed each screen.
- Kits with Pattern Sample Locks, one 110 s trial: FUNC+PART draws PART, LOCKS and KITS with their icons; the window
  reopened in LOCKS' actions; DOWN moved to CLEAR LOCKS; LEFT, DOWN, RIGHT showed KITS > SAVE KIT. Kits was not
  active in this trial: PART opened stock's Part window (ONE to FOUR) and YES on SAVE KIT returned to the main screen.
  Verdict: no crash, stall, freeze or skipped track.
- After the Kits 0.1.0 run, its KIT NAME editor was still on screen with no module installed; NO closed it, no new
  crash record (crash 1 and stall 13 on the unit predate this run).
- The tracks of bank H Part 1 showed MISSING effects after the trials; its working and saved copies were equal and
  no Part of the bank was marked unsaved. Not established whether those are the Part's own references to modules
  the twin lacks.

Not tested: a Kit saved, LOAD KIT applied, FUNC+PASTE+PART, MKI, a Keep, a power cycle, sound.

## Kits 0.1.1-experimental: the base's Part Edit menu, unit run of 17 November 2026

Build: source `598edfaa4`; a development twin of base 0.7.6
(`build_core.py` with the beta flags and `--dev`, without the resident controller rows), MAIN booted from RAM as
`812ac544…`. Packages: Pattern Sample Locks 0.1.9 `b79de4b9…`, Kits 0.1.1 `af773397…`, installed together as one timed
trial (`npm run device -- set A,B --seconds 600`, no Keep) on the developer's MKII, project on bank K, transport
stopped. Screens read with `png:` over USB. The trial was interrupted after about 82 s and rolled back (inventory empty
afterwards, active base still the twin; loader 0 rejected, 0 rollbacks). Agent's run, not the developer's.

- FUNC+PART draws the two-column window: PART, SAMPLE LOCKS, KITS on the left; RENAME, RELOAD, SAVE, SAVE ALL on the
  right. DOWN on the left shows SAMPLE LOCKS' LOCK SAMPLES and CLEAR LOCKS; RIGHT moves into them, DOWN moves the
  cursor; LEFT goes back; KITS shows SAVE KIT.
- YES on LOCK SAMPLES opens LOCK SAMPLES TO PATTERN (the track screen, as 0.1.8); NO closes it.
- YES on SAVE KIT shows KITS NOT ACTIVE: during a trial Kits gets no pages, as its README says. The SAVE KIT list
  itself was not reached (it needs a Keep).
- FUNC+PART again opens on KITS, the module row chosen last.
- PART's actions open on stock's remembered row (SAVE here), as stock's Part Edit does: YES there ran stock's Part
  Save (`PART 1 SAVED`) by the agent's mistake. The Part's working and saved copies read the same bytes before and
  after (`mem`), and its edited flag stayed set.
- Seen on the twin, not traced to these packages: a DSP stall record about 57 s after the RAM boot (tick 3119), before
  either package was installed, after which T5-T8 showed no effects; a crash record (address error, PC `0x40d52f64`)
  from an earlier boot; a 1.5 s UI tick gap in minute 5, around the trial's install.

Not tested: the SAVE KIT list and a Kit saved from it, CLEAR LOCKS and a Lock or Clear applied, MKI, playing
transport, a Keep, a power cycle, sound.

Kept run, the same day, same twin and packages, with the developer's OK to Keep (and to save one Kit):
`npm run device -- set A,B --accept` installed both (loader 0 rejected); Kits became active (status line `033 ONE`).

- FUNC+PART > KITS > SAVE KIT opens the SAVE KIT list on the current Kit (033). LEVEL scrolled to the first empty Kit,
  065; YES opened KIT NAME (NEW KIT); YES saved: `KIT SAVED`, status line `065 NEW KIT`. Saving also named the Part
  NEW KIT (it was ONE) and wrote kits.work, as Kits does.
- FUNC+PART then opened on KITS (chosen last); SAMPLE LOCKS > CLEAR LOCKS opened CLEAR SAMPLE LOCKS; NO closed it.
- PART's actions opened on SAVE (stock's remembered row); LEFT went back, NO closed the window. No PART action run.
- Both removed with a second Keep (`set -- -A,-B --accept`): inventory empty, and FUNC+PART then showed stock's own
  one-column Part Edit popup.

Not tested: FUNC+PASTE+PART, a Lock or Clear applied, playing transport, MKI, a power cycle, sound.

Restyled window, the same day: a development twin of base 0.7.6 booted from RAM as `9173ba81…`, Pattern Sample Locks
`6fea272e…` and Kits `8ce226a5…` as one timed trial (no Keep), rolled back afterwards (inventory empty). Agent's run.

- FUNC+PART draws the window as PROJ draws its menu: the title bar PART EDIT, icons beside PART, LOCKS and KITS, the
  rule, the track strips left and right still showing; compared by screenshot with PROJ on the same unit.
- In LOCKS' actions on CLEAR LOCKS, NO closed the window; FUNC+PART reopened it there (right column, CLEAR LOCKS);
  LEFT went back to the left column; NO closed it. PROJ on the same unit reopened in the SYSTEM list on CARD TOOLS after
  NO, the behaviour this copies.


## 0.1.0-experimental (draft, 16 November 2026)

Assembled and packaged only. Nothing has run on a unit or in the emulator: the base side of `ot_sample_memory` (hook 52), which lends Kits its pages, is not written yet, so the package cannot be installed with pages on any base today.

## Commands and exact revision

Branch `module/kits` on base branch `base/module-bss-cap` at `e39515311` (the `ot_sample_memory` contract; base 0.7.4 allows a module 288 KiB of image and bss).

- `m68k-elf-as -mcpu=5475 kits.s`: 10,548 bytes of code, 196 of data, 38,968 of bss; `m68k-elf-nm -u` lists no undefined symbol.
- `npm run module:dev -- kits --build-only`: package `f1c13a07…` (SHA-256; the same on a rebuild), 10,744 bytes of code and data, 38,968 of bss (49,712 bytes, under the 294,912-byte limit), 294 relocations, 14 hooks (12 base hooks, `module_enc`, the `ot_sample_memory` record), 15 stock-code sites.
- `npm run modules:compat -- --with kits` (with the draft staged, as `module:doctor` stages it): installs beside the 38 active modules and the base; `ot_sample_memory` is then full (room 1).
- `npm run module:doctor -- --draft kits`: the experimental lines are green.
- `python3 -X utf8 -B -m unittest discover -s sdk/tests -p test_battery_ram.py`: green, with Kits' two ranges in `battery-ram.json`.
- The 15 stock sites match a local OS 1.40C byte for byte (upstream's manifest bytes against the image); the manifest keeps only their SHA-256. None overlaps a site of the MIDI Scenes draft.

### The library and the edit pool

octabam's `KIMG` (the kits.work image, 1,622,944 bytes) and `EDREC` (the edit pool's 64 records, 405,632 bytes) were bss. Here they are the 331 pages the base lends: `kits_ready` takes `at` from the `ot_sample_memory` record into `KBASE` and `KBASE + 1,622,944` into `EDBASE`, and every one of upstream's 56 code references in its version-1 build (61 with the MIDI SCENES code) goes through those two longs (46 `KLEA`, 7 `moveal KBASE`, 2 `moveal EDBASE`, 1 `addl KBASE`) (`KLEA off,An` = `moveal KBASE,An` / `lea An@(off),An`, neither of which changes the condition codes; `kit_at` adds `KBASE`; the two `KIMG+12` operands go through `a0` where it is free). Checked by: no `KIMG` or `EDREC` token anywhere in kits.s; `m68k-elf-nm` of the object lists no such symbol and `nm -u` nothing undefined (a reference left behind would assemble as an undefined symbol); upstream's bss with MSCKIT 0 (2,067,544 bytes) minus this port's (38,968) is exactly the two buffers (2,028,576); every `.bss` relocation addend is below the bss size.

## Changed from octabam's module

- The project events come from the base's hooks (runtime.json): ev_banks_load/loaded, ev_bank_load/loaded (the caller tells the loads apart, as STORE's d2 did), ev_project_new, ev_bank_written, ev_project_store/stored, ev_project_reloaded, ev_part_saved, ev_part_clear and ev_modules_ready, through one shim that keeps d2-d7/a2-a6. STORE's file and CRC helpers were already Kits' own.
- STORE's prompt for a refused kits.work (IGNORE, OVERWRITE, BACKUP) is not here: the file is never overwritten and the project plays as stock.
- The library and the edit pool are in borrowed sample memory (above). Until the base writes `at`, Kits is inactive: no hook handler runs, and every detour takes the stock path because READY stays 0.
- At install (ev_modules_ready, the first time `at` is set) the loaded project is read as octabam's power-up load read it: kits.work, else the Octakit import or the migration, then the battery-RAM RESID and ASSIGN. The follow-up load that only a LOAD PROJECT has does not come, so its flag is cleared.
- The battery-RAM copy moved: ASSIGN from 0x100ffe00 (now the base's machine map) to 0x100fbf00; RESID stays at 0x100f85a0. Its sum starts from the project directory's FNV-1a, so a copy left by another project is not applied.
- No MIDI scene locks in a Kit: kits.work version 1 only (octabam's MSCKIT 0 build).
- Part Clear marks the clear only while Kits is READY. In octabam a clear while READY was 0 (a refused kits.work) left the mark set, so the next SAVE KIT after a later load forgot its slot and marked a Kit valid that it never filled; in borrowed sample memory that record can hold anything.
- Not here: the detour on the boot's blank path (modules install after the boot; ev_modules_ready reads that project), and the FUNC+YES quick save (Temp Save patches 0x4005e3d8).
- The LEVEL scroll in the lists answers the core's encoder event (`module_enc`) instead of patching the encoder dispatch call, which the base owns.
- The state moved from `.text` to `.data`.

## Not tested

Everything on a unit and in the emulator: install with and without pages, the migration and the Octakit import, LOAD KIT, SAVE KIT and the name editor, UNDO KIT, FUNC+CUE, the list copy, paste, clear and undo, the LEVEL scroll, pattern changes and chains while playing (with an external clock too), the edit pool, the pattern clipboard, PTN+FUNC+RIGHT, PTN+FUNC+TRIG, the status line, kits.work and kits.strd through a save, a reload and a power cycle, the battery-RAM copy and its project tag, Part Clear, removal, the MKI key map, CPU cost, and running beside MIDI Scenes and Temp Save.

octabam's own results for KITS (its README, "Measured" and "On the unit": under its emulator port and on Sam's MKII, 6 October 2026) are for octabam's image with STORE, not for this package.

## Unit runs, 16 November 2026

Package SHA-256 `f1c13a071b299906…` (b8bd326d8's source), on a development twin of base 0.7.4 with `ot_sample_memory`
(`7250475e`, from `base/module-bss-cap` 0bb47282c), booted from RAM on the owner's MKII, the owner's project loaded.
Each run a 2-minute `device -- try`, rolled back.

- **The borrow.** The base took Kits' 331 pages at install, at once: the pool's `total` (0x80006920) went 10,109 to
  9,778, `used` stayed 258 (the project's samples). After the rollback both read as before, and the list's top
  entries were 10,108 and 10,109 again.
- **Through a project load.** CHANGE to the same project while Kits held its pages: during the load the counters read
  used 0, total 13,458 (13,789 pages less Kits' 331: the base's arena clear kept them out of the fresh list); after it
  used 258 and total 9,778, the list's top entries 9,777, 9,778 then 0, so no page of Kits' run (9,779 to 10,109)
  went back to samples. The load finished with Kits active ("001 ONE" on the status line).
- **On install** Kits wrote its battery record (`KCS1` at 0x100f85a0), the status line read `001 ONE`, and PART opened
  LOAD KIT: UNDO KIT, 001 ONE, 002 TWO, 003 THREE (the project's Parts migrated).
- **CPU.** `device:price` at rest: frame interrupt +0.0, CPU meter +0.1 (A01 playing, 46.7 to 46.8 %). Playing A01
  with Kits installed: CPU meter 46.6 %, frame interrupt 28.6 % (28.5 % without it in an earlier run).
- No crash or stall record was added.
- **In a whole-set trial Kits stays inactive.** Installed as one of 16 packages through `device -- set` (a trial), Kits
  got no pages: the base holds back its engine-task service, ev_modules_ready included, while a set trial is open
  (`modwerk_runtime_set_busy`), so a set becomes live for Kits at Keep. Not changed here.

- **Beside 14 kept modules** (POLY8, FM Synth, Amiga, Repitch, Mute Modes, Euclid, Tape Echo, Mini Verb, E-Verb, Apply
  Scene, Arp Key Locks, Direct Jump, Temp Save, Track Solo; kept for the run, then removed): Kits as a trial took its
  331 pages at once. Six LOAD KIT loads (between Kits 006 and 007) while B16 played, with crossfader sweeps: CPU meter
  48.7 % (at most 49.2), frame interrupt 29.7 %, against 48.4 % and 29.7 % with the 14 alone; no skipped render,
  crash or stall. Bank B's four Parts read the same as before the run afterwards.

Not tested on a unit: SAVE KIT, pattern chains and queued patterns, FUNC+CUE, the list
copy/paste/clear, Part Clear, power cycle (the battery record), Kits beside other active modules, removal with a list
open, the MKI.
