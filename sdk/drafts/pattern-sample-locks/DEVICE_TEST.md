# Private MKII trial: 0.1.6-experimental

Lock preserves existing SAMPLE locks by default. Clear removes **all selected SAMPLE locks**, including manual locks. There is no ownership storage or special persistence requirement.

Package SHA-256: 0cd6c725f6be493ea461b7a54231032416cab3cad77bf3327e644db212848961.

## Before loading

1. Back up the CF card. Prepare a disposable project with Flex/Static tracks, trigs, a manual SAMPLE lock and a non-SAMPLE parameter lock. Save the disposable Part first (FUNC+PART > SAVE), so its working and saved copies match before project reload comparisons.
2. Connect the powered MKII outside USB disk mode. Use one client. Read base identity, capabilities, active digest, inventory and diagnostics before changes.
3. Review compatibility and confirm that base supports the three-site, four-standard-hook package. A custom lifecycle extension is unnecessary; consider a RAM base change only if actual capabilities require it.
4. Use the documented bounded USB session trial. The frontend MCP catalogue excludes this unpublished draft. Never use the serving session's immediate-Keep shortcut.

## Check on the disposable project

- FUNC+PART keeps four stock rows, then Lock and Clear.
- Eight tracks appear in two columns; only S/F tracks are selectable. Arrows navigate; A toggles all and B the highlighted track.
- Lock defaults to Replace existing OFF. Existing locks stay; empty SAMPLE fields on sample trigs receive the Part assignment. Repeating Lock keeps both manual and earlier generated locks.
- Clear has no Retain manual option; C is inert. Confirmation says INCLUDES MANUAL LOCKS and gives per-track counts.
- Start playback before a small edit. STOP must precede mutation; playback stays stopped. Clear removes all selected SAMPLE locks, preserving other parameter locks, unselected tracks and Part assignments.
- Capture actual diagnostics/screen. Emulator instruction times are not hardware timing.
- Undo the module trial; verify baseline active digest/inventory, stock popup and response. Undo removes code, not SAMPLE edits.

The first trial does not Keep or flash. Later native save/reload may save only the disposable project. Record only observed/reported results on the exact build. If recovery is ambiguous, stop installations and ask for a power cycle.
