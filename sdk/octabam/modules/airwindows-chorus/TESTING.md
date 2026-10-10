# Air Chorus 0.1.0-experimental — test record

Recorded 8 October 2026. Initial experimental release. The owner reports a successful
50-minute MKII test with several instances/full knob sweeps on the first image;
fresh hardware testing of the initialization update is explicitly owner-waived. See [the hardware report](evidence/hardware-report.md).
Original source pin: `e718c9bcfcdd736deeddb08bffe6bce2aa8e0eea`.
Actual assembly SHA-256 (455 words, P:0x2000 synthetic origin):
`b5a3c90b8089142e5fd6330714ed4eb844a169c43ad445f7d082fd8c5132fbf0`. No firmware or extracted stock bytes are committed.

## Native DSP renders

`verify.py` assembles and executes the actual DSP in `dsp_host`, using synthetic
memory and inert frame-context entry points. This is an audio/DSP test, not
execution of the ColdFire project/editor/dispatcher. The toolchain image used
was `octamod-tapehead-qualification-tools:local` (local image ID `3a5861370c0f`).
Assembler/disassembler and host binaries came from `/opt/toolchain/vendor/dsp56300`.
Reports: `evidence/software.json`, `evidence/controls.json`,
`evidence/instances.json`, `evidence/bounds.json`.

- Seven static parameter fixtures versus the pinned float oracle, 16,384
  stereo frames at 997/331 Hz. Default-control peak error 0.0000507 FS;
  largest observed error 0.00117292 FS at the maximum
  speed/range. Gate limit 0.003 FS for these finite fixtures. This is bounded
  fixture agreement, not bit parity or a proof of long-term phase equivalence.
- Signed-multiply encoding census, init dispatcher-register preservation,
  loaded-memory guards, byte-exact MIX 0, dirty-state silence in all four FX2
  allocator slots and safe dry dispatch in all four FX1 slots passed.
- Stereo channel independence, dirty-state music versus clean initialization,
  scheduled control changes and 1+15, 4+12, 8+8 trig-split renders passed.
  Split outputs are byte-identical to the corresponding unsplit render at
  identical target-change samples. This models DSP calls, not ColdFire timing.
- A high-frequency burst followed by three seconds of silence reaches exact
  digital silence in the last half-second.
- Eight differently controlled/sounded instances, four on each modeled core,
  are byte-identical to their isolated renders. Both cores' shared buffer
  windows are mapped separately and memory guards pass. A 256 MiB Docker
  shared-memory allowance is required. This is not physical deadline evidence.

## Moving controls / zipper check

The adapter compiles the shared repository metric from
`sdk/octabam/tools/verify/verify_knob_clicks.py` unchanged, with its constants
and known-bad/known-good self-test. It excludes the firmware-dependent rig
render driver. Measurement self-test passes: a block-glided gain flags at
−60.7 dBFS, a sample-glided gain is clean at −92.6 dBFS.

A 438.75 Hz tone at 0.3 FS; jumps at blocks 1500/2000 and one-byte turns every
two blocks from 2500. Panel case: 20↔110, other controls 64/64/127. Endpoint
case: 0↔127, other controls at their maximums. Stereo channels are both judged.
Flag rule: a block-correlated step above −70 dBFS and >6 dB over its static
baseline. **All six control cases / eighteen windows pass.** −140 is the
measurement floor, not a claim of perfect silence.

| Case | Control | Jump up dBFS | Jump down dBFS | Turn dBFS |
| --- | --- | --- | --- | --- |
| panel | SPEED | -108.7 | -140.0 | -140.0 |
| panel | RANGE | -140.0 | -104.6 | -140.0 |
| panel | MIX | -140.0 | -140.0 | -117.0 |
| endpoints | SPEED | -140.0 | -140.0 | -97.1 |
| endpoints | RANGE | -140.0 | -140.0 | -140.0 |
| endpoints | MIX | -140.0 | -140.0 | -140.0 |

