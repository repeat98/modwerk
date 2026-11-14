# Mini Verb 0.2.0-experimental testing

This is the published experimental update. The owner accepted the sound and
stability in Octemu and explicitly waived physical hardware evidence for this
exact source/version on 8 October 2026. This is a new approval, not an extension
of the earlier frozen baseline. Hardware remains untested.

## Native DSP regression

The verifier uses the existing `build_bus.assemble` assembler/disassembler
round-trip audit, stock-payload frame context and `benchmark_reverbs` DSP host.
It injects each independently assembled module at P:0x2000 into temporary
private payload dumps for a controlled DSP comparison. This does not prove
placement in a complete release image. No firmware or memory dumps are committed.

Reproduce with a disposable native SDK copy and the private MAIN OS extraction:

```sh
DSP_HOST=/absolute/path/to/current-checkout/dsp_host \
python3 -B sdk/octabam/modules/miniverb/verify.py \
  --sdk /absolute/path/to/disposable/octabam \
  --stock /absolute/path/to/private/section_3_MAIN_OS.bin \
  --output /absolute/path/to/private/miniverb-tone-results
```

Build `dsp_host` from this checkout's `tools/harness/dsp_host/dsp_host.cpp` against
the patched toolchain, not a stale shared host. Both emulated cores need more
than Docker's default 64 MiB shared-memory allocation; the local offline run
uses `--shm-size 512m`. Raw commands, parameters, meters, logs and WAVs remain
in the private output directory. The committed report contains only source
hashes, measurements and verdicts.

## Results — 8 October 2026

All **46 native DSP checks passed**. Current source hashes and exact verdicts
are recorded in [evidence/dsp-regression.json](dsp-regression.json). The baseline is the unchanged published source at main commit
`2899ff214b51004ecb70b10dba519556740a0f65`.

Verified: 532 assembled program words; a static 411-word/cycle sample-loop
bound (baseline 457 program words / 360 static cycles), with marker insertion
proven byte-identical. The bound excludes chip contention and does not sum
ColdFire work, dispatcher or voice engines. The DSP host executes the actual
assembled code at 44.1 kHz, 16-sample blocks.

| Measurement | Actual result |
| --- | --- |
| Eight moving instances, mixed splits, four per core | 23,360 instructions/core/block; baseline 20,296; +15.10% |
| Eight neutral instances | 21,092 instructions/core/block; baseline fixed peak 20,132; +4.77% |
| Dark endpoint, 70 Hz / 4 kHz relative to neutral | -0.10 dB / -18.85 dB |
| Bright endpoint, 70 Hz / 4 kHz relative to neutral | -16.60 dB / -0.34 dB |
| TONE 64 with moving original controls, splits 0/1/7/15 | Bit-identical to the accepted previous voice |
| MIX 0 at TONE 0/64/127 | Bit-exact bipolar dry passthrough |
| Eight instances vs isolated renders, both cores and interleaved scheduling | Bit-identical; no cross-instance influence |
| One excited instance, repeated at all eight positions | Other seven outputs exactly silent |
| Dirty scalar and delay state, active private/shared Y and loaded P guards | Passed short regression runs |
| 30-second moving eight-instance guarded render | 82,688 blocks, 23,360 instructions/core/block peak; zero clipping, stray writes or clobber |

Private common-builder composition succeeded with only Mini Verb and the two
existing stock DSP loader modules. MAIN OS SHA-256:
`fd42fa81ee3cf23a47381a96d2e70be3efbaab250f5c3aedb5a1e11cd4a2529e`.
[evidence/private-composition.json](private-composition.json) binds the
runtime sources, image and isolated toolchain; the firmware remains private.
This proves composition of that selection, not exhaustive native/browser parity.

