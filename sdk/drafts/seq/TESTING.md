# SEQ testing

Results are separated by where they ran. Nothing below ran on a unit or in
the emulator yet.

## Host (26 Nov 2026, branch `module/seq`)

- `python3 -B sdk/drafts/seq/verify.py`: 4 tests pass. `seq.s` assembles for
  the 54455 with no undefined symbols; every `runtime.json` handler and
  manifest symbol is a global text symbol; `upstream/seq.s` is the pinned
  file (SHA-256 `625f0fda…0b63`); the `seq.work` payload offsets, `ef_bank`
  through `ef_dirty`, equal upstream's.
- `npm run module:dev -- seq --build-only`: `seq.mwrm`, 36,760 bytes of code
  and data, 0 of bss, 881 relocations, 8 hooks, 3 stock-code sites.
- `npm run module:doctor -- --draft seq`: the experimental lines are green,
  including cross-compatibility with every active module and the base.

## On the unit

Not tested. The checks for the first trial, on an MKII and an MKI where
available:

1. Install over USB; the self-test passes.
2. **`[TRACK]`** + **`[PAGE]`** opens SEQ on audio and MIDI tracks; **`[NO]`** closes it; bare **`[PAGE]`** stays stock.
3. **`[YES]`** writes TRIG and PLCK rhythms; **`[FUNC]`** + **`[BANK]`** clears them (MKII and MKI paths).
4. D never shows an FX page-2 or CX parameter.
5. Save the project, power-cycle, load it: SEQ's settings return.
6. A `seq.work` written by octabam's SEQ loads with its rhythms and depths.
7. With KITS installed beside SEQ on an MKI, **`[FUNC]`** + **`[BANK]`** still reaches KITS' SAVE KIT outside SEQ.
8. With Track Solo installed: a **`[TRACK]`** press in SEQ reaches stock first, so a 0.5 s hold solos that track and SEQ follows it. Check that both still behave.

## Stock flows

Not tested.

## Performance

Not measured. SEQ adds no frame-interrupt code: its detours are on the PAGE
key and FUNC+BANK paths in the UI task, and its hooks run in the project-file
task.
