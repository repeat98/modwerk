# Private 0.1.68 candidate

Module SHA-256: `195d2b46e2620bd15118478aa02d626d6d803692e02c40db4f45a67f6927b643`.
Private base identity: `852856cdb93a672cfd9060a120edd15fc17da4269d3bd119228881ab9c0adcc6`.
MAIN SHA-256: `848f9860e71914f08d206156d261c1b15aa79348bda78c31bcfa11fab2155add`.
Uninstrumented hardware and full-OS emulator boot: **not tested**.
Separate measurement bases have partial MKII evidence in
[the first hardware record](hardware/HARDWARE_2026-10-30.md) and the subsequent
[full-set trial](hardware/FULL_SET_2026-10-30.md). The completion-status fix was
rebuilt and passed the limit/status check on the second base with all 19
modules. Its subsequent bounded full-set Undo failed. An owner power cycle then
restored the original base and exact 19-module set, verified before loading the
cumulative build described below. The failed Undo remains unqualified.

## Cumulative 0.1.67 inheritance correction

The earlier 0.1.68 measurement builds omitted the separately staged FUNC + AED
cycle. The private source proposal now includes it alongside SNAP and the
completion-status fix. [The cumulative build receipt](hardware/cumulative-build.json)
pins base `20ed7910…`, MAIN `8ede9cf9…` (1,306,295 bytes) and the unchanged
5,332-byte module. [The cumulative hardware record](hardware/CUMULATIVE_2026-10-30.md)
observes the stock-first cycle, both switching directions, held FUNC/repeated
AED, retained SNAP ON and unchanged source/markers/Parts, plus a passed 19-module
self-test. The trial was left running without a host deadline. No new alignment
was applied in this control check; earlier alignment evidence remains scoped to
its own base. The previous build's full-set Undo failed and required an owner
power cycle; the cumulative build's Undo is untested.

All five shared font/frame, preview and planner sources match the approved
0.1.67 native-UI candidate byte-for-byte. The actual combined menu/service
regressions cover stock-first cycling, both directions, held FUNC/repeated AED,
duplicate key-downs, foreign dialogs, busy/stale/retired sources, multiple
contributors, and FUNC/AED cancellation during SNAP analysis. The controller
and cache tests and all 174 decoded-PCM comparisons pass. The immutable native
build, descriptor compile, codegen/layout, module-set/service/menu/SNAP,
stock-free and bootloader-safety checks pass. Three base-bound companions were
rebuilt; the reviewed 19-package set has 72 non-overlapping guarded stock sites
and every site/copy guard matches the exact new base.

## Observed software checks

- Existing service/menu/board/action tests pass with sanitizers. New tests use
  the actual proposed service and board against authored pair/metadata models.
  They cover confirmation-only admission, 32-pair chunks, no pre-YES PCM,
  channel selection, source mutation during reads, retirement, NO/cancel,
  native-style errors, the 65,536-pair limit and minimum-length refusal.
- The actual board queues resident work and publishes once after completion.
  Cancellation, source mutation and retirement before dispatch read no PCM.
  A transient BUSY does not requeue itself; resuming needs a later UI attempt.
  Menu tests cover completion, NO, other keys, encoders, replacement questions,
  source retirement and failure notification without a second alignment prompt.
- Existing client/controller regressions pass. C pulses accumulate in the same
  way as A/B, including large and reversed turns. C changes only its value
  pixels. OFF follows the existing marker path; an older API retains OFF.
  Cached and uncached composition remain equal throughout the input fixtures.
- Pinned MCF54455 compilation/codegen checks and exact-package reproduction
  pass. Six base/editor tests and both client/package tests pass in the
  isolated immutable toolchain.
- The exact package executes native font/frame drawing with zero pixel
  differences from the approved OFF and ON prototypes. First draw makes one
  frame and twelve plain-text calls; 120 idle draws rebuild neither. C
  invalidates the popup once and changes only its value. Live home composition,
  unaligned destination canaries, unchanged metadata/stock planes, return
  stack, saved registers and interrupt-mask checks pass. The observed initial
  draw stack is 548 bytes, not a whole-task stack bound.
- The private base builds with its normal shared pipeline, newly encoded
  controller trust rows, source/codegen guards and RAM packing. Stock-free and
  flash-safety scans pass. Packed MAIN is 1,304,967 bytes, within the 1,310,720
  byte RAM boot limit. These checks authorize neither flash nor publication.

