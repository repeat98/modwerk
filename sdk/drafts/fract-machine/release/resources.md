# FRACT candidate resource accounting — 6 November 2026

Candidate `0.1.1-experimental`, package SHA-256
`54ca8f6b1a30e2f4811129e082ce18881148654b00c97c026508460a6cf7272e`.
These measurements reproduce the hardware-tested package. They do not change
its engine, UI, base or stored project. Timing qualification remains open.

## Reproduce without firmware

From the repository root, with Python 3.12 and m68k-elf GCC 16.2.0/binutils 2.47:

```sh
python3.12 -B sdk/drafts/fract-machine/qualification/resources.py \
  --output sdk/drafts/fract-machine/release/resource-audit.json
```

The script recompiles the recipe with `-fstack-usage`, asserts the exact authored
image hash, rebuilds and verifies the exact package hash, and compiles target
`sizeof` expressions for the base's loader. Its reviewed loader sources match
the local native proof for base `9b3ba417`. The script rejects a changed loader,
authored image, unknown call target or indirect call site, unbounded compiler
frame, or recursive own-call graph. The JSON contains compiler, native-input and
loader-input identities. No firmware, stock disassembly or device is consumed.

## Resident memory

The previous 31,236-byte figure counted only image plus BSS. The loader's actual
pool allocation also includes its per-module header and alignment:

| Region | Offset in allocated extent | Bytes |
| --- | ---: | ---: |
| Runtime header | 0 | 536 |
| Header alignment | 536 | 8 |
| Code, tables and initialized state | 544 | 30,596 |
| Zero-initialized state | 31,140 | 640 |
| End alignment | 31,780 | 12 |
| **Resident pool extent** | **0** | **31,792** |

This candidate has zero patched sites and no DSP tail. There are zero added
DSP code/state words and no new sample-arena allocation. FRACT reads existing
stock-managed FLEX sample pages; its three heads and UI state are already in
the image/BSS above. Temporary PCM/join buffers are in the stack below.
One 88-byte owner-ledger entry is consumed from the base's preallocated ledger;
it is not a second dynamic allocation. The encoded package is 32,120 bytes in
the loader's existing upload buffer, not another permanent module allocation.

Retaining old and new copies for replacement/Undo needs their combined extents:
63,584 bytes for candidate-to-candidate replacement. The previously tested
private-to-candidate migration used a 31,552-byte old extent, hence 63,344 bytes.
These are FRACT's pool contributions; other modules, allocator fragmentation,
the base, upload buffer and the instrument's existing sample memory are not
available headroom and are not charged a second time to FRACT.

## Own callback stack

GCC's largest individual C frame is 380 bytes. A conservative call-graph bound
for one render callback is **712 bytes**, including outgoing arguments,
4-byte call return PCs and the assembly join leaf's 56 bytes:

`entry PC 4 + render 184 + PC 4 + chunk 76 + PC 4 + engine 380 + PC 4 + join 56`.

All retained own C functions and every register-indirect call are covered by
the candidate-specific graph policy. Assembly mix leaves reserve 48 bytes;
join leaves reserve 56 bytes and make no calls. Their indirect jumps are local
loop continuations. Tail calls conservatively retain the caller's full maximum
frame in the calculation. No simultaneous-path optimization is assumed.

| Entry | Conservative own bytes, including entry PC |
| --- | ---: |
| Audio render | 712 |
| START | 96 |
| UI tick | 164 |
| UI draw | 208 |
| Machine control tick | 72 |
| Pool open | 48 |
| Pool assign | 92 |

The JSON lists every retained function's bound and external call boundary.
These are per-activation own-frame bounds, not a whole-system stack reserve:
stock/base call frames, task stacks, interrupt prologues, callbacks re-entered
through the instrument and interrupted contexts are excluded. No claim to bound
the firmware's stack is necessary or made. Those exclusions follow the module
guide's own-code scope.

## Processing evidence still required

Worst-case ColdFire time/cycles and a matched stock comparison are **not
measured**. The functional hardware check and SELF TEST do not measure them;
the latter exercised no DSP-effect modules and reported zero timing peaks.
Existing optional CPU telemetry accumulates window sums and does not record a
worst render. Old private CPU percentages and historical timing-model constants
are not evidence for this candidate. No `performance.json` pass or waiver is
manufactured from compiler frames, instruction counts or average CPU.

The production base exposes cached CPU/DSP load through the normal LOAD API,
but those window readings do not isolate FRACT or measure its worst render.
It compiles out `MODWERK_DEV`, including the development frame-duration meter
and report/MEM APIs used by the documented measurement scripts. Enabling those
requires a separately identified diagnostic build. No diagnostic package or base
was installed during this accounting run. The later project-RELOAD incident and
owner-operated recovery are separately recorded in TESTING.md.

The remaining measurement must record the dearest render, native-pitch packet
splits, all four source PCM formats, smallest/largest SIZE, forward/reverse and
mixed REVS, SHPE/SPRD/PAN extremes, moving controls and retriggers, with one
owner and three grain heads. Compare a matched stock FLEX workload and record
longest frame/idle readings, timing provenance and any late/dropped frames.
Keep the proven package available and restore its exact inventory after any
diagnostic trial; a diagnostic build is not the public package's functional
qualification.

The owner's concrete reporting question is which performance record to use for
an audio-rate ColdFire machine with no added DSP or MIDI-note path: ColdFire
per-render timing plus matched FLEX/frame stress fits its execution path, while
the existing ColdFire template requires MIDI flood fields and the DSP template
requires DSP instructions. The key-only exemption explicitly excludes machines.
This is a report-format/method question, not a request to waive missing timing.

## Relative display gauges

These are source estimates, not processor percentages or qualification results.
For one owner with three grains and moving controls: CPU **high** relative to a
key-only feature, because three overlapping stereo readers interpolate/window
samples on the ColdFire audio path, with native pitch and packet splits; DSP
**minimal**, because no DSP code/state is added; memory **low**, because resident
code/tables/state are 31,792 bytes with at most 712 own stack bytes per callback
and no independent sample buffer. Replacement temporarily retains two extents.
The estimates do not assert remaining headroom or qualify companion workloads.
