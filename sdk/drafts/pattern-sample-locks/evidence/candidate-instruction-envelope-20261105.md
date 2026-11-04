# Pattern Sample Locks 0.1.8 candidate instruction envelope

This is a static, stock-free instruction-count analysis for one maximum-size
successful Lock/Clear transaction. It is not a qualification result, a cycle
count, a latency bound or a claim about execution time on an Octatrack.

## Exact candidate and source binding

- Candidate package SHA-256:
  `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Native-source inventory SHA-256:
  `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`.
- Linked image reconstructed from the package's native inputs:
  `54efd2166b30b836401d02f8d0d785e12aebc5b40196deb1a9b6e4530e6f95d5`;
  the cached compiler report says `imageMatchesCandidate: true`.
- Cached ELF SHA-256 `4c1bb41454863f61eb4cd047d11b3f6905a1c1e7d4e391967ace95f8406fd679`,
  translation object SHA-256
  `b8733f98963fcd1e8e1b85a49f4cff1f196c73ade9a3c9ee7be982bc9a9bffb2`,
  and compiler report SHA-256
  `18afccabd978887c06545ca7f6c306730e919bbc9e8623e1e1114edeb55441bb`.
- Compiler image: `sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`
  (GCC 16.2.0). The candidate-only linked disassembly was produced with GNU
  `m68k-elf-objdump` 2.47.20260726; its private-file SHA-256 is
  `cfe58b39cb782ff671d625a604081f0ed3a0136c3e62b7ac570e00fd65e6d12e`.

The repository's native-source fingerprint was recomputed with Node 24.22.1
using `moduleNativeSourceSha256` for `sdk/drafts/pattern-sample-locks`; it still
matches the value above. Relevant individual source pins are `engine.c`
`a41ace651c2ff9f72d43e783d6121c64f51fe6d21e49bc60cf3b26a97ebdaa38`,
`engine.h` `d1c067250f8bc555944303fb526cd9ec22c281c0f4773c95ed6fbdd332925ca1`,
`native.c` `a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e`,
`translation.c` `307d7f0d95a8eef8746c069472123555eebd40635e9401c3946e7d51e69113a5`,
and `unit.s` `837e44f48fa137444e14755d96011731c8fde29a73fa877ffc35edac3510473f`.

## Counted path and workload

The summed path begins at entry to `psl_prepare`, with its source snapshot
already supplied by the UI, and ends when candidate refresh dispatch returns
from `psl_native_commit`. It includes preparation, commit revalidation,
companion-slot scans, per-step publication, the candidate-side task guard and
candidate dispatch to refresh. In the real UI those phases are separated by
input events; user think time and instructions in the surrounding UI callbacks
are outside this count.

The stress workload clears all 512 SAMPLE fields: eight selected tracks times
64 steps, every field initially locked, all 64 steps changed, and all eight
edits published at each step. Because each cleared value becomes `PSL_NO_LOCK`,
the maximum scan examines all 31 companion lock slots for each changed field:
`512 × 31 = 15,872` slot comparisons. A full Lock replacement can also change
512 fields when every step is triggered; its replacement value is nonempty, so
it does not take this companion-slot scan. A Lock without replacement can
preserve existing locks and may become a no-op.

## Instruction envelope

The cached candidate-only ELF contains these static instruction counts and
source-mapped maximum loop trips per function call:

| Function | Static instructions | Maximum loop trips |
| --- | ---: | ---: |
| `source_valid` | 45 | 8 |
| `psl_prepare` | 145 | 592 |
| `psl_validate` | 80 | 584 |
| `psl_native_source` | 134 | 8 |
| `psl_native_transport` | 22 | 32 |
| `psl_native_context` | 14 | 0 |
| `psl_native_commit` | 303 | 17,688 |
| `psl_write_step` | 34 | 8 |

The trips are from the fixed source bounds: preparation has 8 assignment checks,
8 track visits, 64 trig-byte reads and 512 SAMPLE reads; validation has 8 track
visits, 64 trig checks and 512 SAMPLE checks. The commit body is inlined into
`psl_native_commit`; its maximum trip sum includes 64 index initializations,
track/trig/SAMPLE scans, the 15,872 empty-slot checks, final revalidation,
64 publication steps, up to 512 per-step track checks, and up to 8 refresh
dispatches. `psl_native_transport` has two 16-entry scans and is called twice
on the normal commit path.

For each C-compiled function except the separately expanded writer loop, the
deliberately loose envelope is `static instructions × (1 + total maximum
source-loop trips)`. The added one pays for the base execution of every static
instruction; charging every static instruction for every source-loop trip
overcounts loop setup/exit and mutually exclusive paths. `psl_write_step` has
a 9-instruction loop body, so its complete maximum is
`34 + 7 × 9 = 97` instructions per call.

| Candidate-owned component | Envelope instructions |
| --- | ---: |
| `psl_prepare` and its one `source_valid` call | `145 × 593 + 45 × 9 = 86,390` |
| `psl_native_commit` inlined root | `303 × 17,689 = 5,359,767` |
| `psl_validate` and its one `source_valid` call | `80 × 585 + 45 × 9 = 47,205` |
| One `psl_native_source` call | `134 × 9 = 1,206` |
| Two `psl_native_transport` calls | `2 × 22 × 33 = 1,452` |
| One `psl_native_context` call | `14` |
| 64 `psl_write_step` calls | `64 × 97 = 6,208` |
| **Conditional candidate-owned envelope** | **5,502,242 instructions** |

The envelope includes 64 full writer calls (6,208 candidate instructions) and
the previously verified IPL-7 subset of 64 × 87 = 5,568 candidate instructions.
Those masked spans are only one part of the transaction. Candidate refresh
dispatch has one global refresh call and at most eight track refresh calls;
the call instructions are counted in the candidate root, while stock callee
instructions are excluded.

This is a path-conditional upper envelope for the stated supported 8 × 64
successful workload and exact linked image. The function-wide multiplication
is intentionally very pessimistic, not a tight executed-instruction prediction
or an estimator for other tasks and UI paths.

## Branches, helper checks and reproduction

The private helper pins package, compiler report, object, ELF, candidate-only
disassembly and relevant source hashes; checks the linked instruction counts,
source-mapped loop latch addresses and limits, cyclic instruction-CFG component
ranges, and direct call targets; rejects indirect calls or jumps; and verifies
that every counted branch has a direct target. The normal candidate call graph
includes `source_valid`, `psl_native_source`, `psl_native_transport`, `psl_validate`,
`psl_native_context` and `psl_write_step`; only the two fixed refresh callees
are stock. Synthetic arithmetic fixtures independently exercise maximum Clear,
full Lock replacement, no-op Lock, recording refusal and stale-before-publish
cases, as well as single and nested loop envelopes.

The private helper and result remain outside Git at:

- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/audit_candidate_operation.py`
  (SHA-256 `ae8d91bd9a8e7913c9f5a33afcd2a32c07241bc785e183b1bccd019bcbd93af4`)
- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/operation-bound-result.json`
  (SHA-256 `7434e2b5acbe8b41e10ada349e9d6ef56095751fa93efaf9e915a53b06b114b0`)

Re-run the source-bound checks against the already cached exact candidate inputs
with:

```sh
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/audit_candidate_operation.py > /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/operation-bound-result.json
```

No new container or emulator was launched. The source fingerprint can be
recomputed with Node 24 from the repository root:

```sh
/Users/weiyun.wang/.nvm/versions/node/v24.22.1/bin/node --input-type=module - <<'JS'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseModuleDocument } from './src/catalog/module-contract.ts'
import { moduleNativeSourceSha256 } from './scripts/module-qualification.mjs'
const folder = resolve('sdk/drafts/pattern-sample-locks')
const document = parseModuleDocument(JSON.parse(await readFile(resolve(folder, 'octamod.module.json'), 'utf8')))
console.log(await moduleNativeSourceSha256(folder, document))
JS
```

## Limits and path conditions

- The count starts inside `psl_prepare`; it excludes the UI's earlier source
  capture, event-dispatch instructions, arbitrary user input/think time, UI
  rendering and post-commit redraw. It sums candidate instruction work across
  the preparation and later confirmation callbacks, not contiguous elapsed
  time.
- A no-op Lock returns before commit scans/publication. Active recording is
  refused before `psl_native_commit`; stale input may be rejected during
  validation or final revalidation before the first write. These branches have
  different work and zero publication spans when refused; this successful
  maximum workload does not represent them as equal-cost paths.
- The bound assumes the fixed stock refresh callouts return normally and do not
  synchronously re-enter candidate code. Stock refresh implementation work,
  interrupts and scheduler work are not counted; interrupt nesting and the
  edge-sensitive level-7 preemption question remain separate unresolved gates.
- Instruction totals are not MCF54455 core cycles. They do not price SDRAM
  access, cache state, bus arbitration, memory wait states, PLL/core clock,
  instruction sequencing stalls, or interrupt-controller delivery. No cycle,
  elapsed-time, latency or worst-case hardware claim follows from this count
  or from emulator instruction totals and observed timer maxima.
