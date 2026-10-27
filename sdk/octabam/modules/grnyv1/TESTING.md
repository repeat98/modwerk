# FRACT tests

## Source-package integration repair (2026-10-26)

The submission now includes deterministic GCC 16.2.0 generation and the
five authored ColdFire assembly units consumed by the native manifest.
Run `python3 -B sdk/octabam/modules/grnyv1/generate.py --check` from the
repository root to verify them without firmware. The five units assembled
with `m68k-elf-as -mcpu=54455` are byte-identical to the prepared sources
used for the installed runtime. Only four source-path comments in view.s
differ from that preparation; they produce no machine bytes. The C, DSP,
handwritten kernels, grain count and SPCE behavior are unchanged.

Adding the generator, assembly and generated headers changes the native
source fingerprint from
`1dd1b2483751a763678adfc73879874f1b0f1557896355fd85469b2e177fc6a8` to
`2fb01eaa8a26b0c3fec74ef41cc947aebbc74693c2f8aac2bdd87a4792f82ad3`.
Existing audio, resource and partial hardware evidence is retained by this
object equivalence, not by a fresh DSP or hardware test. The shared package
builder and browser runtime now include FRACT's five units, DSP, descriptor
and guarded source-fetch detour. Static DSP metadata includes FX id 7 at
native priority 19, so the browser places SPACE and reserves its stock donors.

On source-package commit `fbc366ba` (merged upstream `32a9fb8c`), the pinned
Docker toolchain compiled the authored packages without stock firmware or
network access. Development import and `--check-only --verify-existing`
passed. Native/browser comparison on the author's original OS 1.40C passed
all 158 selections: 56 module-owned images match outside the declared
platform writes, 102 refusals match, zero mismatches. A changed original OS
is refused. `sdk/native-comparisons/grnyv1.json` contains fingerprints only.
Pair verification checked 31 modules, 465 pairs in three contexts, with
10 existing refusals and no new FRACT clash. These checks establish build
integration, not a new USB installation or hardware qualification.

After merging upstream `916ce01b`, the exact source-package import check,
native fingerprint check, 44 catalog/engine test files (304 tests), typecheck,
lint (11 existing warnings), Vite bundle, contracts and compatibility/pair
checks passed. Release-note, document-size, licence, machine and vendored-kit
checks passed too. Tape Echo and Euclid pin four shared JSON inputs, so adding
FRACT required refreshing those source hashes. Their reviewed image hashes,
copy spans and stock guards are unchanged. With the kit-pinned Elekloader
`3b31ef3c`, Python 3.12 and the DSP assembler on PATH,
`python3 -B scripts/octatrack-module-packages.py --check` reproduced every
current published package byte for byte. Play Modes remains deliberately
held at its older published version; its recipe/package is untouched.
The final `npm run sdk:check` passed: 458 SDK tests (18 skipped), upload
host checks and 37 recipe tests (one skipped). Skipped physical/emulator
checks are not counted as hardware validation.

The integration Jev advisory sampled 16/24 fragments: zero flagged,
15 uncertain, eight deferred and five assembly files static-only. All
uncertain locations and the deferred declarations were inspected with
callers; assembled-object equality, isolated compilation and native parity
provide independent evidence. The advisory remains partial, not complete.
The bounded follow-up reused the 16 judgments and passed typecheck/source
parity; it made no new API requests. With imported data included, its ledger
has 58 parsed fragments, 45 deferred entries (including three oversized
generated files), 15 uncertain judgments and seven static-only files.
Imported artifacts are checked by the exact source importer and native
comparison; this does not turn deferred API coverage into reviewed code.
The author waived full DSP-suite and `pr:ready` reruns; targeted integration
checks do not replace those or the remaining hardware checks.

## Author attribution correction (2026-10-25)

