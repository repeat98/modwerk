# FRACT 0.1.5 iteration2 offline proof — 27 November 2026

Released-base package `a173c1ef4c85974aa02631771558fb52b02956d19001651f22edbe1e08afbd9f`,
base `24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`. Source provenance baseline
`4ed908fa76a5fa93cc2f053242af4e39d80c0ccf`; current working changes are separately captured
in the reviewed reconstruction receipt. Native image bytes52332,
BSS636, package53756. Both unchanged strict stock-free
scanners and original1.40C reconstruction pass. The5 reconstruction references
remain guarded; no firmware bytes or built package are distributed.

No physical USB device was opened by the offline builder, scans or resource
audit. Separate targeted hardware diagnostics have their own report. This
released-base package is physically untested; development twin package
`011ced3dd2d06ef6c89c905737d12e9b2750480ffaee7e481ef5d28a4d07ade8` on `46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`
is a different installable package. No transfer of earlier hardware results.

Current strict audit: 53,744 resident bytes, 107,488 for two
retained copies, 696 own callback stack bytes. All33 indirect call sites
retain the same source functions/registers and reviewed targets at their new
addresses. Assembly frames48/56 and short helper0+returnPC are unchanged.
Stock/base frames, task/interrupt nesting and CPU-cycle bounds remain excluded.

The short-Hann loop uses scaled addressing and the multiplier's low word
directly; two instructions per sample are removed.16,384 QEMU spans across
four formats and two directions preserve exact audio/guard words and saved
registers. This proves instruction semantics, not hardware speed. For minimum
SIZE441, a16-sample span changes457→425 executed instructions in one named
trace; other tested fallback lengths are unchanged. Grain birth reduces
coordinates before wrapping and skips divisions when the dividend is bounded;
all55 host tests ran,51 passed and4 historical tests skipped.

Prior a320/ee634 receipts remain in history/20261127-a320. They do not qualify
this iteration. CPUprice40, one T1–T4 owner and the base frame guard are unchanged.
