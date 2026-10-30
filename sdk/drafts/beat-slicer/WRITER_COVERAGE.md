# Live-reader writer coverage

Status: investigation for the shared-base service, **no installed production hooks or
complete writer coverage**. Live reading and Apply remain unavailable. These
addresses identify routines executed from the private, hash-bound original
1.40C MAIN; they are not exported SDK functions or approved patch sites.

## Executed in synthetic memory

The coherence runner exercises the following operations without mocking their
callees. `TESTING.md` and `evidence/stock-writers.json` bind the exact source,
emulator executable and private MAIN. All PCM, slots and allocation geometry
are authored fixtures. The scheduler, filesystem, DSP and hardware do not run.

| Operation | Entry under investigation | Coverage |
| --- | --- | --- |
| Rotation | `0x40094b6c` | Eight calls, four formats, repeated edits |
| Stereo polarity | `0x40094c94` | Twelve calls, two packed widths, three channel modes, page boundaries and repeated edits |
| Stereo channel processing | `0x40094dc8` | Eight sum/difference/swap fixtures across page boundaries |
| Copy/mix between slots | `0x40094fa4` | Sixteen fixtures: four formats and four modes, source page crossing, destination-only changes |
| Reverse | `0x40095268` | Four page-crossing fixtures with the exercised inclusive endpoint convention; the UI's complete range convention is unproved |
| Fade | `0x40095394` | Eight four-frame fades with independently calculated PCM |
| Gain | `0x40095560` | Eight zero/half-gain fixtures |
| Normalize | `0x40095774` | Four constant-amplitude fixtures plus four silent-input failures |
| Release | `0x40096300` | Three existing counter/wrap, page-clear and temporary-map fixtures; no live ownership guard proved |

Each of the 68 successful in-place/copy edit calls above writes its
destination's dirty byte before PCM. A repeated store remains observable when
that byte is already set. None writes the tested slot-control region, including
the counter and busy field. PCM stores execute with interrupt masking, but
instruction observations find the original unmasked state **between** stores,
before the operation has finished. This is an isolated execution observation,
not proof that the live scheduler actually interleaves at that point.

Silent normalization returns `-1` after marking the destination dirty, with no
PCM or control stores. Thirty-five additional busy/pool/slot/range refusals
across channel processing, reverse, fade, gain and normalization perform none
of those stores. Existing polarity refusals cover eight more cases. These are
specific fixtures, not a general promise of stock error atomicity.

## Executed worker lifetime

The 0.1.5 runner adds seven groups bound in `evidence/stock-worker.json`.
It executes the real engine-task prologue at `0x4008445c`, queue post/receive
at `0x40000c3c` / `0x40000d00`, and dispatch from the loop at `0x4008484e`.
Only message display is mocked. The rings, slots, PCM and completion-pool
occupancy are synthetic; no stock tables or code bodies are reproduced.

- Four zero-gain producer calls (`0x40074694`, one per packed format) set
  editor busy and enqueue a pointer without editing PCM. The worker dequeues,
  edits the exact page-crossing range, returns from the writer and posts a
  completion record. The queue count is already zero during PCM writes.
- Seven dispatch cases cover gain, normalize, reverse, rotate, channel swap,
  polarity and fade. The traced writer returns before completion is attempted;
  the task then restores its loop stack/frame and interrupt mask. Busy and
  empty-range gain refusals return `-3` and `-2` through deferred completion
  without PCM/dirty mutation.
- Completion helper `0x40084110` queues a UI record containing callback/result,
  rather than invoking it. The fixtures leave the UI consumer unexecuted and
  editor busy remains set after the producer-originated edit. A null callback
  or all 32 completion records occupied still permits the edit to finish, with
  **no UI notification enqueued**. Do not release writer exclusion from this
  optional notification.
- Two pending edits execute FIFO with separate completion records. Thirty-five
  standalone posts/receives exercise ring wrap below capacity. An unknown
  opcode drains without completion; an empty worker reaches the event-wait
  entry, where the test stops before running the scheduler.
