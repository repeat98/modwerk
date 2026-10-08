# Shimmer testing

Version: 0.1.0-experimental. Hardware status: **not tested**.
Only observed software results and results explicitly reported by the human
tester may be entered as passed. Planned coverage is not a result.

## Commands and exact revision

Measurements below were observed on 8 October 2026 with the real DSP56300 host
and ColdFire/dual-DSP emulator. They are software evidence. All original OS
data, rendered audio, card fixtures and private builds remain outside tracked
files. The original OS was supplied from a local 1.40C update.

| Identity | SHA-256 |
| --- | --- |
| `engine.asm` | `a7663b9bdc50e9c995643af62618e45e3f9e93643833edd1652debc6fc592608` |
| `manifest.py` | `6cc3c3a074c62c2abcdb80a330489640b1c4f509037982043791c8af3938ca0e` |
| Assembled 1073 program/table words, little-endian int32 packing | `efd2365c117dcb6dfe3b5ba1943583c8723bad8f810855c41dae25814ed8b664` |
| Original MAIN OS | `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e` |
| Native dynamic/all-stock MAIN used for project stress and save/load | `5a42175f876d7d22e31284faad0b10c4b174a34afc3bcb695acd3f3e873c5433` |
| Private `SHIMMER01` ELUP update, 466492 bytes | `9036a883a45be04be14650eb491e02ba8753c6070882c45167074e0f7fd14cd7` |

The source hashes at each measurement are retained in
[software-audits.json](evidence/software-audits.json). Later additions to the
test helpers do not relabel earlier runs. The native manifest conservatively
retains `Proof.UNTESTED`; that declaration is not a hardware qualification.

The private update was packaged with the existing TypeScript ELEK/ELUP
encoder and decoded again. Exact MAIN bytes, the original tail/boot sections,
seed and first eight header bytes are preserved; only the version field is
stamped `SHIMMER01`. Firmware stays outside the repository. No unit was flashed.

| Command / measurement | Result |
| --- | --- |
| `npm run module:new -- shimmer --kind dsp --author juliussylvest-lab` | Ran successfully on 8 October 2026. |
| Native registry import: SHIMMER, effect 0x1e, layout 8, 12 parameter slots, 33 pitch-table words | Passed declaration load; not a DSP/audio test. |
| Native assembly/disassembly and signed arithmetic gate | Passed assembler round-trip and both dispatch entries; 1073 words. |
| Module render gate `modules/shimmer/verify.py` | Passed exact signed stereo dry output, dirty initialization, isolation, both cores/split calls, pitch-rate/presence bounds and loaded-wet startup fade. |
| Shared `verify_knob_clicks.py` detector through `measure.py --knobs` | All six passed unchanged −70 dBFS criterion. Worst window SIZE down −87.437 dBFS; MIX worst −98.994 dBFS. |
| `npm run fx:audit` via `measure.py --sound` | Default unity/shifted runs fail; 60-second settled unity passes; settled shifted run retains four alias-mask failures. Full tables below. |
| `npm run perf:audit -- check sdk/octabam/modules/shimmer/evidence/performance.json` | Passed record, cycle, stock-comparator justification and guarded/native stress checks. Cost acceptance is pending owner review. |
| Native/browser comparison | All 114 static profiles pass: 46 matching builds (16 outright, 30 outside existing platform writes), 68 matching refusals, zero mismatches; changed original OS refused. Docker command was not substituted for an observed run; local native equivalents use the same reviewed exporters. |
| `npm run module:doctor -- shimmer` | Catalog, performance, thumbnail, packages, source fingerprint, 114-profile comparison and declaration checks pass. Library/module rules remain red because publication requires physical qualification. |
| `npm run check -- --base origin/main` | Failed at the missing qualification record. The independent application suite result is recorded below. |

Reproduce DSP measurements from the repository root, with the reviewed local
assembler/host installed under the SDK vendor directory:

