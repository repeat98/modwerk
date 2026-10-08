# Octabam infrastructure backports

The selective import is pinned to [sambanks/octabam `7b2984c8`](https://github.com/sambanks/octabam/tree/7b2984c859732ae6c797ae49c7d61d250b1b6519). [The import record](../sdk/imports/octabam-infrastructure-7b2984c8.json) binds each imported file to its upstream and adapted SHA-256. The original vendoring revision and module pins remain in `sdk/UPSTREAM.json`; this import changes no module sources or versions.

| Area | Included changes |
| --- | --- |
| DSP assembler | Encode ALU operations with both parallel moves. Roundtrip checks compare operands and moves, normalize numeric notation and LUA syntax, and refuse missing decodes. Existing audited MPY/MPYSU exceptions remain exact. |
| False passes | Dirty-state renders use a valid FX2 block and allocator entry, build the named image unless one is explicitly supplied, and fail if a callable effect aliases the fallback on both cores. The cycle CLI exits unsuccessfully over its usable budget. Capped insert costs include remaining slots, and server-free configurations are also priced. |
| Emulator | Default DSP timing is 4,532 instructions/sample. Battery SRAM can be restored with `--cs1-in`; `--no-post` uses normal firmware power-up loading. `--card-fail-after` injects write failure. USB reset and unplug replies wait for firmware acknowledgements, with bounded bench waits. Timed calls and pre-play actions support recovery scenarios. |
| Memory and linker | Hook ownership includes both instruction words. DSP range declarations are checked against FX2 buffers, core-private Y and bus scratch. Project verification records a shared-memory write census. Declared constants reach both assembler and linker, source redefinitions and conflicting DRAM definitions fail, and author references use declared values. |
| Validation efficiency | Emulator source-content stamps avoid rebuilds caused only by checkout timestamps. Isolated `Gate.once` checks run once in a validation run, on the smallest selected carrier. |
| Toolchain reliability | macOS setup detects a binary architecture mismatch and stale DSP patches. Emulator builds use the hardware architecture under Rosetta. Linux drum-analysis linking includes the available Intel profiling library and libdl, and reports compiler errors. |

Modwerk retains its compilation memo, local stock guards, stock-copy recipes, dynamic-loader support, DRAM/BSS checks and independent scenario capture streams. Its approved images keep the stock mailbox at `0x38000`; the new census uses that address. The upstream mailbox relocation and module changes are excluded.

The direct dirty-state render excludes hook-only stock-DSP replacements, whose behavior needs the firmware path. The census checks non-zero writes in 256-word shared-memory regions. An allowed range overlapping a region accepts that region: it cannot identify every stray word, observe zero-over-zero writes, or attribute private-memory writes to individual modules.

[Fresh native evidence](../sdk/infrastructure-verification/octabam-7b2984c8.json) records 38 current-main/backport profiles. Successful complete images and refusal reasons are identical. The 136-profile Analog BD matrix was rebuilt and every result matches its existing row; only its source bindings were regenerated. All authored compiled packages reproduce the browser baseline. Historical module qualification records retain their original version-specific results.

Validation also covers SDK regression tests, all 312 vendor assembler tests and DSP JIT/optimizer suites, five firmware-free ColdFire emulator CTest targets, native DRAM/BSS and constant fixtures, card-failure and USB reset/unplug regressions, and Linux harness linking. These are software checks. They do not establish physical reboot persistence, sound quality, hardware stress or chip timing.