- Calling the same producer twice while deliberately bypassing the outer panel
  preflight queues the same global command pointer twice. Both executions then
  observe the last payload. This tests pointer ownership; it does **not** show
  a reachable stock UI bug or prove how the real panel blocks repeated input.

These results identify boundaries to investigate, not production hook sites.
The historical 0.1.5 trace omits crop, release and copy dispatch; the extension
below adds those cases. Other engine opcodes/callers, actual UI completion
consumption, scheduler wakeups, cancellation, reentrancy and recorder writes
outside this worker remain unproved. Queue capacity/overflow is not qualified.

## Admission guard and remaining edit dispatch (0.1.6)

The expanded nine-group runner (`evidence/stock-guard.json`) binds the original
portable guard into its executable and observes the stock instruction stream.
This guard runs on the host alongside the emulated CPU; it is not a native
hook. Each observed writer entry retires a previously acquired token, PCM
writes refuse new tokens, and actual return reopens admission with a fresh
identity. This also works for refused edits and absent UI completion.

Added dispatch coverage:

- Copy (`0x40094fa4`, opcode 29) copies a distinct stereo source into a disjoint
  range in the same slot, preserving the source and all other frames. Earlier
  coherence probes separately cover cross-slot copies; this worker case does
  not establish all overlap/range conventions.
- Crop (`0x40095cd8`, opcode 27) enters rotation internally. The guard tracks
  both tickets; rotation's return leaves crop's exclusion active. A successful
  fixture changes length/counter and returns through deferred completion.
- Crop's empty-range refusal returns `-2` **after incrementing the stock slot
  counter**, without dirty/PCM writes. Error return alone is not proof that
  source metadata remained unchanged. Full slice/trim preservation and crop
  range semantics remain outside this fixture.
- Release (`0x40096300`, opcode 28) clears the two owned pages, empties the slot
  and allocation count, and advances its counter. It returns to the worker loop
  without attempting the UI completion helper. The now-idle guard does not make
  that empty slot readable: the provider must separately validate the source.

See [PREVIEW_GUARD.md](PREVIEW_GUARD.md) for capacity, revocation, exhaustion
and serialization requirements. The guard is disabled by default and remains
outside the base ABI. It cannot compensate for an unobserved writer.

## Recorder outside the edit worker (0.1.7)

`evidence/stock-recorder.json` adds three groups (20 calls) from the complete
ordinary-recorder entry `0x400068e4`, with real callees, synthetic already-active
state and silent inputs. It does not boot the OS or invoke an audio interrupt.

- Sixteen successful page-crossing calls cover packed 16/24-bit stereo, tracks
  1 and 8, both recorder state banks, and preallocated versus lazy second pages.
  Exact PCM extents and untouched pages are checked. The call writes PCM with
  an empty engine queue and no dirty-array or recorder-slot counter stores.
- Lazy allocation takes the high end of the shared free-page interval, clears
  both free-list mirrors, publishes the recorder page and updates page count
  and logical extent. Those map changes and the active position updates precede
  this call's PCM packing. Thus an advanced position is not a completed-write
  barrier. Stores retain the fixture's unmasked caller state; the real caller's
  interrupt level, interleaving and latency are not established here.
- Inactive state and a zero-frame call return without PCM/map changes. With the
  first page present and the second unavailable (pool empty or dynamic allocation
  disabled), segment preparation reaches frame 1024, then stop resets the active
  position/state and publishes 1024. The routine returns zero, with **no PCM from
  this call written**, one engine follow-up (opcode 34) and one UI notification.
  This synthetic partial-preparation case is not a claim about an audible stock
  recording fault. Queued follow-up execution was not tested in this 0.1.7 trace; the later
  recorder-stop section covers two shortage paths and length-limited stops.
