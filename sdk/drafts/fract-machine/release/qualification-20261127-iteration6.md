# FRACT performance iteration6 — 27 November2026

Unpublished experimental source; release remains blocked pending current hardware qualification. Source baseline7c088d40 plus local module changes. Previous submitted revision4ed908fa76a5fa93cc2f053242af4e39d80c0ccf remains historical provenance.

Released0.8.2 package `49da3babcb91d781c6b8fcbeaa071c948780032734b9e0d3e28dad7f8418aea9` on base`24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`; private normal development twin `6ab2ee3d752ebe02042b7e4d2b7702722a6e59503457812b0f3e74d40456567c` on base`46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`. Both stock reconstruction/verifications pass. Resident memory63808bytes; max own callback stack696bytes, excluding base/stock/interrupt frames.

A paired loop caches the unchanged window coefficient until its segment changes. It applies to all33window shapes at steps>=0x280000, up to819frame windows; other spans retain the existing path. Odd-prefix and final-pair end checks prevent a coefficient read after the last consumed sample. The helper uses the existing saved register frame, including a6.

235048 QEMU spans, including218664 endpoint cases, preserve all audio, untouched accumulator words and saved registers in all four formats and both sample directions. The matrix includes every SHPE peak/switch and phase0/2^31 endpoints, and step boundaries. This checks semantics, not hardware timing. SIZE retiming preserves a grain's row and its existing click-free floor; neither was changed.

ADD.L to a data register supplies the fraction carry/borrow ([NXP ColdFire manual](https://www.nxp.com/docs/en/reference-manual/CFPRM.pdf)). No physical USB device was opened by offline build/parity checks. Hardware retest is separately labelled below. Previous normal development builds failed active4chUSB moving-control stress; no earlier result qualifies this package. Full format/companion matrix, listening and persistence remain pending.