```sh
python3 -B sdk/octabam/modules/shimmer/verify.py --output sdk/octabam/out/shimmer_verify_local
python3 -B sdk/octabam/modules/shimmer/measure.py --knobs --stress --output sdk/octabam/out/shimmer_measure_local
python3 -B sdk/octabam/modules/shimmer/measure.py --stock-benchmark --output sdk/octabam/out/shimmer_stock_local
python3 -B sdk/octabam/modules/shimmer/measure.py --sound --unity --warmup 60 --tail 30 --output sdk/octabam/out/shimmer_unity_local
python3 -B sdk/octabam/modules/shimmer/measure.py --sound --warmup 60 --tail 30 --output sdk/octabam/out/shimmer_pitched_local
python3 -B sdk/octabam/modules/shimmer/measure.py --shift-aa --output sdk/octabam/out/shimmer_antialias_local
npm run perf:audit -- check sdk/octabam/modules/shimmer/evidence/performance.json
```

The sound helper invokes the actual `npm run fx:audit` implementation's `plan`
and `check` commands, with original tone inputs rendered through this module.
The expected shifted-audit exit is 1; this is preserved rather than waived.

## Hardware and audio quality

No Octatrack has been flashed or tested for this module. The following is the
procedure to run after the software build and its private identity are ready.
Record the actual model and base OS, module version, source commit/fingerprint,
local image SHA-256, tester, date, track/slot settings, duration and observations.
Do not attach the firmware, card contents or private project dump.

### Physical-unit procedure

1. Back up the existing project and use a separate test project. Select
   Shimmer on audio track 1 FX2 using the README's MKI/MKII button sequence.
   Use a short, conservative-level note or chord. Set the six tutorial values:
   TIME 96, SIZE 96, PTCH 127, SHMR 48, TONE 64, MIX 32.
2. Compare MIX 0 and MIX 127; sweep TIME, SIZE, PTCH, SHMR and TONE through
   both endpoints and back. Compare PTCH 0/64/127 at matched wet level.
   Report clicks, runaway feedback, unexpected silence, DC-like thumps,
   distortion, harsh high-frequency artifacts and stereo imbalance.
3. In GRID RECORDING, hold a trig and turn each encoder to create a lock.
   For each of the six knobs, test minimum and maximum on adjacent trigs,
   followed by an unlocked trig. Verify the unlocked trig restores its base
   setting. Keep MIX audible while testing the other controls.
4. Assign each of the six controls as an LFO destination in turn. Try a slow
   triangle sweep and the highest practical speed, then three simultaneous
   LFOs. Test scenes A/B with different knob values and crossfade slowly and
   quickly. Report audible stepping, crashes and settings that fail to return.
5. Add a second instance on track 5 FX2 with deliberately different pitch,
   TIME and MIX values. This exercises the other DSP core. Edit, replace and
   reselect one instance; verify the other's controls and audio stay separate.
   The tested maximum is four: at most two among T1–T4 and two among T5–T8.
   The measured eight-track fixture uses Shimmer T1/T2/T5/T6, DARK REV on
   T3/T4/T7/T8 and FX1 NONE. Additional stock effects consume the remaining
   budget and were not included in that stress claim.
6. Stop/restart transport, switch patterns and switch Parts. Save a Part and
   project baseline with different settings on both instances, then make
   unsaved edits. Reload the Part and project and verify the baseline effect
   assignments, values and usable audio return. Power the unit off and on,
   reopen the project and repeat the check. Report physical reboot separately
   from an emulator project load.
7. At the qualified maximum, run eight tracks with three active LFOs per
   track and locked steps, changing Parts and using MIDI/USB or streaming only
   if those loads were actually enabled. Record the duration and workload,
   dropouts, hangs, stuck transport, recovery and every limitation.

### Screenshots to capture on the unit

- FX2 SETUP chooser with **Shimmer** selected and the track number visible.
- FX2 MAIN at TIME 96 / SIZE 96 / PTCH 127 / SHMR 48 / TONE 64 / MIX 32.
- FX2 MAIN at MIX 0, showing the bypass step of the tutorial.
- The LFO setup with a Shimmer destination selected; report which knob and LFO.
- FX2 MAIN after the physical reboot, with both saved instances checked.

