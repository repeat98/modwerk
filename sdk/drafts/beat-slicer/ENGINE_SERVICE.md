# Private engine-owned preview service

This is an emulator experiment for the existing base-owned idle/job topology.
It does not publish an event/ABI, change the production base, admit live source
reads, or provide a USB-installable Beat Slicer package.

## Command boundary

`engine_boundary.c` adapts the guard to separate idle and job notifications.
Initialization revokes admission. The job notification begins exclusion before
dispatch, including when installation happened during an older receive. The
next idle notification retires only that command's ticket, before a shared idle
service may acquire a source. An independent writer retains its own ticket.
Reentry, missing retirement and identity exhaustion fail closed. Engine-only
quiescence never establishes recorder/UI/cache ownership or enables admission.

The private compiler uses the same hash-guarded idle and job sites as the base
logger, saves all data/address registers and replays the displaced instructions.
Replay bytes are extracted from the exact private stock image into private
output only. The stock receive call remains unchanged. The actual base's USB,
module-set and logging chain is not installed by this fixture; its integration
order still needs review and exact-build qualification.

## Bounded work and waking

`test_engine_service.c` makes the engine task the sole mutator of a preview
session. Main/UI entry points only publish a request or cancellation. The idle
service first retires the previous command, then performs at most eight explicit
session step calls, plus an optional begin call (which includes initial capture
and planner setup). Planning and decoding remain outside the source copy lock.
This is a work-count limit, not a physical CPU-time guarantee.

A coalesced immutable message wakes the engine for remaining work, using the
stock queue rather than a separate clock. Only that exact message address with
an outstanding wake is exempt from command invalidation; another message with
the same opcode remains an ordinary command. Its storage stays pinned for the
whole boot. No module can supply an arbitrary exemption or borrowed pointer.

WAITING does not immediately repost itself. It requires another readiness or
cancellation event; otherwise a bounded callback could still create an endless
polling loop. The test uses an independent synthetic writer and an explicit
readiness notification. It does not implement native Static prefetch, genuine
source readiness or wake retirement during package removal.

## Evidence and remaining work

`test_engine_boundary.py` and `engine_boundary_native.py` cover 120 command
lifetimes, closed bootstrap, independent writers, reentry, invalid retirement
and exhaustion. `boot_engine_native.py` exercises ordinary stock reverse and
waveform commands at the two existing hook sites. `boot_engine_service.py`
exercises complete previews through engine events without driver step calls,
waiting/resumption, pending cancellation, foreign wake invalidation and stock
reversals. `boot_engine_formats.py` extends the private engine-preview path to
retained 16-bit and 24-bit mono/stereo sources loaded through stock. Its driver
writes an original three-word mailbox while the emulator is paused, then calls a
zero-argument native wrapper; native C performs argument cleanup. A main-stack
comparison brackets the request scenarios. This is a driver fixture, not a
production concurrent UI mailbox or live publication protocol. Consult TESTING.md
and source-bound receipts for actual run outcomes.

The separate `preview_async.c` prototype replaces the paused driver's mailbox
with ownership-protected copied UI intents and results. `test_async_boot.c`
services it from the engine while `test_async_tick.c` calls the UI adapter once
per ordinary tick. The asynchronous fixture uses one work call per engine
callback, at most eight private reader transitions and one live copy, plus
optional begin/setup and result validation. This differs from the older manual
service's eight one-transition steps. UI code never owns the session or reader. The proxy checks
accepted cancellation/replacement again before capture and PCM copy, including
after unlocked private work. Every accepted intent must independently wake the
engine, including one accepted after a service selected its local return state.
See PREVIEW_ASYNC.md for the contract and NATIVE_UI.md for the combined fixture.
This remains test-owned integration, with the same admission and lifetime gaps.

All of these use the exact stock image, a disposable card copy and an explicit
eight-page reservation. Source/owner identities, admission and full interrupt
masking remain test-owned. Recorder and other writer coverage, source lifetime,
UI/loader serialization, cache coherency, whole-chain stack and physical timing,
companion compatibility, Apply/playback, browser packages and USB lifecycle
remain qualification gaps. No hardware result is implied.
