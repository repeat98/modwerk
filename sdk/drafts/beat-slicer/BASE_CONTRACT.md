# Sample-editor service proposal

Status: private staging for owner review, **not a released ABI or module capability**.
The new `ot_sample_editor_actions` table is appended at index 32, with pinned
native seams and default-base refusal. The source interface is in
[`modwerk_sample_editor.h`](../../machines/octatrack/include/modwerk_sample_editor.h).
`--sample-editor` enables the private base integration; this does not publish it.

## First basic device version: exact metadata grid

The owner chose a usable basic slicer first. Both file-backed Flex and Static
use the AED slice commands, with separate source tables. The base coherently
copies frame count, 44.1 kHz stock frame domain, trim, sample/project tempos and
all 64 complete slice records. The independent package computes exact geometry
and requests confirmation. It receives no native source or PCM pointer.

The base owns the menu, immutable owner-bound tokens, stock question, final
source revalidation and atomic marker publication with verified failure rollback.
Playback and recording must be stopped; recorder buffers are excluded. Use
stock DELETE SLICE / DELETE ALL SLICES afterwards, without an added Undo history.
Ordinary stock playback is the basic policy. PCM analysis, SMOOTH and enhanced
playback processing are deferred, with no click-free claim.

Host and target checks now cover the shared service and independent package;
normal-boot menu/USB, companions and exact hardware qualification remain in
progress. Review the exact shared service and source-built native/browser
candidate before a device trial. Use a disposable project/sample copy and a
new explicit RAM-boot/sample-edit authorization; the fixed-input probe's old
permission does not apply. Keep physical self-test, Undo, audio and persistence
results separate from emulator evidence. No implicit save, flash or Keep.

## Preservation rule

The service operates on complete records, not an array of start positions.
An existing record's start, end and loop must remain identical. Its ordinal
also matters: a pattern can refer to a slice by number. Stock sorts records
by start, so inserting an earlier start can change the meaning of such a
reference even when every old position survives.

The proposed first policy is **preserve ordinals or refuse**. Simulate the
result first and return an explicit index-conflict result if any existing
record would move. Do not rewrite patterns, locks, Parts or other tracks to
compensate. Do not ask the user to silently accept lost preservation. This
allows a new grid on an unsliced sample and additions that keep all existing
ordinals; it deliberately cannot apply every merged grid on a sliced sample.
The owner must review this restriction before it is represented as supported
module behavior. Preview can still show why a proposed merge was refused.

The [marker preflight prototype](MARKER_EDIT.md) now enforces that conservative
policy on complete in-memory tables, preparing before/after snapshots without
native writes. It retains inactive rows for exact restoration and exposes only
table equality checks for internal rollback and retained history research. The [candidate binder](EDIT_CANDIDATE.md) now connects these tables to an exact
portable preview and unique operation ID. The [transaction coordinator](EDIT_TRANSACTION.md) now manages exact confirmation,
post-state checks against an atomic backend contract. Its commit entry point
retains no user history; the older Undo API remains research. Those older portable prototypes contain no native callbacks or publication.
The private basic adapter now implements them; end-to-end and hardware
qualification remain open.

Beat Slicer submits requested additions, not replacement records. The base
retains existing records itself, constructs new records with verified stock
endpoint conventions, and validates minimum lengths and total capacity.
Overlaps, disabled loops, duplicate starts and starts outside trim require
explicit tested rules. Unknown cases are refused; existing records are not
sanitized as a side effect of preview or cancellation. The current planner's
out-of-trim refusal is a limitation, not a native preservation implementation.

## Earlier PCM-capable proposal: menu registration and lifetime

Add one named action to the SLICE action menu, preserving every stock row and
callback. The registry owns ordering and rejects duplicate action keys. A
module claims its action name, not the whole screen or stock YES gesture.
The existing runtime loader does not admit arbitrary contributed tables;
the shared change must provide reviewed typed admission and removal.

