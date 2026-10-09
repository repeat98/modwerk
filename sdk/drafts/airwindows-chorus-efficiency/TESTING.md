# Air Chorus efficiency test record

Candidate 0.1.1-experimental, recorded 9 October 2026. **Unpublished and
hardware-untested**, kept staged at the owner's request. The current 0.1.0
hardware waiver remains unchanged and does not apply.

## Sound and DSP behavior

The published DSP is the baseline: source SHA-256
`fa200e6d4d74b5b372b390a208c05195a516afc914eec9f796e8baee480c265b`.
The candidate source SHA-256 is
`cd8040e05a8a6e39e0abb601b60508358bdf6e7563a42e57348a92ae67e861ae`.
The candidate assembles to 399 words at synthetic P:0x2000 (published: 455),
SHA-256 `9dce8f87de6eebaba460b4d1a47da00d14f25faaa5d44d3bae9b64dc72d3bff9`.
Source, assembled-program and complete firmware hashes are different identities.

`verify_optimization.py` passes **30 bit-identical stereo comparisons**, each
32,768 frames: six endpoint/default fixtures, moving controls at all sixteen
split offsets, and eight reproducibly randomized starting control triples.
Input is independent full-scale seeded noise and a 0.98-FS 19 kHz tone. Each
starts with dirty memory and crosses the 8,192-frame valid-history transition
and multiple ring wraps. Total compared output: 983,040 stereo frames. The
baseline and candidate execute in the actual DSP interpreter. No audio-difference
tolerance is used. This is finite regression evidence, not a mathematical
proof for every possible signal or a hardware listening test.

The unchanged published float-reference, bypass, dirty-state, stereo,
control-click and eight-instance gates also pass. Largest float-oracle error
remains 0.00117292 FS in the extreme finite fixture, exactly as before. MIX 0
remains bit-exact dry. A burst settles to digital silence. All control click
fixtures pass, and eight simultaneous FX2 instances across both modeled cores
match their isolated renders. FX1 dispatch remains dry without buffer writes.

Reports: [optimization-parity.json](evidence/optimization-parity.json),
[software.json](evidence/software.json), [controls.json](evidence/controls.json),
[instances.json](evidence/instances.json). The full separate aliasing/clipping/DC
`fx:audit` plan was not rerun for this candidate; those measurements remain
historical. Exact-output comparison covers the listed fixtures only.

## Matched stock comparison

The draft `benchmark.py` runs both published and candidate private native
images, stock CHORUS and stock SPRING REV on both payloads. Conditions: X:0 audio,
44.1 kHz, 16 frames/block, 4,096 blocks/case, one instance per core,
identical tone/transient sources, and null overhead subtracted separately for
each core/split. Every effect covers fixed and moving controls, including
endpoints/types and all sixteen split offsets 0..15. These are observed finite
maxima, including first-call seeding and the Air Chorus cold-history path,
not chip timing or an exhaustive worst case. The separately metered init
routine costs 75 executed instructions per Air Chorus instance in both versions;
it is excluded from the processing-block figures below.

| Effect/version | Net peak executed instructions/sample |
| --- | ---: |
| Published Air Chorus 0.1.0 | 524.500 |
| Candidate Air Chorus 0.1.1 | 336.750 |
| Stock Spring Reverb | 314.000 |
| Stock Chorus | 292.875 |

Reduction: **35.80%**. The candidate is 1.072× the measured Spring maximum
and 1.150× stock Chorus. The previous unsplit stock Chorus result was 253.625;
adding the split calls raises that comparator's observed maximum. Both Air
Chorus maxima and Spring's maximum are unchanged by the expanded coverage.
All 128 cases, per-core rows and exact image/tool identities are in
[stock-comparison.json](evidence/stock-comparison.json).

## Eight-instance stress and performance audit

The final candidate passes 85,444 blocks (31.00009 seconds of simulated audio)
with four independent FX2 instances per core, dirty initial memory, canaries,
and split offsets 1/8/15/0 on each core. Three tempo-derived target streams and
twelve locked parameter-byte slots are replayed per instance; only SPD/RNG/MIX
are active. No guard failure, clobber or hang occurred. This is a DSP replay,
not a ColdFire sequencer, hardware deadline, scenes or persistence test.
See [stress.json](evidence/stress.json).

`npm run perf:audit -- check sdk/drafts/airwindows-chorus-efficiency/evidence/performance.json`
passes its record, stock-comparison and stress checks. The audit notes a
modeled four-instance cost of 1,980/3,120 units per sample per core (63%).
That arithmetic does not establish the headroom left for stock FX1, voices,
streaming or other modules on physical hardware; their combined workload
still needs timing/acceptance evidence. See [performance.json](evidence/performance.json).

## Conservative code model and memory

