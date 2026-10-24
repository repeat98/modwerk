# Beat Slicer

Version: `0.1.19-experimental` · author: @twwwy · **unlisted development draft**.

## Overview

Plans slice starts at beat intervals derived from sample BPM or project BPM.
Category: **system**, because this is a one-shot sample editor operation with
no effect slot or ongoing sequencer clock. The portable C core is implemented
and host-tested. This is **not an installable Octatrack module**: editor,
playback, storage and USB integration are pending.

The grid starts at sample trim start. One beat is a quarter note of the chosen
BPM; track speed and swing do not move offline sample markers. Project BPM is
captured for the operation, not followed live. Later tempo changes must never
automatically rewrite slices.

## Controls

Proposed dialog, not implemented on the instrument:

| Control | Values and behavior |
| --- | --- |
| BPM SOURCE | SAMPLE (default): sample ATTR BPM; PROJECT: project BPM. Show the actual value; refuse missing/invalid BPM. |
| SPACING | 1, 4, 16, 32 or 64 beats (default 1). |
| BOUNDARY | SMOOTH (default): quiet-boundary search in both channels within ±2 ms; EXACT: mathematical beat grid. |
| Preview | Show resulting total, existing/new markers and boundaries needing fades. No sample changes. |
| Confirm / Back | Follow the stock slice-menu interaction. Confirm the prepared grid; backing out before commitment changes nothing. Native integration remains unavailable. |

Beat Grid belongs in the existing slicing workflow. After creating a grid, use
stock DELETE SLICE or DELETE ALL SLICES to remove markers. No Beat Slicer Undo
action or separate history dialog is planned. Clearing removes slices; it does
not restore the layout that preceded the grid. Internal failure rollback remains
required so an unsuccessful commit leaves the prior state intact. Exact button
and prompt behavior still needs comparison with stock 1.40C; in particular, NO
at stock's zero-cross question chooses unaligned slices rather than cancelling.

Existing markers remain exact. In SMOOTH mode, an existing marker within the
search window already covers that beat. Refuse more than 64 total slice starts
rather than truncate the sample or delete old markers. The current core accepts
30–300 BPM in 1/24 BPM units.

## Usage

The target is Octatrack MKII OS 1.40C through the Modwerk base and USB bridge.
MKI operation is a future qualification target.

Proposed access: Flex/Static audio track → AED → AMP (SLICE) → YES →
BEAT GRID. The stock AED → AMP → YES path is observed in the pinned 1.40C
emulator; Beat Grid integration and physical operation remain unverified.
No stock gesture or screen is claimed by this draft.

## Quick tutorial

Planned acceptance workflow, unavailable until native integration:

1. In a disposable project, load a copy of a known-tempo sample. Open the
   proposed action and choose SAMPLE or PROJECT BPM.
2. Choose 4 BEATS and SMOOTH. Preview markers and fade warnings. Cancel once
   and confirm the original markers are intact.
3. Confirm and audition adjacent/random slices, then use stock DELETE SLICE
   and DELETE ALL SLICES. Verify clearing removes markers without changing audio.
   Create another grid, save sample settings through stock, save the disposable
   project and reload both; compare complete slice metadata.

## Compatibility and limitations

No native hooks, guessed patch addresses, base changes, runtime subscriptions
or installable packages are included. Compatibility is unproved. See
[INTEGRATION.md](INTEGRATION.md).

Installing the eventual module must do nothing until Apply. Preserve source
audio, trim, loop points, existing slice loop/end metadata, other sample slots and
project defaults. Slice settings belong to the edited sample slot and affect
tracks using that slot; the dialog must disclose that scope. The core plans starts only and never writes
project or `.ot` files.

**Smooth playback is an acceptance requirement, not a verified result.** Zero
crossings alone cannot prevent clicks in stereo, DC-offset audio, retriggers
or abrupt endings. The core checks both frames bordering each start in both
channels and the last trim frame against a -60 dBFS peak threshold. It flags
unsafe boundaries but does not render or fade playback. Even a quiet boundary
is not a click-free guarantee. The adapter must provide verified playback
fades or refuse unsafe Apply; never overwrite source audio or global AMP
settings to conceal clicks.

The [preview admission prototype](PREVIEW_GUARD.md) now gives the proposed
base provider unique operation IDs and writer-lifetime tracking. It invalidates
old previews and refuses new ones during tracked edits, including nested edits.
Native instrumentation and serialized live memory access remain unimplemented.
The recorder investigation adds 20 synthetic calls covering stereo page crossings,
lazy shared-pool allocation and early exits. Recorder position/map publication can
precede PCM without an edit-queue, dirty-flag or counter signal; a live provider
must cover those writers too. No device-testable package is available yet.

The [preview session](PREVIEW_SESSION.md) now connects admission, complete metadata
snapshots and the staged reader through a serialized backend interface. It handles
waiting, cancellation and stale results on host and compiled ColdFire. The actual
stock callbacks and synchronization are still missing. Failed-load probes also
confirm that replacement errors can already have released the old sample.

The [marker candidate preflight](MARKER_EDIT.md) now preserves complete existing
records and slice numbers, refuses incompatible additions and retains inactive
rows for exact failure rollback. It prepares memory snapshots only; native
publication and the playback acceptance gate remain unimplemented.

