# FRACT performance iteration10 — 27 November 2026

Unpublished experimental source; full qualification and owner release approval remain pending. Baseline7c088d40 plus local module changes; submitted revision4ed908fa76a5fa93cc2f053242af4e39d80c0ccf is historical provenance.

Released-base package `bd1f581bba63166bf07620a541ab3d646612ed8140e472e5fac381bb42d2bb01` on base`24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`; private normal development twin `abc589e372e4d5af70d9b8371ee1c9619eda17f00aaeb6149b9f35be5080a73d` on base`46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`. Both fresh reconstructions/strict scans pass,5copies/no fills. Resident extent67376bytes; max own callback stack696bytes, excluding stock/base/interrupt frames.

The kernel retains iteration9's exact constant-window paths and235048QEMU span comparisons. A module-specific host test verifies every authored window half is monotone. No approximate interpolation, control/sound redesign or CPU guard change was introduced.

With fixed SCAN, a scheduled launch while all three readers are occupied only returns the earliest retirement. Coalescing that failed event avoids a needless mix split. It applies strictly inside the current call: a launch at or beyond its end retains the original countdown before the next SIZE edit. Actual launches, random states, source clocks and row floors remain unchanged. An independent frozen per-frame scalar oracle matches audio and the complete128byte state in18880callback comparisons across four formats, rapid SIZE changes,13countdown boundaries and10call lengths.

The exact33-site call graph was re-read after compiler register allocation changed two og_locate calls; targets and frames remain bounded. Hardware retest is separately labelled. No physical USB device was opened by offline build/parity checks. Previous normal twins failed active4chUSB stress; their results do not qualify this package. Full format/companion matrix, listening and persistence remain pending.
