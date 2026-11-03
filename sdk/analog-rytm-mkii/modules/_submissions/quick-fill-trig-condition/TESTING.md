# Quick Fill Trig Condition testing

## Hardware

Analog Rytm MKII, OS 1.74, build FC04, reported by the tester, 1 Nov 2026. The tester was pointed at the combined image; which one they flashed was not recorded.

| Check | Result |
| --- | --- |
| Existing trig held, FILL: TRC shows Fill, trig stays on release | Pass |
| FILL again, then again: overlined Fill, then the lock goes | Pass |
| Tap that trig | Comes off |
| Two trigs held, two presses | Both change together |
| One trig FILL, one NOT FILL, played, FILL held and released | Each plays only where it should |
| FUNC + FILL latched while playing, trig + FILL | Latch plays to the loop's end |
| FILL alone | Stock fill |
| GRID RECORDING off, and LIVE RECORDING: trig held, FILL | Stock fill |
| Trig held, QPER held, FILL | The write went in unseen: fixed in FC05 |
| FUNC + YES, change a condition, FUNC + NO | Passes |
| Project save and reload, power cycle | Locks stay |
| Euclidean mode: trig on a pulse + FILL, trig on no pulse + FILL | Passes |

Build FC05, same tester and day:

| Check | Result |
| --- | --- |
| Trig held, QPER held, FILL | No write |
| Trig held, QPER tapped, FILL | Writes |
| PERF, SCNE, MUTE or CHRO on, FILL | No write, which the tester reported as not working: changed in FC06 |

Build FC06, same tester and day:

| Check | Result |
| --- | --- |
| PERF, SCNE, MUTE or CHRO on, then trig + FILL | Writes |
| Trig held, then PERF, SCNE or CHRO on, FILL | Writes |
| Trig held, QPER held, FILL | No write, stock fill |
| Trig held, GLOBAL menu open, FILL | No change, stock fill |
| FUNC + YES, trig + FILL while TEMP SAVED shows | Writes |
| Trig + FILL three times | Fill, overlined Fill, lock gone |
| Copy a locked trig | Passes |

Build FC07, same tester and day:

| Check | Result |
| --- | --- |
| Trig + FILL three times | Fill, overlined Fill, lock gone |
| BD trig held, pad to a track with no trig on the step, FILL | Stock fill, no lock |
| Same, with a trig on that step | That trig steps |
| FILL held, then a trig | Trig placed, no condition |
| FX track, trig + FILL | Steps |
| Trig on page 2 + FILL | Steps |
| New trig held, PAGE held, FILL | Steps the held trig |
| New trig held, PAGE tapped, FILL | No condition change; rerun with the trig kept held. An earlier report of cycling here fits a pattern of one page, where stock leaves the hold alone; not confirmed |
| Tap a trig, tap PAGE, FILL | No condition change |
| Trig held, PAGE back round to its page, FILL | No condition change, as stock ends the hold |
| STEP REC on, trig + FILL | No change |
| Trig held, QPER held, FILL | No change, stock fill |
| Trig held, QPER tapped, FILL | Steps |
| Euclidean mode, trig on a pulse + FILL, played; trig on no pulse + FILL | Passes |
| PERF, SCNE, CHRO or MUTE on, then trig + FILL | Steps |
| Trig held, then MUTE: stock opens its sound save menu, FILL | Stock fill, no change |
| One trig FILL, one NOT FILL, played, FILL held and released | Each plays only where it should |
| FUNC + YES, change a condition, FUNC + NO | Condition comes back |
| Copy a locked trig | Lock comes along |
| Project save, power cycle | Locks stay |

The solo image has not been flashed. It ran in rytm-emu only.

## rytm-emu

The rest ran in rytm-emu, which only approximates the instrument.

Stock OS 1.74, Modwerk base core-0.7 (0c92aa45), build FC07 (sha256 546d69b8) alone, 1 Nov 2026. Results read from the pattern's condition bytes, the sequencer's trig words and stock's fill flags.

| Check | Result |
| --- | --- |
| GRID RECORDING, existing trig held, FILL | Condition 22, shown as Fill on TRC while held; trig stays on release, where a plain tap removes it |
| FILL again, then again | Condition 23, shown as overlined Fill, then no lock |
| Two FILL presses in one hold | Two steps |
| Tap off a locked trig, tap it back | Condition byte kept, then cleared by stock |
| Two trigs held, either press order | Both written, the lowest sets the step |
| Step 33 of a long pattern | Written |
| A step past the pattern's length, none placed | No trig there, so stock fill |
| FX track, trig + FILL | Written to that track |
| FILL held, then a trig | Stock: fill stays on, no write |
| Sequencer running, T9 + FILL | Written, while running |
| Pattern played, step 1 FILL, step 5 NOT FILL, FILL held for a loop and a bit | Frame trace: step 5 sounds outside fill only, step 1 in fill only |
| Euclidean mode, 4 pulses, track rotation +2, trig on a pulse + FILL | Written to the pulse |
| Euclidean mode, trig on no pulse + FILL | No write |
| FILL alone | Stock: fill flag set while held, cleared on release |
| GRID RECORDING off, trig held, FILL | Stock: fill flag set, no write |
| LIVE RECORDING, trig held, FILL | Stock: fill flag set, no write |
| FUNC + FILL latched, T9 + FILL | Latch kept where a plain FILL ends it; both then end at the loop's end |
| Trig released under the QPER overlay, then FILL | Stock: fill flag set, no write. Build FC01, without the key check, wrote to that step |
| Trig held, QPER held, FILL | Stock: fill flag set, no write. FC04 wrote it unseen |
| Trig held, GLOBAL menu open, FILL | Stock: fill flag set, no write |
| PERF, SCNE, MUTE or CHRO on, then trig + FILL | Written; TRC stays on screen |
| Trig held, then PERF, SCNE or CHRO on, FILL | Written |
| Trig held, then MUTE: sound save menu, FILL | No write |
| Trig held, QPER tapped, then FILL | Written |
| Same stale bit, then T1 + FILL, then tap T1 | Tap removes T1; FILL then stays stock's |
| Trig held, BANK A or BANK E held, FILL | Written |
| BANK A held, then a trig, FILL | Stock: fill flag set, no write |
| STEP REC on (RECORD + STOP), trig + FILL | No write |
| Trig held, pad changes track, FILL | Stock: fill flag set, no write on either track |
| Long pattern, trig held, PAGE tapped, FILL | Stock: fill flag set, no write |
| Long pattern, trig held, PAGE held, FILL | Written: PAGE moves the page on its release |
| Long pattern, trig held, PAGE round to its page, FILL | Stock: fill flag set, no write |
| Same, then a second trig held on the new page, FILL | That trig written |
| TRC while held | Updates with the write |

Beside Filter Hz, Env Reset Amp, Pipo Loop, QPERF, Silent Pad+Trig, Live Rec Retrig Fix (6dec0ab2) and Temp Save, combined build FC07 (sha256 797327a6), same day:

| Check | Result |
| --- | --- |
| Eight modules link, boots | No overlap reported |
| T1 + FILL twice, T3 + FILL | Written, with Silent Pad+Trig's trig key site present |
| FUNC + YES, change T3's condition, FUNC + NO | Condition comes back |
| QPER held, FILL | No write |
| Trig held, QPER held, FILL | Stock: fill flag set, no write |
| T3 + FILL while Temp Save's message shows | Written |
| Trig held, PERF on, FILL | Written |

Two trig keys released on the same emulator clock: the OS keeps one as held, with or without this module, so FILL then writes it. Seen only with that exact timing in rytm-emu.

Not tested: the solo image on a unit.