The first one-block ramps failed RANGE/MIX. A single longer slew passed ordinary
turns but failed full-scale jumps because its first sample could move the
read position by several samples. Final RANGE/MIX use cascaded 48-bit,
per-sample poles; SPEED uses one. Original interpolation is retained.
The census cannot establish a physical DSP deadline, the panel-to-r6 path,
or inaudibility below its tone/difference floor. Full knob sweeps worked well
in the owner's 50-minute MKII report of the earlier image; the changed image
has no fresh physical listening result.

## Sound-quality audit

The quality renders below were retained from the first candidate, before the
bounded-initialization change. Ten static/moving/split fixtures are sample-identical
after that change; the complete quality fixture set was not rendered again.
The guide's `npm run fx:audit` plan/check analysis was used at its unchanged
default limits (alias −60 dBc, DC −60 dBFS, idle −90 dBFS).
Static setting: SPD 0 (phase frozen), RNG 127, MIX 127. All eight tone cases
and idle pass. This checks delay-read/filter quantization without modulation.

```text
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.0      -86.9     -93.5     -83.2    -110.2       0  ok
tone-1100hz-1db             -1.0     -102.4     -98.6     -94.4     -96.0       0  ok
tone-2701hz-12db           -12.1      -98.1     -87.3     -83.1     -99.7       0  ok
tone-2701hz-1db             -1.1     -118.2    -104.7     -93.0     -87.5       0  ok
tone-5301hz-12db           -12.5     -109.2     -91.7     -81.6     -92.6       0  ok
tone-5301hz-1db             -1.5     -122.1    -111.3     -92.4     -81.1       0  ok
tone-9102hz-12db           -13.6     -115.5     -96.2     -80.5     -86.7       0  ok
tone-9102hz-1db             -2.6     -126.7    -109.0     -91.4     -75.4       0  ok
idle                    after the input stops: digital silence  OK
```

A separate SPD/RNG/MIX 127 render is retained in
`evidence/quality-modulated.txt`: five audit cases flag. Its fixed-frequency
fundamental is strongly spread into pitch sidebands, so the reported dBc
ratios are not a clean estimate of alias harmonics; high-speed delay reads
also genuinely can alias. Finite-window means reach −51.0 dBFS in one −1 dBFS
case. No rails were hit and idle reaches digital silence. Do not call the
maximum-modulation setting transparent or alias-free. Limits were not loosened
and this flagged render is not recorded as a passed sound-quality audit.

## Code budget and memory

`verify_bounds.py` refuses altered call topology, non-forward branches and
callee loops before charging whole assembled word spans at every call,
including mutually exclusive arms, plus four cycles per branch/call. The
repository's ordinary cycle counter cannot price these branched nested callees.
Model upper bound: 708 loop cycles/sample plus 129 setup cycles/call;
717 cycles/sample at 16 unsplit frames, 725 with two trig-split calls.
Initialization has a separate 99-cycle upper bound. Charging initialization
and two split calls to all four FX2 instances each block gives 46,740 modeled
cycles/core/block, versus the SDK usable budget 49,920. The theoretical
72,560-cycle core budget reserves 22,640 for stock processing/dispatcher/
transport/streaming. The remaining modeled allowance is 3,180 cycles per
block before contention stalls or other custom effects. These are conditional
software instruction-word bounds, not measured chip deadlines.
Observed interpreter costs are retained in the current software/stock reports;
executed instructions are not a chip cycle measurement. Memory stalls and complete ColdFire
stock/platform paths remain unbounded. No authored ColdFire routine exists.

Code: 455 P words; quarter-sine table plus endpoint: 1,026 P words;
combined native package: 1,481 words (4,443 bytes at 24 bits/word).
Each instance initializes 56 X words in its reserved 256-word state slot and
uses 16,384 Y words in its existing FX2 buffer without a burst clear. Four FX2 instances reserve 66,560
X+Y words per core, eight 133,120 across both cores. This includes the whole
reserved X slot and excludes unrelated stock state, stacks and platform RAM.
All 56 used state words are explicitly cleared; the other 200 reserved words are untouched. No global sample RAM is claimed
by the module itself. The loader-bearing image has separate shared platform arena costs managed by the common composer. See [MEMORY.md](MEMORY.md) for exact ranges, packed flash data, descriptor padding and charged shared stack/chooser reservations.

## Matched stock DSP cost comparison

