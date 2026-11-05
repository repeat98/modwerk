# Stock-style UI candidate — 30 October 2026

Exact package: `20ce427629de295c373e69965c12d2ea370c217a22dde0ecf76d76789a169291`.
This is private 0.1.67, not the earlier `cef16d7d…` cache-only trial.

## Observed software results

- Host controller/service/cache test passes with Apple Clang and sanitizers.
  The existing create/replace, cancellation, stale/busy source, short-tail,
  recorder, spacing and input cases are retained. C–F remain inert. The new
  backdrop case changes the home plane independently of the composed AED frame
  and confirms fresh home pixels without rebuilding the popup.
- Reviewed MCF54455 compilation and the shared stepped-register/index guard
  pass. The 4,976-byte package reproduces exactly from the six recorded inputs;
  action descriptor bounds/alignment, module ID and event index are checked.
- An isolated ColdFire fixture loads and relocates that **exact package payload**
  and zeroes its declared BSS. Symbols are extracted by rebuilding the unchanged
  three sources with the shared builder's flags/linker and comparing the full
  payload and relocation list with the package first.
- Against private original 1.40C MAIN `164f3122…`, its native frame and font calls
  execute without UI-function mocks. The full 128×64 result has **zero pixel
  differences** from the approved Mixer-height/home-backdrop prototype with
  SNAP removed. First draw: one native frame call and ten plain text calls.
- Another 120 draws rebuild neither frame nor text. Encoder C also changes no
  pixels and does not rebuild. Changing the home bitmap updates transparent
  pixels while preserving cached foreground. Closed drawing leaves its caller's
  frame unchanged.
- Native execution checks stack return, callee-saved registers, interrupt-mask
  restoration, destination canaries on an unaligned frame, no unmapped access,
  unchanged copied sample metadata and **no writes to either stock home plane**.
  The tested path's observed maximum stack depth is 544 bytes; this is not a
  static whole-task stack bound.

The CPU fixture uses reviewed Octabam `8250be0c…`, mc68k `4a6d0d17…` and the
toolchain image in `build.json`. The existing EMAC/peripheral gates passed for
that pinned fixture earlier in this session. Only this UI component executes;
there is no whole-OS scheduler, real USB, DSP/audio or hardware evidence here.
Synthetic opening state supplies SAMPLE 120.00, 64 beats and 21 slices. The home
bitmap is a prior authorized screen capture, not a live unit state in this test.

Native fixture/source identities and results are recorded in
`native-ui-evidence.json`. Private fixture source and build logs remain in the
task cache for reproduction; no firmware data is part of that receipt.

## Required exact-build hardware check

No instrument access, RAM boot, Keep, flash or project/sample save was performed
for this revised package. The developer requested private testing first.

Use the normal reviewed USB trial workflow on a stopped disposable project,
after identifying the base and original module set and preparing verified
rollback. Prefer a RAM test base with the existing sample-editor service and
profiling; power-cycle afterward and verify the original base/module inventory.

1. Open CREATE BEAT GRID from AED. Verify native font/frame proportions, full
   Mixer height, live eight-track home backdrop and no AED layer at the sides.
   Check opening from both stock slice-menu variants and, where available, the
   already tested private FUNC+AED switch. NO returns to the correct editor.
2. Leave open 10 seconds, stopped and during pattern playback. Turn A/B through
   their ranges, including large/substep/clamped turns. Verify correct BPM,
   slice count and CREATE/REPLACE/refusal text, no flicker, and inert C–F.
3. Check WAIT/source readiness, NO at CREATE/REPLACE, source changes, removal
   while open and restoration of the normal screen. Confirm the home backdrop
   is current, not a frozen capture. Exercise native alert/status overlays too.
4. Repeat ordinary slicing on disposable Flex, Static and completed recorder
   sources. Require unchanged marker results; check playback separately. No
   zero-crossing option or behavior may appear in this version.
5. Measure closed, open idle and A/B-turning draw time on the exact same base
   and sample as the baseline. Include first/changed drawing, frame guard and
   skipped-render counts; the CPU meter alone is insufficient. Record new
   results rather than carrying the old cache-only timings forward.
6. Run actual self-test, Undo/remove the trial, and verify original base and
   inventory after the agreed power cycle. Persistence and MKI qualification
   remain untested unless separately performed and recorded.

New native UI addresses need owner review. Publication, a release-author
qualification assertion and a live-download claim remain pending hardware
evidence and the ordinary release workflow.
