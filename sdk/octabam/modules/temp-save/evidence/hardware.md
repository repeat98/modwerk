# TEMP SAVE hardware report

## 0.1.0 (28 October 2026)

- **Tester:** npp1993 (the contributor), by hand; the coding agent installed and removed the package over USB and read the module inventory.
- **Unit:** Octatrack MKII, OS 1.40C, flashed personal base `ccc5369236699164…` with 13 kept modules (Air Chorus, Analog BD, Apply Scene, BS WAVESHAPER, E-Verb, LIFT, LOFI2, Mini Verb, OUTPUT MATRIX, Quant Live Rec, Recorder Loop, Tape Echo, TapeHead).
- **Install:** `npm run device -- try <package> --seconds 1200` (a timed trial in RAM, never kept); stopped early with Ctrl-C, after which the inventory listed no TEMP SAVE.

### Run 1: package `335e59da46e0ad66b5fb98031d30e84d35fad49fc67c89768cb8b352a4cfa07c` (commit 88b14625)

| Check | Result |
| --- | --- |
| FUNC + YES, then trigs changed, FUNC + NO | TEMP SAVED, RELOADED, trigs back: pass |
| Parameters on several tracks | restored: pass |
| Machine change, then FUNC + NO | the machine back: pass |
| While playing | save and reload work: pass ("seems to work"; clicks or a stall were not specifically reported on) |
| Another pattern, FUNC + NO | NO TEMP SAVE: pass |
| MIXER, PROJECT, trig edit, PATTERN SETTINGS | no Temp Save message; stock ARM ALL / DISARM ALL: pass |
| SRC SETUP: FUNC + YES / FUNC + NO | no message / DISARM ALL (stock): pass |
| YES alone, NO alone | ARM ALL, DISARM ALL: pass |
| FUNC + CUE | PART 1 RELOADED; once DSP STOPPED appeared (see below) |
| Apply Scene's SCENE + YES | works: pass |
| **FUNC + YES twice quickly, FUNC + NO twice quickly** | **fail:** the second press showed ARM TRACK / DISARM TRACK. Cause: the module's own message is a popup, and the module left keys to stock while any popup was open. Fixed in 001fc493. |

DSP STOPPED is the base's DSP code loader abandoning a transfer (dsp.c); a Part reload that changes module effects can start one. It is being looked at with Analog BD's update in another session. Analog BD was taken off the tracks for run 2.

### Run 2: package `f9f45010275476bd93960b402e4ea7c0d8248c553ba12819846af0327675a687` (commit 001fc493)

| Check | Result |
| --- | --- |
| FUNC + YES twice quickly | TEMP SAVED twice, no ARM TRACK: pass |
| FUNC + NO twice quickly | RELOADED twice, no DISARM TRACK: pass |
| SRC SETUP sample slot list: FUNC + YES, CUE + YES | the sample preview plays (stock): pass |
| SRC SETUP sample slot list: FUNC + NO | DISARM TRACK (stock): pass |
| FUNC + YES on Part 1, pattern moved to Part 2 with PART, FUNC + NO | back on Part 1, pattern restored: pass |
| FUNC + CUE after a reload | on a Part never saved: stock's SAVE PART FIRST message; after a Part save: FUNC + YES, edit, FUNC + NO, more edits, FUNC + CUE: PART 1 RELOADED, back to the saved Part, no DSP STOPPED: pass |
| Save, edit and reload while playing | pass |

### Run 3: the published package `1078481879f6853a874b79d8bd98959909ea5a882d6f14dedef817dc53af2880` (commit eadd58a4, the release source)

On the flashed base `890d41e26a262381…` (flashed by another development session; 14 kept modules, the 13 above plus Ringmod SC), after a power cycle, as a timed trial. eadd58a4 changes only how the code reaches its copy buffer (an absolute, load-relocated address).

| Check | Result |
| --- | --- |
| FUNC + YES, trig and knob edits, FUNC + NO | TEMP SAVED, RELOADED, restored: pass |
| The same while playing | pass |
| FUNC + YES twice quickly, FUNC + NO twice quickly | TEMP SAVED twice, RELOADED twice: pass |
| Machine change, FUNC + NO | the machine back: pass |
| MIXER: FUNC + YES / FUNC + NO | stock ARM TRACK / DISARM TRACK, no Temp Save message: pass |

### Run 4: the published package `00b8d5ab9bedca2e0d1d02add7540af43ce98cbfc0d8b3c06e40c9b18fe68c4a` (commit d88d7207: page and menu windows)

