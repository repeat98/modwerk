### Test procedure: seq 0.1.0-experimental, 2026-11-26

Build: revision `69ce65cf0e26`, package `seq.mwrm` SHA-256 `880a54b116acd605f4efcd31113024b7520c28118f6b7166e49428058aba2b26`. `npm run test:procedure -- seq --share /tmp/modwerk-share.sock --no-emulator --out /tmp/seq-proc --scene 'author'\''s project, A02, Part 1, stopped' --price-base 'twin 4c7eb79b, MKII'`, 288 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- --draft seq` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: a draft is judged beside every other module by module:doctor --draft (its compatibility line, step 1) |  |  |
| 3 | Name the build | host | passed | `npm run module:dev -- seq --build-only --out /tmp/seq-proc/seq.mwrm` | logs/03-build.log |
| 4 | DSP cost model | contract | passed | `node scripts/cycle-scan.mjs check` | logs/04-cost-model.log |
| 5 | Emulator rehearsal | emulator | not run: no emulator session: left out with --no-emulator |  |  |
| 6 | Read the unit | unit | passed: Part 1 on A02: working = saved, saved once so that RELOAD works at the end | `node scripts/device.mjs status --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-part-state.mjs read --socket /tmp/modwerk-share.sock --out /tmp/seq-proc/part-start.json`<br>`node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock` | logs/06-unit-read.log |
| 7 | Scripted unit pass | unit | passed | `npm run device:test -- --share /tmp/modwerk-share.sock --testing-entry /tmp/seq-proc/device-test.md /tmp/seq-proc/seq.mwrm` | logs/07-unit-pass.log |
| 8 | Soak | unit | passed: Part 1 on A02: Part 1 on A02 reloaded; working = saved | `node scripts/device.mjs try /tmp/seq-proc/seq.mwrm --seconds 420 --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-soak.mjs --seconds 120 --programs 0-3 --log /tmp/seq-proc/soak.json`<br>`node scripts/octatrack-part-state.mjs restore --socket /tmp/modwerk-share.sock --start /tmp/seq-proc/part-start.json` | logs/08-soak.log |
| 9 | Cost on the unit | unit | passed | `npm run device:price -- --share /tmp/modwerk-share.sock --out /tmp/seq-proc/price.json --scene 'author'\''s project, A02, Part 1, stopped' --curve T1,T3,T6,T7 /tmp/seq-proc/seq.mwrm` | logs/09-cost-unit.log |
| 10 | Put back | unit | passed: Part 1 on A02: back on A02 from A01; working = saved | `node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-part-state.mjs restore --socket /tmp/modwerk-share.sock --start /tmp/seq-proc/part-start.json` | logs/10-restore.log |
| 11 | Agent by hand | unit | to do |  |  |
| 12 | Submitter's own stage | unit | to do |  |  |

#### Edge cases for this change

Derive them from what the change touches and run each one (docs/TEST_PROCEDURE.md#edge-cases). A start, from the manifest and the changed files:

- a key gesture: the gesture in menus, SETUP pages, dialogs and the message box; a quick second press; a module holding a neighbouring gesture (docs/OCTATRACK_MODULE_EDGE_CASES.md#key-gestures-in-windows)
- a page of its own: the page open when the trial ends or Undo runs; the page open during a Part or bank change (docs/OCTATRACK_DRIVING.md)
- a track machine: the project naming it after it is removed (MISSING); a Part change into a Part that uses it while playing (docs/OCTATRACK_MODULE_EDGE_CASES.md#projects-and-the-installed-modules)
- memory: the module pool nearly full; a delay buffer next to it; the largest set it can join (docs/OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)
- persistence: saved in a Part, then a Part reload, a project reload and a power cycle; removed while a saved Part still names it (docs/OCTATRACK_MODULE_EDGE_CASES.md#copying-and-saving)
- the loader: install, replace, remove and Undo; a set the base refuses rolls back whole; the pool full; a trial that expires with a page open (docs/OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| | | | |

#### Left for the submitter at their unit

- how it sounds and plays, and timing by ear
- MIDI, scenes and recording with it
- it beside the other modules installed on their unit
- two instances with different settings, on both FX slots and both DSP cores where it can (docs/MODULE_QUALIFICATION.md)
- Part reload, project save and reload, and a power cycle with it saved: what survives (the Keep and the power cycle are theirs)

#### For the pull request

Tested on a unit: package 880a54b116ac, <model and OS>, test:procedure steps 6, 7, 8, 9, 10; the developer's stage <done or not yet>.
Edge cases: the table above, one row a case (or "Edge cases: none, because …").
