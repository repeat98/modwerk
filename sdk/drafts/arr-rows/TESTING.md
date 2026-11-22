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

What Andrey Sidorkin saw on their own MKI, as they reported it; no module was installed. Both stock bugs below (an
insert on a HALT making an endless LOOP, a delete turning a JUMP into a HALT) and whether the module may take FUNC +
DOWN were raised with the owner in [#1668](https://github.com/repeat98/modwerk/issues/1668). The owner's answer
(18 November 2026): yes to FUNC + DOWN on a HALT row keeping both HALTs, every other FUNC + DOWN and the delete stay
stock's. 0.2.0 does that (below); FUNC + UP stays untouched.

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
PLAY showed no problem. The diagnostic word logged every copy, paste, insert and undo they made, and at the end both
views agreed that no key was held. Its disagreement count rose on nearly every key press: it compared the two views
on CUE's and FUNC's own events, before stock switches its layer, so the count was noise; the next build skips those
two keys.

They asked for a different paste: with no selection FUNC + STOP replaces only the cursor row with the copied rows, and
with a selection it replaces the selected rows. Built that way: a paste and an insert are one operation (replace D
rows at P with the N copied ones; D = 0 for an insert), every row and target mapped from before to after in one step
(README). Pressing FUNC + STOP again where the cursor was undoes it, also after replacing a selection. Under ot_emu on
the beta base: copying rows 1-3 of `0 1 2 3 4 5 6 7` and replacing row 6 gave `0 1 2 3 4 5 1 2 3 7` (10 rows), and
replacing rows 2-4 gave `0 1 1 2 3 5 6 7`; FUNC + STOP again restored each.

Stage 1 on that build: source `80e94f2be`, package
`a0e796c23ecc1fd15d3d5e5c4670683783ac06d485933c2ff748566f53a9c9cd`, the developer's MKI. Inventory `[]` before (the
previous trial stopped with Ctrl-C and rolled back); a 20-second trial ran the whole time with the diagnostic word
`0xff0c0001` (the editor open, cursor row 12, no selection, no disagreement), rolled back by itself; inventory `[]`
and the base's identity after.

### The module, stage 2 on that build (17 November 2026)

Package `a0e796c2…` as a 30-minute trial from 16:43 on the developer's MKI, a scratch project. As Andrey Sidorkin
reported it:

| Check | Reported |
| --- | --- |
| FUNC + STOP with no selection replaces the cursor row | Works; FUNC + STOP again undoes it, also after waiting about 10 s, with the cursor on the same row (the diagnostic log shows an undo nine seconds after the paste, the cursor having moved away and back) |
| FUNC + STOP with a selection replaces the selected rows | Works |
| `LOOP: 004` on row 8, rows 3-5 replaced by two copied rows | The LOOP moved to row 7 and showed `LOOP: 003` (the first pasted row), not a HALT; again undid it |
| Insert, the marks while scrolling, copies during PLAY | No problem seen |
| Replacing the row that is playing | The old pattern keeps playing until the arranger moves on or STOP/PLAY; stock's own one-row paste does the same |

The diagnostic word counted no disagreement between the module's and stock's view of CUE and FUNC during the trial.

## CPU price and performance (17 November 2026)

