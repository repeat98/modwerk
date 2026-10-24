# Private recorder-boundary prototype

`recorder_boundary.c` is a proposed base-owned component for the shared source
interface. It is not linked into a released base or Beat Slicer package, has no
assigned hook/event ABI and never enables a production reader. Every portable
call requires the same verified serialization boundary used by source readers
and the other writers; it does not provide that lock itself.

The observer tracks up to eight nested recorder calls by the original caller
stack pointer. Even idle calls have matched entry/return scopes. A selected
state of 1 or 2, or a pending state 1 in the other bank, obtains a unique guard
ticket before stock execution. An inactive selected bank with other state 0 or
retained 2 avoids invalidation. Unknown states, duplicate/mismatched frames,
overflow, invalid retirement and guard exhaustion disable admission for the
lifetime. A fault never prevents stock execution or its normal cleanup/return.
Do not reset the observer to recover or re-enable a faulted lifetime.

This classification comes from the named ordinary-recorder fixtures. It does
not establish all Pickup/overdub behavior or authorize any live read. Normal
panel startup, worker stop/cleanup, UI writers and the shared allocator require
separate coverage; a recorder routine returning does not prove that deferred
cleanup has completed. No source pointer is pinned by this component.

## Private native experiment

`recorder_native.py` verifies the exact private 1.40C MAIN and two replay-span
hashes. It extracts the displaced instructions into private output only. The
entry at `0x400068e4` and epilogue at `0x40007954` each displace eight bytes;
continuation is after the complete span. A conservative aligned branch-encoding
and absolute-literal scan finds no leads into either span's interior. That is
not a complete control-flow or indirect-target proof, nor production site
ownership/compatibility review.

Original assembly saves all D0–D7/A0–A6 and SR in a reserved 64-byte frame,
passes its base to the C observer, restores SR/registers, replays stock and
continues. The saved frame is not placed over the caller's arguments. SR/CCR
preservation matters because the displaced LEA/MOVEM instructions do not reset
condition codes. Native helpers mask only bounded bookkeeping and restore the
caller mask before running the stock body. Physical interrupt latency, cached
aliases and complete task/ISR stack budgets remain unmeasured.

The isolated runner uses the complete stock recorder and real callees, original
synthetic source/allocation fixtures and the compiled observer. It compares 896
pairs: tracks 1/8, both stereo widths, both selected banks, 14 state/allocation
scenarios, four SR patterns and normal/terminally faulted observers. It compares
D0–D7/A0–A6, SP and SR at both displaced-span continuations and final return,
caller arguments and the ordered address/width/value/PC of every non-stack,
non-fixture store. Private and lower-stack canaries must remain intact.

Every observed source mutation holds a native writer ticket. Idle calls still
clear two per-track voice flags at offsets 1/2 of `0x800049d8 + 168 * track`,
from `0x40006b80`/`0x40006b8e`. The runner permits exactly these two byte-zero
stores without a ticket and retains them in the paired stock-write oracle;
it does not broadly ignore voice memory or arbitrary idle writes. This is a
fixture assertion, not a production writer allowlist.

Host sanitizers separately cover all 72 bank/track combinations, eight nested
scopes with an independent writer, and 14 fault families. The same portable
self-test executes on ColdFire before the native fixture begins. Neither set
runs the real scheduler or simultaneous frame interrupt. See [TESTING.md](TESTING.md)
for exact source-bound results and [WRITER_COVERAGE.md](WRITER_COVERAGE.md) for
remaining ownership work.

## Full-boot composition (0.1.41)

`recorder_engine_native.py` composes the same recorder observer with the existing
base-owned engine idle/job topology and one shared guard. Both native wrappers
preserve registers/SR; the queue receive call remains stock. The SDK codegen
helper and engine-site guards have exact revision/hash bindings. Eight audio
pages are explicitly reserved with the pinned arena helper; no unreserved RAM
or production base service is used.

`boot_recorder_engine.py` drives normal start, retrigger and STOP on tracks 1/8
with the scheduler and both DSPs. The observed 32 PCM-prefix stores per track
hold that recorder's native ticket. Three map-tail zero stores per track hold
an engine ticket across the actual command. These span both starts and stop;
they are not all attributed to the final Stop. The selected state clears under
the recorder ticket while an old bank retains state 2. After Stop, a 500 ms
interval has no observed PCM/map stores or recorder writer scopes.