After rebasing on main's updated FX best practices, `benchmark.py` compared
stock CHORUS, stock SPRING REV and the exact standalone Air Chorus image.
Both real payloads are dumped only to a private staging tree. One instance per
core, X:0 audio (the real stock location), identical 44.1 kHz tone/transient
inputs, 16 frames/block, 4,096 blocks/case. Null stub is subtracted per core
and split. Spring and Air Chorus cover fixed settings and the shared full
endpoint/turn/type schedule, with split offsets 0, 1, 8 and 15 on both cores.
Stock Chorus covers fixed/moving unsplit cases. This is a finite observed
maximum; all sixteen split positions and whole instrument workload remain
unqualified. No stock code/table/dump, raw schedule or audio is committed.

| Effect | Worst observed net instructions/sample |
| --- | ---: |
| Stock Chorus | 253.625 |
| Stock Spring Reverb | 314.000 |
| Air Chorus (cold-buffer path) | 524.500 |

Air Chorus is 1.67× this expensive Spring sweep and 2.07× stock Chorus while the ring history fills (8,192 frames, about 186 ms). Afterward it uses the original fast tap path.
The extra work buys the full original long stereo sweep, separate alternating
48-bit air states and precise multi-stage control smoothing. This is in the
same order of cost as the Spring design target, not a claim of matched chip
headroom. Executed instruction counts are not compared directly with the
717/725 modeled cycle bound. Record: `evidence/stock-comparison.json`, including
source image and harness hashes, per-core/split figures and exact conditions.
The physical eight-track deadline, complete DSP workload and ColdFire cost remain unmeasured; the owner accepted the current-image hardware limit.

## Eight-instance performance replay

`verify_stress.py <module folder> <private output folder>` runs 85,444
16-frame blocks (31.00009 s of audio) with four instances per core, eight
independent stereo inputs, 0.98-FS bursts, dirty initialization and both local
and shared-memory guards. Each instance receives three 120-BPM-derived
LFO target streams and rapid endpoint locks over 12 parameter-byte targets.
Only SPD/RNG/MIX are active; nine slots are deliberately unused. This models
DSP target bytes, not the instrument's actual ColdFire sequencer, LFO, MIDI,
scenes or panel route. No physical workload or timing pass follows from it.
All inits returned, both cores completed, every instance produced audio,
and there were zero stray writes, clobbers or hangs. See `evidence/stress.json`.
The observed total meter peaks are 33,879 (core A) and 33,783 (core B)
executed instructions/block, including host overhead; init totals are 300
instructions/core for four instances. These are not hardware clock cycles.

`npm run perf:audit -- check sdk/octabam/modules/airwindows-chorus/evidence/performance.json`:

| Check | Result |
| --- | --- |
| Cycles | Note: 4 × 725 = 2900 of the 3120-cycle module allowance/sample/core; measured cold cost 524.5 executed instructions/sample/instance |
| Stock benchmark | Note: 2.07× stock Chorus, 1.67× expensive split Spring; original algorithm/smoothing and temporary history guard justify the work |
| Stress | Pass: eight modeled tracks, four/core, three LFO target streams, 12 targeted slots, 31 s, dirty/local+shared guards, no clobber or hang |

The audit's `static` field uses a modeled-cycle upper bound as a conservative
instruction-count ceiling; it does not equate instructions with hardware
cycles. The standard stock reserve is 22,640 modeled cycles/core/block.
Only 3,180 additional modeled cycles remain after all four split calls and
inits; memory stalls and additional custom FX can reduce that allowance.
The replay adapter is used because the ordinary linear cycle counter cannot
price this bounded indirect-tap topology. It does not claim that inactive
parameter slots or ColdFire paths were exercised as audible controls.

## Firmware composition and emulator UI

Native standalone compilation of the verified original 1.40C MAIN passes on
both DSP payloads, with 1,243 donor P words free. The private exact-image
candidate is identified in `evidence/private-build.json`; its saved ELEK/ELUP
update decodes byte-identically to the native MAIN. It retains stock FX1
and offers NONE/Air Chorus in FX2. Public compositions use the common
builder, which may select different menus/platform features.

