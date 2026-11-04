# Pattern Sample Locks 0.1.8 candidate transaction-core instruction envelope

This is a source-bound, stock-free instruction-count analysis for the bounded
core segment of a maximum-size successful Lock/Clear transaction. The total is
not a whole-operation or whole-callback count, and is not a qualification
result, cycle count, latency bound or execution-time claim for an Octatrack.

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

The package contains nine guarded stock-copy placeholders and no fill records.
Two copy destinations overlap counted machine-code function ranges, so
disjointness alone would be the wrong validation criterion. The first review
helper stopped on that overlap; the assertion was overstrict, not evidence of
a package mismatch. The corrected private audit checks each guarded-copy digest
against the same-offset bytes in the cached
linked image, checks that copy ranges do not intersect relocation words, then
reconstructs the initialized image and requires byte-for-byte equality with
the linked ELF image. All nine guards match; the reconstructed 8,748-byte
image has SHA-256
`54efd2166b30b836401d02f8d0d785e12aebc5b40196deb1a9b6e4530e6f95d5` and is
identical to the compiler report's image. Thus the counted instruction stream
is the stream produced by the compiler after the package's valid guarded-copy
records are resolved. A rejected stock guard prevents this candidate image
from loading; this conclusion does not substitute for the package/base guard
checks.

## Counted path and workload

The summed path begins at entry to `psl_prepare`, with its source snapshot
already supplied by the UI, and ends when candidate refresh dispatch returns
from `psl_native_commit`. It includes each listed function's prologue and
epilogue, candidate call instructions, preparation, commit revalidation,
companion-slot scans, per-step publication and the candidate-side task guard.
In the real UI the preparation and commit phases are separate input events;
the `module_key` event wrapper, earlier UI source captures, UI-state work,
dispatcher setup, user think time, later redraw and other callbacks are outside
this count.

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

The nested trip accounting used by the helper is explicit here; products count
inner loop activations across every selected track, and sequential loops are
added:

| Function | Maximum dynamic source-loop trips per call |
| --- | ---: |
| `source_valid` | `8` track checks |
| `psl_prepare` | `8 + 8 + 8×8 + 8×64 = 592` |
| `psl_validate` | `8 + 8×8 + 8×64 = 584` |
| `psl_native_source` | `8` tracks |
| `psl_native_transport` | `16 + 16 = 32` |
| `psl_native_context` | `0` |
| `psl_native_commit` | `64 + 8 + 8×8 + 8×64 + 8×64×31 + 8 + 8×8 + 8×64 + 64 + 64×8 + 8 = 17,688` |
| `psl_write_step` | `8` edits maximum per call |

For the commit root the terms are, in order: 64 index bytes; an eight-track
scan; 8 trig bytes and 64 SAMPLE steps per selected track; up to 31 companion
slots per changed SAMPLE field; the final eight-track, trig and SAMPLE
revalidation scans; 64 publication steps with up to eight selected tracks at
each step; and eight possible track-refresh dispatches. The successful stress
fixture selects all eight tracks and changes every field, so these terms
simultaneously upper-bound that path. The 31-slot scan is the empty-companion
Clear case; nonempty Lock replacement does not scan those slots.

For a function with `N` static instructions, the helper maps every loop latch
to the cached ELF and source bound, then verifies that removing all mapped
latch edges leaves an acyclic instruction CFG. A path with `R` taken latch
edges splits into at most `R + 1` acyclic fragments, each containing at most
`N` instruction visits. Each loop's maximum body trips bounds its taken latch
edges; nested body trips include the product of the parent activation count
and the inner limit, while sequential trips are added. Therefore
`N × (1 + sum of dynamic loop trips)` is a conservative upper bound for the
function, including loop tests and exit branches. The checked candidate call
graph is acyclic and is bounded separately by its exact call multiplicities;
this prevents the per-function argument from silently dropping callee work.
The proof assumes the pinned source-to-CFG map, valid plan state, no memory
corruption and one transaction without asynchronous candidate re-entry.

`psl_write_step` is handled more tightly: its single loop body is 9
instructions, with 34 static instructions total. At most eight edits yield
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

## Multiplicity, refresh dispatch and relocation conditions

The checked candidate call graph for these functions is acyclic: `psl_prepare`
calls `source_valid` once; `psl_validate` calls it once; and the inlined commit
root calls `psl_native_transport` twice, `psl_native_source` once,
`psl_validate` once, `psl_native_context` once, and the single `psl_write_step`
call site at most 64 times. The helper checks every direct call target, rejects
indirect calls, DBcc loops, jumps and exceptional transfers, and fails if any
unmapped CFG cycle remains. The 303-instruction `psl_native_commit` count
includes its prologue/epilogue, inlined task guard and commit body, plus every
candidate-side call instruction; separate candidate callees are charged in
the table above. No recursive edge exists in this counted candidate call
graph.