[bounds.json](evidence/bounds.json) charges the full source-word spans,
including mutually exclusive forward branches, and adds a conservative
call/branch surcharge. It explicitly checks the revised one-call-per-triplet
topology and forward bit tests. This is the existing code-cost model, not
measured DSP cycles; it excludes contention and instruction-specific hardware
timing. Its split-call estimate falls from 725 to 495 units/sample; four
instances plus four initializations fall from 46,740 to 32,044 units/core/block.
Executed instruction counts are reported separately above.

The candidate retains 56 initialized X state words within each 256-word slot,
two 8,192-word Y rings per FX2 instance, and the unchanged 1,026-word sine
table per core. Program plus table is 1,425 P words per core. The four FX2
allocations/core and both cores' shared-window halves remain unchanged.
Modulo addressing is used only for 8,192-aligned FX2 rings and restored to
linear addressing before sine-table work. All four allocator positions are
covered by the dirty-state/instance tests. No extra heap, SDRAM, global scratch
or delay-buffer reservation is introduced.

## Reproduction

Prepare a private tree with `prepare.py` (README). Run inside the reviewed
network-disabled `octamod-tapehead-qualification-tools:local` image, with
source mounted read-only at `/source` and a private writable `/output`.
The measured image ID is `3a5861370c0f`; assembler, disassembler and DSP host
come from `/opt/toolchain/vendor/dsp56300`.

```sh
mod=/source/sdk/octabam/modules/airwindows-chorus
python3 -B "$mod/verify_optimization.py" --baseline /source/air-chorus-baseline --output /output/optimization-parity.json
CHORUS_RESULTS=/output/software.json python3 -B "$mod/verify.py"
CHORUS_CONTROL_RESULTS=/output/controls.json python3 -B "$mod/verify_controls.py"
CHORUS_INSTANCE_RESULTS=/output/instances.json python3 -B "$mod/verify_instances.py"
CHORUS_BOUNDS_RESULTS=/output/bounds.json python3 -B "$mod/verify_bounds.py"
python3 -B "$mod/build_private.py" --raw-os /private-original/section_3_MAIN_OS.bin --vendor /opt/toolchain/vendor --output /output/main.bin
python3 -B "$mod/benchmark.py" --native-sdk /private-native-sdk --module-image /output/main.bin --baseline-image /private-original/published-air-chorus-main.bin --output /output/benchmark
python3 -B "$mod/verify_stress.py" "$mod" /output/stress
```

The benchmark staging SDK is a copy of the prepared tree's `sdk/octabam`,
with toolchain `vendor` linked and the original MAIN at `out/raw`. Use
`--shm-size 256m` for both two-core benchmarks and eight-instance testing.
Never put private inputs, raw
memory, disassembly, audio or built firmware in the repository.

The staged image is compiled by the existing native builder and the saved
ELEK/ELUP update must decode byte-for-byte to that MAIN. Final identities are
in [private-build.json](evidence/private-build.json). No fresh native/browser
composition matrix, real-unit timing, Part/project/power-cycle acceptance or
publication is claimed. These remain promotion gates after hardware testing.

## Reported clicking and full-emulator playback

[CLICKING.md](CLICKING.md) records the T3/T4 report and exact reproduction.
Both published 0.1.0 and AIRC011T2 complete the generated project's 8,192
real playback blocks. The actual ColdFire records deliver the second instance's
MIX ramp 0..127. All eight tracks' input/output and both cores' control records
are bit-identical between images (262,144 active stereo frames). The reported
hardware failure remains unresolved; this result does not establish physical
headroom or authorize publication.

## Repository checks on the staging branch

The earlier base had a malformed licence inventory and an unqualified LOFI
draft in the active SDK. Main's repair in PR #341 resolved those integration
blockers. This branch now incorporates main at
`864a006128e08c8c9608a14e51f29e5675cac7d1`; Air Chorus remains paused. Only
this draft directory differs. The candidate DSP and AIRC011T2 bytes are
unchanged; the follow-up adds reproduction tools, captured evidence and a
specific T3/T4 hardware checklist. A fresh private native rebuild using this
merged SDK and the unchanged candidate DSP reproduces the complete AIRC011T2
MAIN byte for byte; see the private-build record. Fresh repository validation is recorded
in the PR. No hardware pass, promotion or new public firmware is claimed.

Node 24.21.0 / `npm ci` validation on this merged tree:

- `npm run module:doctor -- airwindows-chorus`: green for the paused published
  module; native-composition comparison is skipped while paused. This does
  not qualify the draft for release.
- `npm run check -- --base origin/main`: metadata, licence/inventory,
  generation, all 84 SDK tests, lint, types and bundle pass. The initial app
  run has seven timeouts. With `VITEST_MAX_WORKERS=1`, 1,376 of 1,377 tests
  pass; only the all-module doctor exceeds its unchanged five-second limit.
- `npm run test -- scripts/module-doctor.test.mjs --maxWorkers=1`: both tests
  pass in isolation with the original limits. Every app test therefore has
  a passing observation, but the combined check itself recorded a timeout.
- Both full-emulator playback analyzers, the exact-output comparison and the
  final fixture/card/MIDI byte comparison pass. No raw inputs are committed.