The experiment deliberately records the remaining gap: each track's two starts
perform 24 recorder-bank preparation stores without any ticket, including the
two pending-state publications at `0x40006274`. Full-byte bank watches identify
12 store PCs, each executed twice. These are not discarded or counted as
covered because PCM and deferred cleanup pass. Preparation and other writer
families must be covered before production source admission.

Admission starts closed. The saved project's empty Static editor does not post
a waveform job merely when opened; the fixture uses its previously verified
normal-panel Flex assignment/SELECT ALL path to observe a real job/idle pair.
Preparation changes only settings word 271 from 0 to 44,100, with PCM/controls
unchanged. Recording then preserves the entire prepared source, native code,
reservation canaries and unsaved card. No source reader, physical interrupt
latency, cache behavior, USB or device result is established.

## Whole preparation scope (0.1.42)

Preparation now uses the same balanced scope stack and always obtains a writer
ticket, even before either bank is active. Its entry/epilogue wrappers preserve
the same 64-byte register/SR frame and replay complete eight-byte spans. The
stock preparation frame is 48 bytes. Terminal observer faults still let the
complete stock routine and cleanup return normally. No caller return rewrite
or separate Stop hook is needed for the observed normal Stop inside the body.

The isolated runner adds 192 original/guarded preparation pairs: tracks 1/8,
both stereo widths and banks, start/retrigger/no-command, four incoming SR
patterns and normal/faulted observers. It retains all 896 recorder pairs. Host
tests add eight preparation scopes with nested recorder activity. Full boots
cover the former 24-store preparation gap on each track, including both pending
publications; all five watched state transitions carry the shared recorder or
preparation ticket. The report's `recorderScopes` includes both scope types;
separate native entry counters distinguish them.

Saved caller SR records mask level 5 at both preparation and recorder entry and
return in this emulator fixture. This is actual saved-SR evidence, not an
inference from the paused task/SP, and not a physical interrupt-latency result.
The named preallocated ordinary ONE/MAX cases do not qualify Pickup, overdub,
long dynamic growth, other state values, DMA/cache ownership or every UI writer.
No production source reader is enabled.

## Read-only source composition (0.1.43)

`recorder_source_native.py` adds the existing Flex backend and preview session
to the shared-guard fixture. `boot_recorder_engine.py --preview` tests real
panel recording against current RUNNING and READY tokens, no further PCM lookup
after invalidation, and fresh plans after Stop. T8's editor selection is restored
through T1 before the final preview. Old tokens remain stale across restoration.
The global revision conservatively retires unrelated-source previews too.

The fixture uses fixed lifetimes and zero-argument borrowed-main calls. It is
not the production engine service or an installed package. Complete writer,
owner-transition, cache and physical-time qualification remain required. Its
preparation-call report now separates two actual arguments from adjacent caller
storage; prior four-word reports were raw observations, not a four-argument ABI.

## Engine service composition (0.1.44)

`recorder_service_native.py` replaces the borrowed-main session consumer with
the copied `preview_async` exchange and one stock-engine consumer.
`boot_recorder_engine.py --service` requires engine-only PCM lookup task
identity, exact whole plans, recording invalidation/recovery and balanced wakes.
The producer issues only zero-argument request/result calls. The recorder and
preparation wrappers still share the same guard; the original receive remains
stock. Only an exact pending immutable service wake avoids writer treatment;
ordinary commands, including waveforms, remain conservative. Fixed ownership,
production API/UI integration, full writer/cache coverage and hardware remain
separate requirements.

## Service lifecycle probes (0.1.45)

`boot_recorder_engine.py --lifecycle` additionally exercises a foreign queued
record while an owned wake is pending, WAITING without self-posted polling,
cancellation before writer retirement, and permanent fixed-owner revocation.
It records the actual job pointer, ownership decision and pending flag under
the same native lock. The test never frees callback or queued-record storage;
it is not production loader reclamation. Unknown/ordinary messages remain
writers even when their payload matches the service wake.

## Resident UI composition (0.1.46)

`recorder_resident_native.py` and `boot_resident_native.py --scenario recording`
combine the three native observers with immutable resident menus and copied
UI/engine intents. In the named private 1.40C MKII emulator fixture, TRACK + REC1
closes the popup and returns to playback. Cancellation follows that stock
transition; Stop cannot resurrect it. Fresh work requires a new normal editor
opening. Both menu layouts and the conservative waveform-refusal case are
recorded separately. Fixed menu storage and private positive-run waveform
classification remain research limits, not production owner admission.