Four real LCD exports from AIRC0R1 are retained under `media/`, with their
plan and hashes in `media/capture.json`. All were visually reviewed: chooser,
confirmed SPD/RNG 64 and MIX 0, MIX 64 example, return to dry. Capture used
`scripts/capture-module-ui.py`, both DSP cores and `--shm-size 256m`.
The same image booted and accepted differently controlled Air Chorus
assignments on T1, T5, T2 and T6 in the headless MKII panel. This empty-card,
stopped-transport run verifies UI/assignment, not physical audio/persistence.
A separate panel-state readback run checks track isolation without DSP audio.

`npm run module:verify -- airwindows-chorus --os <local original update>
--image octamod-tapehead-qualification-tools:local --jobs 2` compares the
browser composer with native octabam, covering the module alone, every
available companion, maximum selections, sampled larger combinations and
both stock-FX2 retention choices. Results and fingerprints are in
`sdk/native-comparisons/airwindows-chorus.json`; chooser metadata and declaration
checks are generated by the native exporters. Unsupported combinations are
refused, including Analog BD and configurations with no harvested P space.
Keeping all stock FX2 is unavailable for this large P-table insert. Shared
platform/logger writes are accounted for separately from module-owned bytes.
The 114 selections produce 46 matching builds (16 identical outright, 30
identical outside shared platform writes) and 68 matching refusals, with zero
mismatches. These comparisons establish no chip deadline.

The owner approved limited functional hardware coverage and waived fresh
physical testing of AIRC0R1. `sdk/airwindows-chorus-build-approval.json` binds
only that hardware exception to this exact version/source. Source cycle,
memory, package, integration, licence and UI evidence still apply. Earlier
hardware evidence remains historical; no baseline or other module exception
is extended. See [HARDWARE.md](HARDWARE.md) for optional remaining MKII checks.

## Reproduction

Use Node 24 and `npm ci`. Run native code in the reviewed network-disabled
container, with a read-only source mount and private output mount. DSP tests:
`python3 -B verify.py`, `verify_controls.py`, `verify_instances.py` and
`verify_bounds.py`. Environment variables `CHORUS_RESULTS`,
`CHORUS_CONTROL_RESULTS`, `CHORUS_INSTANCE_RESULTS` and `CHORUS_BOUNDS_RESULTS`
write sanitized JSON reports. `render_quality.py --input <fx:audit plan>
--output <private renders> [--modulated]` renders the sound-quality plan.
`benchmark.py --native-sdk <private staging tree> --module-image <private MAIN>
--output <new private benchmark folder>` reproduces the matched stock comparison. For eight-instance testing add `--shm-size 256m`.

`build_private.py --raw-os <local original MAIN OS> --vendor <toolchain vendor>
--output <new private MAIN path>` stages a disposable native checkout and
builds the compact image. It verifies the original MAIN input hash. Use the
existing `encodeFirmware` codec and the user's original update to package it;
read the saved update back and compare decoded MAIN bytes. Keep all stock-
derived outputs private. The required repository check is
`npm run check -- --base origin/main` before each commit.

## Bounded initialization update

The hardware-tested implementation cleared all 16,384 Y words in one init call
(16,466 executed interpreter instructions). The release candidate instead
clears the 56-word X state and tracks valid ring history. Every unwritten tap
is logically zero; after 8,192 frames the original unmasked tap body is used.
The sample count is saturated and offsets are wrapped before validity checks.

The changed DSP passed the complete native render/control/instance suite.
Ten additional dirty-history fixtures, including 32,768-frame ring wraps,
endpoint settings and moving controls at split positions 0/1/8/15, are
byte-identical to the hardware-tested DSP. `evidence/history-parity.json`
records these finite comparisons. They do not establish current-image hardware
behavior. `evidence/hardware-report.md` retains both the original 50-minute
result and the owner's explicit current-image waiver.

## Beta 0.1.1 — 9 October 2026

The owner requested publication of the staged full-range optimization for beta testers and explicitly waived current hardware evidence: “also bring the air chorus fix live with it. no hardware evidence is fine, that's exactly what the beta tester tier is for”. This exception is bound to 0.1.1 and its exact source in `sdk/airwindows-chorus-build-approval.json`. The earlier 0.1.0 measurements and hardware report above remain historical.