On a successful changed operation, the candidate calls the fixed global
refresh target at most once, then the fixed track-refresh call site at most
eight times (once per changed selected track); a no-op/refusal takes neither
refresh path. Existing offline evidence for the private reconstruction with configuration SHA
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc` and `MAIN.raw`
SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e` audits the
global refresh leaf and the track-refresh direct-call closure plus its bounded
stock switch ([stock leaves](qualification-progress-20261104.md#stock-leaf-routines),
[track refresh](qualification-progress-20261104.md#track-refresh-call-path),
[bounded switch](qualification-progress-20261104.md#bounded-stock-switch)).
Under that exact private reconstruction and the audit's condition that no other module patches
those ranges, the traced refresh closure has no unresolved callback transfer
that re-enters the candidate transaction core synchronously. The stock
callee's own instructions are still excluded. This does not resolve interrupt
or scheduler re-entry, callbacks later dispatched by redraw, or different
bases/companion patch sets.

The compiler report binds this count to the exact package image. It records
167 relocations; the cached object has 167 fixed-width `R_68K_32` entries. The
module loader's relocation path adds the chosen module base to declared
32-bit address words and does not insert or relax instructions. Thus valid
uniform relocation changes address operands, not the number or boundaries of
candidate instructions. This assumes a valid supported placement, the exact
package and loader behavior, and no live patch changing counted code; it does
not imply identical data-dependent branch outcomes or memory timing.
The relocation-type check is reproducible with
`/opt/homebrew/bin/m68k-elf-readelf -r /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stack-audit-20261104/translation.o`:
161 `.rela.text` and 6 `.rela.rodata` entries, all `R_68K_32`.

## Adversarial checks, emulator sanity and reproduction

The private helper pins package, compiler report, object, ELF, candidate-only
disassembly and relevant source hashes; validates guarded copy reconstruction;
checks linked instruction counts, source-mapped loop latch addresses/limits,
cyclic instruction-CFG component ranges, direct call targets, direct branch
destinations and an acyclic candidate call graph. Removing every
source-mapped loop latch must also leave each counted function's instruction
CFG acyclic. Synthetic tests reject a bad copy digest, overlapping copy
placeholders, indirect calls, DBcc, jumps and exception transfers.
Beyond the workload fixtures, adversarial instruction-frequency models cover
two sequential loops (24 modeled instructions versus a 56-instruction bound),
three nested loops (138 versus 410, including repeated inner exit tests), and
nested loops followed by a sequential loop (41 versus 130). A deliberately
wrong sum of lexical loop limits gives 100 for the three-level nested case and
fails; dynamic trip products pass. These test the envelope arithmetic, not the
firmware's execution.
Synthetic fixtures exercise maximum Clear, full Lock replacement, no-op Lock,
recording refusal and stale-before-publish cases.

The current exact-candidate emulator traces in
[TESTING.md](../TESTING.md#dsp-enabled-native-emulator-results) and the
[qualification receipt](qualification-progress-20261104.md#current-base-emulator-edit-matrix)
record 314,314 emulator instructions for the maximum 512-field
empty-companion-slot Clear callback. That observed callback interval is lower
than this conservative 5,502,242 candidate-core envelope, but the scopes differ:
the trace includes interrupt/dispatcher work while the static count sums selected candidate
functions across preparation and commit. It is only a plausibility check; it
does not establish the static bound, a repeatable maximum or a hardware result.
No emulator or container was launched for this review.

The private helper and result remain outside Git at:

- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/audit_candidate_operation.py`
  (SHA-256 `f635abe5d62730079759831f47f9a7da09d0964af7e9f0f1fddee0dc1d730f07`)
- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/operation-bound-20261105/operation-bound-result.json`
  (SHA-256 `d766533583d356880973075fda3f80a44ee8f4c9e7cbe81335265e075febb3c0`)

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

- This is a transaction-core segment bound, not a complete bound for all
  candidate instructions in the key callbacks. It excludes the `module_key`
  wrapper, UI's earlier source captures, dispatch setup, arbitrary user
  input/think time and later redraw; the phases also are not contiguous in
  elapsed time.
- A no-op Lock returns before commit scans/publication. Active recording is
  refused before `psl_native_commit`; stale input may be rejected during
  validation or final revalidation before the first write. These branches have
  different work and zero publication spans when refused; this successful
  maximum workload does not represent them as equal-cost paths.
- The exact-base refresh audits resolve candidate re-entry only for the
  inspected stock paths and no-other-module-patches condition. Stock refresh
  instructions are excluded; interrupts and scheduler work are not counted,
  and their possible candidate re-entry, interrupt nesting and edge-sensitive
  level-7 preemption remain separate unresolved gates.
- Instruction totals are not MCF54455 core cycles. They do not price SDRAM
  access, cache state, bus arbitration, memory wait states, PLL/core clock,
  instruction sequencing stalls, or interrupt-controller delivery. No cycle,
  elapsed-time, latency or worst-case hardware claim follows from this count
  or from emulator instruction totals and observed timer maxima.