- A host guard enters before the complete call and leaves on its actual return.
  PCM, map and position stores refuse new tokens; old tokens remain invalid
  afterwards, including early exits. This does not install native hooks or make
  a recorder source readable after return. Source state and queued follow-up
  writers need separate validation and coverage.

These calls cover neither arming, Pickup/overdub, reverse recording, non-silent
mixing, stop finalization nor scheduler/ISR behavior. Shared allocation means
excluding only recorder slots from preview does not establish pool ownership
for Flex readers. All allocator and copy boundaries still need serialization.

## Flex replacement refusals (0.1.8)

`evidence/stock-load.json` exercises the complete loader entry `0x40096548`.
Directory/open/close and decoded-header callbacks are explicit synthetic mocks;
string handling, nested release and allocation checks run as stock code. Twelve
failed replacements cover slots 0/127 and directory, extension, open, header,
encoding and insufficient-page failures. Two additional cases refuse an
unavailable pool or slot 136 without mutation.

Every tested replacement failure has already called release, cleared the two
old PCM pages and advanced the slot counter twice (41 to 43). The survivor's
allocation offset moves from 2 to 0 while its PCM/control record stays exact.
Opened synthetic handles close on header/encoding/allocation failure. The
allocation failure retains proposed length 10000 with error state and zero owned
pages: a nonzero length is not readiness. No actual file read is qualified.

The host guard spans the whole loader call and tracks nested release separately;
the inner return cannot admit a preview. Failure retires the older token just
like success would. Successful replacement, actual WAV decoding/copying,
recorder load paths, panel/worker post-load refresh and live interleaving still
need coverage.

## Consequence for the base service

An epoch increment at a dirty store can retire old previews, but cannot by
itself protect a **new** preview acquired midway through an edit. Nor can the
unchanged busy field establish that copying is safe. The base must establish
an operation lifetime: retire old tokens before mutation; refuse snapshot/read
acquisition while the writer is active; release that exclusion on every
completion/failure path. Repeated/no-op/failed edits must not accidentally
reactivate an older token. Cross-slot work must identify the destination.
An empty queue cannot admit a new preview while its dequeued writer runs.
Completion/cleanup must track execution even if UI notification is absent,
and owned identity must not depend on a reusable command-record pointer.

The instrumentation here only observes stores and instructions. It does not
install a dirty-store hook, synthesize native revisions or implement a lock.
Masking a bounded read protects that copy only after the larger writer and
allocation ownership rules have been established.

## Missing evidence before live-provider admission

- Extend the executed operation-handler/worker trace to the actual panel
  preflight and UI completion consumer, every caller and remaining opcode.
  Prove live cancellation, reentrancy, wakeups and serialization; the synthetic
  FIFO cases alone do not prove those behaviors.
- Extend crop/release range and allocation coverage; cover slot load/replacement,
  project/sample reload, remaining recorder modes/follow-up execution, overdub
  and every other PCM writer. Enumerate
  cached/uncached aliases and writes that do not touch the dirty array.
- Prove map ownership and coherent source format/extent discovery during each
  bounded copy. Release can change a surviving slot's map without changing its
  control record. Recorder allocation now runs in isolation; the current probes
  still do not interleave an allocator, recorder or reader.
- Cover trim/loop/markers, chosen tempo, editor/sample switch, owner replacement
  and removal. These must invalidate the right operation without using slot
  number, filename or counter reuse as identity.
- Establish Static file/stream lifetime separately. No Flex fixture proves it.
- Review whole-instruction guards, all incoming branches, ABI/register/stack
  behavior, resource limits and compatibility before proposing shared hooks.
  Qualify exact browser/USB packages and real device behavior afterwards.

Do not enable a partially covered provider. These observations refine
[BASE_CONTRACT.md](BASE_CONTRACT.md); they do not satisfy its admission gate.

## Normal recording and recorder banks (0.1.39)