The optimization retains the original arithmetic, delay range, smoothing and parameter layout. Recorded actual-DSP parity covers 30 fixtures and 983,040 stereo frames. The matched observed maximum is 336.75 net executed instructions/sample, down from 524.5 (35.80%); matched Spring is 314 and stock Chorus is 292.875. Both cores, fixed/moving settings and all trigger splits are covered. The conservative source-word/call model is 495 units/sample and 32,044 units for four instances plus initialization per core/block; these are not chip cycles or a deadline guarantee. Shared code/table is 1,425 P words per core; per-instance state and stereo ring are unchanged.

The real ColdFire/DSP playback fixture exercised T3/T4 MIX delivery over 8,192 blocks; published and optimized per-track output was bit-identical, without output rails. It did not reproduce the reported hardware clicking. This release reduces load as a mitigation; it does not establish a confirmed fix. Current physical timing, multi-instance audio, Part/project reload and reboot are **not tested**. The clicking symptom remains unresolved pending actual beta results. Begin with a disposable project and low monitoring volume.

The current private native MAIN rebuild is byte-identical to the staged candidate (`cf75abd4fca70c24def9d535aaaca454be4a97ea1d6bcb065dddada8bd038a3b`). Fresh native-image emulator captures show the chooser and controls for 0.1.1. A normal beta-member browser saved the one-module ELEKLOADER update: 452,208 bytes, SHA-256 `814b5733cdd91b8ed88d45ebea865475047929c5483dc46c9fbd395455b315f9`, decoded MAIN `3e35b409628eb822603c2a187a24d41b19b83bce0a797de23a97e2537caeb2e3`, matching the current composer. The browser image includes the mandatory platform logger; its complete MAIN therefore differs from the standalone private candidate. These are software and saved-file checks, not hardware observations.

### Owner clarification of the original hardware failure — 9 October 2026

The owner reports that the tester used the **unoptimized version**: Air Chorus was on T3, then adding a second instance on T4 produced rhythmic clicking. This is a reported failure of the original implementation, not a hardware test or passing result for optimized 0.1.1. The Octatrack model, run duration and persistence results were not supplied.

The two owner-supplied v2 checkpoints have valid completion checksums and no recorded warnings, errors or faults. The Air Chorus checkpoint declares 0.1.0 and contains only 14 startup/engine-job records; the other checkpoint is from a different configuration without Air Chorus. Neither records audio, DSP timing or the clicking onset. Their source fingerprints do not match the current beta source inventory. Raw logs and private configuration details remain outside this repository. The owner's current-build hardware waiver remains in force for 0.1.1.

The current 0.1.1 native/browser comparison records 118 profiles: 47 matching builds (16 identical outright, 31 outside shared platform writes), 71 matching refusals and zero mismatches. All 31,744 newly enabled allowed declaration selections pass the actual native ledger; these are declaration checks rather than complete firmware builds. The module doctor is green.

## Beta 0.1.2 — shared-word protection and wider compatibility

The tester confirmed clicking still occurs in 0.1.1. The owner reports T3 as
the only known troublesome track so far, with simultaneous T1/T2, T6 and T8
working and at least four Chorus instances. This was an existing project.
T3 alone, the instrument model, fresh-project behavior and physical persistence
are unknown; the owner requested no further tester questions for now. The
supplied logs remain the earlier 0.1.0 checkpoints, not new beta logs.

A source inspection found shared-data collisions: stock uses
0x38000..0x3800f for the T3 cross-core mailbox and 0x30000..0x30047 for T7
parameter staging, inside the fixed FX2 allocator slots. P/X/Y alias there.
The new ring maps its first 72 virtual words to safe per-instance X offsets
60..131. Its 60 control words and 72 shadow words fit entirely below stock
track state at offset 132. It preserves both 8,192-word rings with no new RAM.
`verify_shared_buffer.py` refreshes those shared Y words during actual DSP
execution: released 0.1.1 corrupts them and changes audio; 0.1.2 preserves them
and matches an isolated render on T3/T7 at splits 0, 1, 8 and 15, each over
32,768 stereo frames. A separate X canary confirms offsets 132..255 remain
untouched through init and processing. The fixture writes Y explicitly because
dsp_host's X/Y spaces are separate. This confirms the memory defect and
regression; it does not establish that the reported hardware clicking is fixed.

