# FRACT0.1.7 all-track preparation

Native source commit `afe5084a96f6a91f0fe727d1470eb9de5fa7bb2f`. All 59 receipt source-input hashes match this clean module-only branch; later documentation edits do not alter package bytes.

Release package `f8063d691afc26ab4fe69a3fa709d2b12c68d93b203f0a84536d1755d33755c4`, base`24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`; development package `125c0ab3c7ac9b5cf8afc45710bca68ef62f8e55b34c8bb6fa20e6ae2379a165`, base`46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`. Native stock verification PASS. Compared with0.1.6 the authored image changes exactly one byte, the track-admission compare immediate3to7. Other authored bytes,33indirect sites,3stock copy records and imports are identical. BSS636; no new state orDSPallocations.

New profile permits one owner onT1–T8. Legacy prototype profiles retainT1–T4 and their existing tests. A new module-local test validates all8owners/64exclusionpairs/invalidtracks/immutablePart. Renderer, two grains, controls andPartABI are unchanged.

No physical USB device was opened by the offline build/parity checks. Hardware observations below were collected separately.

macOS and isolated Linux release packages are byte-identical. Offline software/build checks and a 20-second emulator install/integrity/Undo trial passed. Original11 executable units are preserved in the private timing probe.

Development125c was tested on the physical MKII: fixed T1/T5 and12Part checks,2400-operation control soak, all8single-owner picks,20four-format windows and122sactive4chUSB without new guarded skips. Probe89411 has12 valid timing series. These are development/probe observations, not released-base audio qualification. Failed attempts and remaining release gates are in [the exact hardware record](hardware-20261127-iteration18.md). No Keep/NOR write/waiver/release approval.

Shared SDK checks are separate contributions: #2283 removes stale reconstruction constants; #2294 checks the declared live-reader count. The qualification worktree includes those corrections, where the 52 SDK cases and nine runtime cases pass. On unmodified main the old checks reproduce their hardcoded three-reader/nine-copy failures; the module-only draft intentionally leaves shared gates unchanged and waits for those PRs to merge.

Exact public f806/base24e install/integrity/Undo45s passed; independent final normalgen2/empty inventory/missing/set87f28 and unchanged confirmed NORslots. [Install-only receipt](public-install-20261127-iteration18.json) is not audio/release qualification. SDK PR2283 must also accept a pinned install-only receipt without treating it as a full hardware pass.