**CPU price, on the developer's MKI.** A development twin of the beta base (`build_core.py` with the beta flags but
the controller rows, plus `--dev`; base `7db3251b…`) RAM-booted with `npm run device -- boot DIR --chunk 4096`, nothing
flashed; the developer's scratch project, Part 2, the selected pattern; `npm run device:price -- --scene … <package
a0e796c2>`, 8 s per reading, each a trial rolled back:

| Run | Frame interrupt | CPU meter | DSP 1-4 | DSP 5-8 |
| --- | --- | --- | --- | --- |
| ARR ROWS, 1 | -0.1 | -0.2 | -0.2 | +37.5 |
| ARR ROWS, 2 | +0.2 | -1.7 | 0.0 | +18.9 |
| Tiempos (control, no DSP code) | +0.2 | +0.2 | -0.1 | -9.7 |

The module adds nothing measurable to the frame interrupt (`resources.cpuPrice` 0.0). DSP 5-8 swung by tens of
points between readings with a module that has no DSP code either, so it says nothing about either module. The
inventory was `[]` after each run.

**Performance record** (`evidence/performance.json`, `npm run perf:audit -- check`, ot_emu, the same package on the
beta base):

| Check | Result |
| --- | --- |
| record | key-press ColdFire record for arr-rows@0.1.0-experimental |
| cycles | the dearest press (an insert of 56 rows at row 0 of 200): 131,124 executed instructions from the key site to its return, budget 26,600,000 cycles (0 %) |
| stock benchmark | none: a key-press module adds nothing to the frame interrupt |
| stress | 40 presses of the dearest event while playing (20, STOP, PLAY, a Part change, the editor reopened, 20), no hang; the transport ran throughout | Stock flows to compare with and without the module: one-row copy, clear and paste and their undo;
FUNC + DOWN insert and FUNC + UP delete; CUE + track keys in the editor; ARR CHANGE, SAVE, RELOAD; a project saved
with the module loaded on a base without it (arrNN files compared).

## Package

`npm run module:dev -- arr-rows --build-only` (17 November 2026): 3,864 bytes of code and data, 11,320 of state,
15 relocations, three hooks, no stock-code sites. No stock code site of the base or any module overlaps the stock
routines it calls or the editor's key handlers (`scripts/stock-code-sites.py`, 416 sites).

## 0.2.0-experimental: moving rows (local, not yet released)

The developer asked for moving rows on 17 November 2026 and chose CUE + LEFT/RIGHT. Stock gives them no function of
their own in the editor (measured under ot_emu: CUE + RIGHT changed the column as RIGHT does; CUE + FUNC + UP/DOWN
did what FUNC + UP/DOWN do). `verify.py`: 85 host checks, among them a move of a selection and of the cursor row,
targets following their rows, a HALT staying a HALT, a LOOP moved past its target becoming a JUMP (the developer's
choice), the edges, and LEFT/RIGHT without CUE left to stock. Under ot_emu on the beta base (MKI panel): rows 2-3 of
`0 1 2 3 4 5 6 7` selected, CUE + RIGHT twice gave `0 1 4 2 3 5 6 7` then `0 1 4 5 2 3 6 7`, CUE + LEFT
`0 1 4 2 3 5 6 7`; the marks and the cursor followed. Not tested on a unit yet. The screenshots in `media/` are of
0.1.0-experimental.

On the developer's MKI (17 November 2026, flashed base `6c189889…`): my stage 1 on source `2f2a0043f`, package
`e96b2e44589001e5c34ee8784daebfb09fcf3fc27b0e158bface7ea8ff9776c2`, a 20-second trial: no crash, stall, freeze or
skipped track logged, rolled back, inventory `[]` before and after. Then their 30-minute trial from 18:04. As Andrey
Sidorkin reported it: a selection moved with CUE + RIGHT and back with CUE + LEFT, the marks following; the cursor row
alone moved the same way with no selection; `LOOP: 003` on row 6 moved up past row 3 became a JUMP to the same row's
content; LEFT/RIGHT without CUE still changed columns. All as intended.
The trial's link went quiet at 18:16:48 because the developer switched the unit off after their checks; the trial was
in RAM, so it ended with the power. Nothing was kept.

### FUNC + DOWN on a HALT row (#1668, 18 November 2026)

The owner agreed in #1668 that the module may keep both rows HALTs. `verify.py`: 92 host checks, among them stock's
insert (simulated as measured) on a HALT giving two HALTs, other targets left as stock leaves them, a LOOP row and a
refused insert (no row added) left alone, and FUNC + UP untouched. Under ot_emu on the beta base (MKI panel), package
built from this branch: a HALT on row 3 (`01000003`), cursor on it, FUNC + DOWN: 7 rows, row 3 `HALT: 003` and row 4
`HALT: 004` (`01000004`); stock alone gives `LOOP: 003/∞` on row 4 (above). FUNC + DOWN on row 1, above the HALT:
the HALT moved to row 4 with target 4, as on stock. Not tested on a unit yet.

### On the unit, 22 November 2026 (base 0.7.13, kept beside USB AUDIO)

Package `ec53c063…`, as the developer reported it: a HALT on row 3 and FUNC + DOWN on it gave `HALT: 003` and
`HALT: 004` (passed); FUNC + DOWN on a pattern row and FUNC + UP behaved as on stock (passed). Moving two selected rows
with CUE + RIGHT failed: the editor stopped scrolling, the selection went below the screen and the last row was not
drawn. The move set the cursor itself, without the editor's first shown row. Fixed: moves and undo set the cursor with
stock's own routine (0x400336bc), which scrolls the editor along (six rows shown). `verify.py`: 95 checks; the previous
code fails the two new scroll checks.

Package `794f1170…`, as the developer reported it: moving down past the screen now scrolled along (passed); moving up,
only the selection's last row stayed on screen, the cursor's row, while the rows above it scrolled off. Fixed: after a
move the module sets the cursor to the block's other end first and then back, so stock scrolls just enough to keep a
block of up to six rows wholly visible either way. `verify.py`: 96 checks.

Package `d626d9ab…`, as the developer reported it: moved blocks stayed on screen both ways (passed). The developer
asked to also see the row the block moves towards. Built: before the block's other end and the cursor, the module
sets the cursor to the row beyond the block (above moving up, below moving down, the END row at the bottom); with up to
five rows selected, that row and the whole block stay on screen. `verify.py`: 98 checks.

Package `46e75872…` (source `50bb1e6b2`), as the developer reported it, 22 November 2026: moved blocks stayed on
screen with the row ahead in view, up and down, selected either way (passed).

## Edge cases (0.2.0)

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| FUNC + DOWN on a HALT row | the module fixes the moved row after stock's insert | the developer's MKI, ec53c063 (base 0.7.13) | pass: `HALT: 003` and `HALT: 004` |
| FUNC + DOWN on a pattern row, FUNC + UP | must stay stock's | the developer's MKI, ec53c063 | pass |
| FUNC + DOWN with 256 rows (stock refuses the insert) | the fix must not touch rows when no row was added | host test (verify.py) | pass in the host test; not run on a unit |
| Moving a block past the bottom and the top of the screen | the module moves the cursor; the editor must scroll along | the developer's MKI, 794f1170, d626d9ab, 46e75872 | pass on 46e75872 (failed on the first two, fixed) |
| A block selected upward (cursor on its first row) | the other end must stay on screen | the developer's MKI, d626d9ab and 46e75872 | pass |
| Moving at the arrangement's first and last row | nothing above, the END row below | the developer's MKI, 46e75872 | pass |
| Beside USB AUDIO (installed with base 0.7.13) | both kept in one set | the developer's MKI, 46e75872 | pass: kept together, no crash, stall or freeze |
| A LOOP moved past its target | turns into a JUMP (the developer's choice) | the developer's MKI, 0.2.0 on base 0.7.5 | pass |
| MKII | another panel and key layout | none | not run: no MKII |
