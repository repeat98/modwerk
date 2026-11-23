# Test procedure

Every change to a module or a base, on every machine, goes through these steps, in this order, on one named build. Then it runs the edge cases its own change asks for. The other testing guides hold the detail of each step; this page holds the order.

## Who runs it

**The submitter tests; the reviewer reads.** The author of the change, or their agent, runs the whole procedure on their own unit, the change's own edge cases included, and delivers the record with the pull request (owner, 20 November 2026).

- A reviewer or maintainer reads the record and checks it against the diff: is it on the named build, did the fixed steps run or say why not, do the edge cases match what the diff touches. They are never required to run the procedure, repeat a step or test on their own unit.
- A pull request that changes what runs on an instrument and comes without the record, or with a "not run" that does not say why, goes back to its submitter. The reviewer does not test it in their place.
- A reviewer may still choose to test. The owner's own qualification of a cumulative base before he ships it is his choice, not a duty this procedure puts on him.

```sh
npm run test:procedure -- <module id>          # a module, built from its source
npm run test:procedure -- <module id> --plan   # the steps and their commands, nothing run
npm run test:procedure -- --base               # the Octatrack base, with every USB package
npm run test:procedure -- --base analog-rytm-mkii   # another machine's base: the same steps ([every machine](#every-machine))
npm run test:procedure -- analog-rytm-mkii:temp-save   # machine:id where two machines have a module of that id
```

It runs the steps below with the tools that already do them and stops at the first failure. Without a unit session it records the unit steps as not run, with the command each would have run. It ends with a record for the build: `procedure.md`, a `TESTING.md` entry with an empty edge-case table, and `procedure.json` for programs. A module's automated part takes under a minute without a unit (temp-save, 20 November 2026: 9 to 18 s for steps 1 to 4, 32 s with the emulator) and a few minutes with one.

Options: `--package FILE` tests that package instead of building one, `--published` the catalogue's, `--share SOCKET` names the unit session, `--no-unit` leaves the unit alone, `--emulator-socket SOCK` adds the emulator rehearsal, `--target emulator` runs steps 6 to 10 on an emulator session ([below](#one-set-of-cases-two-targets)), `--out DIR` puts the record there (default: the system's temporary folder), `--soak-seconds` and `--scene` go to the soak and the price. On another machine: `--stock STOCK.syx --elemod BASE.elemod --label XX01` link the test image, `--link` drives the unit over the machine's own link, `--cases DIR` and `--emu DTBOOT` ([every machine](#every-machine)).

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
| 9 | Cost on the unit | unit | `npm run device:price -- --out price.json --curve T1,T3,T6,T7 PKG`; a base: every USB package | at rest at most 0.2 points of the frame interrupt, or the module rests (a machine, or it answers `ev_in_use`); an effect or a machine: its first instance read under 100 % of a frame, and alone on the empty and the medium pattern it is admitted and plays with no dropped render and no stall | `price.json`: frame interrupt, CPU meter, both DSPs, at rest and in use; the curve and the admission run |
| 10 | Put back | unit or emulator | `do inventory` again | equal to step 6 | its log |
| 11 | Agent by hand | unit or emulator | inside a trial (`npm run module:dev -- <id>` or the MCP) | what you saw matches the README | screenshots, captures |
| 12 | Submitter's own stage | unit | their hands and ears | what they report | their words, as they said them |

Each step proves only what it ran. Steps 1 to 5 prove the code paths they exercised, never audio, timing, a saved project or a power cycle. Steps 6 to 11 on the unit are hardware evidence for what they measured, never for the sound or for persistence; on the emulator they are not hardware evidence at all. Step 12 is the developer's.

