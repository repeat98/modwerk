### Test procedure: clyps, 2026-11-23

Build: revision `613db9857006`, no package named. `npm run test:procedure -- clyps --no-unit --out sdk/drafts/clyps/evidence/procedure-nov23/host`, 2 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | **failed**: exit 1: npm run module:doctor -- --draft clyps | `npm run module:doctor -- --draft clyps` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: stopped: step 1 (Software checks) failed |  |  |
| 3 | Name the build | host | not run: stopped: step 1 (Software checks) failed | `npm run module:dev -- clyps --build-only --out 'sdk/drafts/clyps/evidence/procedure-nov23/host/clyps.mwrm'` |  |
| 4 | DSP cost model | contract | not run: stopped: step 1 (Software checks) failed | `node scripts/cycle-scan.mjs check` |  |
| 5 | Emulator rehearsal | emulator | not run: stopped: step 1 (Software checks) failed |  |  |
| 6 | Read the unit | unit | not run: stopped: step 1 (Software checks) failed | `node scripts/device.mjs status --socket /tmp/modwerk-share.sock`<br>`node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock` |  |
| 7 | Scripted unit pass | unit | not run: stopped: step 1 (Software checks) failed | `npm run device:test -- --share /tmp/modwerk-share.sock --testing-entry 'sdk/drafts/clyps/evidence/procedure-nov23/host/device-test.md' 'sdk/drafts/clyps/evidence/procedure-nov23/host/clyps.mwrm'` |  |
| 8 | Soak | unit | not run: stopped: step 1 (Software checks) failed | `node scripts/device.mjs try 'sdk/drafts/clyps/evidence/procedure-nov23/host/clyps.mwrm' --seconds 420 --socket /tmp/modwerk-share.sock`<br>`node scripts/octatrack-soak.mjs --seconds 120 --log 'sdk/drafts/clyps/evidence/procedure-nov23/host/soak.json'` |  |
| 9 | Cost on the unit | unit | not run: stopped: step 1 (Software checks) failed | `npm run device:price -- --share /tmp/modwerk-share.sock --out 'sdk/drafts/clyps/evidence/procedure-nov23/host/price.json' --scene 'the bank, pattern and Part the unit was on, transport stopped (test:procedure)' --curve T1,T3,T6,T7 'sdk/drafts/clyps/evidence/procedure-nov23/host/clyps.mwrm'` |  |
| 10 | Put back | unit | not run: stopped: step 1 (Software checks) failed | `node scripts/device.mjs do inventory --socket /tmp/modwerk-share.sock` |  |
| 11 | Agent by hand | unit | not run: stopped: step 1 (Software checks) failed |  |  |
| 12 | Submitter's own stage | unit | not run: stopped: step 1 (Software checks) failed |  |  |

#### Edge cases for this change

Derive them from what the change touches and run each one (docs/TEST_PROCEDURE.md#edge-cases). A start, from the manifest and the changed files:

- persistence: saved in a Part, then a Part reload, a project reload and a power cycle; removed while a saved Part still names it (docs/OCTATRACK_MODULE_EDGE_CASES.md#copying-and-saving)
- the loader: install, replace, remove and Undo; a set the base refuses rolls back whole; the pool full; a trial that expires with a page open (docs/OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)
- DSP code: DSP FULL; both cores; the receiver window; pipeline stalls the instruction count hides (docs/OCTATRACK_HARDWARE_TRAPS.md#coldfire-and-dsp-load)
- the USB link: USB unplugged mid-transfer; the host silent until the base rolls back; a reconnect (docs/OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)
- load and admission: the pick at the 85 % line with the delays quiet and open; the guard counters while playing (docs/OCTATRACK_HARDWARE_TRAPS.md#coldfire-and-dsp-load)
- boot and restore: PROJ held at power-on; the restore held back; a RAM boot back to the flashed base (docs/OCTATRACK_MODULE_EDGE_CASES.md#boot-and-power)

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Eight audio lanes and independent source selection | A source change could redirect a neighboring lane | Native MKII wide pair against independent stock composite and T2-only slice | Pass. All 624 events, 608 relative writes and 219 states matched. The separate T2 slice matched 384 calls and 400 writes at wrap 90. |
| Request just before wrap | Pending state could appear too late | Native early-boundary panel fixture | Fail. Requested by tick 89 +1 ms, pending diagnostic still zero at +15 ms, committed at wrap 90 +16 ms. |
| Request just after wrap | Restore could be reported on the wrong tick | Native late pair and strict boundary grader | Fail. All 848 events, 816 writes and 298 states matched, but pending restore appeared at tick 187; the oracle requires 188. |
| ARR after stock popup during Row Edit | Editor could keep the panel hidden or lose a row | Native popup fixture and host callback test | Pass. ARR reopened, R04 retained its definition and OFF recovered the full pool. |
| Unrelated bank, early EOF, popup during bank load | An already-defined R04 could be cleared | Host callbacks with an actual temporary-file EOF and an unrelated bank mask | Pass. R04 and its source survive. |
| Late interrupted project load | Destination initialization can clear the previous rows before completion | Host late-failure case with a short read after init | Fail. The characterization test passes by reproducing loss of R04. Native late-abort recovery remains unverified. |
| Missing versus completed stored reload | Rows could be kept or discarded for the wrong destination | Stock PROJECT menu in native emulator on disposable cards | Pass. Missing stored files preserved bank A and R04. Completed stored reload selected bank B and cleared R04. OFF recovered the full pool in both cases. |
| STOP, OFF and stock Arranger | Queued source changes or handlers could survive removal | T2 slice and Arranger recovery fixtures | Pass. STOP cancelled the queued change; OFF restored callback heads and all 786432 pool bytes. Stock Arranger playback matched before and after removal. |
| Shared hook interaction | Panel, source or wrap registration could conflict with base owners | Candidate build by named hooks, callback heads before/after OFF and upstream-only compile | Pass on the candidate for bindings and T2 unload. Blocked on upstream main for the three proposed bindings; catalogue-only compatibility excludes CLYPS. |
| Physical MKII | Audio, cost, USB trial and persistence require the real instrument | Separate authorization required | Not run. Trial, soak, pricing, rollback and inventory, MAIN/CUE listening and persistence remain open. |

#### Left for the submitter at their unit

- how it sounds and plays, and timing by ear
- MIDI, scenes and recording with it
- it beside the other modules installed on their unit
- two instances with different settings, on both FX slots and both DSP cores where it can (docs/MODULE_QUALIFICATION.md)
- Part reload, project save and reload, and a power cycle with it saved: what survives (the Keep and the power cycle are theirs)

#### For the pull request

Not tested on a unit: stopped: step 1 (Software checks) failed.
Edge cases: the table above, one row a case (or "Edge cases: none, because …").
