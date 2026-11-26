# FRACT 0.1.3-experimental qualification preparation

FRACT has been relinked against released base 0.8.1, identity
`eb6679620d0c9ed7ad277598fc0df185e767dfbd0e7eb99bb1518ade9df8a4f0`.
Normal package `c56e79076b170e76c53f46286a3d31aa8d8c51f9d52070836b1ca75fa37f8e29`
passes byte-exact reconstruction and both strict original-stock scans. Controls
use the SDK page helper, with SRNG as a two-value switch. The module remains
unlisted; there is no approved release or public package.

The base prerequisites #1418 and #1165 have merged. Current preparation and
remaining cases are recorded in [the dated run](qualification-20261125.md).
The [resource audit](resources.md) now names this exact build. Hardware timing,
stress, lifecycle, rendered UI and listening on it have not run. The
[10 November functional report](hardware-20261110.md), existing screenshots,
the original package6ff/base72 receipts and rows are retained in
`history/20261110/`. Current `candidate-proof.json` and prospective catalogue/package
rows name 0.1.3 and explicitly record hardware NOT_RUN; none is active or published.

The normal recipe still imports only `mw_stock_pool_open` at the reviewed run
origin. Base identity/hash are provenance and admission metadata; no digest
reader is compiled into FRACT. Nine guarded stock-copy references reconstruct
locally from the author's OS. No firmware, extracted code or built image is public.

## Before promotion

1. Use the [measurement kit](../qualification/README.md) to reproduce the normal
   package and a separately named probe for the exact running base. A development
   twin needs its own relinked packages; release-base packages cannot substitute.
2. Complete the fixed test procedure and change-specific cases, including all
   controls/screens, stock flows, neighbouring-machine Part reload, active
   replacement, exact Undo/inventory/Part restoration, MAIN/CUE dropouts and stress.
3. Measure idle/mean CPU, both DSPs, installation and supported-instance costs,
   admission under empty/medium load and worst render/block against the shared
   frame guard. FRACT supports one owner; do not claim a four-instance curve.
   Retain raw records and current source stamps; performance fields remain null.
4. Have the author perform listening, exact-version Keep and physical reboot
   checks after agent stage 1 passes. Earlier reports do not qualify this build.
5. Obtain the owner's first-release decision and any explicitly required waiver;
   then move sources to sdk/octatrack/modules, activate current catalogue/package
   rows, reproduce final bytes and finish doctor/pr:ready and release checks.

A preparation PR is not release approval. The author owns the remaining hardware
session; the owner's review follows its evidence, not another base waiting period.
