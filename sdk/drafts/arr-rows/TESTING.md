# Arr Rows: testing

Every result names its build. "Not tested" is a result.

## Host gate

`python3 -B sdk/drafts/arr-rows/verify.py` (17 November 2026, source at this branch): 74 checks pass, and
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
- Never a silent HALT (same day): `JUMP: 008` copied from row 5 and pasted over row 8 was refused with
  `JUMP▸HALT ROW 8` in stock's box, row 8 unchanged; one row down it pasted as `JUMP: 008` on row 9.
- Not run here: a LOOP/JUMP to another row through a module insert (host only), editing while the arrangement plays,
  SAVE/RELOAD, a power cycle, the MKII panel.

## On a unit

### Stock behaviour, reported by the developer (MKI, stock OS 1.40C, no Modwerk base, 17 November 2026)

What Andrey Sidorkin saw on his own MKI, as he reported it; no module was installed. Both stock bugs below (an
insert on a HALT making an endless LOOP, a delete turning a JUMP into a HALT) and whether the module may take FUNC +
DOWN are raised with the owner in [#1668](https://github.com/repeat98/modwerk/issues/1668); until he answers, stock
FUNC + DOWN and FUNC + UP stay untouched.

- Delete (FUNC + UP) of row D while a JUMP points at row T:
  1. T below D on the screen (T > D): the target number dropped by one and still names the same row's content.
  2. T above D (T < D): the target number did not change.
  3. T == D, with the JUMP on the row just below D: the target did not change; the JUMP moved up into row D, pointed
     at itself and showed as HALT. A JUMP turned into a HALT without any message.
- Insert (FUNC + DOWN) on a HALT row: the HALT moved one row down showed as `LOOP: <row>/∞`, as in ot_emu (below).

Against the delete routine read from the image (RESEARCH.md): (a) nothing on an empty arrangement or D ≥ count,
not observed; (b) a target greater than D drops by one, observed (1); (c) a target equal to D stays, observed (3), and
a target below D is untouched, observed (2); (d) the rows shift up, the count drops and the playing row is clamped:
the shift observed in (3), the clamp not observed. Case 3 is how a stock delete turns a JUMP into a HALT. Stock's
FUNC + UP and FUNC + DOWN stay untouched by the module (the developer, 17 November 2026).

### The module, stage 1: the agent's run on the developer's MKI (17 November 2026)

Build: source `85783acab`, package `7b692b0e9355552b8c3a28909463891270f170b1d1346333e08f321033986b50`
(`npm run module:dev -- arr-rows --build-only`). Unit: the developer's MKI, OS 1.40C, the Modwerk base installed from
the site (`6c189889…`), no modules installed, transport stopped. One session (`npm run device -- serve --share`).

- Before: inventory `[]`, active identity the base's own. The base answers no development requests (built without
  `--dev`), so `device:test`, scripted keys and screenshots were not run; on an MKI the arrow keys do not go through
  the session either (docs/OCTATRACK_DRIVING.md).
