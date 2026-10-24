# Preview admission prototype

`preview_guard.c` implements the bookkeeping proposed for a future shared-base
provider. It is unlisted staging: **no native hook, lock, pool reader, base ABI
or device package is installed**. The existing planner/reader code is unchanged.

## Rules implemented

The guard starts disabled. An explicitly enabled, idle guard can issue a
preview token containing a nonzero operation ID and content revision. Any
observed writer entry invalidates every older preview before its mutation and
keeps admission closed until every outstanding writer ticket has returned.
Tickets are independent of queue pointers and UI notifications. Nested and
overlapping writers can complete in either order; duplicate/unknown returns
cannot clear another writer. Even a failed or no-op edit retires old previews.

This is deliberately coarse: all tracked edits and allocation changes retire
all previews, including other slots. Per-slot optimization would need stronger
map-ownership evidence. Metadata/tempo/source changes use explicit invalidation;
owner removal additionally disables admission. Revocation retains outstanding
writer tickets, and re-enabling does not reuse IDs or revive an old revision.

There are eight writer slots in 48 bytes of caller-owned state. Exceeding that
capacity, operation-ID exhaustion or revision exhaustion permanently disables
admission for the guard lifetime. It does not interrupt the stock operation.
Initialize once for a fresh base lifetime; never reset on a sample switch or
module reload. Cross-lifetime replies must be drained by the transport/owner.
The capacity is a prototype bound, not a measured maximum stock nesting depth.

## What the provider must still prove

Every guard call and each snapshot/map lookup/bounded PCM copy needs the same
verified external serialization boundary. `bs_guard_valid` is bookkeeping,
not a memory pin or an atomic lock: checking it and later copying without that
boundary is unsafe. Keep raw pointers inside the bounded copy. Revalidate the
source kind, format, extent and map; a finished release can leave the guard idle
while the slot itself is empty and must still be refused.

Call writer entry before **every** relevant mutation, and writer end on actual
return/cleanup, independently of queued UI completion. Untracked recording,
load/replacement, cancellation, allocator or metadata paths still prevent live
admission. `bs_guard_enable` cannot discover missing instrumentation. It is used
only by the synthetic fixtures until those native requirements are satisfied.

The future provider can pass `bs_guard_revision()` to the staged reader: zero
while disabled/busy/poisoned makes it fail; an old revision remains stale after
the writer returns. A fresh preview receives a new operation ID. Canceling the
reader retires its local pending work; owner removal must also drain callbacks
before reclaiming module memory. Tokens are trusted internal records, not an
authorization credential or a registry of every outstanding operation.

## Validation boundaries

Host sanitizer and compiled ColdFire tests exercise lifecycle, saturation,
counter exhaustion, 120 event schedules (including premature/duplicate ends),
and edits before a read reply, after a late reply, and after preview completion.
The stock worker fixture additionally runs the host-compiled guard alongside
instruction observations of the real private stock routines. It blocks token
acquisition at PCM writes, retires old tokens on failures, and reopens admission
at actual return even when no UI completion is attempted or enqueued. Crop's
nested rotation must not reopen admission when only the inner writer returns.

These two test layers are distinct: the guard selftest runs compiled target
code; the stock trace uses a host guard. Neither installs native instrumentation,
interleaves a live scheduler, performs hardware timing or qualifies USB/audio.
See [TESTING.md](TESTING.md) and [writer coverage](WRITER_COVERAGE.md).

The 0.1.7 recorder trace uses the same host guard around complete stock calls,
including shared-page allocation and early exits outside the edit worker.
Position/map stores can precede PCM. After an allocation shortage the guard's
ticket ends at return, but queued follow-up work and source eligibility remain
separate concerns. Idle bookkeeping never authorizes a raw recorder/Flex read.