Report what happened beside each screenshot. A photograph of a page alone
cannot prove audio, parameter-lock delivery, isolation or reboot persistence.
Software gallery captures use real monochrome MKII framebuffer pixels and
carry capture.json provenance; they do not substitute for these hardware tests.

## Sound quality

The FFT remains 32768 samples. Limits remain alias −60 dBc, DC −60 dBFS and
idle −90 dBFS. Each audit renders both −12 and −1 dBFS input levels. TIME,
SIZE, SHMR, TONE and MIX are all 127; PTCH is 64 for unity or 127 for octave-up.
No external modulation is enabled. `--warmup 60` changes settling duration,
not input phase, FFT geometry or verdict thresholds.

| Audit | Aliasing | Clipping/DC | Idle at 30-second window | Exit |
| --- | --- | --- | --- | ---: |
| Default warmup, unity | Eight failures; early reverb modes in harmonic-fold mask | Zero rails; DC passes | Retained full table | 1 |
| Default warmup, octave-up | Four failures | Zero rails; DC passes | Retained full table | 1 |
| 60-second warmup, unity | All eight pass; worst −96.5 dBc | Zero rails; DC about −135 dBFS | −104.5 dBFS, NOTE | 0 |
| 60-second warmup, octave-up | Four failures, table below | Zero rails; DC about −135 dBFS | One LSB, −132.5 dBFS, NOTE | 1 |

Settled octave-up table, both output channels considered:

| Input | Level | Alias-mask energy | Verdict |
| --- | ---: | ---: | --- |
| 1099.54 Hz | −12 dBFS | −32.9 dBc | FAIL |
| 1099.54 Hz | −1 dBFS | −32.9 dBc | FAIL |
| 2701.07 Hz | −12 dBFS | −36.0 dBc | FAIL |
| 2701.07 Hz | −1 dBFS | −36.0 dBc | FAIL |
| 5301.21 Hz | −12 dBFS | −105.4 dBc | PASS |
| 5301.21 Hz | −1 dBFS | −113.1 dBc | PASS |
| 9101.82 Hz | −12 dBFS | −103.7 dBc | PASS |
| 9101.82 Hz | −1 dBFS | −113.5 dBc | PASS |

Exact coherent frequencies and every channel metric are in
[software-fx-audit.txt](evidence/software-fx-audit.txt) and the JSON record.
These failures coincide with the pitch-grain sideband comb (21.533 Hz spacing)
inside the shared classifier's harmonic-fold bands. That observation does
not establish complete sound qualification or make the failed verdicts pass.
Separate actual octave-up high-frequency probes have positive controls:
unfiltered rate-2 reads expose the fold at approximately 0 dB relative to input;
the module's 14 kHz/18 kHz probes measure folds at −139.895/−125.487 dB relative
to input, with broad residual −129.950/−128.650 dBFS. These are targeted checks.

For a 438.75 Hz tone the read rates settle exactly to 0.5, 1 and 2 at PTCH
0/64/127. The strongest wet components are 223.407, 438.739 and 869.403 Hz,
respectively; finite grains prevent an exactly tuned dominant peak. The gate
checks independent peak presence and the documented grain-width bound rather
than demanding a peak at the nominal octave bin.

MIX 0 returns bit-exact signed dry stereo after its glide settles. Loaded wet
startup clears the complete ring over 2048 dry samples, then fades towards the
loaded value; both cores pass the no-drop test. Dirty silence and active onset
pass with both tested fill patterns. The 60.743-second read-only internal census
observes zero rails, scalar peak 0.169891 FS and final ring peak 0.216931 FS;
it samples block boundaries, not every store. No human listening result or
physical audio result has been reported. Full wet group delay and a complete
moving-control alias survey remain unmeasured.

## Stock flows

