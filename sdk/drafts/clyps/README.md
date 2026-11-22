# CLYPS — experimental Octatrack performance module (community draft)

**Status:** source-integration work in progress; **not a release, not hardware-qualified, not a flash candidate**. This folder is the initial **public collaboration handoff**, not the latest compiled module. The author has an existing local Modwerk-fork implementation which must be brought into this branch after source and licence review.

**Artist/product direction:** Endrew. Built on Zac Kyoti's existing CLYPS ideas and independent Modwerk research with attribution retained. The project is independent and unofficial.

## What CLYPS is

A Session View-inspired performance system for Octatrack's **native sequencer**, not an audio machine and not a new clock.

- Each of eight **ordinary** audio tracks selects **one source sequence at a time** (not multiple simultaneous clips / no within-track polyphony).
- Sixteen source-pattern references per track and sixteen rows of combinations.
- Quantized row launch; a musician can then override only the bass, kick or another track without restarting the others.
- **Track SRC:** a contextual list to select and launch a sequence for the currently selected track, while retaining the underlying machine's SRC controls.
- **ARR:** an 8×4 global Meta overview with optional 4×4 Zoom / Row Edit, retaining stock Arranger data when CLYPS is removed.
- Native source-aware trig / p-lock editing remains **interlocked** until its separate ownership and undo gates pass.

**Only pattern references are implemented:** these are not sixteen independently allocated clip objects, and the row data is currently volatile.

## Existing local evidence, not yet reproduced in this public draft

The development owner reports that a **local** module under `sdk/drafts/clyps/` on a current Modwerk checkout built and ran with the Octatrack MKII emulator, including track SRC selection, ARR Panorama/Zoom, eight ordinary audio tracks, sixteen references and rows. Reported: 624 music events and 608 timestamp writes matched a stock composite over 219 ticks; twenty install/remove emulator cycles restored the pool, stock Arranger and 27 project files. A synthetic T1 FLEX stem changed from silence to signal after launch. The local package is not present in this public handoff yet.

**Important open defects:**
- Around the sequencer wrap, an early/late diagnostic observation differs by a tick; a tick-193 queue sample also differs. Treat these as unresolved, not harmless until falsified.
- CLYPS Meta's TRACK key routing conflicts with **Track Solo**.
- The private development base adds two sequencer callbacks not present in the current Modwerk public base. Their identities must not collide with existing hook 61.
- Source-aware editing of a foreign pattern remains blocked (E1); T8 Master and external clock are unqualified; hardware is **NOT TESTED**.
- Other track machine SRC screens (Grain / POLY8 / VECTOR) reportedly restore correctly in isolated emulator checks; this is not whole-module-set or device qualification.

## Work requested from Modwerk community

See [HOOK_PROPOSAL.md](HOOK_PROPOSAL.md) for the shared-base ABI questions and [HANDOFF.md](HANDOFF.md) for implementation status, acceptance tests, and independent tasks. Focused help is welcome with sequencer hook ownership, key/UI coexistence, timing witnesses, negative controls, portability to the current upstream base and source review.

**Do not flash this development build.** No OS files, stock executable bytes, emulated project images, binaries, dumps, copyrighted samples or private project data belong in Git.

## Provenance and publishing gate

Kyoti's original repo: https://github.com/Zac-Kyoti/octatrack-kyoti-fw (pinned source used in previous private experiments: `e750155a3d5c16fe2c8752413582fa61a90d97a2`), subject to the precise licence and exclusions of each imported file. Modwerk source and SDK have their own applicable licences. The artist previously reported permission for **private, isolated experimentation**; public reuse/attribution coordination with the original author must be completed before any dependent-source import or release requiring it. No contributor should import restricted source until review confirms its provenance and rights.

**Public PR deliberately stays DRAFT.** Its first revision is a documentation-only collaboration entry; it is **not** a completed module or a request to merge to `main`. Modules must follow Modwerk's current `AGENTS.md`, `ADD_A_MODULE.md`, `DEVELOPER_WORKFLOW.md` and `MODULE_QUALIFICATION.md`.