The [typed contribution prototype](MENU_PACKAGE.md) now bounds and copies a
proposed descriptor from an exact published owner's initialized image. It
resolves only the admitted action through the full owner lease. This is not
loader preflight or an assigned table ABI; coherent metadata capture, native
transition hooks and full-set readiness remain requirements.

The stock menu keeps its label, callback and selection-output pointers after
the open routine returns. They therefore cannot point to temporary stack
arrays or a module that may be removed while the menu is open. The base owns
the composed arrays and copies bounded labels into its own storage. Entries
use base-owned dispatch functions; the base resolves the action's module id,
package generation and action id while holding the loader's live-owner guard.
Never retain an unguarded function pointer into the module pool.

Selection stores the selected row, closes the menu and invokes the callback
synchronously through a null-safe indirect-call helper. A callback that starts
background work returns promptly; the base owns the job token and cancellation
path. A captured menu generation is invalidated on menu replacement/close,
sample switch, owner replacement or removal. No action row can acquire a new
meaning by reusing the same index while an earlier activation remains live.

A no-argument callback address alone is not selection authority. Capture the
opening's task/table/row/callback/owner/epoch before native close, arm only at
the verified direct-dispatch tail, consume once and retire after callback
return. Refuse nested dispatch before it can borrow the outer context. The
[selection prototype](SELECTION_CONTEXT.md) tests this contract with pinned
storage; it does not prove the production UI/loader boundary or detachment.

Removal must cancel the preview and retire menu/job references before module
memory is reclaimed. It must return busy while a callback is actually running.
Loader stack/register scanning alone cannot discover a retained heap/global
pointer. Test closing, replacing and removing at each callback/job boundary.

The [menu composition prototype](EDITOR_MENU.md) implements copied labels,
identity-based dispatch, deterministic contribution ordering and explicit
retire/detach states under a required stable caller lock. The private full-boot
[native UI fixture](NATIVE_UI.md) now renders and selects an appended action in
both stock menu variants and cancels read-only previews. Its fixed storage stays
pinned forever. The native loader lock, admission, actual detachment and removal
hooks remain unimplemented; dismissal is not permission to reclaim pointers.

The [resident-menu experiment](RESIDENT_MENU.md) keeps two immutable layouts
for one fixed owner generation and can reopen after native dismissal/dispatch
return. It never rewrites a retained table or claims it is detached. Owner
retirement withdraws the action but leaves storage pinned. A production registry
must additionally handle replacement, changed contributions, actual owner
records and reclamation; this experiment deliberately does not provide them.

Owner admission must distinguish ledger retention from current publication.
The real loader keeps intact candidate and rollback-owner records; validate the
full record and its exact live position, then the registry/module-set readiness
contract. A fixed-lifetime activation must stay retired if the old image is
restored later. Explicit pre-transition retirement is required because a query
can miss an entire replace/restore interval. [The owner helper](MENU_OWNER.md)
checks these rules with actual-loader host and ColdFire execution under synthetic
machine services, not native USB integration.

## Snapshot and job contract

One base-owned operation token identifies the selected sample and the editor
generation. It is not a slot number or a long-lived raw settings/PCM pointer.
Capture at least:

- Sample kind/slot plus content identity and content generation. Reusing a
  slot or replacing a file with the same name must invalidate the token.
- Complete marker records and count, trim/loop state, sample rate, encoding,
  channel count and a generation covering relevant sample metadata.
- The chosen tempo source and its exact value. SAMPLE uses ATTR tempo;
  PROJECT uses the explicitly documented project tempo value. Pattern tempo
  and external-clock behavior remain to be proved before choosing the getter.
- Owner/package generation and the playback policy required by the action.

Unselected tempo changes need not invalidate a preview, but a change to the
chosen source does. Generation comparison must handle wrap/reuse and must
not turn an untracked writer into a false successful validation. Until every
relevant native writer is covered, compare the complete relevant state under
the same serialization boundary used by Apply.

