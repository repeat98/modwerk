# OCTAMOD.LOG v2

The browser and server share [`src/community/ot-log.ts`](../../../src/community/ot-log.ts). They still accept legacy v1 files. v2 adds full configuration and a completion checksum, so a partial or torn checkpoint is rejected and the user can try its peer.

Both `/OCTAMOD.LOG` and `/OCTAMOD1.LOG` are in the card root. Each device file is exactly 32,768 bytes, with LF padding. Uploads allow at most 64 KiB and printable ASCII plus LF/CRLF. Arbitrary binary/firmware, samples and project files fail the grammar. Valid grammar is not proof of authenticity.

## Headers

Headers below must appear once before the first boot. No annotations are part of a real log:

| Header | Value |
| --- | --- |
| `# OCTAMOD-LOG v2` | First line |
| `# build=` | First 16 lowercase hex digits of the configuration hash |
| `# os=` | OS version, up to 16 alphanumeric/dot characters |
| `# modules=` | `id@semver` entries separated by semicolons; max 64 unique ids / 2,048 characters |
| `# configuration=` | Full 64-digit lowercase SHA-256 of the resolved configuration |
| `# source=` | Full 64-digit lowercase SHA-256 of the original source inventory |
| `# fx1=`, `# fx2=`, `# hidden=` | Ordered native keys, semicolon separated; max 32 entries / 1,024 characters each |
| `# stockfx2=` | `0` or `1` |

A configuration includes ordered chooser entries and module versions; a source inventory pins the exact implementations. Do not confuse these hashes with the browser's built-image digest. Both composers hash UTF-8 JSON with no whitespace and field order `fx1, fx2, hidden, logger, modules, os, source, stockfx2`; module objects use `id, version` in resolved composition order. The `source` hash covers `{core, modules}` in that order: the original core source inventory digest and the pinned module source-tree digest. The private build report records these inputs.

`# boot=N` starts a session. Optional `# recovered=1` and `# dropped=N` appear once each immediately after its boot header, before records. Counters are unsigned 32-bit. Recovery requires retained RAM from the same configuration. Usually only the current session exists; a prior session is present only if validated recovery succeeded. Boot numbers are not a persistent wall clock and can restart at 1.

## Records

```text
00044 0000046C I JOB 0001 0000002C 00000011
```

Fields: five-digit sequence modulo 100,000; eight-digit hex UI tick counter; level (`D I W E F`); 1–4-character uppercase tag; four-digit hex code; two eight-digit hex arguments `a b`. Ticks are nominal 60 Hz and wrap. Correlate by boot and token, not wall-clock time. RAM head wraps modulo 2³² and dropped count saturates.

| Tag / code | Meaning | a | b |
| --- | --- | --- | --- |
| `BOOT 0001` | Logger initialized | Recovered previous session (0/1) | RAM/text version |
| `JOB 0001` / `0002` | Engine job begin / end | Stable correlation token | Stock job type; 7 SYNC, 0x11 SAVE PROJECT, 0x12 SAVE BANK |
| `TRN 0001` | Transport requested (before handling) | New correlation token | Stock request argument, not a success result |
| `CTX 0001` | Selected context changed | Job token | Bytes: bank, pattern, part, track (zero based) |
| `TRK 0000`–`0007` | Track machine/FX selection changed | Job token | Bytes: zero, machine id, FX1 id, FX2 id |
| `CARD 0001` | Mount kind changed | Job token | 0 absent, 1 CF, 2 ROM archive |
| `USB 0001` | USB disk state changed | Job token | Stock USB disk flag |
| `FS 0001`–`0004` | Buffered open/read/write/close failed | Active job token, or 0 | Signed stock return value as uint32 |
| `FLT` + vector number | Exception callback | Faulting PC | Full format/vector-SR word |
| `GRD 0001` (W) | The frame guard silenced module machine renders since the last `GRD` (at most one record per 10 s) | Renders silenced | Tracks silenced, bit 0 = T1 |
| `LOG 0002` (E) | Checkpoint failed | Attempted slot | Meaningful text bytes |
| `LOG 0BAD` (W) | Record tag/level invalid | Raw a | Raw b |

A matching job end means control returned to the engine loop, not that the job succeeded. Filesystem errors are separate. Optional-file missing/empty open results (-12/-10) are omitted. Track state is sampled at job boundaries, so changes between them may not be seen. No per-sample, raw MIDI or DSP register trace is implied. Module-specific events need a documented tag and explicitly bounded call sites.

## Completion

The final meaningful line is `# complete=XXXXXXXX` with uppercase CRC32/IEEE (reflected polynomial `0xEDB88320`, initial/final XOR `0xFFFFFFFF`) over all preceding bytes, including their final LF. Only LF padding follows. CRLF input is normalized to LF for checking. Changing configuration, event bytes or the trailer invalidates the checkpoint.

Legacy v1 has only build/OS/modules headers, no completion trailer, and may use `build=unknown`. It cannot detect torn writes as reliably. The v2 writer never emits v1.