On the flashed base `890d41e26a262381…` (14 kept modules), as a timed trial.

| Check | Result |
| --- | --- |
| AMP, LFO and FX SETUP, MIXER, PATTERN SETTINGS, TRACK TRIG EDIT, PART window, FUNC + PART menu, PROJECT and its INPUT page, ARRANGER, RECORDING SETUP: FUNC + YES, then FUNC + NO | TEMP SAVED, RELOADED, restored: pass |
| SRC SETUP with the machine list, and its slot list (double-tap SRC, RIGHT) | FUNC + YES nothing / preview, FUNC + NO DISARM ALL (stock), no Temp Save message: pass |
| The sample list (double-tap a TRACK key) | FUNC + YES previews, FUNC + NO DISARM ALL: pass |
| AED | no Temp Save message; FUNC + NO DISARM ALL: pass |
| PROJECT > RELOAD (the yes/no dialog) | FUNC + YES nothing, FUNC + NO DISARM ALL; nothing saved or reloaded: pass |
| FUNC + PART > RENAME | holding FUNC opens the character menu; no Temp Save message: pass |
| Pattern screen: save, edit, reload, stopped and playing | pass |

Not run on the unit with this source: SCALE and the MIDI-track SETUP pages (emulator only).

### Run 5: the published package `00b8d5ab…` again, module effects swapped, through the developer MCP (29 Oct 2026)

On the flashed base `faa07d4f540d532c…` with no kept modules (the card's saved set belongs to the earlier base and does not load). Loaded through the developer MCP's site flow (`device_review`, `device_trial`, `device_undo`) with E-Verb `5f81e72f`, Mini Verb `eea25e6c`, FM Synth `6e571654` (in place of Analog BD, which this base refuses) and Temp Save `00b8d5ab`; each trial passed its self-test.

| Check | Result |
| --- | --- |
| Review, trial, Undo | self-test passed, Undo restored the empty set: pass |
| E-Verb on T1 FX2 with a set MIX, FM SYNTH on T2, trigs on both; FUNC + YES; T1 FX2 to Mini Verb, an FM SYNTH knob turned, FUNC + NO, playing | E-Verb back, the FM SYNTH sound back, no DSP STOPPED, no dropout: pass |
| T2 changed to THRU, FUNC + NO | FM SYNTH back: pass |
| Stopped: T1 FX2 to Spring Reverb, T2 to THRU, FUNC + NO | E-Verb with its MIX and FM SYNTH back, no DSP STOPPED: pass |

After this, the unit refused the second trial's Undo (MCP warning "The Octatrack refused this step"); it reported a recovery state with E-Verb, Mini Verb and FM Synth listed and Temp Save already gone. A power cycle brought back the base with no modules. Keep was not run: the MCP refuses Keep while the card holds another base's saved set, and this base cannot back that set up (`device_saved_backup`: unsupported).

### Run 6: Keep, a kept power cycle and Undo through the developer MCP (31 Oct 2026)

On the flashed base `56a02a0a364eb410…`, package `00b8d5ab…`. The unit held 16 kept modules, three of them private (LIFT, BS WAVESHAPER, E16 LINK); the contributor accepted that Keep would drop those and reinstalled them afterwards. `device_saved_backup` reports unsupported on this base too, so no backup was taken. The first trial expired on the unit while the pattern was being tested, and its Keep was refused ("Trial identity changed"; the unit had reverted to the earlier set); the second trial was kept at once.

| Check | Result |
| --- | --- |
| Trial of 13 public modules incl. Temp Save, with no track playing a module effect (the first attempt was refused while one did) | self-test passed: pass |
| FUNC + YES, a trig edit, FUNC + NO in the trial | RELOADED, the edit undone: pass |
| Keep (`device_keep`) | "MCP reviewed set stays on your Octatrack, also after a restart": pass |
| FUNC + YES, power cycle, same project and pattern, FUNC + NO | NO TEMP SAVE, nothing changed: pass |
| After the power cycle | all 13 modules still listed and working; FUNC + YES and FUNC + NO work again: pass |
| Trial of the same set plus FM Synth, then `device_undo` | "Undone. Your Octatrack is back to how it was.", the 13 modules as before: pass |

Limits: one unit and one tester; MKI not tested; nothing timed; the card build not flashed; project save after a reload, MIDI mode and other banks were not run on the unit (they ran under the emulator, TESTING.md).
