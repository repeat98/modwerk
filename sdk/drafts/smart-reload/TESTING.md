# Smart Reload testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## Host gate

`verify.py`: 16 checks of smart_reload.c against simulated memory and a stock RELOAD PART that copies the saved Part's
scenes back: the row's scenes written to the working Part and the bank's copy, the Part marked edited, the scene sent
to the sound per side; a `--` side left to the Part; pattern mode, no row, a row past the last, a REM row, another
bank, another Part, another Part reloaded and nothing to reload all leave stock's reload alone; stock's answer passed
back. Then `generate.py --check`: the unit is what smart_reload.c generates.

## Under ot_emu (not hardware evidence)

The row layout and the current-row variable (RESEARCH.md): rows poked with scenes showed them in the arranger rows;
PLAY from row 0 set the Part's scenes to the row's. RELOAD PART itself was not run there (the project's Part was never
saved).

## On the unit

The developer's MKI (OS 1.40C), base `eb667962` (updated by the developer on 24 November 2026), Smart Reload the only
module, kept over USB; as the developer reported it:

- Build `42af5ec36` (package `b03bdf29`): after FUNC + CUE in arranger mode the row's scene showed as selected, but the
  Part's saved scene sounded until the row came round. Fixed in `ec80422b2`: each scene is also sent to the sound
  (stock's 0x40002df4, as SCENE A/B + TRIG does).
- Build `ec80422b2` (package `7e7889c9`): RELOAD PART in arranger mode while playing brings the knobs back to the saved
  Part and the row's scenes are selected and heard at once. Then, with the Part saved on scenes 1 and 9 in pattern
  mode and rows 2/10 and 3/`--`: FUNC + CUE on the second row gave scene A 3 (the row's) and B 9 (the saved Part's),
  and in pattern mode 1 and 9 (stock's). A first try showed `--` playing 02/10: the Part had been saved while the row's
  scenes were active, so its saved scenes were 02/10 (stock: the row start writes its scenes into the Part, `--`
  changes nothing).

## Stock flows

Compared on the unit: RELOAD PART in pattern mode (stock's). Not run: a reload from the Part menu, a reload stopped on a row that is not the first, reloads during scene or crossfader moves
with locks and LFOs (scenes guide), MIDI scene CCs, beside other modules.

## Edge cases

| Case | Why it is a risk | How run | Result |
|---|---|---|---|
| Pattern mode | must stay stock's | host test; the developer's MKI | pass on `ec80422b2` |
| A row side set to `--` | must keep the Part's scene | host test; the developer's MKI | pass on `ec80422b2` (the saved Part's scene) |
| The Part has nothing saved | stock reloads nothing | host test | pass in the host test; not run on a unit |
| RELOAD of another Part (Part menu) | only the Part in use takes the row's scenes | host test | pass in the host test; not run on a unit |
| A row in another bank or playing another Part | the row's scenes are not this Part's | host test | pass in the host test; not run on a unit |
| Stopped, between rows | the current row is the one PLAY continues from | none | not tested |
| device:test / device:qualify lifecycle | install, Keep, Undo, removal on the scripted path | none | not run; install and Keep by hand only |

## Performance

Not measured: the module runs only inside RELOAD PART (a key press), never per frame. Listing it needs
evidence/performance.json: npm run perf:audit -- template coldfire (docs/MODULE_PERFORMANCE.md).
