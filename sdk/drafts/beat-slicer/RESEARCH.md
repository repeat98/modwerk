# Beat Slicer integration investigation

Local investigation, 23 October 2026. This is an unlisted draft, not a release
or a request to operate the instrument. No firmware addresses are proposed
for patching. No module, project, sample or missing-module reference was
changed on the device.

## Sources and duplicate check

- Modwerk main `610a934da51b8f8518e6296493da9059b83e9a7e` matched this checkout
  at inspection. Its seven open PRs were #790, #776, #775, #676, #564, #560
  and #555; none implements the Octatrack slice editor. The contributor fork
  had no open PRs. PR #775 is a useful example of a shared menu table, but
  concerns MIDI generators and is not a dependency.
- Pinned Octabam tooling is `8250be0c23ca0a0a953cb7e5721e3bdb98dadfe5`.
  Current upstream main was fetched and inspected at
  `ff9c5f846928cc84d69a7e559fae4b8abb0c6b4f`, without moving the pin or
  replacing Modwerk's preserved SDK. The cache retains only the tooling
  command's reviewed `usb_probe.py` and `rec.swift` repairs.
- [Octabam PR #858](https://github.com/sambanks/octabam/pull/858), head
  `c788fda0472a93961149e2d0199ec5c3f09640dd`, proposes EDIT EVENTS for held
  trig edits and pattern/track pre-copy notifications. It supplies neither
  sample-editor transactions nor sample playback smoothing. Do not depend
  on its separate module. Other open PRs were #860, #859, #854, #851, #846,
  #824 and #805.
- The local Octatrack catalogue/drafts contain no equivalent beat slicer.
  Digitakt DIGISLICER is a different machine/platform and storage design;
  its implementation is not an Octatrack ABI. No code was copied from it.
- Elekloader was initially pinned at `7b5b5b8` (kit 0.6.0). After integrating
  Modwerk main `f99681ec170884593079b514da8b2f706d07e7d6`, the documented
  `upstream:tools` command verified Octabam's unchanged pin/repairs and updated
  the cached Elekloader checkout to `3b31ef3` (kit 0.7.0), matching the vendored
  kit. These tool checkouts remain outside Git. The event registry and native
  toolchain Dockerfile were unchanged across this upstream update; it supplies
  no new sample-editor transaction or playback-boundary service.

## What the shared interfaces actually provide

Read `sdk/machines/octatrack/events.json`, generated `EVENTS.md` and
`include/modwerk_events.h` at the Modwerk revision above.

| Interface | Existing contract | Why it is insufficient |
| --- | --- | --- |
| `ev_play_increment` | Modify playback increment when stock recomputes it | Not a PCM renderer or a reliable per-boundary notification; never scan PCM here |
| `ev_voice_bind` / `ev_voice_bind_run` | Before stock resets/binds a track voice | No outgoing audio, slice identity, endpoint or crossfade state; cannot establish declick coverage |
| `ot_machines` | Machine rows, pages and source renderer ownership | Beat Slicer is an editor action, not a replacement machine |
| `ot_sequencer_rows` | Shared project sequencer menu rows | Not the audio editor menu or sample transaction service |
| Project load/line/write events | Project settings serialization seams | Not the stock sample-settings/marker save path |
| `dsp_track_source` | Exclusive source hook, feature 4 for Analog BD | Not a general sample boundary hook; Beat Slicer cannot claim Analog BD's owner/site |

The source registry ends at event 30. Do not reserve 31 speculatively: another
reviewed base change may append first. DSP site numbers are a separate ABI.
ABI 10 package-carried engines do not by themselves grant arbitrary DSP hooks
to a new module; current admission still binds the packaged feature to its
reviewed controller and source site.

## Offline stock analysis

The user's BIN was recognized by Elekloader as original Octatrack 1.40C:

- Container SHA-256: `34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad`.
- MAIN SHA-256: `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
- MAIN length 1,112,560 bytes; load address supplied by the device profile.

`inspect_stock.py PRIVATE_MAIN` refuses any other hash and reports only label
addresses and pointer references. It locates CREATE SLICE GRID and DELETE ALL
SLICES in two nearby groups of references. These are search leads only:
the string search alone establishes no code entry, calling convention or
mutation semantics. No event guard or site was added. Raw firmware and any
disassembly stay outside the repository.

Subsequent private `m68k-elf-objdump` inspection provides a narrower lead:
the routine beginning at `0x40072c10` selects six-row or nine-row label and
callback arrays before calling the common menu routine at `0x4006d94c`.
Both CREATE SLICE GRID rows point to `0x40072cb8`, which opens an eleven-row
menu after validity checks. The inspected opener span is 116 bytes with
SHA-256 `bf2a6e0d9fe2a3e4cae51dafc126777b83c726fc4dd7970e7651df2e341adc44`.
That is an analysis-span identity, **not a proposed patch guard**. Full call
ABI, every incoming branch, selection lifetime and native commit/rollback behavior
still need execution traces. No code or stock table is included here.

Six isolated CPU-emulator probes now narrow that uncertainty (not a full
panel/editor trace; see `evidence/stock-cpu.json`):

- The six/nine-row opener passes count, selected index, selection-output
  pointer, label array and callback array to the common menu routine.
- The common routine retains those pointer arguments. Selection stores the
  index and closes the menu before invoking the callback synchronously through
  `0x40020c28`; that helper is an immediate null-safe call, not a task queue.
  Label/array lifetime still extends beyond the open call. Loader removal must
  account for these retained pointers.
- Settings lookup and the slice pointer-refresh routine agree on a slot
  stride of `0x448`, count at `+0x444`, and 12-byte start/end/loop records from
  `+312`. These are observed in synthetic CPU state, not a public SDK layout.
- Stock `0x40070c28` sorts complete records stably by start in the exercised
  fixture. A manual insert at frame 200 between records starting at 100 and
  300 moves the latter from ordinal 1 to 2 while preserving its end/loop.
  This confirms an ordinal-preservation hazard; it does not trace pattern
  lock playback. UI/refresh follow-up calls in that insertion probe are mocked.

The draft [base-service proposal](BASE_CONTRACT.md) makes the resulting
preservation and lifetime requirements explicit. No registry or base code
has been changed and no patch guard has been promoted from these observations.

### Isolated storage execution

Five additional probe groups execute the actual stock serializer/parser and
sanitizer instructions, with file primitives replaced by synthetic memory IO.
Source and private MAIN hashes are in `evidence/stock-storage.json`. Nothing
is written to a real project, sample, card or instrument.

- Project markers: writer `0x40089d84` and parser `0x40085ca4` round-trip all
  264 synthetic slot records, preserving trim, all 64 complete slice records
  (including inactive ones), count and unrelated settings bytes. The exercised
  current stream has a 22-byte prefix, 264 × 784-byte records and a two-byte
  checksum. Checksum coverage starts at byte 20. In-memory records have a
  12-byte reserved gap before the count; copying 784 contiguous bytes from
  trim would therefore be wrong. This is not a proposed custom serializer.
- Failure paths: a bad project-marker header returns -51 without changing
  the tested settings region. A bad checksum returns -54 and truncation after
  the first slot returns -29, but both have already changed marker memory.
  The writer's protection flag returns -53 before invoking the write mock.
- Sample settings: writer `0x40089940` and parser `0x4008b8d0` round-trip the
  complete marker region for Flex and Static through 832-byte synthetic
  streams. Other slots remain identical. The track-refresh callee is mocked;
  attributes, active voices and physical `.ot` persistence are not qualified.
  A bad checksum again returns -54 after marker memory has been changed.
- Sanitizer `0x40099374`: six Flex/Static fixtures with lengths 32, 64 and
  1,000 frames demonstrate 12-byte slice stride, a minimum region of
  `min(length, 64)`, clamping of starts/ends/loops, preservation of disabled
  slice loops and no changes to inactive records or other slots. Repeating
  sanitation is idempotent in these fixtures. Tempo/name/track-update callees
  are mocked; recorder special cases and live concurrency remain untested.

These results exclude two unsafe integration shortcuts: using a stock parser
as an atomic transaction, and running stock sanitation speculatively on live
records. Preflight must reject an edit that would normalize an existing
record. Whole editor flows, working/saved-copy selection, internal rollback, native file
failure recovery and physical reboot remain unproved.

Relevant upstream research (reported evidence, not newly observed hardware):

- `docs/firmware/STORAGE.md` section 4 describes complete marker records,
  working/saved copies and stock sanitation. Its 16-byte header summary and
  20-byte sanitizer stride differ from the current stream and 12-byte stride
  executed above. The older compatibility branch is not exercised by these
  probes. Keep the preserved upstream file exact; do not build an adapter or
  a custom `.ot`/project writer from either an untested layout or these narrow
  isolated fixtures.
- `docs/firmware/REPITCH.md` distinguishes the sample's ATTR tempo from the
  latched project tempo and explains forward/reverse renderer paths.
  Revalidate the chosen value at Apply; the other source must not silently
  substitute for it. Pattern tempo behavior needs an explicit UI decision and
  execution evidence.
- `docs/firmware/DSP.md` describes ColdFire grain crossfades and DSP
  interpolation. A timestretch crossfade is not proof that arbitrary slice
  starts, stops, reverse jumps or retriggers are smoothed. Its FX-instance
  address correction on current main also reinforces checking both cores;
  do not derive resource layout from the older tooling pin.

### Isolated pool lookup and PCM conversion

Five probe groups execute private 1.40C instructions against authored memory
fixtures (`evidence/stock-reader.json`). These addresses identify routines
under investigation, not SDK entry points, proposed patch sites or a usable
native reader. The raw pool and descriptor values are synthetic; no stock
table, audio, disassembly or firmware bytes are included in the report.

- Control lookup `0x400946d8(kind, slot)` distinguishes the Flex/recorder arena
  from Static. The pool walker `0x4009499c(slot, position, direction)` calls
  it with kind 1 unconditionally and does not null-check the returned pointer.
  The helper returns zero for an unavailable Flex pool or slot 136 in the
  tested fixtures. The walker must never be called with those preconditions;
  it is not a general Static reader or a validating public service.
- In 88 forward cases across four authored mono/stereo 16/24-bit layouts and
  Flex slots 0/127, the walker follows non-contiguous physical pages. `d0`
  points at the requested frame; `d1` limits the run by both the page edge
  and sample end. Negative/out-of-range positions return a zero run in the
  exercised valid-slot fixtures. Source pool bytes remain unchanged. The
  test supplies page geometry explicitly; actual runtime table initialization,
  allocation ownership, format validation and concurrent reclamation are not
  qualified by it.
- The reverse convention differs: 36 cases show a pointer immediately after
  frame `position - 1`, with raw `d1 = (position - 1) % page_frames`, including
  zero at the first frame of a page. Do not treat it as a conventional reverse
  block length. Beat Slicer can scan source coordinates forward regardless
  of how a musician later plays the slices.
- Four recorder fixtures (slots 128/135, active/inactive) confirm dynamic
  length selection. The recorder-state and length helpers are explicit mocks;
  this does not establish coherent reads of a recording in progress.
- Converters `0x4009825c` and `0x400982e4` pass 40 fixtures covering 16/24-bit
  signed extrema, both byte orders, lengths 0–9, four-value vector loops and
  scalar tails. Output is left-aligned signed 32-bit PCM, not the planner's
  right-aligned signed 24-bit representation. Output sentinels, source bytes
  and callee-saved registers remain intact. A data-read watch confirms the
  24-bit scalar tail reads **one byte beyond the logical input extent**; the
  extra byte is discarded, but must still be readable. Use padded staging
  or a separately verified bounded decoder, not an arbitrary unpadded span.

The upstream `docs/firmware/SAMPLE_SAVE.md` supplied the initial pool-walk
lead. Its claim of exactly two callers is incomplete for this MAIN: local
analysis also finds direct callers in the sample-editing routines. Keep the
preserved upstream document unchanged and treat these observations as narrow
evidence. Static streaming, the editor's read path, live metadata/content
pinning, cancellation, scheduler timing and playback smoothing remain open.

## Content coherence and the staged-reader pipeline

`evidence/stock-coherence.json` binds five additional synthetic CPU probe
groups to the same private 1.40C MAIN and pinned emulator. No callees are
mocked in these groups. Geometry, slot state and PCM are authored fixtures,
not captured runtime state. The full scheduler, card, DSP and device do not run.

- `0x40094c94` performs the exercised stereo polarity edits. Twelve calls
  cover left/right/both channels, 16/24-bit data, a physical page boundary
  and repeating the edit. Audio changes exactly as expected; all 44 bytes
  of the slot-control record remain unchanged, including the word at `+20`.
  The dirty byte is set on the first call and remains set on the second.
- `0x40094b6c` performs cyclic rotation in eight calls across 16/24-bit,
  mono/stereo fixtures. A three-frame rotation repeated twice produces the
  independently expected six-frame rotation, again with unchanged control
  records and a sticky dirty byte. These fields are not a content epoch.
- Eight polarity-edit refusal fixtures cover mono input, busy state,
  unavailable pool, invalid slot and invalid ranges. They preserve the
  authored audio, control record and dirty byte. These cases do not establish
  that every stock editor operation is atomic or safe on invalid inputs.
- Three `0x40096300` release fixtures test counter values 0, 41 and uint32
  maximum. Release increments that counter, replacing wrapped zero with 1;
  it clears the released pages and resets the slot state/length. A second
  slot's audio and control record remain exact while its map offset moves.
  A write watch observes the temporary page map and restoration of the normal
  map. This rules out caching a map pointer solely on a slot counter. It does
  not establish concurrency safety or prove every release caller's context.
- Eight previews execute the real stock page walker and copy only the
  returned extent into the **host-compiled** bounded reader. All four packed
  layouts and both boundary modes match a separate formula-backed synchronous
  planner, and the preview changes no audio/control/dirty bytes. An ensuing
  stock rotation leaves the counter unchanged; an explicitly advanced test
  revision makes `bs_reader_result` refuse the now-stale completed preview.
  The revision is supplied by the fixture, not by an implemented native
  change-tracking service. This is a mixed stock-CPU/host pipeline, distinct
  from the earlier separate ColdFire execution of the portable reader.

All calls restore the tested stack, callee-saved registers and interrupt mask.
That is narrow ABI evidence with interrupts disabled, not a live critical-section
proof. The adapter still needs writer coverage and a verified copy/ownership
guard, as specified in BASE_CONTRACT.md. Metadata equality and a correct
decoder cannot compensate for untracked content mutation.

## Expanded writer lifetime investigation

The 0.1.4 coherence runner adds channel transforms, reverse, fades, gain,
normalization and cross-slot copy/mix to the executed stock operations.
Sixty-eight successful edit calls show a destination dirty store before PCM,
unchanged control records (including busy/counter) and unmasked instruction
intervals between masked PCM stores. Silent normalization marks dirty and
returns failure without any PCM write. See the exact fixtures and limitations
in [TESTING.md](TESTING.md#expanded-writer-lifetime-probes-014).

This rules out using the busy field or an early dirty-store notification alone
to admit new previews: a new read could otherwise start during an unfinished
operation. It does not prove an actual live interleaving. The service needs
writer-lifetime exclusion as well as old-token invalidation. The
[coverage checklist](WRITER_COVERAGE.md) separates observed operation families
from missing loader, recorder, allocation, metadata and Static evidence.

The 0.1.5 worker probe follows this lead through the actual task prologue,
queue operations, seven edit dispatch paths and completion posting. See
[worker lifetime evidence](WRITER_COVERAGE.md#executed-worker-lifetime).
It establishes narrow synthetic command lifetimes, not a complete call census,
live serialization or approved hook site. No stock instruction bytes or
tables are included. Native exclusion remains absent.

## Portable admission bookkeeping (0.1.6)

The [guard prototype](PREVIEW_GUARD.md) implements the proposed lifetime rules
in original, bounded C. Host sanitizers and compiled ColdFire selftests exercise
nested/overlapping edits, stale tickets, owner revocation, counter exhaustion
and staged-reader invalidation. The stock worker runner now supplies observed
entry/return events to a host guard, including copy, crop and release. Crop's
nested rotation must not release the outer exclusion; an invalid crop range
can still increment the stock counter; release has no completion-helper call.
These are executed synthetic cases, not installed native instrumentation.

## Proposed base contract, not an implemented ABI

The first shared SDK change should own the sample editor menu and its stock
transaction boundary. It must be separately owner-reviewed before a module
can subscribe. Provisional names below intentionally have no index or address:

1. A table such as `ot_sample_editor_actions` adds a row without replacing
   YES or claiming the whole SLICE screen. Base code owns native menu
   dispatch, redraw, lifetime and ordering; unrelated rows still call stock.
   Final record/prototype, capacity and guards follow measured callers.
2. A read-only snapshot service supplies opaque sample/content generation,
   complete slice records, trim/loop state, source/format, decoded PCM access
   and the selected tempo. No long-lived raw pointer into a mutable slot.
3. Preview runs as cancellable, bounded background work. The synchronous
   planner remains an oracle; `planner_job` and `pcm_reader` now provide
   resumable planning and a copied PCM cache. Their provider is synthetic,
   and bounded work is not a measured UI deadline or Static-streaming budget.
   Native scheduling must yield without waiting on storage in an audio ISR.
4. Apply compares the whole snapshot under stock's serialization boundary,
   rejects stale content/markers/trim/tempo or an active conflicting editor,
   then commits once. Preview, Cancel and failed Apply do not dirty or save
   anything. Retain complete records for failure rollback; the player removes
   markers through stock slice-clearing actions, with no separate module Undo.
   A later project/sample save uses stock, never a new storage format.
5. Preserve stable slice semantics, not merely starts. Inserting a start into
   a sorted list can renumber existing slices and change slice-lock playback;
   this needs native investigation and an explicit policy before Apply.
   Existing starts outside trim, per-slice ends/loops, overlapping records and
   sub-minimum final regions must be preserved or explicitly refused.
6. Retire pending previews/jobs on sample switch, editor close and uninstall.
   Prove that no menu callback, voice or PCM job retains module pointers after
   removal. Missing-module fallback must still load ordinary stock markers.

## Playback smoothing decision

Do not implement smoothing at an arbitrary effect/mixdown tap: it could fade
other voices and effect tails, miss direct/cue paths or conflict with stock
source ownership. First trace the actual start, end, retrigger, loop wrap and
discontinuous seek paths for Flex and Static on both cores, including reverse,
RATE/PTCH, timestretch, locks and multiple tracks sharing a sample.

An attack ramp alone cannot remove a discontinuity when the outgoing voice is
cut off. A release/crossfade requires a valid outgoing source/history, bounded
per-voice state and a defined policy for short slices and overlapping jumps.
Any shared boundary service belongs in the base; the module's own algorithm
and tables stay in its package. No dependency on another module, destructive
sample fades, global AMP edits or private shared-site patches are acceptable.

Even every `needs_fade == 0` result remains only an amplitude observation.
Apply stays disabled until the actual playback policy is implemented and
qualified, including save/reload and module-absent behavior. Do not label a
quiet-marker fallback as acceptance of the click/pop requirement.

## Before an exact hardware trial

Finish native linkage/execution, menu/transaction ABI proof, cancellable PCM
work, full-record preservation and stale/failed-commit regressions first.
Then source-build card/browser/runtime packages, prove stock-free export,
compatibility/admission/removal and emulator lifecycle, and measure resources.
Only then name an exact private build and request a scoped disposable-project
trial. The existing unit's missing module references remain untouched. Actual
audio and physical save/reload/reboot evidence remain separate requirements.

## Editor publication observation (0.1.11)

`stock-publication.json` executes the grid dialog opener (`0x40073984`), its
selection callback (`0x40073a68`), completion path (`0x40072e74`), pointer refresh
and selection refresh (`0x400718f8`). Display/progress/search callees are mocks.
The redraw helper (`0x4006dbdc`) sets a notification and changes no marker
records; earlier descriptions of that mocked follow-up as possibly dirty/Undo
were unresolved guesses, not established history behavior. Deferred grids
clear count before search completion and publish records later. These are
observations on synthetic state, not approved native entry points or patch sites.
See TESTING.md for scope and remaining native publication/persistence limitations.


### Full stock emulator observations

The pinned original 1.40C MAIN now runs through project creation, ordinary
Flex sample loading, editor attributes and zero-aligned stock grid creation
with both DSP cores and the normal scheduler. The private fixture is an
original one-second, stereo 16-bit 44.1 kHz WAV; all 176,400 loaded PCM bytes
match it after byte-order conversion. The normal map owns 29 pages and the
runtime format descriptor matches 1,536 frames/page and four bytes/frame.
These observations extend the synthetic descriptor fixtures to one real load;
they do not establish native source ownership or other formats/rates.

Loading the Flex slot did not assign it to the current track until its slot
was confirmed. The editor initially still identified an empty Static slot.
Bind the source to the actual editor kind/slot. The rendered stock tab order
also corrected the draft: AMP selects SLICE, LFO selects EDIT, and plain YES
opens the slice-action menu. A PC watch saw the known slice-menu entry once
for the corrected gesture. No Beat Grid action is installed.

On ATTR, sample tempo changed from 120.00 to 120.25 BPM while project tempo
stayed 120 BPM. The corresponding observed sample value at settings +276
changed from 2,880 to 2,886; the project value at `0x80001814` remained 2,880.
This supports these getters in this one state, not pattern/external-clock
semantics or an unguarded live read. Four-slice zero-cross alignment reached
the two continuation entries four times each and the common completion entry
five times, with four final records. These are observed entry counts, not
five independent completed edits or a native atomic transaction.

The private project was loaded again through stock and its complete 64-record
marker-table/count hash and sample tempo remained exact. A subsequent save
was allowed to finish visibly and produced all 16 saved bank copies and eight
saved arrangements. An earlier flush had covered only 14 bank copies while
the UI still showed progress: fsync is not firmware-operation completion.
See [the full observation workflow](BOOT_OBSERVATION.md) for the automated
read-only load/PCM/planning check and its explicit qualification limits.
