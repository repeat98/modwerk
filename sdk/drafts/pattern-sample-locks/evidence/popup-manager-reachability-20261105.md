# Popup manager rooted-reachability pass — 5 November 2026

This stock-free record reports address-only control-flow results and code-range
hashes. Firmware, extracted bytes, disassembly, callback tables and memory dumps
remain in the ignored private cache. No hardware was accessed.

## Exact inputs and source binding

The candidate worktree was at `c7b3efe905762805c67b98e59383e8c174e1198a`
before this documentation update. The candidate package remains bound to
SHA-256 `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`;
`native.c` is `a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e`,
the native-source inventory fingerprint is
`7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`, and
`unit.s` is `837e44f48fa137444e14755d96011731c8fde29a73fa877ffc35edac3510473f`.

The reproduced base identity is
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`;
base `MAIN.raw` SHA-256 is
`877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e` and
Octatrack 1.40C stock main SHA-256 is
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
The hash-verified base proof has no companion modules. Its `proofs.json` and
`symbols.json` hashes are, respectively,
`6a24032c96f8fa8df51cb9187f09145ab7669d5fbdc08c2891086c55f806327c` and
`9625f77fdfbc23f85a1d3a740cedb0e9693d324ec0c8b8c1bcd697ab3c6dcd64`.

## Method and classification

A private helper first confirms the exact main-image hashes and the existing
50 aligned direct `JSR` byte patterns. It then decodes each basic block afresh
from an explicit code address with the pinned offline image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`.
The roots are named base entry/event symbols, the previously reconstructed
system-task entry and its 43 range-checked destinations, the module popup
opener, five previously observed initial callback pointers and the three new
targets bound below. Direct in-image calls and their possible return
fallthrough are followed, along with both conditional outcomes and direct
jumps. Out-of-image direct targets are recorded; indirect calls/tails stay
open. A synthetic self-check confirms that an unconditional branch skips a
data-like `JSR` byte pattern.

Of the 42 remaining byte patterns (the earlier six caller bodies plus two
locally decoded but externally unrooted bodies are excluded), three are now
decoded at valid instruction boundaries on a rooted normal path. Each has six
stack argument writes in the same rooted block, and its first push is a direct
PC-relative code address. The argument setup, call and following instruction
range is identical in stock and base:

| Manager call | Root class | Initial argument-six target | Verified range | SHA-256 |
| --- | --- | --- | --- | --- |
| `0x4005938c` | Range-checked system-task dispatch destination | `0x40056644` | `0x40059378–0x40059396` | `b00cf7e9ef7b82b41d2664f2a81cfd8f07497aa2133c8e68d7e997df15b1f77a` |
| `0x4005a2fa` | Range-checked system-task dispatch destination | `0x40056bec` | `0x4005a2e2–0x4005a304` | `1a1a6cdd8588d9b3f6fd0258bbbf75f75c8bd1c64cd25f5219b037870e9dde77` |
| `0x400801a0` | Range-checked system-task dispatch destination | `0x4007f67c` | `0x4008018c–0x400801ac` | `32c7a3fff4fee8d30b54f9fa6fa3d3d33de386efa73755fa2d3829c316a60f16` |

The remaining 39 patterns were not reached from those direct roots:

`0x40024e8a`, `0x4002d35e`, `0x4002e730`, `0x4002fef4`, `0x40058b66`,
`0x40058bdc`, `0x40058d9a`, `0x40058df2`, `0x40058e4c`, `0x40059286`,
`0x400592c4`, `0x4005951a`, `0x400596ae`, `0x4005984c`, `0x400599fe`,
`0x40059b8e`, `0x40059d16`, `0x40059db0`, `0x40059f0c`, `0x40059f54`,
`0x40059fe0`, `0x4005a11c`, `0x4005a1c4`, `0x400647be`, `0x40064c56`,
`0x4006b168`, `0x4006ce2c`, `0x4006e19e`, `0x40079206`, `0x40079cb4`,
`0x4007c06e`, `0x4007c3b0`, `0x4007d35a`, `0x4007e718`, `0x400804a0`,
`0x400808f0`, `0x40080eb2`, `0x4008186e`, `0x4008336e`.

None of the three reached candidates overlaps a different instruction; all
three decode as manager calls. The other 39 are unclassified byte matches, so
the pass neither establishes nor rules out false positives among them. They
may be unrooted code or embedded data, and no argument-six targets are
recovered for them.

## Open edges and next closure input

The completed traversal decoded 6,887 blocks and 32,527 instruction starts. It
encountered 794 unresolved indirect transfers and 23 direct transfers outside
the main image; these counts cover the full root set and are not popup-only
counts. One `core_up` path enters a zero-filled tail that has no decoded
instruction row. The previously documented dispatch table at
`0x460e762c + 14 × index` remains outside both hashed main images. Five-slot
callback state, all writes and aliases to its storage, indirect manager calls,
and whether callbacks re-enter through unresolved callees remain unknown.

The smallest missing closure input is the exact stock window-dispatch and
callback-storage contract, including the current five slot values and the
complete writer/alias set for their runtime storage. A hash-bound
owner source/ABI description or owner-supplied read-only snapshot of those
specific runtime cells would make the next offline target-set pass feasible;
this analysis did not access the instrument. Any companion-profile result also
needs that profile's exact patch set and image hashes. The three new initial
targets are not stack upper bounds, and neither overall popup stack demand nor
manager re-entry is closed.

## Reproduction

The helper, tool output and input images stay in the private cache. The helper
self-check passed both on the host and inside the pinned container; its normal
run completed without hitting the 10,000-block budget. With those hash-verified
cache inputs present:

```sh
CACHE=/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/stock-bound-20261104
BASE=/Users/weiyun.wang/.cache/psl-current-base-workspace/current
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e HOME=/tmp --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  -v "$CACHE:/cache:rw" -v "$BASE:/base:ro" \
  sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792 \
  python3 /cache/popup_rooted_reachability.private.py --self-test
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e HOME=/tmp --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  -v "$CACHE:/cache:rw" -v "$BASE:/base:ro" \
  sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792 \
  python3 /cache/popup_rooted_reachability.private.py --max-blocks 10000
```
