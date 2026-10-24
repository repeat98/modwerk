# Native integration requirements

## Current readiness

Basic scope: 0.1.57-experimental, private staging.

The owner chose a basic working slicer first. File-backed Flex and Static share
AED slice commands and record geometry; their settings/control tables differ.
Both are covered by the new metadata-only service. A Static PCM/streaming reader,
quiet-boundary analysis and playback fades are deferred. Ordinary stock playback,
confirmation and clearing are the first version's workflow, with no added Undo.

The independent `device_module.c` controller builds through the standard C package
builder and contributes a typed action to the proposed `ot_sample_editor_actions`
table. The private base owns native menus, source capture, confirmation and atomic
marker publication; the package contains no stock addresses or writer. The
service requires stopped playback/recording and file-backed slots 0–127. Default
bases refuse this contribution. `--sample-editor` is a private staging opt-in,
not released beta support or an approved shared ABI. `module:doctor -- beat-slicer`
currently reports no registered module because the draft is deliberately unlisted;
it is a release-integration gate, not a passed check.

The current replacement extension needs a revised private base. Existing slice
tables are replaced only after the stock REPLACE SLICES? warning; old API callers
retain preservation-only behavior. A confirmed YES waits across temporary busy
work and revalidates before one write; NO or another stock gesture cancels it.
The owner reported initial 0.1.56 success followed by repeated-edit failures.
Exact 0.1.57 device qualification remains pending.

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
