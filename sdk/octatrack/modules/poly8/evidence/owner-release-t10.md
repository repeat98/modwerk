# POLY8 0.2.6-experimental owner release — 9 October 2026

## Actual hardware report

The owner (`repeat98`) tested the delivered `POLY8T10.bin` on their Octatrack MKII and reported: “works like a charm. let's release”. This is a functional report. Duration, individual recording/stress cases, track counts and separate Part/project/reboot checks were not reported. No chip wall-clock timing, complete memory bound or hardware canary measurement is claimed.

- Native source SHA-256: `a32ed194a288c8847ad0ba110e8bca3bf266ada2227772ef813623b32a21421d`.
- Source revision containing the tested source: `e141d29861088a3816965676a2e6109f512ca10b` (subsequently rebased unchanged onto current main).
- MAIN SHA-256: `0271c801ad8b77cd5890d112f72e4a14438520138dc3b587624e703f1950248e`.
- Delivered update SHA-256: `c867f0a2a6c2b47af463afd7afbcaff7984c1975379e3829df24d3213dc9fd79`.
- Test configuration: POLY8 only, core logger enabled, dynamic DSP loader disabled, stock 1.40C DSP uploads unchanged.

The reviewer verified the report directly in this owner conversation after delivery of this exact private image. Software evidence and exact image identities are in [selection-flow-t10.md](selection-flow-t10.md). Hardware success is reported, not a measured maximum-load pass.

## Exact owner exception

The owner was asked whether to publish the exact T10 source as 0.2.6-experimental with chip worst-case timing, complete memory-bound qualification and separately reported Part/project/reboot tests waived. The question explicitly stated that the functional MKII result would be retained and missing tests would remain unverified. The owner answered: “Approve this scoped experimental release”.

`sdk/poly8-build-approval.json` binds this new exception only to 0.2.6-experimental and the native source above. `current-build-hardware` covers the missing detailed current-image benchmark/flood and persistence evidence, not the actual functional result. `chip-worst-case-cycles` and `complete-memory-bounds` retain their unmeasured limits. Documentation, licensing, native/browser composition parity, release checks and owner review remain required.

## Historical 0.2.5 approval

On 8 October 2026 the owner answered “Approve this scoped experimental release” for 0.2.5-experimental, with current-build hardware, chip worst-case timing and complete memory-bound qualification waived. Its native source was `9f8920b2c518b569ba5d7e67f8be38a0b15ede7ab8a100392e848c86c700e43b`. That earlier exception does not cover this release. The original approval is retained in Git history; historical evidence keeps its original identities.