`boot_recorder.py` uses ordinary MKII panel keys on a disposable stock 1.40C
project with both DSPs and the scheduler running. TRACK + REC1 starts an
ordinary recorder in the fixture's ONE/MAX mode; repeating it restarts in the
other bank, and STOP ends recording. Tracks 1 and 8 are exercised separately.
The recorder is preallocated 460 pages in this fixture; these short runs do not
exercise dynamic growth or Pickup/overdub. The unrelated full Flex PCM,
controls/settings and private card stay unchanged.

The pending state byte `1` is published within a four-byte store at
`0x40006274`, beginning two bytes before the observed state field. The complete
recorder entry changes it to `2` at `0x400069e6` and switches the selected bank.
Retriggering leaves both banks marked `2`; only the selected one advances.
STOP changes the selected state to `0` at `0x40005e9e`, leaving the old bank's
`2` and position intact. A further idle interval leaves the published state and
observed PCM/map spans unchanged. A selected-bank-only activity check can miss
a pending start; an indiscriminate nonzero-bank check can confuse retained state
with active recording. This is evidence for an ownership contract, not a
production activity predicate or installed recorder hook.

Selected recorder calls in these runs return to the two stock frame-dispatch
sites `0x4000d342` and `0x4000d36e`. PCM-prefix stores provide positive controls,
and the scenario observes stores of zero to the map tail at `0x40095afc`. Counts and exact
caller/state observations are in the source-bound reports; they do not provide
an SR measurement, complete write footprint or hardware timing. No device is
used, and no module code is injected into these full boots.

`recorder_bank_probe.cpp` separately executes 48 synthetic complete-entry cases:
idle banks, retained inactive state, immediate pending start, delayed pending
start, active recording with a longer pending delay, and active recording with
a delay shorter than the supplied call span. Both stereo widths, tracks 1/8
and both selected banks are covered. Sixteen extra calls bring an idle pending
delay to zero, then execute its start. Exact watched PCM regions, map/dirty/
counter behavior, state/position transitions and host guard exclusion are
checked. The short-delay fixture retains its delay while the active bank writes;
it is not a claim about how the real frame caller schedules a pending trigger.
Caller state and source/allocator geometry remain synthetic; no native guard,
complete caller coverage or physical reader exclusion is established.

## Normal panel-to-worker reverse path (0.1.17)

`boot_writer.py` adds a full stock 1.40C emulator path with real frame/task
scheduling and both DSPs, using only normal panel actions on a disposable
project. Two reverse operations enter `0x40095268`, return through `0x4008594c`,
post through `0x40084110`, and reach the real UI callback `0x40075564`; waveform
completion `0x40077a5c` follows. Editor busy is set and cleared on the UI task;
the dirty store occurs on the engine task. The complete slot control record
remains unchanged even though the first operation changes PCM. Individual
frame values can coincide; the comparison covers the complete payload. The second restores the original PCM. This confirms one successful
UI completion path, not missing/exhausted completion handling or all writers.

The observed whole-selection end argument is inclusive in this routine and
includes one allocated frame beyond the logical source. The test models and
checks that explicit endpoint behavior; ordinary frame-count reversal failed
its independent oracle. Do not borrow this convention for the module's bounded
reader, or call it a hardware defect from emulator evidence alone. See TESTING.md
for the classification of separate waveform work, exact metadata scope and
remaining native ownership/playback limits.

## Confirmed slice deletion (0.1.18 research)

The isolated `clearing_probe.cpp` executes stock clear-all callback `0x40071eb0`
and individual-delete callback `0x40073064` on Flex/Static slots 0/127. Its 88
clear-all and 56 single-delete cases cover cancellation, empty/full tables and
first/middle/last selections. The host guard surrounds each confirmed callback
through its return, including pointer/selection refresh; this is proposed
instrumentation, not installed native hooks or a verified lock. Cancel performs
no table write and leaves the model preview valid. Confirmed callbacks retire
old model previews; fresh admission resumes only after the callback returns.

