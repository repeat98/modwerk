# FRACT 0.10.0-experimental: worst-case cycles

Output-envelope implementation on parent `8ffef0f`, measured 2026-10-25.
Runtime package `fract-0.10.0-dev.mwrm`, 22,148 bytes, SHA-256
`fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`;
card image `out/grnyv1.os`, SHA-256
`3ae08fe552c97d2a8597f9f6010267c5aa85ef22259d1e7f0ce4126271579370`.
Engine source SHA-256
`18e4476e7c38d4722700d87344a0e34fff036dd7f1d75c80cb3b63780f5e715e`.
ColdFire code and data are unchanged from installed variant A `62672f6f`;
`make cost-check` freshly passes 52 profile and 8 detour checks.

Environment: macOS arm64, native SDK Modwerk `f692fd6`, `dsp_host` SHA-256
`2be214bebc843c2373d24999babc0b0b5ae9b70154ed47d069a15b51026d327b`,
QEMU cfv4e from `~/octemu/vendor/qemu`. These figures are software instruction
counts or a fitted ColdFire cost model, not chip wall-clock measurements.
The granulator runs on the ColdFire from the base's uncached pool in its
owner's Flex fetch. SPACE runs on the DSP in every FX2 instance.

## DSP: SPACE

Basis: 44.1 kHz, 16-frame blocks, at most two calls per block (a trig split).
The SDK's usable module allowance is 3,120 cycles/sample/core, 49,920/block;
the stock dispatcher's share is outside it.

### Static word-span model

Reproduce with `python3.12 -B scripts/space_static_cost.py` from this checkout.
The pinned SDK's raw `cycle_count.py --verify` refuses forward BRA syntax;
that unmodified command is **not** reported as passing. The adapter extends
only its branch-parser regex in memory to accept BRA under the same forward
target/direction checks. It preserves BSR accounting and verifies that the
marked and original programs assemble to identical bytes. No SDK or DSP file
is edited. Machine-readable result: [space-static-cost.json](space-static-cost.json).

The 593-word program has a 458-word sample-loop span. Both calls to the
straight-line `hy_output` add 23 callee words and 4 call/return cycles each:
458 + 2 x (23 + 4) = **512 conservative cycles/sample**. Every forward
alternative is charged once. This is the SDK's encoded-word model without
memory-contention stalls; it is not measured silicon timing.

PROC overhead is 82 words before the loop and 12 after it, excluding INIT
and the callee body already charged at each BSR. A call of n frames is bounded
by 94 + 512n. Therefore:

    2 x 94 + 16 x 512 = 8,380 cycles/block, one instance
    4 x 8,380 = 33,520 cycles/block/core, of 49,920

The bounded 1,984-frame ring clear is cheaper than that loop. SPCE 0, once
exact dry, returns after one compare. Two sequential `hy_output` calls do
not nest. Controlled DSP stack depth is four entries/core: one dispatcher
call, two for the sample DO and one callee call. See [memory.md](memory.md).

### Measured executed instructions

`make perf-record` runs `scripts/perf_record.py bench`, using the SDK stock
benchmark protocol: one instance/core at positions 0 and 4, audio at X:0,
4,096 blocks of 16 frames, null-stub peak subtracted. Full table:
[bench.json](bench.json).

| Effect | Worst unsplit | Worst with a trig split | SDK stock unsplit |
|---|---:|---:|---:|
| FRACT (SPACE) | 405.06 | **407.38** (SPCE 127, split 1) | |
| SPRING REV | 257.50 | 314.19 | 257.50 |
| PLATE REV | 183.94 | 218.25 | 183.94 |
| DARK REV | 193.25 | 242.38 | 193.25 |
| DJ EQ | 293.38 | 330.94 | 293.38 |

Stock unsplit rows reproduce `benchmark_stock_dsp.py` to the table's rounding.
Stock MAIN SHA-256 is
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
FRACT covers defaults, moving controls (ramps, jumps and reopens), every split
position 1..15, and held SPCE 1/32/64/96/127 with each split. The moving case
is 404.25 unsplit / 406.56 split; held 1..96 is 381.06 unsplit; held 127
is 405.06. Exact dry is -3.25 relative to the null stub.

The worst raw block is 6,585 instructions (411.5625/sample), below the
8,380 static model. `make check` also reports 409.2 unsplit / 411.6 split
without null subtraction. The package declares **412 executed**; the base's
7/4 admission charge is 721 of 726, within the 414 executed limit. Installed
variant A was 398.19 / 400.56 with null subtraction and declared 405.

### Stress and performance audit

