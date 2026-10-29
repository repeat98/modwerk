# Private MKII trial: 0.1.8-experimental

Lock preserves existing SAMPLE locks by default. Clear removes **all selected SAMPLE locks**, including manual locks. There is no ownership storage or special persistence requirement.

Package SHA-256: 28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d.

## Before loading

1. Back up the CF card. Prepare a disposable project with Flex/Static tracks, trigs, a manual SAMPLE lock and a non-SAMPLE parameter lock. Save the disposable Part first (FUNC+PART > SAVE), so its working and saved copies match before project reload comparisons.
2. Connect the powered MKII outside USB disk mode. Use one client. Read base identity, capabilities, active digest, inventory and diagnostics before changes.
3. Review compatibility and confirm that base supports the three-site, four-standard-hook package. A custom lifecycle extension is unnecessary; consider a RAM base change only if actual capabilities require it.
4. Review the exact package, current set and intended change before each trial. The tested singleton path and an addition-only companion trial have separate receipts in TESTING.md. Keep one serialized USB owner and state any host deadline; no Keep is automatic. Use the acknowledged offer identity during a retained trial: the base deliberately withholds whole-set identity until Keep or Undo ends its journal. Stop playback before ending a trial, then verify inventory and identities. The frontend MCP catalogue excludes this unpublished draft; never use the serving session’s immediate-Keep shortcut.

## Check on the disposable project

- FUNC+PART keeps four stock rows, then Lock and Clear, with the stock font and seven-pixel row spacing.
- Levels two and three use the same stock font and seven-pixel row spacing, with white headers. Eight tracks appear in two columns; only S/F tracks are selectable. Arrows navigate; A toggles all and B the highlighted track.
- Lock defaults to Replace existing OFF. Existing locks stay; empty SAMPLE fields on sample trigs receive the Part assignment. Repeating Lock keeps both manual and earlier generated locks.
- Clear has no Retain manual option; C is inert. Confirmation says INCLUDES MANUAL LOCKS and gives per-track counts.
- Start playback before a small edit. Apply must leave playback running without a stop/restart. Repeat for Clear. Then stop playback yourself and verify that either action leaves it stopped. Clear removes all selected SAMPLE locks, preserving other parameter locks, unselected tracks and Part assignments.
- Successfully apply a custom Lock selection with Replace existing OFF; reopen and check selection/cursor. Try Replace existing ON on the disposable pattern and verify recall after success. Check Clear has a separate selection. Cancel a changed selection/policy and verify the previous successful profile returns.
- Use A to select All and apply; reopen on another pattern and verify all eligible tracks are selected. A custom selection must skip newly ineligible tracks.
- Begin live recording, then attempt an operation: it must refuse without stopping playback/recording or editing. Stop recording yourself.
- With playback running, repeat small and maximum selected edits while listening. Log whole-instrument CPU/DSP before, during and after; short spikes may be missed by cached diagnostics. Record operation timestamps manually.
- Successful Apply closes directly to the normal screen; no success acknowledgement is required. Refusal/error messages still appear.
- Capture actual diagnostics/screen. Emulator instruction times are not hardware timing.
- Undo the module trial; verify baseline active digest/inventory, stock popup and response. Undo removes code, not SAMPLE edits.

The author chose Undo on the latest companion trial; no Keep or flash occurred. A future persistence test needs a fresh review and explicit Keep for the exact version and module set. Never Keep over foreign saved files. Native save/reload may save only the disposable project. Record only observed/reported results on the named build. If recovery is ambiguous, stop installations and ask for a power cycle.
