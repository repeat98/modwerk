# 0.1.7: the recorded-909 engine

Executed DSP instructions per sample, from `bd909_host`, in the shipping configuration (glue excluded; both engines and the one shared desk, assembled as `ab_image` and `hook_engines` do). 0.1.6 is `main`'s source run on the same nine cases per model (defaults, FIXD, ATK/ACNT 127, DECAY 127, SAT/LOW/HIGH 127, LPF 63, a trig at every frame offset, a retrigger roll, moving knobs):

| | 0.1.6 peak | 0.1.7 peak | 0.1.6 mean | 0.1.7 mean |
|---|---:|---:|---:|---:|
| 909 | 377.0 | 186.4 (-51 %) | 345.5 | 152.1 (-56 %) |
| 808 | 255.4 | 183.5 (-28 %) | 203.6 | 158.5 (-22 %) |

A resting voice (no trig, past 181 blocks, envelope below -96 dB) runs 48 instructions a block, 3 per sample. Glue and both engines take 1003 P words per core in the card build (1008 in 0.1.6) and 1004 in the USB package's engine (1009). At 1024 words, before the last reduction, native dropped PLATE REV from FX2 in the seven Tape Echo + Analog BD card profiles that keep stock FX2; at 1003 every chooser menu is 0.1.6's. The 909's tables (2210 X words from $2841) and four voice blocks end at $3200, as before; the 808's are unchanged.

Where the 909's work went: the body reads two tables instead of a degree-11 polynomial and its quadrature; the click plays a table and two decaying words instead of running an HP, a biquad and two one-poles; the noise envelope and the depth, thump and SAT slews move once a block; the desk drops its two band curves; and one pointer walking the state block in read order lets most loads and stores ride in parallel-move slots.

