# Cumulative private 0.1.68 MKII trial, 30 October 2026

This build carries the approved 0.1.67 UI/cache changes and the separately
staged FUNC + AED cycle forward into the 0.1.68 SNAP proposal. The owner
authorized replacing the prior trial, discarding temporary changes if needed,
and leaving the full 19-module RAM trial running without a host deadline.

## Recovery, exact build and installation

After the previous full-set Undo failed, the owner power-cycled. Read-only
verification confirmed the original flashed base, exact active-set identity and
all 19 module IDs/layouts/names against the original baseline before any load.

- Original base:
  `a542a515c1955b9264712073bb40c81a492f1a993bfa991640d111eb03aaa130`.
- Restored original active set:
  `3d66fbdb220385aef4959ad2aa8d589c9b4082ccdfd29d046574839d75390b77`.
- Cumulative measurement base:
  `20ed79108facb38d72b1e21105a3fd598bc45b76da39e667d6ad1c9b9a67410e`.
- MAIN SHA-256:
  `8ede9cf9d702f93acbbfede4ade157c11abf7a18d6ddab0000ab68b48a84fb3f`;
  1,306,295 bytes, below the 1,310,720-byte RAM boot limit.
- Unchanged module SHA-256:
  `195d2b46e2620bd15118478aa02d626d6d803692e02c40db4f45a67f6927b643`.
- Implementation commit: `33ba5bca`; source patch SHA-256:
  `55eed466a26d1a78997d40d9282f5598b2adbe86e24227643ddc3eacb9b86295`.

The 19 reviewed packages comprise fifteen unchanged original packages, relinked
Analog BD/Sidechain Compressor/CC Map companions, and development Beat Slicer
replacing the original one. Every package hash and every stock-site/copy guard
was checked against the exact compiled base; 72 sites have no cross-package
overlap. The device acknowledged the whole upload, TRIAL phase and length, and
all 19 inventory rows matched the review. No claim is made that the canonical
set digest was read while the base retains its whole-set trial rows.

The confirmed trial started at 07:43:12 UTC. Raw receipts, snapshots, screenshots,
logs and the running client stay outside Git in
`~/.cache/modwerk-beat-slicer/zero-cross-20261030/cumulative-trial-20261030T072137Z/`.
The old trial's failed Undo remains a failed lifecycle result; recovery by power
cycle does not turn it into a successful Undo.

## Observed shortcut and SNAP-control behavior

On the physical MKII, OS 1.40C, with all 19 modules installed:

1. First FUNC + AED from the track page opened stock CREATE SLICE GRID. The
   native chooser's label/callback pointers identified the stock path.
2. Second FUNC + AED opened CREATE BEAT GRID with C: SNAP OFF, retaining the
   approved font, frame, height and home backdrop.
3. Encoder C set SNAP ON. Four further chords alternated stock/Beat options.
4. Holding FUNC and re-tapping AED switched to stock and back to Beat Grid.
5. NO closed Beat Grid. A fresh chord opened stock first; the following chord
   opened Beat Grid again. SNAP ON survived the switches and reopening.
6. All active/inactive start/end/loop records, count, source controls, slot/kind,
   format, frame count, trim and BPM stayed identical throughout the checked
   transitions. Pair reads remained zero and the scan counter did not advance.
   No YES selection or create/replace confirmation was sent in these checks.

The selected sample was the existing Flex slot 1 (internal slot 0), 118,400
frames with six existing slices. This was a non-mutating control/integration
check, not an authored-fixture alignment run or a click-free audio test. The
earlier stereo/limit alignment results belong to their separately named base;
they do not become new hardware results for this cumulative base.

The shared font/frame, preview and planner sources remain byte-identical to
the approved native-UI 0.1.67 candidate. Actual combined source regressions also
cover held/repeated/duplicate keys, busy/stale/retired sources, foreign dialogs,
multiple action contributors and FUNC/AED cancellation during SNAP analysis.

## Full-set self-test and Part observations

The USB self-test passed: 19/19 modules intact, seven DSP effects, 7/7 ran
together. It reported CPU peak 89.9%, DSP peaks T1–4 83.5% and T5–8 83.7%, and
longest observed frame 388 microseconds. These are self-test observations on the
current track/FX configuration, not a controlled CPU-cost comparison or a
worst-case deadline/audio-quality proof.

The current working Part already differed from its saved copy after the RAM
boot; the earlier native Reload had not reset it, and no successful reset is
claimed. This batch did not change the Part's machine, sample assignment or FX
settings. The final 6,322-byte working and saved copies each matched their own
post-RAM-boot baseline exactly. The sample's complete marker table was also
unchanged. Browsing SRC SETUP was cancelled without assigning a source.

## Handoff and qualification limits

The cumulative base and all 19 modules were left running, playback stopped,
with CREATE BEAT GRID visible and SNAP ON. Detached owned USB-link and trial
clients retain the trial without a host deadline; the Mac and USB connection
must remain available. No Keep, flash, explicit Part/project/sample save or
upstream push was performed.

This trial has not been Undone or reboot-restored. Its full-set Undo is
untested; the previous build's failed Undo is not resolved by this feature
carry-forward. Ending by owner power cycle returns to the original flashed
base and saved modules, which should then be verified again before another load.

Exact cumulative-build alignment, 24-bit formats, broader boundary/BPM/grid
cases, recorder/concurrent writers, extended audio/listening/persistence, the
uninstrumented candidate and MKI remain pending. Software and UI tests do not
qualify these unobserved behaviors. No public release is authorized.