No stock-flow changes are proposed for the dynamic/all-stock unit image.
The static parity profile can reclaim PLATE REV and SPRING REV and is not the
proposed unit build. The global public loader flag remains disabled.
The following table distinguishes observed native software cases from the
remaining physical and neighbouring-flow coverage.

| Neighbouring flow | Result |
| --- | --- |
| FX1 chooser: NONE, stock effect selection and ordering | All eleven stock rows preserved; actual EQUALIZER selection on both cores passes. Complete behavioural comparison untested. |
| FX2 chooser: stock DARK REV / PLATE REV / DELAY selection and ordering | All fourteen stock effects plus NONE retained, Shimmer appended; actual DARK REV and EQUALIZER selections pass. PLATE/DELAY audio comparison untested. |
| Single/double effect-key presses and FUNC/FX gestures | Actual FUNC+FX2 chooser, confirmation, close and FX2 MAIN pass in emulator. Double-press and complete stock gesture matrix untested. |
| Six MAIN encoders, effect SETUP and returning to other parameter pages | Actual page labels and encoder edits pass; three real tutorial captures. Other parameter-page coverage untested. |
| Parameter locks, unlocked return, LFO destinations, scenes and crossfader | Eight-track A01: 24 active LFO destinations and 14–15 lock lanes/track vary in live state. Unlocked-return, scene locks and crossfader delivery untested. |
| Track/machine selection; FLEX, STATIC, THRU and NEIGHBOR routing | Not tested. |
| Part save/reload/copy and project save/load/reload | Real project SAVE writes work/stored banks; fresh-process LOAD restores ID30 and all six edited values. Manual Part2 and stopped A02/A03/A04 publication pass. Part save/reload after unsaved edits, copy and hardware reboot untested. |
| Pattern change, PLAY/STOP/restart, tempo, scale and swing | A01 playback for 30 seconds and stopped A02/A03/A04 requests pass. While-playing queued changes, tempo/scale/swing matrix untested. |
| Recorder setup, sampling, recorder trigs and playback | Not tested. |
| MIDI tracks, incoming CC/clock, MIDI OUT and USB disk mode | Actual T2 TIME CC40=100 delivered and read back. MIDI-track, clock/OUT/USB coverage untested. |
| Track mute, cue/main routing, master track and adjacent stock FX1 | Not tested. |
| Multiple distinct FX2 instances, both cores and replacing one instance | Direct DSP one-hot/isolated/interleaved outputs pass on both cores; live four-instance stress passes. Full panel reset/replacement matrix and physical isolation untested. |

The relocated chooser regression originally failed with DSP LOAD FAILED.
The shared controller read obsolete fixed chooser tables after relocation.
`selection.c` now reads the two guarded stock setter operands that point at the
live FX1/FX2 ID tables. Actual loaded-project selection passes eight cases:
T1/T5 Shimmer FX2, EQUALIZER FX1/FX2 and DARK REV FX2. Each request completes
once with zero refusals/residency errors. The verifier guards the original
six-byte instructions; no stock instructions or table bytes are committed.

## Performance

The shared static no-contention model reports **924 modeled cycles/sample**,
836 words in the sample loop and 1040 executable program words. DO contains
at most one nested BSR; no recursion. The original mathematical pitch table
adds 33 words. Two instances/core consume 1848 of the modeled 3120 sample
budget, leaving 1272 for stock effects and other work. This is not a hardware
utilization percentage.

| Executed software counter | Instructions / instance / sample |
| --- | ---: |
| Shimmer, matched fixed settings | 805.1875 |
| Shimmer, matched moving controls | 806.625 |
| Closest stock effect DARK REV | 193.25 |
| Dearest stock effect DJ EQ | 293.375 |
| Shimmer, conservative split/guard stress including dispatch | 815.1875 |

Matched comparisons use the shared stock benchmark's real X:0 audio path,
4096 unsplit blocks, one instance on each core and the measured null-stub
67-instruction/block overhead subtracted. The matched ratio is **4.173997×
DARK REV**. Modeled cycles and executed instructions are different quantities.
Pitch feedback, the stereo FDN, eight-pole antialias filtering, fractional DC
carries and six-control smoothing explain the additional work; the owner has
not accepted this cost for a release.