These are emulator counts, not chip cycles or full-chain headroom. The declared price (411 per voice, from 0.1.5's full-chain emulator measurement) is unchanged and over-states the cost; a new full-chain or chip measurement is needed before it is lowered.

# 0.1.5 assignment-only correction

The 0.1.5 fix changes ColdFire machine assignment by restoring twelve borrowed bytes in both Part copies before clearing AB/1. Runtime code grows by 36 bytes; no DSP code or DSP uploads change. The copy does not execute per sample. Chip timing and complete memory/stack bounds remain unmeasured under the new exact-version owner approval. The measurements below apply to the unchanged 0.1.4 DSP source, not a new 0.1.5 hardware benchmark.

# Analog BD 0.1.4 load measurements

Matched both-core native tests: 909 mean 6524.07 / peak 6563 executed instructions per 16-sample block (410.1875/sample peak), versus approved 0.1.3 mean 6141.77 / peak 6176. Mean increase 6.22%; maximum matched-block increase 6.27%. 808 is unchanged at mean 4268.47 / peak 4294 (268.375/sample). The tests include control endpoints, moving controls and all 16 trigger splits.

Combined code is 997 P words/core plus the separate 35-word stock helper. Existing X upload remains 3776 words/core with four 64-word voices/core; Y and ColdFire allocation are unchanged. These are executed instruction counts, not worst-case chip cycles, wall-clock timing or full-chain headroom. Complete lifetime/stack bounds and maximum FX load remain unmeasured. See [current cost evidence](evidence/909-reference-costs.json) and [TESTING.md](TESTING.md).

## Historical measurements

# Analog BD load measurements

## Modulation smoothing, 8 October 2026 — 0.1.3-experimental

The exact smoothing code tested by the owner and in the isolated native gates
peaks at 6,176 executed instructions per 16-frame 909 block (386/sample) and
4,294 per 808 block (268.375/sample). These include the combined engine at both
core placements under the focused modulation/retrigger workload. They are
executed instruction counts, not worst-case chip cycles or full-chain budgets.

Combined code uses 946 P words per core plus the separate 35-word stock helper.
The X upload remains 3,776 words per core; the existing four 64-word voice
blocks per engine/core and saved control layout are unchanged. No X/Y or
ColdFire allocation is added. [TESTING.md](TESTING.md) records the reused state
words, native instance/audio tests and the owner-reported MKII persistence pass.
Complete stack/lifetime memory bounds remain unmeasured.

The legacy instruction-growth guards and original moving-control state hashes
below predate smoothing. They are not a pass for 0.1.3, and were not silently
raised or regenerated. Current smoothing regression results are in
[evidence/native.json](evidence/native.json), with their reproduction scripts
retained under `sdk/drafts/analog-bassdrum/qualification/` against the pinned
0.1.2 base. The earlier full-chain FX/load runs remain historical: eight-voice
maximum FX load and worst-case chip timing are unqualified for this update.
The exact source-bound owner approval accepts these incomplete measurements.

## Louder source output, 30 September 2026

Both models now have +12.04 dB gain relative to the 29 September level
revision. The 808 changes only its output coefficient (0.215 → 0.86), so
its peak cost remains 220.9375 instructions/sample (3535/block). The 909
adds four instructions/sample to read the original limited 24-bit desk
sample and multiply it by four: 326.125 instructions/sample (5218/block).
Its regression ceiling increases by exactly 64 instructions/block to 5232.
These are executed instruction counts under the host, not hardware cycles.
The engine/glue occupies 1000 P words plus the 35-word stock helper, within
the 1063-word donor.

The original audio/state hashes remain unchanged. Both models render the
original executables to those hashes, then their current executables must
produce exactly the integer-scaled output with identical block states.
909 overloads are limited at full scale. The assignment-default peaks are
−7.31/−1.59 dBFS (808/909), with 500 ms RMS −20.19/−20.21 dBFS.

After rebasing onto `3c9c8d0d66`, two complete eight-track layouts ran for
900 sequencer frames each. Every track delivered trigger/control records
and nonzero audio on both channels. Core 1's complete four-track processing
window, measured after the first 50 frames:

| Current layout | Mean instructions/sample | Peak instructions/sample |
|---|---:|---:|
| Eight 909s, FILTER + DARK REV | 3590.412 | 3669.750 |
| Alternating 808/909, DJ EQ in both slots | 4039.771 | 4115.563 |

Command: `python3 tools/harness/benchmark_analog_bd.py --project <fixture>
--image <frozen image> --out out/analog-bassdrum/levels-load --frames 900
--jobs 2 --case eq-mixedeight-core1 --case dark-909eight-core1`.
Image SHA256: `fc12e460b67e0706468490e8debf9217a19c6e70722dfd5ceb10eaeefd3a3859`.
These local measurements do not qualify hardware timing or all FX layouts.

The measurements below describe earlier output revisions.

## Default-level follow-up, 29 September 2026

The 808 now applies a 0.215 trim after its final desk limiter: three extra
instructions per sample and four P words. Its measured standalone peak is
220.9375 instructions/sample (3535/block); the 909 remains 322.125. The
808 regression ceiling is now 3552/block, reflecting exactly the added
48 instructions/block. The combined engine/glue is 996 words plus the
35-word preserved stock helper, still within the 1063-word donor.

The original audio/state hashes are retained. The exact gate verifies the
untrimmed 808 against those hashes, then verifies every shipping 808 sample
is precisely the fixed-point-scaled original, with identical internal states.
The 909 still matches both original hashes directly. No baseline was replaced.
`verify_analog_bd_levels.py` measures actual firmware defaults over 100/500 ms.

Four full-image cases were rerun at 900 sequencer frames each, with all eight
tracks active and DJ EQ in both slots. Every track produced stereo audio.

| Current layout | Core 0 peak | Core 1 peak |
|---|---:|---:|
| Eight 808s + sixteen DJ EQs | 3926.375 | 3927.6875 |
| Alternating 808/909 + sixteen DJ EQs | 4106.25 | 4107.5625 |

Units are executed instructions/sample for the full four-track loop, not
hardware cycles. Image SHA256:
`ee9c0db94743913658269ecf23b8b7d7b7381341829a27111f0dc046b6439cb9`.
The earlier eight-909/double-EQ failure remains a qualification limit; that
engine is unchanged. The historical measurements below predate this trim.


Measured 28 September 2026 on the DSP 808/909 audition image. Historical two-voice measurements follow below. The two-instance ceiling
was removed on 29 September; see the eight-track results below. Hardware
headroom is not established. These are executed instructions, not hardware cycles, wall-clock percentages, or a proof that every combination is safe.

Audition image SHA256 (before the track-shortcut UI fix): `14785240b3a522e5f16487db8f03af04b5cbec4c27e75f7f3019c9cec19a3788`.

Pre-optimization image SHA256: `38de63afe9ded717c1fca296ccb56adecc9058a4b528b89360db36ced8a38168`.

## Sound-preserving scheduling optimization

On 28 September, independent immediate loads were paired with existing ALU operations, and each of the four shared Mackie curves pairs the product save with a register-to-accumulator transfer. The arithmetic, coefficient tables, truncation points and state updates are unchanged. Both engines use the same optimized desk body. Actual assembled instructions are round-trip disassembled; the parallel-immediate and register-transfer forms occur in the stock payload.

Peak executed instructions/sample fell from **227.9375 to 218.9375 (3.95%)** for 808 and **334.125 to 322.125 (3.59%)** for 909. Combined glue/engine code shrank from 1014 to **993 P words**, leaving 70 words in the 1063-word donor region. The shared stock reverb routine now uses 35 of those words; 35 remain free.

`verify_analog_bd_exact.py` compares output and every block-boundary state hash against the saved pre-optimization executables. All **1,835,008 sample frames**, across eight cases, match exactly. Cases cover defaults, minimum/maximum controls, every trigger offset, rapid retriggers, long tails and deterministic random automation. `exact-render.json` contains the reference hashes; the original binaries and raw comparison evidence stay under `out/analog-bassdrum/optimization/before/` and its parent. The gate is registered in the module manifest.

## Shared stock reverb preservation

The optimized load test exposed an existing integration defect: three DARK call sites per payload enter a 35-word shared routine inside SPRING's harvested region (A P:1586, B P:1346). Earlier Analog BD builds overwrote this routine. Continuing to run was not proof of correct stock reverb behavior; **the earlier full-chain DARK measurements are superseded**.

The builder now copies that routine from the user's pristine image into the last 35 donor words, verifies its normalized SHA256, relocates its one absolute DO end and retargets all three stock calls per payload. It reserves this space before placing either engine. No stock firmware bytes are stored in source control. `verify_analog_bd_reverbs.py` compares pristine and patched PLATE/DARK on both cores, using X:0 audio, fixed and moving knobs: every rendered sample matches exactly. A negative control against the original audition image produces different DARK audio, proving this gate catches the previous defect. The 24-configuration build refhash gate also remains bit-identical.

## DSP engine and reverb comparison

4096 blocks of 16 samples. Engine figures include block control, trigger work, LPF and the Mackie stage. Default, maximum and moving knobs, every trigger offset, repeated triggers and idle rendering were exercised. Stock effects and Mini Verb run independently on both cores at the real X:0 audio address; their null dispatch overhead is subtracted. Different call boundaries make this a work comparison, not an exact incremental FX-slot equivalence.

| Engine/effect | Worst tested instructions/sample/instance |
|---|---:|
| PLATE REV | 183.9 |
| DARK REV | 193.2 |
| DSP 808, including desk/LPF | 218.9 |
| SPRING REV (comparison only; harvested in this remix) | 257.5 |
| Mini Verb (comparison only; not composable in this remix) | 310.4 |
| DSP 909, including desk/LPF | 322.1 |

The 808 is cheaper than SPRING; the 909 is slightly more expensive than Mini Verb. Neither voice has a full inactive bypass: silent 909 blocks still execute about 320 instructions/sample. Capacity estimates therefore cannot assume that silence releases DSP capacity.

At that revision, the DSP gates enforced **code-growth ceilings** of 3504 instructions/block for 808 and 5168 for 909. These are measured regression limits, **not hardware budgets**. A failure calls for a new full-chain benchmark, rather than silently increasing the limit.

## Final full-firmware load tests

15 scenarios, 900 sequencer frames each at 300 BPM; every step retriggers. The first 50 transport frames are excluded from the statistics below. Every track must produce audio in both output channels, and every Analog BD voice must deliver its own trigger/control record. Both engines, two voices on one core, mixed models, split cores and the reversed core assignment were exercised. Six remaining sources use live THRU input or pitched/timestretched FLEX playback as named. Both FX slots are occupied on all eight tracks.

The stopwatch surrounds the complete four-track source/AMP/FX loop: A P:372..53e or B P:17a..333. It includes source glue and stock per-track work. It excludes surrounding mixdown, host IO, DMA waits and memory contention. It cannot be compared numerically with a 3120-**cycle** effect budget or advertised as a whole-core utilization percentage.

| Case | Core | Mean instructions/sample | Peak |
|---|---:|---:|---:|
| dark-808pair | 1 | 2767.9 | 2846.9 |
| dark-909pair | 1 | 2974.8 | 3062.8 |
| dark-909pair-flex | 1 | 2970.6 | 3068.2 |
| dark-mixedpair | 1 | 2871.1 | 2950.4 |
| dark-split-core0 | 0 | 2678.7 | 2756.1 |
| dark-split-core1 | 1 | 2574.8 | 2654.4 |
| dark-stock | 1 | 2378.7 | 2457.4 |
| eq-909pair | 1 | 3683.2 | 3730.9 |
| eq-909pair-core0 | 0 | 3684.8 | 3730.8 |
| eq-909pair-flex | 1 | 3689.1 | 3743.7 |
| eq-stock | 1 | 3092.8 | 3136.7 |
| eq-stock-core0 | 0 | 3092.2 | 3136.1 |
| eq-stock-flex | 1 | 3104.6 | 3162.2 |
| plate-909pair | 1 | 2877.4 | 2923.9 |
| plate-stock | 1 | 2287.1 | 2329.7 |

`stock` in this table means no Analog BD assignments in the **same patched image**; the remaining tracks are THRU, or FLEX in the `-flex` cases. `909pair` replaces two of them with 909s. DARK and PLATE cases also have FILTER on FX1. EQ cases put DJ EQ in both slots. The dearest observed stock effect is DJ EQ; its measured instruction cost is unchanged by the tested knob sweep.

All 15 final-image scenarios passed. Two 909s with FILTER + DARK REV raise the peak from 2457.4 to 3062.8 instructions/sample. With DJ EQ in both slots, the peak rises from 3136.7 to 3730.9; with pitched/timestretched FLEX playback the peak is 3743.7. The paired-909 EQ/FLEX case is 24 instructions/sample cheaper than before scheduling optimization. DARK comparisons use the corrected stock routine and supersede the earlier broken-helper measurements. These runs demonstrate additional work without a measured local failure, not hardware-safe spare capacity.

### Fixture limitations and corrections

- The previous standalone stock benchmark used the host default X:80 audio buffer, which overlaps stock scratch. It has been replaced by X:0, one independent instance per core. Do not reuse the older multi-instance-buffer audio evidence. Corrected instruction prices are in `out/stock_dsp_bench/`.
- A fully-wet PLATE fixture returned effectively silent output, including a pristine-stock standalone control. Changing the audio address did **not** resolve it. PLATE full-firmware cases use MIX 64 and GVOL 127; they prove that mixed-output chain, not a working fully-wet PLATE path. This remains an explicit reference/fixture qualification item.
- The normal cycle/pressure registry sees Analog BD as a ColdFire module and misses the DSP source engines (`Module.dsp` is absent). The module now declares `pressure_blocker`, so acceptance explicitly reports **blocked** instead of a misleading N/A. The explicit benchmarks and growth gates are required until source-engine pricing is implemented.
- Local instruction scheduling does not reproduce physical bus contention. A chip burn/headroom sweep remains necessary before a hardware-safety claim.

## ColdFire comparison

These figures cover the two source calls per track per 16-sample frame, including helpers, over 400 active frames. They are a different processor from the DSP table and must not be added to it.

| Source/routine | ColdFire instructions/sample |
|---|---:|
| neighbor | 14.19 |
| thru | 45.00 |
| flex | 59.75 |
| static | 62.25 |
| flex-stretch | 63.53 |
| flex-beat | 63.56 |
| flex-pitched | 65.41 |
| ab808 | 45.12 |
| ab909 | 45.12 |
| Stock DELAY (eight-instance routine, amortized per track) | 59.59 |

The retired ColdFire synthesis implementation measured 908.25 (808) and 1061.44 (909) instructions/sample. Those numbers are historical and no longer describe the running image. Both current control senders measure **45.125**, approximately 95% less ColdFire work. Stock DELAY was rerun: 7628 instructions for all eight stereo delays per 16-sample frame, identical minimum/mean/maximum over 1000 blocks after 1500 warm-up blocks.

## Reproduce

```sh
python3 tools/harness/verify_analog_bd_exact.py
python3 tools/harness/verify_analog_bd_reverbs.py
python3 tools/harness/benchmark_stock_dsp.py --blocks 4096
python3 tools/harness/benchmark_analog_bd.py --project out/analog-bassdrum/ui-fixture --engines-only
python3 tools/harness/benchmark_analog_bd.py --project out/analog-bassdrum/ui-fixture --image out/analog-bassdrum/optimization/analog-bassdrum-fixed.os --out out/analog-bassdrum/optimization/load-fixed --jobs 2
```

The full-chain harness builds a local instrumented meter against `out/emu` libraries. It retains every stopwatch pair, bypassing the ordinary diagnostic's 4096-entry cap, and writes counts only after execution. No firmware or checked-in emulator behavior changes. Sources, build commands, hashes, raw counts, generated projects, audio evidence and per-case results for the final run remain under `out/analog-bassdrum/optimization/load-fixed/`; earlier evidence stays under `out/analog-bassdrum/load-benchmark/`. Full-chain runs require an explicit `--image` pointing to a frozen build; never copy the mutable build output while a gate suite is running. No user audio, firmware or generated binary belongs in the PR.

## Eight-track review revision, 29 September 2026

Four independent state slots per engine already existed on each core, so
lifting admission adds no DSP state allocation or dynamic loading. The
stock-supported ASL and DO forms preserve all exact-render hashes. The
combined code now occupies 992 P words, plus the 35-word preserved helper.
The stock multi-bit shift reduces the current 808 peak to 217.9375
instructions/sample; the 909 remains 322.125.

The 900-frame tests below assign all eight tracks, retrigger every step,
and require stereo post-FX audio plus each track's own control/trig record.
Each core is metered separately; the values cover its whole four-track loop.
The artifact measured here is SHA256
`427c218ed647ac8dcb0ef1a0b99a78685d4aa68c1e86085feb29a09edeb45520`.
It predates the pool-style browser and the equivalent 808 DO-form change.

| Layout | Core | Peak instructions/sample | Result |
|---|---:|---:|---|
| dark-808eight-core0 | 0 | 3242.06 | stereo audio + controls pass |
| dark-808eight-core1 | 1 | 3230.25 | stereo audio + controls pass |
| dark-909eight-core0 | 0 | 3660.06 | stereo audio + controls pass |
| dark-909eight-core1 | 1 | 3653.50 | stereo audio + controls pass |
| dark-mixedeight-core0 | 0 | 3448.38 | stereo audio + controls pass |
| dark-mixedeight-core1 | 1 | 3443.94 | stereo audio + controls pass |
| eq-808eight-core0 | 0 | 3914.38 | stereo audio + controls pass |
| eq-808eight-core1 | 1 | 3915.69 | stereo audio + controls pass |
| eq-mixedeight-core0 | 0 | 4100.25 | stereo audio + controls pass |
| eq-mixedeight-core1 | 1 | 4101.56 | stereo audio + controls pass |
| eq-909eight | both | incomplete processing; not a usable load price | **FAIL: silent output** |

Eight 909s plus sixteen DJ EQ instances fail under the local model; do not
use the partial-loop count as a safe peak. Eight 808s and mixed models pass
that layout, and all three model layouts pass FILTER + DARK. This is a
measured operating envelope, not a guarantee of chip headroom. The explicit
benchmark keeps the failing scenarios visible and returns failure for them.
Dynamic code loading would increase the engine library's possible size,
not reduce active synthesis or effect processing cost.

As a diagnostic only, raising `--dsp-ips` from the port's normal 4160 to
5200 makes the same eight-909/double-DJ-EQ fixture produce audio on all eight
tracks. Its complete four-track-loop peak then measures 4325.1875
instructions/sample, already above the normal budget before surrounding IO.
The normal-budget failure remains the acceptance result; the raised-budget
run isolates processing capacity and is not a performance workaround.
