# Test procedure

Every change to a module or a base goes through these steps, in this order, on one named build. Then it runs the edge cases its own change asks for. The other testing guides hold the detail of each step; this page holds the order.

## Who runs it

**The submitter tests; the reviewer reads.** The author of the change, or their agent, runs the whole procedure on their own unit, the change's own edge cases included, and delivers the record with the pull request (owner, 20 November 2026).

- A reviewer or maintainer reads the record and checks it against the diff: is it on the named build, did the fixed steps run or say why not, do the edge cases match what the diff touches. They are never required to run the procedure, repeat a step or test on their own unit.
- A pull request that changes what runs on an instrument and comes without the record, or with a "not run" that does not say why, goes back to its submitter. The reviewer does not test it in their place.
- A reviewer may still choose to test. The owner's own qualification of a cumulative base before he ships it is his choice, not a duty this procedure puts on him.

```sh
npm run test:procedure -- <module id>          # a module, built from its source
npm run test:procedure -- <module id> --plan   # the steps and their commands, nothing run
npm run test:procedure -- --base               # the Octatrack base, with every USB package
```

It runs the steps below with the tools that already do them and stops at the first failure. Without a unit session it records the unit steps as not run, with the command each would have run. It ends with a record for the build: `procedure.md`, a `TESTING.md` entry with an empty edge-case table, and `procedure.json` for programs. A module's automated part takes under a minute without a unit (temp-save, 20 November 2026: 9 to 18 s for steps 1 to 4, 32 s with the emulator) and a few minutes with one.

Options: `--package FILE` tests that package instead of building one, `--published` the catalogue's, `--share SOCKET` names the unit session, `--no-unit` leaves the unit alone, `--emulator-socket SOCK` adds the emulator rehearsal, `--target emulator` runs steps 6 to 10 on an emulator session ([below](#one-set-of-cases-two-targets)), `--out DIR` puts the record there (default: the system's temporary folder), `--soak-seconds` and `--scene` go to the soak and the price.

## The steps

