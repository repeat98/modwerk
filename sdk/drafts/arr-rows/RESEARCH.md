# ARR ROWS: the arrangement editor in OS 1.40C

What the module relies on, read from the stock image (load address `0x40000400`) and, where marked, measured under
`ot_emu`. Addresses only; no stock bytes. Read with Octabam's `docs/firmware/PANEL.md` (key codes, key layers).

## The working arrangement

- `0x10000000` points at the working arrangement: `+0x10` a changed-flags word (stock ORs 1 after every edit), `+0x12`
  the row count, then 256 rows of 22 bytes from `+0x14`. This is the `.work`/`.strd` file's block after its header,
  so the module never touches the file format.
- A row's byte 0 is its type: 0 pattern, 1 LOOP/JUMP/HALT, 2 REM. A type-1 row's byte 3 is its target row and byte 2
  its count. The draw code (`0x400494f6`; the main screen's list at `0x40048d12`) labels it by target against its own
  row: less is LOOP, equal is HALT, greater is JUMP. Only a LOOP draws its count: `%02d`, or for 0 two glyphs that show as `∞`
  (measured: `LOOP: 001/∞`). The editor's writer clamps the count to 0-64 (`0x40049ed6`). Turning LEVEL below A01 in
  the PAT column makes a pattern row type 1 (a HALT on its own row) and then REM.
- `0x100b14d1` (byte, read with `mvz.b`) is the arrangement's number 0-7 (`0x100b14ce` is the current bank, which stock's insert uses for the new row); `0x1001614c` holds one changed bit per arrangement. Stock's
  paste, clear and the editor's knob edits set both.

## The editor's keys

- The editor's own key table (records of 0x1a bytes, PANEL.md 4b) binds FUNC (sub-map), DOWN, UP, LEFT, RIGHT, YES and
  NO to `0x40058f34`, and PATTERN, BANK and two more codes. Its FUNC sub-map binds DOWN (insert row, `0x4009e4c8`),
  UP (delete row, `0x4009b168`), REC (copy, `0x4009e790`), PLAY (clear, `0x4009e704`) and STOP (paste, `0x4009e5e4`),
  all through `0x40049f54`.
- It has no CUE record, so CUE falls through to the global layer: press `0x4004e978` only sets the held flag
  `0x460d168c`, release clears it, and CUE's sub-map binds T1-T8, YES, REC AB/CD and code 0x18, no arrows. Nothing in
  the editor reads the held flag (its three readers draw the main screen).
- **Measured** (`ot_emu`, MKI panel, stock 1.40C, empty card, 17 November 2026): with four and eight rows, CUE + DOWN
  and CUE + UP gave screens pixel-identical to DOWN and UP alone, from row 0 and from row 2. So stock gives CUE + UP/DOWN
  no function of its own here; they move the cursor.
- The routed press handler of each key code is at `0x46c7d8de + code × 0x18`. While the editor is on top, DOWN's is
  `0x40058f34`, or `0x40049f54` while FUNC is held; any window over the editor pushes its own layer.
- `0x400c0b74` is the editor's window (0 while closed; the redraw `0x40049738` returns at once on 0).
- The MKI reaches the editor with FUNC + PATTERN (arrangement mode on), then FUNC + BANK (`ARR 1:` menu), then YES on
  EDIT. Without arrangement mode, FUNC + BANK opens PATTERN SETTINGS (measured, MKI panel). The MKII has the ARR key.

## Stock's one-row edits

- Copy: the row to a 22-byte clipboard `0x461078ec`, valid flag `0x461078e8`, message `ROW COPY`.
- Paste: overwrites the cursor row; the old row goes to the undo row `0x46107902` with its index at `0x400d816e`
  (-1 none); FUNC + STOP again on that row restores it (`UNDO PASTE ROW`). Without a copy: `NO COPY`.
