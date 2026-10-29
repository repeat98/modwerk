# Private 0.1.68 candidate

Module SHA-256: `195d2b46e2620bd15118478aa02d626d6d803692e02c40db4f45a67f6927b643`.
Private base identity: `852856cdb93a672cfd9060a120edd15fc17da4269d3bd119228881ab9c0adcc6`.
MAIN SHA-256: `848f9860e71914f08d206156d261c1b15aa79348bda78c31bcfa11fab2155add`.
Hardware and full-OS emulator boot: **not tested**.

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

No device connection, RAM boot, Keep, flash, project/sample save or modification
of the original module set was performed in this implementation session.
