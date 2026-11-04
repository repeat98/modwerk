# Popup opener and window-close callbacks — 4 November 2026

This stock-free record contains code-range hashes, entry addresses, and stack
arithmetic only. The private cache retains the binary and disassembly inputs;
no firmware, extracted bytes, disassembly, callback table contents, or memory
dump are copied here. No hardware was accessed.

## Exact inputs and checks

The reproduced current base identity is
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`; its
main-image SHA-256 is
`877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e` and the
matching Octatrack 1.40C stock main-image SHA-256 is
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`. The
exact candidate profile is source revision
`5a15ac390dac2475df3fb3b2ef64154e174b4182`, package SHA-256
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`; every
cached compiled module source hash still matches, including `native.c` at
`a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e`.

The popup opener range `0x4006d94c–0x4006da78` and manager range
`0x4005829c–0x4005838e` match the saved stock hashes
`074e9597b38edd44ff8fc63828e8af9449ed99b531642fd902f48054bdb8c5ea` and
`47a83b2ab28f9f0badd741af517ada3f4cdc9ea45e1a0d0eadbaeabed669487b`.
The manager scans five slots; for each slot passing its close condition, it
clears the slot and calls its nonzero callback before moving to the next. The
opener registers its own close routine at `0x4006d754`, separately from the
five other observed initial callback entries below. Its local close subtree
was already bounded at 36 bytes in the existing popup-close report and was
rechecked against that report's code hash.

Five other callback entries are demonstrated by cached registration callers
and the corresponding initial pointer values in both exact main images:

- `0x40055de0` at confirmed manager caller `0x40058414`; code range ends at
  `0x40055e18`, SHA-256 `0be06b8c722ae983771f98eb86c63acdad1dfc2fd108ac02da244b715305b326`.
- `0x40055e18` at `0x4005857e`; range ends at `0x40055e70`, SHA-256
  `6cbf5ade336a3477a5aa89f75f3be8f3596baba21997bdfc867947f294e87382`.
- `0x40055e70` at `0x400586fc`; range ends at `0x40055e98`, SHA-256
  `52f8d1b1e236522ab9b4e476f4b046d2425e6b3767b46e539bf48680fccfbafe`.
- `0x40055e98` at `0x4005879c`; range ends at `0x40055ec0`, SHA-256
  `fe85e7b515b33f097112b47402c5b01cf4d6a97c4787f162f775d42f747d40da`.
- `0x40055ec0` at `0x400589bc`; range ends at `0x40055f16`, SHA-256
  `4efdb19f83e8ecad56f1e9f159ebf35f6fdff961863337df9e632b8cd178ccb0`.

These are five observed initial callback entries, not an exhaustive set of
runtime targets. A pinned ColdFire whole-image sweep decodes all 50 aligned
manager-call patterns as direct `JSR`s. In that sweep, each has six stack
argument writes before it and the next instruction consumes `D0`; 49 first
argument expressions resolve to initial code pointers (48 distinct addresses),
while one reads a runtime-derived pointer from an `A2`-relative object field.
These are local instruction-context checks, not rooted caller proofs. The
linear sweep can decode embedded data as instructions, so no candidate was
excluded as data-like and the 44 uncached sites remain unverified as reachable
callers. Computed or indirect manager calls are not enumerated, pointer cells
may change at runtime, and the live five-slot contents are unknown.

## Stack paths

The ranges for the common helper `0x40055db4–0x40055dde`, wrapper and leaf
`0x4003146c–0x40031494`, and zero-local leaf calls were rechecked against the
hashes in the existing popup-close report. Relative to a callback's entry SP,
the common helper path uses at most 20 bytes; the call through `0x4003146c`
uses 4 bytes for its argument, 4 for its return, and the audited 24-byte leaf,
for 32 bytes. Two callback bodies contain only these verified calls and
therefore have complete normal-return local bounds of 32 bytes each:
`0x40055e70` and `0x40055e98`.
These local bounds assume normal return and ABI-preserved stack pointers for
the verified helper and leaf callees.

The other three callbacks have only these known finite paths, not complete
upper bounds:

- `0x40055de0`: the rooted `0x40037d80` body returns at `0x40037da2`; the prior
  512-byte linear window continued past that return into adjacent routines.
  Its direct children are `0x4003146c`, `0x4007e81c`, and `0x4007e998`.
  `0x4007e81c` has a complete 16-byte local bound. `0x4007e998` reserves at
  most eight local bytes before calling a runtime table entry at index zero;
  the indirect target's stack and whether it can re-enter the manager remain
  unknown. That call target is 32 bytes below the `0x40055de0` callback-entry
  SP, or 160 bytes below popup-routine entry under the prior ABI assumptions.
- `0x40055e18`: its branch to `0x4004d948` reaches a 156-byte entry frame. The
  first five register calls through `A2` resolve to `0x40012bd8`; that helper
  has a complete 64-byte local bound, and its preceding `0x40012254` helper has
  a complete 40-byte local bound. This gives a finite 272-byte path from
  `0x4004d948` entry, 280 bytes from `0x40055e18` callback entry, or 408 bytes
  from popup-routine entry. Later paths in `0x4004d948` contain unresolved
  indirect calls, so 408 bytes is a known path, not a callback upper bound.
- `0x40055ec0`: its direct callee `0x400131c8` is now closed at four local
  bytes and has no nested call. The other direct callee `0x40048ff8` reaches
  eight unresolved `%a3@` calls in its rooted path. The two calls to
  `0x4003385c` tail-transfer through object fields; their initial image values
  point to `0x40055ff8` and `0x400565ac`, but runtime mutation is not ruled out.
  The first target has another unresolved indirect call and the second reaches
  `0x40048ff8`; neither path is fully bounded.

Before calling the manager, the opener leaves 12 bytes for one earlier call
and 8 for the next on the stack; there is no caller cleanup before the manager
call. Assuming those stock callees preserve the ABI stack pointer, those 20
bytes remain live during callback execution. From the popup routine's entry
SP, the previously reported callback paths are 160 bytes, or 164 for
`0x40055ec0`: 36 bytes for the opener frame, 20 earlier argument bytes, 24
for the manager's six arguments, 4 for the manager return, 40 for the manager
frame, 4 for the callback return, then the callback-local path above. The
follow-up adds a 408-byte known path through `0x40055e18` and the first
`0x40012bd8` call path. These are finite paths, not a complete opener bound.
All totals exclude the opener's incoming return and arguments, the caller
frame, interrupts and exceptions, and all unresolved callees. The callback-
local subtrees are complete only for `0x40055e70` and `0x40055e98`.
The previously bounded `0x4006d754` close subtree also reaches a finite
164-byte path from popup-routine entry under the same assumptions.

The manager processes slot callbacks sequentially, so their local depths do
not add together when each callback returns with its ABI stack pointer
restored. Re-entry through unresolved callees has not been ruled out. The
opener's separate new-window creation path and earlier direct callees are not
bounded here, so no complete popup-open high-water or overall task stack bound
follows from these figures. The results also depend on the exact unpatched
base ranges above; companion patches can invalidate them. Interrupt/exception
stack use, chip cycles, and complete pool memory remain unmeasured by this
analysis.

## Boundary and callback follow-up — 4 November 2026

The new private audit binds the whole-image decode to the exact stock and base
main hashes above, candidate source revision `5a15ac390dac2475df3fb3b2ef64154e174b4182`,
package `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`,
and unchanged `native.c` hash `a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e`.
The six-write setup and manager-call bytes for all 50 patterns match between
stock and reproduced base. The neighboring window for `0x40079206` differs at
`0x400791e6–0x400791ec`, though its setup and call bytes match. The exact base
proof lists no configured modules; this run therefore covers no companion
module patches. A separate range in the `0x4004d948` routine differs between
stock and base at `0x4004e1ea–0x4004e1f4`, so later callback paths remain tied
to the exact base image.

The rooted `0x400131c8` leaf contains one return and no calls or indirect
transfers, so that leaf cannot itself re-enter the manager. The apparent
`0x40048afc` self-call at `0x40048fd6` in the larger decode is not reachable
from the `0x40048ff8` callback root and is not counted as callback recursion.
The other unresolved indirect targets mean manager re-entry is neither proved
nor ruled out for the full callback set.

Selected range hashes below cover only the stated entry ranges; they do not
turn an unresolved routine prefix into a complete function bound.

| Range | SHA-256 | Scope |
| --- | --- | --- |
| `0x40037d80–0x40037da4` | `dfab14c3fbac7be1ed1a2990a04b312d539feecc18bd19f96a13f74c5b374fa9` | Rooted callback body through return |
| `0x4007e81c–0x4007e8d8` | `277024d31e86ccbf34e3740f834e0ef1e06fafe382a308cf4204a9e0926a657a` | Complete local helper |
| `0x4007e998–0x4007e9c2` | `1847af0526038ff8b7eb2989980aeba8361b2e96eec2ef20fa6a5e8b28731015` | Runtime-dispatch prefix through tail transfer |
| `0x4004d948–0x4004db2a` | `9c3fe9431b2dd2816ff75afe62c2ff1360a4ed793afdaef362f443d58af26ed0` | Entry and first five `A2` dispatches; stock/base equal |
| `0x40012254–0x40012368` | `e5183b8aa2ab4f2e36f337ba536da668b498e8e5650ca019eb16623d6fce7fdf` | Complete local helper |
| `0x40012bd8–0x40012db6` | `c67733c0d4e2be16885d7b71df4890f6e295107c61573736d808cf4e41ded7b5` | Complete local helper |
| `0x400131c8–0x400131f2` | `f587906cf593ec5aa990a82e49d5708ed25b4142b93ed8f2fadd84e9d1edd039` | Complete leaf |
| `0x4003385c–0x40033872` | `ea34b0d7e7c2564423ab8b5a2cc99053dd308c9097e11c5dcb388d8b800b8bab` | Indirect tail trampoline |
| `0x40048afc–0x40049300` | `25a1009c50eea08588eabd0791e49625bb02ec4292e78a6836764852cbadb7f2` | Rooted callback window with unresolved indirects |
| `0x40055ff8–0x4005603c` | `2743f5e362f356062a2f918742017ce017bb34d2a26334c20e44a988680e7920` | Initial trampoline target window |
| `0x400565ac–0x400565e2` | `a6449d67c4e8309cd48eb296dfba13606e39ccb018f3fb1ed6e29265609c8fa9` | Initial trampoline target window |

## Next offline closure step

The local ColdFire sweep is not a caller-root proof. Reaching publication-grade
closure requires recovered entry roots that establish instruction boundaries
through mixed code and data, all computed manager references, writes and aliases
for callback storage, and bounded callees on the exact companion-patched base.
Then prove whether the callback graph can re-enter the manager and account for
interrupt and exception stack use. The separate new-window creation path,
complete task stack, chip cycles and full memory remain open.

## Reproduction

Both analysis helpers and their JSON output stay in the private stock-bound
cache. Together they check the exact image and candidate source hashes,
documented code ranges, direct-call encodings, rooted callback paths and finite
stack arithmetic, while writing only aggregate metadata:

```sh
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_callback_audit.private.py --self-test
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_callback_audit.private.py
python3 -B /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_boundary_callee_audit.private.py --self-test
python3 -B /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_boundary_callee_audit.private.py
```

Both self-checks passed; the follow-up synthetic case verifies that a rooted
branch skips a data-like JSR pattern. The original normal run passed its exact-
image, source, range and callback inventory assertions; the follow-up normal
run passed exact-image, candidate-source, instruction-context, rooted-range
and stack assertions. Both wrote private JSON summaries beside the helpers.
The disassembly inputs were generated offline with the pinned ColdFire toolchain image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`;
all firmware and disassembly stay in the private cache.
