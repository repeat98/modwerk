# Serialized preview-session prototype

`preview_session.c` joins the guard, complete metadata snapshot and bounded
reader. It is portable code for a proposed base service, **not an installed
native backend, exported ABI or admission decision**. It never enables the
guard or writes sample audio/settings. Shared-base integration still requires
its own owner review.

The backend supplies nonblocking `try_lock`/`unlock`, `capture` and `copy_ready`.
Every relevant native writer, guard operation, metadata capture, allocation-map
lookup and copy must share that verified ownership boundary. These callbacks
and their context must outlive the session and must not reenter it. All calls
come from one background owner; no scan or IO wait belongs in an audio ISR.

Begin retires the older preview, obtains a unique guard token and captures
nonzero owner/sample/editor lifetimes, source kind/slot, extent, encoding,
sample rate, trim/loop, both tempos, playback-policy generation and complete
active marker records. Flex/Static slots are admitted by shape only; recorder
slots are refused. The backend remains responsible for actual source readiness
and stable ownership. Unsupported encodings, identities or extents are refused.

The session validates that snapshot before each bounded transition, after each
copy and before publishing a finished plan. It compares all active marker
start/end/loop fields, not just starts or the stock slot counter. Only the
selected tempo value participates in comparison; a guard invalidation still
retires everything conservatively. A changed guard or metadata snapshot ends
the session as stale. Postchecks do not repair an unsafe memory read: native
serialization must prevent the race in the first place.

`copy_ready` receives the captured snapshot and exact tagged block request.
It copies at most 192 bytes into owned scratch and may shorten the reply at a
page boundary. The existing decoder validates whole-frame extent and copies
decoded samples before returning. No pool or filesystem pointer escapes. A
pending source or unavailable lock returns promptly. A pending validation after
a copy leaves that block unconsumed; the next attempt validates and recopies it.
External Static prefetch, its cancellation and ownership are not implemented.

Cancel makes later steps inert. Restart obtains a fresh operation identity.
Ready results are revalidated under the same lock, and refusal leaves the
caller's output unchanged. A plan remains a preview: this API supplies neither
native Apply nor permission to alter existing slice ordinals.

Host sanitizers and the same selftest compiled for ColdFire cover 32 full
previews (16/24-bit, mono/stereo, both byte orders, both tempo sources and both
boundary modes), 22 metadata/guard invalidations, chosen-tempo behavior, lock
and source waiting, cancellation/restart, mutation during copy, malformed
replies and unsupported-source cases. See [TESTING.md](TESTING.md).

Missing native writer coverage, shared lock/callback implementation, Static
streaming, scheduling and hardware timing keep this prototype disabled for live
use. Callback count and byte bounds are not a measured instrument time budget.

The 0.1.10 mixed host/stock probe connects these callbacks to actual emulated
Flex page lookup, gain and release. Eight plans match the reference while
keeping PCM/settings unchanged; edits, metadata changes and released slots
retire previews. Identity, lock, rate and tempo remain synthetic. This tests
the proposed callback boundary, not an installed or compiled native backend.
