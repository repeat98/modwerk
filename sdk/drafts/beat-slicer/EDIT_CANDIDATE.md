# Preview-bound edit candidates

`edit_candidate.c` joins complete marker preparation to one ready preview. It
is a portable base-side prototype, not an installed service, publication API
or native rollback implementation. It never writes PCM or sample settings.

Begin retires the previous candidate and binds the current session operation.
Under that session's nonblocking backend lock it revalidates the preview,
allocates a distinct candidate ID, captures all 64 marker records and prepares
the candidate privately. It checks active records against the preview and
rechecks source plus the full table before exposing a ready candidate.

The full-table callback uses the existing backend context and supplied snapshot.
It must identify the exact source, copy all records/count, return promptly and
retain no pointers. All writers/capture/copies must share the same proven
ownership boundary. Postchecks cannot repair an unsafe native read.

Pending ownership/captures yield and retry the same preview. A replaced or
cancelled preview, relevant source/metadata change, guard invalidation or full
table mismatch retires the candidate. A table mismatch includes inactive rows.
Unselected tempo changes alone remain allowed. Candidate refusal preserves the
marker-preflight reason; it does not silently discard old records or ordinals.

Result requires the issued candidate ID, revalidates under ownership and copies
the complete before/after edit only on success. Wrong IDs, pending, cancellation,
stale input and failure leave the result output unchanged. Re-preparing gets a
new ID even when the underlying preview is unchanged. IDs are trusted internal
lifetime bookkeeping, not authentication or protection against memory corruption.

The session and backend must outlive the candidate. One background owner calls
both; no concurrent or reentrant calls are allowed. `bs_candidate_result_locked` and `bs_session_result_locked`
are for composition while that caller already holds the same backend lock.
Normal callers continue using `bs_session_result`, which acquires it itself.

Returning a candidate is **not Apply permission**. A future native publication
service must validate and publish within its own verified ownership boundary,
refresh all native state atomically, provide exact internal failure rollback
and satisfy playback qualification. Successful creation follows the stock
slice-clearing workflow, with no separate Undo or history-discard UI. Copying
this result and writing it after releasing the lock would not establish those
guarantees.
