# Play Modes: memory

From the 0.2.0 native composition (`out/platform/runtime/runtime.elf`, this
module's linked unit, Octaplay `73d5f89`):

| region | space | bytes | 0.1.1 | notes |
|---|---|---|---|---|
| code: C engine and glue, 36 detour stubs and entries | SDRAM platform reserve | 8,836 | 7,700 | `.text` from 0x40a955e0 to `pm_state`; STEP REPEAT's engine, glue and trig-key stub |
| read-only data: mode names, keys, tables | SDRAM platform reserve | 114 | 102 | `.rodata` (REPEAT's name and list entry) |
| state: as 0.1.1, plus STEP REPEAT's held keys 4, last repeated step 16 and page 16 per track | SDRAM platform reserve | 4,800 | 4,764 | in `.text`, loader-owned, explicitly initialised |
| battery table: 'PMNV', 256 × 9, sum | CS1 battery RAM 0x100f8600..0x100f8f06 | 2,310 | 2,310 | unchanged; REPEAT is nibble 6 |

Total 16,060 bytes (0.1.1: 14,876), all shared (one table for all tracks
and patterns; no per-track copies). Stack: at most 124 bytes below the
caller's arguments (`evidence/cycles.md`). No heap, no DSP memory, no
OS-image cave space, no effect slot. As every DRAM module, the build's
platform reserve takes about 10 MB of sample memory (shared with any other
DRAM module).