Do not substitute the stock control-record counter or dirty flag for the
content generation. Isolated 1.40C execution now proves that rotation and
polarity edits change PCM while all 44 control bytes, including the counter,
remain identical; repeated edits keep the dirty flag set. The release path
increments the counter and skips zero on wrap, but that covers neither these
in-place writes nor lifetime uniqueness. Comparing the complete control record
therefore cannot establish content coherence either.

The shared provider must invalidate live previews **before** a relevant writer
can change PCM, including a writer that later fails, and refuse acquisition
while a writer is active. Cover in-place edits, slot replacement/release,
recording and any other discovered writer, plus owner removal and required
metadata/tempo changes. Do not enable a live provider until that coverage and
its serialization are proved. The current probes demonstrate missing coverage;
they do not enumerate every writer or assign hook sites to a new ABI.

Expanded instruction/store observations now cover eight edit families. They
leave the busy field and counter untouched, with unmasked instruction intervals
between masked PCM writes. A dirty-store notification can invalidate existing
tokens but cannot prevent a new snapshot during an unfinished edit. Track the
whole writer lifetime and identify the destination of cross-slot copies;
retire exclusion on all return paths, including normalization's observed
dirty-without-PCM failure. See [writer coverage](WRITER_COVERAGE.md) for the
executed cases and still-missing writers. The compiled [worker observer](WORKER_BOUNDARY.md)
now tracks complete commands in private tests. The [engine service experiment](ENGINE_SERVICE.md)
adapts this to the existing base-owned idle/job sites and coalesced background
work; complete native exclusion and production scheduling are not implemented.

Worker lifecycle probes add two constraints: an empty command queue does not
mean the dequeued writer has finished, and UI completion is an asynchronous
notification that can be omitted when its record pool is full. Retire writer
exclusion at a verified execution boundary on every path, independently of
UI notification. Queued command pointers are not immutable operation IDs:
capture validated identity and affected destinations under proved ownership.
The expanded worker trace and separate ordinary-recorder fixtures do not cover
all worker opcodes, recorder modes, other callers, live scheduling or cancellation.
Recorder allocation and position publication can precede PCM packing, outside
the edit queue and without dirty/counter stores. A shortage can return without
writing the prepared PCM and queue further work. Neither a position nor return
alone establishes a readable source; validate ownership/state and cover the
follow-up writer independently. The recorder also changes shared free-page maps,
so refusing recorder slots alone does not serialize a Flex reader's map access.

The draft [admission prototype](PREVIEW_GUARD.md) implements coarse global
revisions, unique tickets, nested-writer exclusion and revocation/exhaustion
behavior in portable C. It is not an assigned ABI or a native serialization
mechanism. The shared implementation and all writer/copy boundaries still need
review before a module can subscribe or a live provider can be enabled.

The [session prototype](PREVIEW_SESSION.md) now coordinates that guard with full
metadata capture, bounded copies, pending/cancel/restart and result revalidation
through a supplied lock/backend interface. The [composed Flex backend](FLEX_SOURCE.md)
now supplies metadata/copy callbacks, tested with fixture-owned identities and
ownership; production admission and the reviewed native lock remain absent.
The Flex replacement-refusal trace additionally proves that failed loads may
already clear old PCM and relocate surviving maps. Outer replacement exclusion
must span its nested release and every failure path; error return cannot restore
the older token. Filesystem/header mocks limit that trace to orchestration.

PCM reads copy a bounded block into caller-owned scratch memory. They report
ready, pending, stale, unsupported or failed; a pending Static read yields
to the scheduler. No filesystem wait, allocation or sample scan runs in the
audio interrupt. A recorder or file being modified is refused until content
can be pinned consistently. A sequence of individually valid reads is not
a coherent preview if the source changes between them.

