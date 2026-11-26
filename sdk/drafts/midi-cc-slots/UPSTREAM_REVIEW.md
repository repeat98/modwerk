# Upstream draft review — 20 November 2026

This is a source-and-evidence submission, not an installable release. **21 November update:** the opt-in 0.0.20 paired-event adapter now builds and has eight passing host load-state tests; see [BANK_LOAD_EVENTS.md](BANK_LOAD_EVENTS.md). The initial refusal below is historical. Current-base native and hardware qualification remain open. It imports Cooper Scobey's local Midi Mode 2 work from fork commit `5d1e29cb` onto upstream `6ac9c8ced31ddbcb5c9b82394dabc982ce988e38` without the fork's site overlay, site-sync merge or shared check changes. The module remains unregistered under `sdk/drafts/`.

## Implemented in the local fork

- Optional CC0–127 assignments in the pitch-bend and aftertouch positions; numeric CC headers and stock mode restoration.
- Stock MIDI track-name editor, per-bank names, and project-sidecar persistence including Save to New.
- Explicit Bank A / Part 1 name/channel setup with cancellation, recovery and confirmed replacement; ordinary bank changes do not reapply defaults.
- Runtime install/Undo/removal experiments, earlier emulator screenshots, and separately attributed hardware and memory observations.

The last local integration is 0.0.19-experimental, bound to the **5 November** base `462fbd2b…`. Its authored runtime bytes match 0.0.18. It is not a compatibility declaration for today's upstream base. The earlier 0.0.18 hardware and memory reports remain tied to their own base identities.

## Initial upstream blocker — 20 November

On this clean upstream tree, the real `build_runtime.py --profile --project-template --current-base` build assembles and links, then correctly refuses publication: the module's old bank-load patch at `0x400905d4` overlaps the base-owned `ev_bank_load` hook. The next runtime change must subscribe to that hook and verify the bank-load context instead. The guard is retained; no runtime package is shipped by this submission.

Not tested on a unit: the initial snapshot had no accepted runtime build. The new opt-in 0.0.20 package passes the ownership guard and host checks, but no hardware trial, Keep, INIT, flash or restart test has been performed for it.

## What is historical

`TESTING.md`, `MEASUREMENTS.md`, `evidence/`, `CHANGELOG.json` and screenshot captions identify the original versions and bases. They are retained evidence, not results from this upstream head. `LOCAL_SITE.md`, `USB_CARD_INSTALLER.md`, the frontend verification scripts and localhost links describe the author's local-fork tooling; that frontend integration is deliberately outside this pull request. Do not follow them as current upstream installation instructions.

## Remaining work before a release

1. Review the paired bank-load event design and its host failure model, verify native commit/rollback ordering and same-project reload requirements, then audit all fixed sites and called stock routines against the selected current base.
2. Add the current draft/module manifest and supported development path; run module doctor and the repository test procedure, including its required edge cases.
3. Repeat exact-runtime install, Undo, removal, recovery, project lifecycle and restart tests on a backed-up physical test project, preserving the full companion set.
4. Complete worst-case timing, full stack bounds, deterministic MIDI traffic checks and fresh version-bound UI captures.
5. Add normal catalogue/build integration and obtain the first-release review. No automatic-publication approval is requested.

Guides: nothing missing was identified. The existing shared-hook guard found the bank-load conflict. The source snapshot records the blocker instead of weakening that check.