Clear-all changes only the count, retaining inactive records. Single deletion
moves the selected record to the old last row after replacing its start with a
sentinel, reduces count and preserves remaining complete records. Table stores
are interrupt-masked in these isolated calls, while refresh continues after
the mask is restored. Source controls and the other settings arena stay exact.
The fixture mocks formatting/messages, viewport and the single-delete task
follow-up; it does not prove live task/ISR exclusion or audio behavior.

Stock refresh reads a retired row in 28 clear-all and 12 single-delete cases
in this synthetic matrix, consistent with the earlier refresh probe. This is
not a demonstrated physical fault and the module does not change stock clear.
Its own publisher must still retire selection before rebuilding shorter tables.
The separate full-stock `boot_slices.py` passes normal menu/deletion paths.

## Ordinary Flex waveform reads (0.1.25)

The coarse engine observer retired an automatic preview during recurring stock
waveform work, without a sample edit. The private trace identifies command 16;
its kind-1 ordinary Flex path reaches `0x4008e3d8`. Static uses another renderer,
and slots 128–135 reach recorder helpers outside this qualification.

The original `waveform_probe.cpp` executes 48 fresh/cached renderer calls across
four packed formats, slots 0/127 and three bin widths, crossing page and logical
end boundaries. All 102 bins per fresh call match an independent extrema/extent
oracle. The
fresh path reads PCM; the repeated matching display cache reuses its bins with
no PCM reads. Stores stay within the observed stack, display, progress and
cancellation regions. Watches find no source-pool, slot-control, sample-setting,
map, allocation-count, format or dirty stores. The inherited display mock is
asserted unused. A complete kind-1 command dispatch returns to the worker loop
and posts its deferred completion without source writes.

Two further cases cover an unavailable pool and a busy slot. The unavailable
pool yields zero extrema; the stock renderer still reads the busy slot. That is
not permission for a preview provider to ignore busy state: its own admission
and coherent-source checks remain necessary.

The automatic UI fixture narrowly classifies ordinary Flex waveform reads,
keeping unknown, Static, recorder, fault and reentry cases conservative. This
is not a production command ABI. Its stopped source and command inputs are
fixed; stability of mutable queued records is not a proved base-owned lifetime.
The generic `engine_boundary.c` remains conservative. Full writer coverage,
cache behavior, source lifetime, shared-base integration and hardware remain
unqualified. Source-bound reports and actual automatic-UI outcomes are listed
in TESTING.md.


## Queued recorder-stop cleanup (0.1.36)

The new `recorder_followup_probe.cpp` executes the actual opcode-34 command
queued by the complete ordinary recorder entry. Thirty-two scenarios cover
packed 16/24-bit stereo, tracks 1/8, both state banks, exhausted or disabled
allocation, and stops at two configured length limits. Sixteen original
preallocated/lazy recorder calls remain as positive controls for the inherited
PCM and map watches. Active state, input buffers and allocation geometry are
synthetic; the audio ISR, real scheduler and UI consumer do not run.

The queued records are separate per track and contain a track index; they are
not one shared track-bitmask record. Worker startup and command dispatch are
observed separately. During dispatch the queue count is already zero while
the command stores zero to each recorder-map entry beyond its allocated page
count: 14,601 stores with one allocated page, or 14,600 with two. The allocated
entries stay intact. In these scenarios the tail was already zero, so stores
are observed even though the complete map remains byte-identical.

The follow-up does not change the post-stop PCM, sample controls, allocation
counts, recorder-state banks or free-page cursors in these fixtures. Length-limit
recording has already written its final two/four frames before queuing cleanup;
shortage recording wrote none from that call. Comparing post-stop preservation
separately avoids claiming that the complete recording operation changed no PCM.

