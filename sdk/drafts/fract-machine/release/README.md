# FRACT 0.1.2-experimental release preparation

This unlisted USB-only candidate consumes the merged source-runtime adapter
(PR1274). No base firmware, active catalogue row or shared SDK code changes.
`catalog-entry.json` and `package-entry.json` are prospective release rows.
The package row sets `base: true` so `--base-only` rebuilds it, and declares
`requiredBase: 72defb09b9d463fe62ab876f350f442d10e32ec23e55918a22b9b756c5cb3da6`; its bytes/hash match
`candidate-proof.json`. The site must admit that base before installation.

The recipe pins only `mw_stock_pool_open` and the fixed run origin. Identity,
package hash and export addresses come from the committed base. No base IDs or
base-memory digest reader are compiled into FRACT. The legacy readiness entry
now returns ready because package selection performs admission. Rebuilding a
compatible base relinks the proven import word using the same reconstruction
recipe. Tests exercise the actual full machine under a synthetic base change.

The reviewed reconstruction has nine bounded stock-copy references, one proven
import word, no firmware bytes, and passes byte-exact reconstruction and both
unchanged strict scans locally. Resident extent is 31,424 bytes and the own
callback stack bound is 712 bytes. The [hardware report](hardware-20261110.md)
records this exact candidate's functional checks, including physical reboot and
USB restoration readback. Exact-package full-emulator START/three-head/retrigger
and UI capture checks also pass; hardware timing/stress qualification remains
pending. Earlier package54ca observations remain in
`history/20261106/` and the historical section of TESTING.md.

## Before promotion

1. Finish software checks and review for the migrated candidate.
2. Retain the completed named-build functional hardware report. Finish untested
   stock flows, companion/stress and active replacement cases required for
   qualification; do not transfer package6ff/base72 evidence to other builds.
3. Supply the named-build performance record: worst own render/block versus
   budget, matched native-FLEX frame/idle comparison, audio stress. Nulls have
   reasons; the owner's first-release waiver decision is pending.
4. Retain the current screenshots and provenance in `media/`; finish
   stock-flow/companion evidence and the qualification record, retaining every
   untested case and reload incident.
5. After qualification, move sources to sdk/octabam/modules, activate catalogue
   and package rows and community release notes, reproduce the final bytes,
   run doctor/pr:ready and isolated release builds, and obtain owner's approval.

A draft preparation PR is not the listed release or approval. Do not activate
or advertise a public download until those prerequisites are met.
