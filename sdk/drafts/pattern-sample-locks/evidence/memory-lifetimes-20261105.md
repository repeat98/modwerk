# Pattern Sample Locks 0.1.8 memory lifetimes — 5 November 2026

This stock-free source-bound addendum accounts for the exact candidate through the USB module backend and the optional whole-set backend. Candidate package SHA-256 is `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`; its current native-source fingerprint is `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69` (62 native files). The bound private reconstruction is for configuration SHA `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`, with `MAIN.raw` SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`; its prior source audit matched 233/233 proof inputs. The author-reported trial gives only the IDENTIFY value and no MAIN hash, so this memory analysis is not bound to the device image. This analysis reuses that audit and the [existing candidate and shared-layout record](qualification-progress-20261104.md#private-reconstruction-shared-memory-layout), does not contain firmware, extracted code, instruction bytes, stock tables or memory dumps, and involved no hardware or project changes.

Source anchors are the [loader](../../../runtime/loader/loader.c#L19), [loader layouts](../../../runtime/loader/loader.h#L17), [journal](../../../runtime/loader/journal.h#L7), [context wrapper](../../../runtime/loader/context.h#L4), [stage](../../../machines/octatrack/elekloader/boot.h#L4), [USB lifecycle](../../../machines/octatrack/elekloader/boot.c#L88), [saved set](../../../machines/octatrack/elekloader/modset.c#L32), [EP0 controller](../../../machines/octatrack/elekloader/ep0.c#L98), [event arrays](../../../machines/octatrack/elekloader/runtime_events.h#L7) and [task/reclamation adapter](../../../machines/octatrack/elekloader/runtime.c#L156). Build constants are in [build_core.py](../../../machines/octatrack/elekloader/build_core.py#L288).

## Candidate bytes through USB install and replacement

The loader uses a fixed base pool and the controller's existing shared upload stage. Those capacities are reservations in the base; the candidate occupies them but does not allocate them. The package bytes in the stage and the relocated runtime extent in the pool are separate simultaneous copies during preparation.

| State or ledger | Source-bound amount | Lifetime and attribution |
| --- | ---: | --- |
| USB staging | `1,311,040` byte fixed stage: 64-byte mailbox + 256-byte stub + `0x140000`-byte image; this MWRM is `10,048` bytes | The encoded package occupies the image portion from upload through backend preparation/publication/retirement. It is not an extra allocation on top of the stage. `boot.c` passes the same image buffer to both USB backends. |
| One candidate extent | `10,832` bytes in the `786,432` byte pool | `prepare_context` allocates and relocates the package into the first fitting pool run. The exact breakdown (8,748 initialized bytes + 1,328 BSS + 528 runtime header + 216 site records + 8 header padding + 4 image alignment) is already recorded in the linked layout evidence. |
| Replacement overlap | `Eold + 10,832` bytes, plus other owned extents; `21,664` only when the old extent is exactly this candidate's size | The old module remains live while the replacement is prepared. After publish it is retained as `previous` through the trial; after rollback or retirement it is reclaimable only when no live/journal/set root or paused task stack/register span can still reach it. An older release's `Eold` is not established by the candidate hash. |
| Owner and live-position ledgers | Fixed capacities: 256 owner records × 88 = `22,528` bytes; 256 extent pointers × 4 = `1,024`; 128 live pointers × 4 = `512` | One extent consumes one existing owner record and pointer; a replacement temporarily needs two. Owner records are base-side identity data, not copied into the candidate. |
| Candidate site records | 3 × 72 = `216` bytes | These are inside the candidate's `10,832`-byte extent, not a second site allocation. The base's separate 1,018-word event and staged-event arrays occupy `8,144` fixed bytes together; their capacity is shared and is not candidate-attributable. |
| USB controller state | `320` bytes by source field arithmetic under the verified 32-bit pointer ABI | `ep0.c` has one static `mu_context controller`; its fields are shared transaction state, not one allocation per package. Other transport/controller objects are outside this candidate-specific calculation. |

For a simple MWRM replacement, the pool peak while preparing is `Uother + Eold + 10,832 + Ustale`, where `Uother` is every other owned module extent and `Ustale` is any retired-but-not-reclaimed extent. The pool imposes an absolute aggregate ceiling of `786,432` bytes, but `take()` requires a contiguous free run of at least `10,832` bytes. Consequently, total free bytes alone do not prove admission. A synthetic allocator boundary with 20,000 free bytes but a largest run of 10,000 bytes rejects this candidate; this is a fragmentation illustration, not a measured inventory. If no suitable run exists, the loader refuses with its memory error rather than extending the pool. It also refuses when its 256 owner slots or monotonic owner-generation space is exhausted.

## Saved-set and whole-set lifetimes

The exact base proof selects `moduleSets: mwms-1`. `modset.c` reserves a fixed `SET_BYTES = RUNTIME_POOL_BYTES + 0x1000 = 790,528` byte RAM buffer for the saved module set. A saved MWS1 record for this package adds `8 + round_up_4(10,048) = 10,056` bytes; with the 84-byte MWS1 header, an otherwise empty saved set would use 10,140 bytes. A replacement first removes the previous package record, so the saved-set length change is `10,056 - old_record_bytes`, not a universal 10,056-byte increment. The current saved inventory and any older package length are unknown.

After successful backend retirement, the single-package USB path copies the staged package into `set[]` and marks the set pending for the existing save service. This is a second serialized copy inside the fixed `set[]` reservation; it is separate from the relocated live extent and from the still-reserved upload stage. If that buffer cannot fit a direct MWRM update, `modwerk_modset_accepted` records `TOO_BIG` after loader retirement and does not append the candidate to the saved set. The MWMS path instead checks the complete replacement set before retirement. A one-change MWMS offer containing this MWRM is `80 + 4 + 10,048 = 10,132` bytes in the same upload stage; it is not a second staging buffer.

The whole-set implementation also has fixed shared scratch. Under the 32-bit ColdFire layout, the loader's before/after journal and `change_set` each calculate to 7,696 bytes (128 60-byte rows plus their progress/state). The source-declared pointer/length, ID, digest, accept and restore-outcome arrays total 12,416 bytes; `runtime_journal_set_digest` has a separate 4,616-byte static input buffer, for 17,032 identified whole-set scratch bytes. These objects are base static storage, not per-candidate allocations. They are not a complete base RAM/BSS total. No heap allocator is used by this loader/upload path: module memory comes from the fixed pool, and the other listed buffers have static storage.

For a whole-set transaction, `set_prepare_context` prepares each changed package while retaining its before/after extents in `change_set` until completion, rollback or retirement. The aggregate pool use remains bounded by the fixed 786,432-byte pool and owner slots by 256, but a supported transaction can refuse before completion when old versions, unchanged modules, delayed reclamation, or fragmentation leave insufficient room. A memory ceiling is therefore proven; successful admission for an arbitrary installed set is not.

## Stack and reclamation limits

`prepare_context` declares automatic arrays totaling 1,470 source bytes under this build's constants: 38 hook words, 128 site addresses, 128 site sizes, 38 order bytes, 16 DSP claims and 8 DSP entries. Its nested `reclaim` declares 32 two-pointer spans (256 source bytes). The context wrapper also reserves a 64-byte register snapshot and pushes the context pointer plus three arguments before the call. These are source-declared components, not compiler-measured frames or a complete task peak; scalar saves, callees, ABI frames and interrupt nesting are outside the subtotal. This system-module candidate has no separate DSP extent, but that does not turn the generic loader path into a proven total stack bound.

The base runtime lists 11 task stack ranges and `modwerk_machine_paused` would report at most 22 spans (the current register snapshot, 11 live stack tails and 10 other-task saved-register blocks) against its 32-span capacity. It checks the live current TCB, ready-task list and saved stack pointers; unknown task/state returns an over-capacity result, causing reclamation to free nothing. This establishes a bounded scan shape and fail-closed reclamation behavior, not stack high-water. It does not prove the active engine-task SP, all ISR stack transitions/nesting, or a finite end-to-end stack peak. The existing [interrupt-context evidence](interrupt-context-20261104.md) records the remaining source/companion and live-state gaps.

## Independent arithmetic check and limits

The following host-only assertions independently recompute the source formulas and exercise the contiguous-run boundary; they read no firmware or device state:

```python
P, pool, modules = 10_048, 768 * 1024, 128
extent = 8_748 + 1_328 + 528 + 3 * 72 + 8 + 4
stage = 16 * 4 + 256 + 0x140000
record = 8 + ((P + 3) & ~3)
row = ((2*4 + 3*4 + 2 + 3 + 32 + 3) // 4) * 4
journal = ((row*modules + 12 + 1 + 3)//4)*4
change_set = row*modules + 4*4
scratch = 3*(2*modules*4) + 2*modules*4 + 2*modules*32 + (8+36*modules) + modules
assert (extent, 2*extent, stage, record, 84+record) == (10832, 21664, 1311040, 10056, 10140)
assert pool == 786432 and pool >= extent
assert (row, journal, change_set, scratch) == (60, 7696, 7696, 17032)
assert 2*modules*88 == 22528 and 2*modules*4 == 1024 and modules*4 == 512
event_words = 6*(modules+1) + 244
assert event_words == 1018 and 2*event_words*4 == 8144
hooks = 4 + 34
prepare_arrays = hooks*4 + 128*4 + 128*4 + hooks + 16*12 + 8*8
span_array = 32*2*4
mu_context = 4 + 4*4 + 4*32 + (3*32+3*4) + 9*4 + 4 + 6*4
assert (prepare_arrays, span_array, mu_context) == (1470, 256, 320)
assert 1 + 11 + 10 == 22 <= 32
assert 20_000 >= extent and 10_000 < extent  # enough total free bytes, but no fitting run
```

The run passed with `extent=10832`, same-size replacement `21664`, stage `1311040`, saved-set record `10056`, owner/owned/live ledgers `22528/1024/512`, event arrays `8144`, journal/change-set `7696/7696`, whole-set scratch `17032`, source-declared prepare/reclaim arrays `1470/256`, controller `320`, and `22/32` pause spans; the synthetic fragmentation case rejected as expected. These exact identity checks reproduced the private package and native-source bindings:

```sh
shasum -a 256 "$HOME/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-integration-80f442d5-container/pattern-sample-locks-0.1.8-public-path.mwrm"
"$HOME/.nvm/versions/node/v24.22.1/bin/node" --input-type=module -e 'import {readFile} from "node:fs/promises"; import {moduleNativeSourceSha256} from "./scripts/module-qualification.mjs"; const d=JSON.parse(await readFile("sdk/drafts/pattern-sample-locks/octamod.module.json","utf8")); console.log(await moduleNativeSourceSha256("sdk/drafts/pattern-sample-locks",d));'
```

The outputs remained `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79` and `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`. The capacity formulas do not reveal other installed modules or historical package extents, actual run fragmentation, whether paused-task scans succeed at runtime, or task/ISR stack high-water. Thus the pool, fixed ledgers, stage, saved-set buffer and identified static scratch have finite source-derived capacities, but the exact release path's total RAM and stack peak remain open pending the active inventory/old-version sizes, task-state/reclamation contract and complete compiler/interrupt stack proof.

## Publication memory contract and scope

The first-release contract in [`MODULE_QUALIFICATION.md`](../../../../docs/MODULE_QUALIFICATION.md#exact-memory) applies to this runtime-changing module: its version/source/image-bound qualification must inventory code, state, tables, buffers, stack, bounded heap, padding, temporary peaks and shared allocations, then reconcile exact byte regions, lifetime overlap and the supported instance limit. `perInstanceBytes` is the sum of instance regions, `sharedBytes` the sum of shared regions, and `totalBytes = perInstanceBytes × maxInstances + sharedBytes`. For this system module the supported live instance count is one per module ID. The verified `10,832` bytes is the exact candidate pool extent and supports the existing static storage gauge; it is not yet a complete qualification `totalBytes`, because the shared-task stack demand and any shared stack reservation/accounting convention have not been closed. The fixed upload stage, pool capacity, saved-set buffer and base ledgers are existing base reservations, not additional per-module allocations; count a shared reservation only once, and keep its capacity separate from the candidate's occupied extent.

The reviewer contract is stronger than the parser. `module-contract.ts` checks that regions are present, byte formulas and sums agree, limits are in range, and `totalBytes` follows the formula; publication validation checks the record, version/source binding, cycle budget, hardware status and documentation. `scripts/modules.mjs` also requires populated relative CPU/DSP/memory gauges and nonempty reports. Those checks do not inspect the reports' allocation completeness, compare every region to maps, prove call-graph/stack bounds, or derive whole-system memory. The resource storage metric and the four-level memory gauge are summaries; neither can replace the exact memory record. First-release owner review evaluates the source-bound evidence.

The memory gate therefore requires a defensible upper bound for this module's stack demand and proof it fits its shared task/interrupt stack capacity; it does not prescribe a hardware canary when a complete static bound is available, but the report must say whether canaries were measured. Existing system-task subtotals of 916/200/156 bytes and the frame-vector audit are partial: popup-opening callbacks, the complete stock frame ISR path, possible level-6/7 nesting and live task/SSP state are not bounded. See [interrupt context](interrupt-context-20261104.md) and [qualification progress](qualification-progress-20261104.md#system-task-dispatch-stack). These unresolved paths prevent a complete module memory total even though the candidate's fixed pool extent is exact.

The qualification `totalBytes` is not a claim about the full base or a universal peak over every arbitrary set of co-installed modules. It must state this module's supported instance limit, its own concurrent lifetimes and shared allocations, and its peak overlap. The base pool is a fixed 786,432-byte shared capacity; another module's extent, fragmentation and deferred reclamation determine whether a requested contiguous allocation can be admitted. The loader's bounded pool and fail-closed allocation refusal establish a capacity/refusal boundary, not guaranteed successful installation beside every possible inventory. Cross-module compatibility and truthful USB inventory remain separate release integration obligations. Since this is the first public Sample Locks release, there is no prior published Sample Locks extent to include; for any explicitly supported replacement from a private/older image, bind and account its exact old extent (`Eold + 10,832` during preparation), or state that replacement combination is outside the measured admission claim. The `21,664` two-copy example assumes equal extents and is not a universal replacement bound.

Highest-priority closure is the complete stack proof: bind the exact runtime companion set, resolve every popup and ISR callback/control-flow edge, prove stack transitions and enabled interrupt nesting under explicit source/live-state assumptions, and compare the resulting peak to each relevant base stack reservation with its guard/bound evidence. Then finalize the exact qualification regions/totals and separately report which co-installed inventories have been shown to admit the package versus safely reject for capacity/fragmentation. The current record has no new stack-demand number that can be independently computed from the available source; the documented `10,832` extent and prior task/ISR subtotals must not be combined into a fabricated whole-path value.
