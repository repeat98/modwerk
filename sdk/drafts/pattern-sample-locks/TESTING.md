# Testing: Pattern Sample Locks 0.1.7-experimental

29 October 2026 · twwwy · local UI revision. No push, PR, device install or release for this version.

## Scope and exact build

All three menu levels now use the stock UI font with seven-pixel text rows. Level one is a centered headerless six-item popup; levels two and three retain white headers, two columns and all eight tracks. Successful Apply closes the overlay directly; refusal and stale-source messages remain. The sample writer and STOP-before-edit behavior are unchanged. The separate live-playback and session-preference design remains a proposal.

- Native source checkpoint: 4c565528dab2dba6736079cd406b78ec57b2a0b7.
- Package SHA-256: 372746e634f67590c6b93af832e65c47f2267493cf8aa52753e7ddfb92250bb0.
- Object SHA-256: 0ca260c318a779cdac2f6ef76f03f72e66bfc755cdcf6d862e6ec9c99268cd7c.
- Code/data 8,956 bytes; BSS 6,992; 161 relocations; four standard UI hooks and the same three declared opener sites.
- Emulator/base identities are unchanged from TESTING-v016.md. Native stock-font calls use the existing SDK surface/text interface; no font bytes or firmware tables are committed.

## Actual checks

- Portable planner/UI/native-commit tests passed with strict warnings, ASan/UBSan and fail-fast sanitizers. New flow checks cover both successful actions, zero-change success, success after the asynchronous STOP wait, no leftover modal/drawing/key interception, and retained stale/refusal messages.
- Pinned GCC 16.2.0 freestanding MCF54455 compile passed, assembly regenerated, undefined-symbol check empty, late-combine and indexed-addressing guards passed.
- Private runtime package built from the regenerated assembly. The combined native UI/edit/removal emulator run passed with DSP disabled (media/v017-ui.json), including all three menu levels, disabled tracks, confirmation, direct closing after success and removal. The entire 8,956-byte relocated initialized image and all three sites matched the exact package; source hashes stayed frozen throughout the run.
- Successful Lock, repeated Lock, Clear and explicit replacement returned directly to phase CLOSED, with no acknowledgement key between operations. Existing/manual-lock behavior, unrelated audio bytes, unselected tracks and the native mirror passed the existing small native fixture checks. Removal with track selection open restored all three original opener sites and execution continued.
- Registered 39-by-7-pixel comparisons of the four stock rows showed zero differing pixels per row after normalizing selected-row contrast. Their row interval is seven pixels. The six-row popup remains headerless and all labels fit. See media/v017-stock-font-comparison.json and media/v017-part-menu.png.
- DSP was explicitly disabled in this current-version emulator run; they provide no audio execution or current hardware performance evidence.
- Original stock FUNC+PART reference was captured from original 1.40C in the emulator. It uses the stock font and a seven-pixel row interval.

- Draft module:doctor passes manifest parsing, category, thumbnail, UI claims and all-active-module/base cross-compatibility. Publication gates remain red for catalogue/package import, native parity and hardware qualification; none was bypassed.

## Qualification limits

This version has no hardware or audible evidence. Earlier 0.1.6 MKII results, user-reported Lock/Clear/STOP checks and the 54.0% sampled whole-instrument CPU reading are historical, not qualification of this build. The completed CPU trial verified restoration of the original eighteen-module inventory and exact whole-set identity. See TESTING-v016.md and media/v016-mkii-cpu-trial.json.

Project save/reload and maximum-512-edit results are historical 0.1.6 evidence; the writer source is unchanged. Current native/browser parity, card integration, worst-case timing, owner review and publication remain incomplete.
