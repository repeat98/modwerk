# Temp Save testing

First hardware pass below, as the tester reported it. The rest is rytm-emu, which only approximates the instrument.

## Hardware

Analog Rytm MKII, stock OS 1.74, Modwerk base 0c92aa45, Temp Save alone, build TS06 (sha256 fbf0b2bf), flashed as a full image. Reported by the tester, 31 Oct 2026.

| Check | Result |
| --- | --- |
| FUNC + YES, edit trigs, FUNC + NO | Trigs come back |
| Trigs with locks, FUNC + YES, remove them, FUNC + NO | Locked trigs come back |
| FUNC + NO on a sound while playing | Reported as working |
| FUNC + YES, then FUNC + NO while TEMP SAVED shows | RELOADED does not appear and the reload does not run (TS06; changed in TS09) |
| FUNC + NO on the main parameter pages | RELOADED after a save, NO TEMP SAVE without one |
| Load a fresh kit, FUNC + YES | TEMP SAVED |
| Load a worked-on kit and save it, then FUNC + NO | NO TEMP SAVE. The report does not settle whether the save was FUNC + YES or stock's YES + kit key; the emulator gives this result for stock's kit save and RELOADED for FUNC + YES |
| Sample list, FUNC + YES | Still plays the sample |
| Trig with locks, FUNC + NO with no trig held | NO TEMP SAVE |
| Same, trig held, FUNC + NO | No message |
| YES + SCNE, NO + SCNE | Stock's pattern save and PATTERN RELOADED |
| Page key + YES, page key + NO | RANDOMIZE PAGE and page reload, stock's |
| FUNC + YES, clear a performance macro, FUNC + NO | The performance locks come back |
| FUNC + YES, clear a scene, FUNC + NO | The scene comes back |
| FUNC + YES while editing a performance macro | Nothing happens |
| Kit 5, FUNC + YES, power cycle, FUNC + NO | Still on kit 5; NO TEMP SAVE. Whether the kit's saved copy kept the save was not checked |

Then build TS07 (sha256 79eeb2d3), same setup, reported by the tester, 31 Oct 2026:

| Check | Result |
| --- | --- |
| Locks on trigs, RECORD + PLAY, hold FUNC + NO past a bar | Locks gone, trigs stay, no message. The locked values were heard while FUNC + NO was held |
| FUNC + YES, edit the kit, power cycle, NO + PLAY MODE | First try: the kit did not return; the tester puts this down to a wrong key. Two further runs with the filter as the marker: the edit survived the power cycle, FUNC + NO gave NO TEMP SAVE with no change, and NO + PLAY MODE gave KIT RELOADED with the filter as at FUNC + YES |
| After that, FUNC + NO | NO TEMP SAVE (test of a project load, reported in passing) |

Then build TS09 (sha256 b94ff0d8), same setup, reported by the tester, 31 Oct 2026:

| Check | Result |
| --- | --- |
| FUNC + YES, FUNC + NO straight away, and the other way round | The second message appears over the first; the actions were judged to go through |
| FUNC + NO, then NO + SCNE straight away | PATTERN RELOADED appears over RELOADED |
| Sampler: record, stop, FUNC + YES | Previews the sample |
| Sampler: FUNC + NO on the recorded sample | Discards it |
| Any of those on the sampler screen | No TEMP SAVED, RELOADED or NO TEMP SAVE |
| Live-recorded locks, hold FUNC + NO | Locks gone, as on TS07 |

Then TS09 again, in a scratch project, with BD TUN and added trigs as markers, reported by the tester, 1 Nov 2026:

| Check | Result |
| --- | --- |
| FUNC + YES, TUN to B, add a trig, NO + PLAY MODE, then FUNC + NO | The kit reload returns TUN and keeps the trig; FUNC + NO then removes the trig |
| FUNC + YES, TUN to B, add a trig, NO + SCNE, then FUNC + NO | The pattern reload removes the trig and keeps TUN at B; FUNC + NO then returns TUN |
| FUNC + YES, TUN to B, add a trig, YES + PLAY MODE, TUN to C, add a trig, FUNC + NO | TUN at B, both trigs gone: the kit at the stock save, the pattern at FUNC + YES |
| FUNC + YES, TUN to B, add a trig, YES + SCNE, TUN to C, add a trig, FUNC + NO | TUN at FUNC + YES, first trig stays, second gone: the pattern at the stock save, the kit at FUNC + YES |
| Stock kit and pattern saves at TUN B with a trig, then TUN A, trig cleared, FUNC + YES, TUN to C, NO + PLAY MODE, add a trig, NO + SCNE | TUN at A, no trigs: FUNC + YES replaced both stock saves |
| The first two checks while playing | Same results; no stop, jump, drift or audio dropout heard |
| FUNC + YES, TUN to B, add a trig, to another pattern and back, FUNC + NO | NO TEMP SAVE; TUN and trig stay |
| Then NO + PLAY MODE, then NO + SCNE | TUN returns to FUNC + YES; the trig stays, as the pattern change refilled stock's buffer |
| FUNC + YES at TUN A, TUN to B, SAVE PROJECT AS, TUN to C, LOAD PROJECT of that project | TUN at B: the project keeps the kit as it stood at the save |
| Then NO + PLAY MODE | KIT RELOADED, TUN at A: the project keeps the FUNC + YES copy as the kit's saved copy |
| Then FUNC + NO | NO TEMP SAVE |
| FUNC + YES at TUN A, TUN to B, SAVE PROJECT AS over the active project, FUNC + NO | RELOADED, TUN at A |
| FUNC + YES, add a trig, power cycle | The trig is there |
| Then NO + SCNE, then FUNC + NO | PATTERN RELOADED, the trig stays; NO TEMP SAVE |
| FUNC + YES, add a trig, SAVE PROJECT AS over the active project, add a second trig, LOAD PROJECT of that project | Only the first trig is there; no save prompt was reported at this load |
| Then NO + SCNE | No added trigs: the project keeps the FUNC + YES copy as the pattern's saved copy |

## Emulator

rytm-emu c5732f0, `dtboot`, stock OS 1.74, Modwerk base 0c92aa45, Temp Save alone, build TS06 (sha256 fbf0b2bf), factory kit K001 RYTMLINJE, pattern A01. Pattern, stored buffer and kit records read from snapshots with `dtpeek`. Screens read from `dtboot`'s output. The emulator's boot leaves a calibration warning open that takes YES and NO until it is closed; these runs close it first.

