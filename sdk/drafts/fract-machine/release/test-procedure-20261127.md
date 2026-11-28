### Test procedure: fract-machine 0.1.5-experimental, 2026-11-26

Build: revision `6fcbcd3d1142` with uncommitted changes, package `fract015-candidate-release.mwrm` SHA-256 `ee63420569f637d78d3eabba6b209366d76db4a1587e460996cfd1a8b7ff8865`. `npm run test:procedure -- fract-machine --no-unit --no-emulator --package '/private/fract015/fract015-candidate-release.mwrm' --out '/private/fract015/procedure015-software-v2'`, 7 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- --draft fract-machine` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: a draft is judged beside every other module by module:doctor --draft (its compatibility line, step 1) |  |  |
| 3 | Name the build | host | passed |  | logs/03-build.log |
| 4 | DSP cost model | contract | passed | `node scripts/cycle-scan.mjs check` | logs/04-cost-model.log |
| 5 | Emulator rehearsal | emulator | not run: no emulator session: left out with --no-emulator |  |  |
| 6 | Read the unit | unit | not run: left alone with --no-unit | `node scripts/device.mjs status --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-part-state.mjs read --socket /tmp/modwerk-share.sock --out '/private/fract015/procedure015-software-v2/part-start.json'`<br>`node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock` |  |
| 7 | Scripted unit pass | unit | not run: left alone with --no-unit | `npm run device:test -- --share /tmp/modwerk-share.sock --testing-entry '/private/fract015/procedure015-software-v2/device-test.md' '/private/fract015/fract015-candidate-release.mwrm'` |  |
| 8 | Soak | unit | not run: left alone with --no-unit | `node scripts/device.mjs try '/private/fract015/fract015-candidate-release.mwrm' --seconds 420 --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-soak.mjs --seconds 120 --log '/private/fract015/procedure015-software-v2/soak.json'`<br>`node scripts/octatrack-part-state.mjs restore --socket /tmp/modwerk-share.sock --start '/private/fract015/procedure015-software-v2/part-start.json'` |  |
| 9 | Cost on the unit | unit | not run: left alone with --no-unit | `npm run device:price -- --share /tmp/modwerk-share.sock --out '/private/fract015/procedure015-software-v2/price.json' --scene 'the bank, pattern and Part the unit was on, transport stopped (test:procedure)' --curve T1,T3,T6,T7 '/private/fract015/fract015-candidate-release.mwrm'` |  |
| 10 | Put back | unit | not run: left alone with --no-unit | `node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-part-state.mjs restore --socket /tmp/modwerk-share.sock --start '/private/fract015/procedure015-software-v2/part-start.json'` |  |
| 11 | Agent by hand | unit | to do |  |  |
| 12 | Submitter's own stage | unit | to do |  |  |

#### Edge cases for this change

Derive them from what the change touches and run each one (docs/TEST_PROCEDURE.md#edge-cases). A start, from the manifest and the changed files:

- a track machine: the project naming it after it is removed (MISSING); a Part change into a Part that uses it while playing (docs/OCTATRACK_MODULE_EDGE_CASES.md#projects-and-the-installed-modules)
- memory: the module pool nearly full; a delay buffer next to it; the largest set it can join (docs/OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)
- persistence: saved in a Part, then a Part reload, a project reload and a power cycle; removed while a saved Part still names it (docs/OCTATRACK_MODULE_EDGE_CASES.md#copying-and-saving)

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| SIZE/PAN modulation | Retiming and birth gains changed | Independent scalar host cases | pass, software only |
| Native span output/registers | Short-Hann and fit paths changed | 16,384 seeded QEMU spans,4 formats/2 directions | pass, software only |
| LCD clipping/output | Column drawing changed | Full frame/column parity | pass, software only |
| Standalone moving controls | Scheduling peaks | Normal dev a320, A06,120.325s | pass: zero new skips; no analog recording |
| Active4ch USB audio | Shared frame work | Same normal dev bytes,35s recorder | fail:7 new skips in whole trial |
| Current full lifecycle/companions/price matrix | Rebuilt native code | Restart stage1 after remaining failure is fixed | not run: stage1 blocked |
| User listening/Keep/reboot | Exact-version acceptance | After agent stage1 succeeds | not run: stage1 blocked |

#### Left for the submitter at their unit

- how it sounds and plays, and timing by ear
- MIDI, scenes and recording with it
- it beside the other modules installed on their unit
- two instances with different settings, on both FX slots and both DSP cores where it can (docs/MODULE_QUALIFICATION.md)
- Part reload, project save and reload, and a power cycle with it saved: what survives (the Keep and the power cycle are theirs)

#### For the pull request

Not tested on a unit: left alone with --no-unit.
Edge cases: the table above, one row a case (or "Edge cases: none, because …").
