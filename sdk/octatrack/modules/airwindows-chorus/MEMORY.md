# Air Chorus memory inventory — 0.1.2-experimental

Exact module reservations, maximum eight FX2 instances across both cores.
Logical DSP words are 24 bits; this inventory counts hardware-visible words
and packed firmware data, not the emulator's 32-bit host MemoryBuffer storage.
The native allocator reserves these DSP buffers/state independently of which
FX occupies the slot. Air Chorus reuses them and creates no sample heap.

| Region | Scope | Words × bits | Bytes |
| --- | --- | ---: | ---: |
| Entire reserved X state slot (132 used by Chorus, 124 stock words untouched) | per instance | 256 × 24 | 768 |
| Reserved FX2 Y slot (16,312 used) | per instance | 16,384 × 24 | 49,152 |
| DSP P program, both cores | shared | 1,078 × 24 | 3,234 |
| Lossless quarter-sine second differences, both cores | shared | 512 × 24 | 1,536 |
| Packed module P words in MAIN firmware, both cores | shared | 4,770 × 8 | 4,770 |
| ColdFire descriptor contents | shared | 402 × 8 | 402 |
| Descriptor stride padding | shared | 14 × 8 | 14 |
| Full common long-chooser reservation (shared with companions) | shared | 128 × 8 | 128 |
| Both complete DSP hardware stacks, 16 × 48-bit entries each | shared | 64 × 24 | 192 |

Per instance: **49,920 bytes**. Charged shared reservations: **10,276 bytes**.
Eight-instance maximum: **409,636 bytes**. These are reservations/occupied
word data across different memory spaces, not additional sample RAM or a
single contiguous allocation. Flash P words are stored then uploaded into
DSP P; both lifetimes/allocations are counted. The stack/chooser charge is
the entire shared reservation, not an extra stack per instance or another
128-byte allocation for each module. The single-effect compact chooser uses
12 bytes (NONE, Air Chorus, terminator) in its 32-byte short-list window;
20 bytes are unused there. Mixed builds may use the long 128-byte window.
Existing record headers and firmware containers belong to the stock/common
packager, not another runtime allocation by Air Chorus.

Native compact placement: core A table P:0x1000..0x10ff, program
P:0x1100..0x131a; core B table P:0x0dc0..0x0ebf, program P:0x0ec0..0x10da.
1,929 harvested donor P words remain per core. Shared-builder relocation
and refusal proofs are recorded separately; the shared loader/logger arena
is charged by its existing composition planner, not recreated by this module.

X state spans X:0x6200..0x62ff, 0x6500..0x65ff, 0x6800..0x68ff,
0x6b00..0x6bff on each core. Control state uses offsets 0x00..0x3b; ring shadow uses 0x3c..0x83.
Offsets 0x84..0xff belong to stock and are never written by Chorus.
Both cores use Y:0x4000..0x7fff and Y:0x8000..0xbfff for their first
two FX2 instances. Core A's external/shared pair is Y:0x30000..0x33fff
and Y:0x34000..0x37fff; core B's pair is Y:0x38000..0x3bfff and
Y:0x3c000..0x3ffff. Core B does not take core A's half of the shared window.
Rings use the modulo AGU; every tap wraps to 0..8191. The first 72
virtual words use the per-instance X shadow; its valid-history guard prevents
unwritten/dirty shadow data from being read. This avoids the stock T3 mailbox
at 0x38000..0x3800f and T7 parameter staging at 0x30000..0x30047, where
P/X/Y alias. No Air Chorus write touches those reserved Y prefixes.
During startup, ages beyond written history return zero. History saturates
at 8192 and full three-point reads are then used. No global low-X/Y scratch,
extra heap, ColdFire RAM/state, temporary full-buffer copy or dynamic
allocation is introduced. Temporary arithmetic state lives in registers and
the bounded existing stack. Program/table are immutable after relocation.

Sources: verify_bounds.py and evidence/bounds.json; the native allocation
ledger and four-origin source packages; tools/build/build_bus.py CLONE_STRIDE,
CLONE_BASE and LONG_LIST; descriptor-recipes.json descriptorBytes=402;
verify.py/verify_instances.py and verify_stress.py. The 31-second replay
passes local Y/P and shared-buffer canaries with dirty initial state,
eight distinct instances and split calls. Physical canaries and stack/DMA
contention measurements were not taken. FX1 dispatch returns dry and never
writes an FX2-sized buffer. Bus owners are rejected by composition claims.

Analog BD shares none of these X/Y state regions. Its 997-word engine and
35-word relocated stock helper reserve most of Spring. Air Chorus's 256-word
lossless sine-difference table and 539-word program can be placed separately
when a contiguous 795-word run is unavailable. Four independent origin pairs
are proved against fresh native assembly; stock-helper and overlap checks
cover both physical spans. The smaller package permits E-Verb and additional
Analog BD companion combinations. Crowded combinations still fail placement.
