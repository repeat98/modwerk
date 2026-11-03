# Proposed asynchronous preview exchange

This fixed-storage prototype connects copied UI intents to one engine-owned
preview session. It is not a base ABI, native admission service, loader lease,
marker transaction or installed module. Actual test outcomes belong in TESTING.md.

The UI calls request, cancel, state and result APIs. It never reads or mutates the
session, reader or planner storage. Each accepted request/cancellation advances a
monotonic sequence. A replacement can supersede an in-progress request; old
results cannot be read under the new sequence. Exhaustion fails closed instead
of reusing an identity. Owner revocation is permanent for this service instance.

Intent fields and result publication use the same nonblocking ownership boundary
as the source backend. If that lock is unavailable, an intent has not been
accepted and the caller must retry on an ordinary event. An accepted cancellation
prevents the next old-request capture or PCM copy. It may leave bounded private
arithmetic to finish; it does not mutate the engine's session from the UI task.
The backend proxy rechecks the active/desired sequence under ownership before
both capture and copy, closing the gap between unlocked planning and reacquiring
for a live read. Complete source writer coverage remains independently required.

The single engine consumer accepts a budget of one to eight work calls per
invocation, plus optional begin/setup and result validation/publication. Each
work call performs at most eight private reader transitions and at most one live
PCM copy, with revalidation before that copy. The current native fixture uses
one work call per callback, selected by measuring both total work and the longest
callback. `last_steps` counts work calls, not private reader transitions. A pending begin
returns without an immediate retry. WAITING needs an external readiness or intent
event; this component does not post messages or implement its own clock. Native
integration must preserve the existing engine event order and coalesce wakes
using immutable owned identity. Every accepted UI intent needs its own wake or
ordinary-event guarantee: it can arrive as service releases its final lock,
after the local return-state value was chosen. The copied request-tagged state,
not that earlier return alone, determines what the UI may show. Work counts do
not establish physical timing.

A completed plan, existing count, request sequence and guard token are published
under ownership. UI reads copy a complete result and reject a mismatching request
or invalid guard token, leaving the caller's output unchanged on failure. The
engine must continue revalidating READY metadata through its normal events.
The getter does not independently recapture metadata: incomplete native metadata
revision coverage remains a qualification gap. A copied preview never grants
permission to Apply markers; confirmed publication requires its own current
source/marker validation and atomic transaction.

Initialization happens once before exposing the object. Backend/context, guard
and storage must outlive all callbacks, requests and queued wakes; revocation
does not prove those references have retired or authorize freeing memory. The
one engine consumer cannot run concurrently with itself. Nested service calls
are refused without changing the outer session. Caller buffers must not alias
the service object. Actual UI/loader detachment remains a separate requirement.
