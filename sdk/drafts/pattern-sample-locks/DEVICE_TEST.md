# Private MKII test candidate

Prepared locally on 28 October 2026. No upstream PR, release, flash or physical
module test has taken place. This is a trial plan, not hardware evidence.

## Exact files

Private directory: `~/.cache/modwerk-pattern-sample-locks/device-test/`.

- `base/`: development RAM base with USB panel/screen, load diagnostics and
  lifecycle notifications. Identity:
  `0c5d5e91d6f1a93974eda2cc3e7535f93aefdc2e5c275a74e21d7ace3177de2e`.
- `base/MAIN.raw` SHA-256:
  `5d8261d050b0f0a756b7b7890081ba2ad74456fa33db61b996dbd0f58cf3ae9e`.
- `pattern-sample-locks.mwrm`, version `0.1.5-experimental`, SHA-256:
  `f9f179e0f5536d3c0727f61df5e79106ff211721c75742646c747e9598b35fc9`.

The module is byte-identical to the earlier tested package. The base is a new
build from the separate lifecycle worktree, with the lifecycle header now
included in its source fingerprint. Its development MEM service can read the
module's guard counters without changing the module. Firmware stays private.

## Before loading anything

1. Back up the CF card, including the project and both `/MODWERK0.SET` and
   `/MODWERK1.SET` when present. Have a disposable project ready with one Flex
   track, one Static track, several trigs and a known manual SAMPLE lock.
2. Connect the powered MKII outside USB disk mode. Use one bridge/client only.
   Read the current base identity, capabilities, active digest and complete
   inventory before changing the unit. Record where the original modules'
   matching packages are stored.
3. Read the starting transport, project/bank/Part and diagnostic state. Stop
   if the unit's state or recovery is unknown. Boot the candidate into RAM only
   when its boot capability and baseline are understood; never flash it.

## First trial

DSP-enabled emulator installation, native Lock/Clear, witnessed fresh-process
restore, companion removal and trial Undo have passed on this pair. The 512-lock
commit estimates are 1.48 model ms for Lock and 2.47 for Clear. The longest full
interrupt guard was 1.15 model µs. Absolute CPU/DSP percentage meters saturated
even with the module removed; those readings are unusable. See TESTING.md for
the instruction counts, method and limits. Physical measurements remain open.

Use the documented USB session with an unaccepted, bounded trial of the exact
package. This unpublished draft is absent from the frontend MCP catalogue;
MCP read-only status remains available, but its catalogue admission must not
be bypassed. Do not use the session's `try FILE` shortcut, which Keeps.

1. Run the native self-test with transport stopped; record its actual verdict.
2. On the disposable pattern, open FUNC+PART, then LOCK SAMPLES TO PATTERN.
   Check both columns, skipped non-Flex/Static tracks, A/B selection and the
   per-track confirmation counts. NO on confirmation returns to selection;
   NO there closes the popup.
3. Start playback, then confirm a small Lock operation. Confirm that playback
   stops before the edit and stays stopped. Check that the manual lock remains
   and the Part-assigned sample appears only on the selected track's trigs.
4. Open CLEAR SAMPLE LOCKS. Retain manual must be ON. Confirm Clear: created
   locks disappear and the known manual lock remains. Check unselected tracks.
   A later explicit test with Retain manual OFF may clear the manual lock.
5. Read CPU/DSP diagnostics and the exact installed object's guard counters
   before/after operations. Emulator instruction counts are not hardware time.
6. Undo the trial, then reread base, active digest and inventory and compare
   them with the RAM baseline. Verify the stock popup and continued response.

Undo removes code; it does **not** undo SAMPLE edits. Do not save an owner's
project. If rollback is ambiguous, stop installs and ask for a power cycle.

## Later persistence test

A first trial is not a power-cycle test. Keep/restart needs a separate prepared
session with the original kept set backed up and its recovery understood.
Power cycling restores the flashed base: Keep on this temporary RAM base alone
cannot establish automatic restoration after a physical restart. That test
needs a lifecycle-capable base at startup through a separately reviewed boot
path, beyond this first RAM trial.
Keeping on a different RAM base can replace both saved module-set files; the
flashed base cannot restore a foreign-base set. Never Keep automatically.
Power cycling is performed by the user. Record only observed/reported results
and their exact base/package identities in TESTING.md.
