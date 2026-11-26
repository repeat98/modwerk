# Cx Osc testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## On the unit

2026-11-27: trial (upload mode) passed 30s, clean verdict; **accept** reboot crashed during “starting modules” (diaglog boot 7/8, PC `0x40000000`). Draft fix (no USB retest yet): drop `SymbolRef` on the shared FLEX START cell (use `ot_machine_starts` only), clear `MODWERK_MACHINE_RENDER_FLEX` from `cx_machine.flags`, add `rests` like FM Synth.

2026-11-27: the next trial stopped advancing at tick 6872. Ctrl-C requested rollback, but the unit still reported the trial active; `recover` lost USB contact. After the unit returned in normal generation 0, a package with the three `page.s` lookups changed from the stock FLEX table to the local `sy_render` symbol built successfully. Its 10-second trial lost USB contact during commit, before a running verdict. Rollback could not be confirmed because the unit remained away. The loading failure is still open.

2026-11-27: diaglog for the commit crash placed the fault in `mw_ui_tick+0x192`. The CX `fm_track_page` callback changed callee-saved `a2` without restoring it. After saving and restoring `a2`, the package built at 29,968 code/data bytes. A 10-second USB trial advanced from tick 3951 to 4493, reported no crash, stall, freeze or skipped track, rolled back, and returned to normal generation 2. This proves temporary load only; Accept, reboot and playing CX OSC were not tested on this build.

2026-11-27: selecting CX from the machine list crashed with vector 4 at PC 0; the crash stack named `mw_assign+0x342`. The descriptor passed `po_assign`, a stock detour with a different calling convention, as the base's C `assign` callback. With `assign` set to 0, the package built at 29,968 code/data bytes. Its 10-second USB trial advanced from tick 3542 to 4083 without a logged crash, stall, freeze or skipped track. Accept completed, the unit reported normal generation 1, and inventory listed `Cx Osc` as module `117bbb1a`. The connected base rejects development key commands, so selecting CX after this fix and power-cycle persistence remain untested.

2026-11-27: callback audit found two more stock detours registered as C callbacks: `fm_type` and `fm_validate`. Both were removed from the machine descriptor; the base handles the CX signature and its PROTECT validation. The rebuilt package completed a 10-second USB trial, ticks 2114 to 2655, with no logged crash, stall, freeze or skipped track. Accept completed and the unit reported normal generation 1, active set `d199714f858b545a`. The base rejects remote key commands, so picking CX after this build is not yet observed.

2026-11-27: Ilia reported that CX now works on the unit, but FDBK on SRC SETUP E does not move. The base documents that encoder E (slot 10) stays read-only without `MODWERK_MACHINE_SETUP_ALL`; CX's machine flags lacked it. Added that flag (785). The new package completed a 10-second USB trial, ticks 11339 to 11881, without a logged crash, stall, freeze or skipped track. Accept completed; the unit reported normal generation 2, active set `f52815adb0d5cdb0`.

2026-11-27: Author confirmed FDBK on SRC SETUP E moves after the SETUP_ALL fix on the unit (generation 2 set above). PLAYBACK knobs, morph, and machine select were exercised in the same sessions; a written stock-flow matrix and a perf audit are still open.

If **FM Synth** is still in the module set, remove it before accept; the two modules share the poly/FM hook surface and are declared incompatible.

## Stock flows

Not tested. List the stock flows you compared with and without the module (docs/module-guides/README.md, Leave stock flows alone).

## Performance

Not measured. Listing it needs evidence/performance.json: npm run perf:audit -- template coldfire (docs/MODULE_PERFORMANCE.md).
