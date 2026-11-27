# FRACT performance iteration11 — 27 November 2026

Unpublished experimental source; full qualification and owner approval remain pending. Source baseline7c088d40 plus local module changes; submitted revision4ed908fa76a5fa93cc2f053242af4e39d80c0ccf is historical provenance.

Released-base package `f291ba64755853538d965a90eb467291b91a790672cbd1b6b50f6dfd98590e73` on base`24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`; normal development twin `70131adde2cb026f7fd5f7097391dfc7cece89cdc051eccca9ed97b2ad0b6a45` on base`46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`. Fresh native builds/reconstruction/strict scans pass:3copies,no fills. Resident extent67344bytes; max own callback stack632bytes, excluding base/stock/interrupt frames.

The original chunk validation and rendering body is shared in chunk.h. The native renderer inlines it; the external function remains a wrapper for other callers. No check was removed. Constants and known caller arguments can be folded without another function frame. The unused wrapper is pruned from the runtime.

Five private active-engine host contracts pass:2176native-render fixtures,2880split/pitched packets, owner/invalid-call lifecycle,32768direct chunk comparisons and64START fixtures. Initial private test attempts used the legacy include order with a current-engine flag and failed compilation; corrected active engine/START flags pass with assertions and frozen oracles unchanged.

Iteration10's fixed-SCAN failed-birth coalescing still matches the independent per-frame oracle in18880audio/full-state callback comparisons, including countdowns at/outside the call end and subsequent SIZE changes. The unchanged kernel retains235048QEMU span comparisons and the authored-half monotonicity test. The independently disassembled33indirect sites retain their caller/opcode/register sequence and reviewed targets. Own call-stack bound falls from696to632bytes. No CPU price40, allowance45, share80, source-kind or sound/control semantics changed.

No physical USB device was opened by offline build/parity checks. The separate hardware retest failed active4chUSB: baseline6811, first moving-control check6813(+2), through STOP and the whole trial6815(+4). Standard Undo returned normal generation20 with empty inventory. Earlier standalone passes do not qualify these bytes. Full format/companion matrix, listening and persistence remain pending.

Isolated Linux reproduction (immutable toolchain image3b40aa25…, network disabled, authored/shared source mounted read-only, no original firmware mounted) exactly matches the67,252-byte release package and all59 source-input hashes. Native original-OS strict verification remains separately PASS.
