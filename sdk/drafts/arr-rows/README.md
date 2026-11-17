# Arr Rows

Select several rows in the arrangement editor and copy, clear, paste or insert them together, also into another
arrangement. OS 1.40C, MKI and MKII.

## Overview

Stock copies, clears and pastes one arrangement row at a time. Arr Rows adds a selection: hold CUE and press UP or
DOWN to mark rows from the cursor, and the usual FUNC + REC, FUNC + PLAY and FUNC + STOP act on all of them. Pasting
overwrites from the cursor, as stock's one-row paste does; holding CUE as well inserts the rows instead. The copied
rows stay until power off, so a section of one arrangement can be pasted into another after ARR CHANGE.

Without a selection, and until rows are copied with it, every key does what it does on stock. The module edits the
arrangement in RAM in stock's own layout, and stock saves it, so a project saved with the module loads unchanged on a
unit without it.

## Controls

In the arrangement editor (MKII: ARR, then EDIT; MKI: FUNC + PATTERN to switch arrangement mode on, then FUNC + BANK
and EDIT):

| Keys | With a selection | Without one |
| --- | --- | --- |
| CUE + UP / DOWN | moves the cursor, as UP/DOWN alone, and extends the selection from where it began; the selected row numbers show inverted | starts a selection on the cursor row and moves |
| FUNC + REC | copies the selected rows: COPY 4 ROWS | stock's one-row copy |
| FUNC + PLAY | clears the selected rows; again on the same rows undoes it | stock's one-row clear |
| FUNC + STOP | pastes the copied rows over the rows from the selection's first row; again in the same place undoes it | after a copy here: pastes them over the rows from the cursor; after a stock copy: stock's one-row paste |
| CUE + FUNC + STOP | inserts the copied rows at the cursor; again in the same place undoes it | the same |

UP or DOWN without CUE, NO, a stock insert or delete (FUNC + DOWN, FUNC + UP) and leaving the editor end the
selection. An undo works only while the rows are as the edit left them: after any other change, the same keys edit
again.

Stock changes, listed as the module guides ask:

- **CUE + UP/DOWN in the arrangement editor** now also mark rows. Stock gives them no function of their own there
  (they move the cursor as UP/DOWN do, measured: RESEARCH.md), and they still do. Considered instead: a new page or a
  FUNC gesture; a FUNC gesture would take stock's insert and delete. Only while the module is installed.
- **FUNC + STOP after a copy made here** pastes those rows instead of stock's one copied row, until the next stock copy
  (FUNC + REC with no selection). Only while the module is installed; the neighbouring flows checked are in TESTING.md.

## Usage

### Quick tutorial

1. Open the arrangement editor (MKII: ARR, then EDIT; MKI: FUNC + PATTERN for arrangement mode, then FUNC + BANK and EDIT).
2. Put the cursor on the first row you want, hold CUE and press DOWN (or UP) until the rows are marked.
3. Press FUNC + REC to copy them, or FUNC + PLAY to clear them.
4. Move the cursor to where they should go and press FUNC + STOP to paste over the rows there, or hold CUE and press FUNC + STOP to insert them.
5. Press the same keys again in the same place to undo the paste, clear or insert.

To move a section to another arrangement: copy it, open ARR CHANGE (or the menu's CHANGE) and pick the other
arrangement, open EDIT and paste or insert.

## Compatibility and limitations

- OS 1.40C. Not yet tested on a unit.
- Takes nothing outside the arrangement editor. UI claims: CUE + UP, CUE + DOWN, FUNC + REC, FUNC + PLAY, FUNC + STOP
  and CUE + FUNC + STOP in the editor, and the editor's screen (the inverted row numbers).
- Patches no stock code; installs beside every other module (`npm run modules:compat`).
- A paste or insert past 256 rows is refused with stock's ROW LIMIT REACHED, changing nothing.
- An insert of N rows at row P moves LOOP and JUMP targets past P by N, as stock's FUNC + DOWN does by one, and a
  HALT moves with its row, so it stays a HALT. One difference from stock: stock leaves a HALT sitting at P pointing at
  the new row, which turns it into an endless LOOP; the module keeps it a HALT. Inserted rows whose target is inside the copied block keep their place in the block; a LOOP
  count is kept within stock's 0-64. An overwrite paste (FUNC + STOP) does the same for the pasted rows: a copied
  LOOP or HALT points into the pasted rows, a target outside the copied block is kept (no row moves). Stock's one-row
  paste keeps the target as copied, so a HALT pasted elsewhere becomes an endless LOOP back to its old row.
- The copied rows live in RAM: gone after a power cycle or when the module is removed.
- Editing while the arrangement plays behaves as stock's own edits do; it was not tested separately.

## Tests and measurements

`verify.py` runs the module's C on the host against simulated stock memory (55 checks) and checks the generated
ColdFire unit. The stock behaviour it relies on was read from the 1.40C image and measured under `ot_emu`
(RESEARCH.md). Results, and what is not tested yet, are in TESTING.md.

## Authorship and licences

Original module by Andrey Sidorkin, MIT (LICENSE). Key codes and key layers from Octabam's panel notes
(`docs/firmware/PANEL.md`). No firmware, extracted stock code or built images are included.

## Screens and audio

No screenshots yet: they follow the emulator and unit tests. The module makes no sound.
