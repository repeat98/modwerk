# SEQ memory (package header and assembler)

Version **0.1.0-experimental**, package built on 27 November 2026 with `npm run module:dev -- seq --build-only`.

| Region | Space | Bytes | Scope |
| --- | --- | ---: | --- |
| Runtime package code and data (MWRM ABI 8) | cpu-ram | 38,356 | shared |
| Per-project seq.work (max layout, octabam-compatible) | card | ~9,216 | per project while SEQ is installed |

The package carries no BSS. SEQ takes no DSP slot, no delay line and no shared DRAM unit of its own beyond the loader pool entry. seq.work sits beside bank files on the card; the base's project events read and write it.