See the fresh [stress.json](stress.json) and [performance.json](performance.json)
records; the release table in `../TESTING.md` binds the completed run and audit.
The run exits 0 with no hangs, no FRACT stray writes and no instance clobbers;
per-core peaks are **2,789.6 / 2,767.8 executed instructions/sample**,
140.6 seconds of host time. The load is eight FRACT FX2 instances (four/core), CHORUS on every FX1, three
synthetic LFOs/track and 18 changed named slots/step at 120 BPM, splits on six
tracks, eight stems, four seconds plus a two-second tail. It uses
`dsp_host -guard 15779 -guard-shared -dirty 0x5a`.

This drives DSP controls directly. Only SPCE affects FRACT's DSP; POS/SIZE
belong to the ColdFire granulator, which this stress runner does not execute.
Firmware LFO/lock delivery and Part switching are outside the run. CHORUS's
stray regions under FRACT's smaller buffer guard are recorded separately;
the guard does not describe CHORUS's allocation.

Four FRACT loops take 2,048 of 3,120 static cycles/sample/core, leaving 1,072
for FX1 and other modules, before the separately charged per-call overhead.
FRACT costs 1.87x PLATE REV, 1.30x SPRING REV and 1.23x DJ EQ in the same
split protocol. It is dearer than every stock effect and needs owner review.
Real-chip contention and deadline margin remain unmeasured.

## ColdFire: the granulator

Basis: one call of the Flex fetch per track per 16-frame block, or two
(8 + 8) when the stock splits it; at the track's maximum pitch a call reads
up to 63 source frames. Unit: "measured cycles", the cost metric measured
on the user's MKII in M0 (`docs/M0_MEASUREMENT.md`):

    measured = 0.29 x pool code bytes + 1.99 x instructions + 16.8 x pool reads + 9.4 x pool writes

One point of the base's CPU meter is 958 measured cycles a block (95,800 a
block is 100 %). Budgets (the design spec's, in points): the owner's audio
15 points at track pitch 0 (14,370) and 30 at the track's maximum pitch
(28,740); a track FRACT does not own 3 points; the overview 2 points
(88,000 cycles a UI tick at 60 ticks a second). The user's full project
idles at 58-66 points (M0), leaving about 34; the light project of the
2026-10-20 session idles at 48-49 stopped and 56 with T1 playing.

`make cost-check` (`tests/verify_profile.py`, `tests/verify_detour.py`):
every unit runs on QEMU against the host build of the same source, 0
mismatches in audio, state and owner on every row; 52 profile and 8 detour
checks pass. Selected rows (measured cycles a call, points):

| Row | What it is | Measured | Points |
|---|---|---:|---:|
| `owner-steady-16` | SIZE 86, track pitch 0, PCM16 stereo | 6,952 | 7.3 |
| `owner-steady-8x2` | the same block as two 8-frame calls | 11,678 | 12.2 |
| `owner-pan127-16` | PAN 127 | 7,445 | 7.8 |
| `owner-shape-drop-16` | SIZE drops under shaped live grains | 8,419 | 8.8 |
| `owner-rev-wrap-16` | every grain reversed, across the source's end | 10,919 | 11.4 |
| `owner-dens-0-16` | DENS 0 | 3,741 | 3.9 |
| `owner-pcm24-wrap-63` | PCM24 stereo, maximum pitch, across the end | 18,666 | 19.5 |
| `owner-size-min-16` | SIZE 0 with a birth, pitch 0 | 11,830 | 12.3 |
| **`owner-size-min-63`** | **SIZE 0 with a birth, maximum pitch** | **23,714** | **24.8** |
| `detour-non-owner` | a track without FRACT | 54 | 0.1 |
| `detour-non-owner-fract` | a second FRACT, bypassed | 286 | 0.3 |
| `stopped` | FRACT on a stopped track | 92 | 0.1 |
| `ui-tick-scan-mono24` + `ui-draw` | the worst UI tick with its draw | 82,810 | 1.9 |

Maximum configuration: one granulator for all tracks. The owner's worst
call plus seven tracks with FRACT bypassed, each at most two calls a block:
23,714 + 7 x 2 x 286 = 27,718, within the 28,740 the design reserves at the
maximum pitch. The overview runs in the UI task, not in the audio block.

Stack: the deepest call uses 630 bytes of the interrupted task's stack from
the fetch hook (`detour-wrap-sp2`, the stock's stack 2 mod 4), against the
636-byte bound every row is held to; owner calls 540, UI 120-192.

Limits of these figures: QEMU executes the code but does not time it; the
metric is linear in counted events and was fitted on the unit (M0), and it
does not price sample-arena reads (counted on every row). On the unit an
earlier build (`72b10956…`, 2026-10-20, before this build's span kernel)
read +5 to +12 points at track pitch 0 against 7-12
predicted, +9 to +16 at the maximum pitch with PCM24 stereo against 16-26,
and +15 and +22 at minimum SIZE, which no row then priced. The output-envelope build's
unit reading is **PENDING: unit check of fef9db2b on 2026-10-25** (the
kit's `UNIT_CHECK.md`, step 7: expected about +12 and +15 at minimum SIZE if
the unit scales as before).
