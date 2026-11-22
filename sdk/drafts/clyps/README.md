# CLYPS — experimental Octatrack performance module (community draft)

**Public source draft.** This directory contains the production SRC/ARR renderer and input callbacks from the protected integration, plus a synthetic adapter and host and ColdFire checks. The complete installed sequencer currently runs on a private emulator base. Hardware qualification is outstanding.

Run `python3 -B sdk/drafts/clyps/test_renderer.py` from the checkout root. See [test coverage](TESTING.md) and [source provenance](PROVENANCE.md).

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

## Emulator qualification

The protected MKII candidate runs eight ordinary audio lanes. The revised eight-lane replay matched 624 ordered events, 608 timestamp writes and 219 sampled states against an independent stock composite. The historical tick-193 sample and the late tick-187 diagnostic are documented with their strict comparison outcomes in [TESTING.md](TESTING.md). Track Solo now receives both TRACK edges in Meta. LEVEL handles CLYPS navigation.

Earlier emulator evidence recorded twenty install/remove cycles, comparisons of 27 project files and a synthetic T1 FLEX audio transition. This sprint exercised module removal, stock UI recovery and the sequencing/output traces. Hardware, external clock, positive master gain adjustment and T8 Master remain unqualified. The dependent engine requires a protected development base. Public slots 61 and 62 already have different owners.

## Work requested from Modwerk community

See [HOOK_PROPOSAL.md](HOOK_PROPOSAL.md) for the shared-base ABI questions and [HANDOFF.md](HANDOFF.md) for implementation status, acceptance tests, and independent tasks. Focused help is welcome with sequencer hook ownership, key/UI coexistence, timing witnesses, negative controls, portability to the current upstream base and source review.

**Do not flash this development build.** No OS files, stock executable bytes, emulated project images, binaries, dumps, copyrighted samples or private project data belong in Git.

## Provenance and publishing gate

Kyoti's original repo: https://github.com/Zac-Kyoti/octatrack-kyoti-fw (pinned source used in previous private experiments: `e750155a3d5c16fe2c8752413582fa61a90d97a2`), subject to the precise licence and exclusions of each imported file. Modwerk source and SDK have their own applicable licences. The artist previously reported permission for **private, isolated experimentation**; public reuse/attribution coordination with the original author must be completed before any dependent-source import or release requiring it. No contributor should import restricted source until review confirms its provenance and rights.

**Public PR deliberately stays DRAFT.** Its initial RFC has been extended with the reviewable UI implementation. The runtime contract is proposed and the draft is outside the catalogue. Modules must follow Modwerk's current `AGENTS.md`, `ADD_A_MODULE.md`, `DEVELOPER_WORKFLOW.md` and `MODULE_QUALIFICATION.md`.