Distinguish a raw pool page lookup from decoded PCM. Validate pool readiness,
slot kind/range, encoding, frame extent and allocation ownership before any
native lookup. Flex and Static require their own proven access paths; a slot
number alone cannot choose one. Bound copies by both the remaining sample
extent and the current contiguous page, then decode into the planner's signed,
right-aligned 24-bit values (duplicate mono). Verify each decoder's actual
read extent, including vector tails and required padding. Never retain a raw
page pointer across a yield or assume that an active recorder's current
length makes its contents stable. Reverse playback does not require a reverse
preview scan: scanning source coordinates forward avoids imposing unverified
reverse-reader conventions on this one-shot action.

The [native Flex copy component](FLEX_COPY.md) now checks source/descriptor
geometry, current map regions and allocation/page bounds, invokes a supplied
verified stock entry through an original target ABI shim, and copies only the
validated span. Compiled-target stock fixtures pass, but no live binding, native
lock/cache boundary, writer coverage or source admission is installed.

The tested release routine publishes a temporary allocation-map pair before
copying the map back. A surviving slot's map offset changes even though its
control record and audio do not. Use the current maps under a verified guard
for each bounded copy; a cached map pointer plus an unchanged slot counter
does not establish ownership. The tests run without task/interrupt interleaving
and do not prove the guard needed by a live provider.

The synchronous `bs_preview` remains an arithmetic oracle. The portable
`planner_job` prototype now advances one bounded transition at a time and
requests PCM frames without calling a reader. A pending frame can yield;
replies must match that job's serial and frame, and cancellation retires the
preview. This is not a base service. The real adapter must bind each read to
the operation/content generation, discard in-flight reads before reusing job
storage, and provide measured time and cache limits. Merely limiting callback
counts does not limit the time spent in a blocking reader.

The portable `pcm_reader` now wraps that job with a 32-frame decoded cache
and bounded 16/24-bit decoding. It accepts whole-frame prefixes when a page
ends early, copies them before returning, and retains no provider pointer.
Every reply echoes the operation, revision, serial and requested extent.
Operation IDs must not be reused while old replies can exist. Step/result
calls revalidate the caller's current revision even after a completed preview;
the provider must independently pin or revalidate content around its copy.
These are tested software contracts, not implemented native generation
tracking. A slot number, timestamp or unchanged length cannot stand in for
the required revision. Native admission must refuse unsupported or mutable
sources until it can supply this contract truthfully.

## State transitions and atomicity

`CAPTURED → SCANNING → READY → APPLYING → APPLIED`

Cancel, owner removal, sample switch and stale input retire a token without
changes. A failed read produces a failed preview; it does not downgrade
SMOOTH to EXACT or substitute the other BPM source.

Apply is accepted only for a ready token and explicit confirmation of that
preview. Under the stock writer/reader serialization boundary, revalidate
the snapshot, capacity, complete records, preservation rule and playback
policy. Prepare the entire candidate and rollback state before publishing
any changed count or record. An interrupt mask around a write is not proof
that another task, a cached alias or an active voice cannot observe half of
the edit. The stock editor's short masked block is a research lead, not a
complete transaction API.

Retire a selected row before rebuilding a reduced table's native pointer arrays.
The isolated 1.40C refresh probe demonstrates null-row dereferences if an old
selection survives that reduction; resetting selection before rebuilding avoids
the tested path. Recompute it from the cursor afterwards. This does not establish
voice publication, complete auxiliary rollback or the live exclusion boundary.

Publish once, refresh native editor/voice state in the proven order, and let
stock manage working/saved copies and subsequent persistence. No custom
`.ot`, marker or project serializer is introduced. Failures must leave the
pre-edit state intact or roll back under the same boundary. A successful
commit is reported only after all required publication steps complete.

The isolated stock marker parser has now been observed changing synthetic
slot records before rejecting a bad checksum or truncated input. Calling it
with a prepared stream is therefore not an atomic Apply implementation.
The stock sanitizer also clamps existing starts, ends and loops in the tested
Flex/Static fixtures. Preflight must establish that retained records would
remain exact; never run a sanitizer speculatively against live settings.

