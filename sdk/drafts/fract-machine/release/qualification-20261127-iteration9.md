# FRACT performance iteration9 — 27 November 2026

Unpublished experimental source; full qualification and owner release approval remain pending. Local baseline7c088d40 plus module changes; submitted revision4ed908fa76a5fa93cc2f053242af4e39d80c0ccf remains historical provenance.

Released-base package `66f8a8404531461fbc1c91cf75e61e07e3540166b1df1cb77163dc8510aae272` on base`24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`. Private normal development twin `80f7430a4373254258e635c0bdc3488bec32f919c17c8cf34a49bc37a72f722a` on base`46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`. Fresh stock reconstruction/strict verification pass for both,5copies/no fills. Memory67392resident bytes;696own callback stack bytes (excludes base/stock/interrupt frames).

The kernel caches coefficients in short windows, uses a constant-gain loop for flat segments, and skips interpolation for a whole short span when the two endpoint coefficient pairs prove it constant. That shortcut is restricted to the authored SHPE table and relies on each window half being monotone. A new host test checks every authored half; native QEMU235048spans cover all33shapes, all four PCM formats, both sample directions, endpoint phases and step boundaries. Audio, untouched accumulator words and saved registers are identical.

A private instrumented development build found a138.99us inclusive peak:54.92us mixing,21.69us native FLEX, source16frames in one grain call/output16, all three latched heads at SHPE28. This shape has100constant segments of128. The instruction/access model reduces a16frame SHPE28 case by roughly34.5%; this is not hardware timing. No sound, SIZE floors, control meaning, CPU price40, allowance45 or guard share80 changed.

No physical USB device was opened by offline build/parity checks. The separately labelled normal development hardware retest is running. Previous normal builds failed active four-channel USB stress and their failures remain recorded. Instrumented probes are diagnostic and introduced additional overhead; they do not qualify a release. Full format/companion matrix, listening and persistence remain pending.
