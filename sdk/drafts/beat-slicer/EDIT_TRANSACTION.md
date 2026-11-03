# Grid commit and retained Undo research

`edit_transaction.c` is a portable base-side coordinator, **not a native atomic
publisher, installed service or exported ABI**. The source, ownership, playback,
exchange and quarantine callbacks are synthetic in its tests. Live enablement
still requires their separate owner-reviewed implementation and qualification.

## Player workflow decision

Beat Slicer follows the existing slice editor: confirm grid creation and use
stock DELETE SLICE / DELETE ALL SLICES afterwards. There is no planned
user-facing Undo action, history-discard prompt or extra confirmation screen.
The explicit Undo API and tests below describe the retained research prototype,
not required player behavior or evidence that stock slicing has an Undo service.
Native integration must keep failed-publication rollback internal and must not
expose the prototype's history lifecycle as UI. Clearing slices removes them;
it does not restore an earlier grid. Stock clear/edit operations must invalidate
any outstanding Beat Grid preview before it can publish stale markers.

`bs_transaction_commit` is the planned entry point. It runs the same full
candidate, policy, publication and post-state checks as the research path, but
does not issue an Undo identity or retain history after returning. A non-faulted
operation releases its workspace for the next candidate without a forget call.
Pending preflight preserves the candidate; an attempted publication consumes
it even if the backend rolls back. Faults still quarantine and permanently
disable the workspace. Existing history from a research caller is refused as
busy rather than silently erased. This is orchestration against the backend
contract, not native reader/writer exclusion or a firmware UI implementation.

The baseline is the stock SLICE workflow in the
[Elektron MKII OS 1.40A manual, sections 13.2.2 and 13.2.5](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf).
It documents individual/all-slice deletion and stock settings saving, not a
slice-grid Undo action. At the zero-cross prompt, NO accepts an unaligned grid;
do not map every NO press to cancellation. The full stock 1.40C emulator now
exercises these choices on Flex and Static (BOOT_OBSERVATION.md); the actual
Beat Grid controls and physical-unit comparison remain unimplemented/unverified.

## Retained prototype contract

Apply names the exact prepared candidate. The coordinator acquires the preview
backend's same lock, revalidates the complete candidate, checks the playback
policy and revalidates again before publishing. A no-op candidate writes nothing
and creates no history. Pending locks or preflight callbacks yield without a
write. The lock stays held through publication, refresh and post-validation.

Before an exchange it allocates history identity and enters the guard's writer
lifetime, retiring earlier previews. The backend receives full expected and
desired tables, including all inactive rows. It must return either:

- `COMMITTED`: desired markers and all required native refreshes completed.
- `UNCHANGED`: the complete prior state, including auxiliary native state,
  is intact or restored after an internal failure.
- `FAULT`: neither guarantee can be made.

The coordinator checks metadata and the complete resulting table before
reporting success. Publication cannot return pending: ownership and any rollback
must finish before unlocking. A backend fault or inconsistent post-state revokes
previews, invokes native quarantine while still locked and permanently faults
the journal. Quarantine must independently keep native consumers away from an
inconsistent source. Merely invalidating a preview cannot do that. No such
native quarantine is implemented here, and the coordinator cannot repair an
untrusted backend or an unsafe read after the fact.

A successful Apply stores its own before/after tables and source snapshot in
base-owned storage. It retains no candidate/session pointer. Undo requires its
distinct confirmation ID, unchanged guard revision, owner/source/editor/playback
identity, chosen tempo, metadata and every expected after-row. An intervening
tracked edit retires Undo even if it restores identical bytes. Unselected tempo
changes alone remain allowed. Undo checks playback policy against the complete
table being restored, including its old end/loop points; it is not a
bypass for the audio requirement.

A rolled-back Undo keeps history but issues a new confirmation ID. Counter
exhaustion retires it instead of reusing an ID. A successful Undo consumes the
journal. New Apply calls cannot silently replace existing history: the caller
must explicitly discard it first. Forgetting history does not change settings.
Faulted journals cannot be reused. All calls have one background owner; callback
reentry is refused while a transaction is active.

The host and ColdFire fixtures inject failure after every table scalar and the
auxiliary refresh, model complete rollback, test stale data and identity at
callback boundaries, and exercise session reuse, cancellation, confirmation
replay, exhaustion and quarantine. Those results prove orchestration against
the authored backend contract. They do not prove stock atomicity, cache/ISR
exclusion, actual voice refresh, persistence, audible output or physical Undo.

The pinned target layout uses 4,056 bytes per journal. A journal, preview
session, candidate and guard total 10,092 bytes before any backend/menu state,
code or stack. Plan a real contiguous allocation for this caller-owned state;
zero object BSS does not remove that requirement. See TESTING.md for source
bindings, the full compiled Flex transaction fixture and refresh-order limits.
