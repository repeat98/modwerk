# CLYPS artist requirements · 23 November 2026

**Authoritative product decision, Endrew.** A musician must be able to develop alternate arrangements, move between Banks during composition or performance, and return to earlier material. Preserve these acceptance gates in subsequent sprints. Implementation choices below remain subject to qualification. This decision supersedes the pending status of D18 and extends D22.

## What gets saved or copied

| Object | Required musical behavior |
|---|---|
| Bank arrangement | Each project owns 16 independent Banks A–P, each with 16 rows of up to eight track-specific references. A switch changes the selected arrangement. Earlier edits survive Bank changes, project save/reload and power cycling after save. |
| Row | A saved combination of references. Copy A/R01 to A/R05 as a snapshot of all eight assignments. Editing R05 leaves R01 intact. Both may still refer to the same native sequences. |
| Cell | One track's source reference. Copy A/R01/T3 to A/R08/T3 and change only that assignment. Editing the shared source would still affect its other users. |
| Native source pattern | Stock sequencer data including trigs, parameter locks, timing, conditions and sequencer metadata. A03 → D07 must create an independently editable destination. Reuse requires explicit overwrite consent. Other references to D07 must be disclosed before replacement. |
| Independent duplication | Use a verified native pattern-copy transaction. Preserve the original, its users, and all Parts, machines, FX, scenes, sample assignments and stock Arranger data. Cross-bank Part slots may resolve to different sounds. Show the destination Part context. Never implicitly clone a Part. Retarget only the intended lane after separate confirmation and qualification of track-local selection. |

## Panel contract under investigation

In the stopped ARR matrix, select a row in row focus or a cell in track/row focus. Candidate FUNC+REC snapshots it. At the destination FUNC+STOP requests paste. Show object type, source and destination, confirm replacement and allow NO to cancel. Use a separately named **Duplicate Pattern** command with its own confirmation. Never infer it from a reference paste.

Elektron documents these chords for stock pattern copy/paste outside Grid Recording. Immediate repeated paste undoes the pattern paste. Cross-bank pattern paste copies trigs and locks and leaves the assigned Part separate. Use the stock operation as the reference oracle for D07. Timing, conditions, metadata coverage and undo ownership in the mod still need independent evidence. [MKII manual §12.9.1](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf).

The current modal handler consumes modified transport and rejects non-alone keys. It has no copy/paste route. The proposed contract claims neither stock clipboard action. Before binding gestures, trace both press orders, repeats, releases, early/ordinary dispatch, a modifier held before entry, popup opening/closing and the first input after leaving Meta. Test stock COPY/PASTE outside Meta, transport, Track Solo, SRC list, native SRC editor and Arranger. A popup cancels pending confirmation. If exclusive modal routing cannot be proven, prefer explicit Copy Row, Copy Cell and Paste entries reached through the existing matrix YES/NO navigation. Qualify that route separately.

## Architecture and failure behavior

- Use Bank-local slots and a project-owned versioned sidecar with indexed sections. Sixteen separate Bank files simplify partial reads but multiply identity and recovery transactions. A single generation makes one saved arrangement set recoverable. Embedding data in undocumented stock files or borrowing Arranger/battery storage risks stock recovery. See [storage design and lifecycle evidence](../sdk/drafts/clyps/ROW_STORAGE.md).
- Today a row packs eight four-bit slot indices plus a separate row-defined bit. All Banks cost 1,024 bytes of packed slots plus 32 bytes of row masks. A format supporting individually tagged empty/STOP/HOLD cells costs about 2,080 payload bytes with one byte per cell. Encoding, offsets, checksums, generations, filenames and migration remain design decisions. Never treat slot zero as empty. Keep parsing, snapshots and I/O outside the clock and input callbacks. Measure stack, pool, image and worst-case callback cost on the candidate before adoption.
- Use value snapshots with distinct row/cell types, never pointers into pattern memory or stock clipboard buffers. Permit repeated same-Bank paste. Initially require the same track for cell paste and a defined destination row. Explicit cancellation abandons pending mutation. Invalidate on project change, reload or unload. Until Bank identity is committed, refuse cross-bank reference paste. Later decide whether to rebind slot numbers to the destination Bank or explicitly support foreign references. Native pattern duplication across Banks remains mandatory.
- Stage and validate before a single commit. At confirmation, revalidate project, Bank, destination contents, clipboard, source-slot compatibility and ownership. Keep a preimage for undo in the same generation. On a failed Bank load or interrupted save, retain prior state, dirty edits and the last valid generation. Remove/off releases RAM and hooks, leaving ordinary project data usable. Stock saving with CLYPS absent requires reconciliation before sidecar writeback.
- Native duplication needs verified read/write ownership for both Banks, lock/condition/metadata extent, destination Part semantics, dirty tracking, undo and persistence/reload. Verify all other referencing tracks continue playing their selected source. Keep native editing interlocked until these pass. No raw pattern-block copy based only on a presumed size.

## Qualification ledger

All physical MKII tests A–H are **NOT TESTED**. The internal clipboard fixture exercises reference transformations with synthetic rows. No panel gesture, file transaction or independent native edit is qualified by that fixture.

| Gate | Acceptance observation |
|---|---|
| A | Copy A/R01 to R05, compare eight sources, change one destination cell and recheck original. |
| B | Paste R01/T3 into R08/T3. Compare the other seven cells and the original byte-for-byte. |
| C | Give A, B, C and H different arrangements. Edit H, return to A, and verify every Bank including intermediate ones. Repeat with an unrelated notification and failed load. |
| D | Save, reload and power-cycle a disposable project. Restore every row exactly. Interrupt writeback and recover the last complete generation. |
| E | Duplicate A03 to D07, independently change a destination trig and p-lock, reload, compare source and destination, timing, conditions, Parts and other references. |
| F | Copy/paste stopped, check feedback, press/release and normal stock gestures outside the matrix. |
| G | Try invalid targets, cancelled overwrite, popup, stale Bank/project and interrupted operations. Compare all unrelated project data. Exercise undo. |
| H | Disable/remove CLYPS, open the project in stock, compare patterns, Parts, scenes and Arranger; exercise stock save and recovery. |

## Milestones

1. Retain this decision in the README and handoff. Preserve attribution and both source licences.
2. Keep popup and Bank-read regressions green on the isolated candidate. Maintain independent shared-base qualification.
3. Exercise the internal value clipboard. Panel wiring requires ownership, feedback, overwrite and undo evidence.
4. Test the versioned codec and interrupted generations offline. Device I/O waits for project identity, successful lifecycle notifications, reserved filenames and recovery contracts.
5. Qualify the native pattern transaction and source editor separately. Hardware acceptance requires a later authorized physical session.