The search comparison scope and defensive differences are in [RESEARCH.md](RESEARCH.md).
The CPU fixture uses reviewed Octabam `8250be0c…`, mc68k `4a6d0d17…` and the
toolchain in `build.json`. No software observation above is hardware evidence.
The listed-module doctor is green for published 0.1.66, not qualification of
this source proposal; the draft doctor correctly refuses a duplicate listed ID.

## Offline hardware preparation

The original WAV pack contains 58 files: mono/stereo 16/24-bit cases, split and
tied stereo crossings, exact/anchor zeros, antiphase, silence/DC, distant/edge
cases, work/minimum limits, fractional trim/BPM, 64 slices and synthesized drums.
All 174 decoded-PCM channel expectations match the actual proposed C search,
including complete points, result and pair-read count. This is offline evidence.

Preparation tests cover rejection of wrong starts/ends/loops, inactive rows,
formats, source identity, incomplete analysis and completion status; complete
table preservation on cancellation; stock-comparison admission; target-offset
snapshot decoding; full Flex PCM mismatch; timing carry/wrap and the narrow
read-only sample-settings access. Actual overlaid board/service regressions
pass. The immutable MCF54455 compiler reproduces the unchanged module package.
The preparation driver also passes under Linux/GCC with the ColdFire compiler
available: minimal staging retains the normal C builder's exact generated title
catalogue, and both real package descriptor builds run instead of being skipped.

A separate private measurement base, rebuilt after merging upstream main
`1bbc8b46`, is recorded in [hardware/measurement-build.json](hardware/measurement-build.json):
identity `7fe69c80f6c04a0092fd82076c22865e2a52bf9fcab567f77cbca547e55f614a`,
MAIN SHA-256 `b3026b173ed64aa22e1414a38e322ee79a7a3fafc5b7e81b74f323573f46a212`,
1,305,223 bytes. Normal source/codegen/layout, stock-free and flash-safety
scans, module-set and base/editor tests pass. It adds scan/metadata-writer
wall-time counters and read-only observation, not a new stock hook or save.
Results on it do not qualify the uninstrumented candidate named above.

[hardware/README.md](hardware/README.md) describes the WAVs, baseline/export,
guarded captures, full Flex PCM verification, exact record comparison and
recovery. A focused subset was tested on the MKII after verified file staging
and a fresh original-set baseline; the review matrix's 696 rows were not
completed. The hardware record distinguishes passing marker comparisons from
the failed limit-status check and documents restoration of the original base
and 19 modules. No whole-OS emulator boot was performed.

## Exact-build hardware plan

Use the normal USB trial workflow, a stopped disposable project and authored
test samples. Identify the original base and full saved module set, prepare
verified rollback, and use RAM only. Do not save the owner's current project.

1. Verify the base and module hashes above. Open from AED, confirm the approved
   stock font/frame/backdrop and C OFF. Check both stock menu variants, reopening,
   substep/reversed/large C turns, inert D–F and absence of idle re-rendering.
2. Compare SNAP OFF with the current mathematical grid for every spacing and
   both BPM sources, including fractional BPM, trims, short tails, empty
   recorders and 64 slices. Require exact complete start/end/loop records.
3. Compare valid stock grid results with SNAP ON on authored 16/24-bit
   mono/stereo Flex and Static samples. Exercise left/right/both views, exact
   zero, either sign direction, ties, silence, DC, split/antiphase channels,
   page/stream boundaries and a final end inside/outside trim. Check defensive
   no-crossing, full-sample-edge, short-slice and read-failure outcomes separately.
4. During long analysis, cancel with NO and other keys/encoders; change source,
   trim, sample content, project or owner; remove/update the module; record into
   the edited buffer and an unrelated recorder. Require no stale callback,
   partial table, PCM change or write to another source. Test completed
   recorder buffers independently of file-backed Flex.
5. Time closed/open idle, C turns, each chunk, maximum metadata-writer delay,
   audio frames, USB response and total analysis on these exact builds.
   Include long Static/DC files and work-limit/BUSY cases. Read-count bounds
   are not wall-clock bounds; qualify Static IO and frame/DMA deadlines on unit.
6. Audition forward/reverse sliced playback, slice locks and time-stretch
   off/on. Save/reload only disposable copies; distinguish working markers,
   sample-settings save and project save. No persistence or click-free result
   is assumed.
7. Run USB self-test, Undo/remove the trial, power-cycle once and verify the
   original flashed base and all original modules. If USB fails to return
   after RAM boot, recover by power cycle before another attempt. MKI
   qualification and publication remain pending unless separately observed.

The original implementation/preparation made no device changes. The subsequent
hardware batch used a RAM boot and temporary module trials, then Undo and an
owner power cycle; no Keep, flash or project/sample save was performed.
