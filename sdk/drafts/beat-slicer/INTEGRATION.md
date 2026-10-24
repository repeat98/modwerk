# Native integration requirements

These are remaining tasks, not implemented behavior.

1. Establish the 1.40C slice-menu dispatcher, decoded PCM reader and marker
   transaction ABI from a locally owned stock OS and real observations. Stock
   OS stays on the user's computer. There is no slice-editor event in the
   current registry. Never guess firmware addresses or publish stock bytes.
2. Design an additive base-owned editor event/table, with locally verified
   site, whole-instruction length and guard hash, in a separate owner-reviewed
   SDK change. The module subscribes, never patches a shared site itself.
   `editor_menu.c` now composes copied stock/contributed labels and owner-checked
   dispatch with explicit retirement. Native locking, package admission, rendered
   menus, event assignment and actual detachment/removal remain absent.
3. Compile planner.c with the pinned ColdFire toolchain and a real adapter.
   The standalone planner now links and executes 164 synthetic CPU-emulator
   vectors; the real adapter is still absent.
   Read PCM through bounded background work, not the audio interrupt. Explicitly
   support Flex/Static, mono/stereo and sample encodings; refuse unsupported data.
   `planner_job.c` supplies a portable resumable scan prototype with no reader
   callbacks; native scheduling and content pinning remain absent.
   The traced pool lookup is Flex/recorder-specific and does not decode PCM.
   Validate its preconditions before use; establish Static access separately.
   Stage bounded bytes and prove decoder read extents before using a native
   converter. A raw pointer must not survive a scheduler yield.
   `pcm_reader.c` now supplies bounded packed-PCM decoding and a 32-frame
   copied cache, accepts page-shortened replies and checks operation/revision
   tags. Its provider is still synthetic: native pool ownership, file IO,
   format discovery, generation coverage and scheduling remain absent.
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
   signals; shortage cleanup queues more work. Remaining modes/follow-up writers,
   real ISR scheduling and shared-pool serialization still need investigation.
   `preview_session.c` now connects complete metadata snapshots, guard admission
   and the staged reader through a nonblocking serialized callback interface.
   Host and compiled-target tests cover complete previews and stale/cancel/error
   handling; native callbacks/locking remain absent. Flex replacement-refusal
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

The portable [transaction coordinator](EDIT_TRANSACTION.md) now exercises Apply
and Undo confirmation, complete history, failure rollback contracts and source
quarantine against a synthetic backend. A compiled Flex-to-transaction fixture
also executes stock row-binding, selection and redraw refresh. It retires the
old selected row before rebuilding a shorter table; this order avoids the
isolated stale-row dereference, but supplies no live exclusion. Its backend must provide actual atomic
publication and complete auxiliary rollback under a verified reader/writer
boundary; no installed service or native transaction is supplied by this draft.
