# 0.0.20 shared bank-load experiment

This responds to the review of PR #1903. It uses `ev_bank_load` (40) and `ev_bank_loaded` (41) at order 60. The build is opt-in with `--shared-bank-events` and remains unqualified for hardware. The historical local-site and card-installer pins are unchanged.

## Paired context, no guessed result

The pre hook retains each caller and bank mask in a four-frame stack. Nested unrelated calls do not replace an outer project context; excess depth is counted and unwound without indexing past the stack. The post hook consumes its matching frame. It returns zero as the event contract requires, not as an indication of stock success. Unmatched posts have no effect. Only caller `0x400853de`, the original callback's filter, queues a project observation. The mask is retained, never interpreted as success.

Neither hook clears `loaded`, names, dirty edits, clone state, requested setup, journal contents or recovery progress; neither performs file I/O. The UI tick wakes the existing engine sentinel for a pending observation, coalesces repeated ticks and retries after a gated engine turn. Profile service remains blocked while any paired load is active and until the original stopped/card-command gate permits work.

On that settled engine turn, the existing current-project directory is copied. Only a changed identity permits the original caller-filtered invalidation; normal profile service then reads the new project's sidecars once. If the identity is unchanged, the cached profile stays intact. This deliberately does **not** force a sidecar reload for a same-project notification, because these hooks cannot distinguish success from failure. A stronger same-project reload guarantee needs a separate reliable completion signal; no stock return register or undocumented post-hook stack slot is read.

## Host cases and limits

`python3 -B sdk/drafts/midi-cc-slots/test_bank_load.py` compiles the actual profile and event C sources with the existing real-file platform fixture. It asserts cached names, profile arrays, dirty flags, clone state, desired channels, journal bytes, recovery counters and related flags. It tests eight cases:

| Case | Observed host result |
| --- | --- |
| Failed load, transient target path restored to the previous project | Entire cached profile unchanged; no hook/card-gated I/O; previous names remain |
| Same failure with an unsaved name | Dirty name survives; normal autosave resumes to the old project |
| Same failure during pending recovery | Journal/recovery progress survives; recovery can finish after the injected write failure is removed |
| Committed change from project A to B | Old names remain through both hooks and the card-job gate; B's names are read once after settling |
| Post notification for the same project | No forced invalidation or sidecar reread, regardless of the unavailable stock result |
| Nested relevant/unrelated calls | Original caller and mask survive, unrelated and unmatched posts invent no context |
| Stack overflow and unwinding | No out-of-bounds indexing or wrong outer caller |
| Pending post on an otherwise idle profile | A coalesced engine wake is requested and retried after pending card jobs |

These are host control-flow/filesystem tests. The failed-load model restores the previous current-project identity before the card-job gate opens; it does not establish the real firmware's commit/rollback ordering for every error path. A failure that leaves a different current-project identity is not distinguishable from a committed change through these two events alone. Partial stock bank writes are not rolled back by this module or by these tests. Emulator/native checks of those paths, complete lifecycle/compatibility/performance checks and hardware testing remain open. No physical trial is requested by this evidence alone.

## Repeatable offline checks

```sh
python3 -B sdk/drafts/midi-cc-slots/test_bank_load.py
python3 -B -m unittest discover -s sdk/tests -p test_firmware_codec.py
python3 -B sdk/drafts/midi-cc-slots/build_runtime.py \
  --profile --project-template --current-base --shared-bank-events \
  --output /private/new-bank-events/package.mwrm \
  --receipt /private/new-bank-events/receipt.json
python3 -B sdk/drafts/midi-cc-slots/verify_bank_package.py \
  --package /private/new-bank-events/package.mwrm --stock /private/stock-MAIN.bin \
  --receipt /private/new-bank-events/receipt.json
python3 -B sdk/drafts/midi-cc-slots/verify_loader.py --shared-bank-events \
  --package /private/new-bank-events/package.mwrm --main /private/stock-MAIN.bin
```

The built package has 42 hook words, 23 patch sites and 24 guarded stock copies; neither a patch nor a stock copy targets the base-owned bank-load site. Strict stock-free scanning, all stock guards and actual generated base ownership checks pass. The host C loader passes prepare, publication, Undo, repeated install, removal and full memory reclamation; it does not execute the ColdFire callbacks. See `shared-bank-build.json` and the dated evidence for exact identities.

The card-builder fix adds the SDK path only to import `firmware_codec`, then calls `firmware_codec.use_elekloader(upstream)` before importing Elekloader. It no longer inserts the checkout directly on `sys.path`. The requested codec command passes; with `ELEKLOADER_UPSTREAM` set to the pinned checkout, all 12 tests run and pass without a skip.
