# Smart Reload testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## Host gate

`verify.py`: 21 checks of smart_reload.c against simulated memory and a stock RELOAD PART that copies the saved Part's
scenes back: the row's scenes written to the working Part and the bank's copy, the Part marked edited, the scene sent
to the sound per side; a `--` side left to the Part; pattern mode, no row, a row past the last, a REM row, another
bank, another Part, another Part reloaded and nothing to reload all leave stock's reload alone; stock's answer passed
back. Then `generate.py --check`: the unit is what smart_reload.c generates.

## Under ot_emu (not hardware evidence)

The row layout and the current-row variable (RESEARCH.md): rows poked with scenes showed them in the arranger rows;
PLAY from row 0 set the Part's scenes to the row's. RELOAD PART itself was not run there (the project's Part was never
saved).

## On the unit

Version 0.1.0-experimental, builds below.

The developer's MKI (OS 1.40C), base `eb667962` (updated by the developer on 24 November 2026), Smart Reload the only
module, kept over USB; as the developer reported it:

- Build `42af5ec36` (package `b03bdf29`): after FUNC + CUE in arranger mode the row's scene showed as selected, but the
  Part's saved scene sounded until the row came round. Fixed in `ec80422b2`: each scene is also sent to the sound
  (stock's 0x40002df4, as SCENE A/B + TRIG does).
- Build `ec80422b2` (package `7e7889c9`): RELOAD PART in arranger mode while playing brings the knobs back to the saved
  Part and the row's scenes are selected and heard at once; pattern mode is stock's. A `--` side then took the saved
  Part's scene (rows 02/10, 03/`--`, `--`/`--` gave 03/09 and 01/09), which is not what those rows play without a reload
  (03/10, 03/10, as the main screen shows them): the developer chose the rows-above rule instead (`0008101dc`).
- Build `0008101dc` (package `717e8ec8`), beside Arr Rows 0.2.0 (`46e75872`) and Songbook with setlists (`eb6f5b44`), in
  a setlist whose song had three rows copied and pasted with Arr Rows, and a debug build of the same source showing the
  row taken and the scenes chosen: rows 0-5 (02/10, 03/`--`, `--`/`--`, then the pasted three) gave A2 B10, A3 B10,
  A3 B10 on screen, in the sound and in the message alike. RELOAD from the Part menu (the Part in use, and another
  Part) and pattern mode as expected.

## Stock flows

Compared on the unit: RELOAD PART in pattern mode (stock's), RELOAD from the Part menu. Not run: a reload stopped on a row that is not the first, reloads during scene or crossfader moves
with locks and LFOs (scenes guide), MIDI scene CCs, beside other modules.

## Edge cases

| Case | Why it is a risk | How run | Result |
|---|---|---|---|
| Pattern mode | must stay stock's | host test; the developer's MKI | pass on `ec80422b2` |
| A row side set to `--` | must get what the row plays without a reload | host test; the developer's MKI | pass on `0008101dc` |
| The Part has nothing saved | stock reloads nothing | host test | pass in the host test; not run on a unit |
| RELOAD of another Part (Part menu) | only the Part in use takes the row's scenes | host test; the developer's MKI | pass |
| A row in another bank or playing another Part | the row's scenes are not this Part's | host test | pass in the host test; not run on a unit |
| Stopped, between rows | the current row is the one PLAY continues from | the developer's MKI | pass on `0008101dc` |
| Rows pasted with Arr Rows, in a Songbook setlist | other modules edit the rows and the slots | the developer's MKI | pass on `0008101dc` |
| device:test / device:qualify lifecycle | install, Keep, Undo, removal on the scripted path | none | not run; install and Keep by hand only |

## Performance

Not measured: the module runs only inside RELOAD PART (a key press), never per frame. Listing it needs
evidence/performance.json: npm run perf:audit -- template coldfire (docs/MODULE_PERFORMANCE.md).
