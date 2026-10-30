# Prototype history

This record consolidates retired prototype reports and captures. Current 0.1.8 evidence is in [TESTING.md](TESTING.md). Earlier versions and withdrawn designs do not qualify the version being prepared for release.

Complete prior reports, receipts and images remain in [Git at the pre-cleanup checkpoint](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/). Private source/card/image caches were also retained before cleanup. No firmware, project/card image or memory snapshot is added to this history.

## 0.1.0–0.1.3: UI and ownership experiments

The initial versions established FUNC+PART access, the eight-track two-column selector, per-track confirmation counts and manual-lock controls. 0.1.3 first wrote ordinary native SAMPLE locks in disposable emulator fixtures and stopped playback before editing. It attempted retained ownership metadata; its battery reservation overlapped the base diagnostics/effect map and was withdrawn. It never qualified physical hardware. The old compatibility claim must not be reused.

## 0.1.4: sparse ownership prototype

Package `d831f8c1f6469cd972d5c3d2d3860f067e55d149c2dca315fc34399ef4ef007c` used checksummed sparse ownership records, 11,824 bytes code/data, 12,032 bytes BSS and a 12,288-byte private battery reservation. Planner/UI/storage sanitizer tests and native emulator Lock/Clear, manual-lock retention, emulated fresh-process startup, maximum-size edits, save/reload and removal passed on the named private build. DSP-disabled captures did not prove audio or hardware timing; emulator Keep applied only to a disposable card copy.

Unknown edits while the module was absent, full ownership lifetime, native card integration and physical recovery remained unresolved. The sparse store held 704 track/pattern records and refused when full rather than evicting ownership. The complete earlier record is the [former PROTOTYPE_HISTORY.md](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/PROTOTYPE_HISTORY.md). None of this ownership code or storage is used by 0.1.8.

## 0.1.5: lifecycle-dependent ownership, retired

Source `105efaf13cdd7ffc40bc18155ccbdd875f2307be`; package `f9f179e0f5536d3c0727f61df5e79106ff211721c75742646c747e9598b35fc9`. Code/data was 13,980 bytes and BSS 12,692 bytes, with eleven guarded sites plus a private lifecycle contribution. It required a separate unpublished lifecycle base, so it does not satisfy today's independent-module rule.

Host and emulator checks covered retained ownership, same-value manual edits and restoration witnesses. Some old raw-engine save/reload fixtures bypassed native menu callbacks and are not accepted as native user-flow evidence. Later DSP-enabled preparation remained emulator evidence, not physical Keep, audio or reboot evidence. Full details remain in [the retired 0.1.5 report](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/TESTING-v015.md).

## 0.1.6: remove ownership and the dependency

Package `0cd6c725f6be493ea461b7a54231032416cab3cad77bf3327e644db212848961` removed retained metadata, ownership/history hooks and the lifecycle-base dependency. Lock kept existing SAMPLE locks by default; Clear removed all selected SAMPLE locks, including manual ones. It still stopped playback before editing. Allocation was 8,620 bytes code/data and 6,992 bytes BSS; it used four standard UI hooks and three Part Edit opener sites.

Portable/native emulator checks covered exact SAMPLE-only writes, mirrors, native Project save/reload, maximum edits and module removal. A fresh stock-only DSP-enabled emulator Project Reload also passed. Actual MKII singleton install/self-test/Undo and the author's reported Lock/Clear/STOP behavior were recorded on base `9b7e0eb3…`. A cached whole-instrument CPU trial peaked at 54.0%; it did not isolate module cost or qualify short spikes. No physical Keep, flash or saved-module reboot lifecycle was tested. Full details remain in [the retired 0.1.6 report](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/TESTING-v016.md).

## 0.1.7: native font and direct close

Source `4c565528dab2dba6736079cd406b78ec57b2a0b7`; package `372746e634f67590c6b93af832e65c47f2267493cf8aa52753e7ddfb92250bb0`. All three levels switched to the stock font and seven-pixel rows, and successful Apply closed directly. Allocation was 8,956 bytes code/data and 6,992 bytes BSS. The stopped writer and three opener sites were unchanged.

Portable sanitizer checks, pinned compilation and exact-image/site attestation passed. DSP-disabled emulator UI/edit/removal tests passed, and registered comparisons of the four stock menu rows found zero differing pixels after contrast normalization. No physical/audible result was claimed. Full details remain in [the retired 0.1.7 report](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/TESTING-v017.md).

## Early 0.1.8 observations superseded by current evidence

Package `28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d` introduced live edits and separate successful-operation RAM profiles. The current DSP-enabled emulator run remains retained because it tests this exact package; it is clearly labelled in TESTING.md.

The earlier MKII target-only trial on `9b7e0eb3…` passed install/self-test/Undo and restored all eighteen original module records and active/whole-set identities. Its labelled cached baseline averaged 52.84% CPU (51.6–55.1%). A reported 15-change Clear operation had a 56.2% cached maximum near Apply/close. Those windows were not exact operation timing or independent byte/audio checks. No Keep or flash occurred. The [pre-cleanup TESTING.md](https://github.com/twwwy/modwerk-beat_slicer/blob/5205cefe8528dbe8a6009de1251423122ab486d6/sdk/drafts/pattern-sample-locks/TESTING.md) retains all timestamps, scope and links to its earlier raw receipts. Current byte-checked hardware results and finite host completion bounds supersede those averages for the release discussion.

## Current design boundary

0.1.8 uses no ownership store, special battery region, custom lifecycle extension or dependency on another module. The three Part Edit opener sites remain its own declared patch while it is the only module using them; a second contributor needs a shared base table first. Keep, complete cost/stack bounds and public card/browser parity remain separate qualification gates. The retired designs grant no exemption and no first-release approval.
