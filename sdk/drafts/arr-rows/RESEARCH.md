# ARR ROWS: the arrangement editor in OS 1.40C

What the module relies on, read from the stock image (load address `0x40000400`) and, where marked, measured under
`ot_emu`. Addresses only; no stock bytes. Read with Octabam's `docs/firmware/PANEL.md` (key codes, key layers).

## The working arrangement

- `0x10000000` points at the working arrangement: `+0x10` a changed-flags word (stock ORs 1 after every edit), `+0x12`
  the row count, then 256 rows of 22 bytes from `+0x14`. This is the `.work`/`.strd` file's block after its header,
  so the module never touches the file format.
- A row's byte 0 is its type: 0 pattern, 1 LOOP/JUMP/HALT with the target row in byte 3, 2 REM.
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
- Insert: refused at 256 rows (`ROW LIMIT REACHED`, `0x400b94ab`); before shifting, every type-1 row whose target is
  greater than the insertion row gets target + 1; the new row takes the current bank and pattern.
- Messages: `0x4005a2b8(text, 0x30)` formats the text into stock's own box; `0x460d1e70` is nonzero while one is up.

## The screen

Measured from `ot_emu` frames (MKI panel, eight rows, cursor rows 0-8): the list's first row text starts at LCD y 19;
a row is 5 px of text and 1 px of gap; the cursor row's text is 3 px lower, between dotted lines, and the row after it
starts 9 px after the cursor row's text. The first row shown is `0x460d16e8`, the cursor `0x460d16e4`; the cursor
stays at most five rows below the first row shown. Row numbers occupy x 6-18.