Every step applies to modules and bases alike; what differs for a base is in each row and [below](#what-a-base-adds).

For a ColdFire track machine, leave grid and live recording off. Step 7 records the longest sequenced render on T1 and T5. On hardware it also measures the increase in the frame interrupt’s mean share when the selected machine is triggered. With transport stopped, it takes one six-second quiet reading and a second six-second reading with panel auditions four times per second. Each starts a fresh `guard` window. A mean increase above the machine’s declared price fails this check. A skipped track remains a trial failure. This measures the tested settings. The release price uses the fully voiced, every-step pattern in [Module performance](MODULE_PERFORMANCE.md).

| # | Step | Layer | Command | Passes when | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | `npm run module:doctor -- <id>` (a draft: `--draft <id>`); a base: `npm run sdk:check` | green | its log |
| 2 | Beside every other module | contract | `npm run modules:compat -- <id>`; a base: `npm run modules:compat` | 0 problems | its log |
| 3 | Name the build | host | `npm run module:dev -- <id> --build-only`; a base: its `.elemod` | a package exists | revision and SHA-256 |
| 4 | DSP cost model | contract | `node scripts/cycle-scan.mjs check` | every record current | its log |
| 5 | Emulator rehearsal | emulator | `node scripts/device.mjs try PKG --emulator --socket SOCK`; a base: `set` with every package | the trial rolls back with no fault logged | its log, labelled emulator |
| 6 | Read the unit | unit or emulator | `node scripts/device.mjs status` and `do inventory` on the session | it answers | the starting inventory |
| 7 | Scripted unit pass | unit or emulator | `npm run device:test -- --testing-entry FILE PKG`; a base: `node scripts/device.mjs set A,B,… --seconds 30`, every USB package at once | no crash, stall, freeze or skipped track; the set rolls back | `device-test.md`, its log |
| 8 | Soak | unit or emulator | `node scripts/octatrack-soak.mjs`, a module inside a trial of its own | no new crash, stall or frozen frame | `soak.json` |
| 9 | Cost on the unit | unit | `npm run device:price -- --out price.json PKG`; a base: every USB package | it reads | `price.json`: frame interrupt, CPU meter, both DSPs, at rest and in use |
| 10 | Put back | unit or emulator | `do inventory` again | equal to step 6 | its log |
| 11 | Agent by hand | unit or emulator | inside a trial (`npm run module:dev -- <id>` or the MCP) | what you saw matches the README | screenshots, captures |
| 12 | Submitter's own stage | unit | their hands and ears | what they report | their words, as they said them |

Each step proves only what it ran. Steps 1 to 5 prove the code paths they exercised, never audio, timing, a saved project or a power cycle. Steps 6 to 11 on the unit are hardware evidence for what they measured, never for the sound or for persistence; on the emulator they are not hardware evidence at all. Step 12 is the developer's.

- **1-2.** The doctor runs the module's host tests, the contract, the performance record and the compatibility lines. A draft is judged beside every other module by the doctor itself.
- **1, a base.** Run it with the m68k-elf toolchain on PATH and the Elekloader checkout `npm run upstream:tools` keeps: without them `sdk:check` skips every package rebuild, as CI's SDK job does, so a stale reviewed recipe goes unseen. A failure there is the change's to fix, not the computer's (20 November 2026: Tape Echo's and Euclid's standalone recipes had gone stale on main).
- **3. A rebuild starts again at step 1.** The record names the source revision (and says when the tree had uncommitted changes) and the package's SHA-256. Every later result is about this build only.
- **4.** The check fails a cycle-scan record whose module source changed since its scan. After changing a module's DSP code, scan it again on a computer with the scan's tools: `node scripts/cycle-scan.mjs record <id>` ([sdk/cycle-scan](../sdk/cycle-scan/README.md), [MODULE_PERFORMANCE.md](MODULE_PERFORMANCE.md)).
- **5.** Start `ot_emu` with `--usb-host SOCK` on a development twin of the base, from [the adapted emulator builder](../scripts/octatrack-emulator/build.py) (the plain port refused the trial with loader refusal 5, 20 November 2026). A ColdFire module needs no `--dsp`, which runs about ten times faster; give the base 20 s after the socket appears. Or run steps 6 to 10 there instead, through `npm run device:emulator` ([below](#one-set-of-cases-two-targets)). What passes here can still fail on the unit: read [what `ot_emu` does not show](OCTATRACK_HARDWARE_TRAPS.md#the-emulator-and-the-tools).
- **6-10.** The unit steps go through the device commands and keep [the driving rules](OCTATRACK_DRIVING.md): a development base, transport stopped, a bank and Part whose working copy equals its saved one. Nothing is kept: every install is a trial that rolls back. The runner takes the unit for steps 6 to 10 as one turn of [the unit queue](OCTATRACK_DRIVING.md#taking-turns-on-the-unit) (`npm run unit -- run`), and the device commands inside it do not queue again; an emulator target takes no turn.
- **8.** The fast seeded soak needs the MIDI bridge on the computer the unit is plugged into (`scripts/octatrack-midi-bridge.py`) and the project's MIDI receive settings ([A fast soak](OCTATRACK_DRIVING.md)). A failure prints the seed and a log that replays it (`--replay FILE`). In a checkout without `scripts/octatrack-soak.mjs`, a module soaks inside step 7 (`device:test --soak 120`) instead.
- **9.** "At rest" is the module installed and used nowhere: what every player pays for having it. Judge both figures against [MODULE_PERFORMANCE.md](MODULE_PERFORMANCE.md); a base-bound package is left out, since a development twin does not trust it.
- **11.** Reach every control and screen by the README's button steps and take a `png:` screenshot of each. Record MAIN and CUE over USB with a sustained sound and look for runs of exact zeros or a block played twice. Then Undo and check the inventory again ([/modwerk-test-on-unit](../.claude/skills/modwerk-test-on-unit/SKILL.md)).
- **12.** The developer here is the submitter: the person whose agent ran steps 1 to 11, at their own unit, not a reviewer. Only after 1 to 11 passed on this build. Give the developer the button steps and what they should see or hear for each item the record lists: the sound, timing by ear, MIDI and scenes, two instances, Part and project reload, the Keep and the power cycle. On a contributor's unit the Keep, the power cycle, a flash and listening are theirs, and the agent asks for each run; on the owner's computer agents need no OK for trials, RAM boots of development builds or a Keep a test needs, and never ask him for a card, while flashing and power cycles stay his ([owner operations](OWNER_OPERATIONS.md)). A fault they find is fixed, and the procedure starts again on the new build.

A machine without a USB link runs steps 1 to 3 and its emulator; step 12 then carries all the hardware evidence ([/modwerk-test-on-unit](../.claude/skills/modwerk-test-on-unit/SKILL.md)).

## The layers

**Prove each claim on the lowest layer that can prove it.** The emulator and the unit are slow and scarce: keep them for what the layers below cannot show. A check that a host test or the contract already makes is not repeated per module in the emulator or on the unit.

| Layer | What it proves | Steps | How fast |
|---|---|---|---|
| host | the module's own code and the shared code, against fakes: the module's `test_*.py`, its `dsp_host` render gate, the SDK's loader and runtime tests | 1, 3 | seconds |
| contract | what every module shares, checked once for all of them from their declarations | 2, 4 (and CI's package rebuild) | seconds |
| emulator | the code paths that ran on the real stock code: install, run, rollback, screens | 5, or 6 to 11 with `--target emulator` | minutes; `ot_emu` runs below real time with `--dsp`, about ten times faster without |
| unit | timing, load, audio, USB, persistence, what a person hears | 6 to 12 | minutes, one session at a time |

**The contract covers these; do not test them again per module:**

- installing beside every other active module and the base: no two modules claim the same stock site, FX id, DSP hook, private Y range, buffer region, data range, key gesture or stock screen unless the base owns the site or the module declares the conflict (`modules:compat`, step 2);
- the manifest, version, catalogue pin, release notes, documentation, screenshots, resource gauges and qualification record (`modules:check`, in step 1 and CI's `module-contract` job);
- that the committed packages rebuild byte for byte from source (CI's `octatrack-source` job), and that a cycle-scan record matches the source it scanned (step 4);
- the loader's install, replace, remove, Undo and rollback, and the restoring of every patched site after removal: shared base code, tested once in the SDK suite and in the emulator's `sites` scenario (`scripts/verify-octatrack-dsp-loader.mjs`), not per module.

**A module still proves on its own:** its own code (host tests, the render gate, its cycles), its controls and screens against its README, what it does at its own sites with stock running (step 7 and by hand), its cost (step 9), and the edge cases its change creates.

## One set of cases, two targets

Steps 6 to 10 talk to a session, not to a device. `npm run device -- serve --share SOCK` opens one link and shares it; `device:test`, `device.mjs` and the MCP drive the session. `npm run device:emulator` starts the same session on `ot_emu` and runs a command inside it:

```sh
npm run device:emulator -- --image MAIN.raw --emulator OT_EMU -- npm run test:procedure -- <module id>
```

`MAIN.raw` is a development twin of the base, `OT_EMU` the [adapted build](../scripts/octatrack-emulator/build.py) (or set `MODWERK_OT_EMU`). The session ties the emulator's time to the wall clock (`ot_emu --interactive` with `pace on`), so every wait and timeout in `device:test` means the same as on the unit and nothing in it changes for the unit. (In batch mode the bench holds the emulator's time while its client waits, so a wait there passes no emulated time; `--dsp-rt` needs `--interactive`, and that needs `pace on` before the bench answers.) Inside the session the runner targets the emulator by itself (`--target emulator` does it by hand): every result is labelled emulator, the unit queue is left alone, the soak and step 9 are not run (no MIDI port; the emulator's load figures are not the unit's), and the record never gets a "Tested on a unit" line. The switch runs the same cases on both targets; it never replaces the unit.

On 20 November 2026 temp-save ran this way end to end in 101 s (73 s of procedure, 61 s of them `device:test`): the trial, 12 of 12 Part switches, the knob sweeps, Undo and the inventory unchanged. Without `--dsp` the emulator's DSP frames stand still, so `device:test` lists its frame checks, the queued bank change and the self-test as not run there; with `--dsp` the frames did not advance under `pace on` either, which is the emulator's limit, not a step to fake.

## What a base adds

A base carries every installed module, so it is tested as a set ([Change a base](DEVELOPER_WORKFLOW.md#change-a-base)). Each submitter runs these for their own change, on their own unit, before it joins the machine's cumulative draft, and adds their record to it:

- step 1 is the SDK suite and step 2 every module against every other;
- step 7 installs every USB package in one whole-set trial (a base with feature 512), and Undo must bring back the starting inventory and active identity (step 10);
- step 9 prices every package at rest on the new base, the figure a base change can move for everyone;
- by hand: RAM boot the development build of the candidate, run the steps, RAM boot back to the starting base, and check its modules came back. Nothing is kept by a RAM boot. On a contributor's unit say beforehand how many restarts are coming and get their OK for the run; on the owner's computer it stands. A flash or a power cycle is always the unit owner's;
- the record goes to `docs/verification/<YYYY-MM-DD>-<topic>.md` and the machine's cumulative draft. That draft stays a draft until the base has been tested extensively on a unit, through the records its submitters bring; only the owner marks it ready and merges it.

## Edge cases

Every change also runs the edge cases it creates. The steps above test what every change shares; these test what this change touched. Derive them before you test, run each one, and record each one.

1. **List what the change touches.** Read the diff, not the description. For each item, name the kind:
   - a hook or stock site, and who else uses it (another module, the base);
   - a page, a menu row or a key gesture, and the windows it can be pressed in;
   - memory: the module pool, a delay buffer, DSP words, battery RAM;
   - timing: tempo, track speed, swing, pattern and bank changes, the arranger;
   - persistence: the Part, the project, the card's set, battery RAM;
   - the loader: install, replace, remove, Undo, a refused set, a trial that expires;
   - the USB link, load and admission (the CPU meter, the guard), boot and the restore.
2. **Find its boundaries and its neighbours.** Boundaries: the smallest and largest value, empty and full, the first and last track, one instance and eight, both FX slots and both DSP cores, MKI and MKII. Neighbours: what runs beside it at the moment it changes (a Part change while playing, the trial's end, Undo, a power cycle) and the modules that share its hook, gesture or memory.
3. **Seed the list** from what has gone wrong before. The record suggests a start from the manifest and the changed files:

   | It touches | Start from |
   |---|---|
   | an effect slot | two instances, both slots, both cores ([qualification](MODULE_QUALIFICATION.md#essential-persistence-and-instance-checks--8-october-2026)) |
   | a key gesture or a page | [key gestures in windows](OCTATRACK_MODULE_EDGE_CASES.md#key-gestures-in-windows); a page open when the trial ends |
   | a project, Part or save | [projects](OCTATRACK_MODULE_EDGE_CASES.md#projects-and-the-installed-modules), [copying and saving](OCTATRACK_MODULE_EDGE_CASES.md#copying-and-saving), [boot and power](OCTATRACK_MODULE_EDGE_CASES.md#boot-and-power) |
   | playback | [while playing](OCTATRACK_MODULE_EDGE_CASES.md#while-playing), [sequencing](module-guides/sequencing.md) |
   | stock code | [patching stock code](OCTATRACK_HARDWARE_TRAPS.md#patching-stock-code) |
   | DSP code or load | [the DSP loader](OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code), [ColdFire and DSP load](OCTATRACK_HARDWARE_TRAPS.md#coldfire-and-dsp-load) |
   | the USB link | [USB and EP0](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0) |
   | RAM boot, NOR, cold starts | [RAM boot](OCTATRACK_HARDWARE_TRAPS.md#ram-boot), [cold starts](OCTATRACK_HARDWARE_TRAPS.md#cold-starts-and-card-writes) |

4. **Run each case** on the unit when it depends on the instrument, in the emulator only to rehearse it. A case only the developer can judge (a sound, a power cycle) goes to them with its steps.
5. **Record each case** in one row of the record's table, in the pull request and in `TESTING.md`:

   | Case | Why this change makes it a risk | How run | Result |
   |---|---|---|---|
   | (an example) two instances, on FX2 of T1 and T5 | the change moved the state block | `npm run device -- do 'pick:T1:FX2:… pick:T5:FX2:… stats'` during the trial | pass |

   The result is `pass`, `fail: what happened` or `not run: why`. A case not run stays in the table.

When the change cannot behave differently on an instrument (a package rebuilt to the same bytes, say), write `Edge cases: none, because …` instead.

## Where the record goes

- **A module:** `procedure.md` with the edge-case table filled in, as an entry in the module's `TESTING.md`, followed by the submitter's own results apart from their agent's.
- **A base:** a dated record in `docs/verification/`, linked from the cumulative draft's description.
- **The pull request:** the record's last lines, "Tested on a unit: …" (or "Not tested on a unit: why") and the edge-case table under a line "Edge cases". A ready pull request that changes a `.mwrm`, `.elemod` or `.ZDL` file fails its description check without both ([the check](../scripts/pr-body.mjs)). A draft may still be in test, so it needs no unit line yet, but it lists its edge cases from the start, each "not run: why" until it ran. Pull requests into a cumulative `base/<machine>-next` draft are checked the same way.

"Not tested" is a valid result, and it stays visible. An emulator result never counts as hardware evidence. A tester's report stays labelled as reported.
