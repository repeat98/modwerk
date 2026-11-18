# TapeHead exact logical memory inventory

Version 0.1.2-experimental, test-image hash 774aa99723625fb698e5f0bb6fc32ea3196996931f55beb10ce1ec53eccc328b (BUILD=7).
0.1.1 placed 416 words and totalled 2,972 shared / 4,460 bytes; the X, descriptor and formatter figures are unchanged.

Native `build_bus.py` allocation map: payload A P:0x1252..0x13f8;
payload B P:0x1012..0x11b8 (exclusive ends), 422 logical 24-bit words each.
Total P storage: 844 words, **2,532 bytes**. Instructions/constants are packed
into 3-byte words in firmware records; their positions can change in another
composition, and the native/browser placement check enforces both bounds.
Record headers and packing/container bytes belong to common firmware packaging.

Each instance uses **31 X words / 93 logical bytes**: r7+$00..$12 (19),
$20..$25 (6), $30..$35 (6). The 54-word bounding span includes 23 untouched
holes. The disassembled instructions address only those subsets: four
persistent state words, four coefficients, eleven polynomial staging words,
twelve channel scratch words. Init zeros the four persistent words. Every
precompute/scratch read is preceded by its same-call write. Bounds do not
depend on modulation, COLOR, signal or lifetime.

Existing dispatcher reservation: one 256-word X block per FX slot; TapeHead
uses a subset, adding no reservation. FX1 r7 bases per core: 0x6100, 0x6400,
0x6700, 0x6a00; FX2: 0x6200, 0x6500, 0x6800, 0x6b00. The same addresses are
private to the other core. At sixteen inserts, touched X storage is 496 words
(1,488 bytes); the pre-existing reservations total 4,096 words (12,288 bytes).
Slots do not overlap and no module operand reaches another slot's block.

ColdFire flash: one 402-byte cloned descriptor in a **416-byte stride**
(14 bytes padding), plus the verified **60-byte COLOR formatter**, shared by
all instances. Clone address is selected by the standard native menu builder;
it is not a new fixed runtime RAM allocation. Thus shared module storage is
2,532 + 416 + 60 = **3,008 bytes**, per-instance touched storage 93 bytes,
and maximum logical module total **4,496 bytes** at sixteen inserts.

No new Y allocation, buffer, sample table, heap, SDRAM or CPU RAM; no runtime
allocation or recursion. DSP hardware call stack depth is bounded at three
levels (dispatcher, proc, channel/helper); the DO loop uses the processor's
existing loop stack. The control precompute's poly6 and per-sample channel
calls do not nest. No software stack storage is allocated by the module.

Common scaffolding is reused: descriptor pointer/cursor entries for id 31 in
the existing FX1/FX2 tables; chooser rows add 4 bytes per listed slot with
the off/terminator words shared. Alignment is computed by the common menu
builder; its cave/overflow guards enforce the complete selection's placement.
Costs depend on the selection, so do not charge an entire shared chooser or
dispatcher again to this one module. No stock buffer is attributed to it.

Source-bounds review and modulated/split render are the guard evidence.
No hardware RAM dump, canary/stack measurement or maximum-load memory test
was supplied; this is explicitly outside the functional hardware report.
The native and browser complete-image parity/rejection checks cover compiled
program/menu placement; they do not constitute a physical-memory stress test.