All 1,026 original Q23 sine values are losslessly represented by 256 words of
signed second differences. The per-instance endpoint cache starts at the known
quarter endpoint and advances/reverses by at most one index per sample across
the entire supported speed range. `verify_sine.py` runs the assembled helpers
against all 1,024 coefficients and 3,088 endpoint cases in both directions,
including cached reuse. Every value is exact. Thirty dirty-history/control
fixtures remain bit-identical to 0.1.1 over 983,040 stereo frames. Reference,
click/control, eight-instance isolation and conservative bounds gates pass.

Matched maxima on both cores at all 16 splits: Air Chorus 394.625, prior beta
336.75, stock Chorus 292.875 and expensive Spring 314 net executed
instructions/sample. Shared-word protection and lossless decoding increase
measured cost 17.2% from 0.1.1 and reduce it 24.8% from original 0.1.0's 524.5.
It is still expensive. These counts exclude dispatcher, ColdFire, DMA and
contention and establish no physical deadline/headroom. The conservative bound
is 732 modeled units/sample and 47,256 for four instances plus initialization
per core/block. The right ring cannot reach the left shadow prefix or boundary;
the bound charges each channel's reachable worst path separately. Branch and
call surcharges remain conservative; no audit threshold was relaxed.

Shared P storage drops from 1,425 words in 0.1.1 to 795 words: 256 table and
539 program words per core. Table/code can also occupy separate donor openings
when no contiguous run fits. Four independent origin pairs reproduce fresh
assemblies. Stock helpers, reservations and dispatch are checked in both cores;
stock reverb donors are removed where required and crowded selections refused.
Air Chorus now fits with E-Verb. Beside Analog BD it can also include MiniVerb,
Euclid, Tapehead or Sidechain Compressor, optionally with Tape Echo. These
are finite native/browser build proofs, not hardware audio observations.

The current Air Chorus native/browser comparison covers 122 selections:
52 matching builds (18 exact, 34 outside platform writes), 70 matching refusals
and zero mismatches. The shared-builder regression compares 38 existing
selections without Air Chorus against main 0a3bd500: complete images and refusal
text remain identical. `sdk/infrastructure-verification/air-chorus-split-builder.json`
preserves that transition without changing earlier import or Poly8 records.

The Analog BD matrix covers 212 selections: 162 native builds and 50 matching
refusals, with browser placement and freshly assembled native bootstrap checks.
Six complete saved firmware containers round-trip to their composed MAIN.
A complete combined browser image loads and plays a generated project with
Analog 808 on T1 and 909 on T5, each through Air Chorus. Both cores produce
audio in separate MIX 0/64 runs of 5,000 blocks; wet output differs from dry.
`evidence/combined-port-012.json` binds that finite integration test to MAIN
SHA-256 `31913b92750e38d64fbf46d977329df0cc10faa752f274cf02a39c6307133e82`.
It does not establish physical timing, listening or reboot behavior.

The current 31-second replay completes with eight differently controlled
instances, four per core, dirty state, local/shared guards and no clobbers or
hangs. `evidence/stress.json` records the exact 0.1.2 assembly and host hashes.
The full ColdFire/DSP T3/T4 tone project completes 8,192 blocks with no late
DSP reads. All six captured stream groups match the prior beta; the last
sixteen observed T3 mailbox writes come from stock code.
`evidence/full-port-012.json` retains those finite observations. This fixture
did not reproduce the reported physical clicking in either version.

Fresh grayscale emulator captures show the unchanged chooser, SPD/RNG 64,
MIX 0/64 and return to dry on private MAIN
`5e0cbe6040633dd1eda7de247baeb226f38c1308e9d02cedebdf0fdf35a1d6c6`.
`media/capture.json` records the actual emulator and panel plan; every image
was visually reviewed. The owner's existing beta-release instruction and
hardware waiver cover this continued fix and requested wider compatibility.
`sdk/airwindows-chorus-build-approval.json` binds the exception to this exact
0.1.2 source. Hardware remains **untested**; no physical audio, worst-case chip
timing, Part/project reload or reboot pass is claimed.