- Clear: the same undo; the row is cleared by `0x4009aff4(row)`, which resets its fields by type.
- Insert (FUNC + DOWN, `0x4009e4c8(P)`): refused at 256 rows (`ROW LIMIT REACHED`, `0x400b94ab`); every type-1 row
  whose target is greater than P gets target + 1, then rows P.. shift down, which leaves a copy of row P at
  P: in the middle the insert duplicates the cursor row; on an empty arrangement it writes a pattern row with the
  current bank (`0x100b14ce`) and pattern (`0x100b14d0`). A HALT at P is not special: measured, `HALT: 003` with FUNC +
  DOWN on it gave `HALT: 003` and `LOOP: 003/∞` below it, an endless loop.
- Delete (FUNC + UP, `0x4009b168(D)`): nothing on an empty arrangement or D ≥ count; every type-1 row whose target is
  greater than D gets target − 1, a target equal to D stays (the row that moves up into D); rows shift up,
  the count drops, the arranger's playing row `0x80006698` is clamped to the new last row. A HALT below D follows
  itself. Measured: deleting the duplicated HALT above put `HALT: 003` back. A JUMP on the row below D that points at
  D moves into D and becomes a HALT (target == own), with no message: reported on the developer's MKI (TESTING.md).
- Every read of a type-1 target is unsigned (`mvz.b`): insert `0x4009e570`, delete `0x4009b19e`, the editor's labels
  `0x40049500`/`0x4004956c`, the main screen's `0x40048d14`, the editor's target edit `0x40049eb2` (clamped to
  0..count) and playback's row resolver `0x4009aed0` (`0x4009af04`: equal stays, a HALT; greater jumps; less loops,
  with a bitmap of rows already visited). A HALT past row 127 is a HALT. (Until 17 November 2026 this file said
  signed: opmode `110` was misread as MVS; it is MVZ, MVS being `10s`.)
- The arrangement chain loads arrangement n by writing `0x100b14d1` and pointing `0x10000000` at
  `0x10000004 + n × 5652` (20 + 256 × 22).
- Messages: `0x4005a2b8(text, 0x30)` formats the text into stock's own box; `0x460d1e70` is nonzero while one is up.

## What stock sees held

Measured under ot_emu in the editor, every order of CUE and FUNC (routed press handler, `0x46c7d8de + code × 0x18`):

| Held | T1 | STOP | DOWN | CUE flag `0x460d168c` |
| --- | --- | --- | --- | --- |
| nothing | `0x40040250` | `0x4004aca4` (the transport's STOP) | `0x40058f34` | 0 |
| CUE | `0x40083dc4` (CUE's layer) | `0x4004aca4` | `0x40058f34` | 1 |
| CUE, then FUNC | `0x40083dfc` | `0x40049f54` (the editor's FUNC layer) | `0x40049f54` | 1 |
| FUNC | `0x40083dfc` | `0x40049f54` | `0x40049f54` | 0 |
| FUNC, then CUE | `0x40083dc4` | `0x40049f54` | `0x40049f54` | 0 |

So FUNC is held when STOP routes to `0x40049f54`, and CUE when the flag is set or T1 routes to `0x40083dc4`. With FUNC
up, STOP in the editor is the transport's STOP.

## The screen

Measured from `ot_emu` frames (MKI panel, eight rows, cursor rows 0-8): the list's first row text starts at LCD y 19;
a row is 5 px of text and 1 px of gap; the cursor row's text is 3 px lower, between dotted lines, and the row after it
starts 9 px after the cursor row's text. The first row shown is `0x460d1c64` (the redraw `0x40049738` adds it to each line's index at `0x4004983c`; `0x460d16e8` stays 0 in the editor), the cursor `0x460d16e4`; the cursor
stays at most five rows below the first row shown. Row numbers occupy x 6-18.

## The editor's cursor and scrolling (0.2.0)

`0x400336bc(row)` is stock's own cursor move in the arrangement editor: it sets the cursor (0x460d16e4), keeps the first
row shown (0x460d1c64) within six rows of it (scrolling up when the row is above, down when it is more than five
below), and sets the column limit for the row's type (0x400c0bfc). The arrow keys use it. Writing the cursor alone
leaves the editor unscrolled (seen on the developer's MKI): moves and undo go through it, first to the row the block
moves towards, then to the block's other end, then to the cursor.