The host observer spans the entire command. A separate execution substitutes
only the engine receive call with the original compiled worker-boundary prototype
and checks its native ticket at every map store. It remains active through
return to the loop, then retires at the next receive before the empty-queue
wait; the wait is unmasked. Loop stack/frame and caller mask remain as expected.
No production hook is installed. Manual stopping, Pickup/overdub, other
finalization paths, live interleavings, allocator ownership and physical timing
remain unqualified. These observations do not reopen source admission.


## Two pending recorder cleanups (0.1.37)

Four additional scenarios run the complete shortage-stop call for tracks 1 and
8 before starting the worker, across both stereo widths and state banks. The
recorders own distinct synthetic pages and enqueue separate per-track command
records in FIFO order. The first cleanup writes only track 1's unused map tail
while another command remains queued; the second writes only track 8's tail
with the queue count zero. Post-stop PCM, full maps, controls, page counts,
recorder-state banks and free cursors stay byte-identical. Both shortage UI
notifications remain queued and unconsumed.

The compiled observer supplies a newer ticket and revision to the second
command and retains each ticket through the corresponding return to the loop.
Only the final empty receive ends the second ticket before the unmasked wait.
The 32 single-recorder scenarios and 16 original recording positive controls
remain in each run. These are two serialized recorder calls with pending work,
not simultaneous ISR execution or proof of shared-pool scheduling.

## Compiled recorder lifetime (0.1.40)

The private [recorder-boundary prototype](RECORDER_BOUNDARY.md) now brackets the
complete ordinary-recorder entry and common return with compiled ticket
bookkeeping. Paired original/guarded calls preserve register/SR state at both
continuations and final return, caller arguments and every external store,
including cleanup when the observer is terminally faulted. Inactive/retained
calls avoid invalidation but still clear two exact stock voice flags; these
remain in the paired oracle rather than being mistaken for PCM/source writes.

This extends isolated execution evidence only. It does not connect the guard
to a source reader or cover panel arming, stop/worker cleanup, Pickup/overdub,
DMA, cache aliases or concurrent interrupts. The normal-panel full boot and
compiled worker guard remain separate experiments until explicitly composed.

## Full-boot recorder/engine composition (0.1.41)

The compiled recorder and engine observers now share a guard in a private
reserved-memory full boot. Normal starts/retriggers and STOP on tracks 1/8
place each observed PCM-prefix write under the recorder ticket and each map-tail
cleanup store under the engine ticket. The original receive call is retained,
entries/returns balance and all scopes retire before the idle checkpoint.

The same chronological trace identifies 24 unguarded preparation stores per
track, at 12 PCs in the normal preparation routine. Both pending-state
publications occur before the active recorder scope. These were an explicit
qualification gap in 0.1.41. The later preparation scope below covers them in
the same named fixture; protecting PCM alone was insufficient. No production
reader or complete writer coverage is enabled by either experiment.

## Preparation and recorded caller mask (0.1.42)

The full-boot composition now brackets complete preparation calls before pending
state publication. Both tracks pass with zero uncovered watched recorder-bank
stores, while retaining PCM/cleanup ticket checks and unchanged source/card
assertions. Paired complete-routine comparisons preserve the original calls,
including cleanup after observer faults. Saved SR at entry and return records
mask level 5 for both preparation and recorder callbacks in this pinned emulator.

This closes the observed preparation gap, not every source-writer family.
Preallocated ordinary ONE/MAX recording is the tested mode; Pickup, overdub,
long growth, unknown states, UI writers, allocator/DMA/cache ownership and
physical latency remain open. A compiled provider is not yet attached here.

## Fixed-source preview interruption (0.1.43)

A private Flex session now shares the recorder/preparation/engine guard during
the normal panel sequence. Current RUNNING/READY tokens retire before another
PCM lookup; Stop and normal editor restoration do not revive them. Fresh plans
match the host PCM oracle. The global guard is deliberately conservative across
unrelated sample/recorder slots. This connects the tested writer families to a
real copied-read pipeline, but its source/owner identities and borrowed-main
consumer remain synthetic. Other writers, cache and production scheduling are
still admission gaps.
