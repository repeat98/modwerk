# FRACT current-base preparation — 25–26 November 2026

Unlisted 0.1.3, released main `2a1bfa6de9d2ab5f1d268d8c19a4669b6a517cce`, base 0.8.1
`eb6679620d0c9ed7ad277598fc0df185e767dfbd0e7eb99bb1518ade9df8a4f0`.
Normal package SHA-256 `c56e79076b170e76c53f46286a3d31aa8d8c51f9d52070836b1ca75fa37f8e29`.
Native module units are at `4ed908fa76a5fa93cc2f053242af4e39d80c0ccf`;
qualification tooling and records were updated afterwards. Main8fa955d1 was
merged during preparation; its host-only fixes do not change this released base.
The author will connect the instrument later. No physical USB device was opened,
no RAM boot/Keep/flash or project edit was performed during offline preparation.

## Software observations

- Normal source build reproduces on the native GCC 16.2.0 toolchain and the
  isolated Linux GCC 16.2.0 toolchain. Both strict original-stock scans pass.
- A separately named private probe passes both scans; executable sections of all
  eleven original units match the normal package. Timer/call overhead remains.
- Counter addresses come from the guarded original-stock base link, including
  collections and actual section alignment, with explicit paired base/package
  hashes. Host tests reject incomplete pins, wrong trees, odd/out-of-bounds offsets,
  invalid alignment and stale link addresses. GCC emits one volatile longword
  load for the base's word-aligned frame counter.
- Host control assertions check SRNG's SWITCH and POS's KNOB descriptors. PCM and
  state tests exercise the real engine. They do not prove rendered UI or sound.
- The current resource audit counts 31,824 resident bytes and 712 own callback
  stack bytes; neither is a timing or total-stack claim.
- The adapted native emulator builds; EMAC/peripheral tests pass. Its original
  stock RTOS gate matches the unadapted gate byte for byte, including its serial
  negative control. A 20-second normal-package trial on twin4c7eb79b/packagee6dc7f57 passed
  with no logged crash, stall, freeze or skipped track and rolled back. The
  subsequent 120-second shared-session UI trial selected FRACT on T1 and toggled SRNG with
  encoder C. [MAIN](../media/qualification-20261125-main.png),
  [FULL](../media/qualification-20261125-full.png) and
  [LOCAL](../media/qualification-20261125-local.png) captures and
  [provenance](../media/qualification-20261125.json) are retained. No sample was
  loaded, so this does not establish playback/audio performance. Both trials
  rolled back; final inventory was empty, matching the start. The UI trial
  left T1 on stock FLEX before Undo; no saved Part restoration is claimed. An initial
  generic rehearsal attempt enumerated an already shared bridge and was refused
  before submission; the direct shared-session trial above used no re-enumeration.

## Change-specific cases

| Case | Check | Status |
| --- | --- | --- |
| Shared page descriptors | SRNG two values, POS 128, native PTCH fields | Host assertions pass; emulator MAIN and FULL/LOCAL switch renders pass; hardware pending |
| Grain engine | PCM, reverse, endpoints, chunking, state | Host suite passes; listening pending |
| Current-base probe | Exact normal reproduction, two scans, all 11 units unchanged, linked read addresses | Pass offline; hardware cadence pending |
| Native FLEX ↔ FRACT | Same sample/pitch/tempo/pattern/page, repeated windows | Not run on hardware |
| Owner limits | One FRACT on T1–T4; reject second owner and unsupported tracks | Host assertions pass; hardware pending |
| Lifecycle | Install, active replacement refusal, Undo, removal, missing-module fallback | Current-build hardware pending |
| Composition | Another module's machine beside FRACT, Part reload, exact restore | Current-build hardware pending |
| Audio stress | Dense trigs, locks/LFOs, moving controls, STOP and Part/project reload | Current-build hardware pending |
| Human checks | Sound, exact-version Keep and physical reboot | Author stage 2, after stage 1 |

Read-only probe peaks are since installation/boot; they are not reset-window
maxima. Matched fresh starts and the base guard's own window capture must remain
separate. Emulator timing cannot populate physical performance fields. Existing
0.1.2 screenshots and functional reports retain their original build scope.
