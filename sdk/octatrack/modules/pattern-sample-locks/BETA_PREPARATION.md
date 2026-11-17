# Local beta preparation — 30 October 2026

The current 0.1.8 runtime remains unchanged. This is a local audit and private
candidate, **not a public-beta qualification or publication request**. Nothing
from this follow-up has been pushed or loaded onto a physical instrument.

## Exact candidate

The initial audit's public package wrapper built and rebuilt the literal package:
`28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d`.
It is 9,652 bytes on disk, with 8,748 initialized bytes, 1,328 BSS bytes,
167 relocations, four UI callbacks and three guarded Part Edit openers. Its
unit title is SAMPLE LOCKS; the existing `unitName` mechanism supplies that
short title. No shared-builder change is needed.

Fresh GCC 16.2.0 MCF54455 C compilation and the committed assembly produce the
same linked image, BSS allocation and relocations. The instruction guard passes.
The module-owned initialized image plus BSS is 10,076 bytes. This number excludes
stack, loader bookkeeping/alignment and shared stock allocations.

The public wrapper is exercised in a disposable private copy of the SDK, with a
single candidate catalogue row. The real draft stays under `sdk/drafts/` and no
generated catalogue, qualification record or public artifact is changed.

## CPU and stack audit

The source bounds an operation to eight tracks and 64 steps: 512 changed SAMPLE
fields, 1,024 working/mirror byte writes, 64 short publication guards, and up to
15,872 other-parameter reads for Clear. Native refresh is called once globally
and at most eight times for changed tracks. No deferred cleanup or batching was
added. These are work limits, **not physical cycle counts**.

Compiler stack-usage and call-graph output give these conservative sums for
authored functions, adding four bytes per internal call for the return word:

| Entry | Authored stack bytes | Deepest authored path |
| --- | ---: | --- |
| Key | 500 | key → commit → validate → source validation (ties the native-source path) |
| Draw | 296 | draw → native Part menu → box → pixel |
| Encoder | 44 | encoder → move → set cursor |
| Menu opener | 40 | opener → popup inspection |
| Tick | 16 | tick → context inspection |

All 33 emitted authored frames are static or compiler-bounded; the authored call
graph has no recursive path. Stock font/popup/refresh calls are indirect edges
outside this calculation. The caller's stack and permitted interrupt nesting
are also additional. Therefore 500 bytes is **not a total-stack bound**. Stock
callee bounds, actual task-stack capacity/headroom, interrupt nesting and physical
timing remain unqualified. No stack canary result is claimed.

The exact authored publication loop has an instruction-count bound of 87:
one mask raise, three setup instructions, nine instructions for each of at most
eight edits, ten finishing instructions and one mask restore. There are no
calls in that span. This agrees with the scheduling trace, but memory wait
states and hardware execution cycles are still unknown.

The existing [scheduling experiment](SCHEDULING_TEST.md) supplies useful local
observations: maximum Clear's task guard was about 1.60 model ms, the longest
fully masked span was 87 instructions, DMA/frame work continued, and scheduler
dispatch resumed afterward. Its model times are not silicon WCET or audible
playback evidence. A pending-sequencer latency bound remains untested.

## Package and integration results

The private browser harness uses the production USB module-set preflight and
ColdFire object/linker code. It changes only an in-memory catalogue fixture.
The machine-readable receipt distinguishes those component checks from a full
native stock-only card comparison.

The initial audit established these packaging/integration gaps:

1. **The original literal package failed the stock-byte scans.** The initial
   build and `--check` both exited 1 although the rebuilt package was identical.
   Its weighted scan finds matches up to 14 nonzero bytes (limit 12); its other
   scan finds one 16-byte match at package offset `0xef4`. That offset lies in
   the authored encoder routine, six bytes after its entry. Fresh compilation
   of the existing MIT C reproduces the bytes. The subsequent
   [scanner investigation](SCANNER_INVESTIGATION.md) independently reproduces
   the prologue and remainder matches and classifies all hits, including menu
   text. No scanner bug is established. The existing reviewed reconstruction
   mechanism supplied the packaging route. A subsequent
   [private reconstruction candidate](RECONSTRUCTION.md)
   preserves the exact runtime and passes both unchanged scans. The ordinary
   public wrapper initially built the rejecting reference. The subsequent local
   host integration now builds and checks the exact passing package through the
   normal CLI in a private catalogue fixture, with five rejection probes. See
   [the current method and results](RECONSTRUCTION.md#normal-package-path--31-october-2026).
   Real catalogue admission and release review remain pending.
2. **Stock-only card UI integration is unfinished and deferred.** `runtime.json` supplies
   four core callbacks through the USB base. The native manifest declares only
   the three menu openers; the card package compiler does not consume those
   runtime subscriptions. GNU/browser object-link agreement alone cannot prove
   a working card UI. No complete card composition or card hardware pass is
   claimed. On 31 October the author selected a USB-only first beta. The private
   candidate now declares `usbOnly: true`; production library/card refusal and
   compiler inventory checks exercise that scope. First-release review must
   approve it; no card qualification is implied. See [USB beta scope](USB_BETA.md).

The production USB preflight accepts standalone add and removal/Undo on all
seven current base identities. It also preflights all 29 packages (the 28
published packages plus this private candidate); adding the candidate beside an
existing companion selection creates one change. Runtime inventory mapping,
old-ABI/site-capacity rejection before fetching, and corrupted-package rejection
pass. These checks send nothing to an instrument and do not exercise simultaneous
runtime companion load.

For the card-linker component, GNU and the production browser linker agree on
all 8,748 loaded bytes, every exported symbol and the BSS end at three addresses:
`0x41000000`, `0x41003080` and `0x42000000`. This establishes relocation/linker
agreement for this object, not a complete native card build.

Planner/UI and production native-writer sanitizer regressions pass; the three
existing package/linker test files pass all 91 tests. The stock-free
[combined receipt](evidence/beta-preparation-local-20261030.json) records the
inputs, outcomes and unresolved items.

`module:doctor -- --draft pattern-sample-locks` still rejects publication:
qualification, catalogue/packages, native comparison, declaration table and
package fingerprint are incomplete. Manifest/category/UI claims and declared
cross-compatibility pass. Those passes establish declarations, not runtime
compatibility under every companion load.

## Reproduce

In the pinned source-tools container, mount the checkout read-only at `/work`,
the verified Elekloader checkout at `/upstream`, and a private writable directory
outside Git at `/private-out`. With private stock and reference package inputs:

```sh
python3 -B sdk/drafts/pattern-sample-locks/prepare_beta_candidate.py \
  --out /private-out/beta-preparation-new \
  --upstream /upstream --stock /private-out/stock/original-1.40C.bin \
  --reference-package /private-out/v018/pattern-sample-locks-v018.mwrm
```

The helper completes an audit even when the public stock scans reject the
candidate; inspect `releaseReady`, scan status and both builder exit codes in
`preparation.json`. It must still fail if source/assembly or reference package
bytes differ. Private output retains compiler frames/call graph, GNU link
oracles, candidate manifest, binary and full builder rejection log.

Then use Node 24 and the checkout's installed dependencies:

```sh
node sdk/drafts/pattern-sample-locks/beta_package_parity.mjs \
  /absolute/private/beta-preparation-new
```

The browser receipt is written to that private directory. Firmware, linked
objects, binaries and raw private logs stay outside Git. Stock-free receipts
and the [future MKII checklist](MKII_BETA_CHECKLIST.md) are retained here for
review. An MKII listening run cannot substitute for the unresolved software,
cycle and stack qualification above.