The direct 30.000181-second DSP stress runs two/core, moves all six controls,
uses splits 1/3/7/15 and checks private/shared/program guards with dirty state.
Zero clobbers and hangs are observed. All sixteen split positions also run at
fixed dearest endpoints. The diagnostic eight-instance isolation run does not
qualify eight instances for real-time use.

The separate real ColdFire/dual-DSP A01 project runs **82688 frames** (30.000181
seconds): eight FLEX tracks, Shimmer T1/T2/T5/T6, DARK REV T3/T4/T7/T8, FX1
NONE, three active FX2 LFOs per track and 14–15 lock lanes per step. The 162
live snapshots show all 24 LFO destinations varying, fractional variation,
locks varying, nonzero post-FX audio and transmit output, and zero loader
refusals/errors/residency failures. Shared `verify_set` reports zero failures;
CC40=100 is observed on T2 TIME, which deliberately remains unlocked without
an LFO for that probe. One inherited inactive STATIC file causes FILE NOT
FOUND; no active-track parse/card error is observed. The reports do not claim
uninterrupted hardware audio or arbitrary added FX1/other-module loads.

[performance.json](evidence/performance.json) passes `perf:audit` with the
cost justification visible. [native-project-stress.json](evidence/native-project-stress.json)
records the actual publication/run and its limits.
[project-save-reload.json](evidence/project-save-reload.json) records actual
panel edits, SAVE and fresh-process LOAD: ID30 and values
TIME70/SIZE83/PTCH95/SHMR43/TONE52/MIX37 persist.
[part-pattern-publication.json](evidence/part-pattern-publication.json) records
manual Part2 and stopped A02/A03/A04 cases with zero loader errors; stopped
publication is not a playing-switch continuity test.

## Resources

Each instance uses its existing 16384-word Y ring (49152 logical bytes) and
256-word X block (768 bytes): **49920 bytes/instance**, **199680 for four**.
The ring occupies words 0–13708 inclusive (13709 words, 41127 bytes), leaving
2675 padding words. There are 65 referenced scalar slots; initialization clears
126 words in 0x00–0x13 and 0x16–0x7f, preserving stock flags 0x14/0x15 and r1.
Highest referenced scalar offset is 0x42. The fixed stock blocks are not newly
allocated heap. Each DSP core also carries 1073 immutable program/table words
(3219 bytes): 6438 shared bytes over both cores, **206118 logical bytes total**
for the four-instance layout. Emulator int32 backing is a separate host cost.
No module-owned ColdFire runtime state or shared-bus writable allocation exists.
The platform loader/logger overhead is shared infrastructure, not included in
that module-only total; actual whole-chip memory canaries remain unmeasured.

The fallback small-ring guard is specific to the verified 1.40C FX1 allocator
base pattern, not a general runtime length check. Both cores' four small-ring
bases pass exact dry/no-Y-write tests. FX1 has no Shimmer chooser entry.

## Hardware

**Untested.** No reported results and no owner waiver exist. Do not mark the
qualification gate green or extend another module's owner approval. The first
release needs actual hardware results or an explicit version-specific owner
exception after review.

## OT UI capture evidence

Actual emulator framebuffer captures and their provenance are kept in `media/`.
The native full-stock MKII image is bound above; the separate explicit browser
dynamic/full-stock MKI build has its own hash in the capture record. They are
software LCD evidence, not physical hardware captures. Review every retained
image against TIME, SIZE, PTCH, SHMR, TONE and MIX and its actual values.
No firmware, raw frames, card fixture, sample, personal project name or dump
belongs in the capture record.

The capture records' module inventory hash identifies the inventory at capture
time; adding subsequent evidence files changes the broad qualification helper's
inventory hash. The frozen engine/manifest hashes above bind the runtime itself.
Both images show the same six labels and MIX0/MIX32 states. The first controls
capture is at default MIX0; the walkthrough presents MIX32 before that image
to teach dry bypass without mislabeling the original capture sequence.

