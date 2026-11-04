# High-load input/paste reproduction audit — 5 November 2026

This stock-free audit compares the exact hardware report with the earlier
no-module emulator reproduction. No emulator was run and no physical hardware
was accessed; replaying the old split-report case would only repeat the held-key
signature, not test the STOP/paste or pattern-data claim.

## Exact bindings and existing results

- High-load candidate: source revision `5a15ac390dac2475df3fb3b2ef64154e174b4182`,
  native-source inventory SHA-256
  `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`, and
  10,048-byte package SHA-256
  `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- High-load development base identity:
  `20ed79108facb38d72b1e21105a3fd598bc45b76da39e667d6ad1c9b9a67410e`.
- High-load module-set SHA-256:
  `8ff2effb1c839ea2016eb6cf13fa6973321f75cf96e6667fc52ed06f070670f7`;
  it included Sample Locks and the three named companion packages.
- The no-module isolation emulator used that same base configuration, image
  SHA-256 `8ede9cf9d702f93acbbfede4ade157c11abf7a18d6ddab0000ab68b48a84fb3f`,
  and emulator SHA-256
  `b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363`;
  its private helper SHA-256 was
  `c14e3b37f19242352dd4fc7d3eb0fa70b91cb1b03843b2b6156525e99b9adb46`.
  The empty module inventory was checked over USB.

The [hardware receipt](mkii-companion-load-20261031.json) records the author
report that physical STOP displayed a paste message. At the later readback,
Sample Locks was closed, no native popup or consumed-key mask remained, TRIG5–7
were held, and FUNC's row state was clear. A02 initially lacked five SAMPLE
fields and then six; the other patterns/bytes and working Parts matched. A
native Lock restored six fields, but this did not identify the cause.

The [no-module isolation receipt](input-isolation-emulator-20261031.json)
confirms these different outcomes with DSP disabled: a complete fader report
followed by FUNC down/up left key rows clear; inserting FUNC down between the
fader header and value 112 left row value 112 (TRIG5–7) after FUNC release;
inserting FUNC up at that boundary while FUNC was held left a `0x20` held bit
and stock FUNC state `2`. The reported result is a base input-framing bug
independent of Sample Locks. The emulator transport did not advance; it
produced no STOP, paste message, or pattern/SAMPLE mutation.

## Available and missing incident data

The private cache retains the pre-run A02 pattern (`36,568` bytes,
SHA-256 `a8cd36492baa5f26013b4ba848ad13e6a04d14c64a0949d7284e52c34f721582`)
and the post-recovery A02 snapshot with the same hash. The post-recovery record
reports zero differences for all four patterns. The failed attempt records a
pattern assertion with a partial/truncated byte diff; the subsequent recovery
receipt records `MISSING_SAMPLE_FIELDS: 6` and then the harness's incorrect
`6 !== 64` guard-count assertion. It does not preserve the full damaged A02
bytes or a complete list of the six changed fields and their mirrors.

The high-load receipt records the saved-Part and user FX snapshot identities
only as hashes (`66b31cec3813860cbda99ca783bd9cdd99367ba534d79bc8350f21b296192f67`
and `dd0525adcdb700c5552f779cf30ac81f32e9b0817f8dce8509f56cd2894519b6`), not
as complete raw Part blocks. Its prepared pattern dumps can seed pattern data,
but the examined cache does not prove a full emulator card with the exact
high-load working/saved Parts, FX assignments and reported LFO state. The
available no-module emulator image is an isolated audio-fixture copy;
equivalence of its Part state to the high-load hardware setup is not recorded.

No contemporaneous physical key transcript, raw fader UART report bytes,
byte-level arrival times, or event timestamps relating remote USB KEY requests
to physical input are recorded. The STOP/paste display is an author report, not
a saved LCD capture. Host harness receipts log their own remote actions, not the
physical panel sequence. Therefore the original event cannot be replayed
deterministically from the current evidence, and the exact six fields cannot be
checked against a captured damaged-state image.

## Safe paired follow-up

Before replay, preserve a private incident transcript with (1) each physical
FUNC, PATTERN, TRIG and STOP down/up event plus hold duration and active pattern;
(2) raw fader report bytes with header/value boundaries; (3) every remote USB
KEY request and monotonic timestamp; (4) the observed LCD/paste message; and
(5) passive pre-event and immediate post-event reads of all four complete
patterns, active lock-index bytes and working/saved Part hashes, plus raw
canonical-mirror bytes if the emulator exposes them. Capture the damaged state
before any Lock/Clear recovery. Do not infer missing events from the final
held-key rows.

Then make two disposable emulator copies from one verified seed of the same
base, A01–A04 fixture, and exact high-load Part state: Sample Locks absent
versus the exact candidate package above. Keep the three companion packages,
FX/LFO assignments, transport and remaining load identical; the existing
empty-inventory interleaving result remains a separate base-only control. Enable
DSP so transport and native paste behavior can run, and replay only the
captured event order/timing. Read keys, FUNC, popup/overlay state, transport,
full pattern bytes, lock-index state, any exposed raw mirror and Part hashes
before recovery; do not save the project or use module actions to repair a copy.

An identical paste/data delta in both copies would support a base/input cause;
a delta only with the candidate would show a module interaction; no matching
delta would mean the event was not reproduced. These outcomes would still be
emulator evidence, not a physical occurrence rate or hardware qualification.
Until the event transcript and damaged-state snapshot exist, the smallest safe
next step is to obtain those records or a fresh, explicitly authorized
disposable-project reproduction; no synthetic key sequence is an acceptable
substitute.
