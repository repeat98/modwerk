# Arr Rows: testing

Every result names its build. "Not tested" is a result.

## Host gate

`python3 -B sdk/drafts/arr-rows/verify.py` (17 November 2026, source at this branch): 55 checks pass, and
`arr_rows_core.s` matches `arr_rows.c` (m68k-elf-gcc 16.2, no unresolved symbols, the shared codegen guard passes).
It proves the module's logic against simulated stock memory, not the firmware.

## Stock behaviour, under ot_emu (stock 1.40C, no module)

Octabam's `ot_emu` (pinned checkout `f7d72906`), stock MAIN from the developer's own 1.40C, MKI panel, empty card,
`scripts/capture-module-ui.py` plans, 17 November 2026:

- MKI route: FUNC + BANK opens PATTERN SETTINGS until FUNC + PATTERN switches arrangement mode on; then it opens
  `ARR 1:` and YES opens the editor.
- With four and with eight rows, CUE + DOWN and CUE + UP gave frames pixel-identical to DOWN and UP alone, from row 0
  and from row 2. Holding and releasing CUE alone changed nothing on screen.
- Row geometry, from frames with the cursor on rows 0-8: RESEARCH.md, "The screen".

## The module under ot_emu

17 November 2026. The beta base 0.7.5 built from the developer's own 1.40C (`npm run octatrack:base -- --beta --out`,
browser `.bin` `dc3fcd4f…` = `build_core.py`'s), the adapted emulator (`scripts/octatrack-emulator/build.py`, octabam
`f7d72906`) with `--dsp --dsp-rt`, MKI panel, an empty scratch card. The package from `npm run module:dev -- arr-rows
--build-only` was installed over the emulated USB with `npm run device -- try … --accept --emulator` (accepted, no
refusals). The screen was read from the panel link's transmit stream (Octabam's `panel_link.py`), which carries what
`module_draw` adds; the rows were read from RAM after each step. Rows were given patterns A01-A08 with LEVEL first.

| Step | Rows (pattern per row) | Count | Screen |
| --- | --- | --- | --- |
| Start | 0 1 2 3 4 5 6 7 | 8 | |
| CUE + DOWN, DOWN from row 2 | unchanged | 8 | rows 002-004 numbers inverted, cursor on 004 as stock draws it |
| FUNC + REC | unchanged | 8 | `COPY 3 ROWS` in stock's box; no marks while it shows |
| FUNC + STOP at row 6 | 0 1 2 3 4 5 2 3 4 | 9 | `PASTE 3 ROWS` |
| FUNC + STOP again | 0 1 2 3 4 5 6 7 | 8 | undone |
| CUE + FUNC + STOP at row 1 | 0 2 3 4 1 2 3 4 5 6 7 | 11 | inserted |
| Copy rows 5-7, ARR CHANGE to arrangement 2 (empty), EDIT, FUNC + STOP | 5 6 7 | 3 | pasted into arrangement 2 |
| CUE + FUNC + STOP at row 0 there | 5 6 7 5 6 7 | 6 | |

- The changed mask (`0x1001614c`) gained arrangement 2's bit from the paste there. A first build marked the bank's
  bit instead (`0x100b14ce`, read as the arrangement's number from the disassembly); the emulator showed it, the
  host test could not (it modelled the same reading). Fixed to `0x100b14d1` (RESEARCH.md).
- FUNC + PLAY on rows 1-2 called stock's row clear for both: `CLEAR 2 ROWS`. Default pattern rows keep their bytes, as
  stock's own one-row FUNC + PLAY leaves them (compared in the same session).
- Stock's one-row copy and paste with the module installed and no selection: row 3 pasted over row 0, as on stock.
- A HALT row (row 3, target 3; made with LEVEL below A01): stock's FUNC + DOWN at row 1 moved it to row 4, target 4;
  then the module's insert of two rows at row 1 moved it to row 6, target 6.
- The insert rule (17 November 2026, after the owner's decision): a LOOP with count 0 draws `LOOP: 001/∞`; stock's
  FUNC + DOWN on `HALT: 003` gave `HALT: 003` and `LOOP: 003/∞` below it; stock's FUNC + UP on the new row put
  `HALT: 003` back; the module's insert of a copied row at row 3 moved the HALT to row 4 with target 4.
- Overwrite paste (same day): rows 2-3 (a pattern row, `HALT: 003`) pasted over rows 4-5 gave `HALT: 005`.
- Not run here: a LOOP/JUMP to another row through a module insert (host only), editing while the arrangement plays,
  SAVE/RELOAD, a power cycle, the MKII panel.

## On a unit

Not tested yet. Stock flows to compare with and without the module: one-row copy, clear and paste and their undo;
FUNC + DOWN insert and FUNC + UP delete; CUE + track keys in the editor; ARR CHANGE, SAVE, RELOAD; a project saved
with the module loaded on a base without it (arrNN files compared).

## Package

`npm run module:dev -- arr-rows --build-only` (17 November 2026): 3,864 bytes of code and data, 11,320 of state,
15 relocations, three hooks, no stock-code sites. No stock code site of the base or any module overlaps the stock
routines it calls or the editor's key handlers (`scripts/stock-code-sites.py`, 416 sites).