## Integration and release status

Source-package compilation uses the shared catalog-driven compiler. New
ordinary DSP inserts require no module-specific recipe or CI entry. The
generic static metadata exporter checks the reviewed five-group source
inventory and original-OS fingerprint and discovers the catalog's DSP entries;
the composer refuses missing module metadata/packages instead of silently
emitting a menu without code. Explicit dynamic composition passes its loader
choice into default chooser generation; the global public flag is unchanged.

The full-stock dynamic native build has genuine chooser, controls, project
stress and save/load evidence. The separate static coverage set tests default
donor menus and compact menus; its results never imply all stock effects are
preserved. A public stock-preserving release, complete pitched sound review,
physical MKI/MKII/persistence evidence and first-release owner approval remain
pending. `module:doctor` and `check` must not turn those gaps into green results.

The recorded [114-profile comparison](../../../native-comparisons/shimmer.json)
binds the original OS and final module inventory
`057205485523c538b91bfa7dba1cce99c7c1c4eea1bdc843519e6c593de2d739`.
The exhaustive shared native ledger checks 65536 combinations containing
Shimmer: 28672 clean, 36864 refused. Only numeric metadata and fingerprints are
retained. Compact compatibility metadata is generated with the existing
`compactChecks()` function from actual exporter records. This is declaration
and composition evidence, not a publication or hardware approval.

Final source-package generation and development import pass with four-origin
DSP relocation proofs. Rebuilding after import produces byte-identical authored
packages; new descriptor discovery does not append a duplicate recipe. The
complete reviewed SDK source fingerprint is
`24e4f2d6674e5022c99c699efeab4239a5088c7e4786c5d232c6d0fd2ac646b3`.
`sdk:check` passes 49 checks after removing generated Python caches. TypeScript,
lint (excluding ignored native vendor/output trees, five existing warnings),
release-note and licence checks pass. `build:bundle` passes for the retained
public catalog; it does not publish Shimmer. The focused compiler, metadata,
profile, companion and audit regressions pass 54 tests.

After the relocated chooser fix, actual GNU assembly/link exports refresh all
five ColdFire runtime oracles. All eleven authored objects are byte-identical
to the shared compiler's package asset; 15 linker/exporter regressions pass.
The complete current-source Analog BD suite is rebuilt rather than relabeled:
136 profiles, 130 matching native OS/independent GNU bootstrap results, six
matching refusals and five complete firmware round trips. No hardware is
qualified by those comparisons. The omitted-ID regression follows the reviewed
native registry rather than obsolete unpublished upstream IDs; all twelve
static placement tests pass.

`modules:generate` and `npm run check -- --base origin/main` fail at
`shimmer.tests.qualification: publication requires worst-case cycles, exact
memory and hardware test evidence`. Measurements are recorded above, but no
physical report or owner waiver exists. The public generated module catalog
remains at its prior 20 entries; SDK/source packages contain 21. Tests that
require those publication/version inventories to agree remain failed until a
legitimate qualification record allows generation. They are not skipped or
changed to accept an unqualified release.

The final complete `npm test` run passes **1306 of 1318 tests** across 196 files;
12 tests in nine files fail. Those failures require a qualified public catalog
or matching compiled/public version inventories: doctor, build support,
module contract, resource indicators, composition, standalone logger, DSP
package lookup, module build and three session boot-name cases. They do not
constitute a passing application suite. Native payload/parity, GNU linker,
Analog BD and static placement failures from earlier runs were repaired and
retested; the remaining publication-dependent assertions stay unchanged.

Release-note validation now checks newly listed SDK drafts before publication,
without overriding existing public versions or accepting unknown IDs. Shimmer
notes occupy the validated `modules` map. Regression cases cover missing or
misplaced draft notes, wrong versions, unknown IDs and public-version guards;
all three pass in the final application suite. Public lookup and qualification
rules are unchanged.
