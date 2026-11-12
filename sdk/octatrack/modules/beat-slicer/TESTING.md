# Beat Slicer testing

## Release run, 27 October 2026

The published package `6650ef77…` ran on the owner's MKII over USB: on a development twin of the beta base, slicing, re-slicing while playing, both BPM sources, NO, self-test and rollback, plus the draw cost while the popup is open; on the exact beta base `903f8ed6…`, a trial, self-test and rollback. Results and what was not run: [evidence/hardware.md](evidence/hardware.md) and [evidence/performance.json](evidence/performance.json).

For the current completion boundary, see [integration readiness](INTEGRATION.md#current-readiness).
The versioned sections below retain historical research evidence; old Undo
experiments do not add a player-facing Undo requirement. USB Keep/Undo remains
an independent installation lifecycle requirement.

Current draft: 0.1.66-experimental. Development checks: 23–26 October 2026 (Taipei).
The chronological records below retain their own versions and source bindings;
older results do not qualify newer source or an installed module.
See [unlocked planning](#private-planning-outside-the-source-lock-0121), the [whole-command observer](#whole-command-observer-0120) and [Flex metadata results](#bounded-flex-metadata-0119) and the
[stock-style commit results](#stock-style-commit-and-clearing-0118).

Historical 0.1.4 record: the prior 0.1.3 evidence source was
`105f96022b23f05eb7e1af160eab8d2e9c5317e1`. The 0.1.4 writer report binds its
source files directly and its manifest pin was
`8c6d64e9832de11fd39490c9609d838c57aece4a`; its provenance follow-up changed
only this note and the evidence pin.
Initial checkout: 610a934da51b8f8518e6296493da9059b83e9a7e.
That development checkout included upstream main d8059069.
The original 0.1.0 cloud record remains in evidence/host.json; its hashes
describe the imported source, not the subsequently repaired planner.

## Local import and independent verification

Imported 12 regular files from the user's archive, SHA-256
`5fd070c65d6df3ceac322de850ce7c983ee6689de1ed1e8ef51f8959b1a4d9bf`, after
checking paths, types, size and destination collisions. No local file was
overwritten. All imported bytes were verified against the ZIP. The original
14 tests passed on macOS with Apple clang before changing the planner, and
the cloud record's three source hashes matched. The archive remains intact.

`python3 -B -m unittest discover -s sdk/drafts/beat-slicer -p 'test_*.py' -v`:
**18 tests pass** on the repaired planner. Four independent tests add 2,000
seeded rational-grid/marker-union cases, 200 exhaustive stereo-search cases,
threshold edges, out-of-trim refusal, maximum-step arithmetic at the uint32
limit and half-frame tie rounding. These use synthetic PCM, not playback.
See evidence/local-host.json for hashes and tool versions.

## ColdFire compilation and link

Built `sdk/build/Dockerfile` under `/tmp/modwerk-check.lock` as
`modwerk-source-tools`, immutable image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`.
GCC 16.2.0, binutils 2.47.20260726 and the repository-patched DSP assembler
are installed inside that image. No firmware is in it.

Run `native_probe.py --output /output` inside that image, offline, with the
repository mounted read-only at `/source` and a fresh private output folder.
Keep the machine-wide lock around the container. The script imports the
shared ColdFire code-generation guard and refuses an output under the repo.

The imported planner compiled but needed `__muldi3`, `__udivdi3`, `memcpy`
and `memset` (evidence/native-import.json). Version 0.1.1 carries exact
quotient/remainder arithmetic in bounded 32-bit values and copies explicit
fields; native builds also disable loop-to-libcall conversion. Final result:

- 1,994 bytes of object text, zero data/BSS, no undefined symbols.
- Standalone freestanding link passes at a synthetic address, not a device
  address. Shared stepped-register code-generation guard passes.
- GCC reports 644 bytes for `bs_preview` and 20 for `read_peak`; these are
  static compiler stack reports, **not total device stack bounds**. The PCM
  callback and native adapter add their own usage.

See evidence/native.json for that compile/link run. Subsequent target-code
execution is documented below. No runtime package was produced and no UI
latency, cycles or real device memory was measured.

## Isolated CPU execution, 23 October 2026

The same pinned object (SHA-256
`862fbf786e4388477f7c3efa7601dad7bef8d9583c5b0a21db5351e3276594d4`)
passes **164 native planner vectors** in synthetic CPU memory, with no stock
OS input. The runner compares mathematical grids against an independent
64-bit rational oracle, exercises both tempo sources and all spacings, checks
PCM callback arguments, callee-saved registers, input immutability, boundary
flags, output sentinels and atomic invalid/read/capacity failures. This is
execution of the compiled ColdFire instructions, not on-device timing.
See `evidence/native-execution.json`.

**Six isolated stock routine probes pass** against the private original
1.40C MAIN: settings lookup boundaries, both slice-menu variants, retained
menu pointers and synchronous selection, complete-record stable sorting,
12-byte slice record pointers, and insertion that renumbers an old record.
The formatting/display/editor-follow-up calls listed in `probe.cpp` are mocked.
The stock sorter and its copy helper execute. This is not full editor,
scheduler, save/reload or playback evidence. See `evidence/stock-cpu.json`.

Both runners use the upstream `ot::Machine` source at
`8250be0c23ca0a0a953cb7e5721e3bdb98dadfe5`, mc68k pin
`4a6d0d17a1f2b30077ab726c27fe9bb770fa0456`, GNU 13.3.0 host C++, Release
without LTO. The emulator's **EMAC and peripheral gates pass** before these
results are accepted. No DSP core executes in these probes. The DSP library
dependency comes from the prepared toolchain image, not an updated SDK import.

To reproduce inside the image above, mount the repository at `/source`
read-only, the verified Octabam tools checkout at `/upstream` read-only,
mc68k at `/cpu` read-only and a private empty build folder at `/output`.
Create `/output/vendor/mc68k → /cpu` and
`/output/vendor/dsp56300 → /opt/toolchain/vendor/dsp56300`. Under the machine
lock, with Docker networking disabled:

```sh
cmake -S /source/sdk/drafts/beat-slicer/stock_probe -B /output/build \
  -DCMAKE_BUILD_TYPE=Release -DOT_LTO=OFF \
  -DOCTABAM_ROOT=/upstream -DOT_VENDOR=/output/vendor
cmake --build /output/build --target beat_slicer_stock_probe \
  beat_slicer_planner_probe ot_emac_test ot_periph_test --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/native_probe.py --output /output/native
python3 -B /source/sdk/drafts/beat-slicer/native_execution.py \
  --compiled /output/native --executable /output/build/beat_slicer_planner_probe \
  --output /output/execution
```

Only the stock probe needs an additional read-only mount of the private MAIN:

```sh
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_stock_probe \
  --output /output/stock-probe.json
```

The wrapper refuses any other MAIN hash. CMake embeds each runner's source
hash, and the wrappers reject stale runner binaries before recording evidence.
Keep source fixed during builds and use fresh evidence paths. The preliminary
stock probe run made during a source refinement is excluded; only the rebuilt,
source-matched final run is recorded. All binaries/raw emulator logs remain
outside Git. The reports contain only hashes and test summaries.

## Isolated stock storage probes

Five groups pass in `stock_probe/storage_probe.cpp`, using the same pinned
CPU emulator and private original MAIN as the editor probes:

- Stock project-marker writer/parser: all 264 synthetic slots round-trip;
  complete records, count and unrelated settings are checked. Stream extent,
  record mapping and checksum coverage are checked independently.
- Bad-header, bad-checksum and truncated-input behavior: the latter two
  return errors after changing destination records; no atomic-load claim.
- Project-marker writer protection refuses before the synthetic write call.
- Separate sample-settings writer/parser: Flex and Static complete markers
  round-trip, other slots stay intact, and bad checksums fail after mutation.
- Six Flex/Static sanitizer fixtures (32/64/1,000 frames): clamping, disabled
  loops, inactive-record and other-slot isolation, and repeat idempotence.

The file read/write/size APIs are mocks over in-memory bytes. Serializer
output is not saved. Name/tempo/track-refresh callees are mocked where listed
in the source. These are stock-instruction observations in synthetic state,
**not actual Save Project, Save Sample Settings, Undo, card failure recovery,
physical reboot or playback tests**. Recorder-specific handling, older file
versions, and full editor/scheduler integration are not covered.
`evidence/stock-storage.json` binds the passing final runner to its source.

Reproduce with the mounts and machine lock used above:

```sh
cmake -S /source/sdk/drafts/beat-slicer/stock_probe -B /output/build \
  -DCMAKE_BUILD_TYPE=Release -DOT_LTO=OFF \
  -DOCTABAM_ROOT=/upstream -DOT_VENDOR=/output/vendor
cmake --build /output/build --target beat_slicer_storage_probe --parallel 4
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind storage \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_storage_probe \
  --output /output/stock-storage.json
```

The wrapper rejects other MAIN hashes, stale runner source and existing
report paths. `--kind editor` remains the default for the earlier six probes.
The first four-group exploratory run is retained privately; only the final
five-group source-matched run is recorded here.

## Isolated stock pool and converter probes

`evidence/stock-reader.json` records **five passing groups** using the same
pinned CPU emulator/toolchain and hash-bound private MAIN described above:

- Control lookup distinguishes Flex/recorder from Static and rejects the
  exercised unavailable/out-of-range Flex cases. The page walker itself is
  not called with those invalid preconditions because it omits a null check.
- 88 forward lookups: four authored page layouts, two Flex slots,
  non-contiguous pages, page/sample boundaries and invalid frame coordinates.
- 36 reverse lookups establish its different pointer and raw `d1` convention.
- Four recorder fixtures with explicitly mocked active/length helpers.
- 40 PCM conversion fixtures: both byte orders, 16/24-bit signed values,
  lengths 0–9, vector/scalar paths, unchanged source and output sentinels.
  A CPU data-read watch verifies the 24-bit scalar tail's extra-byte read.

All calls check callee-saved registers and stack return. Page geometry and
allocation maps are **authored fixtures**, not observed runtime initialization.
These tests do not establish a safe native reader: no Static file streaming,
booted editor, real content generation, allocation lifetime, concurrent
recording, scheduler integration, device timing or audible output is tested.
The probes do not copy stock routines/tables into the repository.

With the earlier mounts and machine lock, reconfigure CMake to pick up the
new target, then run:

```sh
cmake --build /output/build --target beat_slicer_reader_probe --parallel 4
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind reader \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_reader_probe \
  --output /output/stock-reader.json
```

Only the final source-matched run, including the read watch, is retained as
repository evidence. The preliminary run remains private. Existing reports
keep the wrapper/CMake hashes of their own runs, not the new reader target.

## Resumable preview prototype

`python3 -B sdk/drafts/beat-slicer/test_job.py` passes **500 comparisons**
against the synchronous oracle with host AddressSanitizer and UBSan. Both
full output and PCM read order match, including capacity failures, fractional
tempos, every spacing, both BPM sources and near-uint32-limit coordinates.
The same harness checks copied request metadata, cancellation at every
transition of a boundary search, repeated pending polls, rejected stale read
replies, and failed/invalid PCM at every read in that search. Incomplete,
cancelled and failed previews leave output untouched. See `evidence/job-host.json`.

The compiled ColdFire harness passes **100 comparison vectors** and those
lifecycle checks in synthetic CPU memory, with preserved registers and stack.
No stock code, scheduler, DSP, firmware input or device participates. The
resumable planner object is 1,944 bytes of text with no data/BSS; the complete
harness links without unresolved helpers and passes the shared codegen guard.
Compiler-reported stack is 44 bytes for begin, 48 (dynamic, bounded) for step,
16 for its insertion helper, 0 for supply/cancel and 4 for result. These are
individual compiler reports, not measured hardware stack or latency.
See `evidence/job-native.json` for final source hashes and exact flags.

To reproduce after the emulator setup above, under the same machine lock:

```sh
cmake --build /output/build --target beat_slicer_job_probe --parallel 4
python3 -B /source/sdk/drafts/beat-slicer/job_native.py \
  --output /output/job-native --executable /output/build/beat_slicer_job_probe
```

Reconfigure CMake first when adding the new runner to an older build folder.
Use a fresh output directory. The synchronous oracle stays separate so the
state-machine implementation is compared with independently structured code.
The earlier rational/exhaustive host tests still validate that oracle.

`bs_job_step` does one bounded transition, with each marker loop capped at
64 iterations. It performs no PCM callback or IO; `NEED_FRAME` can remain
pending until the caller supplies the matching read serial and frame. The
caller must serialize access and retire in-flight reads before reusing a job.
The job does not validate live sample/content generations or make a blocking
decoder safe. Native cache/streaming, scheduling, sample identity and editor
transactions remain unimplemented. No audible or hardware claim follows.

## Bounded PCM staging layer (0.1.2)

`python3 -B sdk/drafts/beat-slicer/test_pcm_reader.py` passes with host
AddressSanitizer and UBSan. `evidence/pcm-host.json` binds the source and flags.
The same C selftest compiles and runs in the pinned CPU emulator through
`pcm_native.py`; `evidence/pcm-native.json` records the source/object/runner
hashes, successful freestanding link, shared codegen guard and preserved
register/stack checks. No stock image is supplied to either test.

- 4,160 decoder vectors: signed extrema and seeded inputs across 16/24-bit,
  mono/stereo and both byte orders, including unaligned data and truncated
  input that must leave output untouched.
- 40 complete preview comparisons against the synchronous planner, with
  page lengths 1, 9, 17, 25 and 33 frames across all eight formats. The
  provider overwrites its scratch buffer immediately after each reply.
- Cancellation and revision invalidation at every transition of a search,
  including cache hits, pending reads and completed results. Old operation,
  revision, serial, position and extent replies leave the reader unchanged.
  Matching failed, null, empty, partial-frame and oversized replies fail
  without exposing a plan. Reusing storage with a new operation rejects an
  old reply even when serial/frame/revision match.
- Source/format refusal, sample-end bounds and near-uint32-limit coordinates.
- 256 host-only exact-buffer cases: every block length 1–32 in all eight
  formats, unaligned with the final byte at an ASan allocation boundary.
  Both the standalone decoder and staged reply path execute; provider
  storage is freed before the next cache step.

The reader object contains 1,364 bytes of code and no static data/BSS.
Compiler stack reports are 52 bytes for decode, 32 for begin, 40 for step,
60 for supply, 4 for cancel and 8 for result. These are per-function reports,
not whole-call-chain/device measurements. The cache holds 32 stereo int32
frames (256 bytes) inside caller-owned state; no heap allocation or IO occurs
in the reader. A reply decodes at most 192 input bytes. These work bounds do
not establish a UI timing budget.

Reproduce with the pinned image and machine-wide lock described above, the
source mounted read-only, the existing source-matched `beat_slicer_job_probe`
runner, and a fresh private output directory:

```sh
python3 -B /source/sdk/drafts/beat-slicer/pcm_native.py \
  --output /pcm-output/native --executable /output/build/beat_slicer_job_probe
```

This portable staging layer does not call a stock pool lookup or filesystem
service. Native format discovery, coherent Flex ownership, Static streaming,
recorder refusal, real revision tracking, scheduler integration, editor
Apply/Undo, USB packages and hardware/audio qualification remain pending.
Caller-supplied revision numbers cannot prove the sample did not change.

Repository validation on upstream `a3995bca`: the 18 planner host tests and
500 resumable-preview comparisons pass. `npm run check -- --base origin/main`
stops at the upstream `play-start` publication requirements (missing UI and
qualification evidence); `modules:generate` also refuses that module.
`module:doctor -- beat-slicer` refuses this unlisted draft as expected. None
of these publication gates has been relaxed or recorded as passing.

## Stock content-coherence probes (0.1.3)

`stock_probe/coherence_probe.cpp` passes five groups on the pinned CPU emulator
and hash-bound original MAIN. No callees are mocked. The emulator EMAC and
peripheral gates pass before the probes. `evidence/stock-coherence.json`
records the source and executable hashes; earlier reports keep the wrapper
and CMake hashes of their own runs.

- Twelve stereo polarity edits across two packed widths, three channel modes
  and a page boundary, including repeated edits. PCM matches exact expected
  values; the complete control record does not change and dirty stays set.
- Eight rotations across four mono/stereo 16/24-bit formats. PCM matches the
  expected cyclic permutation; control records are unchanged and dirty stays set.
- Eight unsupported/busy/range refusals leave audio and metadata unchanged.
- Three release/counter-wrap cases verify released-page clearing, temporary
  allocation-map publication and surviving-slot audio/control isolation.
- Eight stock-page-to-host-reader previews match the independent planner,
  preserving source bytes. After a real stock rotation, explicit test revision
  invalidation refuses the completed preview. Native writer tracking is absent.

Each stock call checks stack, callee-saved registers and restored interrupt
mask. The fixture has no concurrent tasks or interrupts. All sample geometry
and PCM are synthetic. The C planner/reader in this mixed probe executes on the
host; the stock walker and mutation routines execute as ColdFire instructions.
The separate 0.1.2 target tests remain the portable reader's ColdFire evidence.
No live sample access, Static streaming, timing, audio or hardware is qualified.

The combined runner embeds a binding of its C++ source plus all linked planner,
job and reader C/header files. The wrapper rejects a runner bound only to its
C++ source and produces no report for that mismatch (negative check passed).
This prevents a changed decoder from being paired with an older executable.

Reproduce with the pinned mounts and machine lock above, reconfiguring CMake
first, then:

```sh
cmake --build /output/build --target beat_slicer_coherence_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind coherence \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_coherence_probe \
  --output /evidence/stock-coherence.json
```

Only the final five-group run is retained as repository evidence. The initial
four-group run is private. No portable planner/reader firmware source changed
in 0.1.3; this version adds integration probes and tightens the documented
native-provider requirements.

## Expanded writer-lifetime probes (0.1.4)

The source-matched coherence runner passes **12 groups** in
`evidence/stock-writers.json`, retaining the earlier five-group report as
historical evidence. Same pinned MAIN, Octabam/mc68k sources and immutable
toolchain image as above; EMAC and peripheral gates pass. No callees are
mocked. The original planner/job/reader C files are unchanged.

- Sixty-eight successful edit calls across rotation, polarity, stereo channel
  processing, reverse, fade, zero/half gain, normalization and cross-slot
  copy/mix compare PCM against independent expectations. New fixtures cross
  pool pages; the existing rotations retain their small repeated fixture.
- Store observers see one destination dirty store before PCM on each call,
  including already-dirty samples. There are no slot-control stores, so the
  tested busy fields and counters remain unchanged even transiently.
- These calls start at SR `0x2000`, restore that mask and preserve stack and
  callee-saved registers. Every observed PCM store is masked; instruction
  observations see an unmasked interval after some but before all PCM stores.
  No interrupt is injected and no scheduler executes: this proves the narrow
  instruction behavior, not actual task interleaving or live race freedom.
- Sixteen copy/mix fixtures cross source pages and affect only the intended
  destination frames/dirty byte. Source PCM and both slot records stay exact.
  These use matching source/destination formats; conversion between different
  formats, clipping/overflow and every stock mode are not qualified.
- Four silent normalization fixtures return `-1` after setting dirty, with
  no PCM/control writes. Thirty-five additional pool/slot/busy/range refusals
  across five edit families perform no dirty/PCM/control writes. The earlier
  eight polarity refusals, three releases and eight previews still pass.

The reverse fixtures exercise a particular inclusive-endpoint behavior with
even endpoint differences. They do not establish all odd-length or UI range
conventions. Gain/fade/normalize fixtures avoid clipping and use predictable
values; this is coherence investigation, not general audio-effect qualification.

Reproduce with the existing pinned mounts and machine-wide lock, rebuilding
`beat_slicer_coherence_probe`, running the EMAC/peripheral gates, then:

```sh
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind coherence \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_coherence_probe \
  --output /evidence/stock-writers.json
```

Only the final twelve-group, source-matched report is retained. An intermediate
binary was refused by the wrapper after its source changed; it produced no
accepted report. Keep probe sources fixed from configure through execution.

The required lifetime exclusion and missing native writers are listed in
[WRITER_COVERAGE.md](WRITER_COVERAGE.md). No hooks, source revision service,
live reader, editor transaction or installable package was added. Hardware,
actual audio, live timing and persistence remain untested.

On upstream `d8059069`, Node 24.22.1 / `npm ci`, `modules:generate` and
`npm run check -- --base origin/main` pass (2,513 app tests plus SDK gates).
The 18 planner tests, 500 resumable-job comparisons and the PCM sanitizer
suite also pass. The earlier `play-start` catalogue blocker was fixed upstream;
the historical failure recorded above remains the result for that older tree.
`module:doctor -- beat-slicer` still refuses the unlisted draft as expected.
That refusal is not a passing release gate; publication remains blocked.

## Original cloud results (0.1.0)

## Commands and results

`python3 -B sdk/drafts/beat-slicer/test_planner.py`: **14 tests passed**.
Compiles host C99 with warnings-as-errors, pedantic checks and optimization
in a disposable temporary directory. Synthetic PCM only.

Coverage: both BPM sources, all five spacings, 250 Fraction-oracle grid cases
across sample rates and fractional tempos, trim origin/end, marker retention,
capacity/overflow, stereo quiet search, repeat previews, one-channel silence,
full-scale PCM, invalid input and atomic read/validation/capacity failures.

The 2,503 app tests passed before this draft; they do not qualify this module.
The focused suite checks the new core. The app does not import this draft.

## Hardware and audio

User selected MKII over USB. Read-only MCP status was established locally;
the cloud run had no instrument. No module was installed or sent.
Audible playback, clicks/pops, reverse,
retriggers, locks, timestretch and measured artifacts: **not tested**.
Playback fades are not implemented. Marker scores are not auditory evidence.

## Stock flows and persistence

**Not tested:** menu integration, Undo, sample settings save/load, Part/project
save/load, module removal and physical reboot. The planner writes no files,
marker input or audio buffer; that is not native persistence qualification.
INTEGRATION.md contains the planned acceptance flow.

## Performance and resources

ColdFire cycles, device stack/memory, UI latency and Static streaming:
**unmeasured**. Compilation/link results are above. No heap in the core; at most 65 beat candidates
and 769 search positions per snapped boundary at 192 kHz. These are algorithmic
bounds, not native timing or memory measurements.

## Qualification and capture

`verify.py` deliberately fails. `module:doctor` must refuse this unlisted
draft. No LCD captures, card/browser/runtime builds, parity checks, USB trial,
self-test, Keep/Undo/removal or hardware compatibility evidence exists.
This draft is not ready for publication.

## Stock worker lifetime probes (0.1.5)

`evidence/stock-worker.json` records **seven passing groups** from
`stock_probe/worker_probe.cpp`. It binds the private 1.40C MAIN, runner,
wrapper, CMake inputs and executable hashes. The pinned emulator/toolchain
and Docker mounts are the same as the 0.1.4 writer run above. The new target
is `beat_slicer_worker_probe`; run the wrapper with `--kind worker`.

The original synthetic fixtures execute the stock zero-gain operation handler,
queue post/receive, complete engine-task prologue, seven edit dispatch paths,
and completion allocation/posting. Only message display is mocked. They check
exact producer-originated zero gain across four packed formats and page
boundaries, writer entry/return ordering, worker stack/frame/interrupt-mask
restoration, failure results, FIFO/wrap, null callbacks, exhausted completion
records and forced command-pointer reuse. See [coverage](WRITER_COVERAGE.md#executed-worker-lifetime)
for the observed constraints and omitted paths.

Build and run inside the pinned source-tools container, with sources frozen
from configure until execution:

```sh
cmake --build /output/build --target beat_slicer_worker_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind worker \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_worker_probe \
  --output /evidence/stock-worker.json
```

Both emulator gates pass. An initial fixture incorrectly expected `-1` for
busy/empty-range refusals; the stock routines return `-3`/`-2`, consistent with
the earlier isolated writer tests. After correcting that expectation, the
wrapper rejected the stale executable without creating evidence; rebuilding
produced the retained seven-group passing report. The earlier private failed
run is not presented as passing evidence. Historical reports remain bound to
their original source hashes; this run does not replace their provenance.

There is no live scheduler, UI completion consumer, DSP or physical unit in
these fixtures. No interrupt is injected, no cancellation or queue overflow
is qualified, and no runtime hook or live-reader service is implemented.
Hardware, audio, persistence and USB qualification remain absent.

The worker evidence's source inputs are committed at `139c3ea55002db4e639f5fcb2e4fb3d8234dbf4f`;
`tests.evidenceRevision` pins that commit. Node 24.22.1 repository validation
against upstream `4840eb336b3e64195eed1994f83ef3be79735f56` passes, including
2,519 app tests, SDK gates, lint, type checking and bundling. The fork's
`origin/main` remains at `610a934d`: the required check against that stale base
rejects inherited upstream CHANGELOG history. Validation against current
upstream is authoritative; historical changelog contents are left intact.

## Preview admission prototype (0.1.6)

`preview_guard.c` adds portable bookkeeping for the proposed shared-base
provider; see [PREVIEW_GUARD.md](PREVIEW_GUARD.md). It starts disabled and does
not install a hook, discover writers, pin PCM or provide a native lock.

- `evidence/guard-host.json`: Apple clang 17 ASan/UBSan selftest passes lifecycle,
  nested/overlapping writers, stale/duplicate/premature ends, owner revocation,
  eight-writer saturation and 32-bit ID/revision exhaustion. All 24 permutations
  of two writer starts/ends are combined with five invalidation positions:
  120 schedules. Three staged-reader cases invalidate before a pending reply,
  after a late reply, and after a completed preview; reused reader storage
  refuses the old operation's reply.
- `evidence/guard-native.json`: the same selftest compiles with pinned GCC
  16.2.0, passes the shared code-generation guard, links freestanding with no
  unresolved helpers and executes as ColdFire code with preserved registers.
  The guard object has 608 text bytes, no object data/BSS, and 48 bytes of
  caller-owned state. Compiler reports 0–4 bytes of static local stack per
  guard function; this excludes caller/return/call-chain costs and is not a
  hardware stack, cycle or latency measurement.
- `evidence/stock-guard.json`: nine source-bound stock-worker groups pass with
  a host-compiled guard observing writer entry/return and PCM writes. Added
  copy/crop/release dispatch tests include exact copy destination extent,
  nested crop/rotation lifetime, crop's counter mutation before an empty-range
  refusal, and release without a UI completion attempt. Both pinned emulator
  EMAC/peripheral gates also pass. The guard itself runs on the host in these
  stock traces; do not conflate them with the separate target selftest.

Host command:

```sh
python3 -B sdk/drafts/beat-slicer/test_preview_guard.py --output NEW_REPORT.json
```

Inside the same pinned source-tools container/mounts as the 0.1.5 worker run:

```sh
cmake --build /output/build --target beat_slicer_worker_probe beat_slicer_job_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/guard_native.py \
  --output /evidence/NEW_NATIVE_DIRECTORY --executable /output/build/beat_slicer_job_probe
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind worker \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_worker_probe \
  --output /evidence/NEW_STOCK_REPORT.json
```

Keep all inputs frozen through execution. The worker binary binding now covers
its C++ runner and both guard C/header inputs. A deliberately stale executable
was refused without creating a report. An initial target harness initializer
needed `memset`; explicit bounded initialization removed that dependency. A
strengthened copy fixture initially installed its write watcher before filling
test PCM; moving fixture preparation before observation corrected that test.
Only final source-matched passing reports are retained here. Historical reports
keep their original hashes and are not relabeled as current-source evidence.

No native provider is enabled. Full writer/metadata/caller coverage, live
scheduler/cancellation behavior, serialized map lookup and copying, real-unit
audio/timing/persistence, and card/browser/USB qualification remain pending.
`module:doctor` and `verify.py` still refuse publication of this unlisted draft.

The three 0.1.6 reports match source commit `f75263f3e8a7dcbf4e7f84f5e9918871b784e2ca`,
now pinned by `tests.evidenceRevision`. With Node 24.22.1 / `npm ci`, the
repository check against upstream `8965a69c` passes (2,519 app tests, SDK
checks, lint, type checking and bundle). The required comparison with the
fork's stale `origin/main` still rejects inherited upstream CHANGELOG history;
that historical file remains unchanged, and authoritative validation uses
current upstream main.

## Ordinary recorder and shared allocation (0.1.7)

`evidence/stock-recorder.json` binds the new runner, guard C/header, wrapper,
CMake inputs, executable and private MAIN. Three groups (20 complete calls)
pass, using original synthetic already-active recorder state and silent inputs:

- Eight preallocated and eight lazy-allocation page crossings: 16/24-bit stereo,
  tracks 1/8 and both state banks. Check exact PCM bytes and untouched pages,
  position publication, free-list mirrors, recorder map, page count and logical
  extent. Watchers verify no dirty-array/slot-counter stores; engine/UI queues
  remain empty. Position/map preparation precedes PCM packing.
- Four early-exit cases: inactive recorder, empty call, exhausted pool and
  disabled dynamic allocation. The two shortages stop after preparing the first
  segment, publish frame 1024, clear active position/state, return zero and write
  none of this call's PCM. Real queue helpers post an engine opcode-34 follow-up
  and a UI record. Their consumers are not run.
- The host guard invalidates the pre-call token, excludes new tokens at PCM,
  map and position stores, and retires the exact writer ticket on real return.
  Fresh admission does not revive old tokens or establish source eligibility.
  General callee-saved registers, return stack and supplied interrupt mask are
  checked. This is not native hook/lock integration.

Both pinned EMAC/peripheral gates pass. These runs use upstream Octabam commit
`8250be0c23ca0a0a953cb7e5721e3bdb98dadfe5`, mc68k commit
`4a6d0d17a1f2b30077ab726c27fe9bb770fa0456` and source-tools image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`.
Inside the previously documented private mounts, freeze source inputs through
configure, build and execution:

```sh
cmake -S /source/sdk/drafts/beat-slicer/stock_probe -B /output/build \
  -DCMAKE_BUILD_TYPE=Release -DOT_LTO=OFF -DOCTABAM_ROOT=/upstream \
  -DOT_VENDOR=/output/vendor
cmake --build /output/build --target beat_slicer_recorder_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind recorder \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_recorder_probe \
  --output /evidence/NEW_STOCK_RECORDER_REPORT.json
```

An intermediate expanded runner failed C++ compilation because a hexadecimal
literal ending in `e` was adjacent to `+`; separating the tokens fixed the
fixture. Only the final rebuilt, source-matched passing report is retained.
Older evidence retains its original hashes. The portable core is unchanged.

The caller interrupt mask is a fixture input, not a measurement of the real
audio ISR. No interrupt/scheduler interleaving, non-silent mixing, arming,
Pickup/overdub, reverse recording, stop finalization, queued follow-up execution
or physical recording is qualified. Shared-map mutation requires serialization
even if preview refuses recorder slots. Native reader/provider, Apply/Undo,
playback smoothing and exact card/browser/USB/device qualification remain open.

The recorder report matches source commit `95a33062f8d34631d963044311012da720511aa2`, pinned by
`tests.evidenceRevision`. The required check against stale fork `origin/main`
again rejects inherited upstream CHANGELOG history; current upstream validation
is required before push. `module:doctor -- beat-slicer` still refuses this
unlisted draft, and `verify.py` remains an intentional qualification refusal.

## Serialized session and replacement refusal (0.1.8)

`evidence/session-host.json` records Apple clang ASan/UBSan execution of the
portable session selftest. `evidence/session-native.json` records the same test
compiled by pinned GCC 16.2.0, accepted by the shared ColdFire code-generation
guard, linked without runtime helpers and executed with preserved registers.
The provider object has 2540 text bytes and no object data/BSS. Compiler local
stack reports range from 0 to 160 bytes, some dynamic but bounded; these exclude
the complete callback/call chain and do not establish hardware stack or timing.

The selftest covers 32 complete preview comparisons against the synchronous
planner across 16/24-bit mono/stereo, both byte orders, both boundary modes and
both tempo sources. Authored 13-frame pages force short replies. Twenty-two
metadata/guard changes refuse a finished result without changing output; full
record ends/loops and source/owner/editor generations participate. Unselected
tempo changes alone are ignored, while selected-tempo changes retire the plan.
Additional cases cover lock/source pending, pending validation after a copy,
cancel/restart, writer-active admission, revocation, copy-time mutation,
malformed replies and unsupported sources. All backend calls occur under the
synthetic lock, with balanced unlocks. No native backend is installed.

`evidence/stock-load.json` records 14 complete stock Flex loader refusal calls
using synthetic filesystem/header callbacks. Real release/allocation runs and
the host guard follows nested entry/return. Twelve failures clear old PCM and
move a surviving slot's map while preserving its audio/control record. Opened
handles close; an allocation refusal leaves a proposed nonzero length but no
owned pages. Invalid pool/slot cases do not mutate. Pinned EMAC/peripheral gates
pass. The stock CPU version/tool pins are the same as the 0.1.7 recorder run.

Host reproduction:

```sh
python3 -B sdk/drafts/beat-slicer/test_preview_session.py --output NEW_HOST.json
```

Inside the existing private source-tools mounts, with source frozen from
configure to execution:

```sh
cmake --build /output/build --target beat_slicer_load_probe beat_slicer_job_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind load \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_load_probe \
  --output /evidence/NEW_LOAD.json
python3 -B /source/sdk/drafts/beat-slicer/session_native.py \
  --output /evidence/NEW_NATIVE_DIRECTORY --executable /output/build/beat_slicer_job_probe
```

The first load fixture expected a lowercase extension at open; stock uppercases
that extension in its working path. A second fixture placed packed decoded-header
longs at aligned offsets, producing invalid synthetic lengths; moving them to
the observed packed offsets fixed the fixture. Failed attempts remain private;
only final source-matched passing evidence is retained. These are fixture fixes,
not firmware fixes or claims of a stock parser defect.

Actual filesystem decoding/loading, native locking/callbacks, full writer
coverage, Static prefetch, scheduling, Apply/Undo, playback smoothing and exact
browser/card/USB/hardware qualification remain open. These tests grant no live
admission or publication capability.

The 0.1.8 reports match source commit `9e10767a26b931bbdeaefa573e7b532860a58047`, pinned by
the historical 0.1.8 metadata. Earlier reports remain bound to their historical
source. The stale fork-origin changelog comparison remains a known failure;
current-upstream readiness validation is required before push.

## Complete marker candidates (0.1.9)

`evidence/marker-host.json` records the pure preflight selftest with host ASan/
UBSan. `evidence/marker-native.json` records the same selftest compiled with
pinned GCC 16.2.0, accepted by the shared code-generation guard, linked without
runtime helpers and executed with preserved registers. The marker object has
1218 text bytes and no object data/BSS; reported local stack is 0–48 bytes,
excluding complete caller/return costs and any native publication path.

- All 2,144 combinations of 1–64 proposed slices and 0–N retained prefix records
  preserve existing starts, ends, loops and ordinals; new endpoints/disabled
  loops and untouched inactive rows are checked independently.
- 386 before/after mismatch checks cover each field of every active/inactive
  record plus the count. In-memory restoration recovers the entire original
  table, including overwritten inactive rows.
- Missing/renumbered records, capacity, duplicate/out-of-range starts, invalid
  ends/loops, overlap, short regions and unsupported extents refuse before any
  output write. Short samples, signed-range edges and null arguments are covered.

`evidence/stock-markers.json` adds 24 source-bound mixed host/stock fixtures:
Flex/Static, slots 0/127, 4/64 candidate slices, and empty/half/full retained
prefixes. The host preflight prepares each table, then real stock sort and
sanitation execute against synthetic memory. All active/inactive records, count
and trim/loop remain exact; another slot stays untouched. Tempo/name/track-update
callees are explicitly mocked. Model restoration writes synthetic memory, not
stock Undo. Both pinned EMAC/peripheral gates pass.

```sh
python3 -B sdk/drafts/beat-slicer/test_marker_edit.py --output NEW_HOST.json
```

Inside the existing private source-tools mounts, configure CMake as above and
freeze source inputs through execution:

```sh
cmake --build /output/build --target beat_slicer_marker_probe beat_slicer_job_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind markers \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_marker_probe \
  --output /evidence/NEW_STOCK_MARKERS.json
python3 -B /source/sdk/drafts/beat-slicer/marker_native.py \
  --output /evidence/NEW_NATIVE_DIRECTORY --executable /output/build/beat_slicer_job_probe
```

The conservative preflight policy remains subject to owner review. These results
do not prove every stock endpoint case, pattern reference playback, editor/voice
refresh, atomic Apply, stock Undo/history, saved/working-copy publication, audio
smoothing, USB installation or physical persistence. No live settings are changed.

The 0.1.9 reports match source commit `5f950ab935fcab042175cbb45aad1ec7108d8621`, pinned by
the historical 0.1.9 metadata. Earlier session/load reports keep their original
source identities. The stale fork-origin comparison still rejects inherited
CHANGELOG history; current-upstream readiness is required before push.

## Stock pool-backed preview sessions (0.1.10)

`evidence/stock-pool-session.json` records five passing groups with the host
session/guard/reader calling real emulated stock Flex page lookup, gain and
release. No stock callees are mocked. Ownership, source identity, sample rate
and tempos are authored callbacks; this is not a native provider or lock.

- Eight complete 16/24-bit mono/stereo, exact/smooth previews cross fragmented
  pages and match synchronous reference plans. PCM, controls and complete
  synthetic metadata remain unchanged.
- Four actual stock zero-gain edits change PCM without changing the control
  record. Guard invalidation retires the partial preview before another read.
- Three completed results refuse changed marker ends, trim loop or synthetic
  sample generation without writing the caller's output.
- Actual release retires the old preview and empty-slot admission refuses.
- Pending copy yields, then a copy-time metadata change discards the block.

Both pinned EMAC/peripheral gates pass. The initial polarity fixture did not
mutate mono PCM; the final fixture uses the previously covered gain operation.
This was a fixture correction, not a stock firmware fix.

Inside the existing private mounts, configure CMake as above, freeze inputs,
then run:

```sh
cmake --build /output/build --target beat_slicer_pool_session_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind pool-session \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_pool_session_probe \
  --output /evidence/NEW_POOL_SESSION.json
```

The portable session's compiled-target evidence remains the historical 0.1.8
report. This mixed host/stock probe does not prove native callbacks, scheduling,
Static streaming, complete writer coverage, Apply/Undo, USB or physical audio
and persistence. Source hashes bind the retained report to the exact inputs.

The 0.1.10 report matches source commit `b745c6749e6e2b5b876f1d25d8ead6f2d2818660`, pinned by
the historical 0.1.10 metadata; prior reports retain their historical identities.

## Stock editor publication (0.1.11)

`evidence/stock-publication.json` binds four passing groups to private 1.40C
MAIN and original synthetic settings. Stock grid opening/generation, arithmetic,
record writes, pointer refresh, selection and redraw notification execute;
formatting/display/progress completion and zero-search requests are explicit
mocks. No scheduler, audio, physical file or device is used.

- 24 immediate grids cover Flex/Static, slots 0/127, counts 2/8/64 and 0/3
  previous records. Opening the dialog changes no settings. Completion replaces
  the active grid, disables its loops, preserves trim/attributes/inactive rows
  and the other arena, rebuilds all 64 editor record pointers, selects the cursor's
  slice and requests redraw once.
- Four deferred grids clear the live count to zero before the first mocked
  zero search returns. Old record bytes remain until eight authored search
  continuations complete for four slices. Final records and refresh agree with
  the immediate path. Actual zero-search behavior/cancellation is untested.
- Four busy-source fixtures refuse the grid dialog without marker changes.
- The redraw helper changes its notification field without changing markers;
  it is not an Undo/history operation.

Instruction/write observation sees count clearing before record writes, then
final count publication. Record stores run at the supplied unmasked interrupt
level (`0x2000`); no interrupts are injected. This does not prove a real race,
stock UI defect or a safe native locking boundary. The stock grid intentionally
replaces records and cannot satisfy Beat Slicer's preserve-or-refuse policy.
Keep exclusion from the first mutation through all deferred continuations and
refresh. A ready preview must prepare privately before any native publication.

Configure/build the private source-tools mounts as above, freeze inputs, then:

```sh
cmake --build /output/build --target beat_slicer_publication_probe --parallel 4
ctest --test-dir /output/build/emulator -R '^(emac|periph)$' --output-on-failure
python3 -B /source/sdk/drafts/beat-slicer/stock_probe.py --kind publication \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_publication_probe \
  --output /evidence/NEW_PUBLICATION.json
```

The tested callbacks restore the stack, callee-saved registers and interrupt
mask. This remains narrow ABI evidence. Stock Undo, voice-state refresh,
working/saved-copy publication, project save/reload and reboot remain unproved.

The 0.1.11 report matches source commit `c8780c374760765df6996f2c52a16c40344b6726`, pinned by
the historical 0.1.11 metadata. Prior reports keep their historical source identities.

## Preview-bound edit candidates (0.1.12)

`evidence/candidate-host.json` records the candidate selftest under ASan/UBSan.
`evidence/candidate-native.json` executes the same C tests compiled for ColdFire,
with code-generation checks, no unresolved runtime helpers and preserved target
registers. The candidate object has 1316 text bytes and no object data/BSS;
local compiler stack reports range 0–48 bytes, excluding callers and callbacks.
Caller-owned candidate/session storage is separate from these object numbers.

- 40 accepted candidates cover Flex/Static shape, both tempo choices, exact/
  smooth boundaries and 0–4 retained prefix records. Complete before/after
  records, inactive tails, unchanged live tables and distinct IDs are checked.
- 193 stale cases change each field of every active/inactive row or the count.
  21 source/metadata changes independently retire a candidate, with selected
  versus unselected tempo behavior exercised separately.
- Wrong/old IDs, candidate and preview cancellation/restart, writer/revocation,
  unavailable locks/captures, second-capture waiting, changes during preparation,
  callback failures, ID exhaustion and ordinal conflict refuse or retry as
  documented. Failed result requests leave output unchanged.

`candidate-session-host.json` and `candidate-session-native.json` rerun the
existing 32 complete previews and 22 snapshot invalidations plus lifecycle/error
coverage after introducing the shared locked-result helper. Both pass; pinned
EMAC/peripheral gates pass too. No native backend, publication or device runs.

```sh
python3 -B sdk/drafts/beat-slicer/test_edit_candidate.py --output NEW_CANDIDATE_HOST.json
python3 -B sdk/drafts/beat-slicer/test_preview_session.py --output NEW_SESSION_HOST.json
```

Inside the private source-tools mounts, build `beat_slicer_job_probe` as above,
freeze inputs and run `candidate_native.py` and `session_native.py`, each with a
new `--output` directory and `--executable /output/build/beat_slicer_job_probe`.
Synthetic ownership and metadata remain the backend contract, not proof of live
writer coverage, native atomic Apply/Undo, timing, audio or physical persistence.

The 0.1.12 candidate and session-regression reports match source commit
`29c1a305a54ec83c4d3876304d8b304287d698a8`, pinned by the historical 0.1.12 metadata.

## Native Flex copy component (0.1.13)

`evidence/flex-copy-host.json` runs the C component with ASan/UBSan and a synthetic
lookup. `evidence/flex-copy-native.json` compiles that same component plus the
original assembly ABI shim and test harness, then executes it against actual
private 1.40C page lookup instructions. Unlike the earlier pool-session probe,
the copy component itself now runs as ColdFire code; there is still no live
native provider, lock, writer instrumentation or device.

- 96 copied blocks span four packed formats, slots 0/127, six boundary positions
  and single/block requests. Independent authored byte values and output
  sentinels verify exact copying and page/end shortening.
- 34 precondition failures refuse before lookup, covering source/format/extent,
  descriptors, busy/readiness, map ownership/ranges/alignment and physical pages.
- Four altered returned spans and a short output capacity refuse without output
  or byte-count mutation. Four map relocations use freshly fetched pointers.

Both host and target pass. The shared code-generation guard, freestanding link,
callee-save/register/stack checks and pinned EMAC/peripheral gates pass. Target
objects contain 1010 C text bytes plus 40 assembly bytes, with no object data/BSS.
The compiler reports 116 local stack bytes for copying; wrapper/callee/whole-chain
cost and hardware timing are not included. The assembly source uses an entry
supplied by a verified binding and embeds no stock instruction bytes.

```sh
python3 -B sdk/drafts/beat-slicer/test_flex_copy.py --output NEW_FLEX_HOST.json
```

Inside the existing private mounts, configure CMake, build
`beat_slicer_flex_native_probe`, freeze inputs and run:

```sh
python3 -B /source/sdk/drafts/beat-slicer/flex_native.py \
  --main /stock/stock-main.bin --executable /output/build/beat_slicer_flex_native_probe \
  --output /evidence/NEW_FLEX_NATIVE_DIRECTORY
```

Descriptors, ownership and ready state are synthetic. These results do not
qualify real lock/cache behavior, complete writer coverage, Static streaming,
metadata getters, editor transactions, USB or physical audio/persistence.

The 0.1.13 reports match source commit `0501a11413d40a0e898bd67936eafa9008dab477`, pinned by
the historical 0.1.13 metadata. Prior evidence retains its historical bindings.

## Complete compiled Flex preview chain (0.1.14)

`evidence/flex-chain-host.json` runs the full chain under ASan/UBSan with a host
query/PCM-edit substitute. `evidence/flex-chain-native.json` compiles all original
planner, decoder, guard, session, marker, candidate and copy code for ColdFire
and runs it against the actual private stock lookup and gain routines. The same
raw-copy regression suite is included. Shared fixture helpers now live in
`test_flex_fixture.h`; production behavior is unchanged from 0.1.13.

32 complete chains cover four packed formats, slots 0/127, exact/smooth modes
and unsliced/one-retained-record settings. All starts/fade flags match a
synchronous reference using independently generated logical sample values.
Complete candidate records preserve existing metadata, and whole synthetic
pool/settings hashes stay unchanged. Ownership waiting retries successfully.

Four stale cases cover sample generation, an inactive marker row, real stock
gain after a ready candidate and real stock gain during a partial preview.
The last case retires the session before another reader copy. The host uses an
explicit byte-change substitute for those gain calls; target execution runs the
actual stock operation under the test guard. Failed results keep output intact.

The complete preview chain now runs as target instructions, unlike 0.1.10's
host session with emulated stock callbacks. Ownership is still a sequential
fixture flag. Source IDs/generations, sample rate and tempo are authored;
controls, trim and full records are read from synthetic firmware memory. No
live native provider, real ISR/task lock, cache proof, complete writer tracking,
Static streaming, editor Apply/Undo, USB or hardware qualification follows.

```sh
python3 -B sdk/drafts/beat-slicer/test_flex_chain.py --output NEW_CHAIN_HOST.json
```

With the existing private mounts and source-bound `beat_slicer_flex_native_probe`,
freeze source and execute `flex_chain_native.py --main /stock/stock-main.bin
--executable /output/build/beat_slicer_flex_native_probe --output
/evidence/NEW_CHAIN_NATIVE_DIRECTORY`. Target code-generation, freestanding link,
stack and callee-save checks pass. The generic runner's PASS line reports the
return status of the complete `bs_flex_chain_selftest` entry, including all cases
above. No elapsed emulator time is reported as instrument timing.

The 0.1.14 chain reports match source commit `751837214650d8ec6fc3ea648dbd7feccd516bc6`, pinned by
`tests.evidenceRevision`. Earlier reports keep their historical identities.


## Compiled editor-menu composition (0.1.15)

`editor_menu.c` adds a base-owned composition/lifetime prototype, not an
installed menu event. `EDITOR_MENU.md` specifies the required native ownership,
input admission, stable storage and detach contract.

- `test_editor_menu.py` passes ASan/UBSan: 20 composed selections across the
  six/nine stock-row variants and one to four contributions, copied labels,
  deterministic ordering, stock callback preservation, stale owner/token
  refusal, callback failure, retirement/reentry, exhaustion and invalid input.
- `menu_native.py` compiles the same portable suite plus `test_menu_stock.c`.
  Eight additional cases execute actual stock variant selection (`0x40072c10`),
  menu open (`0x4006d94c`), selection (`0x4006d8f4`) and indirect dispatch.
  Both variants exercise a valid contribution, replaced owner, retired menu
  and original stock row. Stock labels/callbacks are read privately at runtime,
  never embedded in repository source or reports.
- Formatting, UI/drawing/setup and original stock action bodies are explicit
  mocks. The native fixture uses synthetic owner generations and manually
  detaches pointers only after synchronous execution stops between cases.
  It does not prove actual scheduler quiescence or loader removal.
- The observed close path retains all three pointer globals. Recomposition
  remains refused until explicit detach acknowledgement. The original
  zero-argument selection test corrupted the caller's saved D2 because stock
  rewrites its first argument slot. Reserving that word fixes the fixture;
  callee-saved registers and return stack now pass, including individual calls.
- GCC 16.2.0 code-generation and freestanding-link checks pass with no runtime
  helper dependencies. The menu object is 1,404 text bytes with zero object
  data/BSS; caller-owned state is additional. Compiler local stack usage is
  4–76 bytes, excluding nested calls and any native loader/backend work.
  These are object/local-stack figures, not live memory or timing budgets.
- Both pinned EMAC and peripheral gates pass. No rendered menu, native stable
  lock/admission/detach, background cancellation, Apply/Undo, USB or device
  result is claimed. The four-contribution capacity is a prototype limit;
  actual full-menu layout/scrolling still needs qualification.

Run the host gate with:

```sh
python3 -B sdk/drafts/beat-slicer/test_editor_menu.py --output /private/path/menu-host.json
```

Build `beat_slicer_menu_native_probe` using the existing isolated toolchain
recipe, then run `menu_native.py --main <private-original-MAIN>
--executable <runner> --output <new-private-directory>`. Reports bind original
source, private MAIN, runner, compiler flags and object hashes. Binaries and
stock-derived logs stay private. Retained reports are `evidence/menu-host.json`
and `evidence/menu-native.json`; both bind source commit `de9a5f1f6d2137a01c7db91d5f344dc9517879e3`,
pinned by the initial 0.1.15 metadata. The later full-stock observation has its
own source pin below; earlier reports retain their historical bindings.


## Full stock project/file load and host preview (0.1.15 research)

`boot_observe.py` passes with original stock 1.40C, the pinned headless emulator,
both DSP cores and normal frame scheduling. A disposable project was created
through stock, assigned the original one-second stereo 16-bit 44.1 kHz WAV,
changed to 120.25 BPM sample tempo versus 120 BPM project tempo, and given four
zero-aligned stock slices. The corrected stock path is AED → AMP → YES; LFO
opens EDIT. No Beat Grid entry is installed or shown in these private screens.

The initial UI investigation observed the real grid continuations four times
each and its common completion entry five times. Saving was checked through
visible completion plus 16 saved bank and eight saved arrangement copies;
flushing an earlier partial save had not completed that firmware operation.
The complete marker-table/count hash survived a fresh stock LOAD PROJECT.

The automated observer independently starts another emulator from the exact
saved card and requires LOAD PROJECT completion. Its paused read snapshot:

- Matches all 176,400 PCM bytes to the original WAV after endian conversion;
  the native slot contains 44,100 frames in 29 pages with the expected geometry.
- Matches all 64 marker records and count to their pre-save hash and reads sample
  tempo 2,886 and project tempo 2,880 in 1/24 BPM units.
- Runs host-compiled planner and marker preparation for both tempo sources and
  exact/smooth search. All four retain existing starts. Two candidates refuse
  ordinal conflicts, one refuses overlap, and the project/smooth candidate
  preserves the existing four-record layout without adding records. Refusals
  leave output unchanged; all cases retain fade warnings, so none proves safe
  native Apply or click-free audio.
- Rechecks complete settings/PCM and verifies both the source and copied card
  remain byte-identical. No injected calls, panel edits or write-back occur in
  this automated observation.

The stock-produced card/project, source WAV, captured memory and raw logs stay
private. `evidence/boot-observation.json` retains only source/input hashes,
conditions and outcomes. See [BOOT_OBSERVATION.md](BOOT_OBSERVATION.md) for
reproduction and fixture preparation. The observer uses a verified 44.1 kHz
WAV, not a new native sample-rate getter. It does not qualify other encodings,
replacement paths, Static streaming, concurrent ownership, actual module UI,
Apply/Undo, USB, physical save/reboot behavior or audible playback.

The full-stock observer report binds source commit `ba7c7c99e6b1f815db65e40b6cdb30c9843f4eba`,
pinned by that report. Its native prototype inputs are unchanged from
the earlier source-bound target reports.

## Apply/Undo coordinator (0.1.16)

**Workflow clarification:** the following results cover the historical portable
Undo prototype. The player workflow now explicitly uses stock slice deletion
after grid creation, with no module Undo/history UI. These reports are retained
unchanged; they do not establish stock slice clearing or native UI parity.
The pending comparison matrix is in INTEGRATION.md. Failure rollback remains
required independently of a user-facing Undo feature.

`edit_transaction.c` passes host ASan/UBSan and compiled ColdFire execution with
a synthetic publication backend. The same tests exercise 40 confirmation/no-op
cases, 388 injected publication/refresh rollbacks, 386 full-table stale cases,
23 independent Undo identity/metadata invalidations, selected-tempo behavior,
callback-boundary invalidation, history replay/reuse, pending/refused policy,
exhaustion, reentry and 14 fault/quarantine cases. All complete inactive rows
are preserved. A failed Undo that rolls back requires a newly issued confirmation.

The compiled coordinator has 2682 text bytes, no object data/BSS and local stack
frames of 0–52 bytes, excluding callees and caller-owned journal storage. It
passes the code-generation guard, freestanding link and runner stack/register
checks. These are executed instructions, not measured hardware timing.

The candidate regression also passes on host and target after introducing its
locked-result composition helper. Publication/rollback, exclusive ownership,
playback policy and quarantine remain authored model callbacks. No native atomic
Apply/Undo, live source service, audio, persistence or hardware is qualified.

Reproduce host checks with `test_edit_transaction.py` and `test_edit_candidate.py`.
For ColdFire, use `transaction_native.py` and `candidate_native.py` with the pinned
`beat_slicer_job_probe` and toolchain/machine lock documented above. Binaries and
raw logs stay private. `evidence/transaction-host.json`, `transaction-native.json`,
`transaction-candidate-host.json` and `transaction-candidate-native.json` bind
source commit `c5979beacdfd40b0092aa43f2183df133734b58b`; their historical bindings remain unchanged.

## Stock-backed transaction chain and refresh (0.1.17)

The revised playback-policy interface receives the complete desired table for
both Apply and Undo. Undo can therefore inspect old end/loop points instead
of accidentally assessing only the current post-Apply snapshot. The generic
transaction suite still passes host ASan/UBSan and compiled ColdFire execution.

`test_transaction_stock.c` joins the compiled Flex copy, decoder, resumable
planner, preview, candidate and transaction coordinator to an original fixture
publisher. It writes synthetic settings, then runs the real 1.40C pointer,
selection and redraw routines. The target run passes 32 Apply/Undo pairs across
four packed pool formats, slots 0/127, exact/smooth and empty/retained layouts,
plus eight publication/rollback cases. All 128 stock refresh sequences execute
without a NULL read; complete settings and PCM hashes restore exactly. Existing
copy/preview/staleness regressions run first. Host sanitizers pass the same
chain with synthetic lookup and without stock refresh.

A separate isolated refresh matrix reproduces 16 stale-row NULL dereferences
when an authored table reduction leaves the old selection active. Retiring
selection before rebuilding row bindings avoids them in all 16 corresponding
cases. Another 32 empty/populated, Flex/Static and cursor-inside/outside cases
preserve complete settings and select only a containing row. The viewport
callee is mocked in this hazard probe. This is an integration-order trap, not
a demonstrated stock UI defect, installed Undo or hardware result.

The corrected coordinator has 2,690 text bytes and no object data/BSS. ColdFire
`sizeof` measurements reserve 4,056 bytes per transaction journal, 3,096 for a
preview session, 2,892 for a candidate and 48 for its guard: 10,092 total before
the native backend, menu storage, code, stack, allocator and PCM pool. These
caller-owned structures require actual contiguous RAM planning; object BSS=0
does not mean the service uses no RAM. Local stack figures exclude callees.

The fixture's lock, publication stores, rollback and playback permission are
synthetic. No native reader/writer exclusion, auxiliary-state rollback, voice
containment, click-free playback, USB installation or persistence is qualified.
Reproduce using `test_edit_transaction.py`, `test_transaction_stock.py`,
`transaction_native.py`, `transaction_stock_native.py` and `stock_probe.py
--kind refresh`, with the pinned toolchain/emulator and serialized machine lock.

## Full stock format matrix (0.1.17 research)

`boot_formats.py` passes eight normal stock project/file loads: mono/stereo,
16/24-bit originals and 44.1/48 kHz WAV headers. Every 44,100-frame PCM payload
matches independent signed width conversion. With this project's current Flex
setting, all loaded pools are 16-bit (formats 2/3); 24-bit low bytes truncate
arithmetically. Mono uses 15 pages, stereo 29. All other 52 project files and
all source/repacked card images remain unchanged.

Within each rate pair, the complete controls, settings and PCM are identical.
Those fields cannot identify the original file rate in these cases. Actual
playback clock/resampling, native metadata discovery, Static streaming and
live ownership remain open. See [BOOT_OBSERVATION.md](BOOT_OBSERVATION.md)
for exact reproduction and private-artifact handling.

The separate `boot_formats24.py` variant changes only the private project's
`LOAD_24BIT_FLEX` text setting in working/saved copies. Four further normal
stock loads retain 16-bit mono/stereo and 24-bit mono/stereo exactly, including
nonzero 24-bit low bytes. Formats 2/3/0/1 use 15/29/22/44 pages respectively.
All other project bytes and source/variant card hashes remain unchanged.
This authored settings variant does not claim a native settings-dialog/save
test, Static access, playback or hardware qualification.

## Auditing retained evidence

`python3 -B sdk/drafts/beat-slicer/audit_evidence.py` verifies each report's
recorded source hashes against the explicit Git commit in `evidence-sources.json`.
The index includes historical revisions; comparing every old report only with
today's source would erase their meaning. Wrong source pins, missing inventory
entries and altered diagnostic receipts are refused in negative checks.

`native-import.json` is explicitly excluded: that early object-only diagnostic
had unresolved runtime helpers and its intermediate `native_probe.py` wrapper
is absent from Git. Its receipt is retained and hash-bound as a diagnostic,
not a verified build or source binding. Later freestanding/executed planner
reports have their own exact committed source. This audit checks provenance;
it does not rerun binaries or establish native integration or hardware results.

## Full stock reverse writer lifecycle (0.1.17 research)

`boot_writer.py` reproduces two normal EDIT → SELECT ALL → REVERSE SELECTION
actions after verifying the actual Flex editor kind/slot and selected native
menu callback. The worker enters reverse, returns success, posts its completion,
and the real UI consumes it; the subsequent waveform job also completes. The
UI busy flag changes 1→0 on the UI task, while the dirty store occurs on the
distinct engine task. A separate pre-edit waveform completion is classified
explicitly rather than attributed to the reverse.

Complete slot controls stay identical despite changed PCM. Prepared sample
settings, including all marker records, also stay identical. Thus the full
scheduled path reinforces the earlier isolated result: slot busy/counter
fields alone cannot provide PCM generation or whole-writer exclusion.

The initial ordinary-reversal oracle refused the result. SELECT ALL passed
end argument 44,100 for a 44,100-frame sample, and the observed stock reverse
included frame 44,100 from the last allocated page. The final test explicitly
checks that inclusive endpoint model against independently reversed frame
records, including the one extra allocated frame. A second reverse restores
every logical PCM frame and that extra frame exactly. This is not a passed
ordinary exclusive-end reversal test or a confirmed hardware defect. Research
inspection of the allocated end frame does not authorize a module reader to
exceed the logical sample extent. Both source/copied cards remain unchanged.

The two earlier trace attempts refused an unclassified pre-edit waveform job;
they are not passing evidence. The normal-reversal mismatch is retained in
the documented limitation above. No native Beat Slicer service, concurrent
reader lock, audible playback, save or hardware behavior is qualified.

## Full stock Static load and clear (0.1.17 research)

`boot_static.py` passes the normal quick-assign/browser load of the original
16-bit stereo 44.1 kHz WAV into Static slot 0. Real loader/post-load calls run
in order; the control record reports 44,100 frames, format 3, a present file
handle and data offset 44. The actual AED binding names Static slot 0, with
whole-source trim, no slices and 120 BPM.

FUNC+PLAY opens CLEAR SLOT. The complete control record remains unchanged
while that prompt waits. Confirming YES runs stock release, changes status to
unavailable, clears frame extent, retires the handle and advances the release
counter. Complete Flex PCM, controls and settings remain identical after both
Static load and clear. Source/copied card hashes remain unchanged.

This proves one normal load/editor/clear lifecycle in the pinned emulator.
It does not read Static PCM through a new adapter, establish a safe file lease,
cover concurrent playback/card writes, measure streaming latency, or qualify
hardware/persistence. The earlier attempt refused an incorrect input identity
before boot; only the completed reproduction is retained as passing evidence.

The nine 0.1.17 receipts (`transaction17-host/native`,
`transaction-stock-host/native`, `stock-refresh`, `boot-formats`,
`boot-formats24`, `boot-writer`, `boot-static`, all JSON under `evidence/`)
bind source commit `af35f3084e01448c26e0cc6a7a287f33756a4eb8`. The manifest pins that source
revision; the evidence index preserves every earlier binding separately.

## Stock-style commit and clearing (0.1.18)

`bs_transaction_commit` retains no user Undo history. Host ASan/UBSan and
compiled ColdFire pass 120 create/clear cycles, including no-op previews,
refusal of a preview invalidated by a modeled clear, repeated creation without
forgetting history, 194 internal rollback points, pending/refused preflight,
callback reentry, identity exhaustion and terminal quarantine. The existing
research Apply/Undo regression still passes; its retained history cannot be
silently erased by the new entry point. No native callbacks or locking are added.

The compiled Flex chain adds 64 commit/clear cycles and four rollback cases to
the historical 32 Apply/Undo pairs/eight rollbacks. All four packed formats,
slots 0/127, boundary modes and retained/empty layouts are covered. It executes
300 actual stock pointer/selection/redraw refresh sequences without NULL reads.
Clear's metadata change and ownership/publication/playback remain synthetic;
the actual stock clear callback is exercised separately below. PCM remains exact.

The coordinator is 2,850 target text bytes with no object data/BSS. Local
function stack use is 0–52 bytes, excluding callees; caller-owned workspace is
still 10,092 bytes. No hardware cycles, contiguous placement or live UI latency
is qualified. Reproduce with `test_edit_transaction.py`, `transaction_native.py`,
`test_transaction_stock.py` and `transaction_stock_native.py` under the machine
lock. The code-generation guard and freestanding links pass.

`stock_probe.py --kind clearing` with `beat_slicer_clearing_probe` passes 88
clear-all and 56 individual-delete cases on Flex/Static slots 0/127, including
cancelled callbacks and first/middle/last selections. Compare complete settings
including inactive rows, controls and the other source arena. Confirmed writes
occur under the stock interrupt mask; the host guard remains closed through
refresh and callback return. Cancel neither writes nor invalidates its model
token. Formatting/message/viewport/task callbacks are explicitly mocked. The
matrix observes retired-row reads in 28 clear-all and 12 single-delete cases;
these synthetic observations are not a demonstrated stock UI/hardware defect.
The existing selection-retirement requirement remains for our own publisher.
Pinned EMAC/peripheral gates pass before this probe.

`boot_slices.py` separately passes 24 full-stock panel observations (12 each on
Flex and Static): back from grid count selection, aligned/unaligned four-slice
grids, cancel/confirm individual and all-slice deletion, and clearing an empty
table. Menu row/callback identities are checked. NO at the alignment question
creates the unaligned grid. Deletion prompts leave markers unchanged until
confirmed; individual deletion preserves the remaining records and order.
Clear removes all slices and selection rather than restoring an old layout.
Non-marker settings, source controls and the other source kind's settings stay
unchanged. Complete Flex PCM matches the original WAV after both workflows;
both private card hashes stay unchanged. No Beat Grid action, native writer
instrumentation, Static streaming, save/reload, physical audio or persistence
is qualified by these tests. Raw logs, memory and images remain private.

The six 0.1.18 receipts (`commit18-host/native`, `commit18-stock-host/native`,
`stock-clearing` and `boot-slices`) bind source commit `36101a8a5da74f6101f9a5dcedcdc441a66e172d`.
Historical source pins remain unchanged; `audit_evidence.py` verifies the inventory.

## Bounded Flex metadata (0.1.19)

`test_flex_metadata.py` passes host ASan/UBSan. `metadata_native.py` executes
the same selftest as compiled ColdFire code with the pinned stock-free CPU
runner, preserving callee-saved registers. This is original decoder code
against synthetic bindings, identities, locks and PCM, not an installed
native provider. The existing actual-stock observations establish the layout
under investigation; no guessed live address is introduced by this component.

- 1,536 captures cover all 128 Flex slots, all four loaded formats and counts
  0/1/64. Both snapshot and full-table APIs retain complete records, including
  inactive values, while leaving source settings/controls unchanged.
- 39 malformed-binding/source cases refuse both APIs without changing output;
  null outputs are also refused. Cases include missing lifetimes, wrong editor
  kind/slot, truncated or unaligned regions, address wrap, unavailable/busy
  sources, unsupported format, invalid extent/trim and count overflow.
- 40 preview integration cases exercise both tempo choices, selected-tempo
  changes, missing unselected tempo, trim/loop/record changes, source format and
  extent changes, lifetime changes, clearing and unavailable sources. The
  unselected-tempo case stays usable without falling back to another value.
- Two prepared-candidate cases change an inactive row. The active preview still
  matches, but complete-table candidate validation refuses publication and
  leaves its output unchanged. This protects internal preservation/rollback;
  it adds no user Undo action.

The metadata object contains 940 text bytes and no data/BSS. Compiler local
stack reports are 28 bytes for validation, 36 for snapshot capture and 16 for
complete-table capture, excluding callees and the caller's context. The shared
code-generation guard and freestanding link pass with no unresolved helpers.
These are compilation/execution measurements, not hardware cycles, actual RAM
placement or whole-call-chain stack qualification.

For native reproduction, use the existing private mounts/image and machine-wide
lock, then run `metadata_native.py --output <fresh-private-directory>
--executable <built-beat_slicer_job_probe>`. Host reproduction is
`python3 -B sdk/drafts/beat-slicer/test_flex_metadata.py`.
Exact live bindings, native lifetime/generation tracking, complete writer
coverage, project-tempo behavior with pattern tempo/external clock, ownership,
Static reading, playback, USB packages and physical qualification remain open.

## Normal stock persistence (0.1.19 research)

The final `boot_persistence.py` run passes across three fresh stock emulator
processes on a newly copied disposable card with explicit private-write opt-in.
SAVE SAMPLE SETTINGS adds only the expected 832-byte `.OT` file; all 53 prior
files and the original WAV remain exact. The next project load restores its
four-slice layout. Cancelled file revert changes nothing, confirmed revert
restores the three-slice sample layout, and loading that file into Static
leaves a separately cleared Flex slot unchanged.

The project save reaches its actual marker writer, successful close and final
successful UI callback before the card flush. Six files change, all inside the
disposable project. Both `markers.work` and `markers.strd` contain the exact
complete 64-record tables, trim and counts with valid extents/checksums. The
third process restores zero Flex slices and three Static slices, preserving
active start/end/loop records, trim and sample BPM. In each slot the observed
load changes one inactive deleted-row field and one field outside the serialized
table; the runner allows only those exact changes. Complete Flex PCM matches
the original at each sampled stage, and the original source card stays exact.

The initial timeout and the subsequent overbroad full-settings oracle failure
are described in BOOT_OBSERVATION.md and excluded from passing evidence. The
accepted run checks final save completion and distinguishes exact file contents
from inactive-row normalization. No physical reboot, installed Beat Slicer,
Static streaming or audio behavior is qualified.

The three 0.1.19 receipts (`metadata-host.json`, `metadata-native.json`,
`boot-persistence.json`) bind exact source `b53daa6b06ff7ed5d43507e696419dfaaa86ed8e`.
The provenance audit now covers 57 reports and 650 source bindings; the one
explicitly unbound historical compile diagnostic remains excluded. Historical
receipts and their source revisions are unchanged. Full Node 24 validation of
this source passes 2,527 app tests plus SDK checks, lint, types and bundling.


## Whole-command observer (0.1.20)

The original `worker_boundary.c` wraps a supplied queue receive with native
admission bookkeeping. Host ASan/UBSan passes 120 consecutive commands, a
reader acquiring while receive waits, nested exclusion, revoke, recursive
receive, null reply, exhausted identities and malformed bindings.

The compiled ColdFire fixture redirects the private stock worker's single
six-byte receive call, retaining its stock return path. Twelve cases pass:
four packed-format gain paths, busy/empty-range failures, null callback,
exhausted UI completion pool, release, unknown opcode, crop refusal and FIFO
commands. Actual native guard stores cover PCM writes and optional completion
posting; previous tickets retire before entering the empty queue's wait.
Stock PCM and completion results remain independently checked.

The observer is 398 text bytes, zero data/BSS, with a 28-byte local stack report
excluding callees. The largest observed observer-masked run is 49 executed
instructions: not cycles, cache cost or hardware time. The isolated fixture
mocks display and runs no scheduler, DSP or UI consumer. The production source
provider stays disabled; other-task/recorder writers remain outside this observer.

The full-boot `boot_worker_native.py` experiment also passes on the exact
reserved-placement binary: two stock reversals and five edit/waveform commands,
with the native writer ticket set before each edit's dirty store and retired
before queue wait. Original PCM is restored by the second reversal. Both
prepared settings/control records, original observer code and reservation
canaries stay exact; the copied/source cards remain unchanged. The real stock
scheduler and both DSPs run. The retained trace has 46 increasing frame samples
from 40,006 through 55,242; this is emulator progress, not hardware timing.

Three top audio pages are reserved using pinned upstream `arena.py` before
boot; code begins sixteen bytes inside the reserve to avoid the known clear
overshoot. The first attempt rejected an incorrect test assumption that the
mutable map endpoint equals physical pool capacity. Stock also reserves recorder
pages: the passed fixture has 14,599 physical usable pages and a map endpoint
of 10,919. The rerun checks the actual geometry operands and current map bounds.
Only the corrected run is passing evidence; its predecessor remains private.

The three `worker20-{host,native,boot}.json` receipts bind their exact inputs
to `37cb05abbb02e7c56917b9a23a61185cd20d68ca`. No
installable module, exported ABI, browser/USB package, complete source ownership
or hardware qualification follows. The injection/initializer are private test
operations, and the first command already waiting inside an unwrapped receive
must not be assumed covered during future native admission.


## Session lock accounting baseline (0.1.20)

`session_lock_native.py --expect baseline` runs the existing compiled session
regression with an instruction observer around its synthetic backend lock.
The baseline passes 4,404 successful lock sections, a longest section of 9,808
executed instructions, and 4,747 planner/reader begin/step/supply calls while
locked (zero outside). These are instruction observations of this fixture's
byte-copy metadata backend, not physical latency or native Flex capture timing.
The purpose is to verify moving private arithmetic/decoding outside source
ownership while retaining all capture/copy and stale-result checks.


## Private planning outside the source lock (0.1.21)

Planner initialization/transitions and decoding an owned PCM block now happen
after source ownership is released. Before a new PCM copy, the session reacquires
and revalidates; it still validates immediately after the copy and before
returning a result. The API remains single-owner/non-reentrant. READY is not an
Apply authorization, and postchecks cannot repair an unsafe backend read.

Six host sanitizer suites and seven compiled ColdFire runs pass: session,
candidate, commit, Flex chain, stock-backed commit/refresh and metadata, plus
the lock observer. Existing 120 commit/clear cycles, 194 internal rollback
points and the 300 actual stock refreshes remain passing. Historical Undo
regressions remain research and do not add a player control.

Nine new interleavings change guard, marker metadata, extent or encoding after
release, or force reacquisition/pending validation. Changes before a copy cause
no source read; changes after a copy retire the session before a result can be
used. Retries preserve the pending request, an unselected tempo change remains
allowed, output stays untouched on refusal, and lock/unlock counts balance.

The compiled suite observes 4,986 lock sections, longest 7,293 executed
instructions, with zero reader begin/step/supply calls locked and 4,898 unlocked.
The prior suite's baseline was 9,808 instructions and 4,747 locked calls; the
new suite includes the nine additional interleavings. Its metadata backend is
synthetic and byte-copies a snapshot, so neither maximum is a native Flex timing
budget. Physical cache/latency and whole-service budget remain unmeasured.

The session component is 2,828 text bytes, zero data/BSS; compiler local stack
reports range from 0 to 164 bytes, excluding callees and the full call chain.
No native backend, package, USB or hardware qualification is introduced.
The baseline receipt is bound to `79cde45170681eb6abda0e249456a78cec416654`;
the thirteen `*21-host.json` / `*21-native.json` receipts bind `a5254c50e562c0b54c336a173f0e199becd3b536`.


## Composed Flex source backend (0.1.22)

`test_flex_source.py` runs the metadata decoder and PCM reader through one
backend, rather than a test-only capture implementation. Its 32 previews cover
all four encodings, first/last slots, both tempo choices and snap on/off. The
plans match the synchronous planner using independently generated sample bytes;
reads cross non-contiguous pages. Every used PCM byte and all 274 selected
settings words stay exact; complete 64-record capture preserves inactive entries.

Ten intervening changes to owner/sample/editor/playback identity, selection,
ready/control bindings, region extent or guard reject the preview before any
page lookup. Denied ownership retries without spinning; nested acquisition is
refused; unlocked/stale marker reads leave output untouched. Locks balance.
`flex_source_native.py` runs the same assertions compiled for ColdFire, using
real private stock page lookup and its preserved-register checks. Fixture regions,
identities and ownership remain synthetic. No live admission, address discovery,
writer completion guarantee, native publication, cache or hardware timing is
established. `evidence/source22-host.json` and `evidence/source22-native.json` bind the exact
source `c49c3cff97c5cccb745bd3a17b39575ecb315b96`.


## Compiled full-boot Flex previews (0.1.23)

The private 1.40C fixture reserves eight top audio pages with the pinned arena
helper and injects only original test code there. The actual scheduler, both
DSPs, stock-loaded BEATLAB PCM and the whole-command observer run. The native
metadata/PCM backend reads stock regions through real page lookup. Lifetimes
and admission remain test-owned; the fixture's interrupt mask is not hardware
ownership or latency qualification. No module/base package is installed.

Twenty initial previews cover SAMPLE/PROJECT, EXACT/SMOOTH and all five beat
spacings. Four further previews after each of two stock reverse operations give
28 exact whole-plan comparisons, 167 page queries and 2,386 bounded step calls.
Sample tempo is 2,886 and runtime project tempo 2,880 in 1/24 BPM units, so the
test exercises distinct actual values. Pattern multipliers/external clock and
live tempo ownership remain unqualified. Plans match the host synchronous
planner over the original or expected reversed PCM, including all fade flags.

The first reverse retires RUNNING, the second READY. Neither stale case copies
another block or alters result output. Fresh previews match the changed sample.
Every preview batch leaves all logical PCM, 44 control bytes and 274 settings
words exact; only the deliberate stock reverse operations alter audio. The
second reverse restores the original under the previously observed inclusive
endpoint model. Original code/reservation canaries survive; both source and
private cards stay unchanged. There is no marker publication or playback claim.

The initial run stopped before native initialization: an interactive `call`
refused because panel runs had paused outside main's idle spin. The corrected
driver retries only that exact pre-entry guard, advancing normal execution in
0.01 ms increments with a fixed retry bound; any uncertain/post-entry error is
terminal. Four driver tests include wrong target/spin contracts and budget
exhaustion. The first run remains a failed private diagnostic, not evidence.
The successful compile, boot and lock receipts `evidence/source23-*.json` bind
`1179af1f4c33a6f6f38fd8f86928057a6338bac3`.

A separate physical MCP preflight on 24 October read base
`d6bfff70cd237c1c2597ce37273cbdc4e8da0c595a9378455d3861137aa53224`,
ABI 10/features 903, ten installed modules and no missing modules. Its public
status/load reads work; development panel/memory reads are refused. No Beat
Slicer package, project edit or hardware behavior was tested by this preflight.


The separate `source_lock_native.py` runner executes the composed-backend suite
with real stock lookup and synthetic regions/ownership. It observes 514 lock
sections, longest 2,652 executed instructions; all 544 metadata captures, 66
copies and 66 stock page queries occur while held. All 439 planner calls and
130 PCM decodes occur outside. Stack and callee-save registers are preserved.
This uses a different backend/fixture from the earlier session baseline and is
not a matched performance comparison, cycle count or hardware-time bound.


## Private native menu and engine service (0.1.24)

The one-shot menu fixture preserves all six unsliced or nine selected-slice
stock rows, labels and callbacks, appends BEAT GRID and selects it through real
panel events. All eight normal/stale-owner/late-owner/cancel combinations pass.
A normal selection begins a matching read-only preview; stale or cancelled
selection makes no PCM query. The second open is stock-only and its remembered
index stays valid. Stable menu storage remains pinned forever. The initial
unsliced attempt failed because the saved fixture already had four slices;
the successful runner explicitly clears or creates the required stock layout.

The configuration fixture exercises 20 BPM/spacing/boundary combinations and
an option-change restart in each stock menu variant, giving 42 whole plans that
match the host oracle. READY does not restart; a synthetic invalidation removes
its result, and BACK returns to configuration before closing. Stock-NO and
owner-retirement runs in both stock menu variants cancel a running preview before another query and close the owned popup; all six control/terminal
scenario runs pass.
Every completed run preserves full PCM, controls and settings and both cards.
The dialog shows total count/fade flags, not a qualified playback policy or Apply.

A separate compiled-source run follows actual stock DELETE SLICE, DELETE ALL,
unaligned grid and aligned grid creation. Each retires RUNNING or READY before
another query; fresh previews match the new stock table and leave it unchanged.
Twenty previews use 148 page queries and 4,331 steps. Guard revisions also
advance, so this is not isolated metadata-only invalidation evidence. The actual
stock actions leave PCM unchanged; previews preserve active/inactive markers,
other metadata, controls and the Static settings arena. Cards stay unchanged.

The new idle/job boundary passes host ASan/UBSan and compiled ColdFire tests for
120 lifetimes, closed bootstrap, independent writer ownership, reentry, invalid
retirement and exhaustion. Its native object is 374 text bytes, no data/BSS;
compiler local stack reports 0–12 bytes, excluding callees and the full chain.
Its separate full-boot hook-only run tracks five reverse/waveform commands,
protects the actual dirty-store interval and preserves worker/UI completion.
Admission starts closed until an actual idle boundary; the receive call stays
unchanged. Both reversals match the previously observed inclusive endpoint
model, the second restores PCM, and metadata/code/canaries/cards stay intact.

The engine-service full boot uses those existing base-owned hook sites, leaving
the receive call intact. Twenty initial previews plus four after each of two
normal stock reversals give 28 whole-plan matches, 167 queries and 2,386 steps,
with no driver step calls. A further waiting/readiness case completes one plan.
An independent synthetic writer makes the service wait without self-posting or
polling; a separate readiness notification resumes it. Cancellation before
consumption makes no new query. An unrelated message with the same no-op opcode
still advances the guard and invalidates READY without touching result output.

Across that run the service sees 403 idle calls, 2,957 explicit steps, 394 posted
and consumed owned wakes, nine ordinary commands, two cancellations and 29 ready
results. No idle callback makes more than eight explicit step calls, plus an
optional begin call with its initial capture/setup. The transition counter
excludes that begin work; these are not cycle or hardware-time measurements.
Source/settings stay unchanged by previews, the second stock reversal restores
PCM, code/canaries survive and both
cards stay unchanged. The real base USB/logging/module-set chain is not installed;
its ordering, full ownership, cache, stack and hardware budget remain unqualified.

Node 24.22.1 full validation against actual `upstream/main` passes: 2,529 app
tests, SDK tests, lint, typecheck, production build and catalogue/import checks.
The required `origin/main` invocation still fails on inherited CHANGELOG.md
history from the stale fork base; no unrelated history or remote ref is rewritten.
These are development fixtures, with no source service/ABI published and no
module installed or qualified on hardware. The 23 `menu24-*`, `ui24-*`,
`slices24-*`, `engine24-*` and `service24-*` receipts bind source `9f4d7e4a7a0262073e6c59333e5ea8eda4026b2b`. Provenance
audit covers 102 reports and preserves earlier exact historical source identities.
The one unbound historical failed-link diagnostic remains excluded.


## Automatic native preview and result labels (0.1.25)

The private UI fixture uses the existing base-owned UI-tick topology, preserving
registers and the stock tail call. Normal scheduler execution drives the service;
the driver never invokes it. Both six-row unsliced and nine-row selected-slice
layouts pass 20 control combinations plus an option-change restart, giving 42
whole-plan matches. Completed plans survive an observed further stock waveform
read, remain stable without restarting, and invalidate on an unknown command.

The six-row controls run observes 1,483 ticks and 3,113 service calls; the nine-row
run observes 1,341 and 2,292. Neither exceeds eight calls per tick or reenters.
Pending-source ticks yield after one call. Tick, menu callback and PCM query
observations identify the same UI task. All borrowed entrypoints have zero
arguments, and main's stack stays unchanged. These counts do not establish a
physical latency or the production base's whole-chain stack budget.

The four-row result displays captured BPM, total/existing/new slices, the fade
warning and BACK. Private LCD review confirms both zero-existing and four-existing
examples fit the stock popup. Host ASan/UBSan and compiled ColdFire runs check
12,962 tempo labels and 2,145 count pairs, invalid inputs, output capacity and
canaries. The formatter links freestanding with 1,226 text bytes and no data/BSS;
compiler local stack reports 20–64 bytes, excluding callees and the full chain.

A separate stock renderer probe checks 48 fresh/cached ordinary Flex calls over
four packed formats, slots 0/127 and three bin widths. All 102 extrema/extent
bins per fresh call match an independent oracle; matching cached calls read no PCM. Source
write watches remain zero, and the inherited display mock is never reached.
Unavailable-pool and busy-slot cases and one full worker dispatch also pass.
The busy flag does not prevent the stock renderer's reads; the preview provider
still enforces its own busy refusal. The narrowed command classification is
private to fixed stopped-source inputs. Mutable queued-record stability, Static,
recorder paths, complete live ownership and hardware remain unqualified.

Build the automatic fixture with `ui_tick_native.py --help`, then run
`boot_ui_tick.py --help` for each controls/cancel/owner scenario and each menu
variant. The compiler requires the pinned external core recipe and its hash;
the runner requires private stock/card identities and explicit injection opt-in.
Run `test_ui_text.py` on the host and `ui_text_native.py` with the compiled target
runner. `stock_probe.py --kind waveform` runs the isolated renderer probe. Keep
stock images, cards, LCD dumps and derived native binaries outside Git.

All six automatic controls/cancel/owner runs pass. Stock NO and owner retirement
while waiting cancel before another source query and close the owned popup in
both menu variants. Every completed run preserves full PCM, controls, settings,
code/canaries, main's stack and both card copies. Storage remains pinned; these
results do not qualify real package detachment or pointer reclamation.

The 0.1.25 source check against current Modwerk upstream passes all 2,529 app
tests, 37 SDK tests (one skipped), lint, types, build and catalogue/import gates.
The mandatory fork-base invocation still fails on inherited CHANGELOG.md history
from stale origin/main. Final prose-only follow-ups use the lightweight catalogue,
licence, import and provenance checks; no hardware or publication claim is added.

The ten `ui25-*`, `ui-text25-*` and `waveform25-stock.json` receipts bind
source `ebf3634483db5971fc92cfdd2fdae7eb3fd661c3`. They retain raw report content
and exact input hashes; earlier receipts continue to bind their own historical
source revisions. No binary rerun is implied by the provenance audit.


## Engine previews from four stock-loaded formats (0.1.26)

Four fresh full scheduler/DSP boots load authored 44,100-frame, 44.1-kHz files
through stock into retained 16-bit mono/stereo and 24-bit mono/stereo Flex pools.
Each runs 20 BPM-source, boundary and spacing combinations through the private
engine service. All 80 complete plans match the independent decoded-PCM oracle.
The retained 24-bit fixtures include nonzero low bytes, which remain exact.

| Loaded format | Oracle plans | Page queries for those plans | Explicit steps for those plans |
| --- | ---: | ---: | ---: |
| 16-bit mono | 20 | 109 | 1,062 |
| 16-bit stereo | 20 | 109 | 1,062 |
| 24-bit mono | 20 | 109 | 1,062 |
| 24-bit stereo | 20 | 110 | 1,063 |

Each boot also verifies waiting without polling, a separate readiness wake,
pending cancellation before another query, and invalidation by an unrelated
message sharing the owned wake opcode. Four additional waiting/resumption cases
reach READY; those are distinct from the 80 whole-plan oracle comparisons.
Across all four runs there are 912 engine idle callbacks, 6,534 explicit steps,
896 posted/consumed owned wakes, 16 ordinary commands, eight cancellations and
84 READY results. No callback exceeds eight explicit steps plus optional
begin/setup; these counts do not establish physical CPU time or audio headroom.

All previews preserve full logical PCM, 44 control bytes and 274 settings words.
Original code and reservation canaries survive, the receive call stays intact,
and both original and copied cards remain unchanged. The typed three-word
mailbox is written only while the emulator is paused; all borrowed calls have
zero arguments. Main's stack compares equal before and after the request cases.
This driver technique does not qualify a concurrent UI/engine publication API.

Build `engine_service_native.py` with the private pinned stock input and run
`boot_engine_formats.py` once for each retained-width card/WAV pair; its `--help`
lists exact hash, arena and explicit-injection arguments. A source compiled for
another revision or a converted-width project is refused. Keep all images,
cards and full PCM observations private. These fixed stopped-source tests retain
synthetic lifetime/admission, partial writer coverage and full masking. Static,
live replacement, cache behavior, actual playback, browser/USB integration and
physical persistence remain unqualified.

The source check against current upstream passes 2,529 app tests, 37 SDK tests
(one skipped), lint, types, bundle and catalogue/import checks. The required
origin/main invocation retains the inherited historical CHANGELOG.md failure;
prose/evidence follow-ups use the lightweight checks.

The five `formats26-*` compile/boot receipts bind source
`1338539aba333f37b3dbfd9e6867c875c9fe66c3`. Their raw contents and complete
source hashes are retained, alongside earlier exact historical evidence.


## Copied UI/engine exchange (0.1.27)

The portable exchange gives one engine consumer ownership of the preview
session. UI producers submit copied options/cancellation and read a copied plan
with its exact request sequence. A backend gate checks cancellation/replacement
again before capture and copy, after any unlocked planner work. No UI callback
mutates the reader or session. Published results remain preview-only.

Host ASan/UBSan and compiled ColdFire tests pass 32 complete plans and 72 modeled
interleavings covering cancellation, replacement, owner retirement, nested
service refusal, lock denial and publication. Two cases deliver a new intent as
the completed result's final lock is released: old results stay unreadable even
though the engine's local return value was already selected. Each accepted intent
therefore still needs its own wake/ordinary-event guarantee. Further cases cover
wrong owners/options, waiting without immediate begin retry, source readiness,
pending READY revalidation, unchanged output on refusal, metadata becoming stale
and sequence exhaustion. These are serialized callback models, not RTOS or
physical concurrency evidence.

The target library object has 3,148 text bytes and no global data/BSS of its own;
its caller-owned state is 4,244 bytes in the compiled native fixture. Local
compiler stack estimates are 8–40 bytes, excluding callees and the full chain.
The combined native test image compiles at 23,436 text bytes, no initialized data
and 10,212 BSS bytes, including the retained manual reference session. It fits
its explicit eight-page arena reservation. These sizes do not establish timing,
cache behavior, shared-base memory placement or installable-package headroom.

`test_preview_async.py` and `async_native.py` reproduce the portable checks.
`async_ui_native.py` compiles the separate engine/UI fixture; `boot_async_ui.py`
exercises its conservative or explicitly opted-in fixed-input waveform-read
classification. Completed native run outcomes follow below.
The fixture retains pinned storage, synthetic source/owner identities and partial
writer coverage. No production API, event assignment, loader retirement, native
Apply, playback, browser/USB package or hardware qualification is implied.

Six fresh scheduler/DSP boots cover controls, waiting cancellation and owner
retirement in both six-row and nine-row stock menus. The two control runs
produce 42 complete oracle-matching plans and correct tempo/count/fade labels.
Changing options while waiting cancels the old request before another query;
normal NO and owner retirement close the waiting dialog without another read.
A foreign message sharing the wake opcode invalidates a completed preview.
The explicitly opted-in fixed-input waveform classification lets completed
results survive normal redraw work; it is not production writer admission.

Across those six boots, 2,942 UI ticks each perform exactly one UI service call,
with no reentry. All observed PCM queries occur in the separate engine task.
There are 508 engine callbacks, 2,944 explicit session steps, 48 begin calls and
458 posted/consumed owned wakes, with no wake left pending. The maximum remains
eight explicit steps plus optional begin/setup and result validation/publication.
These are execution/work counts, not cycles or physical latency.

A seventh, conservative six-row boot keeps the default all-command invalidation.
Its UI briefly completes one preview, then normal waveform work retires it before
the driver observes READY; this receipt contains **zero** whole-plan oracle
comparisons. It verifies the stale result, no subsequent queries and normal
closure. Every successful boot preserves complete logical PCM, controls,
settings, both cards, code/reservation canaries, the original receive call and
main's stack. All storage remains pinned, so none proves physical removal,
reclamation or a production base/USB lifecycle.

The source check against current upstream passes 2,529 app tests, 37 SDK tests
(one skipped), lint, types, bundle and catalogue/import checks in 135.90 seconds.
The required origin/main check retains the inherited CHANGELOG.md history
failure. Documentation/evidence follow-ups use the lightweight checks.

The ten asynchronous-exchange reports are pinned to source commit
`e9169abf655f1fefef4c9cc7fdccae57a925714a` in `evidence-sources.json`.


## Longer previews and measured baseline (0.1.28)

`preview_cost_native.py` compiles an original synthetic provider with the preview
exchange and runs sixteen one/30-second cases: exact/smooth boundaries, one/64
beats and sample/project tempo. All complete plans match the direct planner.
The observer counts executed ColdFire instructions within service calls and
ownership sections, with positive controls and preserved stack/callee registers.
Planner/decoder entries are never observed under the backend lock. This provider
models 1,536-frame page boundaries; it does not model stock metadata capture,
cache, RTOS scheduling, cycles or physical time.

For the 30-second, smooth, one-beat sample-tempo case (120.25 BPM), the baseline
uses 4,074 service calls and 22,924,183 service instructions; its longest call is
19,160 instructions. It enters 41,166 lock sections, totaling 13,900,774 locked
instructions, with a longest section of 1,969. It performs 32,591 explicit steps,
33,439 captures and 423 copies to produce 61 markers. Project tempo (120 BPM)
uses 4,007 calls, 22,540,198 service instructions and a longest call of 19,437,
with 60 markers. These are a reproducible optimization baseline, not a native
performance qualification or a stock-effect comparison.

A separate full scheduler/DSP boot uses authored 16-bit stereo PCM with
1,323,000 frames at 44.1 kHz. Loading a longer WAV into the retained project
initially leaves the old one-second trim. Stock EDIT SELECT ALL does not change
that trim in this pinned 1.40C emulator. The driver therefore uses ordinary stock
sample clear/reload, verifies the full trim and zero markers, then admits the
preview. Stock sets sample BPM to 128; project BPM remains 120. The driver checks
the captured values rather than assuming the older fixture's sample tempo.

All 21 control plans match the independent PCM oracle, including a 64-marker
sample-tempo plan and 60-marker project-tempo plan. Normal UI ticks produce the
results without driver service calls. The run records 1,344 UI calls, 10,991
engine callbacks, 87,505 explicit steps, 22 begins and 10,969 posted/consumed owned
wakes. PCM, unrelated settings, cards, code/reservation canaries, receive call and
main stack remain unchanged. The LCD's tempo, existing/new counts and fade
warning match the plan. No Apply or audible playback is exercised.

Each plan records the window from request selection through first observed READY.
The smooth one-beat sample request records 115,158,006 whole-machine instructions
and 840.282 emulated ms; the project request records 87,275,438 and 580.264 ms.
These windows include panel holds/releases, polling, UI, stock work and scheduler
execution. They are neither isolated module CPU cost nor measured hardware time.

The first long-source driver attempt exhausted the existing two-ms pre-entry idle
wait before activation; no borrowed call executed. The successful run permits
200 verified pre-entry waits of five emulated ms. Seven driver regressions cover
bounded custom waits, invalid budgets, terminal uncertain execution and failure
while advancing normal execution. The default remains 200 waits of 0.01 ms;
callers cannot request more than 200 waits or ten ms per wait. This is emulator
driver readiness, not a new module clock or permission to replay uncertain work.

The full boot reuses the exact 0.1.27 native image because all its compiled inputs
are unchanged. The changed driver and new compiled cost fixture have their own
source hashes. Synthetic ownership, pinned storage and private fixed-input
waveform classification remain. Live admission, Static, native publication,
playback, production base/browser/USB lifecycle and hardware are still unqualified.

The long-source and cost reports bind source
`91d443832e638f81b657813aa2edb1a5fd88d9a1`. Current-upstream validation passes
2,529 app tests, 37 SDK tests (one skipped), lint, types, bundle and catalogue /
import checks in 132.07 seconds. The required origin/main invocation retains
the inherited CHANGELOG.md history failure. Evidence-only follow-ups use the
lightweight checks.


## Bounded private work batches (0.1.29)

`bs_session_work` batches only session-owned reader transitions and stops at its
first live-read request. A new acquisition and metadata/guard check precede the
single permitted PCM copy, followed by another validation and unlocked decoding.
The original `bs_session_step` remains a budget-one wrapper. The async exchange
uses eight private transitions per work call; its native fixture selects one
work call per engine callback, plus optional begin/setup and publication.

Host ASan/UBSan and compiled ColdFire tests pass 192 complete plans and 132
metadata invalidations across private budgets 1, 2, 4, 8, 16 and 32. Extra cases
check at most one copy/three captures/two source-lock sections per work call,
warm owned-cache transitions, writers becoming runnable at unlock, pending
capture, refused lock acquisition, unchanged invalid-budget state and identical
plans/copy counts with fewer captures. These are serialized models. The session
object adds no storage; its compiled code is 2,918 bytes with no global data/BSS.
Its largest local compiler stack estimate is 164 bytes, excluding callees and
the full chain.

The copied exchange still passes 32 complete plans and 72 modeled interleavings.
Batching can complete before a later injection target, so the tests also drive
normal READY revalidation events to reach those targets. Assertions check the
accepted request's published state/result, cancellation with no later copy, and
the independent wake after late replacement; they do not mistake a previously
selected local return value for the current copied UI state.

All sixteen synthetic cost cases retain complete planner equality and exactly
the baseline's PCM-copy, marker and private-reader counts. No planner/decoder
entry is observed under source ownership. The selected callback budget is one:

| 30-second, one-beat case | Baseline service instructions | Batched service instructions | Baseline maximum call | Batched maximum call |
| --- | ---: | ---: | ---: | ---: |
| Sample smooth, 120.25 BPM | 22,924,183 | 9,591,985 | 19,160 | 10,663 |
| Project smooth, 120 BPM | 22,540,198 | 9,430,825 | 19,437 | 10,631 |
| Sample exact, 120.25 BPM | 704,194 | 566,113 | 19,145 | 15,209 |

Across all sixteen cases the maximum callback falls from 19,437 to 15,209
executed instructions. Sample-smooth source captures fall from 33,439 to 5,171;
423 copies and all 33,015 private reader calls remain. The selected budget uses
4,323 service calls, so fewer service calls are not the claimed improvement.
Locked instructions fall from 13,900,774 to 2,837,223; the maximum locked section
is 1,968 versus 1,969. This synthetic scalar-only metadata provider excludes
stock capture cost and cache behavior. These are instructions, not cycles,
physical latency, audible headroom or native timing qualification.

Final source-bound probes also record budgets two and eight for the tradeoff.
Budget two reduces the long smooth total to 9,239,745 instructions, but its worst
callback across the matrix grows to 25,889. Budget eight lowers that smooth total
to 8,975,522 with a 65,469-instruction smooth callback. Neither is the selected
native default. Reproduce the accepted cost run with `preview_cost_native.py
--budget 1`; the report records the budget and private-transition unit explicitly.

The new combined native image has 23,528 text bytes and 10,212 BSS bytes, including
the retained manual reference session; it fits the same eight-page reservation.
The async state remains 4,244 bytes. Execution outcomes below remain separate
from compile success and from hardware qualification.


The optimized 30-second full boot passes all 21 oracle plans, preserving PCM,
settings, cards, code/reservation canaries, receive call and main stack. Its
sample-smooth one-beat request window records 58,355,127 whole-machine
instructions and 520.282 emulated ms, versus the baseline's 115,158,006 and
840.282. Source queries stay 444; source-lock acquisitions fall from 43,254 to
14,082. The corresponding project request records 32,329,686 instructions and
280.067 emulated ms, versus 87,275,438 and 580.264, with 417 source queries in
both runs. These windows include panel/polling/UI/stock/scheduler work and do
not establish isolated module cost or physical timing.

The long run has 1,321 UI calls, 11,733 engine callbacks, 11,694 bounded work
calls, 22 begins and 11,712 posted/consumed owned wakes. At most one work call
occurs per callback; the work-call counter is not comparable to the baseline's
individual-step counter without naming that change. The LCD still shows the
correct 64-slice, 128-BPM preview and fade warning. No Apply is exercised.

Current-upstream source validation passes 2,529 app tests, 37 SDK tests (one
skipped), lint, types, bundle and catalogue/import checks in 140.31 seconds.
The required origin/main invocation retains the inherited CHANGELOG.md history
failure. Documentation/evidence follow-ups use the lightweight checks.


The optimized short-source matrix passes both six-row and nine-row stock menus:
42 complete oracle previews, cancellation while waiting and owner retirement
while waiting. Across all six runs, 2,942 UI calls, 591 engine callbacks,
486 bounded work calls, 48 begins and 541 posted/consumed wakes
complete with no pending wake. Source queries stay in the separate engine task;
UI/selection task identity, code/arena canaries, receive call and main stack stay
intact. PCM, complete settings and cards remain unchanged. The retained private
waveform classification, synthetic owner/source admission and pinned storage
remain limitations; no Apply, loader removal or hardware behavior is qualified.

Fifteen optimized-work reports bind exact source commit `cb3c76a1374fe43663ef561375f0d81d63f5841b`. Historical baseline reports retain their own earlier source pins.


## Selection-bound callback authority (0.1.30)

Host ASan/UBSan and compiled ColdFire tests pass 200 repeated context lifetimes
across both menu shapes. They reject direct/late/duplicate calls, wrong tasks,
tables, rows, callbacks, owners, generations, domains and epochs, blocked
selections and exhausted serials. Refused output remains unchanged. Capture,
arm, consume and post-return retirement are distinct; a captured context alone
is not authority. These portable tests model the trusted adapter boundary.
The compiled context uses 668 text bytes, no global data/BSS, and at most 48
local stack bytes excluding callees and the complete chain.

An isolated actual-stock probe compares 48 original/wrapped selections with
closed popups: four SR values, three rows, present/absent selection output and
null/hostile callbacks. Authored hostile code clobbers every data/address
register and changes SR. Both paths match all D0–D7/A0–A6 registers, SP, SR,
the original return slot, the callback overwrite of the caller's first argument,
other argument words and selected-row writes. Four nested calls are refused
before stock dispatch while preserving the outer state and argument layout.
This probe has no scheduler or popup destruction; full native UI checks are
separate. The private return trampoline preserves the original stack rather
than introducing an extra stock call frame.

The combined guarded fixture size report is:

```text
text	   data	    bss	    dec	    hex	filename
  25610	      0	  10308	  35918	   8c4e	/evidence/selection30-ui-compile2/source-boot.elf
```

It fits the eight-page private reservation. Compile size and isolated ABI
comparisons are not physical timing, native loader admission or module removal
qualification. Full-boot outcomes are recorded separately below.


Both full native menu layouts pass all 42 complete control plans and preserve
PCM, complete settings, cards, private code/reservation canaries, receive call
and main stack. Each run traces three actual popup selections through entry,
tail, stock helper and post-return trampoline, checking registers and stack at
each boundary. Interactive PC traces do not expose SR; the separate paired ABI
probe above checks SR directly.

Each layout refuses 40 direct callbacks across configuration, READY, closed and
post-stock-grid states without changing UI epoch/options, request identity,
pending work or invocation count. Capture/arm/consume counts agree; dispatch
entry/exit counts balance, with no nested selection, active context or fault
left. A later original stock SLICE menu and its eleven-row grid chooser still
open and cancel without modifying markers. No module Apply or Undo is exposed.

Across the two runs: 152 stock selection dispatches, 2,634 UI calls, 574 engine callbacks, 482 bounded work calls and 530 posted/consumed wakes, with none pending. Source queries remain in the separate engine task. This does not prove production loader retirement, live source admission or physical timing.

Current-upstream full source validation: Check passed in 136.49s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The new CMake probe target also builds and passes the separate 48-case ABI comparison.

Six selection-context reports bind exact source commit `604af6bbcf7a1feaea14d40c846a2ce7acce9ccb`.


## Immutable fixed-owner openings (0.1.31)

Host ASan/UBSan and compiled ColdFire tests pass 200 context-authorized actions
across 100 openings of each layout. Labels, callback slots, action records and
backend remain byte-identical. Stale armed contexts, wrong tasks, stock rows,
busy native/context state, reentrant retirement, changed owner/layout and serial
exhaustion are refused. These are serialized adapter models, not loader leases.
The resident helper has 634 text bytes and no global data/BSS; its largest local
stack estimate is 40 bytes excluding callees and the complete chain.

The native fixture keeps two independently pinned 648-byte layouts. Every
contributed selection goes through the exact context guard; original stock rows
retain the unowned stock callback path. The owner check remains synthetic.
Its combined image has 27,152 text bytes, 0 data bytes and 10,980 BSS bytes, fitting the same eight-page reservation. The CMake-built ABI probe separately passes 48 paired dispatcher cases and four nested refusals against this exact image.

Both native control runs pass 27 oracle previews each: the complete 21-case
workflow followed by six fresh openings. Ten root openings per run include an
extra NO dismissal, ordinary stock grid chooser and outstanding-popup owner
retirement. Each layout's serial advances from 1 through 10 without rewriting
its tables. Options persist, UI epochs advance and late calls cannot change
current authority. Each run refuses 100 direct callbacks. Retiring the owner
closes its outstanding root popup; later openings are stock-only.

Separate runs cover NO cancellation while waiting, owner retirement while
waiting and conservative waveform invalidation in both layouts. All eight runs
preserve PCM, full settings and cards, plus code/reservation canaries, receive
call, main stack and separate UI/engine task ownership. Every posted wake is
consumed; no callback exceeds one bounded work call.

The conservative runs record 0 driver-observed oracle comparisons and 2 UI completions; those are distinct observations.

Two additional native boots alternate between six-row and nine-row layouts in
the same process. Each performs six stock marker transitions and seven fresh
Beat Grid previews. Stock grid creation uses its normal four-slice chooser and
NO-for-unaligned decision. Cancelled clear leaves every setting intact; confirmed
clear changes the count while preserving inactive records. Both resident layouts
remain byte-identical across transitions. Preview changes no setting; only the
explicit stock operations change expected marker fields. PCM, source controls,
non-marker attributes and all Static-slot settings stay unchanged. Cards are
not saved. This is stock grid/clear behavior alongside the contribution, not
Beat Slicer Apply or persistence qualification.

Fixed-owner reopening does not support changed contributions, new package
owners, native reference reclamation or USB replacement/removal. Production
registry transitions, live source admission, Apply/playback and physical
qualification remain open.

Current-upstream full source validation: Check passed in 139.33s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The exact native fixture passes the separate CMake-built 48-case ABI comparison.

Fourteen resident-menu reports bind exact source commit `02ad4c874e2f9af84bf25877ce27b72ae515a6cc`.


## Published owner and normal project tempo (0.1.32)

The menu-owner helper checks the complete real loader record and its exact
current published extent under the caller's stable loader lock. Six host
ASan/UBSan configurations cover ordinary/cached images, the 128-module Octatrack
pool, and module sets. Each runs the unchanged upstream loader suite plus staged,
live, rollback-retained, replaced, restored and removed owners; eight full-record
field mismatches are refused. Observed absence or explicit pre-transition
retirement is permanent for that activation, including a restored old image.
Every transitive SDK compilation input matches the committed dependency manifest.
The retained-evidence audit also resolves each declared SDK dependency against
its exact Git commit, including the code-generation guard where recorded. Seven
focused host regressions reject missing pairs, malformed identities/paths,
changed source/guard hashes and a module-relative/repository-path cache collision.
Synthetic machine glue remains; uploaded module code does not execute.

The proposed helper compiles with the freestanding ColdFire toolchain and shared
code-generation guard: 308 text bytes, 0 data bytes,
0 BSS bytes. Its only unresolved imports are the expected loader
owner-validity and published-position queries. This is compile-only evidence;
no complete native loader link, execution or registry transition hook is claimed.

A separate stock-free ColdFire binary links and executes this exact helper with
explicit synthetic loader answers. It exercises all 128 publication positions,
complete owner-field/digest copies, destruction of the original caller record,
intact-but-unpublished refusal and permanent retirement after invalidation,
replacement or explicit retirement. Guard canaries, stack and preserved registers
survive. This validates the compiled helper, not real native loader execution,
menu dispatch, USB or physical timing.

A separate unmodified stock boot changes project tempo through TEMPO and the
LEVEL encoder: 120 → 90 → 137 → 120 BPM. Each measured detent is one BPM, bounded
turns are checked against the runtime word, and NO leaves the accepted tempo
unchanged. Retained open-popup LCD captures were rendered and inspected: 90.0, 137.0 and
120.0 BPM with PRJ selected. Complete
PCM, sample controls/settings and the unsaved card stay unchanged. No direct
tempo stores or borrowed native calls set these values.

A further native resident-menu boot starts at a normally selected 90 BPM and
passes 27 whole-plan oracle comparisons across SAMPLE/PROJECT, all spacings and
both boundary modes, followed by repeated openings. PROJECT results use 2160
in 1/24-BPM units; SAMPLE results retain the sample's distinct tempo. Preview
never alters project tempo, PCM or sample settings. The same ten opening serials,
stale callback refusals, ordinary stock grid path and owner retirement checks
remain active. This adds a distinct captured project tempo; it does not prove
live clock changes, external sync or pattern-tempo modes.

Production typed contribution admission, pre-transition lease retirement,
module-set readiness, native reference reclamation, source ownership,
Apply/playback and source-built browser/USB packages remain unfinished.
Hardware, audible headroom and physical reboot persistence are not tested.

Current-upstream full source validation: Check passed in 134.43s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The owner helper has separate compile-only and synthetic ColdFire execution evidence; real native loader execution is unqualified. The tempo driver reuses the unchanged linked resident fixture.

Five owner/tempo reports bind exact source commit `f4334909b812547282acdcc2cee50b61795b9e13`.


## Full-owner menu dispatch adapter (0.1.33)

The proposed backend connects the compositor's short module/generation identity
to an admitted full runtime-owner lease. It copies an explicit action allowlist,
refuses ambiguous/duplicate registration, and revalidates current publication
before forwarding to a trusted base dispatcher. It neither parses uploaded
metadata nor resolves a raw module-pool function pointer.

Six actual-loader host ASan/UBSan configurations pass the upstream loader suite
and adapter extension. Two coexisting modules share an action ID; sorted menu
selection reaches the correct complete owner. Changing the caller's binding
array cannot alter registered actions. Unknown identities/actions and malformed
bindings are refused without registry mutation. Callback refusal is propagated;
a second dispatch of the same menu opening is stale. Replacement retires the
old activation even while its image stays intact for rollback. Restoration does
not revive it, and explicit pre-transition retirement also covers a missed
replace/restore interval. Removing one owner preserves its companion action;
removing the companion refuses that action too. Original loader active count
and free space are restored. Uploaded module code never executes.

The separate stock-free ColdFire binary links and executes the helper, adapter
and compositor. Both six-row and nine-row models cover copied bindings, sorted
dispatch, callback refusal and permanently stale authority after replacement and
restoration. The included owner-copy fixture also covers all 128 publication
positions. Code-generation checks, stack and preserved-register checks pass.
The adapter object has 786 text bytes, 0 data bytes and
0 BSS bytes; local stack estimates are retained in its report and
do not establish the complete production call-chain budget.

Host and target fixtures acknowledge detachment only in their synthetic menu
models, which have no stock-retained pointers. They do not demonstrate native
reclamation, uploaded-code execution, typed package admission, module-set
readiness or USB transitions. Production pre-transition hooks, source admission,
Apply/playback and physical qualification remain unfinished.

Current-upstream full source validation: Check passed in 137.32s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The composed owner adapter passes actual-loader host checks and a separate synthetic ColdFire link/execution fixture. Real native registry and USB integration remain unqualified.

Two full-owner menu adapter reports bind exact source commit `9b2dcbb9f77d01a40c42e1afb58c46476be3024f`.


## Real SDK loader on ColdFire (0.1.34)

The new fixture links the unchanged runtime loader and SHA implementation with
the full-owner menu backend and compositor. Six ASan/UBSan host configurations
pass both menu layouts and two coexisting owners. Two separate stock-free
ColdFire binaries pass the same fixture with 128 module positions and a 786,432
byte pool, in uncached and cached loader branches. The actual target backend
entry wrappers execute; synthetic paused-task callbacks check that their context
and captured SP are present. Stack and preserved registers return intact.

The scenarios refuse staged owners, dispatch the correct sorted action through a
complete live owner, reject duplicate dispatch, retire replaced owners while
their images remain retained, and refuse revival after restoration. A newly
admitted activation can dispatch; explicit pre-transition retirement covers a
replace/restore interval with no intervening query. Removing one owner leaves
the companion's identical action ID usable. Removal and reclamation restore the
original active-module count and free pool bytes for each layout.

Four original ABI 10 package identities and their controller digests match
independent Python hashlib vectors on both host and ColdFire. Each layout also
refuses eight altered full-owner fields, including both digests. The generated
expected-digest header is verified against its generator before compilation.
No package bytes or stock data are stored in that header.

All SDK compilation dependencies and the recorded code-generation guard match
exact commit pins. The target links without unresolved helpers. Original bounded
byte-copy/clear helpers satisfy compiler-generated memory operations only inside
this fixture; no production loader source was changed. Its BSS starts at
`0x47400000` and spans 812,048 bytes in separate synthetic
RAM, away from the runner's code and stack. This includes the test's loader pool,
ledger and state; it is not Beat Slicer's installed resource cost.

Machine stopped-state, locks/masks, task reachability, cache maintenance/aliases
and DSP services are synthetic. In particular, the cached branch uses an identity
alias and does not qualify real caches. The machine reports no consumers in
uploaded memory; that is not an Octatrack reference-retirement implementation.
Menu detachment is acknowledged only in a model with no stock references. The
authored packages have no executable hooks and uploaded module code never runs.
No stock firmware, menu scheduling, USB traffic, module-set trial/Keep/Undo,
physical timing or audio is exercised. Production typed admission, transition
hooks, live source ownership, Apply/playback, packages and hardware remain open.

Current-upstream full source validation: Check passed in 136.07s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The unchanged real SDK loader and owner adapter pass host and ColdFire execution with synthetic machine services. Production stock-menu and USB integration remain unqualified.

Three actual-loader integration reports bind exact source commit `c65edade167b9eedff37c40e117b2a4912cbe8b1`.


## Whole-set menu-owner transactions (0.1.35)

The isolated real-loader fixture now also executes the unchanged SDK upload
controller and module-set backend. Six host configurations pass with ASan/UBSan;
the two set-enabled configurations each run four additional scenarios. Separate
cached and uncached ColdFire set builds run the same four scenarios with 128
module positions and a 768 KiB pool. Exact SDK compilation dependencies and the
code-generation guard remain pinned. Stack and preserved registers return intact.

Each scenario installs three original hook-free packages. A two-row transaction
replaces the first owner and removes the second, leaving the third unchanged.
Disconnect is exercised before publication, after the first row and after both
rows (including return to the running-trial phase); complete-set acceptance is
checked separately. Acceptance before complete publication is refused. Every
rollback restores the baseline active identity.

The fixture explicitly retires both changing owners before publication. It
checks retained-but-unpublished predecessors at each boundary, refuses both old
menu activations after restoration or acceptance, and keeps the unchanged
companion callable throughout. Fresh admission is required for a restored or
kept owner. Final removals reclaim the original free pool bytes and leave no
active module or set transaction.

This executes actual controller/set-backend code, not USB traffic. Synthetic
stopped-state, locks, cache aliases/maintenance, empty paused-task reachability
and DSP services retain the earlier limits. Retirement calls are test-side, not
installed production hooks. No uploaded module hooks, stock menu, self-test,
physical disconnect, audio, persistence or browser-built package is qualified.

Current-upstream full source validation: Check passed in 133.23s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. The unchanged real SDK loader/upload controller and owner adapter pass host and ColdFire whole-set transitions with synthetic machine services. Production stock-menu and USB integration remain unqualified.

Three actual-loader integration reports bind exact source commit `8659d8652775a221117801396e31f8072d24a154`.


## Recorder-stop follow-ups and compiled worker exclusion (0.1.36)

The new isolated stock runner passes 32 stop/follow-up scenarios with the host
admission observer, then the same 32 with the actual compiled worker-boundary
prototype substituted at the engine queue-receive call. The private MAIN hash
remains the original 1.40C input. Both runs also execute 16 original recorder
positive controls covering preallocated/lazy allocation and PCM stores. Exact
runner/helper/source hashes are bound separately from the compiled target and
its code-generation guard. The imported emulator/SDK sources are unchanged.

The matrix covers tracks 1/8, both state banks and both packed stereo widths.
Two allocation-shortage scenarios produce one queued cleanup and a separate UI
notification without writing PCM from that recorder call. Two length-limit
scenarios write their final four/two frames before stopping and queue cleanup
without that shortage notification. Per-track command records carry opcode 34
and their track index; they are not a shared track-mask record.

Worker startup performs no watched map writes. The subsequent command stores
zero through the recorder-map tail beyond its one/two allocated entries: 14,601
or 14,600 stores while the queue count is already zero. The tail was zero before
cleanup, so write observations and byte comparisons are checked independently.
Full post-stop PCM, map, sample-control, allocation-count, recorder-state-bank
and free-cursor regions remain byte-identical. The follow-up adds no PCM,
dirty-byte or slot-counter stores. The stock UI notification remains queued;
its consumer is not run. Worker loop stack/frame and caller mask are preserved.

In the compiled-observer run, every map store requires the actual native guard
ticket. That ticket remains active at return to the loop, then ends on the next
receive before the empty-queue event wait. The wait is unmasked. The original
host guard remains an independent recorder/fixture observer; it is not counted
as native execution. Fixture construction of a distinct free page is guarded
and counted separately from the recording/worker observations.

No scheduler, audio ISR, UI consumer, real cache behavior or device runs. Active
recorder state, silent inputs, partial allocation geometry and source ownership
are synthetic. Manual stopping, Pickup/overdub, other finalization paths and
complete shared-pool ownership remain open. The observer is privately injected,
not an admitted base service. Source-built USB packages, native Apply/playback,
audio and physical persistence remain unqualified.

Current-upstream full source validation: Check passed in 135.43s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. Isolated recorder-stop and compiled worker-observer executions pass under synthetic active state. Production stock-menu and USB integration remain unqualified.

Two recorder-stop integration reports bind exact source commit `e3f171d8caa01aeca6438e8205419bfad2dbbfff`.


## Two pending recorder stop records (0.1.37)

Both isolated host-observed and compiled-observer runs now retain 32 individual
stop/follow-up scenarios and 16 recording positive controls, plus four paired
scenarios: both stereo widths times both state banks. Each paired case stops
tracks 1 and 8 in two complete recorder calls before running the worker.
Distinct synthetic owned pages and separate queued per-track records are
verified. These are serialized calls, not simultaneous audio ISR execution.

FIFO execution writes only the current recorder's unused map tail: 14,601
stores per command, with one pending command during the first and none during
the second. The full post-stop PCM/map/control/count/state/free-cursor regions
remain byte-identical, and both shortage UI notifications stay queued. Loop
stack/frame and caller mask remain intact.

Every native-observed store requires the current compiled guard ticket. The
second command must receive a newer ticket and revision; the final empty receive
retires it before an unmasked event wait. The host observer remains independent.
No production hook, scheduler, ISR, UI consumer, live allocator ownership,
manual stop/overdub, USB, native Apply/playback or hardware is qualified.

Current-upstream full source validation: Check passed in 135.40s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. Isolated recorder-stop and compiled worker-observer executions pass under synthetic active state. Production stock-menu and USB integration remain unqualified.

Two recorder-stop integration reports bind exact source commit `9eccbb0cc5f2a3607f593e4731bd3673d2e2dac7`.


### Reporting clarification for 0.1.37

The shared paired-recorder success line now describes only identity, map and
preservation checks executed in both modes. Native guard/wait checks are named
separately by the compiled-observer run; the host run names its host observer.
No assertion or recorder behavior changed. Both modes were rebuilt and rerun
with 32 single-recorder cases, four paired cases and 16 recording positive
controls. Earlier reports remain bound to their historical source; the new
reports retain the corrected output and their own exact source revision.

Current-upstream full source validation: Check passed in 131.44s. The required origin/main invocation retains the inherited CHANGELOG.md history failure. Isolated recorder-stop and compiled worker-observer executions pass under synthetic active state. Production stock-menu and USB integration remain unqualified.

Two recorder-stop integration reports bind exact source commit `66ec0116a5ea4b7ed6ec83659493366a249edce8`.

## Typed menu contribution proposal (0.1.38)

The new `menu_package.c` decoder validates one copied 64-byte descriptor from
an exact currently published loader owner. It bounds initialized-image access,
entry alignment and descriptor overlap; refuses unknown schema/size/reserved
fields and malformed labels; and freezes admitted metadata in base-owned
storage. Neither its proposed record layout nor its table/event is released.

The actual-loader host suite passes six configurations with address/undefined
sanitizers: default and cached branches, default and 128-position/768 KiB pools,
and two whole-set variants. Each configuration retains the earlier two-owner,
both-layout and loader rollback checks. New cases run both six-row and nine-row
menu models, with 30 malformed descriptors, eight forged owner fields and four
legal entry/label boundary cases per layout. Failure output preservation,
staged-owner refusal, one-time binding, copied-label lifetime, wrong-action
refusal, replacement/restore retirement and final allocation recovery pass.

Native executions use the real unchanged SDK loader/SHA and upload controller,
128 positions and a 768 KiB pool, with whole-set support in both cached and
uncached branches. A four-byte original return-42 callback is reconstructed in
the module pool, resolved through the admitted binding and actually called
through the owner-backed menu model, once per layout. The host run only models
that dispatch. An independent hashlib oracle checks the new package/controller
identity before mutation tests, alongside the four retained owner-test vectors.
The fixture preserves the loader-populated image preamble when resetting data.

This is stock-free isolated CPU execution, not the stock popup, USB transport or
Beat Slicer planner running in an installed package. Machine locks, cache flush,
stopped state, paused-task reachability and DSP services are synthetic. Metadata
is stable during the bounded copy by fixture construction; the native boundary
that would exclude real-time module writers is not implemented. Full-set
readiness, production typed admission, pre-transition retirement hooks, retained
native references, source ownership, Apply/playback and hardware remain open.

Three typed-contribution reports bind source commit `0411151155c2364a63e1d16beba2253ea961969a`. Current-upstream full validation passed in 143.06 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

The compiled decoder object contains 872 text bytes and no static data/BSS. GCC reports 136 bytes of bounded local stack for binding, 12 for view and 8 for entry resolution. These are per-function figures, not complete call-chain storage or physical latency qualification.

## Recorder bank and normal-panel transitions (0.1.39)

The stock full-boot driver uses normal TRACK + REC1 start/retrigger and STOP on
tracks 1 and 8, with the scheduler and both DSPs running. In the original
ONE/MAX, 16-bit stereo fixture, each recorder has 460 preallocated pages. It
checks both bank selections, advancing selected positions, retained old-bank
positions and a quiet interval after STOP. Full unrelated Flex PCM and
controls/settings, allocation counts and first recorder pages remain intact;
the private card is not saved or written back.

The pending state is published by an overlapping four-byte write, followed by
the active-byte store. Each track's two starts and stop produce the state
sequence `(bank 1, 1) → (1, 2) → (0, 1) → (0, 2) → (0, 0)`. The old bank stays
`2` after STOP without advancing. The driver decodes the state byte inside each
store's full big-endian extent; filtering only the store's starting address
would miss both pending publications. Calls enter from both stock frame
dispatch returns; separate PCM-prefix and map-tail watches provide positive
write observations. The first recorder owns physical page 14,602, valid in the
14,603-page physical arena: usable count and exclusive physical bound differ.

The isolated CPU runner covers 48 two-bank starting states and 16 delayed
follow-up calls with the complete stock recorder routine and real callees.
There are no mocked stock calls. Both packed stereo widths, tracks 1/8 and
both bank selections run with synthetic allocation/input/state and a host-side
guard. It checks exact PCM in the initial cases, including untouched regions,
pending delay/state/position transitions, map/dirty/counter preservation and
callee-save/stack behavior inherited from the original recorder runner. The
pending follow-ups reach delay zero before starting; retained inactive state
alone performs no PCM write.

These are separate experiments: the full boot does not run the host guard,
and the isolated runner does not run the real scheduler or audio interrupt.
They install no production recorder boundary and establish neither all writer
coverage nor a native source lease. Pickup/overdub, long dynamic growth,
interrupt/cache/physical latency, USB, audible behavior and persistence remain
unqualified. The typed-menu and earlier recorder evidence remains historical
and source-bound; no prior report is relabeled as the new test.

Two recorder-bank reports bind source commit `034701491d876f54ccfda11ed6164771485073dd`. Current-upstream full validation passed in 141.28 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Compiled recorder entry/return boundary (0.1.40)

The private prototype described in [RECORDER_BOUNDARY.md](RECORDER_BOUNDARY.md)
passes 72 host sanitizer bank/track cases, nested independent writers and 13
terminal fault families. The portable self-test also runs on the native target.
The actual-stock runner passes 896 original/compiled-guard pairs across tracks
1/8, both stereo widths and banks, 14 bank/allocation scenarios, four incoming
SR patterns and both normal and faulted observers. All data/address registers,
SP/SR at both continuations and return, caller arguments and ordered external
stores match. Native guard tickets cover source mutations; two exact idle
voice-flag clears remain in the full write comparison without invalidating
previews. Private and lower-stack canaries remain intact.

The observer adds at most 231 executed instructions in these cases, 168 on
inactive/retained-bank calls. The largest observed observer-only masked run is
113 executed instructions for callers below level 7. These are instruction
counts, not cycles, physical interrupt latency or acceptable audio headroom.
The portable boundary object is 554 text bytes with no static data/BSS; its
reported local stack is 24 bytes for enter and 32 for leave. The wrapper,
fixture storage and complete stock call chain are additional costs.

The full-boot panel report from 0.1.39 remains a separate uninstrumented run.
This milestone does not compose recorder and engine lifetimes in a live boot,
install production hooks, admit a live source, or qualify Pickup/overdub,
cache/interrupt timing, USB, playback or hardware. Replay bytes and binaries
remain private; the conservative interior-target scan is not a complete
control-flow or indirect-target proof.

Two recorder-boundary reports bind source commit `a3cd85dabb842e5f23199df31c7602281d06bbc7`. Peak observed stack below the original caller SP is 176 bytes for stock and 260 bytes for the guarded isolated calls, not a complete ISR/task stack budget. Current-upstream validation passed in 142.59 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Shared recorder/engine guard in a full boot (0.1.41)

The private source-built composition uses one guard for recorder execution and
the existing base-owned engine idle/job sites. The original queue receive call
is unchanged. Normal panel start/retrigger/STOP passes on tracks 1 and 8, with
32 watched PCM-prefix stores per track under the recorder's own ticket and
three map-tail stores under the engine's own ticket. Native entry/return counts
balance at quiescent checkpoints. The old inactive bank remains 2; a 500 ms idle
interval has no watched PCM/map stores or recorder scopes. Prepared Flex PCM,
all controls/settings, allocation counts, code/canaries and the card remain
intact. Both DSPs and the real emulator scheduler run.

Twenty-four preparation stores per track remain unguarded: 12 actual store PCs
executed on both starts, including the longword pending-state publications.
The corresponding active and Stop state transitions hold recorder tickets.
These are positive gap observations, not a complete source-exclusion pass.
The production reader remains disabled. The native fixture has explicit
synthetic enablement only after a real engine job/idle pair and no live scopes.

The initial empty Static binding queues no waveform job on AED opening. The
fixture's known Flex assignment/SELECT ALL preparation obtains a real engine
boundary and changes exactly settings word 271 from 0 to 44,100; PCM and
controls remain equal. The full prepared settings are then preserved during
recording. Merely observing empty queues or faking an idle flag is not accepted.

This experiment reserves eight audio pages and binds the SDK codegen helper
and stock engine guards to an exact SDK commit. It does not publish a base,
module package or reader API, qualify all recorder/Pickup paths, or establish
physical timing, DMA/cache ownership, USB, audio quality or persistence.

Two composition reports bind source commit `d65c0cf4528d7a2ed316d0fdd14224c196783dee`. Current-upstream validation passed in 137.89 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

Both preparation calls per track return to the stock frame dispatcher at `0x4000d35c`, with observed command words `0x9010` and `0x1010`. The Stop helper returns to `0x40007942` inside the guarded recorder body; its state clear holds the recorder ticket. These are named fixture observations, not a released calling convention.

## Complete preparation scope (0.1.42)

Host sanitizers pass 72 bank/track cases, eight preparation scopes with nested
recorder activity, eight nested scopes with an independent writer and 14 fault
families. ColdFire pairs 192 original/guarded preparation calls and retains all
896 recorder comparisons. All D/A registers, SP/SR, caller arguments and ordered
external writes match at the checked continuations and return, with intact
stack/private canaries. Preparation publishes the expected pending bank and
queued cleanup record; no PCM/map write is invented by the fixture.

The native preparation wrapper adds at most 217 executed instructions, with a
95-instruction maximum observed observer-only masked run. The recorder wrapper,
including saved-SR diagnostic counters, adds at most 257 (194 idle), with a
134-instruction maximum masked run. Peak isolated stack is 72/176 bytes for
stock/guarded preparation and 176/260 for stock/guarded recorder. These are
fixture instruction/stack observations, not physical latency or whole-ISR cost.

Normal-panel start/retrigger/STOP full boots pass on tracks 1/8 with zero
uncovered watched recorder-bank stores, 32 PCM-prefix and three map-tail stores
per track under their corresponding native tickets, and all five state changes
guarded. Exactly two preparation scopes occur per track. Saved caller mask is
level 5 at both entry/return for preparation and recorder callbacks. Prepared
Flex data/settings/controls, code/canaries, receive call and unsaved card remain
intact. Ordinary preallocated ONE/MAX is the tested mode. No production source
reader, Pickup/overdub, complete writer/cache ownership, USB or hardware result
is established.

Four preparation/composition reports bind source commit `d6bfe235501e16cc421a8deddd84c6ba3a621535`. Current-upstream full validation passed in 138.07 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Preview invalidation during ordinary recording (0.1.43)

The source-built private fixture composes Flex metadata/copy/session code with
the same recorder, preparation and engine guard. Before recording, the test
checks that the captured revision is still current. Track 1 interrupts RUNNING
work after a positive PCM copy; track 8 interrupts a READY plan. Both refuse
result output and become STALE before another lookup. Stop does not revive the
old token. T8's normal TRACK+REC selection changes the editor to empty Static
slot 7; normal T1 selection restores Flex slot 0, and the old token still refuses.

Four complete fresh SAMPLE/SMOOTH/one-beat previews match all 131 plan words
from the host PCM oracle. Each takes 78 bounded work calls and 12 stock lookups,
returns five markers at captured BPM24 2,886, and balances source locks. Existing
markers are included. Source PCM, controls/settings, native code/canaries, the
stock receive call and unsaved card remain intact. The earlier native ticket,
state-transition, preparation and idle assertions remain enabled on both tracks.

The binary through BSS occupies 20,880 bytes inside the explicit eight-page
reservation; this excludes runtime stack and is not an installed module budget.
All new borrowed-main entries have zero arguments. The pinned emulator's
`callAsMain` pushes supplied arguments but does not perform the caller's cleanup,
so repeated argument-bearing calls need a balanced native wrapper. These tests
use no driver register/PC repair or replay after uncertain execution.

The preparation routine takes two arguments: track and command word. Its stock
caller removes eight bytes. The older 0.1.41/0.1.42 reports' four-word `arguments`
field also captured two adjacent caller-frame words; those values are not ABI
arguments. The new report separates them and stops asserting incidental stack
contents. Historical source-bound reports remain unchanged.

This is one borrowed-main consumer with fixed synthetic source/owner lifetimes.
The coarse guard deliberately invalidates previews of an unrelated Flex sample
when another track records. It is not a production source API or a background
service, and it does not qualify other recording modes, complete UI/allocator/
DMA/cache ownership, USB, Apply/playback or physical behavior.

Two source-composition reports bind source commit `fee30608d51c0c41d454197133e5392a8347af8d`. Current-upstream full validation passed in 140.30 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Engine-owned shared-guard previews (0.1.44)

The private composition now advances previews only from the stock engine
idle/job topology. The borrowed-main API copies requests and results; the driver
never calls the service or a session step. Memory-watch task identities place
all source lookups on the engine task, distinct from the producer. Five complete
131-word plans match the host PCM oracle, with 12 lookups each. READY results
retire on normal track 1/8 recording; Stop and normal editor restoration do not
revive them, and fresh requests recover.

The observed totals are 402 engine callbacks, 390 bounded work calls, five
begins and 390 posted/consumed wakes, with none pending at completion. Maximum
work calls per callback is one; each work call allows eight private reader
transitions and at most one PCM copy, plus optional begin/setup and publication.
Each finished plan was visible at the first driver poll after a 1 ms emulator
run; that polling interval is not a measured physical completion time.

Only the exact immutable owned wake with an outstanding pending flag bypasses
writer classification. All ordinary jobs remain conservative, including stock
waveform jobs. The source fixture does not enable the older private waveform
exception. Prepared PCM/settings/controls, recorder ticket assertions, code,
reservation canaries, original queue receive and the unsaved card remain intact.
Code through BSS occupies 36,848 bytes of the eight-page private reservation;
runtime stack and physical callback/interrupt latency are unqualified.

This is fixed synthetic ownership with a borrowed-main producer and one actual
engine consumer. It supplies no production source API, module menu integration,
loader retirement, package/browser/USB lifecycle, complete writer/cache coverage,
audible behavior or device persistence.

Two engine-service reports bind source commit `2217522f3fa20d4224a82c4f7d3aec6ee6afdf9b`. Current-upstream full validation passed in 139.37 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Native engine-service cancellation and retirement (0.1.45)

The full boot queues two distinct immutable records with identical four-byte
payloads, foreign first, while the owned wake is pending. An in-lock diagnostic
captures exactly two job decisions: foreign/ordinary with pending=1, then
owned/consumed with pending=1. The foreign command advances the writer revision
and retires READY without another PCM read or modifying the last copied output.
This tests actual queue order and pending identity, not only opcode equality.

An independent synthetic writer then blocks acquisition. The requested preview
stays WAITING for 200 emulated milliseconds without additional self-posted wakes
or PCM reads. Cancellation receives a fresh sequence; retiring that writer and
waking the engine does not revive cancelled work. A new request succeeds. After
fixed-owner revocation, result copying and new requests refuse, with no further
PCM reads or output changes over another 200 emulated milliseconds. No callback
storage is freed, and this is not a loader-removal or USB-disconnect test.

Seven complete plans match the host PCM oracle. The final totals are 564 engine
callbacks, 546 bounded work calls, eight begins (including blocked acquisition),
551 posted/consumed owned wakes and none pending. Watched lookups remain solely
on the engine task. Normal track 1/8 recording guards, prepared source/settings,
code/canaries, original receive call and unsaved card checks remain enabled.
Fixed lifetimes, complete writer/cache ownership, production API/UI/USB lifecycle,
physical latency, audio and device persistence remain unqualified.

Two lifecycle reports bind source commit `2eb5b64406fb6368459bd8c4d7dd0cb56b3ab0d9`. Current-upstream full validation passed in 138.34 seconds (2,529 app tests; 37 SDK tests, one skipped). The required origin/main invocation retains the inherited CHANGELOG.md history failure.

## Resident menus with recorder exclusion (0.1.46)

`recorder_resident_native.py` links the existing immutable menu/selection/UI
fixtures with the complete preparation and recorder scopes. Engine hooks use
the same SR-preserving 64-byte entry frame and extract the original queued
record from saved A2. All three observers share one guard. No production event,
source lease or module package is assigned by this test.

Both six- and nine-row layouts complete an oracle preview, then use the normal
TRACK + REC1 chord. Stock closes the popup and returns to the playback page;
the preview cancels without another PCM read. Stop does not revive the request
or reopen the popup. Normal AED/SLICE navigation and a fresh Beat Grid opening
complete another whole-plan oracle comparison. Watched recorder PCM-prefix
stores and deferred map-tail stores carry their respective native writer
tickets. The prepared source/settings, code, reservation canaries and unsaved
card stay unchanged. Existing one-use selection, late-callback refusal,
stock-grid popup/cancel, task identity and main-stack assertions remain enabled.
The recording scenario does not exercise WAITING; its legacy report field
`waitingOneServicePerTick` must not be read as evidence that WAITING was reached.
Per-tick and per-engine work maxima are reported separately.

Positive UI runs use the older explicitly private fixed-input waveform-read
classification. They do not establish mutable queued-record lifetime. A
separate run with that exception disabled treats waveform work as a writer,
shows PREVIEW UNAVAILABLE / SOURCE CHANGED and performs no further PCM reads.

The combined fixture occupies 49,000 bytes through BSS, leaving 104 bytes after
the 32-byte trailing canary in the same eight-page reservation. This excludes
stack. Its async-only build omits the unused direct-result buffer/function;
normal direct-source and async intermediate objects were byte-identical to
those before the optional macro. This tight private fixture is not a production
memory or compatibility budget. Complete writer/cache ownership, replaceable
menu lifetime, physical timing, audio, Apply and source-built USB remain open.

The four retained 0.1.46 compile/UI reports bind source `95bf7deacbcfc96533c60e849fbafd54b6248552`. The full current-upstream source check passed in 140.49 seconds; the inherited stale-fork changelog failure remains recorded separately.

## Source-mask instruction measurements (0.1.47)

`boot_recorder_engine.py --profile-locks` watches the original own-code
instruction before full masking and the exact instruction restoring saved SR.
It checks their compiled shapes, pairs every interval, verifies matching saved
caller SR and reconciles all windows against native lock/unlock counters. PC
counters precede execution, so the difference plus one includes both mask and
restore instructions. No profiling callbacks are inserted in the native code.

The first engine preview produced 251 balanced windows and
12 PCM lookups. All observed caller interrupt masks were zero.

| Protected work | Windows | Minimum instructions | Maximum instructions |
| --- | ---: | ---: | ---: |
| coordination | 159 | 55 | 414 |
| capture | 80 | 1061 | 1861 |
| copy | 12 | 2882 | 3255 |

Coordination windows contain no metadata capture: the asynchronous request,
state and copied-result paths use the same backend lock. Metadata-only windows
capture once; PCM-copy windows capture both before and after the bounded copy.
The latter include stock pool lookup. Counts are specific to this driver and
one-second stereo 16-bit stopped Flex source; they are not cycle measurements,
physical interrupt latency, cache/ISR costs or a worst-case metadata workload.
The complete fixed-lifetime recording/recovery run still passes five whole-plan
oracle comparisons, engine-only PCM lookup and source/card/code preservation.
No production source admission or USB package is enabled.

The two retained 0.1.47 compile/profile reports bind source `a38ca2601335abe5339e7ff8416700ad26c5c28e`. The full current-upstream source check passed in 133.94 seconds; the inherited stale-fork changelog failure remains recorded separately.

## Full 64-marker source-mask workload (0.1.48)

`boot_recorder_engine.py --profile-markers 64` creates a 64-slice grid through
normal stock SLICE-menu input before enabling the private reader. Preparation
may change marker records/count and SELECT ALL's known selection endpoint;
all other settings and the authored PCM remain unchanged. No marker-memory
poke or card save supplies the workload.

The bounded checkpoint now waits for both empty writer scopes and balanced
entry/exit diagnostics. An emulator pause can occur after the entry counter
increments but before scope publication, or during the matching return. An
empty scope alone is not a complete diagnostic checkpoint. Observer faults
still fail immediately; persistent imbalance still fails the 200 × 0.1 ms
emulated wait bound. This run records 1 such observation
and a maximum of 1 retry at a checkpoint; the report retains the totals.

A zero-argument native producer requests EXACT boundaries at 64-beat spacing.
That spacing exceeds the one-second source, retaining all 64 stock starts
without adding a start beyond capacity. This targets full metadata validation
and existing-boundary checks, not a worst-case SMOOTH scan. Five complete plans
match the independent host PCM oracle, retaining all 64 starts through normal
track 1/8 recording, Stop and editor restoration. Prepared settings/PCM, native
code/canaries and the unsaved card remain unchanged.

The first preview has 268 balanced mask/restore windows and
65 PCM lookups. Captured/restored caller interrupt masks
are zero. The same original-instruction measurement method as 0.1.47 gives:

| Protected work | Windows | Minimum instructions | Maximum instructions |
| --- | ---: | ---: | ---: |
| coordination | 135 | 55 | 414 |
| capture | 68 | 1061 | 2761 |
| copy | 65 | 4682 | 5055 |

This establishes the observed full-marker cost on the named stereo 16-bit
fixture. It does not establish all-format or allocation-layout maxima,
physical lock latency, cycles, cache behavior, ISR stack or production source
admission. Full metadata count is one dimension of the remaining budget.

The resident UI driver now emits `waitingOneServicePerTick=false` for recording
scenarios, which exercise dismissal/cancellation rather than WAITING. Existing
0.1.46 reports remain unchanged at their exact original source. Their legacy
flag must be interpreted with the qualification above; no old native run is
relabelled as a new execution.

The two retained 0.1.48 compile/profile reports bind source `8efd17400916b23203d53c99e80593e84bd96b63`. The full current-upstream source check passed in 140.04 seconds; the inherited stale-fork changelog failure remains recorded separately.

## Complete-table copy optimization (0.1.49)

The metadata helper copies two complete records per loop. Every capture still reads all 64 records, including inactive rows, in its original volatile order. No record count, snapshot field or preservation rule is omitted. The existing ASan/UBSan host suite passes 1,536 full captures, 39 paired refusals, null outputs, 40 session transitions and both inactive-record candidate refusals.

Matched native service runs change only `flex_metadata.c` in their recorded source inputs; stock image, card, WAV, emulator, compiler and flags stay matched. Each workload retains five full oracle-matching plans and track 1/8 recording invalidation/recovery. These are executed instruction counts for the same observed protected intervals, not cycles or physical time.

| Workload | Protected work | Previous maximum | New maximum | Instructions saved |
| --- | --- | ---: | ---: | ---: |
| 4 markers | capture | 1861 | 1669 | 192 |
| 4 markers | copy | 3255 | 2871 | 384 |
| 64 markers | capture | 2761 | 2569 | 192 |
| 64 markers | copy | 5055 | 4671 | 384 |

The combined resident fixture occupies 49,068 bytes through BSS, leaving 36 bytes after its 32-byte canary in the unchanged eight-page reservation; this excludes stack. Both stock layouts retain two complete previews, ordinary recording dismissal/cancellation, guarded watched writes, fresh preview after Stop/reopening, and unchanged source/settings/card/code. The positive UI runs still use the explicit private fixed-input waveform-read exception. The conservative run uses no exception and refuses stale source output.

The resident driver now uses the same bounded empty-scope plus balanced counter/mask checkpoint as the service driver. Faults still fail immediately, and persistent diagnostic imbalance still fails the fixed wait bound. This observer correction grants no native retirement or source admission. Production ownership, mutable queued-command stability, cache behavior, USB delivery, audio and physical persistence remain unqualified.

The eight optimized 0.1.49 reports bind source `2c3d4cf9a1049d3699d8f3a9e652d325781c4f72`; the matched common-workload baseline binds unchanged source `8efd17400916b23203d53c99e80593e84bd96b63`. The full current-upstream source check passed in 137.15 seconds; the inherited stale-fork changelog failure remains recorded separately.

## Retirement from the existing loader callback (0.1.50)

`test_menu_owner_loader.py --transition` composes the proposed
`bs_menu_owner_backend_transition_locked` with the unchanged real loader's
`modwerk_machine_metadata_admit` callback. The fixture preserves ordinary-only
metadata admission and asserts the stable lock, unmasked admission phase and
outgoing owner's publication while the callback runs. This is an isolated
machine adapter, not registration in the production Octatrack board.

PREPARE leaves activations intact. SWITCH retires only the exact outgoing
owner's bound leases before publication can change. The adapter validates all
registry entries before mutation and uses full ledger checks; short
module/generation matching alone is insufficient. Duplicate actions sharing
one lease retire that lease together. A same-image transition does nothing.

Four single-module scenarios cover both stock row counts and successful or
refused publication. Replacement and restoration occur without an intervening
menu/lease query. The old action stays retired, the companion still dispatches,
and a fresh activation can dispatch the restored owner. A later admission
refusal leaves the old image published but its previous activation retired:
this conservative cancellation is intentional, and requires a fresh activation.
Removal retires the fresh lease before reclamation. Each scenario also checks
nine malformed-input refusals and unchanged activation state for preparation
and same-image operations.

Four whole-set scenarios disconnect before any publication, after one row or
a complete trial, or Keep the complete set. Actual upload/loader callbacks
retire only owners whose rows transition; unchanged rows and the third
companion retain authority. Rollback cannot revive the affected activations,
even without an intermediate dispatch/lease lookup. Allocation returns to its
initial value after cleanup. The older loader/menu/typed-independent-vector
checks remain in the exercised compilation path.

Host ASan/UBSan passes six loader configurations, including two with set support.
The exact source also compiles and runs on the pinned ColdFire CPU runner with
set support in both cached and uncached branches. Native entry wrappers,
freestanding linking, code-generation checks and exact SDK dependency hashes
pass. Machine stop/cache/paused-task/DSP services remain synthetic; these new
scenarios do not execute the stock menu or uploaded callback code and do not
qualify physical cache, timing, USB or reference reclamation.

This callback prototype revokes menu authority only. Native registry wiring,
source-reader cancellation, complete-set readiness and retained menu/job storage
retirement remain separate requirements. The production shared loader and its
machine adapter are unchanged; no editor event/table ABI is assigned.

The three retained 0.1.50 callback-retirement reports bind source `878fda00b94917ba5100fff2d5bd5dd31e6079eb`. The full current-upstream source check passed in 136.81 seconds; the inherited stale-fork changelog failure remains recorded separately.

## Preview cancellation at owner transitions (0.1.51)

`test_menu_owner_loader.py --preview-owner` composes the proposed
`bs_preview_owner_transition_locked` with the real loader metadata callback,
before menu activation retirement and publication. It uses the exchange's
ordinary nonblocking revoke API. PREPARE and same-image switches preserve work;
a failed source lock refuses publication. If a later exchange refuses after an
earlier one was cancelled, the module stays published and the cancelled
activation requires a fresh exchange. No engine-owned session is modified by
the loader callback, and cancellation performs no PCM capture/copy.

Eighteen single-owner scenarios combine RUNNING, WAITING and READY states with
replacement/removal and successful, first-lock-refused or partially-cancelled
publication. Replacement and restoration have no intervening preview/lease
query. Retired requests cannot read or publish again; refused result calls leave
the caller's output untouched. The companion and a fresh activation each match
the complete independent planner oracle. Nine malformed-input cases per single
scenario check count, pointers, duplicate exchange and full-owner identity.
Storage remains pinned; fresh exchanges use separate objects.

Four whole-set scenarios disconnect before publication, after one row or after
a complete trial, or Keep the complete set. A READY, WAITING and RUNNING exchange
coexist. Only affected owners are cancelled; untouched exchanges finish and
match complete oracles. Rollback cannot revive cancelled output, even without
polling between publication and restoration. Cancellation leaves source-query
counts unchanged; final cleanup restores allocation and balances locks.

The retained host ASan/UBSan report covers six loader configurations, including
two set variants. Both cached and uncached ColdFire set builds pass the same
scenarios, freestanding link and code-generation checks with exact SDK hashes.
The combined test initially exceeded the CPU runner's 64 KiB code window.
Function/data sections and linker garbage collection discard unused fixture
functions only in `--preview-owner` mode; the runner's bounds remain intact.
The passing uncached/cached images are 60,786/60,832 bytes. These are isolated
CPU fixtures, not production memory budgets.

PCM, source locks, cache and paused-task services are synthetic. Production
pointer/handle admission, independent module packages, complete writer/cache
coverage and native reference retirement remain absent. Module-specific planner
or controller code must stay in its package rather than be built into the base.
No stock source, USB, audible output or physical persistence is qualified here.

The three retained 0.1.51 reports bind source `5ff97af6850b0c81da18c574f4fe18d67f84bca0`. Their source/SDK hashes, native object hashes and runner identity were checked before retention. The current-upstream source check passed in 139.74 seconds; the inherited stale-fork changelog failure remains recorded separately.

## First USB device-test candidate (0.1.52)

`build_usb_probe.py` builds a separate private diagnostic package on the existing
base tick/draw hooks. It runs two fixed-input requests through the actual planner:
SAMPLE 120 BPM gives five starts and PROJECT 60 BPM gives three, retaining the
original 1,000-frame start. Generated silence gives no fade warnings. It exposes
no source/editor/recording hooks, stock patch, DSP payload or key/encoder claim.
The first tick performs the bounded fixed work once; later ticks only publish
its diagnostic result. The frame hook displays the result within 1,024 bytes.

Host ASan/UBSan passes success and injected first/second planner-failure cases,
checking one-shot work and guarded display storage. The exact 2,280-byte package
also passes two real-loader ColdFire install/Undo/reinstall cycles while retaining
a companion, invoking its relocated tick/draw code and restoring allocation.
The saved package SHA-256 is
`f5432b875899a2262ddb17af3c34120bac58b52ec4f58a6d858687564fcb8328`.
The SDK scanner finds no 16-byte high-entropy stock runs in the complete package
against pinned 1.40C MAIN and its three reversed 24-bit alignments. Source-built
frontend validation accepts this exact package and prepares its removal Undo;
the planning capabilities/base identity in that check are hypothetical.

The [private device client](USB_TEST.md) uses the standard frontend validator,
OctatrackLink, actual physical self-test and Undo. Review is read-only and expires
in 60 seconds. Trial requires unchanged package/source/SDK hashes, frontend Git
revision, base, active identity and inventory. It refuses an existing probe,
requires an observed passed self-test and planner PASS diagnostic, then Undoes
and verifies the baseline. It never Keeps. The general MCP package allowlist is
unchanged; MCP supplies read-only preflight for this unlisted diagnostic.

Preparation results do not qualify USB, display, audio or persistence. The first
read-only MCP attempt found a disconnected unit; physical results are recorded
only after an actual authorized trial. Live Flex preview, production handles,
Apply and finished module delivery remain separate work.

## Physical failure and CPU-target correction (0.1.52 / 0.1.53)

The authorized 0.1.52 private package on the contributor's MKII, Modwerk base
`cd39c494b63beae086271f8790f7e704f46fe0a617a8eb1c341c9a925f917e4e`,
lost USB during trial. The contributor observed a restart. The bounded USB diagnostic
log records crash count 1, vector 3 at `0x40d52f64`. Its cached/uncached code
matches; that position uniquely maps to image offset `0x84` in this exact
package, a scale-eight indexed LEA in `text`. No firmware bytes or raw crash
record are retained in Git.

The builder incorrectly replaced the SDK's `-mcpu=54455` with `-mcpu=5475`.
[NXP's MCF54455 reference manual, section 3.3.4.2](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)
specifies an address error for scale-eight or word-sized indexed addressing.
The emulator accepted the compiled instruction; this did not establish target
ISA compatibility. The SDK target produces a different address calculation.
The 0.1.53 builder retains SDK flags and rejects these forbidden index modes;
the trial client also rejects the exact failed package hash.

Read-only recovery checks verified the original base, active identity and exact
11-module inventory after the restart, with the probe absent. This is restart
recovery, not successful trial Undo. No passed physical self-test, display result,
Keep or persistence is claimed. The failed artifact remains private and marked
REJECTED. No further package has been sent; corrected-candidate hardware results
remain pending a fresh explicit trial authorization.

The corrected 0.1.53 preparation produces a 2,288-byte package with SHA-256
`3f62f662f5eca55a8b6bc48301810feb5d5d9b17fc05d41ad3b380a97b3c5d35`.
The native compiler regression rebuilds the same probe for both targets: the
new addressing guard rejects the MCF5475 object and accepts the SDK MCF54455
object. The corrected exact package passes real-loader CPU install/Undo/reinstall
and the complete stock-free scan. These remain offline results, not a hardware
fix verification.

Private USB probe evidence: `usb52-*` binds source `1d19d3b8d29dd48d7b92744eb01d2d488934d24d`; `usb53-*` binds corrected source `b670fa7506c824d73eee741e3bdca2c51b2bd4aa`. Host/native/stock-free preparation passed, but both physical trials failed: 0.1.52 restarted with vector 3; 0.1.53 had no new crash but failed SELFTEST_CPU at 937 per mille. The second trial recovered the exact original base, active identity and 11-module inventory. Frame gap 52824 is below the 68000 limit. The reported culprit is Mini Verb, without a causal conclusion. No hardware planner PASS, successful self-test/Undo, rendered display or live sample behavior is claimed. Both raw device records and built packages remain private. Source checks 52b and 53a passed before their source commits.

Contributor clarification after the 0.1.53 trial: a pattern was already running and peaked at 92% by itself. This was reported by the contributor, not measured as a separate baseline by the trial client. It exceeds the self-test CPU limit and prevents attributing the 93.7% result to the probe. A stopped-transport repeat remains pending; the failed run is not relabeled as a pass.

A separately authorized repeat of the exact 0.1.53 package on the contributor-selected empty pattern passed: self-test state 2, failed 0, CPU peak 724 per mille, frame-gap count 51644, planner diagnostic 0x42534f4b. The client waited five seconds and verified Undo against the complete raw baseline inventory and active identity. `usb53-hardware-empty-pattern.json` binds module source `b670fa7506c824d73eee741e3bdca2c51b2bd4aa` and records frontend revision `4519794c92891c1ccc6c84c46bee938f838a85da`. The first CPU failure remains preserved. Visible display confirmation, live Flex sources, Apply, audible behavior and persistence remain separate qualification gaps.

The contributor was not looking at the unit during the successful trial; no rendered-display result is claimed and no extra device run was made for that alone.

## Geometry-only exact grid (0.1.54)

`grid_preview.c` accepts copied scalar settings and retained starts. It has no
PCM callback or source pointer. `bs_grid_plan` is a distinct informational result,
without amplitude/fade flags; unknown boundaries are never represented as quiet.
No new Apply path or source permission is introduced.

The 193-vector independent Python big-integer oracle covers fractional tempo,
all spacings, both tempo sources, high trim offsets, duplicate/retained starts,
64-slice capacity and invalid inputs. The generated C fixture checks complete
outputs and unchanged failure outputs with canaries. Successful plans also match
the existing exact audio planner on a genuine generated-silence test input.
Host ASAN/UBSAN and compiled MCF54455 execution both pass. The native objects pass
the code-generation and forbidden-index guards; no runtime helper remains unresolved.

Run in the pinned source-tools image with outputs outside Git:

```sh
python3 -B sdk/drafts/beat-slicer/test_grid_preview.py \
  --output /PRIVATE/grid-test --sdk-revision SDK_COMMIT \
  --runner /PRIVATE/build/beat_slicer_job_probe
```

These are generated-input engine tests, not a physical Flex snapshot, a live
reader or new USB package. Production settings capture and its writer/menu/owner
boundaries still require shared-base implementation and owner review. The earlier
0.1.53 physical result is preserved at its exact source; 0.1.54 is not hardware-qualified.

The retained `grid54-host-native.json` binds source `f0a5bca9f5aa74374862820246723ae0ca27af9c`; source checks against current Modwerk main passed before that commit (136.36 seconds). Native and sanitizer results remain generated-input evidence, not a live base binding.


## Basic shared AED candidate (0.1.55, staging)

The contributor selected a basic working slicer first. Flex and Static share the AED
slice commands and record layout, with separate settings/control tables. The
current exact-grid candidate covers both file-backed source kinds without a
PCM reader; smooth boundary analysis and playback fades are deferred. Ordinary
stock playback and stock DELETE SLICE / DELETE ALL SLICES remain the workflow.

`python3 -B -m unittest discover -s sdk/tests -p test_sample_editor.py -v`
runs the actual independent controller/grid and shared service with ASan/UBSan,
plus the actual native board adapter against authored sparse metadata. Cases
cover both source kinds and slots 0/127, all owner digest bytes, unchanged NO,
duplicate YES, temporary BUSY versus permanent stale rejection, BSS output
bounds, exact EP0-wake identity, native readiness gates, verified complete
rollback after a failed store and permanent refusal after uncertain rollback.
The typed decoder accepts real C code at offset zero, rejects descriptor/BSS
entries, and confirms default/public bases refuse the new action contribution.
These model checks do not prove stock writer coverage or hardware behavior.

The actual first target-built descriptor exposed ColdFire's default two-byte
struct alignment: the base correctly refused its offset 2694. The public action
type now requires four-byte alignment, with an additional cross-compiled package
regression. An authored generic error phrase also coincided with 13 non-filler
stock bytes; the controller now reports the actual busy/refused distinction.
The corrected 3,672-byte package passes both unchanged strict stock-free scans.
No rejected package was sent to a physical unit.

The current service test also executes as MCF54455 code with preserved ABI
registers. Private native empty-row and controller-bound bases link with the
new service enabled; their stock seams and flash-preservation checks pass.
The initial software checkpoint preceded its hardware trial recorded below.
The exact private base passes native/browser
byte parity. Full-menu/USB emulator results are below; companion qualification,
physical timing, audio and persistence remain pending.
The new service is a private `--sample-editor` base opt-in, not part of the
released beta capability. First candidate admission requires stopped playback
and recording. No hardware authorization from the old probe applies here.

Use `scripts/octatrack-emulator/build.py` for a Modwerk base. On candidate
`d41ede89`, the stock-oriented port missed task p1b and failed M6a; the adapted
port passed M6a, loaded the original disposable project, enumerated USB and
reached the real package-admission check. The initial misaligned package was
refused before installation. This is emulator evidence, not hardware evidence.

The first real USB/menu confirmation trace showed a later engine job retiring
the pending edit after the native question opened (no answer callback and no
marker write). The new boundary therefore distinguishes a possible waveform
read from an actually executed read: a byte-16 record stays inaccessible until
the separately guarded native display branch is observed and the whole job
reaches idle. A changed/reused dispatch, foreign record, recorder kind, nested
job or missing observer retires the token before admission reopens. Complete
metadata is still revalidated after a confirmed file-backed display read,
including Static error/status changes. New host cases cover those refusals;
the combined Flex/Static confirmation rerun passes on 25 October.

The normal-boot adapted emulator installed the actual independent 3,672-byte
package (`c58883ddef1dcb38fa5fdf490e4db20fbd779f818a78dc8a12b2acd13600ea9b`)
through the real USB loader on private base
`2278e2a0113edc28b0e07c66c913b3194be56a02750d299268cb2eff5f0b3ea4`.
Both file-backed kinds passed preview and native NO without metadata changes,
native YES with exact slice records, unchanged attributes/inactive records,
and stock DELETE ALL SLICES cancellation/confirmation. Flex used its actual
120.25 BPM attribute (three slices); Static used 120 BPM (two slices). Expected
positions were independently calculated with Python Fraction arithmetic.
The run ended with actual USB Rollback/Leave, without Keep.

`boot_device_module.py --help` describes the retained disposable fixture and
required paths. It copies the card and exercises panel gestures without memory
writes or native call injection. A receipt is written only after both source
kinds and USB Undo pass, binding emulator/base/package/card/driver hashes.
Private raw logs, card images and frame captures stay outside Git. This is
emulator integration evidence, not audible, physical or saved-project evidence.

Maintain USB HELLO traffic according to elapsed *emulated* time while driving
panels. Without it the base correctly auto-Undoes a silent host's trial after
ten seconds, removing the contributed row. That removed row in an earlier
combined run was a client keepalive error, not a separate Static AED path.

After merging upstream `f7ad1209` into `c39a8eae`, the rebuilt private base
`52c291c2afb412286ed0e20332aef0868d3c76a3ad01dfa92dacf094a3c96246`
passes the same combined run with package `c58883ddef1d…`. Native/browser BIN
bytes match at SHA-256
`8e1ca0e2982432d047d6de07748769e3f0dc00b31de8dbf8bef6fd8ebf0d91ac`.
After actual USB Undo, the retained driver additionally opens the displayed
stock AED menu, verifies its original label-table pointer and absence of the
contributed action. Cached binding counts are historical storage, not the
displayed menu; the earlier count-based assertion was a driver error. This
result still does not qualify physical removal, audio or persistence.

## First MKII trials and long-grid correction (0.1.56 staging)

The contributor authorized private base `52c291c2…` with 0.1.55 package `c58883ddef1d…`.
Actual USB RAM boot succeeded on the MKII. The contributor confirmed that the AED
Beat Slicer options appeared. A combined trial of the original 11 module IDs plus
Beat Slicer passed the physical self-test: 12 live/intact modules, seven DSP
modules run, failed mask zero, CPU peak 718 per mille, DSP peaks 638/578 per
mille and maximum frame gap 51,333 DTCN3 counts. This measures that self-test
only; it does not qualify worst-case FM/Poly voices, audio or persistence.
The earlier one-controller-only test reported CPU zero, which is not a usable
headroom measurement. Temporary trials did not Keep, flash or save projects.

A first client attempt called the frontend's public inventory read while its own
trial held the link and got a host-busy error; actual Undo restored the empty
temporary-base inventory. It was a client error, not a passed slicing test.
A later 15-minute timer also completed an observed successful Undo. The contributor's
recorder-setting/RAM-clear report does not establish that firmware was erased.
After clarification, the complete 12-module temporary set was loaded together.
The Sidechain package byte-matches the exact candidate's privately encoded
controller and its bound trust row; other companion payload hashes match their
source-built published packages. No foreign kept-set file was intentionally written.

The contributor then reported no AED contribution for recorder buffers, and an
approximately 22 MB file refusing with OLD SLICES CONFLICT or busy, despite
stock DELETE ALL SLICES and stopped playback/recording. Reported tempo is
SAMPLE 122 BPM, four bars and a displayed count of 49. Recorder buffers remain
explicitly excluded from this file-backed draft. The exact long-file hardware
cause is not yet confirmed and the report remains open.

The controller/service host regression reproduces a concrete empty-source
refusal: a 49th mathematical point at 122 BPM leaves only ten frames at trim
end, and the writer returns PRESERVATION although the old count is zero. The
old controller fails; 0.1.56 omits that new point while preserving the original
trim end. Cases cover four-beat and sixteen-beat grids, final gaps 1/63/64, a
65th tiny-tail point hiding a valid 64-slice grid, protected old tail markers,
short trims and complete tiny sources. Separate regressions exercise automatic
busy recovery, a job starting between copy/confirm, and NO, knob or stale-source
cancellation without publication. The generic rational-grid engine is unchanged.

A 24-bit stereo long-wave fixture loaded 4,164,207 frames through a normal
emulator boot, but its initial USB HELLO did not complete. That failed harness
attempt did not install or exercise Beat Slicer and is not evidence of a fix.
The new 4,008-byte module (`31c65f383807…`) compiles for MCF54455, passes both
unchanged strict stock-free scans and all five target-enabled slicer tests.
It uses the same proposed base API, with no base firmware update. A normal-boot
emulator rerun with this exact package passed file-backed Flex and Static
preview/NO with unchanged metadata, native YES with exact records (three Flex,
two Static), unchanged attributes/inactive records, stock clearing, USB Undo
and restoration of the stock menu. These are small authored fixtures, not the
contributor's long file. The exact corrected-build physical retest remains pending.

The current upstream-base repository check passes (2,570 app tests and the SDK check; 37 SDK tests, one skipped). The literal `origin/main` comparison still fails only on the inherited stale-fork CHANGELOG.md policy check. No native base rebuild is needed for this module-only correction.

The combined 0.1.55 hardware trial's 60-minute Undo did not restore a known
active identity: read-only status showed recovery, generation 7, active unknown
on base `52c291c2…`. A fresh standard recovery client adopted transaction 4
and retried rollback for three seconds; every reply remained needs-recovery.
No corrected package was installed. The contributor was asked to power-cycle before
continuing; recovery and the exact long-file test remain unverified. Earlier
successful single-module Undos do not qualify this combined-set removal.

After the contributor-confirmed power cycle, the flashed base `cd39c494…` returned
in normal phase with all original 11 module IDs present. The same private
base `52c291c2…` was RAM-booted again and the contributor-approved 0.1.56 package
`31c65f383807…` plus those companions passed an actual physical self-test:
12 live/intact modules, seven DSP modules run, failed mask zero, CPU peak
718 per mille, DSP peaks 772/578 per mille, frame gap 51,323 DTCN3 counts.
The corrected set entered a fresh 60-minute trial without Keep, flash or save.
The contributor's long-file panel result and this set's final Undo remain pending.

## Repeated edits and explicit replacement (0.1.57 staging)

On the exact 0.1.56/base `52c291c2…` trial, the contributor reported the combination
worked initially, then failed after repeated stock clearing and different beat
steps. WAITING FOR SOURCE was followed by CREATE SLICES? and a clipped banner
consistent with the base's SAMPLE CHANGED - NOT APPLIED message. The exact
reply at that physical failure was not captured; the service does, however,
consume a confirmed YES on transient BUSY and mislabel it as source mutation.

0.1.57 keeps the stock confirmation pending across BUSY and rechecks complete
source metadata, owner and revision before any publication. NO or another stock
gesture cancels the wait. A genuine source change still refuses. The proposed
ABI 1 interface gains a size-checked optional replacement entry; old callers'
confirm entry remains preservation-only. Replacement generates a fresh grid,
warns REPLACE SLICES? for nonempty tables, and writes only after native YES.
Inactive rows outside the new count remain unchanged and are not active slices.
The new options frame uses an outline, inverse title and bounded short labels.
Host/target, rendered UI and physical results are recorded separately below;
this source has not yet run on hardware.

The 0.1.56 trial disconnected at 20:41:57 UTC on 24 October (before its
60-minute timer). The client recorded idle/disconnected and did not verify
Undo. A later read-only bridge request reported the unit away. No cause of
the disconnect, automatic removal or physical reboot result is inferred.

The 0.1.57 actual controller/service regressions pass 100 repeated cycles over
both kinds and all five steps, alternating stock-clear-equivalent empty counts
and nonempty replacements, with BUSY after stock YES, readiness return,
cancellation and duplicate-answer refusal. Service tests retain genuine source,
revision and owner refusal while busy. Actual board tests cover nonempty-to-smaller
replacement, complete-table NO/BUSY preservation, pointer bounds and selected-row
retirement on YES, at Flex/Static slots 0 and 127. All five tests pass with the
ColdFire compiler enabled. These are generated metadata fixtures, not hardware.

The 4,372-byte package is `544125c5f1538d12283ae872192d49b1016184dc66f4e966aa5ad34ec3da2bfe`,
module ID `c8d078f2`, ABI 8 with 33 hook words. Both unchanged strict stock-free
scans pass. Private base `aba69ad57d71621d48e1b3be690d4d61136b04b201eda8b3ec35ef2c14921098`
passes native/browser byte parity (BIN SHA-256
`10c062cb290abe1392efc25a72dcb580eefae1238f22b2b31aaa1a095c94e014`),
stock-free, guarded stock-site and bootloader-preservation checks. It has not
run on the physical unit. Default beta generation remains sample-editor-off;
all seven USB layouts pass native/browser parity and stock-free checks.

The normal-boot emulator run with the above 4,372-byte prototype completed:
actual USB installation; Flex preview/NO unchanged and exact native YES with
three records; Static preview/NO unchanged and exact native YES with two;
then repeated replacement at 4, 16, 32, 64 and 1 beats on each kind. Each
replacement first exercised native NO against the complete old table, then
YES against the rational oracle. Stock clearing, actual USB Undo and restoration
of the displayed stock-only menu also passed. This is emulator evidence only.
The retained driver exposes this run with `--repeat`; neither the unit nor
emulator memory was written by the harness.

Frame review found the maximum-count replacement label would exceed the
20-character content width. The final controller changes only the literal
OLD SLICES to SLICES, making REPLACE 64 SLICES fit. It is 4,360 bytes, SHA-256
`11127a1f184b78c0b402a81b9e23a7b41216d0aafd2ceb35280418757303c9d0`.
The final build passes both strict stock-free scans and all five target-enabled
tests, now also including 40 repeated long-source cycles across Flex/Static:
48, 24 and 12 slices at 122 BPM, and refusal of both over-64 grids, with clears,
replacement and BUSY after confirmed YES. The full-menu emulator receipt stays
bound to prototype `544125…`; it is not relabeled as this final image. All final
longest labels were checked against the 20-character width. Exact final-package
physical installation, rendered display and repeated-edit results remain pending.

The integrated upstream-main check passes in 140.41 seconds: 2,570 app tests
in 325 files, lint/type/build and the SDK check (37 tests, one skipped). All
25 current published USB packages rebuild identically with stock-free checks;
Play Modes retains the declared older release and issue #764 gap. The literal
stale-fork origin/main check still fails on inherited CHANGELOG.md changes.
The unlisted draft remains unavailable to module:doctor until release integration.

## DSP-stop report and idle polling (0.1.58 staging)

The contributor confirmed 0.1.57 works when alone, but reported a DSP-stop warning,
a pop and sustained loss of audio with TapeHead/Mini Verb active during slicing
of a 22 MB Flex sample. Reported setup: T1 Static short drum loop, T2 Static long
sample with TapeHead/Mini Verb, T3 Flex long sample. Recording was off; transport
state immediately before the failure was not established. The live stall table
also retained effect handle 31 on T3, separately from the contributor's stated setup.
Both physical 12-module self-tests passed before this interaction; those tests
did not qualify editor/effect coexistence. The 0.1.57 trial is now retired.

After ending the trial (Undo again returned active unknown), the standard LOG
request captured the unit's persistent record on exact base `aba69ad57d71…`:
boot 25, stall count 2, reason 1 (frames stopped), tick 15,529, frame counter
722,121, frame state 7, busy 0 and eDMA ES/errors zero. Reported snapshot CPU was
610 per mille and DSP peaks 419/645. These are the saved readings, not proof
of worst-case headroom or a confirmed root cause. Raw diagnostics remain private.

The board held the level-7 global interrupt mask across full captures, full-table
comparison, preparation and publication. That is inconsistent with the documented
frame-interrupt deadline, even for stopped transport. The 0.1.58 mitigation uses
the level-4 metadata-writer boundary for the stopped, file-backed UI/engine/storage
paths, leaving audio frames and DMA enabled. Recorder/PCM access is not admitted.
A context gate refuses heavy work if entered at interrupt level 5 or higher.
The page retains the opening snapshot while idle and while adjusting settings;
YES still revalidates.
It no longer exposes WAITING FOR SOURCE during ordinary display work.

Host regressions exercise frame service during metadata access, unchanged atomic
failure rollback, writer deferral until the metadata lock is released, subsequent
stale-source rejection and refusal from a high-mask context. Another runs 120
idle ticks with no new source copy and an unchanged frame despite temporary
worker busy state. Original 0.1.57 board/module code fails the corresponding
regressions; the revised code passes. These generated tests establish modeled
boundaries, not physical interrupt latency, complete native writer coverage or
hardware coexistence. Target compilation passed as recorded below; exact physical
retests remain pending.

Contributor UI refinements for 0.1.58: hide Flex/Static slot location, use encoder B
only for spacing, and match ordinary knob sensitivity. The controller accumulates
four raw counts per discrete step, discards residual counts on reversal, clamps
at endpoints, and leaves UP/DOWN without parameter changes. Host tests compare
unchanged frames/copy counts across idle ticks, sub-step encoder movement,
parameter adjustments and arrow presses. Matching the contributor's physical knob
feel remains a hardware check, not an assertion established by these fixtures.

The final target package is 4,524 bytes, SHA-256
`8164829b315c822b72073f341085dc1aaef4f5a62636f4f53f9da4ffa75639ce`.
Both strict stock-free scans and all five target-enabled tests pass. Private base
`7c82d0d15495…` passes native/browser parity, stock-free and bootloader/flash
preservation guards (BIN SHA-256 `fdd4656fcf6c…`, 767,728 bytes).
The full upstream-main check passes in 147.07 seconds: 2,570 app tests in 325
files and SDK checks (37 tests, one skipped). The literal stale-fork origin/main
check retains its inherited CHANGELOG.md policy failure. Before the subsequent upstream merge, public default-base
inputs and the 25 published packages were unchanged by this private adapter update.

A normal-boot emulator installed the exact three-member USB set (TapeHead, Mini
Verb and this Beat Slicer; set SHA-256 `d253f4a85359…`). Stock panel gestures
selected TapeHead on T2 FX1 and Mini Verb on T2 FX2; live handles were verified.
On each file-backed kind, the first three raw encoder counts left the frame
unchanged, the fourth stepped, minus four restored, and UP/DOWN had no effect.
Native NO preserved the complete table, YES created the expected rational grid,
stock clearing passed and emulated frame counts continued advancing. Retained
frame review confirms the slot location is absent and all shown labels fit.
This short authored fixture does not reproduce the contributor's long Static streaming
track or physical interrupt timing. The final USB Undo returned result 11,
recovery phase 6 and active unknown; restoration and stock-menu removal were
**not confirmed**. The driver deliberately failed and wrote no success receipt.
Two earlier harness attempts rejected a wrong set baseline and an unhandled
positive publication-progress reply respectively; neither exercised slicing.
No 0.1.58 package has been loaded onto the physical unit.

After merging upstream `ecca8e66`, all seven default beta USB layouts were
regenerated through the standard source builder, with native/browser parity,
stock-free and bootloader checks passing. Their sample editor remains disabled.
The private `7c82d0d15495…` evidence above belongs to the pre-merge source
snapshot; it does not qualify a private base incorporating those upstream changes.
The controller package source remains unchanged.

Integrated upstream-main validation passes in 142.95 seconds: 2,574 app tests
in 325 files and SDK checks (37 tests, one skipped). All 25 published USB
packages rebuild identically with stock-free checks after the standard base-only
rebind. Play Modes retains the declared older release and issue #764 gap.

Upstream `96a3a993` subsequently added a self-test failure after a recorded DSP
stall. It is also integrated: all seven default beta USB layouts were rebuilt
again with native/browser parity and the same stock-free/bootloader checks.
No private hardware result is claimed for that integration.

Final integration also includes upstream `ec529820` (Direct Jump). Its changes
to four shared engine asset files left Tape Echo and Euclid source receipts
stale. Refreshed only those eight hashes; image and copy declarations are
unchanged. The retained full source rebuild and strict stock-free comparison
passes for all 25 published packages, including Direct Jump 0.1.1. This is
receipt synchronization, not a module release or physical qualification.

Resumed validation against upstream `ec529820` passes in 141.16 seconds:
2,574 app tests in 325 files and SDK checks (37 tests, one skipped). The initial
sandboxed attempt denied local HTTP/socket listeners; the unrestricted rerun
passes. The stale-fork origin/main check retains its inherited CHANGELOG.md
policy failure.

Upstream `a87b5515` (measured key-bus timing) was integrated during resumed
readiness checks. All seven default beta base variants were regenerated from
the merged source and passed native/browser parity, stock-free and bootloader
guards. The five base-bound packages were rebound; all 25 published packages
then reproduced identically with strict stock-free checks. The default editor
remains disabled. The private pre-merge base evidence above is unchanged and
does not qualify this new base for physical testing.

Subsequent upstream documentation (`6ffb6ec3`) and Direct Jump Kyoti 0.1.2
(`14908619`) also merged. Base runtime inputs are unchanged from the seven
verified variants above. The four shared asset hashes in each Tape Echo/Euclid
receipt were refreshed again; all 25 packages, including Direct Jump Kyoti
0.1.2, reproduce identically and pass strict stock-free checks.

## Current-source device-trial preparation, 25 October 2026

Source snapshot `686906da7acdbd0d6a01ea262147a01fdb60a8c2` produces private
sample-editor base `2732acbb336ca4300235b91d8a5ca143f540e0120e2860e964b1ad233108dd67`.
Its native/browser BINs match (769,260 bytes, SHA-256
`23bcfe8b29a3aca3639f7ab6ef9a363693c497e706f21b6c96dda4c4b0a70c01`),
and stock-free, declared-site and bootloader-preservation checks pass. All five
target-enabled service/controller tests and the saved-set regression pass.
The module reproduces the unchanged 4,524-byte `8164829b315c…` package. Twelve
private trial packages (the original eleven companions plus Beat Slicer) pass
strict stock-free scans; Sidechain Compressor is rebound to this private base.
These results do not qualify physical timing or audio.

The contributor reported power-cycling, reconnecting and stopping the MKII. Read-only
USB checks observe normal mode on flashed base `cd39c494b63beae0…`, boot 26,
and all eleven expected modules with no Beat Slicer installed. The saved crash
count remains one and DSP-stall count two; retained records are historical,
not evidence of a new failure after this power cycle. No new RAM boot, trial,
Keep, flash or sample edit was performed on the unit.

An initial normal-boot emulator run installed the exact three-member companion
set and selected TapeHead/Mini Verb, then failed a whole-frame encoder-substep
comparison before Undo. A short-path rerun retained the same failure despite
an extra redraw delay: its baseline contains only a partial title, while the
next capture contains the complete options page. This compares different draw
stages, not encoder settings. The driver now observes both the border restored
after framebuffer clearing and the final footer pixel before comparing frames.
It retains each compared frame; a fixed delay alone is insufficient.
A subsequent launch failed on an overlong host socket path before USB testing.
None of those attempts is a passing qualification receipt. The corrected
short-path run, with driver source from `f1c3eee3`, passes on the exact base and
three-member set (set SHA-256 `066f5cdfd6ae…`). TapeHead/Mini Verb were selected
through stock gestures on T2. Flex and Static each pass four-count encoder
stepping, unchanged substeps, reverse stepping, inactive arrows, native NO,
exact rational-grid YES, replacement at 4/16/32/64/1 beats and stock clearing.
Emulated frames advance through the edits. Whole-set Undo completes across
explicit retained-recovery responses; the final active identity is the original
empty base and the stock menu no longer contains Beat Slicer. Uncertain replies
still fail without write replay. The retained receipt is emulator evidence on a
short authored sample, not the contributor's long streaming setup or physical timing.
Earlier single-response Undo failures remain recorded above and are not silently
reclassified as complete restoration.

The later merge through upstream `74a84e71` changes no recorded candidate
runtime input. The standalone recipe conflict was ordering and the branch's
builder hash: retained the actual branch builder hash for Tape Echo/Euclid;
image/copy declarations are unchanged. The new document-size check passes after
replacing duplicate session instructions in the hardware-trap guide with its
existing driving-guide link. Repository readiness/CI results remain separate
from this exact emulator receipt.

## Contributor's 0.1.58 trial — 25 October 2026

Exact private base `2732acbb336ca430…`, module SHA-256
`8164829b315c822b72073f341085dc1aaef4f5a62636f4f53f9da4ffa75639ce`,
frontend `60abcc53` (unchanged runtime from `c02a7274`). All 219 base source
inputs, nine module inputs and twelve packages were rechecked before RAM boot.
The contributor confirmed a disposable project/sample copies with recording/playback
stopped. Actual self-test: passed, 12 live/intact modules, seven DSP modules ran,
peak CPU 74.3%, track-group peaks 65.0% and 71.0%.

The contributor reported: “it works very well no bugs occur during testing.” This is
reported slicing behavior; no per-case audio, persistence or timing attestation
is inferred. The contributor requested the 0.1.59 menu/popup revision afterward.

USB Undo failed separately: the frontend reached ready with unknown active
identity and a refusal notice; restoration was not verified. The contributor then
power-cycled. Read-only USB verified normal flashed base `cd39c494…`, its exact
original eleven-module inventory, and unchanged persistent crash/stall counts
one/two. The first status request encountered the documented stale USB handle;
the next reads succeeded. No Keep, flash or save was performed. The slicing
report does not qualify USB Undo. Raw logs and firmware stay private.

0.1.59 is a new UI build; the 0.1.58 result is not reused as its hardware result.

## 0.1.59 popup/menu software checks — 25 October 2026

Private base `92b6c7bba906ea7ef742fe8252fad7a2fd5b1b9bc8223f61c59176e34c1122ad`,
BIN 769,276 bytes, SHA-256
`eb6b0b3a28bbcd5e5f0a122ce188ff066b31b0acfc2863dacb6d9cc5d361c8d3`.
Native/browser byte parity, declared-site and bootloader-preservation guards
pass; the unchanged strict stock-free scans pass. All 219 recorded base inputs
match current source. Default beta builds do not enable the editor feature.

Independent module 0.1.59: 5,448 bytes, SHA-256
`5003874aff0ddbdda65654c9be5184411d15f17e346ca752f2aa543871f8c266`.
All nine module inputs match source. The initial authored font/clear build hit
the strict scanner on coincidental compiled instruction runs; that failure is
retained. Removing an unused text helper and clearing packed column bytes
produced the passing package without weakening either scanner.

Actual controller/grid/service host checks pass, including unchanged pixels
outside the popup, stable copied snapshots, inert C–F controls and the existing
confirmation/short-tail/repeated-edit cases. Target-built descriptor checks and
all four generic SDK service/board/action/target checks pass, as does the
saved-set transaction regression.

The normal-boot emulator set contains TapeHead, Mini Verb and 0.1.59, digest
`b5cfa75103041ffce2a9a56c48e9929c16460a8f7970b9ebecaefcced2dc8c6e`.
Both effects are selected on T2 through stock panel gestures. For both Flex and
Static, the actual menu inserts CREATE BEAT GRID immediately before CREATE
SLICE GRID and preserves every stock row/callback order; stock remembered
selection indices are verified after selecting an original action. Encoder
substeps/reversal, inactive arrows, NO, exact native YES records, stock clearing,
frame advance, whole-set Undo and stock-only menu restoration pass. The actual
popup captures were visually reviewed with the AED visible around the window.
This short authored fixture did not repeat the longer spacing sweep already
recorded for 0.1.58. Driver SHA-256: `aa31597c1a510d8506acde4c2e41e8bb607b6faa4a6117cb398c877c44536bd1`.

These are software/emulator results. No 0.1.59 physical RAM load, audible output,
interrupt latency, Keep, sample/project save or persistence result is claimed.
The 0.1.58 physical Undo failure remains unresolved despite emulator Undo passing.

## 0.1.60 height/label refinement — 25 October 2026

The contributor reviewed the actual 0.1.59 popup capture and requested removal of the
encoder letters and a window roughly the display height to hide distracting
underlying content. Version 0.1.60 keeps physical field positions and function
labels, removes A–F lettering, and uses a 122-by-62 popup at (3,1). The module
shows 0.1.60 in its footer. Previous 0.1.59/0.1.58 artifacts remain retained.

Target package: 5,348 bytes, SHA-256
`05dd1ac93d86618001eac69eb7e9fb3309b1bbf67936ea953d74a5b6be5eede5`.
Both unchanged strict stock-free scans pass. The actual controller host and
target descriptor cases pass, with preservation outside the revised rectangle.
The base is unchanged from the named 0.1.59 base `92b6c7bb…`; all 219 recorded
base inputs were verified identical before reuse.

A normal emulator boot and USB installation of the single 0.1.60 package opened
the actual Flex CREATE BEAT GRID popup. The frame was captured and visually
reviewed: no encoder letters, underlying AED heading/tabs covered, correct
right summary and version footer. This uses `boot_device_module.py --capture-only`,
which writes a distinct capture receipt and explicitly does not claim completion
of the full functional suite or USB Undo. Driver SHA-256:
`6fdf33527ba6da59761e28d141621f16ae6bc8ae2bf3048f86c89ec3586bec67`.
The full 0.1.59 Flex/Static/companion/Undo regression remains historical evidence
for 0.1.59, not a new 0.1.60 run. No 0.1.60 physical load or hardware result.

## Approved 0.1.63 UI — 25 October 2026

The contributor approved the local renderer preview and explicitly authorized pushing
0.1.63. It uses a nearly full-height popup, a dashed six-field form, centered
BPM/BEATS controls with blank unused fields, and a vertically centered,
right-aligned summary. The summary shows only the BPM number, count first
(3 SLICE), and CREATE/REPLACE. No version is displayed in the popup.

Exact target package: 5,592 bytes, SHA-256
`6bd14749b2281accb6a20a5f0811b61975b5731013cbef64d4206ec91485834c`.
Both unchanged strict stock-free scans pass. Four generic SDK cases and both
actual controller/target descriptor cases pass in the reviewed compiler. All
nine module input hashes match source. Base `92b6c7bb…` is reused unchanged,
with all 219 source inputs verified before reuse; its native/browser parity and
safety receipts remain bound to the unchanged image recorded above.

The approved picture was rendered by the actual C controller on the host with
authored metadata over retained emulator background. It is distinct from a
normal-boot target capture. The exact target capture receipt and comparison
result are recorded in PR #840. Capture-only mode verifies UI rendering, not a
new full Flex/Static/companion/Undo suite. The full 0.1.59 regression remains
historical evidence for that version. No 0.1.63 physical load or hardware result
is claimed; the earlier physical Undo failure remains unresolved.

After this capture, upstream #919 changed the loader to support 128 installed
modules. Its generated base and bound packages were regenerated for integration.
The capture above remains evidence for the named pre-128 base `92b6c7bb…`;
it does not qualify the newly merged base. Before a future device trial, rebuild
the private base and companion set from current source and repeat preflight.
No additional hardware load was performed for this push.

## Extended 0.1.63 physical trial and 0.1.64 development — 25 October 2026

The contributor requested an open-ended private RAM session. The actual flashed base
was `77226ffc…` with sixteen modules. Private base `253a9a61…` from `42006d2b`
RAM-booted, and the exact approved 0.1.63 package `6bd14749…` (5,592 bytes)
loaded with all sixteen named companions through frontend review/trial.
Physical self-test passed: 17 live/intact, seven DSP modules exercised, 51.9%
peak CPU. No Keep, flash, project/sample save or kept-set write occurred.
The helper has no scheduled Undo. The contributor's extensive tests remain in
progress; no new slicing, audio, Undo or persistence verdict is inferred.

The separate 0.1.64 working source adds source-scoped recording admission and
metadata handling for inactive recorder slots. Host adapter/controller cases
cover independent recording versus file-backed edits, all eight recorder slots,
both state banks, empty results, count-publication failures and stale proposals
across short/long changes. The complete native playback/recorder workflow remains
in progress; the unit above has not received 0.1.64.

Private build attempt 2 binds base
`8f88fdc5d8ed80fed77019e17fcd4eddaa64914c1574902683f6224e04de10f4`
and module
`5e8d1e8409da7270186f3278e2e5181d22071030a791ac42d568a9a651427afd`
(5,712 bytes). All 219 base and nine module inputs match the working runtime.
Four shared-service cases and both controller/descriptor cases pass with the
reviewed ColdFire compiler; strict stock-free scans and safety gates pass.
Native/browser BINs match at SHA-256
`a887bf3c249b5fd011af595a0b5ca97a519dc091e94b4ca5f94b652aa27491df`
(769,564 bytes). Local draft discovery passes 33 tests, with one descriptor
case skipped on macOS and covered by the compiler run above.

The second normal-boot emulator run installs the three-module set with TapeHead
and Mini Verb. Flex file, Static file, empty R8 and completed R1 cases each pass
preview, native NO/YES, exact complete-record comparison and continued pattern
playback/frame service. The first attempt had lost the empty-buffer token to a
waveform redraw; attempt 2 includes the source-bounded redraw classification.
The second run later stops at the file/independent-recorder case: the recording
shortcut had left AED, so YES armed recorder trigs on the track AMP page rather
than opening an action menu. The captured screen confirms this driver context
error. A fresh recorder run explicitly reopens AED and adds short/long marker
lifetime checks. Neither incomplete run establishes full-suite or USB Undo
success.

The third run passes empty R8 and completed R1 editing, then fails the stricter
count-dropping oracle for a shorter re-record. The actual stock result retains
count 3 and clamps starts 0 / 22,050 / 44,100 to 0 / 16,176 / 16,176 when trim
ends at 16,240. The contributor subsequently clarified that the slice count stays the
same and confirmed this agrees with their observation. The service now captures
duplicate recorder starts unchanged; the host fixture verifies cancellation and
explicit replacement, while new proposals remain strictly increasing. A native
rebuild/regression is pending. No automatic stock-cleanup override is introduced.

An isolated stock-CPU fixture invokes the grid callback for slots 128 and 135
at extents 0/1/63/64/1000/44100. Its chosen eight slices include zero-length
records when the extent is empty; this bypasses ordinary UI admission and is
not proof of the complete empty-buffer menu path. A separate normal-panel
emulator run on private base `253a9a61…` observes an empty recorder with zero
length, zero trim and zero active slices. Manual recordings of three different
lengths publish matching control lengths and trim ends (33,456 / 15,824 /
51,120 frames), independent from reserved capacity. The settings counter stays
unchanged across those recordings: it is not a complete recording-content epoch.
Existing engine-writer invalidation still needs direct regression coverage for
open proposals across recording. No hardware result is inferred from this run.

## Integrated recorder candidate (0.1.64, 26 October 2026)

The current private candidate is built from `ee5e404f`; the later `d291b2bf`
documentation/category integration changes none of its runtime inputs. All 225
base inputs and nine module inputs match the integrated source. Its base is
`80eaf0cb9986b60b1e6f51dcf372036d4408b9be2467573d20eaf8aeb260e0f7`;
the 5,708-byte module is
`e0e32ab04f211a9c79cb725b133bb86a06bcffd3895cff6e9d3d66d94ba74c59`.
The source accepts stock's duplicate recorder starts and zero-length empty
rows without changing them during preview or cancellation. Only an explicit
replacement creates a fresh grid; new proposals remain strictly increasing.

Four generic SDK cases and both actual controller/descriptor cases pass in the
reviewed toolchain container, including target compilation. Both unchanged
strict stock-free scans and declared-site/bootloader-preservation checks pass.
The native and browser BINs match at
`ae532a8226b9fe88d40c7cc4f84551d071c682f0354ce6c39f920fb9282e0f9c`
(774,524 bytes). The private package set for the contributor's sixteen companions
plus Beat Slicer is prepared: all 17 packages pass unchanged strict scans, with
their exact lengths/hashes independently checked. No new unit load occurred.

The fresh normal-boot emulator run uses this exact candidate with TapeHead and
Mini Verb installed through USB. Flex, Static, a fresh empty R8 and R8 containing
four stock zero-length rows pass preview, NO, exact confirmed records and frame
advance while pattern playback continues. The full run also passes editing R1
while R2 records, editing a Flex file while that same track's R1 records, refusal
for the buffer being recorded, verified whole-set USB Undo and stock-menu
restoration after removal. A normal recorder gesture cancels an open edit and
stopping never applies it later. An earlier virtual run was stopped
to correct the test driver's use of the AED reader for stock's slice-count
submenu; it is neither a passed suite nor a firmware boot failure.

The re-recording sequence is 51,568 → 16,256 → 73,648 frames. Count stays 3:
starts 0 / 22,050 / 44,100 become 0 / 16,192 / 16,192 after the shorter recording
and remain exactly there after growing. The private receipt binds the driver,
emulator, copied card, module set and base inputs; its hardware flag is false.
These manual-recorder, pattern-flag and frame-counter checks do not establish
audible output, physical CPU/timing, every recording mode or persistence.

The integrated default beta assets were separately regenerated by the official
producers for all seven USB layouts. Native/browser parity, strict stock-free,
declared-site, bootloader-preservation and bound-package consistency checks
pass; 219 production input hashes match both integration branches. This does
not enable the private editor or qualify a physical base update.

## Physical 0.1.64 trial started — 26 October 2026

The contributor requested the device test and confirmed stopped playback/recording and
disposable copies. The ongoing 0.1.63 trial completed verified USB Undo to its
empty private RAM baseline `253a9a61…`. After the contributor power-cycled, read-only
checks verified flashed base `77226ffc…` and the original sixteen saved modules.
The exact `80eaf0cb…` / `e0e32ab0…` candidate above then RAM-booted, passed
frontend review and loaded with all sixteen companions. Physical self-test:
17 live/intact, seven DSP modules exercised, zero failures, CPU field 524
(52.4%). The helper has no deadline or scheduled Undo; idle sleep is inhibited.
No Keep, flash, saved-set write or project/sample save occurred.

Contributor slicing/UI/audio/recording results and this 0.1.64 trial's Undo remain
pending. The successful 0.1.63 Undo does not establish the cause of the earlier
0.1.58 failure. This new physical evidence is recorded locally; the contributor wants
device testing before deciding on another GitHub push.

The contributor subsequently reported that 0.1.64 “works pretty well” and
authorized pushing the tested work/results. After the specific test of applying
a grid while slices of the exact edited source audibly play was explained, they
confirmed testing it on their unit with no glitches or freezes. This is a
contributor-reported result on the exact running build above, not an independent
audio capture. Source kind, trig pattern, tempo and duration were not specified.
It does not establish every recording mode, persistence, or the separate
recording-start interrupt race raised in review.


## 0.1.65 local review changes (26 October 2026)

Not loaded on hardware and not a qualification of the earlier 0.1.64
trial. The actual controller now shows EMPTY for zero-frame recorder sources
with zero slice entries. YES stays in the popup without a replacement request,
a stock question or a delayed retry. Existing zero-length stock entries still
require explicit replacement and stock confirmation before count becomes zero.
The host backend returns NO_CHANGE for an unchanged complete slice table.
The controller/service fixture passes under host sanitizers for all eight empty
recorder slots, both zero entries and eight stock placeholder entries.

The actual shared menu implementation now has authored host fixtures for both
stock menu variants, callback/selection mapping, YES release, YES/NO, transient
busy, key cancellation, lost native question callbacks and foreign dialogs.
A pending menu action is cancelled before a later idle retry can open it.
Question reconciliation observes the stock question window's linked flag and
callback ownership, not the unrelated redraw byte. The host sample-editor
suite passes (five tests, with the ColdFire-only case skipped on this host).
These fixtures do not prove native window-layout addresses or hardware timing.

Recording-start coordination remains unresolved. A private authored timing
probe linked the actual board adapter and service, then changed the selected
recorder bank to pending state 1 immediately before the first publication
write, after final source capture. The adapter returned APPLIED (7), left
pending state 1, and published count 2 with 195 writes. This demonstrates that
the current source-state check and level-4 metadata lock do not exclude that
modeled ordering. It does not execute a stock recorder interrupt, demonstrate
physical data corruption, or qualify a fix. Ordinary native recording tests
and the contributor's positive playback report do not close this gap. Do not
raise the interrupt mask through capture/planning as an unmeasured workaround.
A solution must establish ordering against stock recorder preparation and
publication, keep the scheduled recording start intact, and test forced starts
before, during and after publication with hardware timing evidence.

Target build checks also passed in the source-tools image: both controller
regressions (including real ColdFire package descriptor alignment) and native
menu compilation with both object guards. These are compiler/host executions,
not execution of the updated menu on the ColdFire emulator or hardware. The
EMPTY image is an authored-source preview from the actual module renderer;
UI approval remains pending after the contributor requested the picture.


### 0.1.65 action-label revision

The contributor selected NONE instead of EMPTY so the summary line consistently
names a slice action alongside CREATE and REPLACE. NONE means no slice action
is available: the source has zero frames and zero slice entries. YES still
leaves the popup open with no confirmation or write. The prior EMPTY preview is
superseded; the updated image comes from the actual renderer with authored
metadata. The existing controller/service host regression passes under
sanitizers; the ColdFire-only package test was skipped on this host. No device
reload or new push was performed for this label revision.

The contributor subsequently selected EMPTY again because 0 SLICE and NONE
felt redundant. The local 0.1.65 renderer and player notes restore EMPTY; YES
behavior is unchanged. No new device load or push was performed.


## 0.1.65 recorder commit candidate — host/stock-call evidence

The local implementation now keeps full capture, table comparison, table
writes and rollback preemptible at level 4. Recorder buffers alone use a bounded
level-5 section for one source-state/controls/trim recheck and the final count
store. Level-6 DMA stays enabled. There is no table copy, owner scan, stock UI
call, wait or recording-trigger retry inside that section. A start before the
commit rejects the edit, restores/verifies all old marker rows/count and the
selected row, and returns STALE without poisoning or retaining the intent.
Recorder PCM, controls, trim and preparation fields are never restored. A start
after the count store observes a completed grid. File-backed sources retain
the level-4 path.

The actual adapter/service host fixture passes 786 authored forced timings:
591 selected-recorder cases (197 positions times pending, active/changed extent,
and start/stop with queued cleanup), plus 195 unrelated-recorder starts. The
positions include every initial publication write, immediately before acquiring
the short commit lock, and an interrupt requested inside that lock. The model
queues that last interrupt until unlock and verifies exactly one start, no lost
trigger, complete rollback where applicable, unchanged recorder mutations and
no retry after Stop. It rejects row writes in the short section and limits its
metadata reads to 20 and count stores to one. These bounds describe the model,
not measured physical latency. The shared menu fixture verifies that late STALE
closes the question, reports SOURCE CHANGED and leaves future menus usable.

A new source-bound stock CPU probe executes 336 complete preparation/recorder
calls: tracks 1/8, stereo 16/24-bit formats, both state banks, three authored
machine-type values (0–2) and seven state/allocation scenarios. This initial
audit did not cover the distinct type-4 Pickup branch. No case writes slice
rows or the slice count. Observed metadata stores affect offsets 276, 280, 296,
300, 304 and 308; these include tempo and trim fields, which the final commit
rechecks where represented in its captured source. Full frame/Pickup operation,
allocator/cache ownership and other unexercised paths are not thereby qualified.
The exact runner source binding, pinned stock hash, logs and receipt remain
private under review-840/race/metadata-results.json; no stock bytes are added.

The five shared host tests pass (one target-only case skipped on this host),
and the controller host test passes. This supersedes the earlier statement that
no local race fix exists. The complete new base/module build, normal-boot
emulator workflow and physical interrupt timing are still pending; the running
0.1.64 hardware image has not changed. Timer diagnostics in the candidate will
record the final count-publication body separately from unmasked row work.

### Latest private preparation and restoration check

The 0.1.64 helper subsequently ended after its link reported USB disconnected.
Its final Undo was **not verified**; this is not evidence of a DSP failure or
of the physical cause of the connection loss. On 26 October the contributor
confirmed a reboot and reconnection. A fresh read-only check verified normal
phase, known active state, flashed base `77226ffc…` and all original sixteen
saved module IDs/names. The contributor also confirmed stopped playback and
recording with disposable test copies ready. No recovery command was replayed.

The complete private 0.1.65 build is base `9740984014108c48…` and module
`63ab1db2ca415d64…` (5,760 bytes). Native and browser-built images are identical
(775,272 bytes, SHA-256 `044db6c9ffa72654…`); target controller/menu checks,
strict stock-free scans and declared-site/bootloader checks pass. All seventeen
private packages pass the unchanged stock-free scanners and the actual
frontend's offline preparation with Undo. The original sixteen companion IDs
and versions are retained; base-bound packages are rebuilt for this candidate.
These are preparation results, not physical qualification.

The extended synthetic stock-call audit now executes 560 complete calls,
including machine-type values 0–4 and the distinct type-4 branch, with no slice
row/count writes in those cases. This supersedes the initial 336-case scope;
it still does not qualify full Pickup operation or every interrupt path.

The normal-boot emulator run passed all five replacement spacings for Static,
Flex and completed recorder buffers, fresh EMPTY/no-op and explicit clearing
of stock empty placeholders, shorter/longer re-record cleanup, cancellation on
a normal recording gesture, and editing buffer A while recorder B runs.
The extended file-backed Flex/own-recorder stress run failed a later expected
confirmation-state assertion after several successful replacements. Its cause
is not established; the run did not reach verified USB Undo and is not a full
passing receipt. A shorter source-bound test subsequently passed: file-backed
Flex preview/NO/YES produced the exact two expected records while its own track's
separate recorder remained active before and after editing; the selected active
recording buffer was refused. USB Undo restored the empty private baseline and
the original stock menu. Its receipt remains private under
`review-840/candidate65/focused-file-recorder/results.json`. This does not explain
the longer stress failure. Physical 0.1.65 timing, audio and lifecycle results
remain pending.

### Physical 0.1.65 trial started — 26 October 2026

After a fresh reboot/original-sixteen verification and the contributor's stopped
transport/disposable-copy confirmation, exact private base `9740984014108c48…`
RAM-booted. The actual frontend reviewed the empty known private baseline and
all seventeen exact package hashes before trial publication. Physical self-test
passed: 17 live/intact, seven DSP modules exercised, zero failures, CPU field
520 (52.0%), frame-gap field 55,067. A fresh diagnostic heartbeat confirms the
helper remains connected; no deadline or scheduled Undo is configured.

The module is `63ab1db2ca415d64…`, 0.1.65-experimental. The original sixteen
companion IDs/versions are present, with required base-bound rebuilds. No Keep,
flash, saved-set write, project/sample save or backup/export was performed.
The saved original set was verified before the RAM boot, not after this still
active trial. Contributor panel/audio/recording results, physical short commit
timing and final verified trial Undo remain pending. The longer emulator
stress cancellation remains unexplained; the focused passing run does not
close it. No new GitHub push accompanies this device load.


## 0.1.65 contributor report and 0.1.66 two-beat update

The contributor reports that the running exact 0.1.65 trial “works very well”
and that they encountered no bugs. This is a contributor-reported panel result;
no independent audio capture, physical commit timing or final Undo is implied.
They requested a 2-beat spacing option. The 0.1.65 trial remains running while
its replacement is prepared; no physical commands or new GitHub push were used
for this change.

Version 0.1.66-experimental adds 2 between 1 and 4, giving 1/2/4/16/32/64 beats.
The controller's encoder bound, manifest and exact/cooperative planner
validation accept the new choice. Unsupported-spacing fixtures now use 3.
The current emulator driver includes all six choices; historical prototype UI
fixtures and earlier evidence retain their original five-choice scope.

Host controller/service tests pass, including 1 -> 2 -> 4 -> 2 encoder selection
and exact two-beat starts/ends for sample and project BPM on Static, file Flex
and recorder slots 128/135. Fourteen planner tests, four independent tests,
500 cooperative oracle vectors, session and async lifecycle checks pass.
All 195 geometry vectors pass both host sanitizers and ColdFire execution,
including 2-beat fractional/high-offset cases. Native compilation, both object
code guards, actual package descriptor alignment and the unchanged strict
stock-free scanner pass. The actual frontend prepares all seventeen exact
trial packages with Undo offline.

Private module SHA-256 is
`05512de0888638d0a68ff136a5e439b3bdaccf4aa05c371c3cf3cfc893103e8b`
(5,764 bytes). No base change is needed: it reuses the tested private base
`9740984014108c48…`. Receipts stay private under `review-840/candidate66/`.
Version 0.1.66 has not been loaded on hardware; exact-build panel/audio checks
and final verified USB Undo remain pending. The earlier extended-emulator
cancellation and physical commit-timing gaps remain open.


### Physical 0.1.66 trial started — 26 October 2026

The contributor explicitly requested loading 0.1.66 and freshly confirmed
stopped playback/recording. The existing 0.1.65 helper completed verified
whole-set Undo to exact private base `9740984014108c48…`, active digest equal to
that base and empty RAM inventory; its launchd job was then stopped. This
verifies private trial rollback, not reboot restoration of the saved original
sixteen modules. No power cycle or new RAM boot was needed for this update.

The actual frontend reviewed that baseline and all seventeen exact 0.1.66-set
package hashes. Physical self-test passed: 17 live/intact, seven DSP modules
exercised, zero failures, CPU field 649 (64.9%) and frame-gap field 51,520.
Module SHA-256 is `05512de0888638d0…` on unchanged private base `9740984014108c48…`.
A fresh diagnostic heartbeat and actual inventory confirm the trial is running.
The helper has no deadline or scheduled Undo. No Keep, flash, saved-set write,
project/sample save or new GitHub push occurred. Contributor 0.1.66 panel/audio
results, final verified Undo, physical short-commit timing and the earlier
extended-emulator cancellation investigation remain pending.


## First-slice recorder-buffer report and isolated trial — 26 October 2026

On the all-seventeen 0.1.66 trial the contributor reports that slice 1 sometimes
fails to trigger when Flex uses its recording buffer, while file-backed Flex
works. They confirmed recording had fully stopped, manual triggering also
missed, and the same buffer also missed after using stock CREATE SLICE GRID.
These observations do not identify the cause or exonerate the module/base.
The contributor requested investigation of Beat Slicer first and a trial
containing only Beat Slicer; no companion-module source was changed.

The actual controller/service host fixture now also checks the closed state
following a confirmed recorder grid. All 64 key codes and six encoders pass
through, 32 idle tick/draw calls perform no source recapture or mutation, and
the complete source/frame remains unchanged, including first slice start 0,
end 58,800. Host sanitizers pass; the target-only descriptor test was skipped
on this host. This is an input/metadata regression, not audible playback proof.
No Beat Slicer production code changed during this investigation.

After fresh stopped confirmation, the existing all-seventeen trial completed
verified whole-set Undo to exact private base `9740984014108c48…` with empty
inventory; that helper was stopped. The actual frontend then reviewed and
loaded the identical 0.1.66 package `05512de0888638d0…` as the only module.
Physical self-test passed: one live/intact module, zero failures, no DSP module
exercises. Actual inventory contains only `c8d078f2` / beat-slicer and a fresh
heartbeat confirms the solo trial is active. No new base boot was needed, and
no Keep, flash, saved-set or project/sample writes were performed.

The saved original sixteen modules remain on the card, outside this private
RAM set. The contributor's first-slice comparison on the solo trial is pending;
root cause and solo final verified Undo remain unestablished. Private receipts
are under `review-840/candidate66-solo/hardware1/`.


### Preliminary solo result and native binding comparison

The contributor subsequently reports **no misses so far** with only Beat Slicer
loaded and considers a companion interaction likely. This is a preliminary
negative observation on the identical 0.1.66 module, not a completed stress
qualification or proof of which component caused the all-seventeen failure.
The solo trial remains active and unchanged.

A private authored CPU probe compared 24 synthetic full stock voice-bind states
with and without the two unchanged Recorder Loop Fix seek/counter hooks.
Completed file-backed Flex and recorder-buffer sources used identical slice
records. For same-generation recorder slot 128, first-slice start 0/end 44,100,
and old positions 44,100 or 176,400, stock returned restart flag 256 and bumped
the voice counter 77 -> 78. The two hooks instead returned continuation flag 0
and retained counter 77, with unchanged selected slice extents. Recording state
was inactive. This reproduces a potentially relevant change in restart
signalling, **not** an audible missed trigger: no DSP, scheduler or hardware
playback was exercised. It does not establish that Recorder Loop Fix caused
the contributor's symptom. Private source/hash/log receipts are under
`review-840/first-slice/`; no firmware or extracted stock code is committed.

A two-module comparison containing the identical Beat Slicer 0.1.66 and the
unchanged released Recorder Loop Fix 0.1.0 is prepared and passes frontend
offline package/Undo validation. It has not been loaded; the contributor's
choice and fresh stopped confirmation are pending. No companion-module
production source was changed and no fix or publication is claimed.


### Two-module hardware comparison loaded

The contributor chose the prepared comparison and freshly confirmed stopped.
The existing solo trial completed verified whole-set Undo to exact empty
`9740984014108c48…` RAM baseline, and its helper was stopped. Actual frontend
review and trial then loaded only Beat Slicer 0.1.66 (`c8d078f2`) and unchanged
Recorder Loop Fix 0.1.0 (`823e0f45`) on that same base. No reboot or source fix
occurred. Physical self-test passed with two live/intact modules, zero failures
and no DSP module exercises; actual inventory and a fresh heartbeat confirm
those two modules only. No Keep, flash, saved-set, project/sample write or new
GitHub push was performed. The contributor's missed-trigger comparison and
final verified two-module Undo remain pending. Private lifecycle receipts are
under `review-840/candidate66-recorder-loop-ab/hardware2/`.


### Miss returned with Recorder Loop Fix added; independent trial started

The contributor reports that the miss **returned** when the only added module
was unchanged Recorder Loop Fix 0.1.0. Beat Slicer 0.1.66, base, and requested
buffer/test remained the same; the prior solo report was no misses so far.
This strongly isolates an RLF-enabled failure in this setup. The precise DSP
failure mechanism is still inferred from the native restart-signal comparison,
not independently captured audio or a hook-by-hook hardware test.

After fresh stopped confirmation the two-module helper completed verified Undo
to exact empty private base `9740984014108c48…`. A return to solo Beat Slicer
had already started when the contributor instead requested **Recorder Loop Fix
only**. That interim load passed its one-module self-test, then completed
verified Undo without a panel-test handoff. The still-current stopped
confirmation was used; both superseded helpers were stopped.

Actual frontend review/load then installed only unchanged released Recorder
Loop Fix 0.1.0, SHA-256
`bd1673b302a9e3db7cba0eec181224c1b976e699753f7201e93807e7fd833f4c`.
Physical self-test passed: one live/intact module, zero failures, no DSP module
exercises. Actual inventory contains only `823e0f45` / Recorder Loop: Beat Slicer
is absent. A fresh heartbeat confirms this trial is active on the unchanged
private base. No base boot, Keep, flash, saved-set or project/sample write, new
source fix or GitHub push occurred. The contributor's RLF-only stock-grid
comparison and final verified Undo are pending. Private receipts are under
`review-840/recorder-loop-only/hardware1/`.


### Miss reproduced with Recorder Loop Fix alone

The contributor confirms the miss still occurs in the Recorder Loop Fix-only
trial with stock CREATE SLICE GRID; actual inventory excludes Beat Slicer.
Together with the solo Beat Slicer no-misses-so-far report and the return of the
miss when only RLF was added, this isolates an RLF-enabled playback problem in
this setup. Beat Slicer is not required to reproduce it. The exact downstream
DSP mechanism and individual-hook causality remain inferred from the native
restart/counter comparison, not independently audio-captured. No production
source fix, first-marker offset workaround, companion release or external issue
submission was made. The unsent diagnostic report is private under
`review-840/first-slice/REPORT.md`. RLF-only remains the active RAM trial;
fresh stopped confirmation is required before Undo or another load.


### Upstream report submitted

At the contributor's explicit request, the diagnostic report was submitted to
Recorder Loop Fix's source repository as
[sambanks/octabam#908](https://github.com/sambanks/octabam/issues/908) and read
back verified open under @twwwy. It names the Modwerk port/private base, notes
that clean upstream firmware has not been tested, and separates the hardware
reports from the synthetic CPU evidence and suspected mechanism. @sambanks is
mentioned. No production fix, code push or device change accompanied reporting;
the Recorder Loop Fix-only trial remains active.


## Requested sixteen-module set without Recorder Loop Fix — first attempt

The contributor requested Beat Slicer 0.1.66 plus the original companions
excluding RLF: sixteen modules total. After a fresh stopped confirmation, the
RLF-only helper completed verified Undo to exact empty private base `97409840…`
and was stopped. Package hashes/versions were preserved from the earlier
seventeen-module candidate, with only RLF excluded; actual frontend preparation
and physical review passed.

The first sixteen-module load failed the physical self-test with
`SELFTEST_NOT_BACK` (32): 16 modules intact, seven DSP modules present, five
exercised, CPU field 686 and frame-gap field 51,569. It was **not** handed over
as a passing trial. The frontend automatically rolled back and the helper
exited. Fresh read-only status/inventory verified normal phase, known active
state, exact empty `97409840…` baseline and zero live modules. No blind rollback
or uncertain write was replayed. Receipts remain private under
`review-840/candidate66-no-recorder-loop/`.

One fresh full trial of the identical packages was reviewed from that verified
baseline, with the self-test requirement unchanged and the failed session guard
preserved. It is a new transaction, not adoption or replay of an uncertain one.
The cause of the first track-restoration failure remains unestablished; this is
separate from the reported recorder first-slice issue. Final second-attempt
status is recorded below once observed.


### Second identical-set attempt also failed; both rollbacks verified

The second sixteen-module attempt again failed `SELFTEST_NOT_BACK` (32), with
16 intact, seven DSP modules, five exercised, CPU field 688 and frame-gap field
50,956. It was not handed over. The helper exited after frontend failure
handling. Read-only status/inventory independently verified normal phase,
known active state, exact empty `97409840…` private baseline and zero live
modules. Both failed attempts and readback receipts are retained; no failure
was waived and no uncertain upload was adopted or replayed.

The contributor was asked for a fresh power cycle/reconnection with transport
stopped before another load, and reminded that restarting clears recorder-buffer
audio. No automatic power cycle or flash was performed. Original flashed base
and saved-sixteen verification is required after their restart, before another
RAM boot/load. Current state is empty private RAM base, no active trial/helper;
the requested sixteen-module set is not running. Cause of the repeated
self-test track-restoration failure is still unestablished and separate from
the RLF first-slice report.


### Fresh-reboot sixteen-module load passed — 26 October 2026

The contributor confirmed a restart/reconnection. After one read-only stale
USB-handle failure, a fresh read-only connection verified the original flashed
base `77226ffc…`, normal/known status and all sixteen saved module IDs/names.
Exact private base `9740984014108c48…` RAM-booted; actual frontend review matched
its empty baseline and all sixteen target package hashes (Beat Slicer 0.1.66
plus fifteen original companions, Recorder Loop Fix excluded).

This fresh-boot load **passed** physical self-test: 16 live/intact, seven DSP
modules exercised, zero failures, CPU field 523 (52.3%) and frame-gap field
55,058. Actual inventory matches all sixteen reviewed IDs and excludes RLF's
`823e0f45`; a fresh diagnostic heartbeat confirms the trial is active. Beat
Slicer remains the identical `05512de0888638d0…` package. This passes after the
restart; it does not establish the cause of the two earlier restoration-check
failures or claim a self-test code fix.

The contributor was told ready. The trial has no deadline or scheduled Undo.
No Keep, flash, saved-set or project/sample write, new source fix or code push
occurred. The saved original sixteen-module set on the card remains unchanged
and includes RLF; exclusion applies to this active RAM trial. Final verified
Undo of this sixteen-module trial remains pending. Private lifecycle receipts
are under `review-840/candidate66-no-recorder-loop-freshboot/hardware16/`.


## Author public-beta approval and recording-workflow description

On 26 October 2026, @twwwy supplied the five-step Recording Workflow and
explicitly approved the current 0.1.66 version as ready for public beta. That
text is retained in README.md and presentation metadata: start on a downbeat,
record an arbitrary musical length, set the original BPM, choose beats per slice,
then sequence slices at their corresponding intervals. Documentation also states
the available-memory/64-slice limits, trim-start anchoring and the existing
64-frame tail rule. No runtime source changed for this description/approval.

This is the module author's beta sign-off on the tested private package; it
does not approve the unshipped shared base/API, fill untested timing/persistence
checks, or assert that a public beta is already published. The shared proposal
remains in #914 and first-release approval belongs to the Modwerk owner. The
current sixteen-module RAM trial without RLF remains active, with no new device
load or save for this documentation change. Publication, once approved and live,
uses the normal follower notifications; a PR push itself does not send them.

## 0.1.66 documentation UI captures

Normal-boot emulator capture on 26 October 2026 installed the exact 0.1.66
package through the USB loader on private base `97409840…`. The actual SLICE
action menu and completed CREATE BEAT GRID draw with 2 beats were rendered
at integer 6x scaling and visually inspected. `media/capture.json` binds the
emulator, MAIN image, package set, driver and disposable card hashes. The
menu places CREATE BEAT GRID above CREATE SLICE GRID; the popup shows
SAMPLE BPM 120.25, 2 beats and 2 slices. This capture-only run does not
claim functional-suite completion, audible playback or USB Undo qualification.
Raw LCD planes/card/logs remain private. No physical unit was accessed.

## Physical playback replacement report — 27 October 2026

A contributor's MKII ran a fresh private build from base proposal #914 commit
`5fc2c4717e3f21a7dc36e0cac05a15a3f78debc6` plus Beat Slicer #840 commit
`4a01dae04e1789e8c4d2da03704e4f871d8cb663` (0.1.66, provisional event 35):

- RAM base: `8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`.
- Module SHA-256: `5e5e1e41257b0f290110e47ee6881a485661fc1daafa0986a7dd7ae6e6ca1e03`
  (5,776 bytes). Module C sources are unchanged from the earlier .66 package;
  its longer hook list follows the move from event 32 to 35.
- Source-built native/browser BIN parity:
  `d995496790bac6429c10fcf64cdfac01f7a4ba6decc019de6a38915272367acc`
  (775,296 bytes). Private firmware and raw diagnostics are not committed.

After the contributor confirmed a power cycle, stopped transport/recording and
a disposable test project/sample copies, read-only checks verified the original
flashed base and sixteen saved module IDs. The private RAM base was then booted
and reviewed from its empty baseline. Actual singleton upload and device
self-test passed: one live/intact Beat Slicer module, zero failures and no DSP
modules. Recorder Loop Fix and all companion modules were absent.

The contributor then tested slice creation/replacement during the instructed
same-source slice-trig playback workflow and reported the following. This is
contributor-reported panel/audio evidence, not an independent audio capture or
physical interrupt-timing measurement.

| Source | Pattern BPM | Sample BPM | Sample length | Beats per slice | Contributor report |
| --- | --- | --- | --- | --- | --- |
| Flex recorder buffer, recording completed | 120 | 120 | 9.14 bars | 4 | Slicing, re-slicing and playback were flawless. |
| Flex file slot | 108 and 120 | 108 and 120 | 6 and 15.9 bars | 1 and 4 | Flawless; both settings tested. |
| Static file slot | 108 and 120 | 108 and 120 | 6 and 15.9 bars | 1 and 4 | Flawless; both settings tested. |

The contributor clarified that the bar counts are sample lengths and reported
**more than 20 minutes of testing overall**. Separate elapsed times for each
source and a full pairing of the file-slot values were not supplied; no
per-source duration or additional cross-product coverage is inferred.

The private helper recorded USB loss at 10:41 Taipei time on 27 October.
The author confirmed they deliberately powered the machine off, then unplugged
USB after testing. On the next power-on, they reported Beat Grid was gone and
the other modules returned. A fresh read-only check before the later Undo test
verified original flashed base `77226ffcdc7ebc704040c92530dfd40401896ba7567450494a1a917686f7088d`
and all sixteen saved module IDs/names. The interrupted playback run's final
USB Undo remains unverified; the separate successful run below does not relabel it.
No Keep, flash, sample/project save, persistence or final Undo result is claimed. Exact physical short-commit
timing, complete scheduler/Pickup coverage and extended cancellation remain
open. These results belong to the event-35 build above; the later merge of
#912 allocates event 35 to `ev_trig_muted`, moving this proposal to 36. They are
not relabeled as tests of a regenerated event-36 base or default beta build.
The board, service, menu, hooks and action implementation files still match
the tested snapshot byte for byte; this source comparison does not qualify
the different complete binary or its physical interrupt timing.

Documentation update only: the PROJECT BPM time-stretch guidance was added to
README and presentation usage at the contributor's request. Beat Slicer does
not change stock time-stretch or sample ATTR BPM. No runtime/version change.


### Separate same-build USB Undo verified — 27 October 2026

The author explicitly requested completing the USB Undo test and confirmed
stopped playback/recording, connected USB and a safe/disposable project.
At 20:36 Taipei time, a fresh read-only connection verified the original
flashed `77226ffc…` base, normal/known state and all sixteen saved modules.

The exact playback-test private base `8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`
was RAM-booted again. A new single-use review bound its empty active baseline
to the identical Beat Slicer 0.1.66 package
`5e5e1e41257b0f290110e47ee6881a485661fc1daafa0986a7dd7ae6e6ca1e03`
(5,776 bytes; provisional event 35). No interrupted session was resumed.
Actual singleton trial and physical self-test passed: one live/intact module,
zero failures and no DSP modules. The authorized USB Undo then succeeded.

At 20:37:54 Taipei time, a separate fresh read-only connection independently
confirmed the same private base, normal phase, known active digest exactly
`8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`
and the original empty inventory. This is an observed same-build hardware
USB trial/self-test/Undo result. No Keep, flash, sample/project save or new
audio test occurred. Receipts remain private under
`usb-undo-20261027/hardware1/`; no firmware or raw diagnostics are committed.

The verified Undo restores the empty private RAM baseline. Returning to the
flashed base and saved sixteen-module set after this new run needs a user
power cycle; no post-test power-cycle result is claimed here. The earlier
power-off/interrupted-run outcomes and later event-36 build qualification
remain separate.