- **1-2.** The doctor runs the module's host tests, the contract, the performance record and the compatibility lines. A draft is judged beside every other module by the doctor itself.
- **1, a base.** Run it with the m68k-elf toolchain on PATH and the Elekloader checkout `npm run upstream:tools` keeps: without them `sdk:check` skips every package rebuild, as CI's SDK job does, so a stale reviewed recipe goes unseen. A failure there is the change's to fix, not the computer's (20 November 2026: Tape Echo's and Euclid's standalone recipes had gone stale on main).
- **3. A rebuild starts again at step 1.** The record names the source revision (and says when the tree had uncommitted changes) and the package's SHA-256. Every later result is about this build only. A draft DSP module with no published figures is built with the builder's placeholders (600 modeled cycles, buffer 0), which the loader refuses at verify with refusal 6, `RUNTIME_CYCLES` (Ghost Cut, 21 November 2026), and the runner takes no figures. Build it yourself with the measured ones and hand it over: `npm run module:dev -- <id> --build-only --cycles N --cycles-kind modeled --state N --buffer N --out PKG`, then `--package PKG`. `--buffer` is the Y words of the slot buffer the effect reads.
- **4.** The check fails a cycle-scan record whose module source changed since its scan. After changing a module's DSP code, scan it again on a computer with the scan's tools: `node scripts/cycle-scan.mjs record <id>` ([sdk/cycle-scan](../sdk/cycle-scan/README.md), [MODULE_PERFORMANCE.md](MODULE_PERFORMANCE.md)).
- **5.** Start `ot_emu` with `--usb-host SOCK` on a development twin of the base, from [the adapted emulator builder](../scripts/octatrack-emulator/build.py) (the plain port refused the trial with loader refusal 5, 20 November 2026). A ColdFire module needs no `--dsp`, which runs about ten times faster; give the base 20 s after the socket appears. Or run steps 6 to 10 there instead, through `npm run device:emulator` ([below](#one-set-of-cases-two-targets)). What passes here can still fail on the unit: read [what `ot_emu` does not show](OCTATRACK_HARDWARE_TRAPS.md#the-emulator-and-the-tools). Build the twin with `build_core.py --dev` and the beta flags; on main it links only with `--resident-stock-hooks --resident-on-demand` among them, and without them stops at "Core has unexpected unresolved imports" (the arena, bss and run symbols and the `ev_` hooks). This set linked on 21 November 2026: `--dsp-loader --dev --usb-midi --packaged-usb-audio --site-events --table-owners sdk/machines/octatrack/module-adapters/table-owners.json --resident-stock-hooks --resident-on-demand --cached-modules --module-sets --sample-editor --module-ui-roots --part-menu`, with `ELEKLOADER_DSP_ASM` naming `dsp_asm` in the `dsp56300` build tree and `dsp56kDisassemble` built beside it.
- **6-10.** The unit steps go through the device commands and keep [the driving rules](OCTATRACK_DRIVING.md): a development base, transport stopped, a bank and Part whose working copy equals its saved one. Nothing is kept: every install is a trial that rolls back. The runner takes the unit for steps 6 to 10 as one turn of [the unit queue](OCTATRACK_DRIVING.md#taking-turns-on-the-unit) (`npm run unit -- run`), and the device commands inside it do not queue again; an emulator target takes no turn.
- **8.** The fast seeded soak needs the MIDI bridge on the computer the unit is plugged into (`scripts/octatrack-midi-bridge.py`) and the project's MIDI receive settings ([A fast soak](OCTATRACK_DRIVING.md)). A failure prints the seed and a log that replays it (`--replay FILE`). In a checkout without `scripts/octatrack-soak.mjs`, a module soaks inside step 7 (`device:test --soak 120`) instead.
- **9.** "At rest" is the module installed and used nowhere: what every player pays for having it. The figure is `device:price`'s at-rest reading: the share of the frame interrupt (`guard`, 8 s) the module adds while the selected pattern plays with sounding sample tracks, installed and used nowhere, against the same scene without it, on a development twin of the base it is released for. It is the one measure the limit is judged on: a machine's render price or a figure from another tool is not compared with it, and the record (`evidence/cpu-price.json`) names its base and scene. Above 0.2 points the module must rest: a machine does by itself, any other module answers `ev_in_use` and marks its frame detours `"rests"`, and `module:doctor` fails a release from 20 November 2026 that does neither (`AT_REST_LIMIT` and `AT_REST_FROM` in `scripts/module-cpu-price.mjs`, both the owner's to change). Judge both figures against [MODULE_PERFORMANCE.md](MODULE_PERFORMANCE.md); a base-bound package is left out, since a development twin does not trust it. An effect or a machine is then placed on one to four empty tracks for its instance curve, and picked alone on the empty pattern (`--pick-pattern`, 2) and the medium one (`--measure-pattern`, 1) after each has played: a refusal, a dropped render, a stall, or a first reading past 100 % of a frame fails the step, and a release from 24 November 2026 needs the same in its `evidence/frame-cost.json` ([what a release measures](MODULE_PERFORMANCE.md#measure-a-module)). The test bank therefore needs an empty pattern and a medium one (a trig every four steps on six tracks, two playing samples) with T1, T3, T6 and T7 free.
- **11.** Reach every control and screen by the README's button steps and take a `png:` screenshot of each. Record MAIN and CUE over USB with a sustained sound and look for runs of exact zeros or a block played twice. Then Undo and check the inventory again ([/modwerk-test-on-unit](../.claude/skills/modwerk-test-on-unit/SKILL.md)).
- **12.** The developer here is the submitter: the person whose agent ran steps 1 to 11, at their own unit, not a reviewer. Only after 1 to 11 passed on this build. Give the developer the button steps and what they should see or hear for each item the record lists: the sound, timing by ear, MIDI and scenes, two instances, Part and project reload, the Keep and the power cycle. On a contributor's unit the Keep, the power cycle, a flash and listening are theirs, and the agent asks for each run; on the owner's computer agents need no OK for trials, RAM boots of development builds or a Keep a test needs, and never ask him for a card, while flashing and power cycles stay his ([owner operations](OWNER_OPERATIONS.md)). A fault they find is fixed, and the procedure starts again on the new build.

A machine without a USB link runs the steps its tools reach, and the record lists the rest as not run with what is missing; step 12 then carries all the hardware evidence ([every machine](#every-machine)).

## What a release measures

Every release of an Octatrack module proves these on a unit, on the version it ships (owner, 23 November 2026). `module:doctor` and `modules:check` refuse a release dated from 24 November 2026 without them, whenever its module was first listed; step 9 runs the unit part.

| Figure | What it is | Command | Record |
| --- | --- | --- | --- |
| Idle | what it adds installed and used nowhere | `device:price --write` | `evidence/cpu-price.json` (`atRest`) |
| Mean | its CPU price: the frame interrupt's share in use | `device:price --write`; a machine with `guard` (below) | `resources.cpuPrice` |
| DSP | both cores' load in use, for a module with DSP code | `device:price --write` | `evidence/cpu-price.json` (`inUse.dsp1to4`, `dsp5to8`) |
| Curve | the longest frame with 1 to 4 instances: `first`, `each`, `rest` | `device:price --write --curve` | `evidence/frame-cost.json` |
| Admission | alone on an empty and on a medium pattern: admitted, then played with no dropped render and no stall | the same run | `evidence/frame-cost.json` (`admission`) |
| Worst case | worst-case cycles, a stock benchmark and a stress run | `perf:audit` | `evidence/performance.json` |

Three rules close what earlier releases slipped through. A price record names the version it was read on, and a release takes no other's (Tape Echo 0.1.9 carried 0.1.6's). A curve's first reading must stay under 100 % of a frame: past it the guard drops renders, so the figure is the overload and not the module (FM Synth 0.1.5's read 107.9 %); read it on a pattern with room (`--measure-pattern`). And a machine's price is the whole track, the machine against the same trigs on the track's own sample, never its trigs against none on a machine that is already running: that comparison cancels the engine's cost (FM Synth 0.1.5 read 3.2 points that way).

A module that is refused alone on the medium pattern, or drops a render there, does not ship until it is cheaper or the owner decides otherwise for that version.

## Every machine

The steps, their order and the record are the same on every machine. Each step runs the machine's own tool where it has one (`MACHINE_STEPS` in [the runner](../scripts/test-procedure.mjs)); where it has none, the record says "not run" and what is missing, so the gap stays in sight until the machine's next piece fills it ([where each machine stands](MACHINE_RECIPE.md#where-each-machine-stands)). A tool added for a machine fills its row here and in `MACHINE_STEPS` in the same pull request.

| # | Octatrack | Analog Rytm MKII | Every other machine |
|---|---|---|---|
| 1 | `module:doctor`; a base: `sdk:check` | the same | the same |
| 2 | `modules:compat` | not yet: link the image beside the modules it must work with (the link refuses two on one site) | not yet, as the Rytm |
| 3 | `module:dev`; a base: its `.elemod` | `link-image.mjs` from `--stock`, `--elemod` (a development base: `machine:base -- analog-rytm-mkii --stock STOCK.syx --dev --out DIR`) and `--label`; or `--package IMAGE.syx` | an elemod machine as the Rytm; otherwise `--package FILE` |
| 4 | `cycle-scan.mjs check` | not run: the scan models the Octatrack's DSP | not run |
| 5 | `ot_emu` (`--emulator-socket`) | `rytm_test.py emu` with `--emu DTBOOT` or `RYTM_EMU` | not yet |
| 6, 10 | `device.mjs status`, `do inventory` | `rytm_link.py ident`: the flashed label is unchanged at the end | not yet: no USB link |
| 7 | `device:test`; a base: `device.mjs set` | `rytm_link.py ramboot`, then `rytm_test.py unit` with the module's cases (a base: the link's own) | not yet |
| 8 | `octatrack-soak.mjs` | not yet | not yet |
| 9 | `device:price` | by hand: the audio load (`core_audio_load`) with and without the change | not yet |
| 11, 12 | by hand, then the submitter | the same | the same |

- **Rytm unit steps** run only with `--link`, in a scratch project with REMOTE CTRL armed on a development base ([LINK.md](../sdk/machines/analog-rytm-mkii/LINK.md)). The RAM boot writes nothing to the flash and restarts the unit, so on a contributor's unit say so and get their OK first; their power cycle brings the flashed base back. Cases live in [`tools/cases/<id>/`](../sdk/machines/analog-rytm-mkii/tools/cases/README.md) and may change the saved state ([TEST_RUNNER.md](../sdk/machines/analog-rytm-mkii/TEST_RUNNER.md)); a module without them records step 7 as not run until they are written.
- **A base on another machine** is tested on an image linked from its development base with the set it is tested beside: link it with `--module` for each and pass it as `--package`, or the runner links the base alone. `--target emulator` is the Octatrack's session switch; elsewhere the emulator is step 5.

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

An effect can be picked on a track there, but its cost cannot be judged. Up to base 0.7.13 the CPU meter read 1000 per mille from boot on a development twin under `ot_emu`, with and without `--dsp`, so the busy-unit guard refused every pick of a module's effect with CPU FULL, and `device:test`'s picks failed for any effect (21 November 2026). From 0.8 picks are judged by the frame share ([performance](MODULE_PERFORMANCE.md)), and they go through under `ot_emu`, but only because nothing is measured: on a 0.8 twin with `--dsp` and no project loaded, Mini Verb's pick on T1 FX2 ran 112 ms after YES, while `guard` counted no frames and every render read 0.0, and `stats` still read 1000 per mille (23 November 2026). The meter is the share of DTIM3 counts main spends in `status.s`'s idle spin, and the adapted emulator skips that spin as idle, so it never counts. So the emulator can try a pick but not judge its cost. For an effect the emulator still runs the trial install, the loader's verify, the Part switches and the rollback. Its sound and its cost go to the `dsp_host` render gates and the unit.

## What a base adds

A base carries every installed module, so it is tested as a set ([Change a base](DEVELOPER_WORKFLOW.md#change-a-base)). Each submitter lists pending tests on the machine’s cumulative draft, runs them on their own unit and adds the results there before release.

- step 1 is the SDK suite and step 2 every module against every other;
- step 7 installs every USB package in one whole-set trial (a base with feature 512), and Undo must bring back the starting inventory and active identity (step 10); on another machine it runs the image linked with the set;
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
- **The pull request:** the record's last lines, "Tested on a unit: …" (or "Not tested on a unit: why") and the edge-case table under a line "Edge cases". A ready pull request that changes a `.mwrm`, `.elemod` or `.ZDL` file fails its description check without both ([the check](../scripts/pr-body.mjs)). A draft may still be in test, so it needs no unit line yet, but it lists its edge cases from the start, each "not run: why" until it ran. For base work, keep this table on the machine’s cumulative draft.

"Not tested" is a valid result, and it stays visible. An emulator result never counts as hardware evidence. A tester's report stays labelled as reported.