- `npm run device -- try <package> --seconds 20`: installed as a trial, the module's tick ran the whole time (1,143
  ticks in 20 s, about 60 a second), the slot stayed running, then it rolled back by itself ("rolled back", generation
  2, active identity the base's own again).
- The DIAG refusal counter rose by about one every 3-4 s during the trial; with no module installed it rose at the
  same rate (12 to 16 in 12 s): the session's own development requests, which this base refuses, not the module.
- After: inventory `[]`, the base's identity active. Nothing was kept or saved.
- Not run here: everything in the editor (the developer's stage 2), the CPU price (`device:price` needs a development
  base), audio.

### The module, stage 2: the developer's test on the same build (17 November 2026)

Same build (`85783acab`, package `7b692b0e…`) as a trial (15 minutes, then a second of 30 minutes stopped early with
Ctrl-C), on the developer's MKI with a scratch project. As Andrey Sidorkin reported it:

| Step | Reported |
| --- | --- |
| Select (CUE + DOWN) | The rows were selected (copies had the right count), but the marks were wrong: about right only from the first rows; from row 3 only the three lowest lines looked selected, from row 7 nothing was marked; after a while nothing was marked even from row 000 |
| Copy, paste, undo | Work |
| Paste over (FUNC + STOP) | Behaved like the insert (CUE + FUNC + STOP): the cursor row stayed, the pasted rows next to it |
| Clear | Works, as stock's clear |
| A pasted JUMP onto its own target row | Refused as expected |
| Paste into another arrangement | Works |
| Stock keys with no selection | Unchanged |
| Copy of many rows while playing | Once, MIDI to external synths stopped until the next PLAY; later copies were fine |
| Save, then reload after the rollback | The arrangement kept the edits: durable |

Diagnosed afterwards (ot_emu, the same package): the marks used `0x460d16e8` as the first row shown, which stays 0 in
the editor; its own first row is `0x460d1c64`, so once the list scrolled the marks were drawn too high or off the
screen. A copy and a paste of 20 rows while the arrangement played left the transport running (`0x800065b8` = 1). The
paste behaving as an insert was not reproduced; the module decided "CUE held" from its own count of key events, which
a missed release would leave stuck. Fixed in the next build: the first row from `0x460d1c64`, CUE and FUNC read from
stock itself (RESEARCH.md), a diagnostic word printed by `try`. The MIDI stop is not explained yet.

### The module, stage 1 again: the next build (17 November 2026)

Source `f9fbcd669`, package `e091641009bc7ffbde12884e0d22903fb636a64c3d3b1506589c3586851e0546`, the same unit and base.
Inventory `[]` before; a 20-second trial ran the whole time (1,143 ticks) with the diagnostic word reading
`0xff000000` (editor not open, no selection), rolled back by itself; inventory `[]` and the base's identity after.
Before it, under ot_emu: the marks follow the editor's scroll (rows 3-8 with the list showing row 3 first), and a
copy and a paste of 20 rows during PLAY left the transport running.

### The module, stage 2 again: the developer's short re-test of that build (17 November 2026)

Build `f9fbcd669` (package `e0916410…`) as a 30-minute trial from 16:14 on the developer's MKI. As Andrey Sidorkin
reported it: the marks followed the selection, also with the list scrolled, and moving the cursor with LEVEL moved the
selection with it, as intended; FUNC + STOP and CUE + FUNC + STOP behaved differently, as intended; copies during
PLAY showed no problem. The diagnostic word logged every copy, paste, insert and undo he made, and at the end both
views agreed that no key was held. Its disagreement count rose on nearly every key press: it compared the two views
on CUE's and FUNC's own events, before stock switches its layer, so the count was noise; the next build skips those
two keys.

He asked for a different paste: with no selection FUNC + STOP replaces only the cursor row with the copied rows, and
with a selection it replaces the selected rows. Built that way: a paste and an insert are one operation (replace D
rows at P with the N copied ones; D = 0 for an insert), every row and target mapped from before to after in one step
(README). Pressing FUNC + STOP again where the cursor was undoes it, also after replacing a selection. Under ot_emu on
the beta base: copying rows 1-3 of `0 1 2 3 4 5 6 7` and replacing row 6 gave `0 1 2 3 4 5 1 2 3 7` (10 rows), and
replacing rows 2-4 gave `0 1 1 2 3 5 6 7`; FUNC + STOP again restored each. Stock flows to compare with and without the module: one-row copy, clear and paste and their undo;
FUNC + DOWN insert and FUNC + UP delete; CUE + track keys in the editor; ARR CHANGE, SAVE, RELOAD; a project saved
with the module loaded on a base without it (arrNN files compared).

## Package

`npm run module:dev -- arr-rows --build-only` (17 November 2026): 3,864 bytes of code and data, 11,320 of state,
15 relocations, three hooks, no stock-code sites. No stock code site of the base or any module overlaps the stock
routines it calls or the editor's key handlers (`scripts/stock-code-sites.py`, 416 sites).
