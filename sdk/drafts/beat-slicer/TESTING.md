# Beat Slicer testing

Current draft: 0.1.19-experimental. Development checks: 23–24 October 2026 (Taipei).
The chronological records below retain their own versions and source bindings;
older results do not qualify newer source or an installed module.
See the latest [Flex metadata results](#bounded-flex-metadata-0119) and the
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