The author and author URL now identify [ex1010](https://github.com/ex1010).
Of the native files covered by Modwerk's `moduleNativeSourceSha256`, only
`manifest.py` changed, and only its author fields. The native fingerprint
therefore changed from
`52ba3a71987dfe595908a4ee733b5f11da572f461b933f6e00117de3c74470de` to
`1dd1b2483751a763678adfc73879874f1b0f1557896355fd85469b2e177fc6a8`.

The corrected source was compiled with the existing `scripts/build.py`
`prepare()` path, then packaged by `scripts/runtime_package.py` against
Modwerk `9ec79ed25d9ff4012498215bb80afd8ca4e9f10c` and Elekloader
`c150ac583a4b7e6d64680d5592f4a40f409193f7`. The resulting runtime package
is byte-identical to the installed package: 22,148 bytes, SHA-256
`fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`.
All grain, controller and DSP source files are unchanged. Existing resource
and partial device evidence is retained for those exact runtime bytes;
this is an attribution equivalence check, not a fresh test-suite or hardware
run. At the time of this attribution check, Docker compilation/import and
native/browser parity on the newer submission base were unverified; the
integration repair above records their subsequent results. The user waived
full test-suite reruns before the draft.

## Linked output-envelope build (2026-10-25)

Source revision: `41e4b9699c7f3e8d611aa6f7cd03633bc272dc76` (output-envelope
implementation); package built with Modwerk `9ec79ed25d9f` and Elekloader
`c150ac583a4b`.
`fract-0.10.0-dev.mwrm`, **22,148 bytes**, SHA-256
`fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`.
Card image SHA-256
`3ae08fe552c97d2a8597f9f6010267c5aa85ef22259d1e7f0ce4126271579370`;
engine source SHA-256
`18e4476e7c38d4722700d87344a0e34fff036dd7f1d75c80cb3b63780f5e715e`.
ABI 8, flags 3, FX2 id 7; DSP 593 words, 412 declared instructions/sample,
64 declared state words (only the existing 32 at r7+$20..$3f used),
15,779 ring words; relocations5/55/69/98, INIT0, PROC17. ColdFire 19,316
bytes,80 relocations,2 hooks and 1 stock site, unchanged from variant A.

The exact package `fef9db2b` was installed on the owner's Octatrack MKII on
2026-10-25. The USB trial was accepted, FRACT is active at handle 7 and the
loader reports no missing modules. The owner heard softer guitar attacks, but
individual grains remained separable and countable at SPCE 127; this is a
partial hardware result and the continuous-cloud goal is not claimed.
This build adds only a linked stereo post-blend envelope servo above 96:
Ef 512 samples, Es 512 updates at 16-sample intervals, 4096-sample priming on
each entry, correction step 1/512, d bounded -.375..+.0625, gain 1+8*u*d.
It never feeds the tank. Grain source identities and PRNG order are fixed.
The shared knee subroutine and equivalent parallel scheduling fund the
controller: 593/594 donor words, 409.2/411.6 raw executed instructions/sample
against 414. DSP stack bound 4 entries/core; ColdFire cost/stack unchanged.

| Release check | Current result |
|---|---|
| `make check` | PASS, 283 PASS lines including 91 SPACE gates |
| `make runtime-package`, `make runtime-package-check` | PASS, fef9db2b, 24 package checks |
| `make native-check` | PASS, 25 clips, errors `[]`; explicit 600 guest-ms selector waits, assertions unchanged |
| `make ui-probe-check` | PASS, errors `[]`, 0 missed snapshots |
| `make probe-check` | PASS, 2 QEMU runner + 52 probe checks |
| `make cost-check` | PASS, 52 profile + 8 detour checks; ColdFire cost/stack unchanged |
| `make perf-record`, Modwerk perf audit | PASS, 405.06 / 407.38 net instructions/sample; stress peaks 2789.6 / 2767.8 per core, no clobber/hang; audit exit 0 |
| package identity against Modwerk 9ec79ed2 and Elekloader c150ac5 (kit 0.7.0) | PASS, exact package bytes and SHA-256 fef9db2b match |
| exact-build Octatrack installation | PASS, trial accepted on base d6bfff70; handle 7; `nothing missing`; listening partial (see hardware evidence) |
| fresh `ambient_dissolve.py --compare-production` | PASS, both default cases reproduce grid deltas within 1e-8; no prior scratch inputs or render caches, clipping 0 |

`make check` covers all 128 Q23 amounts, full modulation turns, one-frame
and split calls, automation and exact fitted stereo/mono 0..96; the one-LSB
boundary sabotage fails 96 alone. Frozen variant A/grain-source hashes are
gated. Disabled-controller and cold-reference mutants fail their matching
audio predicates. Dirty eight-instance ring/shared guards cover both cores.
Original HF suppression and click/zipper thresholds are retained. Isolated
IR energy intentionally changes .082 to.0631216 (-1.13dB), early 120 ms
fraction .190 to .043614; its behavior-specific gate is now .050..080.

| SPCE 127 case | H delta dB | CV ratio | Level delta dB |
|---|---:|---:|---:|
| Guitar SIZE 86 | -2.61533 | .850712 | +.03089 |
| Guitar SIZE 100 | -7.43381 | .794687 | +.01696 |
| Pad SIZE 86 | -3.29746 | .807139 | +.09661 |
| Pad SIZE 100 | -2.87789 | .847126 | -.23059 |

The 26-case actual-byte grid has no clipping, CV ratios .392..991, level
changes -.448..+.097 dB, H changes -18.748..+.820 dB and normalized Flux95
ratios .960..1.051. Some short-grain cases do not improve H. These are
engineering criteria, not calibrated perceptual thresholds or independent
holdout data. The earlier 9.3% "dry share" is correlated programme
projection; fully wet has no physical direct feed (first response 977 samples).
Study and reproducible commands: `../../docs/DISSOLVE_RESEARCH.md`.

Static cost is reproduced with `python3.12 -B scripts/space_static_cost.py`.
The raw pinned SDK command refuses forward BRA, so it is not reported as
passing. The adapter extends just that parser in memory, preserves its
target checks/BSR accounting and verifies marker byte identity: 458 loop
words plus two (23-word callee + 4 call/return) = 512 cycles/sample; 94/call,
8,380/splitblock and 33,520/four instances of 49,920/core. This excludes
memory-contention stalls. See [evidence/cycles.md](evidence/cycles.md).

Performance audit command (Node 24 in PATH, Modwerk `9ec79ed2`):
`npm run perf:audit -- check <this-module>/evidence/performance.json`.
The two notes require the DSP cost to remain explicit:

```text
✓ record          dsp record for grnyv1@0.10.0-experimental
· cycles          4 x 512 = 2048 of 3120 per sample per core (66%), measured 407.38 per instance
· stock benchmark 407.38 vs PLATE REV 218.25 (1.87x); the dearest stock effect is 330.94
✓ stress          4 per core, eight tracks, 3 LFOs and 18 changed slots, 4 s, no clobber, no hang
```

The audit calls those 18 slots locked; only 12 main-page controls are lockable
on the unit. SETUP controls are driven directly by this DSP-only stress runner.

The final deep Jev pass on parent `8ffef0f` reviews **16/125 changed
fragments: 0 flagged, 16 uncertain, 109 deferred**, with **20 files
excluded/static-only**. Configured `make check` passes in 504.59 s; no
service/parser/check error remains. All 16 uncertain locations and selected
deferred/excluded changes were independently investigated against full
source/callers and executed evidence; no defect was confirmed. DSP assembly
is outside API coverage and was checked manually against the Q23 oracle,
resource accounting and byte comparisons. Classifier uncertainty remains;
this is partial advisory coverage, not a clean/complete Jev review.
Per-location investigation: `../../docs/DISSOLVE_RESEARCH.md`; private
checkpoint and ledger: `out/dissolve-hybrid/release-jev-checkpoint.json`
and `release-jev-investigation.json` in the repository root. Only prose
changed after that pass; the classified source and package stay unchanged.

**Hardware report for this exact package is partial.** `fef9db2b` was accepted
on base `d6bfff70` on 2026-10-25; inventory shows FRACT at handle 7 and
`missing` is empty. The owner heard softer attacks but still countable grains
at SPCE 127. TSTR OFF/one FRACT track was used for the install. Full controls,
entry/re-entry, pumping/level, CPU, project persistence, power-cycle, T3/T7
and POLY8 checks remain unverified. This report records hardware observations only; draft submission does not
establish publication. Older entries preserve their dated results.

## SPACE's top range, variant A (2026-10-24)

The user, on `55f0fdff` at the unit (base `d6bfff70`): the dry grains at
SPCE 0 are fine, but at 127 "I hear every grain, just with space on it";
before it, on `ff7332b4`, 127 was far too bright. The ambient research
(`docs/AMBIENT_RESEARCH.md`, on the assembled bytes) found the dry floor of
the first top-range fix the cause of the lost smear (36 % of the output's
energy at 127 the dry grains, 9 % fully wet), and the brightness before it
a gain-staging fault: the ×4 wet makeup driving the knee. The user approved
the research's recommended first build, variant A (§4.3: "do it
professionally, build the first variant"). Package
`fract-0.10.0-dev.mwrm`, 22,104 bytes, SHA-256
`62672f6f7f398e60808d8081a73f36fb53d1bb8915d5b0df4b872be4284a8892` (ABI 8,
flags 3, id 7, 582 DSP words, 405 executed cycles); against `55f0fdff`
(unpacked with Modwerk's `verify_static.unpack_recipe`) its ColdFire code
(19,316 bytes), 80 relocations, site record and the whole 19,684-byte body
between the header and the DSP section are identical; of the header only
bytes 35 (DSP words 583 → 582) and 45 (cycles 400 → 405) differ, and the
DSP section (its relocations 8/59/76/108: the code before the loop is the
fitted engine's again). Byte-identical built against Modwerk `f692fd6` and
`f99681ec`. Design and figures: `docs/SPACE.md`, "Top range".

- **Engine** (`engine.asm`): d764dfb's three changes are gone: `x:$25` is
  `m²` again (fully wet at 127), the decay target follows the fitted law to
  `0x7bd241` (.9674) at 127, and the mid and side high-pass coefficient is
  `0x00ba37` (40 Hz) at every SPCE, loaded once a sample into `y0` for both.
  New, every sample, from the slewed mix `m` in `a` right after the slew:
  `u = max(m − 3/4, 0)` (`sub #>$600000,a`, `clr b`, `max a,b`); the
  damping coefficient `x:$3d = $533333 − u` (0.65 → 0.40), read by the four
  branches instead of the immediate `#>$533333`; the knee drive's eighth
  `x:$3e = $400000 − u` (×4 → ×2), loaded into `y0` before the output
  projections, each of which becomes `move a,x0` (the projection,
  saturated), `mpy y0,x0,a`, `asl #3` and the knee's own saturating
  `move a,x0`. At `u = 0` the product is `projection/2` exactly and the
  shift gives `4 × projection`; saturating the projection first changes
  nothing because any drive ≥ 2 clamps `|projection| ≥ 1/2` anyway. 582
  words (583; the Plate donor's 594 still holds), 402.4/404.8 executed
  instructions a sample unsplit/split (396.6/399.1; the fitted engine
  401.4/403.8); static loop 461 cycles (458). Two state words used
  (`x:$3d`, `x:$3e`, inside the 32 INIT and the clear already zero; written
  every sample before they are read); no ring word or buffer added. The
  forms `mpy x0,y0` and `mac x1,y1`, which `dsp_asm` silently encodes as the
  mixed-sign `mpysu`/`macsu`, are not used (`make check` refuses both).
- **Against the research's patch** (scratch `ambient-research/asm/A-…asm`):
  that one computed both ramps once a call from the raw knob word (slope
  32/31 per unit of `s/128`) and kept d764dfb's high-pass and dry-floor code
  disabled by immediates, 609 words at 403.8/407.5. Computing them every
  sample from the slewed mix with slope exactly 1 is both cheaper (582
  words) and what keeps a jump of the knob from stepping the drive. Its
  figures (`variant-a/measure.py`, the same signals) agree with this
  build's to 0.1 dB in every band and in the knee and smear figures; its 127
  is one LSB away (`$333333`/`$200000` against `$333334`/`$200001`), and its
  112 a hair darker (0.521 against 0.525). The one LSB flips occasional
  roundings in the 15 s tank; the two impulse responses part by 2-3 LSB at
  the first arrival and by −27 dB at 3 s, so the T20 fit at 500 Hz moves by
  2 % (12.8 s there, 13.1 here); a louder impulse leaves it there.
- **Bit-exact range.** `fitted_parity` unchanged: this engine equals the
  frozen fitted one at every SPCE 0..96, stereo and L = R mono, 16-frame,
  one-frame and split calls, all fifteen splits and the 73,984-frame
  modulation turn at 96, automation inside 0..96; SPCE 97 differs. The
  sabotage is now a gate in `make check`: the ramps one LSB early
  (`sub #>$5fffff,a`) equal the fitted engine at 95 and differ at 96, stereo
  and mono. The mono gate against 0.9.6 (`tests/oracle096/engine.asm`) still
  covers 0..96.
- **Above 96.** The Q23 oracle (`tests/space_reference.c`) models the two
  ramps (`u`, the damping and the knee's `q(8 × mul(q(projection), drive/8))`)
  and matches the bytes at all 128 amounts, through a full modulation turn
  and with 15-frame calls. It now also takes `dsp_host`'s `-paramfile`, so
  automation is modelled call for call.
- **Gates replaced** (`tests/verify_space.py`; each threshold's reason is in
  the code): the impulse at 127 is again removed to the Q23 floor (was
  exactly Q/8, the quarter); tail energy per impulse energy 0.082, gate
  0.065-0.105 (the ×2 drive is a quarter of the energy and the darker
  damping takes the highs; was 0.35-0.6 for the dry-floor build, 0.55-0.9
  for the fitted engine's 0.69); first 120 ms 0.190 of the tail, gate < 0.22
  (fitted 0.174, gate < 0.20; the darker late tail leaves a little more
  early); the blend's constant-power gate and the full-scale ceiling gate
  back to the fitted engine's (no floor: `max |y| ≤ 13/16 + 2 LSB`); the
  55 Hz bass weight 1.003e6 Q23 RMS at 127, gate 0.94e6-1.07e6 (the 40 Hz
  tank's bass at half the fitted engine's 1.892e6 by the ×2 drive; a lost
  ramp gives about 1.9e6, a higher input corner about half); the glide gate
  back to the shipped engine's blend coefficients block for block; the
  decay-cap gate replaced by `decay_target` (the fitted law at 96, 111, 112,
  113, 120 and 127, `0x7bd241` at 127); the reported-problem gate now
  requires the clamp at most a twentieth of the fitted engine's and the
  >1 kHz share at least 10 dB below it (was a quarter and 4 dB), its knee
  probe reading this engine's drive (`(drive/8) × projection / 2`).
- **New gates:** `top_range_automation` (76 events on an established tail:
  jumps among 96, 97, 100, 120 and 127, a sweep 96 → 127 → 96 one unit a
  block, 112, zero and a reopen; the bytes equal the oracle word for word
  with 16-frame, one-frame and split calls; read back after every
  one-frame call, 10,432 samples, `x:$3d = .65 − u` and `x:$3e = .5 − u` of
  that sample's slewed mix, moving at most 1/256 a sample; a mutant taking
  `u` from the unslewed target `x:$26` fails the oracle); `smear`
  (`tests/space_grains.c`: FRACT's reference grains of the kit pad at the
  defaults through SPACE; the share of the output's energy that is the dry
  grains, 9.3 % at 127, the fitted engine 8.8 %, SPCE 96 58.0 %; gate
  < 12 % and below a fifth of 96's); `damping` (T60 per octave from 2048-point
  Hann frames, T20 × 3, of a 16 s impulse response: 250 Hz 5.3/7.9/16.4 s,
  1 kHz 4.9/6.5/9.0, 4 kHz 2.5/2.2/1.5 at 96/112/127; the fitted engine at
  127 16.8 and 4.1; gates: 4 kHz and the 4 kHz/250 Hz ratio fall at every
  step, the 250 Hz decay within 10 % of the fitted engine's, 4 kHz below
  half of it); `zipper` (the kit pad 12 dB under its own level, energy above
  4 kHz per 1024-frame window: eight jumps 96 ↔ 127 −31.6 dB at the loudest
  against the fitted engine's −34.8, gate +6 dB, 61 dB under the programme;
  the stepped mutant +4.1 dB, gate ≥ 20 dB above; two hand-speed sweeps, one
  unit per 32 blocks, −24.6 against −31.2 dB, gate +9 dB, 53.8 dB under the
  programme in the loudest window, gate 50). The sweep figure is the knob's
  own granularity: one SPCE unit moves the drive by 1/16 (1.6-3.1 % of the
  wet) within the blend's two samples, where the dry moves by 1.4 % of the
  input, so the ticks are larger than the blend's alone; both are steps of
  the control, not of the ramps (the stepped mutant's sweeps differ from
  this engine's by 4 dB, its jumps by 36 dB).
- **Figures that moved** (`out/space-evidence.json`): T20 × 3 at 127 6.1 →
  13.4 s (the fitted engine's 13.4); the last second's energy over the first's 0 → 2.3e-6 (the fitted engine 1.2e-6; the dry-floor build's 6 s tail had decayed below one LSB); the melt
  texture min/mean 0.570 → 0.628, variation 0.193 → 0.218 (gates
  unchanged: > 0.5 and < 0.25); full-scale peaks at 127 back under the wet
  ceiling (55 Hz 0.621, 110 Hz 13/16 + 1 LSB, 4 kHz 0.576, DC 0.133 of full scale; the dry-floor build's 4 kHz reached full scale); echo density at 200 ms 0.985; tail correlation
  −0.009.

Band tables (the brightness study's and the research's method,
`variant-a/measure.py` in the session scratchpad on the frozen fitted
engine, the dry-floor engine `d764dfb` and this one: Welch, Hann 8192, 50 %
overlap, both channels; each band's output energy over the dry's, dB; from
4 s into the signal; ">1 kHz" the output's share above 1 kHz; "clamp" the
share of samples whose knee argument reaches the clamp, from a probe copy of
each engine; "dry share" the output's energy that is the dry input by
least-squares projection; "AM 8 Hz" the output envelope's modulation at the
grain rate). The kit pad has nothing above 785 Hz, so its bands above 2 kHz
are distortion over the dry's numerical floor. SPCE 96 is the same in all
three engines, word for word:

Pink noise, stereo, −18 dBFS RMS:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | +0.4 | +0.6 | +1.8 | +1.9 | −0.5 | −3.9 | −5.6 | −4.9 dB | 0.00 % |
| 112 | fitted | +1.7 | +2.1 | +3.4 | +3.4 | +0.1 | −5.1 | −8.2 | −5.6 dB | 0.00 % |
| 112 | dry floor | +0.9 | −0.8 | +2.9 | +3.4 | +0.1 | −5.0 | −8.0 | −4.7 dB | 0.00 % |
| 112 | variant A | −1.0 | −0.2 | +0.9 | +0.5 | −3.9 | −8.8 | −10.8 | −6.3 dB | 0.00 % |
| 127 | fitted | +4.4 | +5.5 | +6.2 | +6.0 | +1.1 | −5.6 | −10.0 | −6.7 dB | 0.00 % |
| 127 | dry floor | +0.5 | −2.9 | +2.4 | +3.5 | +0.3 | −4.8 | −7.9 | −4.2 dB | 0.00 % |
| 127 | variant A | −2.4 | −0.2 | +0.1 | −2.1 | −9.8 | −17.4 | −22.1 | −9.8 dB | 0.00 % |

Pink noise, stereo, −12 dBFS RMS:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | +0.1 | +0.3 | +1.5 | +1.6 | −0.7 | −4.0 | −5.7 | −4.8 dB | 0.00 % |
| 112 | fitted | +1.3 | +1.7 | +2.9 | +3.0 | −0.3 | −5.4 | −8.5 | −5.5 dB | 0.02 % |
| 112 | dry floor | +0.5 | −1.1 | +2.6 | +3.0 | −0.2 | −5.2 | −8.2 | −4.7 dB | 0.00 % |
| 112 | variant A | −1.2 | −0.4 | +0.7 | +0.3 | −4.1 | −8.9 | −10.9 | −6.3 dB | 0.00 % |
| 127 | fitted | +3.5 | +4.6 | +5.3 | +5.2 | +0.4 | −6.3 | −10.7 | −6.6 dB | 0.61 % |
| 127 | dry floor | +0.2 | −3.1 | +2.1 | +3.2 | −0.0 | −5.1 | −8.1 | −4.1 dB | 0.00 % |
| 127 | variant A | −2.5 | −0.4 | −0.1 | −2.2 | −10.0 | −17.6 | −22.2 | −9.8 dB | 0.00 % |

Kit pad `FR16ST.WAV` at its own level (−8.5 dBFS peak), straight into SPACE:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | +2.2 | −4.1 | +2.2 | +5.8 | +27.3 | −4.0 | −5.6 | −41.8 dB | 0.00 % |
| 112 | fitted | +4.0 | −3.5 | +4.0 | +7.8 | +33.9 | −5.3 | −8.2 | −39.0 dB | 0.00 % |
| 112 | dry floor | +3.5 | −4.6 | +3.5 | +7.7 | +33.6 | −5.2 | −8.0 | −39.6 dB | 0.00 % |
| 112 | variant A | +1.6 | −5.8 | +1.6 | +5.6 | +26.6 | −8.8 | −10.7 | −44.2 dB | 0.00 % |
| 127 | fitted | +6.7 | −1.5 | +6.7 | +10.8 | +43.8 | −3.7 | −10.3 | −34.4 dB | 0.03 % |
| 127 | dry floor | +3.0 | −5.6 | +2.9 | +7.8 | +33.4 | −5.0 | −7.9 | −40.5 dB | 0.00 % |
| 127 | variant A | +0.8 | −7.2 | +0.8 | +4.5 | +23.9 | −17.4 | −21.5 | −47.8 dB | 0.00 % |

Kit pad at −1 dBFS peak:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | +0.9 | −4.5 | +0.8 | +5.0 | +46.7 | +22.5 | +10.5 | −28.0 dB | 3.06 % |
| 112 | fitted | +2.0 | −4.3 | +1.9 | +6.8 | +51.6 | +21.9 | +4.6 | −25.4 dB | 7.97 % |
| 112 | dry floor | +1.7 | −5.0 | +1.6 | +6.7 | +51.0 | +20.9 | +4.0 | −25.8 dB | 5.92 % |
| 112 | variant A | +0.5 | −6.5 | +0.4 | +4.9 | +43.8 | +12.1 | −4.4 | −29.1 dB | 1.27 % |
| 127 | fitted | +3.4 | −1.9 | +3.2 | +9.2 | +60.5 | +30.3 | +12.8 | −20.9 dB | 23.39 % |
| 127 | dry floor | +1.5 | −5.8 | +1.3 | +6.8 | +50.2 | +19.9 | +4.2 | −26.2 dB | 3.48 % |
| 127 | variant A | −0.1 | −7.9 | −0.1 | +3.9 | +39.1 | −1.5 | −18.0 | −31.9 dB | 0.24 % |

FRACT's grains of the kit pad at the default level (DENS 127, SIZE 86, SPRD 0):

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp | dry share | AM 8 Hz |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | −4.9 | −2.9 | −5.1 | −3.4 | −0.6 | −3.8 | −5.5 | −71.2 dB | 0.00 % | 58.0 % | −30.0 dB |
| 112 | fitted | −6.8 | −1.6 | −7.0 | −5.0 | −0.2 | −4.9 | −7.9 | −69.8 dB | 0.00 % | 28.8 % | −31.2 dB |
| 112 | dry floor | −7.0 | −3.2 | −7.2 | −5.3 | −0.2 | −4.8 | −7.8 | −69.5 dB | 0.00 % | 33.4 % | −31.1 dB |
| 112 | variant A | −8.5 | −4.2 | −8.7 | −6.8 | −4.0 | −8.6 | −10.6 | −71.5 dB | 0.00 % | 40.3 % | −30.5 dB |
| 127 | fitted | −7.7 | +3.3 | −7.9 | −6.5 | +0.6 | −5.4 | −9.5 | −68.4 dB | 0.00 % | 8.8 % | −37.3 dB |
| 127 | dry floor | −7.4 | −4.3 | −7.6 | −5.6 | −0.2 | −4.7 | −7.7 | −69.0 dB | 0.00 % | 35.9 % | −31.1 dB |
| 127 | variant A | −13.8 | −4.2 | −13.9 | −12.6 | −10.2 | −17.3 | −21.3 | −72.9 dB | 0.00 % | 9.3 % | −37.7 dB |

T60 per octave (s), Butterworth octave bands, T20 × 3, 20 s impulse response:

| SPCE | | 63 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k | broadband | wet energy / impulse | first 120 ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | all three | 4.4 | 5.4 | 5.3 | 5.0 | 4.9 | 3.7 | 2.5 | 1.3 | 0.7 | 4.2 | 0.326 | 0.305 |
| 112 | fitted | 6.6 | 8.1 | 7.8 | 7.4 | 7.0 | 5.1 | 3.0 | 1.4 | 0.8 | 6.3 | 0.454 | 0.253 |
| 112 | dry floor | 6.6 | 8.1 | 7.9 | 7.4 | 7.0 | 5.1 | 3.0 | 1.4 | 0.8 | 6.2 | 0.442 | 0.255 |
| 112 | variant A | 6.7 | 8.1 | 7.8 | 7.2 | 6.4 | 4.1 | 2.1 | 1.0 | 0.6 | 6.3 | 0.182 | 0.263 |
| 127 | fitted | 14.3 | 17.1 | 16.4 | 15.4 | 13.3 | 8.3 | 4.0 | 1.6 | 0.8 | 13.6 | 0.689 | 0.176 |
| 127 | dry floor | 6.6 | 8.1 | 7.8 | 7.4 | 7.0 | 5.1 | 3.0 | 1.4 | 0.8 | 6.2 | 0.450 | 0.258 |
| 127 | variant A | 14.6 | 17.1 | 15.9 | 13.1 | 8.8 | 4.0 | 1.5 | 0.7 | 0.5 | 13.6 | 0.082 | 0.191 |

| Command | Result (2026-10-24, on the final tree; every gate run one at a time) |
|---|---|
| `make check` | 263 PASS, 0 FAIL (the dry-floor build's 255 with its top-range gates replaced, plus the boundary sabotage, three top-range automation gates, smear, damping, click and zipper; parity with the frozen 0.9.6 units: 449 scenarios, 242,439 calls, 0 mismatches) |
| `make runtime-package` | 22,104 bytes, `62672f6f…`, "DSP effect 7: 582 words, 4 relocations", 405 executed cycles (admission 414) |
| `FRACT_MODWERK=<Modwerk f99681ec> runtime_package.build` (scratch folder) | byte-identical, `62672f6f…` (the source of base `d6bfff70`) |
| `make runtime-package-check` | 24 checks pass (582 words, relocations 8/59/76/108, 405 cycles) |
| `make native-check` | no errors: card build `b02d6816…`, 25 clips; SPACE's tail after STOP, last second 13,428 against 1,239,386 in the first (an earlier run on the same code: 10,927 against 2,485,604; octemu's real-time captures vary between runs) |
| `make ui-probe-check` | no errors: probe image `70880f23…`, marks fx2-fract 66 / fx2-knobs 41 / fx1 44 / fx2-other 194 / fx2-second 40 / fx2-second-stopped 31 / converge 205, 0 missed snapshots (another project's Android emulator ran throughout; an earlier run on the same code: 59 / 38 / 43 / 170 / 37 / 30 / 186, no errors); the card build restored after it (`b02d6816…`) |
| `make probe-check` | 2 QEMU runner and 52 probe checks pass |
| `make cost-check` | 52 profile and 8 detour checks pass; `out/coldfire-profile.json` byte-identical to the one before (the ColdFire code is unchanged) |
| `make perf-record` | `cycle_count.py`: 461 cycles a sample (458 for the dry-floor build, 463 fitted), 4 x 461 = 1,844 a core; `benchmark_stock_dsp.py`: the stock rows unchanged (SPRING REV 257.5, PLATE REV 183.9, DARK REV 193.2, DJ EQ 293.4 unsplit); `perf_record.py bench`: FRACT 398.19 unsplit, 400.56 with splits (392.38 / 394.94 before), 398.12 at SPCE 1-96 held, 398.19 at 127; `perf_record.py stress --seconds 4`: no hang, FRACT 0 stray writes, 0 clobbers, per-core peak 2,765.4 (2,742.7) ([evidence/performance.json](evidence/performance.json)); run twice on the final tree's code, `bench.json` byte-identical and `stress.json` equal but for the host's wall time (141.4 s recorded, 138.4 s) |
| `npm run perf:audit -- check evidence/performance.json` | Modwerk `f99681ec` and `610a934`: no check failed; notes: 1,844 of 3,120 a core (59 %), 1.84x PLATE REV and dearer than DJ EQ, justified in the record |

The module's `sourceSha256` in `octamod.module.json` is Modwerk's own
`moduleNativeSourceSha256` (`scripts/module-qualification.mjs`, run from the
`f99681ec` checkout with Node's type stripping), which reproduced the
recorded `2984ab49…` on `714dddb`'s folder before it was recomputed.
`make media-capture` was not rerun: the LCD does not draw SPACE's sound,
and the page bytes are unchanged. Hardware: PENDING (the kit's
`UNIT_CHECK.md`, step 2 for SPACE).

## SPACE's top range (2026-10-23)

Replaced on 2026-10-24 by variant A (the section above); kept as the record of `55f0fdff`.

The user, on `ff7332b4` at the unit (base `d6bfff70`): SPCE at its maximum
gives far too many highs, and the other frequencies drop. The brightness
study (session scratchpad `space-bright/`: `dsp_host` on the assembled bytes
and scratch variants) found the linear reverb darker at 127 and the highs
in the wet knee's distortion of loud sustained low and mid material that
built up in the tank; the dry vanished between 112 and 127. The user asked
for the professional fix directly, without A/B rounds. Package
`fract-0.10.0-dev.mwrm`, 22,108 bytes, SHA-256
`55f0fdff702789aa3a9084dfff0720321ede62aa6d6268628a20bd46d9bbdba3` (ABI 8,
flags 3, id 7, 583 DSP words, 400 executed cycles); its ColdFire code (19,316
bytes), relocations (80), site and page are those of `ff7332b4` (unpacked
with Modwerk's `verify_static.unpack_recipe` and compared); the header's
words and cycles and the DSP section differ (its relocations 8/59/76/112:
the decay cap's four words move the loop's from 108). Design and figures: `docs/SPACE.md`, "Top
range".

- **Engine** (`engine.asm`): above m = 3/4 (SPCE 96) the mid and side
  high-pass coefficient is `max(c40 + (m − 3/4)/16, c40)` from the slewed mix
  (`y0`, every sample; 40 Hz → 151 Hz at 127); `x:$25` is `min(m², 3/4)`, so
  `dry = max(1 − m², 1/4)`; the decay target is capped at `0x770f5b`, its
  SPCE-112 value, once a call. Paid for, bit-exactly: the input allpasses
  hold the tap in `x0` and the stored value in `x1` (no copy through `b`),
  the first stores through `(r5)` (no `n5 = 0`), and the tank keeps
  `2 × g × mean` in `b` (`move a,b`, the same Q23 transfer the store made)
  instead of storing `x:$35` and reloading it four times; the never-read
  mean store `x:$34` is gone. 583 words (584), 396.6/399.1 executed
  instructions a sample unsplit/split (401.4/403.8), four instances 25,544 a
  block (25,840); static loop 458 cycles (463). No state word, ring word or
  buffer added; INIT and the clear still zero `x:$34`/`$35`.
- **Bit-exact range.** `make check` assembles the previous engine, frozen as
  `tests/oracle_space_fitted/engine.asm` (SHA-256 checked), and requires
  this one to equal it at every SPCE 0..96: stereo and L = R mono full-range
  input, 12,000 frames (the clear, the glide and 10,000 wet frames), with
  16-frame, one-frame and split calls (the split point walking 1..15 with
  the amount) against its 16-frame calls; all fifteen splits and a 73,984
  frame modulation turn at 96; automation inside 0..96. SPCE 97 must differ.
  Scratch sabotage: the high-pass knee one LSB early, or the dry cap one LSB
  below 96's m², each leave 95 identical and break 96. The mono gate against
  0.9.6 (`tests/oracle096/engine.asm`) now covers SPCE 0..96 (one-frame
  calls at 1, 80, 96; splits 1-15 and the full turn at 96).
- **Above 96** the independent Q23 oracle (`tests/space_reference.c`)
  models the three changes and matches the bytes at all 128 amounts, through
  a full modulation turn and with 15-frame calls. New gates: the decay
  target read back (`x:$24`) equals the formula at 96, 111 and 112 and holds
  `0x770f5b` at 113, 120 and 127; the impulse at 127 keeps exactly Q/8 of a
  Q/2 direct sample (the quarter); the glide back from 127 keeps the shipped
  engine's mix and wet curve and `min(m², 3/4)` as the dry's attenuation.
- **The reported problem** (new gate, `reported_problem`): the kit's pad
  `FR16ST.WAV` (rebuilt from its formula and checked against the file's
  SHA-256), at its own level and at −1 dBFS peak, through the fitted engine
  and this one at SPCE 127, from 4 s in: own level, energy above 1 kHz
  −34.4 → −40.5 dB of the output (the pad has none: all distortion), knee
  clamp 0.03 % → 0 %; −1 dBFS, −20.9 → −26.2 dB, 23.39 % → 3.48 % (SPCE 96,
  unchanged, −28.0 dB and 3.06 %). The gate requires a quarter of the clamp
  and 4 dB less share at both levels. Its Welch spectrum is pure Python and
  equals the study's numpy figure to 1e-12.
- **Figures that moved** (`out/space-evidence.json`): wet energy per impulse
  energy 0.693 → 0.453 (gate .35-.6, was .55-.9); first 120 ms 0.174 →
  0.255 of the tail (gate < .30, was < .20: the shorter decay; 112 had 0.250
  before); T20×3 13.4 → 6.1 s; nominal 55 Hz at 127 1.892e6 → 1.152e6 Q23
  RMS (gate 1.05e6-1.3e6, was 1.75e6-2.05e6; the dry floor's own share is
  0.741e6); the melt texture min/mean 0.637 → 0.570, variation 0.177 →
  0.193 (gates unchanged); full-scale stress at 127 now bounded by the wet
  ceiling plus a quarter of the input (`4|y| − |x| ≤ 4 × (13/16 + 2 LSB)`,
  excess exactly 13/16 at 110 Hz and 4 kHz; 4 kHz full scale reaches full
  scale); the blend gate allows the floor's 1/16 above m² = 3/4. The
  encoding gate refuses `macsu` as well as `mpysu` (`dsp_asm` emits them
  for `mpy x0,y0` and `mac x1,y1`; the engine writes `y0,x0` and `y1,x1`).

**Band tables** (the brightness study's method, `space-bright/measure.py`, on the frozen previous engine and this one: Welch, Hann 8192, 50 % overlap, both channels; each band's output energy over the dry's, dB; from 4 s into the signal; ">1 kHz" the output's share above 1 kHz; "clamp" the share of samples whose knee argument reaches the clamp, from a probe copy of each engine whose outputs carry the knee's argument). The kit pad has nothing above 785 Hz, so its bands above 2 kHz are distortion over the dry's numerical floor:

Pink noise, stereo, −18 dBFS RMS:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | both | +0.4 | +0.6 | +1.8 | +1.9 | −0.5 | −3.9 | −5.6 | −4.9 dB | 0.00 % |
| 112 | before | +1.7 | +2.1 | +3.4 | +3.4 | +0.1 | −5.1 | −8.2 | −5.6 dB | 0.00 % |
| 112 | after | +0.9 | −0.8 | +2.9 | +3.4 | +0.1 | −5.0 | −8.0 | −4.7 dB | 0.00 % |
| 127 | before | +4.4 | +5.5 | +6.2 | +6.0 | +1.1 | −5.6 | −10.0 | −6.7 dB | 0.00 % |
| 127 | after | +0.5 | −2.9 | +2.4 | +3.5 | +0.3 | −4.8 | −7.9 | −4.2 dB | 0.00 % |

Pink noise, stereo, −12 dBFS RMS:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | both | +0.1 | +0.3 | +1.5 | +1.6 | −0.7 | −4.1 | −5.7 | −4.8 dB | 0.00 % |
| 112 | before | +1.3 | +1.7 | +2.9 | +3.0 | −0.3 | −5.4 | −8.5 | −5.5 dB | 0.02 % |
| 112 | after | +0.5 | −1.1 | +2.6 | +3.1 | −0.2 | −5.2 | −8.2 | −4.7 dB | 0.00 % |
| 127 | before | +3.5 | +4.6 | +5.3 | +5.2 | +0.4 | −6.3 | −10.7 | −6.6 dB | 0.61 % |
| 127 | after | +0.2 | −3.1 | +2.1 | +3.2 | −0.0 | −5.1 | −8.1 | −4.1 dB | 0.00 % |

Kit pad `FR16ST.WAV` at its own level (−8.5 dBFS peak), straight into SPACE:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | both | +2.2 | −4.1 | +2.2 | +5.8 | +27.3 | −4.0 | −5.6 | −41.8 dB | 0.00 % |
| 112 | before | +4.0 | −3.5 | +4.0 | +7.8 | +33.9 | −5.3 | −8.3 | −39.0 dB | 0.00 % |
| 112 | after | +3.5 | −4.6 | +3.5 | +7.7 | +33.6 | −5.2 | −8.0 | −39.6 dB | 0.00 % |
| 127 | before | +6.7 | −1.5 | +6.7 | +10.8 | +43.8 | −3.7 | −10.3 | −34.4 dB | 0.03 % |
| 127 | after | +3.0 | −5.6 | +2.9 | +7.8 | +33.4 | −5.0 | −7.9 | −40.5 dB | 0.00 % |

Kit pad at −1 dBFS peak:

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | both | +0.9 | −4.5 | +0.8 | +5.0 | +46.7 | +22.5 | +10.5 | −28.0 dB | 3.06 % |
| 112 | before | +2.0 | −4.3 | +1.9 | +6.7 | +51.6 | +21.9 | +4.6 | −25.4 dB | 7.97 % |
| 112 | after | +1.7 | −5.0 | +1.6 | +6.7 | +51.0 | +20.9 | +4.0 | −25.8 dB | 5.92 % |
| 127 | before | +3.4 | −1.9 | +3.2 | +9.2 | +60.5 | +30.3 | +12.9 | −20.9 dB | 23.39 % |
| 127 | after | +1.5 | −5.8 | +1.3 | +6.8 | +50.2 | +19.8 | +4.2 | −26.2 dB | 3.48 % |

FRACT's grains of the kit pad at the default level (the study's grain render):

| SPCE | | level | <150 | 150-500 | 500-2k | 2k-6k | 6k-12k | >12k | >1 kHz | clamp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 96 | both | −4.9 | −2.9 | −5.1 | −3.4 | −0.6 | −3.8 | −5.5 | −71.2 dB | 0.00 % |
| 112 | before | −6.8 | −1.6 | −7.0 | −5.0 | −0.2 | −4.9 | −7.9 | −69.8 dB | 0.00 % |
| 112 | after | −7.0 | −3.3 | −7.2 | −5.3 | −0.2 | −4.9 | −7.8 | −69.5 dB | 0.00 % |
| 127 | before | −7.7 | +3.3 | −7.9 | −6.5 | +0.6 | −5.4 | −9.5 | −68.4 dB | 0.00 % |
| 127 | after | −7.4 | −4.3 | −7.6 | −5.6 | −0.2 | −4.7 | −7.7 | −69.0 dB | 0.00 % |

| Command | Result (2026-10-23) |
|---|---|
| `make check` | 255 PASS, 0 FAIL (251 + the fitted-engine parity, its splits/turn/automation, the decay cap and the reported problem; parity with the frozen 0.9.6 units: 449 scenarios, 242,439 calls, 0 mismatches) |
| `make runtime-package` | 22,108 bytes, `55f0fdff…`, "DSP effect 7: 583 words, 4 relocations", 400 executed cycles (admission 414) |
| `FRACT_MODWERK=<Modwerk f99681ec> runtime_package.build` (scratch folder) | byte-identical, `55f0fdff…` (the source of base `d6bfff70`) |
| `make runtime-package-check` | 24 checks pass (583 words, relocations 8/59/76/112, 400 cycles) |
| `make native-check` | no errors: card build `8272825e…`, 25 clips; SPACE's tail after STOP, last second 14,330 against 2,698,852 in the first |
| `make ui-probe-check` | no errors: probe image `61b6595b…`, marks fx2-fract 61 / fx2-knobs 36 / fx1 40 / fx2-other 168 / fx2-second 37 / fx2-second-stopped 28 / converge 188, 0 missed snapshots (load average 5-7: another project's Android emulator ran throughout); the card build restored after it (`8272825e…`) |
| `make probe-check` | 2 QEMU runner and 52 probe checks pass |
| `make cost-check` | 52 profile and 8 detour checks pass; `out/coldfire-profile.json` byte-identical to the one before (the ColdFire code is unchanged) |
| `make perf-record` | `cycle_count.py`: 458 cycles a sample (463 before), 4 x 458 = 1,832 a core; `benchmark_stock_dsp.py`: the stock rows unchanged (SPRING REV 257.5, PLATE REV 183.9, DARK REV 193.2, DJ EQ 293.4 unsplit); `perf_record.py bench`: FRACT 392.38 unsplit, 394.94 with splits (397.19 / 399.56 before), 392.31 at SPCE 1-96 held, 392.38 at 127; `perf_record.py stress --seconds 4`: no hang, FRACT 0 stray writes, 0 clobbers, per-core peak 2,742.7 (2,761.4) ([evidence/performance.json](evidence/performance.json)) |
| `npm run perf:audit -- check evidence/performance.json` | Modwerk `f99681ec` and `610a934`: no check failed; notes: 1,832 of 3,120 a core (59 %), 1.81x PLATE REV and dearer than DJ EQ, justified in the record |

The module's `sourceSha256` in `octamod.module.json` is Modwerk's own
`moduleNativeSourceSha256` (`scripts/module-qualification.mjs`, run from
the `f99681ec` checkout with Node's type stripping), which reproduced the
recorded `de946ca6…` on `ce7014f`'s folder before it was recomputed.
`make media-capture` was not rerun: the LCD does not draw SPACE's sound,
and the page bytes are unchanged. Hardware: PENDING (the kit's
`UNIT_CHECK.md`, step 2 for SPACE).

## FX2 id 7 (2026-10-22)

FRACT's FX2 effect id moves from `0x09` (LOFI2's on Modwerk main since #749)
to `0x07`. Source: `57db580` plus the commit that adds this section (the
manifest's `fx2_id`, `sourcehook.s`'s `moveq`, the tests that name the id,
the documents). Package `out/fract-0.10.0-dev.mwrm`, 22,112 bytes, SHA-256
`ff7332b4266779b99846b3a0fb76d7d83a18e644ccd68f7858e487ee70e50e99` (ABI 8,
flags 3, effect 7, SPACE 584 words, 404 executed cycles declared, state 64,
buffer 15,779, one site `0x400041cc`); card build `out/grnyv1.os`
`f7da71100e007c230ce7d4bf97d647dbb3de981fbfa473e8507f9e7347ae64fe`; UI probe
image `853c4eeb3c76ef7647a59d2316006208abd38242fd356151aea362a77c7724f6`.
Same tools as the record below.

**Choosing the id.** `MenuEntry` takes `0x04`-`0x1f` only, and
`schema.STOCK_FX2_IDS` (stock's 14 effects and the hidden MULTIBCOMP,
`0x19`) leaves 13 ids, exactly the base's module ids (`customIds` 6, 7, 9,
10, 11, 14, 15, 23, 26, 27, 29, 30, 31 in `chooser-metadata.json`; the
published base's id set `ec80cec0` and every id from 32 up). Main `610a934`
holds twelve of them (`0x06` RINGMOD SC since #783 that day). Every open
pull request (#555, #560, #564, #676, #775, #776), every unmerged branch and
PR head of repeat98/modwerk and the branches of 44 recently pushed forks
claim none of `0x07` or any id from 32 up; upstream octabam's own images
give `0x07` to BusVerb (all 13 of its module ids are taken there). Ids from
32 up are refused by the schema, the contract (`effectId` 4-31) and the
card builds. Modwerk has no reservation mechanism.

**The package against `86aaa8db…`** (kept as `fx09-86aaa8db/` in the kit):
same size, 57 bytes differ, every one the id. The DSP section's id byte
(file offset `0x26`, 9 to 7); the page recipe's id byte (`0x8f`,
descriptor offset 3); `og_fetch`'s `moveq #9,%d1` now `#7` (`0x3ad5`); and
GCC's encoding of the other compares with `OG_FX_ID`, each at the same
length: `og_release_check`'s `moveq #9,%d2` became `mov3q.l #7,%d2`
(`0x3794`), three compares in `og_render` (`moveq #9,%d1` ... `cmp.l
%d0,%d1` became ... `subq.l #7,%d0; tst.l %d0`, at `0x382c`, `0x385c`,
`0x38d6`) and `visible()`'s in `view.c` (the same with `%d2`/`%d1`, at
`0x3ce6`). The code image starts at the same offset, its 80 relocations,
the 584 DSP words, the site, the hooks, names, controls and defaults are
unchanged. Built against Modwerk `f692fd6` and against origin/main `610a934`:
byte-identical.

| Command | Result (2026-10-22, FX2 id 7) |
|---|---|
| `make check` | 251 PASS, 0 FAIL; parity with the frozen 0.9.6 units 449 scenarios, 242,439 calls, 0 mismatches (the harnesses give 0.9.6 its own `0x09` and this engine `OG_FX_ID`); "FRACT's FX2 id 0x07 is its own" |
| `make runtime-package` | 22,112 bytes, `ff7332b4…`, "DSP effect 7: 584 words, 4 relocations" |
| `FRACT_MODWERK=<origin/main 610a934> make runtime-package` (built to a scratch folder) | byte-identical, `ff7332b4…` |
| `make runtime-package-check` | 24 checks pass (id 7, FX2 slot `0x400d5ff8`) |
| `make native-check` | no errors, 25 clips, image `f7da7110…` |
| `make ui-probe-check` | no errors: marks fx2-fract 65 / fx2-knobs 42 / fx1 62 / fx2-other 215 / fx2-second 56 / fx2-second-stopped 31 / converge 197, 0 missed snapshots. One run while another project's Android emulator held the host at a load of about 16 stopped in the fx2-other phase (5 errors, the later phases not reached) with the same probe image; rerun at a load below 6, it passed, as it had before the final edits |
| `make probe-check` | 2 QEMU runner and 52 probe-package checks |
| `make cost-check` | 52 profile and 8 detour checks; `out/coldfire-profile.json` identical to the `86aaa8db` build's in every row |
| `make media-capture` | the four PNGs byte-identical to `media/` (so not recaptured) |
| SPACE and DSP evidence | `out/space-evidence.json` and `out/dsp-evidence.json` identical |

**A Part saved with FRACT at 9.** octemu, card build `f7da7110…`, the demo
project that the `4218bc3b…` card build (FRACT at 9) saved with FRACT on T1
FX2: T1's Part FX2 byte stays 9 and the live id 9, the FX2 page reads
`FX2>NONE` and FX2 SETUP's list stands on NONE (9 has stock's NONE
descriptor and the null DSP stub). Choosing FRACT wrote 7 and its defaults
(POS 18, SIZE 86, REVS 127, SPRD 0, SPCE 0, SHPE 64; PAN 0, SCAN 64, SRNG
FULL, DENS 127). Over USB, Modwerk's base code (`dsp.c`, `fxmap.c`) run on
the host at `a59677e` (the unit's base) and at `610a934`, with the real
module id set and catalogue table: FRACT pinned at 9 then the new package
installed over it is admitted at handle 9, not 7, so its code would never
see its track; removed first, it is refused FULL while the project map
still names FRACT at 9; after loading a project that does not name FRACT
it is admitted at 7; loading a project saved with FRACT at 9 then takes
FRACT out of 7 (MISSING FRACT at 9, FULL on reinstall in that project)
until it is installed again; a project without map lines leaves FRACT at 7
and its tracks at 9 dry (on `610a934` they name LOFI2, the catalogue's
assignment). A non-pinned module displaced from its own handle takes the
lowest free one, 7 once RINGMOD SC holds 6, after which FRACT is refused
there. Not run on a unit.

### Modwerk gates on origin/main 610a934

The scratch worktree's branch `fract-submission`, rebased on
`610a934`, with this folder, the catalogue row, the release notes and the
regenerated `compatibility-pairs.json`, Node 24.22.0:

- `npm run modules:compat`: 25 active modules, 300 pairs and the whole set,
  67 events, **0 problems** (`-- grnyv1` alike).
- `npm run modules:pairs`: 29 modules, 406 pairs in 3 contexts, the 10
  refusals main already has, 10 largest clean selections proved;
  `-- --write` adds FRACT to the module list and no clash, after which the
  check passes.
- With each open pull request's declarations added to main and FRACT (#560
  Tuner's module and row; #555 FM Synth 0.1.5's module and row; #775's
  `events.json`; #776 and #676 merged whole; #564 changes none): compat 0
  problems and pairs passing for #560, #775, #776, #676 and #560 with #775.
  #555 alone gives 94 problems and stops `modules:pairs` ("POLY8
  composition seam drift: synth detours 0x400786c8") with or without FRACT,
  the same 94, none naming FRACT or an effect id: that pull request is
  stale against main.
- `npm run module:doctor -- grnyv1`, as committed: the contract does not
  parse (`tests.qualification.hardware.testedOn`, the `PENDING`
  placeholders). With a validation-only stub of those fields and the
  catalogue generated from it (never committed): green on catalogue entry,
  library, category guide, performance, thumbnail, module rules,
  declaration checks ("checked beside 28 modules; no collisions"),
  cross-compatibility and UI claims; red on packages, native comparison and
  package fingerprint (Docker); notes on sound quality (`fx:audit` not run)
  and conflicts ("effect id 7: refused beside Analog BD automatically").
- `npm run check -- --base origin/main`, as committed: prepare, licences
  and machines pass, modules:check stops on the placeholders. With the stub:
  every stage to the bundle passes (modules:check, elekloader, compat,
  pairs, generate, lint, typecheck, build); the test stage has 22 failures
  in 15 files and `sdk:check` 1 failure and 1 error (published packages
  rebuilt byte for byte, playmodes 0.1.1 against the catalogue's 0.2.0,
  #764; Analog BD's base-bound rebuild). Clean main `610a934` alone, on the
  same machine: 4 failures in 3 files (forum, site and module pages:
  `public/modwerk-mark.svg` and `src/styles.css` are missing from this
  checkout) and the same `sdk:check` failure and error. The other failures
  follow from FRACT being listed without the packages Modwerk compiles
  itself and without a native comparison ("Compiled module versions differ
  from the catalog", "The chooser declarations do not match this module
  version", `module:verify`'s comparison expecting source `de946ca6…`, the
  release fingerprints of the module list); none names the effect id.

## FRACT 0.10.0-experimental: the submission record (2026-10-22)

Superseded for the package by "FX2 id 7" above: `86aaa8db…` below is the
same build at FX2 id 9.

- **Module version:** 0.10.0-experimental.
- **Source revision:** `57db580c9b880b224a5a8a6b2500272e96299d9e` (branch
  `usb-engine`). The commit that adds this record changes metadata,
  documentation, media, evidence and test tooling only (`scripts/
  capture_media.py`, `scripts/perf_record.py`, two Makefile targets); no
  native source file, control, default or DSP/ColdFire code changes.
- **Package:** `out/fract-0.10.0-dev.mwrm`, 22,112 bytes, SHA-256
  `86aaa8dbcd32739ca72252dbc81a51d639b3990a11fd6e1af848929aae0eb442` (ABI 8,
  flags 3, effect 9, SPACE 584 words, 404 executed cycles declared, state
  64, buffer 15,779, one site `0x400041cc`). Card build `out/grnyv1.os`
  `4218bc3b285f12154029dfae70ff31fc91538cec1b10569f9a6bd426218cbeb1`; UI
  probe image `b868cb5339b65b6776374272815e06cfa84c9e0197b8e3a6db404b1cb5ae9aa3`.
- **Tools:** macOS 27 (arm64), Python 3.12, Node 24.22.0, the native SDK
  and package builder at Modwerk `f692fd6` (`.tools/native`,
  `.tools/modwerk-current`), Elekloader `3acac10`, QEMU from
  `~/octemu/vendor/qemu`, octemu `3adc0a8e`, `dsp_host` `2be214be…`, the
  user's own OS 1.40C (stock MAIN `164f3122…`, kept private).

| Command | Result (2026-10-22) |
|---|---|
| `make check` | 251 PASS, 0 FAIL (parity with the frozen 0.9.6 units: 449 scenarios, 242,439 calls, 0 mismatches) |
| `make cost-check` | 52 profile and 8 detour checks pass; every row equals the host build. Rows: [evidence/cycles.md](evidence/cycles.md) |
| `make runtime-package` | 22,112 bytes, SHA-256 `86aaa8db…`: byte-identical (Modwerk `f692fd6`), and again after the run below |
| `FRACT_MODWERK=<origin/main 4d4f731> make runtime-package` | 22,112 bytes, SHA-256 `86aaa8db…`: byte-identical against Modwerk origin/main `4d4f731` (a clean worktree without a grnyv1 folder) |
| `make runtime-package-check` | 24 checks pass, among them the fresh rebuild's identity and the loader admission test beside every module Modwerk shipped at `f692fd6` |
| `FRACT_MODWERK=<origin/main 4d4f731> make runtime-package-check` | 24 checks pass; its composition steps (loader admission, octabam's ledger) read Modwerk `f692fd6` by design (`MODWERK_MAIN` in `tests/verify_runtime_package.py`), so FRACT beside the modules added after it, LOFI2 among them, was not admission-tested |
| `make ui-probe-check` | no errors: probe image `b868cb53…`, marks fx2-fract 63 / fx2-knobs 41 / fx1 42 / fx2-other 184 / fx2-second 40 / fx2-second-stopped 31 / converge 192, 0 missed snapshots |
| `make media-capture` | the four PNGs of [media/](media/README.md); a second run gave byte-identical PNGs |
| `make perf-record` | `cycle_count.py`: 463 cycles a sample (SPACE's loop), 4 x 463 = 1,852 a core; `benchmark_stock_dsp.py`: SPRING REV 257.5, PLATE REV 183.9, DARK REV 193.2, DJ EQ 293.4 (unsplit); `perf_record.py bench`: FRACT 397.19 unsplit, 399.56 with splits; `perf_record.py stress --seconds 4`: no hang, FRACT 0 stray writes, 0 clobbers ([evidence/performance.json](evidence/performance.json)) |
| `npm run perf:audit -- check evidence/performance.json` (Modwerk `4d4f731`) | no check failed; notes: 1,852 of 3,120 a core (59 %), 1.83x PLATE REV and dearer than DJ EQ, justified in the record |
| `make native-check` | not run for this commit (no native input changed); its last run, at `57db580`: no errors, 40 phases, 3,092 snapshots ("REVS reads as a direction" below) |
| `npm run fx:audit` | not tested |

### Modwerk gates

On a scratch worktree of Modwerk origin/main `4d4f731` (2026-10-21; 1,596
commits after `f692fd6`) with this module folder at
`sdk/octabam/modules/grnyv1/`, the catalogue row and the release notes
(`docs/modwerk/README.md`), Node 24.22.0:

- `npm run module:doctor -- grnyv1`, with the folder as committed: the
  contract does not parse, because `tests.qualification.hardware` holds the
  `PENDING` placeholders (`testedOn: expected nonempty plain text within 10
  characters`). With those fields replaced by a validation-only stub (date,
  tester, summary; `hardwareStatus` reported), never committed: green on
  catalogue entry, library, category guide, performance ("cycles note,
  stock benchmark note, stress ok"), thumbnail, module rules (versions,
  documentation, tutorial, screenshots, qualification, resource gauges) and
  UI claims; red on **packages** and **package fingerprint** (Modwerk's own
  Docker compile and import not run: no Docker here), **native comparison**
  (`module:verify` not run), **declaration checks** (`modules:pairs`
  refuses, below) and **cross-compatibility** ("two modules claim FX2 id
  0x09: grnyv1 and lofi2"); notes on sound quality (`fx:audit` not run) and
  conflicts ("effect id 9: refused beside Analog BD automatically").
- `npm run modules:compat -- grnyv1`: one problem, the FX2 id 0x09 clash
  with LOFI2 (added to main on 2026-10-21, #749). `npm run modules:pairs --
  --write` stops at the same clash. With FRACT's id set to `0x07` in a
  scratch copy only (manifest and contract), `modules:compat` reported 0
  problems and `modules:pairs` 378 pairs with the 10 refusals main already
  has: the id is the only declared collision.
- `npm run check -- --base origin/main`, stub as above: prepare, licences,
  machines, modules:check and elekloader pass; modules:compat fails (the
  clash) and the check stops. With the scratch id `0x07` as well: every
  stage to the bundle passes (modules:check, compat, pairs, generate,
  typecheck, lint, build); the test stage has 22 failures in 15 files, and
  `sdk:check` fails. Clean main `4d4f731` alone, on the same machine, has 8
  failures in 7 files (forum, site and module pages: `public/
  modwerk-mark.svg` and `src/styles.css` missing from this checkout; four
  community tests over their 5 s timeout) and the same `sdk:check` failure
  (playmodes "kept at 0.1.1-experimental, catalogue 0.2.0-experimental",
  #764).
  The other failures follow from FRACT being listed without the packages
  Modwerk compiles itself and without a native comparison ("Compiled module
  versions differ from the catalog", "The chooser declarations do not match
  this module version", "has a native comparison of the current code for
  every offered module", the release fingerprints of the module list).
- `npm run module:verify -- grnyv1 --os <the user's OCTATRACK_OS1.40C.bin>`
  (the private update file under `~/octemu/downloads/extracted/`, SHA-256
  `34695b60…`, read in place and never copied): the OS file is accepted,
  then "Docker image modwerk-source-tools not found"; not run.

### Stock flows compared

With and without FRACT, in the emulator: the FX1 page and another effect's
FX2 page (`make ui-probe-check`: FRACT's UI stays idle there), the stock
FX2 effects' descriptors and dispatch in the card build (`make
image-check`), a track without FRACT and a stopped FRACT track (`make
cost-check`'s detour checks: no stock or arena write, one record read), the
trig declick (`make listen-kit`: 0.9.6 clicks at every trig, this build does
not, and the takes agree within 1 LSB elsewhere). On the unit (earlier
build, 2026-10-20): a Part switch, a power cycle, the missing-module path
and removal. Not tested for this build: saving, loading and copying
projects, Parts and patterns with FRACT on a unit, scenes, MIDI, recording
and sampling while FRACT plays.

### Hardware (PENDING)

The unit check of `86aaa8db` (the private kit's `UNIT_CHECK.md`) is in
progress. Its results go here, into [evidence/hardware.md](evidence/hardware.md)
and into the contract's `tests.qualification.hardware`:

- 1. Install and the defaults FRACT writes: PENDING: unit check of 86aaa8db on 2026-10-22
- 2. The sample's name: PENDING: unit check of 86aaa8db on 2026-10-22
- 3. A second FRACT is dry and shows `FRACT ON T<n>`: PENDING: unit check of 86aaa8db on 2026-10-22
- 4. SHPE: PENDING: unit check of 86aaa8db on 2026-10-22
- 5. REVS (and SCAN on SETUP B): PENDING: unit check of 86aaa8db on 2026-10-22
- 6. DENS: PENDING: unit check of 86aaa8db on 2026-10-22
- 7. CPU against the 2026-10-20 readings: PENDING: unit check of 86aaa8db on 2026-10-22
- 8. End state: PENDING: unit check of 86aaa8db on 2026-10-22

No hardware result is claimed for this build. The earlier build's session
(`72b10956…`, 2026-10-20) is summarised in `evidence/hardware.md` and
below.

## FRACT 0.10.0-dev, the USB engine (2026-10-20)

The figures in this section are the build that ran on the unit. Two later
builds add the sample's name above the overview and the second-FRACT bypass
("The sample's name" and "A second FRACT" below; package 13,168 bytes,
SHA-256 `ec0a4c104f00078f94d46b9a812c10bd1c57efc2bb35b0b1f9d87a55213282a7`,
not yet on the unit).

Package `out/fract-0.10.0-dev.mwrm` (12,396 bytes, SHA-256 `72b10956ecda18faa3551df8aa1f3164c83312fad5f9d3ef3fedcf5c87953bb3`; ABI 8,
flags 3, effect 9, SPACE 584 words at 404 executed cycles and a 15,779-word
buffer, one site at `0x400041cc`, just after the stock fetch call that POLY8
patches), built by Modwerk `f692fd6`'s `build.py`; card build `out/grnyv1.os`
(native SDK `f692fd6`) SHA-256
`623eeb343bc71c274f54d237411e36e10e7752c4bb6593187602e11b89c784ef`. Every result below is the host, QEMU or
octemu. The package ran on the unit on 2026-10-20 (`docs/HARDWARE_RUNTIME.md`,
"0.10.0-dev, 2026-10-20"; the CPU readings in `docs/M0_MEASUREMENT.md`);
still **NOT_RUN** there: the full project, PAN 127, the overview fill time,
the page check, SPACE on T3/T7 and POLY8 alongside.

- `make check`: 221 gates, among them parity with the frozen 0.9.6 units
  (`tests/oracle096`, PTCH 64): audio and all 128 state bytes after every
  call, 449 scenarios, 242,439 calls, 0 mismatches.
- `make cost-check`: every ColdFire unit on QEMU against the host build, 0
  mismatches on every row, priced with the metric the unit measured in M0
  (`docs/M0_MEASUREMENT.md`). Owner audio at track pitch 0: `owner-steady-16`
  6,319 measured cycles (6.6 points; budget 14,370), `owner-steady-8x2`
  10,513 (11.0), `owner-pan127-16` 6,812 (7.1); the track's maximum pitch with
  PCM24 stereo: `owner-pcm24-63` 14,823 (15.5) and `owner-pcm24-wrap-63`
  17,692 (18.5; budget 28,740), sample-arena reads unpriced; a track FRACT
  does not own 54 a call, a stopped FRACT track 67; the worst UI tick and
  draw 82,589 of 88,000 a tick (1.9 points). The stack bound (636 bytes)
  holds on every row (owner calls 480-492, from the seam 568-570), and so do
  the write rule and the alignment rule.
- `make runtime-package-check`: 24 checks, among them the version, the page
  names without PTCH, SPACE's 584 words, relocations 8/59/76/108 as
  assembled, 404 executed cycles and 15,779-word buffer, the single site
  (`0x400041cc`, six bytes) and that `out/fract-0.10.0-dev.mwrm` is
  byte-identical to a fresh build. Composition: Modwerk's own loader
  admission test (`claimed()`, the check behind `RUNTIME_CONFLICT`), built
  on the host from origin/main `f692fd6` (`tests/loader_admission.c`), over
  the packaged site and every module Modwerk ships (25, POLY8 among them,
  their package sites laid out by Modwerk's `machine_ports.ported()`,
  `tests/modwerk_claims.py`), in both install orders: no conflict, while
  FRACT's former site `0x400041c4` conflicts with POLY8 both ways; the site
  meets none of the base's 286 sites and no event or table site. The card
  side too: octabam's ledger, as Modwerk's `modules:pairs` runs it, finds
  nothing in FRACT beside POLY8 (`tests/modwerk_pairs.py`; the former site
  gives "both claim 0x400041c4").
- `make ui-probe-check`, `make native-check` and `make probe-check`: see the
  root [TESTING.md](../../TESTING.md) for the runs of this build.
- The emulator listening pair (`make listen-kit`, `out/fract-listen/`): at
  the trigs 0.9.6 clicks and 0.10.0-dev does not; elsewhere, where knob
  timing does not enter, they agree within 1 LSB (figures in "Retrigger
  click" below and in the kit's README).

### SPACE inside the stock effects' envelope

SPACE's ring is `+0..+$3DA2` of the FX2 slot (modulus `$3da2`, 15,779 words,
the most any stock effect writes, DARK REV), no longer the whole 16,384-word
slot, whose tail holds Sidechain Compressor's key window on T3/T7
(`+$3DFE..+$3FFF`). The two gaps Mini Verb's deeper modulation left
(2411..2466, 8361) are gone and only the side channel's extra input diffuser
is shorter, 1499 → 1129; the clear runs 15,872 words (124 blocks of 128)
through the modulus, so it still ends on a 16-frame boundary for every call
pattern (1984 frames, 2048 before), and restores the linear address mode.
584 program words (594 the cap), 401.4/403.8 executed instructions a sample
unsplit/split as before, four instances 25,840 a block as before.

- The tests were tightened first and run against the shipped engine: the
  guard at 15,779 words flagged stray writes from `+$3DA3` to `+$3FFF` (the
  whole tail: the clear wrote all 16,384 words and each segment's writes
  sweep the ring as the head moves) in the dirty, isolation, installed-image,
  automation, partial and 72,000-frame renders; the new read-back found 0 of
  4,840 tail words intact; the fitted oracle, mono and clear-alignment gates
  failed. On the fitted engine all pass.
- Read-back: eight loud instances on both cores for 33,552 frames (the clear
  and two ring turns), each slot seeded whole: every tail word still holds
  the seed (4,840 of 4,840), the ring's last word holds audio in 8 of 8, and
  the audio equals a run with zeroed tails, so the tail is never read either.
- `tests/space_reference.c`, the independent Q23 oracle, now models the
  15,779-word ring and the wrapping clear; the assembled engine equals it at
  all 128 amounts, through a full modulation turn and with 15-frame calls.
- Mono identity against the shipped engine (frozen as
  `tests/oracle096/engine.asm`): with L = R the whole output from frame 64
  on equals the fitted engine's when the fitted engine is fed the same
  signal 64 frames earlier, at all 128 SPCE values, with one-frame calls
  (SPCE 1, 80, 127), splits 1-15 and across a full modulation turn. A mid
  diffuser read one word deeper, or `m5` one word short of `m4`, breaks it.
- With no alignment at all: SPCE 0 is exact stereo dry in both engines; the
  first 1984 frames are dry in both (the fitted engine opens there, the
  shipped one at 2048); a return to zero glides block for block alike, exact
  dry 256 frames later.
- What differs: the side component's pre-echoes come every 25.6 ms instead
  of 34.0 ms, and its share of the tail is a different realization of the
  same reverb (same decay, density and spectrum, not the same samples).
- Stereo deviation (`dsp_host`, aligned, left-only impulse, the worst case:
  side equals mid): the first difference comes 2,106 frames after the
  impulse (1,129 + 977, the shortened diffuser into the first tank delay).
  Octave-band 10 ms cells over the first 300 ms differ by at most 8.9 / 9.3 /
  10.1 dB (rms 2.3 / 2.4 / 2.4) at SPCE 32 / 80 / 127, where the shipped
  reverb's own left and right channels differ by 13.6 / 14.5 / 16.2 dB (rms
  3.4 / 3.5 / 3.5) and its left-only and right-only responses by 12.9 / 12.8
  / 11.7 dB. T20×3 2.23 → 2.25, 3.20 → 3.21, 13.46 → 13.63 s; EDC within
  0.41 / 0.29 / 0.78 dB to −40 dB; mixing time 120 / 120 / 115 ms unchanged;
  tail centroid (0.5-1.5 s) 1560 → 1541, 1480 → 1471, 1319 → 1318 Hz. The
  repo's own IR figures (`out/space-evidence.json`, unaligned): wet energy
  0.688 → 0.693, first 120 ms 0.166 → 0.174, first 100 ms peak 0.0249 →
  0.0249, tail correlation −0.002 → −0.010, echo density 0.974 → 1.004, T20×3
  13.26 → 13.38 s, nominal 55 Hz 1,892,181 → 1,892,149 (mono but unaligned:
  the reverb opens 64 frames sooner; aligned it is identical).
- On Modwerk's beta base (built with `--resident-stock-hooks`) a module's FX2
  effect claims its whole block and is never placed in the track-3 block,
  whatever buffer it declares (`stock_hook_resources.c:55`,
  `resident_base.patch`), and the loader only checks the declared figure
  against 16,384 (`elekloader/dsp.c:181,219`). On that base, then, FRACT
  cannot share Sidechain's block, before the fit as after (read from source;
  which base the unit runs is not verified here); the fit makes SPACE correct
  wherever it runs (card builds, other bases, future exact claims).

The stack figures are the distance from the stack pointer at the call's
entry to its lowest value during the call. The caller's return address (and
at the seam, the stock caller's frame) lies above that entry pointer and is
not counted. Until the site moved to `0x400041cc` the seam's entry pointer
sat below the stock's six pushed arguments; it is now the stock caller's own,
24 bytes higher, so the same figure reaches 24 bytes less deep. Pushes by `jsr`, `pea` and `link` move the stack pointer, so
they are included, but they are not counted as data accesses.

## Earlier staging record

This report belongs to the private FRACT 0.9.4 staging candidate and records
only observed results. The source baseline is commit
`f560b13adb9c5dce02eae663e539b9239fd6c8e5`, accepted A, with MAIN SHA-256
`9b05c384d4a4cd87b65f64cb2efefbe898a232869de4a006ebd0caf6b72be1f6`.

## Current project evidence

The 0.9.4 report records 26 exact linked ColdFire scenarios and
38 calls with zero PCM/state/load-address/canary mismatches. It records
7,380 bytes of authored ColdFire storage, 128 bytes of shared owner state,
zero additional sample-arena bytes, and SPACE at 582/594 DSP words with
32 scalar and 16,384 ring words per instance. These are emulator/static
measurements and placement bounds.

Sound-quality limitation: the pitched linear PCM interpolator can alias bright
material when PTCH is raised; physical listening and the current SDK `fx:audit`
remain pending for this staging candidate.

The same report records sampled executed instructions and controlled call
depth, including 360/492 bytes at unity and 472/604 bytes pitched. They are
not physical cycles, complete block deadlines, cache/bus interference or
whole-device stack high-water. Physical decoder alignment, interrupt nesting
and hardware operation remain **NOT_RUN**.

In this integration worktree, `FRACT_SDK=.tools/current/sdk/octabam make check`
passed the native build, DSP/audio/state suite and MAIN image checks. The
resulting private image is byte-identical to A
(`9b05c384d4a4cd87b65f64cb2efefbe898a232869de4a006ebd0caf6b72be1f6`).
`FRACT_SDK=.tools/current/sdk/octabam make benchmark` also passed and reported
7,380 authored ColdFire bytes, zero added sample-arena bytes, 32 scalar plus
16,384 ring words per SPACE instance, and no hardware cycle result.

The isolated `make native-check` run did not complete: the stock emulator
fixture timed out while opening FX1 SETUP after boot. The log remains in
ignored `out/sdk-mkii-native/phrase-project.log`; this is an emulator walk
failure, not a FRACT audio or hardware qualification result.

The Jev deep review after the public-key rename also passed its deterministic
`make check`. It found 0 flagged fragments; 16 changed source fragments were
reviewed with 16 advisory uncertainties and 12 additional fragments deferred
when the bounded pass budget was exhausted. A final `--recheck-flagged` after
the public-label edits passed `make check` again, rechecked four metadata
fragments and left four missing-context uncertainties; its remaining 25
fragments were deferred by the bounded scope/budget. Ten documentation/media
files were static-only/excluded. Manual checks of every uncertain selector,
manifest/build identity, descriptor export, image-test caller and JSON
parser/tutorial/media guard found no confirmed defect; the review does not
qualify USB or hardware.

## Current SDK staging

Upstream was checked at Modwerk `a59677ee44b2ec8e33e7b9b8c0916097643428bb`
(rechecked 2026-10-20 at `f692fd630cbeae518c548af2f1ac447c2c500da7` for the
0.10.0-dev package and card build; see the top of this file).
The FRACT native source and image preserve accepted A behavior and the MAIN
image byte-for-byte; the public-key rename necessarily changes the manifest,
descriptor-export symbol and their verifier fixture. The v2 contract and
catalogue entry are prepared beside this source, but the following are still
pending:

- `module:doctor`, `modules:check`, `modules:compat` and the source-built
  browser/native package matrix. Doctor currently reports the expected
  unlisted/pending state under Node 24: the module is absent from
  `sdk/catalog.json`, qualification/package/native-comparison/pair evidence
  and package fingerprint are pending. Its refusal is not qualification
  evidence;
- a current `octamod.module.json` catalogue import and exact `sdk/catalog.json`
  entry in the upstream repository;
- DSP package evidence in the current loader format and a reviewed base-bound
  adapter for the five ColdFire units and their UI callbacks;
- USB installation, self-test, Keep/Undo, replacement/removal and
  missing-module fallback.

The current loader documentation says the runtime package can carry a hybrid
ColdFire/DSP package, but its generic `octabam_units` path refuses pinned
non-DRAM linked units and the runtime design still lists shared DSP routines,
Part routes and the browser builder as pending. FRACT's native manifest has
five ColdFire units pinned to existing stock caves and a DSP SPACE section, so
it cannot be declared USB-compatible by building a card image alone. With the
actual Elekloader checkout at commit `3acac10`, the real loader refused FRACT
because its five units are pinned at `0x400d6e60`, `0x400c45b0`, `0x400d24d0`,
`0x400d64dc` and `0x400d71fc`, and it requires a DSP package. Separately,
The DSP package is an explicit staging blocker, not a compatibility result;
the five units are DRAM units since Phase 1 Task 4. The adapter no longer assumes the stock arena: it reads
the base and page count from the boot literals, and its regressions cover a
moved arena (1,707 bottom pages), top reservations and refusal of literals
past the stock end before any page-table or PCM read.

## Hardware

Target: Octatrack MKII. A supplied photo shows System Status OS 1.40C, matching
the private stock base used for local checks. On 2026-10-17 macOS enumerated
`Elektron Octatrack DPS-1` (VID `0x1935`, PID `0x0002`) over USB. Modwerk base is
not installed; no package was uploaded and no device write was attempted. The
exact candidate image, FRACT audio trial, parameter extremes, modulation,
Part/project save and reload, physical reboot, instance isolation and
stock-effect combinations remain **NOT_RUN**. (That was the card candidate,
2026-10-17. The 0.10.0-dev runtime package has since run on this unit
through a Modwerk base, 2026-10-20: see the 0.10.0-dev section above.)

## Retrigger click (fixed in octemu 2026-10-19; confirmed on the unit 2026-10-20)

At every trig of the track FRACT owns, the output doubles for about a
millisecond: a click, the same in 0.9.4 through 0.10.0-dev before this fix
(the listen kit's A still has it). The cause is the stock DSP declick:

- The stock note prep sets bit 8 (0x100) of word 30 (`rec+60`) in the track's
  record, on TRIG events only (`btst #4` at 0x4000d472, the write at
  0x4000d4b0), in the same record `og_render` sees for the new voice.
- Core 1 tests it (B:0x3c6, A:0x606, with bit 12 at B:0x3c4) and adds the
  last output frame of the previous block (saved at P:0x4d6-0x4d9) to a
  per-voice offset. The offset decays by a zero-crossing table (X:0x7991,
  tau about 0.4 of the crossing gap) and is added to every output frame
  (P:0x500-0x511).
- A plain sample restarts near zero and the copy bridges the gap. FRACT's
  grains do not restart, so the copy lands on top of them, at any timing.
- octemu delivers the note-on two blocks late (its control ring), so in the
  emulator even a plain sample retriggered at a non-zero level clicks
  (stock OS, FX2 NONE: MAIN 2960 -> 0 at each trig).

A fade-in from silence at the restart (1a6dd2c, 8c60d31) left an audible
residue, and its 32-frame delay was octemu's lag. It is reverted (8f65242):
FRACT is bit-exact to 0.9.6 again.

Fixed: `og_render` clears bit 8 of word 30 in the owner track's record on
every call that reaches the engine (FX2 FRACT, TSTR OFF, voice playing,
source described). That removes the declick add and nothing else:

- No other ColdFire reader sees the bit set (read watchpoints over four
  trigs).
- The other DSP readers of word 30 test other bits (the envelope, filter and
  FX restarts are bits 12 and 15).
- A short AMP envelope (HOLD 8, REL 40) is unchanged.
- Other tracks, a released owner and FX2 NONE keep the stock declick.

Evidence (image 807fd1b7, runtime package 5b787a6d):

- Host: `tests/verify_source.c` checks that the owner's call clears only that
  bit and that every other path leaves every record byte as it was. Dropping
  the clear fails the owner case; clearing unconditionally fails the
  other-track case. Parity with 0.9.6 stays at 449 scenarios with 0
  mismatches: FRACT's own output is unchanged.
- QEMU (`make cost-check`): on the ColdFire build every owner call writes
  its record once, at word 30, and no other row writes a record or stock
  memory; across the detour matrix (both pings, eight tracks) a call writes
  only when it leaves its track the owner, and only its own word 30.
- octemu, listen kit: before the first knob gesture, B differs from 0.9.6 by
  more than 1 LSB only in A's three copies on the 2 s trig grid (at most 245
  frames each, one sign, decaying). Elsewhere it differs by 1 LSB (the
  copy's tail below 1 LSB). The largest second difference within 5 ms of 41
  trigs is 0.9.6 median 129 / max 528 LSB, B 2 / 3. Between trigs both are
  2 / 3.
- octemu, FX2 NONE (a sine at its peak at every trig, MAIN 2960 -> 0): MAIN
  is bit-identical to the stock OS render from the first sound to STOP,
  4 trigs.
- Cost: owner-steady-16 gains 5 instructions and 18 bytes of pool code;
  measured 9.46 -> 9.48 points.

Re-rendered 2026-10-20 with the 0.10.0-dev card build (image `46a25346…`,
the assembly kernel and the alignment fix; `make listen-kit`): within 5 ms of
41 trigs 0.9.6 median 128 / max 461 LSB, 0.10.0-dev 2 / 3; between trigs both
2 / 3. Before the first gesture B differs from A by more than 1 LSB only in
A's three stock copies, and every take with SPCE 0 agrees within 1 LSB but
for them.

Re-rendered again after the detour moved to `0x400041cc` (image
`2761903e…`, `scripts/listen_kit.py --reuse-a`): the same trig figures (A
128 / 461, B 2 / 3; between trigs 2 / 3), and the new B equals the previous
B bit for bit from its onset until after the first knob gesture (first
difference 8.302 s, gesture 8.172 s) and in all 8 takes with SPCE 0.

On the unit, 2026-10-20 (the clear does not depend on the note-on timing,
which differs in octemu): FRACT on T1 with `FR16ST.WAV`, LOOP OFF, trigs on
steps 1, 5, 9 and 13, a plain sample on another track. No click and no change
at FRACT's trigs; the user: "the grains sound on their own; with trigs there
is no difference". The other track's retrigs were not reported separately.

## The sample's name (2026-10-20)

The overview's caption shows the sample's name where it showed `SAMPLE`.
Where the stock keeps it was found in octemu (card build `623eeb34…`, a copy
of the listen kit's start card with three more files loaded through the
file browser, RAM dumped over gdb at each step; nothing stock is copied into
this repository):

- **The name is in the record `og_describe` already reads.** Flex slot `s`
  (0..127, the same index as `U8(voice+21)` and the Part's Flex slot) has
  its record at `0x46c922c4 + 44*s`; bytes `+24..+33` hold the stock's
  name, NUL-terminated when shorter (`SINE440`, `GRAIN-B_2`). Static slots
  use the same layout at `0x46c90a78 + 44*s`; recorder slots 128-135 hold
  `RECORDING<n>`. The address is the fixed OS 1.40C table FRACT relies on
  for `og_describe`, so no boot literal is needed.
- **Encoding.** The long file name's 8-bit bytes, case kept, the extension
  cut at the last `.` by the stock, then at most ten characters: a longer
  name keeps its first five and last five (`LONGNAME_…_abcdefghij.WAV` →
  `LONGNfghij`; the stock routine at `0x40098ce0` has two other modes, the
  first or the last ten, selected by a stock word, 5+5 in the emulator).
  Bytes after an early NUL are leftovers (`SINE440\0WA`).
- **Readers.** The stock's slot list formats each line from `+24`
  (`0x40078272`, `"%d%s%s"` with the slot number); the recorder naming
  writes `+24` at `0x400251ee`.
- **Validity.** Write watchpoints on one record over two loads: the load
  finalize sets identity, frames and the handle table, clears `+8` (from
  there `og_describe` succeeds), then calls the name writer in the same
  straight-line code, byte by byte. A reload first unloads (`+8 = 1`, a new
  identity, the name's first byte cleared), so `og_describe` fails while it
  loads; a project reload's heap reset leaves the name alone but fails
  `og_describe` too. So a valid source has its name written, except within
  that finalize, where a UI tick in another task could see none or half.

How FRACT uses it (`view.c`, `caption`, `renamed`): the tick that takes a
new source reads the ten bytes once (two longwords and a word) and composes
them into the caption's packed columns, which `compose()` then puts into the
overview's cached columns. The ticks that already look for a new source
compare the ten bytes with those it composed and compose again when they
differ, so a name the stock writes after the record turned valid replaces
`SAMPLE` or a half-written name at the next check. `og_draw` reads no name
byte. The caption: up to the first NUL or ten characters, a trailing
`.WAV`/`.AIF` in any case dropped (the stock already cut the extension; a
name like `LOOP.WAV.WAV` keeps one), lower case drawn as upper case, and
any character the font lacks as `?`; nothing left shows `SAMPLE`. The font
is the captions' 3x5 style: the 13 letters the overview drew before, unchanged,
the rest of the alphabet, the digits and space `- _ . ( ) # & + ?`. The
caption cell runs from x = 2 to 75, left of the leftmost status word (TSTR
OFF at 77): 18 characters, so the stock's ten always fit (a static assert);
no name is cut beyond the stock's own ten. An invalid or empty slot shows
`LOAD FLEX SAMPLE` as before.

- Host (`tests/verify_view.c`): the font keeps the original letters and the
  control captions' C, N and Z pixel for pixel; names render against an
  independent row-major reference (`tests/fixture_font.h`): the stock's
  leftovers after a NUL, ten characters with no NUL (nothing past `+33` is
  read), `.WAV`/`.AIF` in four cases dropped and `.AIFF`/`.WAVE` kept, lower
  case, unknown characters and bytes above 127 as `?`, one character, every
  glyph, an empty name and a bare `.WAV` as `SAMPLE`; the longest name ends
  at x = 40; `caption` reads the field once and `renamed` sees a change in
  any of the ten bytes and none past them; composed columns carry the name.
- Host against 0.9.6 (`tests/verify_view_oracle.c`): `og_draw`'s pixels
  equal 0.9.6's in 40 states but in the caption cell (x = 2..75, its five
  rows), which is checked against the reference font instead (33 states
  with a name or `SAMPLE`), and `og_draw` reads no name byte; the caption
  follows the slot: taken with a new source, `SAMPLE` while the record is
  valid but unnamed, a half-written name replaced one tick later and the
  whole name one tick after that, the columns unchanged while the bytes
  stay, three name reads on a redraw tick and none between them,
  `LOAD FLEX SAMPLE` when the slot unloads and the name back when it loads.
- QEMU (`make cost-check`): `ui-tick-name`, the tick that takes a new
  source with a ten-character name (half lower case), leaves the peaks,
  heights and columns of the Python reference (`coldfire_profile.caption_text`):
  24,650 measured cycles, 40,449 with the draw (budget 88,000). The extra
  compare raises the worst tick and draw, `ui-tick-scan-mono24` with
  `ui-draw`, from 82,589 to 82,692.
- octemu (`make ui-probe-check`): the probe reads T1's slot name over gdb at
  every snapshot (`SINE440\0WA`, the demo's `SINE440.WAV`) and the FX2 page
  capture shows `SINE440` above the overview, not `SAMPLE`.

## A second FRACT (2026-10-20)

On the unit (2026-10-20) FRACT on T1's FX2 while T5 owned the granulator
played T1's sample dry, with SPACE still working there. The user asked for a
second FRACT that does nothing: no grains and no SPACE, plain dry as with FX2
NONE, and a page that says where FRACT is. Blocking the choice in the FX
chooser is out: the chooser is the base's, and a patch site there is the
conflict class the site move removed.

**SPACE's SPCE is the word at `rec+32`** of the call record (FX2's fifth
parameter, the value shifted left by 8: SPCE 127 is `0x7f00`; `rec+24..+34`
are FX2's six parameter slots, DELAY's values with DELAY there), and SPACE
reads it at `r6+4` (`engine.asm`). Proved in octemu with the card build
`623eeb34…` (scratch harness, nothing written to the repository): T1 FRACT
with SPCE 0 owns, T2 a Flex track with FRACT at SPCE 127, T1's LEVEL 0 so
only T2 is heard; a gdb breakpoint at `og_render` cleared one word of T2's
own record on each of T2's calls:

- clearing `rec+32`: T2's output equals a run with T2's FX2 NONE, aligned,
  after a glide of 246 frames (238 frames differ, at most 28 LSB); over the
  next 435,000 frames 0 samples differ, and after STOP there is no tail
  (±1 LSB);
- without a clear, and clearing `rec+34` instead (the negative control):
  the reverb stays, every frame differs from FX2 NONE (at most 3,961 and
  3,979 LSB), and the tail after STOP rings (rms 614, 402, 260 … a second);
- the owner untouched: with T1 audible at SPCE 127 and T2's word cleared,
  T1's word read `0x7f00` on both pings and its tail after STOP matched a run
  without the clear (rms 93, 56, 36, 23 against 90, 55, 35, 24: two renders
  differ by walk timing, as SPACE's state does).

**The bypass.** `og_render`, after its release check: a call whose record
names FRACT on FX2 while another track owns FRACT clears its own record's
SPCE word and returns, leaving the dry samples. That holds however the track
could not own FRACT (TSTR on, another machine, no valid source), and before
`og_describe`, so a second FRACT's call is cheaper than before. The stock
rebuilds every record each block, and `og_render` runs after that and before
the transfer (the declick clear's timing), so the bypass holds exactly while
the calls come. A stopped voice's FRACT call never reaches `og_render`
(`og_fetch` returns at once), so `og_fetch` makes the same clear there while
another track owns FRACT (`clr.w` at `0x7ffc5430 + (a5 << 6)`); without an
owner it writes nothing, so every FRACT track keeps its SPACE, the tail
after STOP among it. A stopped voice's input is silent, so this matters only
for a tail that reaches FX2 from elsewhere (FX1). SPACE takes at most 256
frames to glide to exact dry when ownership leaves a track, and reopens
with 1984 frames of dry output when ownership arrives; both are accepted.
Not covered: a track that never reaches the fetch seam (a Thru or Neighbor
machine, unverified) keeps SPACE under FRACT; its page still names the
owner.

**The page.** `og_draw`: when `og_owner < 8` and it is not the visible
track, the whole overview is cleared and shows only `FRACT ON T<n>` (the
owner's track number) in the caption font, 43 columns from x = 34, centred
on the waveform's x = 2..109, its rows around the waveform's centre row; the
dials stay. No waveform, marks, reader squares, caption or status word.
Ownership moves (STOP lets go, and on PLAY the lower track's call acquires
first); the page follows on the next redraw, at most eight ticks later. With
no owner every FRACT page shows its own sample. The `LIMIT` status word is
gone.

- Host (`tests/verify_source.c`): with T5 owning, the calls of T1 and T7
  leave the dry samples and store once, at their own record's SPCE word,
  also with TSTR on, another machine, no valid source and a stopped voice;
  the owner stores only its declick trigger; FX2 away from FRACT and every
  call while nobody owns store nothing; after STOP and PLAY T1 owns and T5
  is bypassed; when the owner's FX2 leaves FRACT the next FRACT call
  releases and acquires instead of bypassing (16 bypassed calls). Parity
  with 0.9.6 stays at 449 scenarios, 242,439 calls, 0 mismatches: the
  owner's sound is unchanged. `tests/verify_view.c`: the page for owners
  T1..T8 against the reference font, every bit outside the viewport kept;
  `tests/verify_view_oracle.c`: in the 7 of 40 states where another track
  owns FRACT the overview is exactly that line and the rest of the frame,
  the dials among it, equals 0.9.6's.
- QEMU (`make cost-check`): rows `non-owner-fract` (from `og_render`, 173
  measured cycles), `detour-non-owner-fract` (from the seam, 286) and
  `detour-stopped-non-owner` (the seam's own path, 107; budget 1,437) write
  their record exactly once, at `0x80000170` (T1's `rec+32`); every other
  row writes as before (the owner rows their declick trigger only, the
  rest nothing). `stopped` (no owner) costs 92 (67 before: the owner test).
  `ui-draw-elsewhere`, the page, 10,382, with the heaviest tick 77,275 of
  88,000. The detour matrix (both pings, eight tracks, three FX2 words, no
  owner / this track / another, stopped / playing, stack 0 and 2 mod 4):
  a call stores once at its own declick trigger when it leaves its track
  the owner, once at its own SPCE word when it is a second FRACT (44 playing,
  64 stopped calls), and otherwise not at all. The gates fail when broken:
  the bypass at `rec+34` fails the profiler gate and the matrix, and the
  seam's clear without the owner test fails the matrix and the profiler's
  "no other row writes a record" (`stopped` wrote `0x80000170`).
- octemu, the implementation (card build `2a2af7d3…`, no gdb writes):
  T2's output with FRACT as a second FRACT equals T2 with FX2 NONE after the
  246-frame glide, 0 of 455,863 samples differing, no tail after STOP; T1's
  SPACE (SPCE 127) tail as before (rms 89, 55, 34, 23); `og_owner` 0 while
  playing, 8 after STOP, 0 again after PLAY, and T2's `rec+32` read `0000`
  after each of its calls while T1 owned and `0x7f00` once nobody did. The
  stopped-voice clear did not fire in that walk (both voices stopped
  together); the host and QEMU cover it.
- octemu, the page (`make ui-probe-check`): FRACT chosen on T3's FX2 while
  T1 plays: the capture shows only `FRACT ON T1` in the overview, centred,
  with the dials and the footer, `og_owner` read 0; after STOP `og_owner`
  read 8 and T3's page no longer names T1.

## SHPE, the grain window (2026-10-21)

Slot 5 (PTCH's until 0.10.0) is SHPE by the user's decision of 2026-10-20:
64 Hann, lower softer (flat top, Tukey widening), higher sharper
(percussive). Design and proofs, all host or emulator:

- **Neutral.** A 0.9.6 project keeps PTCH's 64 there, its unity: SHPE 64 is
  row 0, og_hann_gain, at every SIZE. Parity with the frozen 0.9.6 units at
  SHPE 64: 449 scenarios, 242,439 calls, 0 mismatches. Sabotage: SHPE 64
  mapped to row 17 fails the first matrix scenario (word 12). Selecting FRACT
  now writes 64 (the descriptor default; `make runtime-package-check` and
  `make image-check`). 0.10.0-dev's blank slot defaulted to 0, so a project
  saved with it holds 0 there (octemu: `out/fract-listen/report.json`,
  `slot5` B 0), which is now the softest window.
- **Rows** (`scripts/shapes.py` writes `shapes.h`; `make check` regenerates
  and compares it). A row is an attack half (n+1 entries, phases 0..n/128,
  ascending) and a release half (129-n entries by distance from the end),
  each rising monotonically from 0 to the row's peak, so `kernel.s` mixes
  them unchanged (its delta is unsigned) and `mix_head` only switches halves
  at n/128 instead of 1/2. Sharp steps 1..16 (SHPE 65..127): a raised-cosine
  attack of 54/128 down to 4/128 of the grain, a decay from rc(x) towards
  rc(x^1/2), peak 21,845. Soft steps 1..16 (SHPE 63..0): steps 1-8 blend Hann
  into a Tukey window with 1/3 tapers (both sum flat over three heads a
  third apart), 9-16 shorten the taper to 1/32 geometrically; their peak is
  lowered so the three-head sum sits between equal mean (correlated heads)
  and equal power (uncorrelated) with Hann. 3,120 entries, 6,240 bytes.
- **Level and ripple** of three heads a hop apart at SIZE 86
  (`tests/verify_shape.c`): soft rows -0.83..+0.83 dB of Hann (mean and
  power), ripple 0.00 dB for steps 1-8 and up to 3.52 dB beyond (the sum
  dips from three heads to two where a flat-topped grain hands over); sharp
  rows 0 to -4.33 dB (mean; -3.23 dB power) with ripple up to 9.24 dB, the
  pulse of percussive grains. No row exceeds Hann's peak, the int32 mixer's
  three-head bound, so the sharp side is not boosted.
- **No clicks.** No frame of any reachable row changes by more than a
  64-frame raised cosine at 21,845 (536 Q15 a frame; worst 532, Hann at
  SIZE 0 156), checked at every frame of every SIZE; `og_shape_caps` caps the
  steepest steps below SIZE index 18 (2,004 frames: at 10 ms grains sharp
  step 7, soft 12), and the first row past each cap exceeds the bound. Each
  grain latches its row at birth (`OgHead.shape`, one of the four bytes
  PTCH's rate and fraction used, zero at Hann), so a SHPE move never changes
  a sounding window; `verify_shape.c` turns SHPE 110 -> 10 under three live
  heads.
- **No clicks when SIZE moves** (fixed 2026-10-21, found by review). A SIZE
  edit retimes the sounding grains, which keep their row, so the cap at
  birth was not enough: a grain born at SIZE 127 with SHPE 127 (row 16) and
  dropped to SIZE 0 played the rest of its 4/128 attack in about 14 frames,
  2,247 Q15 a frame, 4.2 times the bound (row 32, SHPE 0: 1,276; with a DC
  source the worst output step after the drop was 1,078 against 195 at a
  steady SIZE 0 for SHPE 127, 638 against 231 for SHPE 0). Now `retime`
  never runs a shaped grain faster than the shortest SIZE its row is
  admitted at (`og_shape_floor`, generated beside the caps: sharp rows 8-16
  from SIZE index 2 to 18, soft rows 29-32 from 2 to 11, every other row
  from 0): below it the grain plays on at that SIZE's speed and retires
  within its length, at most 2,004 frames (45 ms) for row 16. Hann is
  admitted at every SIZE and untouched (parity unchanged). The pending birth
  is rescaled from the old SIZE's window phase, not a slowed grain's. After:
  every row born at SIZE 127 and dropped to SIZE index 0, below its
  admission and to it at 150 moments (8,850 drops; 14 moments inside row
  16's attack), and 44 SIZE walks over SHPE 0..127 (6,336 rises and drops a
  few frames to a few hundred apart, retiming one grain many times) change
  no head's window by more than 532 a frame; at the admission's speed every
  phase offset a retimed grain can hold stays within 532 too; DC output
  after the drop 258 (SHPE 127) and 253 (SHPE 0). Red at bd568bb: 13 rows
  and 17 of 44 walks over the bound. Sabotage: a floor one SIZE index too
  fast fails the same 13 rows (538..579) and 18 walks.
- **Run engine against a per-frame reference.** `tests/verify_twin.c`:
  `og_engine` against the generic engine (`og_grain_all`, built from the same
  grain.c without `OG_NATIVE_STAGE_ONE`) reading the same fixture through a
  reader that applies 0.9.6's join blend: 216 cases, 108,000 calls, all four
  formats, 5..70,000 frames with the join span and an unmapped page, SHPE
  held at 0..127 and edited with SIZE, SCAN, SPRD and PAN: every audio word
  and state byte equal (about 150 retimes slow a shaped grain to
  its row's admission).
- **CPU** (`make cost-check`, measured cycles a block): `owner-steady-16`
  6,574 (6.9 points; 6,309 before SHPE: the row read and half switch a
  span), `owner-shape-sharp-16` 6,746 (7.0), `owner-shape-soft-16` 6,733
  (7.0), `owner-shape-birth-16` 5,103 (5.3; `owner-birth-16` 4,990); stack
  504-512 bytes. Package 19,880 bytes. Since the SIZE-drop fix
  `owner-shape-drop-16` (a drop 86 -> 0 under three row-16 grains, all three
  slowed to SIZE index 18's speed, equal to the host build) costs 8,409
  (8.8 points); the one-frame retime row `owner-holes-1` 4,695 (4,607); no
  other row moved.
- **Emulator.** `make native-check`: SHPE 0 and 127 reach the Part, both
  publisher records and a birth (rows 32 and 16 at SIZE 86); every grain
  born at 64 is Hann. `make ui-probe-check`: the sixth dial follows the Part
  (SHPE turned to 0) and is captioned SHPE. `verify_view_oracle.c`: the
  sixth dial is 0.9.6's, its caption SHPE against the reference font.

## REV, reversed grains (2026-10-21)

SETUP B (slot 7) is REV by the user's decision of 2026-10-20: the
probability that a grain plays its span backwards. Since the user's
decision of 2026-10-21 REV is the third main dial (slot 2) and SCAN is
SETUP B ("REV and SCAN trade places" below); REV's logic did not change, so
the figures here hold at slot 2, and the slot-7 ones are history. The same
day REV became REVS and reads as a direction ("REVS reads as a direction"
below): REV's value v here is REVS 127 - v, which `og_render` hands the
engine as the same reverse probability, so the engine, its draws and these
figures did not change either.

- **Neutral.** Slot 7 was blank, default 0, in every FRACT, and saved
  projects hold 0 there (the listen-kit start card's Part; octemu publishes
  record bytes 49..53 as 0 throughout; the chooser writes the 0, see
  "Stored REVS, SCAN and DENS", except where a blank knob was turned). REV 0
  never draws, so a reader's REV bytes stay zero: parity with 0.9.6 at
  SHPE 64 and REV 0, 449 scenarios, 0 mismatches. Sabotage: drawing at
  REV 0 fails the first matrix scenario at state byte 30 (the sequence).
  The parity fixture now writes SETUP controls as the bytes they are (it
  used to write PAN as a word whose low byte, slot 7's, carried a random
  "fraction").
- **The draw** (`tests/verify_reverse.c`, `verify_source.c`): each reader
  has its own 16-bit xorshift (7, 9, 8) sequence (period 65,535) in the two
  bytes after SHPE's, started at `OG_REV_SEED ^ g << 12` after `og_reset`; a
  birth reverses when `(x * 127) >> 16 < REV`: never at 0, always at 127;
  2,048 births at REV 32, 64 and 96 reverse 535, 1,027 and 1,511 (expected
  516, 1,032, 1,548). REV 127 against 0 with SPRD, PAN and SCAN active: the
  same SPRD and PAN draws, scan clock, schedule, lengths and gains over 253
  births. A reversed grain starts at its span's last frame and reads down,
  wrapping at the source's start; its window runs forwards in time. A REV
  edit leaves sounding grains as they were born.
- **The kernel.** `og_mix_run_reverse` (`kernel.s`) is the same set of loops
  reading by predecrement (PCM24 mono: the frame, then three bytes down;
  PCM24 stereo: the right sample's longword, then the left's word), so a
  frame costs what it costs forwards (kernel twin rows: 1,374 / 1,247 /
  1,182 / 1,246 instructions against 1,374 / 1,246 / 1,181 / 1,245);
  `og_mix_run`'s own code is unchanged. The join span's frames are staged
  in playing order and run forwards. `verify_kernel.c`: 53,332 of 200,000
  runs read backwards, equal to the per-frame reference; the QEMU twin rows
  hold the assembly to the C twin on 1,001 runs of each format.
- **Run engine against the per-frame reference.** `verify_twin.c`, now 240
  cases (REV 0, 1, 64 and 127 held and edited, a reversed-only case at every
  format and length): reversed grains across pages, through the join span
  and the source's start equal the generic engine word for word.
- **CPU** (`make cost-check`): `owner-rev-16` 6,837 measured cycles (7.1
  points; `owner-steady-16` 6,820), `owner-rev-wrap-16` 10,790 (11.3; reading
  down across a page and through frame 0 into the join span),
  `owner-rev-birth-16` 5,265 (5.5), `owner-rev-pcm24-63` 15,358 (16.0;
  budget 28,740). At REV 0 the steady row costs 246 more than after SHPE
  (the direction read and test a span). Package 21,052 bytes.
- **Emulator.** `make native-check`: SETUP B at 127 and 0 reaches record
  byte 49 on both lanes; at 127 every new grain reads backwards, at 0 none
  (since the swap: the third dial, record word 28, does the same).

## DENS, grain density (2026-10-21)

SETUP D (slot 9) is DENS by the user's decision of 2026-10-20, which
overrides the earlier fixed-density rule.

- **Direction.** DENS reads upwards by the user's decision of 2026-10-21:
  127, the default choosing FRACT writes, is today's full density, three
  grains a third of a grain apart; lower is sparser, 0 the sparsest. This
  replaces the first ruling, under which DENS counted down from full so
  that the 0 the formerly blank slot holds in saved projects stayed
  neutral: those projects (0.9.x and the earlier 0.10.0-dev builds) now
  load the sparsest density and need DENS set to 127 once, a cost the user
  accepted ("what matters is that new projects read correctly: DENS 0 is
  the minimum, 127 the maximum"). The direction is set in one place,
  `DENSITIES` in `manifest.py`; `scripts/native.py` refuses a table that
  does not map 127 to density 127 and rise monotonically, and
  `scripts/build.py` any DENS default but 127 (and then any REV default
  but 0; since REVS, any REVS default but 127).
  Parity with 0.9.6 at SHPE 64, REV 0 (REVS 127 since) and DENS 127: 449 scenarios, 0
  mismatches. Sabotage: the read turned back to the old direction (the
  table read at 127 - DENS) fails the first matrix scenario at state byte
  108 (the countdown), and `verify_source.c` before it; the old table with
  `native.py`'s guard disabled fails `verify_dens.c`.
- **The schedule.** `og_densities[DENS]` (sizes.h, from `manifest.py`) is
  round(127 * 2^(-(127 - DENS)/32)): 127, 64 at 95, 32 at 63, 16 at 31, 8
  at 0, the first table read at 127 - DENS.
  The engine spaces births `og_hop(length, density)` = ceil(127 * length /
  (3 * density)) apart, the historical DENS schedule the research build kept
  (its `verify_density.c` and `verify_grain.c` gates run unchanged), now in
  the native engine too: a density edit keeps the pending birth's place in
  its interval, density 0 (never from the page) starts nothing. A SIZE edit
  rescales the pending wait in window-phase units as before; at a sparse
  density that product can pass 32 bits, and the units link no 64-bit
  division, so it drops low bits of the wait (relative error below 2^-8;
  exact at density 127). `verify_source.c`: every DENS value on both lanes
  reaches density and spacing (147 frames at 127, 2,334 at 0, SIZE 0); its
  records hold DENS 127 wherever full density is meant.
- **Level and readers** (`tests/verify_dens.c`, SIZE 86, DC, six whole
  birth intervals): mean 0, -2.99, -5.95, -9.01, -11.97, -17.99, -24.01 dB
  at DENS 127, 111, 95, 79, 63, 31, 0 (within 0.05 dB of -20 log10 of the
  spacing), RMS 0, -2.99, -5.73, -7.52, -9.00, -12.01, -15.02 dB; average
  sounding readers 3.00, 2.13, 1.51, 1.06, 0.76, 0.38, 0.19; at most two
  from twice the spacing, one from three times. No normalisation: a grain
  keeps its level (a boost would break the three-head bound the moment DENS
  returns to full).
- **Run engine against the per-frame reference** (`verify_twin.c`): density
  127, 64, 32 and 8 held, and 127..0 edited, in all 240 cases.
- **CPU** (`make cost-check`, measured cycles a block; every other row
  writes DENS 127 into its record, and the DENS rows keep their densities
  under new names): full density `owner-steady-16` 6,942 (7.2 points);
  `owner-dens-95-16` (density 64, two readers) 5,340 (5.6);
  `owner-dens-63-16` (density 32) and `owner-dens-0-16` (density 8), one
  reader, 3,730 (3.9); `owner-dens-gap-16` (DENS 0, between grains) 2,457
  (2.6); `owner-dens-birth-16` (DENS 0) 5,370 (5.6);
  `owner-dens-63-pcm24-63` (one PCM24 reader at the track's maximum pitch)
  7,295 (7.6; `owner-pcm24-63`, full density, 15,558). Before the flip these
  rows were `owner-dens-32-16`, `-64-16`, `-127-16` and `-64-pcm24-63`; all
  57 profile rows equal the run at 971c04d field for field (instructions,
  pool code, reads, writes, arena reads, record writes, stack, cycles). The
  figures DENS landed with (5,276, 3,631, 2,321, 5,256, 6,899) predate the
  span kernel and the SIZE-drop fix.
- **Emulator.** `make native-check`: choosing FRACT stores DENS 127 ("Stored
  REVS, SCAN and DENS" below); SETUP D at 63 reaches record byte 51 on both lanes
  and density 32, one grain sounding at a time; back at 127, density 127
  and three readers.

## Stored REVS, SCAN and DENS (2026-10-21)

A new project plays every grain forwards, holds SCAN and reads DENS
correctly only if choosing FRACT stores REVS 127 (main slot 2 since the
swap below, and REVS, reading as a direction, since "REVS reads as a
direction" below; before, REV 0, and on SETUP B, slot 7, before the swap),
SCAN 64 (SETUP B since the swap; main slot 2 before) and DENS 127 (SETUP D,
slot 9).
Octemu runs the stock OS 1.40C; T1's FX2 lives in the Part at +0x8 (its
effect id) and +0x304..+0x309 (its six SETUP values), next to its main
values at +0x12c, and the publisher copies those into record bytes 48..53.

- **The chooser writes every slot's default, a blank one's too.** On the
  FRACT 0.9.6 card image (`grnyv1-0.9.6.os`, `ff53086a…`; its descriptor has
  slots 7 and 9 blank, inactive, default 0): DELAY chosen on T1 stores its
  SETUP defaults 0, 1, 127, 1, 0, 0 (TAPE at B, SYNC at D); its six SETUP
  knobs turned up store 1, 1, 127, 1, 1, 1; FRACT chosen over it stores
  0, 0, 0, 0, 0, 0, and the records carry the same. On the build before
  DENS read upwards (REV and DENS named, active, default 0) SPRING REV
  turned to 2, 127, 127, 127, 127, 127 and then FRACT: 0 in all six.
  COMPRESSOR stores its inactive slots' defaults too (1 and 127 at slots 7
  and 8). So a 0.9.x project in which FRACT replaced a stock FX2 holds 0 in
  B and D, and so does every project saved before DENS read upwards: they
  load REV 0 and the sparsest density (set DENS to 127; the user accepted
  this, 2026-10-21).
- **The check.** `make native-check` chooses DELAY (SETUP B and D 1 in the
  Part and both records; its third dial, main slot 2, defaults to 127,
  REVS's own default, so the walk turns it to 40 on DELAY's page first),
  so FRACT's REVS 127, SCAN 64 and DENS 127 are each a write, and FRACT
  over it, and requires every FRACT default in the Part and both records:
  main 18, 86, 127, 0, 0, 64 and SETUP 0, 64, 0, 127, 0, 0 (REVS 127, SCAN
  64, DENS 127; before REVS main 18, 86, 0, 0, 0, 64, DELAY's slot 2 left
  at 127; before the swap main 18, 86, 64, 0, 0, 64 and SETUP 0, 0, 0,
  127, 0, 0).
  Sabotage: a DENS default of 126 (`scripts/build.py`'s guard widened to
  admit it) fails it ("FRACT chosen over DELAY did not store FRACT's
  defaults", then "Owner/full density (DENS 127) changed" in 29 phases
  from fract-chosen on); the same image fails `make image-check` and `make
  runtime-package-check`, and `scripts/build.py` refuses that manifest.
  (Before the flip the check required 0 in both slots, and a REV and DENS
  default of 1 patched into the image failed it.)
- **The blank knobs.** On 0.9.6 FRACT's SETUP page leaves B, D, E and F
  without a caption, but the stock still lets their knobs edit those slots:
  turned up there, the Part and both records hold 127 in slots 7, 9, 10 and
  11 (playing and stopped). 0.9.6 ignored them; 0.10.0-dev reads slot 7,
  REV until the swap below and SCAN since, and slot 9 as DENS. Both are
  covered by the migrations: a 0.9.x project's SETUP B holds 0, or whatever
  its blank knob was left at, and now loads as SCAN (0 scans backwards at
  four times speed); slot 9 holds whatever the knob was left at, which
  DENS reads upwards.

## REV and SCAN trade places (2026-10-21)

By the user's decision of 2026-10-21 REV is the third main dial (slot 2,
where SCAN was) and SCAN is SETUP B (slot 7, where REV was). Each keeps its
meaning, default and range (REV 0 reverses nothing, SCAN 64 holds; both
plain 0..127); every other control keeps its slot, name, default, count,
formatter, direction and behaviour. Package 22,100 bytes, SHA-256
`aedde8d9b2597d15d8e71f6e7a2a1fde0f16e74b850cba1927997e9ddbbb0ee2`; card
build `26916ee81eaaa92e647bc15a618131f45f0ec48eaac2c52b81f8610dfab30367`.

- **The page, byte for byte.** FRACT's FX2 descriptor in the card image
  (the clone at `0x400d6b20`, 0x192 bytes; per slot the name, default,
  count, the words at `0x6a`, `0xca` (formatter), `0xfa` (widget) and
  `0x12a`, and the enable bits) differs from 1fbfe97's in 10 bytes: slot
  2's name (`SCAN` -> `REV`, +0x22..+0x25) and default (64 -> 0, +0x60),
  slot 7's name (`REV` -> `SCAN`, +0x40..+0x43) and default (0 -> 64,
  +0x65). The runtime package's page recipe differs in the same four values
  (integers at 0x60 and 0x65, strings at 0x22 and 0x40); its menu recipe
  (SRNG's labels) is identical. The manifest's doc lines moved with their
  Params.
- **FUNC + turn stays with the slot.** The word at `0x12a`, a knob's edit
  handler, is the donor's per slot and did not move: `0x40032814` at slot
  2, `0x400328e4` at slot 7. By Modwerk's effects guide (measured there on
  the emulator, not here) FUNC + turn jumps between 0 and 127 on the first
  and steps through 0, 64 and 127 on the second: REV now jumps between
  never and always, and SCAN stops at 64, its hold.
- **The engine.** `og_render` reads SCAN at record byte 49 and REV at the
  high byte of record word 28; the engine's own control array (DENS SIZE
  POS SCAN SPRD PAN SHPE REV) did not change. The units rebuilt against
  1fbfe97's: `ogpitch`, `ogcontrol` and `oggrain` byte-identical;
  `ogsource` 2 bytes, the displacements of the two reads (`addal
  #0x8000012c` and `addal #0x80000141` trade places); `ogview` 11 bytes,
  `control_columns` words 6 to 8 (the third caption, `REV`, at x = 42, set
  in its cell as `POS` is in the first); `runtime.bin` 13 bytes, the same,
  every symbol at its address and size. The package against `3f87b727…`:
  25 bytes, the recipe's four values, the two displacements and the
  caption words.
- **What SCAN keeps.** Main slots are 16-bit words from record byte 24, the
  value in the high byte (18, 86, 64, 0, 0, 64 publish as `1200 5600 4000
  0000 0000 4000`), SETUP slots bytes from 48 (octemu, OS 1.40C). The low
  byte held a fraction only under an LFO (word 5 with LFO1 on it: 216, 199,
  217, 234); in every snapshot without one (knob, lock, scene, crossfader)
  it was 0. `og_render` reads a main slot's high byte alone, before as now,
  so SCAN keeps its 7 bits and loses no fraction, interpolation or slew it
  never had. A SETUP byte arrives as written, so a SCAN move lands on the
  next block. SCAN is a speed that the engine integrates into the start
  offset, and the offset enters only at a birth: a step in SCAN bends the
  offset's path without a jump and moves no sounding grain.
  `verify_source.c` alternates SCAN 0 and 127 at every 16-frame call: the
  offset moves by exactly each call's integrated rate (at most 64 frames),
  and every grain that goes on sounding keeps its start and moves 16 frames
  (185 observations).
- **What SCAN loses, and REV gains** (octemu with the FRACT 0.9.6 image on
  OS 1.40C, a main-page control beside every SETUP case; the Elektron manual
  for OS 1.40A, section 11.4: "Setup parameters cannot be parameter locked,
  assigned to scenes or affected by the LFOs", and 11.4.8: "LFOs can only
  modulate parameters found in the TRACK PARAMETER MAIN pages"). The LFO
  destination (Part `+0x2f2`, page × 6 + slot) stops at FX2 slot 5 (29):
  FX2 destinations 24-29 are the main six, and no SETUP slot is listed;
  LFO1 on 29 moved record word 34 through 33 values while bytes 48-53 stayed
  put. A trig held while a SETUP knob turns (FRACT 0.9.6's PAN, DELAY's DIR)
  stores no lock and changes no Part byte (all 6,322) and no record byte,
  while SPRD locked to 90 alternated 90 and 0 on its trigs. SCENE B held
  while a SETUP knob turns stores no scene lock (the crossfader at A and B
  left bytes 48-53 as they were), while SPCE's scene lock published 0, 63
  and 127 at A, the middle and B. So SCAN on SETUP B takes no LFO, lock or
  scene, and REV on the main page takes all three (LFO destination 26),
  each reaching the grains born after it (REV latches at birth).
- **Parity and host tests.** Each engine is called on its own layout of
  the same controls: 0.9.6 reads SCAN's word at record word 28 (and 0 at
  byte 49, as 0.9.x projects hold), the new engine SCAN at byte 49 and REV
  0 at word 28, whose low byte keeps SCAN's fraction (random in the 200
  walks): 449 scenarios, 242,439 calls, 0 mismatches. `verify_source.c`:
  SETUP B is SCAN on both lanes for every value, with a full fractional byte
  under REV's 0; slot 2's high byte is REV on both lanes for every value,
  its fraction never deciding; REV latches at birth from slot 2 (0 -> 127
  and back: the 8 grains born after the edit took the new direction, and
  those born before kept theirs to the end, 96 observations); the SCAN step
  above. `verify_view.c` and `verify_view_oracle.c`: the third caption reads
  REV against the reference font, the dials are still 0.9.6's.
  `verify_twin.c` and `verify_reverse.c` drive the engine's control array,
  which did not change, and pass unchanged.
- **Sabotages.** `og_render` still reading SCAN at word 28: parity fails in
  the first matrix scenario at state byte 96 (the scan offset), and
  `verify_source.c` fails; built into the card image, `make native-check`
  reports 44 errors (SCAN at none of the seven SETUP B values reaching the
  engine, the hold lost in 28 phases, the scan offset moving positions out
  of POS's and SPRD's windows). REV read at byte 49: parity
  fails at state byte 30 (the REV sequence), `verify_source.c` fails. REV
  read from word 28's low byte: parity fails in walk 1 (audio), and
  `verify_source.c`'s REV test fails. A SCAN default of 63 or a REV default
  of 1: `scripts/build.py` refuses the manifest.
- **Emulator.** `make native-check`: FRACT chosen over DELAY (main slot 2
  127, SETUP B and D 1) stores main 18, 86, 0, 0, 0, 64 and SETUP 0, 64, 0,
  127, 0, 0 in the Part and both records; SETUP B at 80, 96, 32, 0, 127, 63
  and 65 reaches the Part, byte 49 on both lanes and the engine, its clock
  moves (through all eight source regions at 96 and 32) and holds at 64,
  REV staying 0; the third dial at 127 reverses every new grain and at 0
  none, SCAN staying 64; the emulator's OCR reads REV on the stock main page
  and SCAN on FX2 SETUP. `make ui-probe-check`: the overview captions the
  third dial REV, not SCAN, and REV's dial follows the Part to 127.
  `make listen-kit` (one walk a build: B turns SCAN in FX2 SETUP, A's walk
  unchanged; B re-rendered against the kept 0.9.6 render): every setting
  landed at its slot, and all 8 takes with SPCE 0, among them SCAN 96 and
  32 played from SETUP B against 0.9.6's main slot 2, equal 0.9.6 within 1
  LSB but for its stock declick copies at the trigs (trig clicks A 129 /
  538, B 2 / 3 LSB, median / max).
- **CPU.** `make cost-check`: 52 profile and 8 detour checks, every row the
  same as 1fbfe97's run, line for line (the reads cost what they cost: two
  displacements traded).
- **Gates.** `make check` 250 PASS; `make runtime-package` 22,100 bytes,
  `aedde8d9…`, rebuilt identical; `make runtime-package-check` 24; `make
  native-check` and `make ui-probe-check` (probe image `1f5906b6…`) without
  errors; `make probe-check` 2 + 52; `make cost-check` 52 + 8.
- **Migration.** A project saved before holds SCAN's value in slot 2,
  which loads as REV (64, SCAN's default, reverses about half the grains),
  and 0 or an earlier REV value in SETUP B, which loads as SCAN (0 scans
  backwards at four times speed); locks, scenes and LFO routes on slot 2 now
  move REV. Set REV to 0 and SCAN to 64 once (since REVS: REVS 127). The
  user accepted this ("old projects do not matter").

## REVS reads as a direction (2026-10-21)

By the user's decision of 2026-10-21 the third dial, REV until then, is
named REVS and reads as a direction: 127 (fully right), the default
choosing FRACT now writes, plays every grain forwards, today's sound; 0
plays every grain backwards; between, a grain reverses with probability
(127 - REVS)/127, about half at 64. Old projects do not matter (the user's
ruling). Every other control keeps its slot, name, default, count,
formatter, direction and behaviour. Package 22,112 bytes, SHA-256
`86aaa8dbcd32739ca72252dbc81a51d639b3990a11fd6e1af848929aae0eb442`; card
build `4218bc3b285f12154029dfae70ff31fc91538cec1b10569f9a6bd426218cbeb1`.

- **One place.** `og_render`'s read (`source.c`) hands the engine 127 -
  REVS, the reverse probability in 127ths that the engine always took
  (`params[OG_REV]`; `grain.c` unchanged): at REVS 127 the engine draws
  nothing and no state changes, at 0 every draw reverses (`(x * 127) >> 16`
  is at most 126). A high byte above 127, which the stock never publishes,
  reads as 127 (forwards) rather than wrapping to a probability. Written as
  two statements: as one expression GCC kept REVS in a sixth saved
  register, four more bytes on the seam's deepest stack path (630 of 636).
  The build guard (`scripts/build.py`) refuses any slot 2 name but REVS and
  any default but 127.
- **The page, byte for byte.** FRACT's FX2 descriptor in the card image
  (the clone at `0x400d6b20`, 0x192 bytes; per slot the name, default,
  count, the words at `0x6a`, `0xca` (formatter), `0xfa` (widget) and
  `0x12a` (edit handler), and the enable bits) differs from 376a690's in 2
  bytes: slot 2's name (`REV` -> `REVS`, +0x25) and default (0 -> 127,
  +0x60). The runtime package's page recipe differs in the same two values
  (the integer at 0x60 and the string at 0x22); its menu recipe is
  identical, and so is every other recipe field.
- **The engine.** The units rebuilt against 376a690's: `ogpitch`,
  `ogcontrol` and `oggrain` byte-identical; `ogsource`: `og_render` gains
  five instructions (10 bytes; the byte stored into the control array now
  passes through `bpls`/`moveq`/`subl`), and nothing after it changes but
  its place; `ogview` 10 bytes, `control_columns` words 6 to 8 (the third
  caption, `REVS`, four letters at x = 40, where SCAN's sat). `runtime.bin`
  grows 12 bytes (18,534 -> 18,546); its disassembly with addresses
  normalised differs only in `og_render`'s read, a 2-byte alignment pad
  after `ogsource`, one absolute address into `ogview`'s data (moved 12
  bytes) and the caption words.
- **Parity and host tests.** Parity with 0.9.6 at SHPE 64, REVS 127 and
  DENS 127 (the engine's slot 2 word holds REVS 127 with SCAN's fraction in
  its low byte): 449 scenarios, 242,439 calls, 0 mismatches.
  `verify_source.c`: slot 2's high byte on both lanes for every value 0 to
  255, its fraction never deciding: 127 and above draw nothing and play
  forwards, 0 reverses the grain, each value between decides by (127 -
  REVS)/127 on the reader's own sequence; 2,048 births into one reader
  reverse 2,048, 1,500, 1,011, 520 and 0 at REVS 0, 32, 64, 96 and 127
  (expected 2,048, 1,532, 1,016, 500, 0); the latch (127 -> 0 and 0 -> 127
  with a fractional byte: the 8 grains born after the edit take the new
  direction, those born before keep theirs, 96 observations); every record
  that means forwards holds REVS 127. `verify_reverse.c` and
  `verify_twin.c` drive the engine's control array, whose meaning did not
  change; they keep their numbers and name the REVS value each probability
  stands for. `verify_view.c` and `verify_view_oracle.c`: the third caption
  reads REVS against the reference font.
- **Sabotages.** `og_render` reading REVS as the probability itself (the
  old direction): parity fails in the first matrix scenario at state byte
  4 (head 0's cursor: a reversed grain), and `verify_source.c` fails. The
  read without the clamp: `verify_source.c` fails at the first byte above
  127. Built into the card image, the old direction fails `make
  native-check` with 8 errors (the third dial at 0 and at 127 not
  deciding the direction, grains born at REVS 127 reading backwards, and
  POS's and SPRD's start checks, which a reversed grain's start misses). A
  REVS default of 126 or 0: `scripts/build.py` refuses the manifest; 126
  with the guard widened fails `make image-check`, `make
  runtime-package-check` and `make native-check` ("FRACT chosen over DELAY
  did not store FRACT's defaults").
- **Emulator.** `make native-check`: DELAY's third dial (default 127, REVS's
  own) turned to 40 on DELAY's page, then FRACT chosen over it stores main
  18, 86, 127, 0, 0, 64 and SETUP 0, 64, 0, 127, 0, 0 in the Part and both
  records; the third dial at 0 reverses every new grain (62 of 62), at 127
  none (0 of 64), and no young grain in any other phase, all at REVS 127,
  reads backwards (0 of 3,705); the emulator's OCR reads REVS on the stock
  main page (`REV5`: it shows S as 5). `make ui-probe-check` (probe image
  `b868cb53…`): the overview captions the third dial REVS, not SCAN, and
  REVS's dial follows the Part to 0, away from its default. `make
  listen-kit` (B re-rendered against the kept 0.9.6 render; B's REVS held
  at 127, its default, in the Part and both records at all 22 checks):
  every setting landed at its slot, and all 8 takes with SPCE 0 equal
  0.9.6 within 1 LSB but for its stock declick copies at the trigs (trig
  clicks A 129 / 538, B 2 / 3 LSB, median / max).
- **CPU.** `make cost-check`: 52 profile and 8 detour checks. Every row that
  calls `og_render` (30 of 57) costs 4 instructions, 8 bytes of pool code
  and 10 to 11 measured cycles more a call (the read; `og_render` 499 ->
  510 in the per-symbol attribution, every other symbol the same), and is
  otherwise the same as 376a690's run in every field (reads, writes, arena
  reads, record writes, stack: 540 bytes owner, 630 of 636 from the seam);
  the other 27 rows are identical, line for line. `owner-steady-16` 6,952
  (6,942), `owner-size-min-63` 23,714 (23,704). Every other row writes REVS
  127 into its record; the REV rows (`owner-rev-16`, `-wrap-16`,
  `-birth-16`, `-pcm24-63`), every grain reversed, now write REVS 0 and
  price the same draws: 6,969, 10,919, 5,506 and 15,586 (6,959, 10,909,
  5,496, 15,575 before), the same 10 or 11 cycles apart.
- **Gates.** `make check` 251 PASS (250 and the 2,048-birth row); `make
  runtime-package` 22,112 bytes, `86aaa8db…`, rebuilt identical after the
  sabotages and the docs; `make runtime-package-check` 24; `make
  native-check` (40 phases, 3,092 snapshots) and `make ui-probe-check`
  without errors; `make probe-check` 2 + 52; `make cost-check` 52 + 8.
- **Migration.** A project saved before holds REV's 0 or SCAN's value (64
  if never turned) in slot 2, which REVS now reads as every grain, or
  about half, reversed: set REVS to 127 once. The user accepted this ("old
  projects do not matter").

## Grain kernel (`kernel.s`)

`og_mix_span` and `og_mix_span_reverse` (`kernel.h`) are ColdFire assembly
on the unit and C (`pitch.c`) on the host: one head's span of up to 64
frames (one page or the join's staged pairs, one direction, all added or all
stored), split at the window's 1/128 segments in the kernel. Until the
small-size work below it was `og_mix_run`, one segment a call, split in C.
Evidence that the two agree, and what it costs (`docs/M0_MEASUREMENT.md`,
"The assembly kernel"):

- Host: `tests/verify_kernel.c` holds the C twin to a per-frame reference
  (`og_envelope_shape`, 0.9.6's PAN and decoders): 200,000 spans, 53,332 of
  them backwards, over 639,226 window segments, 16,886 half switches and
  15,385 peaks, every format and the join's int16 pairs, Hann and the 32
  SHPE rows, 1..64 frames, add and store, and no word past the span.
- QEMU (`make cost-check`): each `kernel-twin-*` row runs the assembly on
  1,001 seeded spans of its format (grains of 441..88,200 frames, so a span
  crosses up to dozens of segments; Hann or a SHPE row; phases anywhere,
  at the switch and just below it; every gain 0..256; add and store) and
  compares every accumulator word with the C twin, and d2-d7/a2-a6 after
  all of them (a6 is the driver's span pointer, which the kernel uses and
  restores). Sabotage: a falling segment one frame longer made all nine
  twin rows (349 to 384 of 1,001 spans each) and both `owner-size-min` rows
  differ. Earlier, against `og_mix_run`, one break per format family made
  its row fail and nothing else.
- Every owner row compares the ColdFire build's audio, state and owner with
  the host build; parity with 0.9.6 stays at 449 scenarios with 0
  mismatches.
- G3: `owner-pcm24-wrap-63` 19.5 measured points, `owner-size-min-63` 24.7
  (budget 30), arena reads not priced. On the unit (2026-10-20) PCM24 stereo
  at the track's maximum pitch read +9 to +16 points, with no exception, and
  minimum SIZE +22 (`docs/M0_MEASUREMENT.md`), before the work below.
- Coverage (`owner-holes-1`, QEMU against the host build, 0 mismatches):
  one call of one frame, a SIZE edit (86 to 120) that retimes all three live
  heads, and the unmapped-page branch both ways (head 0 stores silence into
  an unfilled frame, head 2 adds nothing to a filled one; one arena read for
  three heads). No other row reaches these paths: each of four
  ColdFire-only breaks (the unmapped store writing 0x10000, the unmapped
  skip adding 0x10000, `retime` lengthening a head by one frame,
  `og_engine` returning at count 1) made `owner-holes-1` differ and no
  other row.

## Shorter grains (2026-10-21)

On the unit minimum SIZE cost +15 points at track pitch 0 (all of G1's
owner budget) and +22 at its maximum. Two rows now price that block, with a
birth in it (three readers a third of a 441-frame grain apart, the oldest
retiring after 4 frames, PCM16 stereo as on the unit): `owner-size-min-16`
and `owner-size-min-63` (budgets 15 and 30 points, enforced).

Where the cost went (measured cycles by the code that ran; og_engine holds
the inlined birth, run splitting and `mix_head`):

| | `owner-steady-16` | `owner-size-min-16` | `owner-size-min-63` |
|---|---:|---:|---:|
| before: kernel runs | 3 | 17 | 58 |
| `og_engine` | 3,495 | 8,856 | 19,510 |
| `og_mix_run` | 2,093 | 3,187 | 11,940 |
| `og_locate` | 481 | 963 | 963 |
| total | 6,919 | 14,163 (14.8 points) | 33,570 (35.0) |
| after: kernel calls | 3 | 7 | 7 |
| `og_engine` | 3,123 | 5,418 | 6,521 |
| `og_mix_span` + segment code | 2,487 | 4,602 | 15,384 |
| `og_locate` | 481 | 642 | 642 |
| total | 6,942 (7.2) | 11,819 (12.3) | 23,704 (24.7) |

The birth itself was a small part. A 441-frame grain crosses a window
segment every 3.4 frames, and each segment was a run that C set up (a
division, two table reads, nine stores) and the kernel entered and left:
about 370 cycles a segment, 14 more segments in a 16-frame block and 55
more in a 63-frame call. A birth also splits the call into two spans, and
every reader located its page again in the second. Now:

- the kernel takes a span and splits it at the segments itself, in
  registers (`.Lspan_seg`: about 130 cycles a segment, two table reads
  each; the frame loops are byte for byte the same); C calls it once a page
  chunk and fill side;
- a reader that goes on past a birth keeps its page (`OgPlace`, cleared for
  the reader a birth takes), one `og_locate` a birth instead of three;
- SHPE's and REV's latch bytes and the two PAN gains are each one pool
  read a reader.

Bit-exact: parity with 0.9.6 449 scenarios, 0 mismatches; `verify_twin.c`
240 cases; every owner row equals the host build. Stack: the kernel saves
eleven registers and keeps the span's end (48 bytes), `og_engine` 384;
from the seam 630 of the 636-byte bound (`detour-wrap-sp2`), owner calls
540. A first version with the span's segment bounds read from a 40-byte
`OgSpan` and the place cache keyed by frame went to 656 from the seam and
was cut down (the peak's one-frame segment now found at `phase == half`;
the cache cleared at births instead of keyed).

## Longword alignment (2026-10-20)

ColdFire splits a longword access at an address 2 mod 4 into two; legal,
but a class the unit had not run on FRACT's own memory. GCC's m68k ABI
aligns int-sized objects to 2 bytes, while its ColdFire port assumes a
4-aligned stack pointer: `__attribute__((aligned(4)))` on a local compiles
to the same code, honoured only if the caller's stack is 4-aligned. At
d1d86be, with a 4-aligned seam:

- `og_engine`'s frame held 167 static longword operands at 2 mod 4 from its
  frame pointer, 193 misaligned stack accesses in `owner-steady-16` (0.9.6
  and the C engine of 27669d0, which ran on the unit, had none);
- the UI's pool words (`og_columns`, the `og_ui_*` counters, `og_ui_source`)
  sat at 2 mod 4: 8 to 144 misaligned pool accesses a tick or draw, uncached
  on the unit and unpriced;
- the kernel's `OgRun` and the join's int16 pairs, which `kernel.s` reads as
  longwords, were 4-aligned only if the stock's stack at the seam was (the
  seam function keeps its caller's alignment, but is reached through a
  function table).

Since then, by construction:

- `og_fetch` hands `og_render` a stack on 0 mod 4 (three instructions an
  owner call; `a6` keeps the frame);
- every unit is built with `-malign-int` (`scripts/build.py`): the same
  instructions in all five units, two bytes more data, and no shared
  struct changes layout (all are naturally aligned); `grain.h` refuses a
  ColdFire build without it;
- the pairs buffer is `aligned(4)`.

`make cost-check` gates it: no row reads or writes a longword at 2 mod 4 on
FRACT's stack, pool or output, including `detour-wrap-sp2` (`owner-wrap-16`
from the seam with the stock's stack 2 mod 4: 495 such accesses before the
fix, 0 after), and the detour matrix runs with the stock's stack 0 and
2 mod 4. Not gated: the stock's records and literals, the arena (PCM24
stereo's word-aligned longword is by design) and `og_fetch`'s saves in the
stock's frame. Cost: the join rows are unchanged (`owner-wrap-16` 8,961,
`owner-pcm24-wrap-63` 17,692 measured); every owner call pays the realign
(`detour-owner` 6,434 to 6,442, 0.01 point); stack +2 bytes when the
stock's stack is 2 mod 4 (`detour-wrap-sp2` 570, bound 636).

## Next required evidence

Use the current SDK's module contract and package tools in a clean isolated
checkout. Add a public source pin only when the repository URL and commit are
real. Resolve or explicitly owner-review the hybrid runtime adapter before
offering a USB module set. Bind every report to the exact module version,
source revision and image hash, then run the MKII protocol on the exact build.
