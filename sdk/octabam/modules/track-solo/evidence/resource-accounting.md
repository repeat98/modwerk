# Track Solo resource accounting

This is static accounting for the exact Track Solo 0.2.2-experimental package
listed below. It contains no firmware image or extracted stock data and makes
no hardware or performance qualification claim.

## Package and production inputs

The ABI 8 MWRM package is 2,128 bytes, SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`. It
contains a 1,500-byte linked code/data image, zero BSS, 24 relocations and
seven guarded sites. The package was reproduced from these six production
inputs (SHA-256; paths are relative to the module directory):

| Input | SHA-256 |
| --- | --- |
| `track_solo.c` | `4be4f717ff944382e3f70cd2a566c66ff7f246f7572429965ef9e6beb810b0d9` |
| `core.s` | `27405e60345f52a09aaa3626f23827378d817501a936c2b1d51bac5c07e7016f` |
| `gate.s` | `be22167d318543910d19ef07dcb2e17c12d46a5c215d09775f2282560e3e3825` |
| `input.s` | `6dbaa342e99c2fcf992cadc5bfc23b1a128edd5e05ae594a6ce3553ac7fdf4b0` |
| `manifest.py` | `3d9e8245b25d173775afeac02ec3fc78b27239408377f169b45d09f1d50c85a4` |
| `runtime.json` | `103c5acf81c9d719adaaaa5ef573c17462215331a22de5b2832f423b2d7960a7` |

These six production-input hashes match the files at source revision
`7acb980a07ebef61b98b791e85b098175438d8c3`. The emulator reports remain bound
to their exact package hash; this source-input match does not establish a run
of the later-changed publication runner or its host tests.

The build receipt's linked-image hash
`fef00e25cd4df6ae8ac76000357b15ac2ed3c029505a4638aea4db137c86cd3c`
identifies the raw link output based at `0x10000`. The canonical image embedded
in the package has SHA-256
`fab51a32ea72e27b83413a2ced88b76709fc18e01b425dd78cb36b2213e42182` and is
the 1,500-byte range `[196,1696)` of the MWRM. Subtracting `0x10000` at the 24
relocation offsets declared by the package makes the raw linked image
byte-identical to that embedded range. These hashes describe different address
representations of the same image, not different package contents.

## One-instance loader allocation

The source probe used ABI 10, `RUNTIME_MODULES=128`, and
`RUNTIME_POOL_BYTES=786432`. Under that configuration, one Track Solo instance
accounts for:

| Component | Bytes |
| --- | ---: |
| `runtime_module` object | 528 |
| Seven site descriptors (`7 × 72`) | 504 |
| Object plus descriptors before alignment | 1,032 |
| Object/descriptor extent rounded up to 16 bytes | 1,040 |
| 1,500-byte image rounded up to 16 bytes | 1,504 |
| **One-instance pool extent** | **2,544** |

The shared base arrays are preallocated by this probe configuration; they are
not charged again per module. The 786,432-byte value is configured pool
capacity, not a measurement of the installed base's runtime pool. The 2,544
bytes are a configuration-specific incremental allocation estimate and are
separate from the package's 1,500-byte image size.

The image already includes 44 writable bytes: 28 bytes of module state, one
4-byte state pointer (`ts_at`), one 4-byte overlay word and two 4-byte frame words. They
are not an additional allocation outside the 1,500-byte image.

During replacement or undo, outgoing and candidate allocations may coexist.
An extent is reclaimable only after no live slot, journal/set/candidate/previous
owner, or captured paused-task context can still reference it. If paused context
ownership cannot be established within the loader's bounded scan, reclamation
is deferred; the steady one-instance figure does not describe transition peak.

## Module-owned stack and instruction accounting

The exact archived ELF was disassembled with
`m68k-elf-objdump -m m68k:isa-c:emac -d`. This accounting covers Track Solo's
frame detours, tick, key, encoder, menu row, and panel/LED wrappers. It stops at
the module/stock boundary: no stock callee, alias, interrupt, trap, or native
callback bound is included or reopened. All measurements below are static and
package-bound; no emulator or hardware run was made for this accounting. The
only stock-byte check is the exact eight-byte project-load prologue, used to
distinguish the replayed stock frame from module-added stack.

The 1,500-byte ELF `.image` is a combined code/data section, so its exact
code-versus-read-only-data split is not available. Its exact writable extents
are 28 bytes of `ts` session state, a 4-byte `ts_at` pointer, a 4-byte
`ts_overlay`, and two 4-byte frame words: **44 writable bytes inside the image**. The
menu row descriptor and label occupy a separate 28 bytes in that same image.
Neither the module state nor the row descriptor is extra loader allocation;
there is no BSS or project-persistent state.

`lea -N(sp)` reservations include the `movem`-saved registers written into
those frames. With pushed arguments and module `JSR` returns counted at the
named boundary, path subtotals include the explicitly identified stock replay
frame where noted:

| Path | Bytes | Included stack at the stated boundary |
| --- | ---: | --- |
| Active frame or scope enter/leave transient | 4 | Saved `d0`; inactive paths add no stack. |
| `ts_tick` / `led_update` frame | 24 / 16 | Each reservation contains its saved registers. |
| `ts_tick` to a leaf helper / `led_update` frame | 28 / 44 | Tick frame plus one module return, then tick frame plus update call return and frame. |
| `led_update` through native LED wrapper to stock setter | 28 / 40 | Module portion 28 (update frame 16 + two arguments 8 + module call return 4); stock continuation subtotal 40 includes the replayed original stock frame 12. |
| `led_update` through stock row helper | 28 | Update frame 16 + two retained row arguments 8 + stock call return 4; helper frame excluded. |
| `ts_key` with nested module call | 24 | 20-byte reserved frame and one four-byte return. |
| `ts_enc` calling `ts_cancel` | 4 | One call return; neither function reserves a frame. |
| `ts_stock_key` calling `ts_stock_row` | 12 | Row argument 4 + call return 4 + leaf saved `d2` 4. |
| `ts_panel_row` through `ts_led_row` | 32 | Panel frame 16 + two arguments 8 + call return 4 + leaf saved `d2` 4. |
| `ts_panel_row` calling stock draw helper | 4 | The panel frame and temporary arguments are released before this call; helper frame excluded. |
| `ts_led_level` calling `ts_led_value` | 16 | Two arguments 8 + call return 4 + leaf saved `d2` 4. |
| Tick through LED update to stock LED setter | 56 / 68 | Module portion 56 before replay; stock continuation subtotal 68 includes the replayed original stock frame 12. |
| `ts_project_load` transient before stock prologue replay | 20 | Initial module frame 16 + `ts_cancel` return 4; both are released before the replay. |

Incoming caller frames and subsequent stock continuation/callee growth are
excluded. The two explicitly identified stock replay frames are included only
in the mixed 40- and 68-byte continuation subtotals.
`ts_get` tail-jumps to `ts_label`, and `ts_set` tail-jumps to `ts_cancel`;
neither adds a module frame or call return.
At project-load detour `0x400866c4`, package `6b7a...a2fd` has a six-byte patch
and an eight-byte stock guard. The exact canonical MAIN
`877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e` uses
stock load address `0x40000400`; the guard hash is
`2701c9f06c655d1a5b7aab9961c0a3d23848764c2e559d362850d8d7831e7702`.
`input.s` replays the guarded prologue after restoring and releasing its
temporary 16-byte frame, then jumps to
`0x400866cc`. The 1,468-byte allocation is the original stock function frame,
including saved registers; it is not an additional Track Solo allocation.

The largest explicit module-owned local frame is `ts_tick` at 24 bytes; the
largest enumerated module-owned nested subtotal before stock replay is tick
through the LED setter at 56 bytes; the 68-byte continuation subtotal includes
the 12-byte stock replay. None is a total stack maximum. The prior mixed
92-byte figure remains partial and is not used as a maximum.

The revised instruction model counts unique instruction sites per module function,
including mutually exclusive branches, then adds repeated instructions for
bounded module loops. These are **instruction executions, not ColdFire cycles**
or measured traces. For `others()`, the seven non-anchor row checks and row-2
skip yield an 81-instruction upper envelope. `led_update` activation is 411
instructions (capturing sixteen levels, updating sixteen LEDs, and calling the
module LED wrapper sixteen times); a nonzero group change or restore is 351.
Frame enter is 4 inactive / 12 active instructions; frame leave is 4 / 9.
Scope begin is 3 inactive / 11 active instructions; scope end is 3 / 8.

Other conservative module-owned entry envelopes include 210 for key membership,
202 for arm-start, 210 for blocked cancellation, 15 for encoder cancellation,
8 for menu get plus label, 22 for menu set plus cancel, 45 for panel-row plus
LED-row filtering, and 34 for LED-level filtering plus its module wrapper. The
coarse tick transition envelope is 1028 instructions: all 76 `ts_tick` static
sites plus maximum callees for its distinct call sites (one `can_arm`, two
`others`, one `ts_cancel`, one restore/update, and one activation/update). It
intentionally sums mutually exclusive branches and counts the two `led_update`
calls separately; it is a conservative module-only instruction envelope, not
a cycle estimate. These estimates assume valid module state, normally returning
stock calls, no stock-mediated reentry and no asynchronous reset during the
modeled event. Frame entry and leave each include a replayed stock instruction,
which is not incremental work. The corrected private recount and its limits are
in `~/.cache/modwerk-track-solo/resource-correction-20261106-task80/REPORT.md`.

Instruction counts do not establish ColdFire cycles, cache or bus waits,
stock work, IRQ/trap time, or an installed-base stack/capacity maximum. The
ordinary ColdFire `cycles.static` and `cycles.measured` figures remain **NOT
MEASURED** for this exact package. There is no CPU-load percentage or waiver
inferred from these counts. The previous ABI 10 one-instance probe remains
configuration-bound; it is not an installed-base pool or complete transition
peak measurement.