The real six-control LCD was captured on this image through the maintained
capture script, viewed and matched to the declaration. See
[media/capture.json](https://github.com/repeat98/modwerk/blob/c9cae4ae0013b9fbce5a262c0865e4a0b29c3041/sdk/octabam/modules/miniverb/media/capture.json) for the exact panel sequence and hashes.
No fresh hardware test is implied.

Tone endpoints and percussion tails are stereo, unclipped and decaying. Both
full-range jumps follow the per-sample smoother, and the actual state settles
back to exactly zero at Tone 64. The long render is DSP-only; it does not run
eight actual voice engines, project LFOs or saved locks.

Repository validation uses Node 24.21.0 and `npm ci`, followed by
`npm run check -- --base origin/main` and `npm run module:doctor -- miniverb`.

The current-source native/browser comparison covers 110 selections: 52 builds
(16 identical and 36 matching module-owned writes with platform writes masked),
58 matching refusals and zero mismatches. A changed original is refused.
See `sdk/native-comparisons/miniverb.json`. Source-only packages reproduce the
release source; firmware and raw native artifacts remain private.

Aliasing audit: not tested. Native endpoint and musical renders check unclipped
output and spectral attenuation. The owner subsequently accepted the sound and
stability in Octemu: “ok it works well and is stable, release it. I explicitely
allow no hardware evidence in this case”. No duration, instance count or physical
hardware result was reported.
Idle behavior is covered by eight silent instances after dirty initialization.

## Remaining coverage limits

- Worst-case chip cycles including memory contention, ColdFire publication and complete load.
- A 30-second full project stress workload with eight tracks, three LFOs per track and parameter locks.
- Full first-time-use walkthrough beyond the captured selection and six-control main page.
- Actual parameter locks, LFOs, scenes and crossfader on both sides of Tone neutral.
- Multiple distinct instances on both DSP cores, including editing/resetting/replacing one in isolation.
- Part save/reload, project save/load/reload and a physical reboot with usable audio restored.
- Original-project migration of old Mix values, locks, scenes and LFO destinations.

Hardware status: **not tested**. No unit was flashed or rebooted. An emulator
DSP render cannot establish physical reboot persistence or whole-instrument
headroom. The explicit owner hardware waiver applies only to this exact version/source;
no old version's waiver or qualification is extended.

## Conservative software cycle bound and exact reservations

The assembler/disassembler-audited program occupies 532 DSP words. The
branch-inclusive sample-loop bound is 411 modeled cycles/sample. At most two
process calls split one 16-sample block: 6,576 loop cycles, plus at most twice
the entire 121-word outside-loop code, twice 128 clearing stores and 32 init
stores. Even charging another 256 cycles for loop setup, branches and returns
is 7,362 modeled cycles. We round upward to **8,192 cycles/instance/block**.
This is a conditional static instruction model, without chip wall-clock or
measured memory-contention timing. The neutral bypass is cheaper. All branches
are charged together even when mutually exclusive; initialization and both
clearing calls are charged alongside active audio, although clearing returns
early. There is no new ColdFire callback, table or linked runtime.

The supported maximum is eight FX2 instances, four per core. Against octabam's
200 MIPS / 44.1 kHz budget (4,535 cycles/sample), reserve the existing
STOCK_SHARE = 1,415 cycles/sample for stock voice/dispatcher/transport work.
At 16 samples/block: 32,768 module cycles + 22,640 stock reserve = **55,408
cycles/core/block**, below the 72,560 arithmetic budget by 17,152. This does
not qualify arbitrary companion FX, USB load, streaming stalls or silicon
contention; native composition accepts only selections within its own ledger.

Exact logical reservations, with three bytes per 24-bit DSP word:

| Region | Scope | Words | Bytes |
| --- | --- | ---: | ---: |
| Full inherited X instance block, including 32 scalar words | per instance | 256 | 768 |
| Full allocator-owned Y ring | per instance | 16,384 | 49,152 |
| Program in both core payloads | shared | 1,064 | 3,192 |
| Full DSP hardware system stack capacity on both cores | shared | 64 × 48-bit entries | 384 |

Per-instance reservation is 49,920 bytes; shared is 3,576; eight instances
total **402,936 logical bytes**. X r7+0x20..0x3f is fully cleared; new Tone
words 0x2e/0x2f/0x3c/0x3d consume unused positions within it. Each inherited
instance spans r7..r7+0xff; the stock dispatcher strides 0x300 per track.
Y allocations are assigned per track by the existing allocator, use 0x3fff
modulo alignment and fit the declared 16K region. Occupied ring positions
0..13,749 and the 128-word progressive clearing stride remain unchanged.
The program has no recursive call, software heap, new CPU RAM/SDRAM, runtime
table, variable-sized allocation or additional padding. Hardware stack
capacity is conservatively charged in full; host int32 backing is an emulator
representation, not DSP logical allocation. Guarded dirty-state tests cover
private/shared Y and loaded P; physical hardware canaries remain unmeasured.
