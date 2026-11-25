# TapeHead code-cycle accounting

Version 0.1.2-experimental (the input-level update of 0.1.1). Composed MAIN
OS SHA-256 (BUILD=7): `774aa99723625fb698e5f0bb6fc32ea3196996931f55beb10ce1ec53eccc328b`.
0.1.1 (`bb700652…`) counted 288 cycles/sample and priced 6,000 / 48,000.

44,100 Hz, 16-sample blocks. `cycle_count.py --verify --json` proves its
instrumentation does not change code and gives **295 code cycles/sample** (`tapehead_l` and `tapehead_r` 137 words per call).
Its straight-line callee expansion includes both stereo call/return pairs.
There are no data-dependent skips, nested loops or allocation paths in the
sample loop. COLOR affects only the forward branches in block precompute.

For a conservative worst-case block model, charge 16 × 295 = 4,720 for audio,
plus three entire 422-word program spans (1,266): one initialization and two
processing precomputes for a trigger split. Each span overprices its actual
path: the otherwise-unused L/R routines account for substantially more words
than the repeated poly6 helper and forward-branch penalties. Add another 144
code cycles for DO setup, branches and block call/return overhead. This gives
**6,130 code cycles/instance/block**. Initialization cannot also run repeatedly
within one dispatcher block; repeated reselection is charged every block.
Any split position has the same total 16 samples and at most two precomputes.
The full reference matrix covers DRIVE/TRIM endpoints/defaults and all COLORs.
NONE bypass removes work; Part and COLOR changes cannot introduce another
sample path. Standard parameter mechanisms converge on the same r6 words.

Maximum placement is eight inserts per core (FX1 and FX2 on four tracks),
sixteen across both cores: **49,040 code cycles/core/block**. Core theoretical
budget is 4,535 × 16 = 72,560; the SDK's hardware-derived usable-work figure
is 3,120 × 16 = **49,920**, reserving 22,640 for stock processing, dispatcher,
transport/streaming and scheduling. Remaining model headroom is 880 cycles. (The level fix before its cycle
payback counted 301 and would have priced 49,952, over the budget.)
These budget constants come from `tools/build/cycle_count.py`; they are not
new TapeHead chip measurements. Other selected effects have their own costs.

This bounds module instruction-cycle work, **not chip wall-clock time**.
Unmeasured memory contention/DMA stalls can consume the remaining headroom;
the arbitrary maximum sixteen-insert configuration was not hardware-tested.
Do not interpret the static budget as an assurance of that hardware workload.
The owner accepted the attributed functional report rather than requiring a
maximum-load hardware stress run. Keep that limitation visible.

Isolated command: `REMIX=tapehead-spring BUILD=7 XBUS=1 SPEC=1 python3 -B
tools/build/cycle_count.py --verify --json`. The source-only patched DSP56300
toolchain is pinned to 8ccdd843adda9c18fc232a2ca50d6caccbf3cb1e.
Docker image: `sha256:3a5861370c0f3d4eb2507af6a20821ab6ad20569c9fb22f4dfce9d93d4fd93e2`.
Network disabled, read-only toolchain/root, private writable output; no firmware
or extracted code is retained here.