The [transaction coordinator](EDIT_TRANSACTION.md) now offers a commit path that
binds confirmation and publication under one supplied lock and retains no Undo
history. Repeated creation needs no history-discard step. Internal failure
rollback, stale-clear refusal and fault containment are tested. Publication,
playback policy and quarantine remain synthetic callbacks; native Apply is disabled.
Its explicit Undo API is retained research, not the planned player workflow;
the native adapter must not expose it as an additional slicing action.

The [Flex metadata component](FLEX_METADATA.md) now decodes bounded settings
and control regions into preview snapshots and complete marker tables. It
checks source selection, readiness and format, preserves inactive records and
keeps sample/project tempo independent. Its native bindings and lifetime/lock
provider remain unimplemented; this does not enable live preview access.

Normal stock Flex/Static menu tests now cover alignment choices, backing out,
confirmed/cancelled individual and all-slice deletion, and clearing an empty
table. Those emulator tests verify the workflow to match, not a Beat Grid UI.

## Tests and measurements

Run `python3 -B sdk/drafts/beat-slicer/test_planner.py` from the root. Fourteen
host tests pass, including 250 independent rational grid cases. Integer
arithmetic, no heap and no independent clock.

The local independent audit adds 2,000 randomized grid/marker cases, 200
exhaustive stereo-search cases, threshold/refusal checks and arithmetic
extremes (`test_independent.py`). The pinned ColdFire object compiles without
unresolved runtime helpers and passes the shared code-generation guard. It
also executes 164 synthetic cases in the CPU emulator. Six isolated stock
routine probes cover menu lifetime and complete slice record sorting; UI
callees are mocked, so this is not whole-editor qualification.
See [RESEARCH.md](RESEARCH.md) and the proposed [base contract](BASE_CONTRACT.md)
for shared-event, preservation and smoothing work. Preserving old slice
ordinals as well as their records can require refusing some merged grids.
The portable preflight implements that conservative policy; native admission
and owner review of the restriction remain pending.

Native cycles, device memory, actual audio and hardware are unmeasured.
Five additional stock storage probe groups pass with synthetic memory IO,
including complete marker round-trips and failures that change memory before
returning an error. They do not qualify real stock save/reload or Undo.
Five pool/converter probe groups also pass: Flex page boundaries, recorder
length selection with mocks, and signed PCM conversion with measured read
extents. The 24-bit converter reads one padding byte in its scalar tail.
These probes do not implement a reader or qualify Static streaming.
The `planner_job` prototype makes preview resumable: it requests one PCM
frame at a time, can wait without blocking, rejects stale read replies within
a job and can be cancelled without exposing a partial plan. It copies input
metadata but cannot detect a live sample change; the future adapter must bind
it to the actual sample/content generation. It is not connected to the editor.
The `pcm_reader` staging layer now feeds that job from copied blocks of up to
32 frames. Its bounded decoder handles packed signed 16/24-bit mono/stereo
in either byte order without reading padding. Operation/revision tags reject
old replies and invalidate stale previews, including completed ones. The
caller must supply truthful revisions and coherent bytes; this is not yet a
live Flex/Static reader. It passes 4,160 decoder vectors, 40 paged previews
and lifecycle tests on host and compiled ColdFire, plus 256 exact-buffer
host sanitizer cases. No native generation tracking or device IO is present.
Five additional synthetic CPU probe groups cover stock edits and pool release.
Eight previews now feed stock page-lookup results into the host-compiled reader
and match the independent planner. This still does not establish a live reader:
stock rotation and polarity edits change PCM without changing the slot counter,
and the dirty flag stays set across repeated edits. The base must supply real
edit invalidation and coherent access; neither field alone is a revision token.
Expanded store/instruction probes cover eight edit families and cross-slot
copy/mix. Busy fields stay unchanged, and interrupts are unmasked between PCM
writes: the live provider must exclude reads for the whole edit, not just
individual stores. A dirty notification alone cannot protect a newly started
preview. [WRITER_COVERAGE.md](WRITER_COVERAGE.md) lists tested and missing paths.
[TESTING.md](TESTING.md) separates host results from pending qualification.
`verify.py` deliberately fails publication. This draft is not in
`sdk/catalog.json` and changes no released module or catalogue.

## Authorship and licences

Original MIT core and synthetic tests by twwwy and contributors. No Elektron
firmware, extracted routines/tables, factory samples or dumps. Generated with
the repository scaffold command; inherited placeholder code was removed.

## Screens and audio

No real LCD captures or audio qualification recordings exist. Proposed screen
text is not represented as captured instrument UI.

The [editor-menu composition prototype](EDITOR_MENU.md) now supplies stable
copied labels, unchanged stock rows and owner/token-checked contributed dispatch.
It refuses reuse until a trusted adapter proves all old menu references detached.
Native hook admission, loader synchronization, actual dialog rendering and
background-job removal remain unimplemented.

The [full stock observation](BOOT_OBSERVATION.md) uses a disposable stock-created
project and original WAV to check actual loading, PCM, editor tempo and marker
state. It also corrects the proposed stock menu path to AED → AMP → YES.
These are emulator findings; the Beat Grid action, native ownership, atomic
publication, stock slice-clearing compatibility, USB package and physical
qualification remain unfinished.

Research receipts retain their original source versions. Run
`python3 -B sdk/drafts/beat-slicer/audit_evidence.py` to check those Git bindings;
see TESTING.md for the explicitly unbound early compile diagnostic and the
limits of software evidence. This audit is not an installation or hardware gate.