Retain complete before-state for internal failure rollback. The player workflow
uses stock DELETE SLICE / DELETE ALL SLICES after grid creation; it adds no
module Undo or history-management dialog. Clearing removes markers rather than
restoring the pre-grid layout. The portable Undo journal is retained research,
not a required native service. Stock clear/edit operations must retire stale
previews. Follow stock working/saved-copy and settings-save behavior.

## Playback contract still needed

Marker placement alone cannot meet the audible acceptance requirement. The
playback path must establish what happens at start, natural end, stop,
retrigger, slice/loop wrap and discontinuous seek for Flex/Static, both
directions, RATE/PTCH, timestretch and both DSP cores. Keep effects tails and
unrelated voices out of a source transition. Preserve outgoing source history
when the chosen crossfade needs it and measure worst-case memory/CPU cost.

There is also a persistence decision: if smoothing is enabled only for samples
processed by this action, its identity/policy must survive the required stock
save/reload behavior. A RAM-only list of slots is insufficient; arbitrary
custom project metadata is not permitted. A generic base declick policy
would have a broader compatibility and ownership scope. Neither approach is
approved here. Existing stock declick behavior must be measured before adding
a new renderer hook, and the base must not contain Beat Slicer's algorithm.

For the later PCM/smoothing extension, Apply remains unavailable until its
additional playback policy is qualified. The first basic version instead uses
ordinary stock playback, as agreed above. A quiet boundary,
emulator trace, native link or synthetic crossfade is not audible hardware
acceptance. Module-absent loading must preserve ordinary stock markers; any
loss of module-only smoothing must be clearly described and tested.

## Further evidence for a released PCM-capable interface

The isolated CPU probes cover menu retention/dispatch, settings lookup,
complete-record sorting and insertion renumbering using synthetic state.
They do not boot a project, run the scheduler concurrently, render audio,
save sample settings or demonstrate a native commit/rollback. UI callees are mocked explicitly.

Still required: full editor traces through the actual panel path; all incoming
branches and overwritten instructions for a candidate base site; callback
register/stack contracts; PCM cache/streaming lifetime; native commit, internal
failure rollback and stock clear/save/reload behavior; working/saved-copy
publication; generation coverage; resource
and compatibility review; removal and missing-module handling. Only then can
the reviewed registry, loader, browser builder and module adapter be changed.

## Stock grid publication observation

The 0.1.11 synthetic 1.40C fixtures execute both immediate and deferred grid
publication. Count clearing precedes asynchronous zero-search completion;
records are later written at the supplied unmasked level, followed by pointer
and selection refresh and a redraw notification. The redraw helper itself
changes no marker history. This grid replaces old records and is not the
preserving transaction service. Exclude previews for its whole deferred
lifetime, including failure/cancellation and final refresh; never substitute
its notification field for a generation or native Undo. Actual zero-search
scheduling, cancellation and working/saved-copy behavior remain unproved.

## Clock and storage planning clarification

For the stock Octatrack path, distinguish the frame clock from the original
file's header rate. The [format investigation](BOOT_OBSERVATION.md#file-rate-versus-the-stock-playback-clock)
explains the documented 44.1 kHz domain and why a loaded 48 kHz header is not
a native playback-rate getter. Keep that target-specific binding outside the
generic planner, and qualify it against the exact native source and device.

The earlier PCM research guard/session/candidate/journal totals 10,092 bytes,
excluding backend, menu, code and stack. Reserve actual contiguous storage and
measure the complete call chain before assigning shared-base RAM.

The normal Static load/clear observation exposes a retained file handle that
stock release retires only after confirmation. That handle is not a reader
lease. A Static provider must own bounded file access and bind it to card/file
and slot lifetimes across yields; it cannot borrow Flex allocation maps or
keep a raw stock handle after unload. The observed release counter does not
prove coverage of every file writer or concurrent playback path.
