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
runtime targets. An aligned whole-image scan found 50 candidate direct-call
opcode patterns to the manager; six caller bodies are present in the private
disassembly cache, and 44 candidates remain unverified. The scan can include
data that resembles instructions and cannot find computed or indirect calls.
The five pointer cells may also be changed at runtime. The live five-slot
contents and any companion-module patches are outside this result.

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

- `0x40055de0`: 32 bytes through the verified leaf path; conditional callee
  `0x40037d80` remains unbounded.
- `0x40055e18`: 32 bytes through the verified leaf path; conditional callee
  `0x4004d948` remains unbounded.
- `0x40055ec0`: 36 bytes through the verified leaf path, including its saved
  register; direct callees `0x40048ff8` and `0x400131c8` remain unbounded. Its
  two register-indirect calls resolve to `0x4003385c`, whose body is not in the
  audited cache.

Before calling the manager, the opener leaves 12 bytes for one earlier call
and 8 for the next on the stack; there is no caller cleanup before the manager
call. Assuming those stock callees preserve the ABI stack pointer, those 20
bytes remain live during callback execution. From the popup routine's entry
SP, each known callback path is therefore 160 bytes, or 164 for
`0x40055ec0`: 36 bytes for the opener frame, 20 earlier argument bytes, 24
for the manager's six arguments, 4 for the manager return, 40 for the manager
frame, 4 for the callback return, then the callback-local path above. This
excludes the opener's incoming return and arguments, the caller frame,
interrupts and exceptions, and all unresolved callees. These path totals are
complete only for the callback-local subtrees at `0x40055e70` and
`0x40055e98`; they are finite known paths for the other three.
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

## Next offline closure step

Use an instruction-boundary-aware disassembler against the same hash-verified
main image to validate the 44 uncached candidate call patterns, find computed
references to the manager, and recover argument six at each real callsite.
Then locate writes to those callback cells, range-hash each reachable target,
and bound every direct or register-indirect callee through return. A closed
stack bound also needs a proof that the callbacks cannot re-enter the manager,
plus separate interrupt and exception stack accounting.

## Reproduction

The analysis helper and its JSON output stay in the private stock-bound cache.
It checks the exact image hashes, candidate source hashes, documented code
hashes, callback call targets, and full-image direct-call opcode scan, while
writing only aggregate metadata:

```sh
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_callback_audit.private.py --self-test
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/popup_callback_audit.private.py
```

The self-check passed for both call encodings, rejection of a mismatched range,
the five callback bodies, and the finite-path arithmetic. The second command
also passed all exact-image and cached-range assertions and wrote
`popup-callback-audit.private.json` beside the private helper.
