# Native integration requirements

## Current readiness

**0.1.66 public-beta candidate (26 October 2026):** the module author approves this version for public-beta review and supplied its recording-workflow description. The exact module was tested privately on a contributor's MKII, including the current 16-module RAM set without Recorder Loop Fix. This author sign-off does not approve or publish the shared base/API. [#914](https://github.com/repeat98/modwerk/pull/914) remains the separate owner-reviewed proposal; Beat Slicer is its only confirmed consumer. Reuse and the provisional event index 32 versus [#857](https://github.com/repeat98/modwerk/pull/857) remain owner decisions.

The draft remains unlisted and the sample-editor integration is still a private `--sample-editor` opt-in. Public beta requires the base review and first-release integration, current required checks, and honest disposition of the physical timing, persistence and extended-emulator gaps recorded in TESTING.md. `module:doctor -- beat-slicer` does not pass for an unregistered draft; it is not represented as a released module.

Recorder Loop Fix 0.1.0 independently reproduces the first-slice miss with stock grids and Beat Slicer absent. It is excluded from the current trial and reported as [sambanks/octabam#908](https://github.com/sambanks/octabam/issues/908). No companion fix is part of this release candidate.

The module author chose a basic working slicer first. File-backed Flex and Static share
AED slice commands and record geometry; their settings/control tables differ.
Both are covered by the new metadata-only service. A Static PCM/streaming reader,
quiet-boundary analysis and playback fades are deferred. Ordinary stock playback,
confirmation and clearing are the first version's workflow, with no added Undo.

The independent `device_module.c` controller builds through the standard C package
builder and contributes a typed action to the proposed `ot_sample_editor_actions`
table. The private base owns native menus, source capture, confirmation and atomic
marker publication; the package contains no stock addresses or writer. The
0.1.66 candidate admits file-backed slots and inactive Flex recorder slots
128–135 while pattern playback continues. Only recording into the edited buffer
blocks that source; unrelated recorders remain independent. Empty buffers stay
empty. The exact private native workflow and named MKII trial results are recorded in TESTING.md; complete qualification remains open. Default
bases refuse this contribution. `--sample-editor` is a private staging opt-in,
not released beta support or an approved shared ABI. `module:doctor -- beat-slicer`
currently reports no registered module because the draft is deliberately unlisted;
it is a release-integration gate, not a passed check.

The current replacement extension needs a revised private base. Existing slice
tables are replaced only after the stock REPLACE SLICES? warning; old API callers
retain preservation-only behavior. A confirmed YES waits across temporary busy
work and revalidates before one write; NO or another stock gesture cancels it.
The contributor reported initial 0.1.56 success followed by repeated-edit failures.
The 0.1.57 trial subsequently produced a reported DSP stop with active TapeHead/
Mini Verb. Its saved record confirms stopped frames. It is withdrawn from trials.
The contributor reported successful 0.1.58 slicing; its USB Undo remained unverified and required a power cycle. The 0.1.63 popup/menu revision requires its own exact-build qualification.

Established software checks: actual controller/grid/service host sanitizers,
full-identity retirement and one-use confirmation, actual adapter failure/rollback
against authored metadata, typed descriptor/default-base refusal, MCF54455 service
execution, linked empty-row/controller-bound native bases, exact native/browser
base parity and combined normal-boot Flex/Static USB/menu/native-confirmation
emulator checks. These do not prove complete stock writer coverage or hardware
behavior. See [the exact candidate results](TESTING.md#basic-shared-aed-candidate-0155-staging).

Before a functional device trial, finish companion placement and exact-source
preflight checks, retaining the passing loader/menu/confirmation, native/browser
parity and stock-free results against their exact package/base identities. Then obtain the
required shared-service review and exact private RAM-boot/sample-edit trial
permission. Use a disposable project and original sample copy; run actual
self-test and Undo, with no Keep, flash or implicit save. Prior fixed-input probe
permission does not authorize this new base or marker edits. Physical timing,
audio, removal and persistence stay open until observed on that exact candidate.

## Earlier preview-only research and proposal

The sections below retain the narrower pre-0.1.55 investigation. Their PCM-reader,
smoothing and preview-only milestones describe retained research or later
extensions, not the approved first basic version above. The new native service
is now implemented in staging; its end-to-end qualification remains in progress.

## Preliminary USB smoke test

Start with the [private planner probe](USB_TEST.md): existing tick/draw hooks,
fixed inputs, physical self-test and Undo. It needs no new base/editor interface
and does not access instrument samples. This narrower test advances device
execution without claiming live Flex preview or relaxing the gates below.

## Reduced read-only preview preparation

The geometry-only helper now calculates an exact grid without reading PCM or
claiming quiet boundaries. A copied-settings Flex preview can be the first live
milestone; see the [narrower shared-base proposal](BASE_CONTRACT.md#smaller-first-live-milestone-copied-settings-only).
Its coherent settings service and native menu/owner boundary remain unimplemented
and require owner review before use. No direct memory-reading module is substituted.

## First USB preview trial

The earlier preview-only proposal targeted a read-only Flex preview through the Modwerk base
and USB. It is not ready yet. This narrower first trial does not remove the
finished module's Apply/playback, Static, companion and persistence acceptance
requirements, and private emulator injection is not its delivery mechanism.

Before that trial:

1. Obtain the shared editor/source interface review and implement its native
   admission and retirement boundaries. Existing writer tickets, typed menu
   descriptors and fixed-owner tests are prototypes. Complete relevant Flex
   writer/cache coverage, command ownership and menu/job reference retirement;
   unsupported source kinds must refuse explicitly. A completed preview must
   become unusable before a relevant writer or owner transition can change its
   source or reclaim callbacks.
2. Build the exact independent module and compatible base from source through
   the native and browser paths. Record source/package/base identity and the
   stock-free scan, validate placement and shared ownership with intended
   companions, and run the documented source/API/MCP preflight checks.
   Do not substitute a card-only image, a standalone object or pinned emulator
   callback storage for the USB package lifecycle. Instruction budgets inform
   this preparation; physical timing remains part of qualification on the unit.

On the MKII, use a disposable project and an authored sample copy. Follow the
[device-driving workflow](../../../docs/OCTATRACK_DRIVING.md) and exact-build
review/trial/self-test/Keep or Undo flow. Verify SAMPLE/PROJECT tempo, both stock
menu layouts, Back/cancel and a fresh preview after normal TRACK + REC1 / Stop
and AED/SLICE reopening. Confirm old work/output never revives and markers/PCM
remain unchanged. The first trial must expose no Apply action or Beat Slicer
Undo/history UI; eventual clearing uses stock DELETE SLICE / DELETE ALL SLICES.

Complete the exact candidate's removal/missing-module behavior and physical
persistence checks, recording actual results separately from emulator evidence.
Compare latency and audible behavior on the unit rather than translating
executed instruction counts into a timing claim. A passing read-only trial
qualifies only that tested scope; it does not establish native Apply, smooth
slice playback, all-source support or release readiness.

## Integration work

1. Turn the observed 1.40C slice-menu dispatcher, decoded PCM reader and marker
   transaction paths into reviewed shared interfaces. Private execution now
   covers these research paths; their addresses are not an approved ABI. Stock
   OS stays on the user's computer. The new slice-editor table is private staging in the
   registry, not a released ABI. Never guess firmware addresses or publish stock bytes.
2. Design an additive base-owned editor event/table, with locally verified
   site, whole-instruction length and guard hash, in a separate owner-reviewed
   SDK change. The module subscribes, never patches a shared site itself.
   `editor_menu.c` now composes copied stock/contributed labels and owner-checked
   dispatch with explicit retirement. Private full-boot fixtures now render and
   select an appended action in both stock menu variants and exercise read-only
   controls. A guarded variant captures/arms/consumes each selection and preserves
   native dispatch ABI effects. A separate fixed-owner variant reopens immutable
   layouts and keeps all storage pinned; replacement/reclamation remain absent.
   Native locking, package admission, event assignment and actual
   detachment/removal remain absent; test storage stays pinned for the boot.
3. Connect the compiled planner to an admitted production source adapter.
   The standalone planner now links and executes 164 synthetic CPU-emulator
   vectors, and private full boots exercise a compiled Flex adapter. Production
   admission and an installable module remain absent.
   Read PCM through bounded background work, not the audio interrupt. Explicitly
   support Flex/Static, mono/stereo and sample encodings; refuse unsupported data.
   `planner_job.c` supplies a portable resumable scan prototype with no reader
   callbacks. The private engine-service fixture now advances bounded work from
   stock idle events with a coalesced wake; production scheduling and content
   pinning remain absent.
   `preview_async.c` now separates copied UI intents/results from one
   engine-owned session. The combined native fixture uses the existing tick
   and engine topology, checking accepted intent identity again before reads.
   Portable cancellation/publication interleavings and full-boot task identity
   are recorded separately in TESTING.md. These do not supply the production
   base's owner lease, event registration or removal protocol.
   The traced pool lookup is Flex/recorder-specific and does not decode PCM.
   Validate its preconditions before use; establish Static access separately.
   Stage bounded bytes and prove decoder read extents before using a native
   converter. A raw pointer must not survive a scheduler yield.
   `pcm_reader.c` now supplies bounded packed-PCM decoding and a 32-frame
   copied cache, accepts page-shortened replies and checks operation/revision
   tags. The private Flex binding now exercises actual stock-loaded formats;
   production pool ownership, Static file IO, complete generation coverage and
   qualified base scheduling remain absent.
   `flex_copy.c` and its original ColdFire ABI shim now validate bounded Flex
   map/geometry conditions and copy from actual stock lookup in compiled-target
   fixtures. The binding/ownership/metadata remain synthetic; no live reader
   service, writer coverage or cache/lock boundary is installed.
   The full compiled Flex preview/candidate chain now passes against stock page
   lookup and gain with a synthetic provider. `flex_metadata.c` now decodes the
   observed control/settings layout through bounded supplied regions, checks
   editor selection and preserves complete records and independent BPM values.
   Its tests connect the decoder to previews/candidates with synthetic ownership.
   Exact live binding, identity/tempo-source qualification, native scheduling
   and ownership remain separate integration work.
   The stock-page-to-host-reader pipeline passes eight synthetic previews.
   Coherence probes show that stock rotation/polarity edits leave the slot's
   counter unchanged, with a sticky dirty flag. A base-owned revision must
   invalidate before each relevant writer; using those stock fields alone
   would allow stale or mixed-content previews. This writer coverage is not
   implemented. The probes also exercise temporary allocation-map publication
   during release; no provider may cache page-map pointers across a yield.
   Expanded [writer coverage](WRITER_COVERAGE.md) shows that eight edit
   families leave the busy field untouched and restore the unmasked state
   between PCM writes. Exclude reads for the complete operation, not only
   individual writes; a dirty-store notification alone is insufficient.
   The worker probe executes a producer, real queue operations and seven edit
   dispatch paths. Queue emptiness can precede PCM mutation; deferred UI
   completion can be absent. Guard actual execution lifetime independently
   of either signal, and capture identity rather than retaining a reusable
   command pointer. The portable admission prototype now implements global
   revisions and unique writer tickets, including nested edits, owner revocation
   and exhaustion refusal. Copy/crop/release dispatch is exercised with that
   host guard; native writer coverage, synchronization and admission remain open.
   Separate recorder fixtures now cover preallocated/lazy page crossings in both
   stereo formats, both state banks and tracks 1/8, plus early exits and allocation
   shortages. Recorder map/position updates precede PCM without queue/dirty/counter
   signals; shortage cleanup queues more work. Normal panel start/retrigger/STOP
   now runs through the stock frame caller in a full boot, distinguishing pending
   and retained inactive banks. A private compiled entry/return observer now
   passes paired isolated stock comparisons, including faulted bookkeeping.
   Full-boot composition covers observed PCM and map-tail stores. Later complete
   preparation scopes cover the 24 previously unguarded stores per track in
   ordinary start/retrigger/STOP fixtures. Pickup/overdub, other writer families,
   complete interrupt/allocator exclusion and production source admission
   still need investigation. A later fixed-lifetime preview fixture shares these
   guards and rejects RUNNING/READY work during recording, with fresh complete
   plans after Stop. A subsequent composition runs those previews on the stock
   engine task with copied requests/results and exact coalesced wakes; its fixed
   owner and borrowed-main producer are not production API/UI integration.
   Later isolated tests execute queued shortage/length-limit cleanup and cover
   its map-tail stores with the compiled worker observer; this does not prove
   all recorder writers or a production source lease.
   `preview_session.c` now connects complete metadata snapshots, guard admission
   and the staged reader through a nonblocking serialized callback interface.
   Host and compiled-target tests cover complete previews and stale/cancel/error
   handling; qualified production callbacks/locking remain absent. Flex replacement-refusal
   probes cover real nested release and allocator behavior with filesystem/header
   mocks. Full stock-emulator loads now verify original mono/stereo 16/24-bit
   files at 44.1/48 kHz and their real pool geometry/PCM. This project's Flex
   setting converts 24-bit files to 16-bit; an authored project variant also
   verifies real 24-bit retention and all four loaded pool formats. Original
   file rate is not recovered from controls/settings. Target clock/source
   binding, successful live replacement and complete caller coverage remain open.
   A normal Static browser load/editor/confirmed-clear path now verifies file
   handle lifetime and Flex isolation in the full stock emulator; it provides
   no leased Static PCM reader or streaming deadline.
4. Bind preview to sample identity/content generation, markers, trim and chosen
   BPM. Reject stale Apply, including a changed tempo. Preserve complete stock
   slice metadata for failure rollback. Commit once after confirmation; any failure or
   cancellation changes nothing. Use stock storage, no custom project format.
   Follow the existing slicing confirmation and clearing workflow; expose no
   separate Undo/history UI. Keep stock DELETE SLICE / DELETE ALL SLICES intact
   and invalidate previews when they run. Their successful result is removal,
   not restoration of a previous grid. See EDIT_TRANSACTION.md for the retained
   prototype API and its distinction from the player workflow.
   Use `bs_transaction_commit`, which releases non-faulted workspace without a
   history-discard step. Its host/ColdFire tests retain failure rollback and
   stale-preview refusal after modeled clear operations; native exclusion and
   publication callbacks remain absent.
   Isolated stock storage probes now confirm complete marker round-trips, but
   also mutation before checksum/short-read failure. Those parsers are not
   atomic transaction services. Stock sanitation can alter existing records;
   preflight must refuse such changes before any live write.
   The normal stock persistence probe separately checks `.OT` save/revert and
   project `markers.work`/`markers.strd`, with independent Flex/Static layouts
   for the same file. Compare exact serialized records separately from active
   metadata after reload: stock can normalize an inactive deleted row. A fresh
   emulator process is not physical reboot or installed-module evidence.
   `marker_edit.c` now prepares complete before/after tables under a conservative
   preserve-ordinals policy, retains inactive rows and refuses incompatible plans
   without output mutation. Its full-table comparisons are tested on host/target;
   accepted synthetic candidates also survive stock sort/sanitation. These are
   preparation/rollback primitives, not native publication or qualified playback.
   `edit_candidate.c` now binds preparation to an exact portable preview and
   unique ID, revalidating source and complete active/inactive table under the
   supplied lock. A returned candidate still grants no native write permission.
5. Implement verified short playback attack/release smoothing at the correct
   source boundary, through base events where shared. Test reverse, RATE/PTCH,
   timestretch, retriggers, slice locks, loops, arbitrary jumps, active voices,
   both DSP cores and companions. Marker placement cannot ensure pop-free audio.
   Shared playback changes require separate owner review. Until verified,
   refuse unsafe Apply; do not destructively fade samples or change AMP defaults.
6. Build card/browser/runtime packages, stock-free scans and native parity.
   Prove both installation orders beside all modules. Measure CPU cycles,
   worst UI scan time, stack/code/data and streaming latency.
7. On the user's MKII, review exact build/package identities, trial with actual
   self-test, test, then explicitly Keep or Undo. Test removal, missing-module
   fallback, sample save/load, Part/project reload and authorized physical reboot.
   Record only observed/reported results and exact model/source/build hashes.

## Planned MKII acceptance

Use disposable projects and original synthetic/user-owned samples: known
120 BPM, fractional BPM, anti-phase stereo sine, DC-offset/full-scale audio,
silence, transient tails and a custom slice layout. Never overwrite a real
project or shared sample. SOURCE SAMPLE 120 versus PROJECT 90 gives one-beat
spacing of 22,050 versus 29,400 frames at 44.1 kHz before ±2 ms adjustment.

Exercise every spacing, trim edges, short final slices, sample changes during
preview, 64/65-marker cases, backing out before commitment and repeated creation.
Compare stock and module slice-menu prompts, individual/all-slice deletion,
selection refresh and save/reload on both Flex and Static. Clear while a preview
is pending and require its invalidation. Verify the same file in another slot
stays independent, and tracks sharing the edited slot see the same markers.
Check zero-cross NO separately from backing out; no additional Undo action or
history-discard prompt may appear. Listen to quiet
and loud material without masking FX and measure discontinuities against an
agreed acceptance limit. Quiet marker scores alone are not audio evidence.

The draft originated in a cloud instance without USB. Local setup subsequently
established read-only developer MCP status on the user's MKII (base
`a408c50515838a956fbd63a56212bbcd1da78a1c21a04f815fb8c3d5771d6e45`, ABI 10).
That is connection evidence only, not Beat Slicer execution. Keep access
read-only until an exact trial is authorized; leave missing-module references
untouched. Keep firmware private and never expose the device socket publicly.
See [RESEARCH.md](RESEARCH.md) for the local source/stock investigation and
the unimplemented base transaction and playback contracts. The concrete
[base-service proposal](BASE_CONTRACT.md) specifies menu lifetime, complete
record/ordinal preservation, job cancellation and atomic commit/rollback requirements.

Draft release notes live in CHANGELOG.json. Move them to
`src/community/module-changelogs/beat-slicer.json` in the same change that
registers the qualified module; the live changelog validator rejects unlisted IDs.

The portable [transaction coordinator](EDIT_TRANSACTION.md) exercises the
planned no-history commit and internal failure rollback against a synthetic
backend. Its older explicit Undo/history cases remain research regressions;
they are not additional controls or release requirements. A compiled Flex-to-transaction fixture
also executes stock row-binding, selection and redraw refresh. It retires the
old selected row before rebuilding a shorter table; this order avoids the
isolated stale-row dereference, but supplies no live exclusion. Its backend must provide actual atomic
publication and complete auxiliary rollback under a verified reader/writer
boundary; no installed service or native transaction is supplied by this draft.

The 0.1.50 proposed owner backend now has an adapter for the existing loader
metadata callback. Isolated host/ColdFire fixtures invoke it from real PREPARE
and SWITCH paths: preparation preserves activations, outgoing switches retire
them before publication changes, and rollback cannot revive them. A refused
switch also retires affected activations conservatively. Production board
composition must retain every existing metadata/DSP admission check and add
source-reader cancellation and native reference retirement; this fixture does
not install that integration.

The 0.1.51 isolated callback composition cancels outgoing copied preview
exchanges before menu retirement. RUNNING/WAITING/READY requests, partial source
lock refusal and set rollback retain no old output authority; companions and
fresh exchanges still finish. Its generated PCM and serialized source boundaries
are synthetic. Production must supply reviewed owner-pinned handles and lock
composition, keep module-specific controllers in independent packages, and
retire queued/native references before reclaiming any storage.


## Retained editor research notes

These notes were moved out of the shared system guide after PR #840 review.
They retain the original experiment limits and named sources; they are not new
hardware qualification or an approved base API. General requirements remain in
`docs/module-guides/system.md`.

### Slice edits and persistence

For a one-shot sample editor, preserving marker starts is only part of preserving
the sample: retain complete slice end/loop records and establish whether adding
a sorted marker renumbers slice locks. Resolve stock minimum-length and
working/saved-copy behavior before enabling Apply. Bind preview to sample,
content, markers, trim and chosen tempo; a stale or cancelled preview must not
write. Quiet marker boundaries are not evidence of click-free playback.

A mathematical grid point close to trim end can create a segment shorter than the writer permits even when there are no old slices. Match preview admission to the writer's minimum, omit only invalid new tail points and retain the actual trim end. Preserve existing records in a preservation workflow; replacing them requires an explicit replacement warning and confirmation. Report a short trim separately from an old-record conflict. A transient busy result can retain an explicit confirmation intent, but revalidate before showing the native question and cancel the intent on Back, parameter changes or stale source.

Match the stock edit workflow before adding recovery controls. Internal failure
rollback does not imply a user-facing Undo action. Beat Slicer's 1.40C emulator
observations distinguish cancelling deletion from confirming it, and show that
NO at the grid alignment question accepts an unaligned grid. Keep stock slice
clearing available; clearing removes slices rather than restoring the old grid.
Verify the exact prompts and saved-settings behavior separately on hardware.

A shared editor's trial-readiness check must distinguish retained rollback data
from active work. The Octatrack loader retains its candidate and whole-set rows
until Keep/Undo even after publication completes. Gate edits on the transport's
actual completed phase plus restore/save/journal readiness; a saved-set export
predicate intentionally excludes that trial and cannot serve as editor readiness.

Give native contribution records the alignment their base decoder requires.
ColdFire C defaults to two-byte struct alignment, so a four-byte typed record
must declare that alignment explicitly. Check the descriptor in an actual
target-built package; a host build's pointer alignment can hide this mismatch.

Do not infer a read-only job from a mutable queue record's opcode alone. If a
display read must preserve an editor operation, block access for its entire
lifetime, identify the actual guarded dispatch branch, retire any unclassified
completion before reopening admission, and recapture the complete relevant
metadata. A known Flex rendering fixture does not qualify Static error paths.

Distinguish sample-settings save/revert from project save/load. Beat Slicer's
stock 1.40C emulator fixture keeps different Flex/Static layouts for the same
file. Check complete on-card tables separately from active metadata after
reload: the observed load normalizes a deleted inactive row even though both
project marker files stored it exactly. Wait for stock's final save completion
before flushing; a flush only persists writes already performed. Fresh emulator
processes do not establish physical reboot or module persistence. See the
[stock persistence probe](BOOT_OBSERVATION.md#stock-sample-settings-versus-project-storage).

Test error paths before treating a stock loader as a transaction: a checksum
or short-read error can be returned after destination records have changed.
Likewise, a stock sanitizer may move old markers to satisfy its minimum-length
rules. Establish the exact behavior with synthetic fixtures; reject a proposed
edit that would alter preserved records rather than silently sanitizing them.
See the Beat Slicer draft's [storage probes](TESTING.md#isolated-stock-storage-probes);
these are emulator observations, not physical save/reload qualification.

An exact internal failure-rollback snapshot needs inactive rows too: adding slices overwrites
previously inactive record slots. Preserve the full table and count, and compare
the complete expected after-state before restoring it. Beat Slicer's candidate
tests cover this in memory; such equality still needs source identity, ownership
and verified native publication/persistence around it.

A stock editor action may mutate settings before its asynchronous search or
completion callback returns. Beat Slicer's synthetic 1.40C grid fixtures clear
the marker count before deferred zero searches and publish records later,
followed by pointer/selection refresh. Its redraw notification is not an Undo
service. Track the entire mutation/refresh lifetime; do not reuse this replacing
grid action as a preserving atomic Apply. Actual scheduling/cancellation and
physical persistence remain unproved by those fixtures.

Retire an editor's selected row before rebuilding bindings for a shorter marker
table. Beat Slicer's isolated 1.40C refresh probes observe the old selection
being dereferenced after its row pointer has become null; resetting the selection
first avoids that path in the tested Flex/Static reductions, including zero
slices. Recompute selection from the cursor after rebuilding. This is a native
integration requirement, not an observed stock UI defect or hardware result.

### Source ownership

A geometry-only preview can avoid PCM access, but it still needs a coherent copy
of settings under the reviewed metadata-writer boundary. Give it a distinct
informational result: absent amplitude analysis means unknown boundary safety,
not zero-valued fade warnings. Do not feed a fake silent reader to a live planner
or let an informational grid authorize Apply.

A stock sample-pool lookup is not necessarily a decoded reader or a safe
service for both Flex and Static. Verify readiness, sample kind, page bounds
and pointer lifetime before using it. Measure decoder reads as well as writes:
a packed 24-bit converter can read a fourth byte while returning the correct
three-byte value. Stage readable padding or use a bounded decoder. The Beat
Slicer draft's pool/converter probes demonstrate this in synthetic CPU state;
they do not qualify live streaming or concurrent sample changes.

A stock slot counter is not necessarily a content revision. Beat Slicer's
isolated 1.40C probes execute rotation and polarity edits that change audio
without changing the control record; the dirty flag stays set across repeated
edits. Bind preview invalidation to every relevant writer before mutation,
not only reload/release counters, length or a dirty flag. Allocation maps can
also change while another slot's metadata stays identical; reacquire them
under the verified ownership guard for each bounded read.

An unchanged stock busy field does not prove that an edit has finished.
Beat Slicer's isolated 1.40C instruction probes observe unmasked intervals
between masked PCM writes across eight edit families, without busy-field
updates. Track the complete writer lifetime before allowing new snapshots;
an early dirty-store notification alone only retires older ones. Cross-slot
copies invalidate the destination, and a failed operation can still mark it
dirty. These are synthetic execution results, not live scheduler evidence.

An empty worker queue also does not prove an edit has finished: the dequeued
command can still be writing PCM. Beat Slicer's synthetic 1.40C worker probes
find deferred UI completions that can be omitted when their record pool is
full. Retire exclusion at verified execution boundaries independently of UI
notification, and capture owned operation identity; a queued pointer can refer
to a reused command record. Full panel/scheduler/cancellation behavior remains
unproved by those fixtures.

Track nested writers independently: the 1.40C crop path calls rotation, and
its inner return must not reopen a preview before the crop finishes. A refused
crop can also advance the slot counter before range validation. Beat Slicer's
synthetic worker fixtures exercise both cases. Admission bookkeeping still
needs a separate verified lock around snapshot/map lookup and bounded copying;
a valid token alone does not pin memory or establish complete writer coverage.

Cover recorder and allocator writes outside the edit worker too. Beat Slicer's
synthetic 1.40C ordinary-recorder calls change shared page maps and PCM without
dirty/counter stores. Position/map publication precedes PCM; allocation shortage
can publish a prepared position, write none of that call's PCM and queue follow-up
work. A position or routine return therefore does not establish source readiness.
Refusing recorder slots alone does not serialize shared-pool access for Flex.
These fixtures do not establish the real ISR mask, timing or recording behavior.

Treat failed sample replacement as a possible content change. Beat Slicer's
synthetic 1.40C Flex-load fixtures release and clear the old PCM before directory,
file-open, header or allocation errors return; a surviving slot's map can move
while its audio and control record stay unchanged. Retire the old preview before
replacement starts and keep exclusion across nested release until the outer load
returns. These fixtures mock filesystem/header IO and do not qualify actual file
loading or persistence.

Distinguish source writers from editor visualization work before invalidating
every preview on every engine command. Beat Slicer's pinned 1.40C full boot
observes recurring waveform commands invalidating a read-only preview under
that coarse policy. Isolated execution checks the ordinary Flex renderer's
source-read footprint across four formats and slots 0/127. That does not qualify
Static/recorder variants or mutable queued-record lifetimes. Never exempt an
opcode alone; establish its submode, input lifetime and complete write footprint
before using a narrower classification in a live base.

Keep loader ownership and sample ownership separate. The current
[`modwerk_machine_lock`](../../runtime/loader/loader.h) preserves loader
stability while deliberately allowing real-time interrupts. It is not, by
itself, proof of exclusion against recorder or PCM writers; establish that
additional boundary before connecting a live sample reader.

When tracing a recorder's deferred cleanup, distinguish worker startup from
the queued command and compare state after recording separately from state
after cleanup. A zero-to-zero map store is still a writer observation; byte
equality alone cannot establish exclusion. On the isolated 1.40C recorder-stop
fixtures, an empty queue preceded stores through the unused map tail. Preserve
per-track command identity, exercise separate recorder records queued together,
and test actual return/next-receive lifetime; neither
fixture completion nor an unmasked wait establishes live ISR/allocator coverage.

Distinguish the selected recorder bank from a pending start and retained history.
In Beat Slicer's stock 1.40C full boot, retriggering switches banks; STOP clears
the selected state while the other can remain `2` without advancing. Isolated
calls distinguish that retained state from a pending `1`, including delayed
starts. Neither "selected bank only" nor "any nonzero bank" is a complete
ownership rule. Capture overlapping stores too: the observed pending byte is
published by a four-byte write beginning two bytes earlier. These are emulator
observations, not a qualified native recorder/source boundary.

Compare a native writer wrapper against the unmodified whole routine, including
both continuation states, caller arguments, status flags and ordered external
stores. Preserve SR/CCR when displaced instructions do not reset them. Keep
stock cleanup running after observer failure. Beat Slicer's isolated 1.40C
recorder comparison retains two idle voice-flag clears in its write oracle;
no PCM write does not mean no write at all. A narrow fixture exception is not
a production writer allowlist, and instruction counts are not physical latency.

Compose writer families in a normal full boot and retain uncovered stores as
qualification gaps. Beat Slicer's shared recorder/engine fixture exposed
preparation writes before the recorder scope; whole-call preparation scopes
cover those observed stores in later ordinary-recording runs. Record saved
caller SR when establishing interrupt context: a paused task/SP is insufficient.
The pinned 1.40C emulator records mask level 5 here, not physical latency or
complete writer coverage. Test the actual bootstrap action too: an empty
editor may queue no job. Separate intentional setup changes from the source
that the operation must preserve, and verify that setup difference explicitly.

### Background work

A stopped transport does not stop DSP frames. Do not mask audio/DMA interrupts
across full metadata copies, table comparisons or planning. Establish the actual
metadata-writer boundary separately; a frame-preserving task lock is not permission
to read PCM or recorder buffers. Reject heavy entry from an already high interrupt
context. Keep an idle options page on a copied snapshot and revalidate on intent;
repeated full source polling can add work and expose ordinary worker busy states.
Measure and test editor operations with effects actually running, beyond a load
self-test. Hardware timing and writer coverage remain separate proof obligations.

Budget the entire protected interval, including metadata validation before and
after a bounded PCM copy. Include the maximum supported metadata count as
a distinct workload; a short sample with few markers does not cover that cost.
A work-call or byte-count limit is not a lock-time measurement. When one backend lock also protects requests/results, separate
those coordination windows from actual source accesses. Pair exact mask/restore
observations and account for the measurement method; executed instructions do
not establish physical latency, cache behavior or complete ISR cost.

Cancellation must follow the stock screen transition. In Beat Slicer's private
1.40C MKII resident-menu emulator fixture, TRACK + REC1 closes the dialog and
returns to playback. Keep it closed through Stop; require a fresh editor
opening for new work. Do not force a stale-state dialog over the stock page.
This observation is emulator evidence, not a hardware behavior claim.

Test wake identity with a foreign record queued before an owned record while
that owned wake is pending. Identical payload bytes and a pending flag do not
establish ownership. Preserve the actual queue order in the evidence; separately
check that WAITING does not self-poll and that cancellation survives readiness
returning. Beat Slicer's private engine fixture exercises those cases with
fixed storage, not native loader reclamation or USB disconnect qualification.

When adding a worker observer at runtime, account for the command already
waiting inside the old receive call. A changed call site does not wrap that
in-flight receive. Start admission closed and establish quiescence before
opening it; keep queue waiting outside the observer lock. Beat Slicer's 1.40C
reserved-memory emulator experiment checks a compiled whole-command observer,
not complete writer coverage or physical lock timing.

Keep arithmetic and decoding of owned PCM copies outside the source critical
section. Reacquire and revalidate before the next live read; the validation from
before an unlocked interval is insufficient. Test writers becoming runnable at
each release, including after a successful copy. Instruction counts from a
synthetic backend can verify lock scope, but do not establish physical interrupt
latency or a safe native time budget.

Use the base-owned engine boundaries for background work, retiring the previous
writer before a reader runs. An idle callback may need an explicit queue wake;
do not assume it runs periodically. Coalesce wakes using stable base-owned
identity, not an opcode exemption that would admit unrelated commands. A pending
reader must wait for readiness or cancellation instead of immediately waking
itself forever. Beat Slicer's private 1.40C engine fixture exercises this with
one bounded work call per event: at most eight private reader transitions and
one PCM copy, plus optional begin/setup and publication. Revalidation precedes
each live copy. Earlier fixtures used eight single-transition steps; name the
counter unit when comparing them. Neither is a physical-time budget or
qualification of the production USB/module-set chain.

Keep one background owner for a mutable preview session. UI callbacks publish
copied, sequence-tagged intents and consume copied results; they must not inspect
or cancel the engine's session storage directly. Recheck cancellation/replacement
under source ownership before capture or copy, including after unlocked planning.
An old result must remain unreadable after a newer intent is accepted. Every
accepted intent also needs a wake or ordinary-event guarantee: it may arrive as
a service releases its final lock, after its local return-state value was chosen.
Beat Slicer's host/ColdFire exchange tests inject those late-publication cases;
this is not proof of a native loader lifetime, writer coverage or physical budget.

### Menus and loader lifetime

Keep a native confirmed answer pending when source readiness is temporarily busy;
revalidate source and owner before any write, and consume it before publication.
Cancel that pending answer on Back or another stock gesture. Busy is not evidence
of a changed sample. If a workflow replaces an existing table, use an explicit
replacement warning and test NO against the complete old table as well as YES
with fewer new entries. Preserve older preservation-only API callers.

Verify editor gestures against the rendered stock page, not a remembered key
order. In Beat Slicer's pinned 1.40C full-emulator session, AED → AMP selected
SLICE and plain YES opened its action menu; LFO selected EDIT. Loading a Flex
slot also did not assign it to the track until the slot was confirmed. Bind a
preview to the editor's actual kind/slot, not merely to a successfully loaded
source. These panel observations still need physical qualification.

Establish menu-pointer lifetime before adding a row: stock menus can retain
label, callback and selection storage after their opener returns. Keep that
storage base-owned and make removal retire every reference before reclaiming
module memory; a callback that is not currently running can still be retained.
An appended action must also leave the native remembered selection valid for a
later stock-only menu. Test both selected-slice and unsliced variants and prepare
their marker state explicitly. A closed window may be used to cancel a preview,
but is not evidence that retained table pointers can be reclaimed.

Closing a native menu need not detach its label/callback/selection pointers.
Beat Slicer's compiled 1.40C menu fixture observes those pointers still retained
after selection. Keep composed arrays base-owned and refuse reuse until old
callbacks are quiescent; validate the owner under the loader's stable lock.
Verify tail-call argument storage too: the observed stock selection routine
rewrites its first incoming argument word, so a zero-argument C test call can
corrupt its caller even when all menu assertions pass. These are isolated
execution findings, not a proved live detach or loader integration service.

A retained no-argument callback must not adopt a newer opening's global token.
Bind authority to the actual selection path before native close, validate it at
the direct callback tail and consume it once; retire only after callback return.
Refuse nested selection before it can use the outer context. Beat Slicer's pinned
1.40C experiment also observes stock overwriting its caller's first argument:
an extra nested call frame would change that ABI effect. Compare original and
wrapped register, SR, stack and argument behavior separately from full-popup
execution. These checks do not authorize reclaiming retained references.

Immutable resident tables can support repeated fixed-owner openings without
claiming native detachment: keep every retained label/callback/action alive,
require completed dismissal and dispatch return, and issue fresh exact selection
authority. Keep distinct layouts independently stable and test transitions caused
by normal stock edits. This strategy does not supply owner replacement, changing
contributions or USB reclamation; retiring an owner must withdraw its action
without freeing retained storage. Beat Slicer's private 1.40C fixture is limited
to that fixed-owner lifetime.

The runtime owner ledger includes staged candidates and retained rollback
predecessors. `modwerk_runtime_owner_valid` proves intact retention, not current
publication. Under the stable loader lock, also match the exact published owner
before resolving an admitted menu handler; retain separate registry/module-set
readiness gates. Retire the activation before replacement/removal, even if an
Undo later restores the same image. Polling alone can miss that whole interval
and must not revive an old activation. Compose retirement into the existing
loader metadata SWITCH callback before publication changes; PREPARE must not
retire live actions. A later refused switch may conservatively retire an
activation, so restoration/reopening needs a fresh one. Preserve all other
admission checks. Beat Slicer's isolated real-loader host/ColdFire fixture tests
this callback ordering and partial-set rollback; production board registration,
source cancellation and native reference retirement remain separate.

Cancel copied preview exchanges before publication as well as retiring their
menu actions. Acquire their nonblocking source boundary within the established
loader lock; a refusal must prevent publication. A later refusal may leave an
earlier exchange cancelled, requiring fresh activation even though the image
stays published. Do not mutate an engine-owned session from the loader path or
reroute old intents into reused storage. Beat Slicer's generated-PCM real-loader
fixtures cover partial cancellation and set rollback; production lock/handle
admission and reference reclamation still require their own proof.

When a menu stores a short module/generation identity, resolve it through an
admitted full-owner activation and an explicit action allowlist before dispatch.
Copy registration records into base-owned storage; do not retain a caller's
temporary array or an unchecked module function pointer. Different modules may
share an action ID, so qualify coexistence and one-owner removal independently.
Beat Slicer's proposed backend tests this with real-loader host and ColdFire
execution under synthetic machine services; typed package admission and native
transition hooks are still not installed.

Validate and publish the same bounded copy of a contributed descriptor. Keep
labels and action metadata in base-owned storage, and resolve entry offsets
only inside the exact owner's initialized image. The loader lock pins that
image but may leave real-time module writers running; descriptor coherence
needs its own verified boundary. An owner digest is reconstruction identity,
not a fresh hash of mutable live data. The Beat Slicer proposal tests malformed
records and copied metadata; it does not establish production table admission.

### Emulator evidence

An emulator can pause inside observer bookkeeping, after an entry diagnostic
changes but before its scope is published. For a quiescent checkpoint, wait
within a fixed bound for both empty scopes and balanced entry/return diagnostics;
do not weaken fault assertions or hide a persistent mismatch. Beat Slicer's
private 1.40C full-marker fixture reaches this intermediate wrapper state.

Do not infer physical pool capacity from a mutable allocation-map endpoint.
In the 1.40C full-boot fixture, recorder reservations reduce that endpoint; after
three explicit arena pages are removed, 14,599 physical usable pages coexist
with a 10,919 map endpoint. Verify the build's actual reservation geometry and
current map bounds separately. Never inject test code into apparently unused
stock heap/globals or delay memory; use a real arena reservation.

For emulator memory watches, use the pinned machine implementation's canonical
address and verify a known store as a positive control. Attribute stores using
the callback's PPC value, not the CPU's advanced fetch PC. In Octabam `8250be0`,
1.40C editor busy/dirty writes at `0x46…` were observed by `0x46…` watches;
substituting `0x86…` observed none. A silent watch is not evidence of no mutation,
and a generic CLI alias note must not override the actual mapped window.

The pinned full-boot emulator's interactive `call` requires main's idle spin;
a normal panel `run` may pause elsewhere. Advance normal execution to a verified
idle boundary before borrowing a call. A retry is safe only for a proved
pre-entry refusal; never replay a call after an uncertain timeout or CPU stop.
Do not force PC/registers to manufacture that boundary. The pinned `8250be0c`
`callAsMain` pushes arguments but does not perform caller cleanup; repeated calls
need a balanced native wrapper, or zero-argument test entries. Keep such driver
behavior bound to the tested emulator source and separate from native service
scheduling. Derive native argument counts from the caller and callee, not the
number of stack words a watch prints: the 1.40C recorder preparation caller
passes two words and removes eight bytes; later watched words belong to its frame.

A longer source file does not prove a longer preview extent. In the pinned 1.40C
emulator, replacing a one-second WAV with a 30-second file retained the old trim;
EDIT SELECT ALL changed the edit selection, not that trim. Verify the actual
trim and tempo after normal sample preparation. Measure both total service work
and the longest callback when optimizing bounded background work; fewer calls
alone can hide a longer interruption. Whole-machine request windows include
stock/UI/scheduler work and must not be labeled isolated module cost or hardware
time. Bounded idle retries may advance normal execution only after a verified
pre-entry refusal; all uncertain execution remains terminal.

Prove that instrumentation observes the execution path in use. On the pinned
`ot_emu` revision `8250be0c`, `Machine::setStepHook` is invoked by `Machine::run`,
not a probe's direct `Machine::step` loop. Use explicit PC checks or memory
watches there, and require a positive read/write control before interpreting
zero counts as evidence of absent accesses.

When testing a captured tempo source, change the instrument through its ordinary
panel path and verify the displayed value, runtime value and unchanged sample
attributes separately. Beat Slicer's pinned 1.40C stock fixture measures TEMPO /
LEVEL adjustment at 90, 137 and 120 BPM; a private native preview run compares
90 BPM PROJECT results with the sample's distinct BPM. These stopped-source
observations do not establish external sync, pattern tempo or changes in flight.

Recording-buffer follow-up: see the dated [implementation recommendation](RECORDER_BOUNDARY.md#implementation-recommendation-25-october-2026). It proposes completed/stopped recordings first and does not enable production recorder support.