| Check | Result |
| --- | --- |
| FUNC + NO, no save yet | NO TEMP SAVE; nothing changed |
| FUNC + YES | TEMP SAVED; stored buffer equals the live pattern |
| Add a trig (RECORD, T1) and turn TUN, then FUNC + NO | RELOADED; pattern (85,760 bytes) and kit record (2,531 bytes) byte-identical to the save |
| FUNC + NO again | RELOADED |
| To A02 and back to A01, then FUNC + NO | NO TEMP SAVE; the edit stays (TS05) |
| Active kit poked to kit 2, then FUNC + NO | NO TEMP SAVE |
| Active kit poked to kit 2 and back, then FUNC + NO | NO TEMP SAVE: the save was dropped |
| Active kit poked away from the pattern's link, FUNC + YES | KIT NOT LINKED |
| Playing: FUNC + YES, later FUNC + NO | Both run; the sequencer keeps playing (TS05 for the save, TS02 for the reload) |
| Grid record, T2 held, FUNC + NO | No message; the trig stays: stock's (TS05) |
| Sample slot list open (SMPL, push D), FUNC + YES | CONFIRMED!, stock's; no TEMP SAVED (TS05) |
| GLOBAL menu open, FUNC + YES | Menu stays; no message (TS02) |
| Page key + YES | RANDOMIZE PAGE, stock's (TS02) |
| FUNC + NO while TEMP SAVED shows | Ignored until TS09: the message took NO (TS05) |
| Stock LOAD KIT to K003 (TS06), FUNC + YES, add a trig and turn TUN, FUNC + NO | RELOADED; pattern and kit record byte-identical to the save |
| Stock LOAD KIT to K003 (TS06), YES + PLAY MODE, FUNC + NO | NO TEMP SAVE |
| Grid record, T2 locked and held, FUNC + NO (TS06) | Pattern unchanged: stock sets its erase, which only acts in LIVE RECORDING |
| Stopped, no save, FUNC + NO (TS07, sha256 79eeb2d3) | NO TEMP SAVE |
| RECORD + PLAY with a locked trig on the active track, hold FUNC + NO past a bar (TS07) | The lock is erased, the trigs stay; no RELOADED |
| FUNC + YES, add a trig and turn TUN, FUNC + NO (TS07) | Pattern and kit record byte-identical to the save |
| Stock OS 1.74 against TS07, same presses: TEMPO FUNC + NO, song edit FUNC + NO, sound browser FUNC + YES, naming FUNC + NO, RECORDER FUNC + YES | Same screens |
| Stock OS 1.74 against TS07: RECORDER FUNC + NO | Stock nothing; TS07 NO TEMP SAVE, fixed in TS08 |
| RECORDER FUNC + NO with and without a save (TS08, sha256 fcbf7f45) | No message, the RECORDER stays, as stock |
| FUNC + YES, FUNC + NO on the main screen and AMP page (TS08) | TEMP SAVED, then RELOADED on both |
| FUNC + NO while TEMP SAVED shows (TS09, sha256 b94ff0d8) | RELOADED |
| FUNC + YES, add a trig and turn TUN, FUNC + NO, FUNC + NO again (TS09) | RELOADED twice; pattern and kit record byte-identical to the save |
| NO while TEMP SAVED shows (TS09) | The message closes |
| RECORDER, FUNC + NO (TS09) | No message |
| RECORD + PLAY with a locked trig, hold FUNC + NO past a bar (TS09) | The lock is erased, the trigs stay, no message |
| FUNC + YES, turn TUN, add a trig, NO + PLAY MODE, then FUNC + NO (TS09) | The kit reload returns the kit to FUNC + YES and keeps the trig; FUNC + NO then returns the pattern too |
| FUNC + YES, turn TUN, add a trig, NO + SCNE, then FUNC + NO (TS09) | The pattern reload returns the pattern to FUNC + YES and keeps TUN; FUNC + NO then returns the kit too |
| FUNC + YES, turn TUN, add a trig, YES + PLAY MODE, turn TUN, add a trig, FUNC + NO (TS09) | The kit at the stock save, the pattern at FUNC + YES |
| FUNC + YES, turn TUN, add a trig, YES + SCNE, turn TUN, add a trig, FUNC + NO (TS09) | The pattern at the stock save, the kit at FUNC + YES |
| FUNC + YES, turn TUN, SAVE PROJECT AS (TS09) | The active kit keeps the edit and the kit's saved copy keeps the save |
| Then FUNC + NO (TS09) | RELOADED; the kit is back at the save |
| FUNC + YES, turn TUN, SAVE PROJECT AS, turn TUN, LOAD PROJECT of that project (TS09) | No result: every kit came back blank in the emulator, so this says nothing about the instrument |

Read from stock's code, not run: performance locks at kit record + 1950 and scene locks at + 2190, inside the bytes compared above. The locks heard while FUNC + NO erases them in LIVE RECORDING are stock's: the sequencer builds a step, locks included, a step ahead, and the erase reaches it afterwards.

## Not tested

- On the unit: stock FUNC + YES and FUNC + NO without the module on every screen, audio during a reload, timing.
- The song and chain modes while they play.
- Whether stock's own flows reach KIT NOT LINKED: a kit load and a saved kit both link the kit to the pattern.
- This beside other modules. Memory and load were not measured.
- Mutes, the tempo and the performance knob across a reload.
