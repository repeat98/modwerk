# Control In Actions testing

## Unit

Build CI09 alone (sha256 1b4bc2dd, -O2), 3 November 2026, as the tester reported it: the ACTION bars move with the pedal and the right-hand line moves when pressed; ACTION LEARN with NO returns the marks; EXPRESSION LEARN with NO keeps the old range after leaving the menu and coming back; a hold action works from inside the menu and after leaving it. All pass.

Builds up to CI07 named the learn row LEARN LEVELS; CI08 names it ACTION LEARN, after stock's EXPRESSION LEARN, and changes nothing else.

CI09 (sha256 1b4bc2dd, this package's source) adds the code review's fixes: the view is redrawn every tick only in ACTION mode or while a learn is open, a learn's NO puts the levels back before that tick's reading, and the view is recognised by its class as well as its address. In rytm-emu (CI09 and its CE14 test build) EXPRESSION LEARN and ACTION LEARN with NO keep the saved levels and YES saves the new ones, the bars follow the input, REC HLD chosen in the open menu acts as REC HLD, FILL LAT latches and unlatches, MUTE HLD opens and closes MUTE mode, and its screens are pixel for pixel CI08's.

Analog Rytm MKII, OS 1.74, build CI02 alone (sha256 43aab368, core-ar2 0.7 and this module), 3 November 2026, as the tester reported it:

| Check | Result |
| --- | --- |
| Flash and boot | Passes |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE | OFF, CV, EXPR, ACTION |
| ACTION mode's rows | ACTION (OFF, MUTE HLD, MUTE TGL, REC HLD, REC TGL), LEARN LEVELS, REVERSE DIRECTION; all text fits |
| Bars at the left | None in ACTION mode, unlike EXPR (CI03 adds them) |
| LEARN LEVELS' message | Stock's wording, PUSH THE SWITCH SOME TIMES. / PRESS YES/NO WHEN DONE. (CI03 rewords it) |
| REVERSE DIRECTION | No message; stock shows none in EXPR mode either |

Build CI04 alone (sha256 66c4104d, CI03 at -O2), 3 November 2026, with a footswitch, as the tester reported it:

| Check | Result |
| --- | --- |
| Bars | Shown; the right one is shaded where stock EXPR's is a moving line (CI05 draws a line) |
| LEARN LEVELS' message | Shown as built; the tester wants stock's YES/NO line back (CI05 does) |
| REVERSE DIRECTION | Flips the right box's resting state |
| LEARN LEVELS, then NO | Unclear to the tester |
| MUTE TGL | Works as expected |
| MUTE HLD | Acts on the pedal's release: press does nothing, release opens MUTE mode, the next press closes it. Not observed but inferred: the pedal read as pressed at rest, likely because a NO in LEARN LEVELS left unreversed levels that leaving the menu saved (CI05's NO restores them) |
| REC HLD | Live recording starts at the release; a tap does not leave it. Inferred: the same reversed reading |
| REC TGL | From stopped, starts the sequencer with live recording on; the next tap leaves it, the pattern playing on |
| EXP/CV IN 2 | A brief look: it reads the CV |
| Power cycle | Settings kept |
| Timing | A little delay noticed, with the actions on the pedal's release |

Build CI05 alone (sha256 2704a16d, -O2), 3 November 2026, with a footswitch, as the tester reported it:

| Check | Result |
| --- | --- |
| LEARN LEVELS, YES, then REVERSE DIRECTION | Good |
| LEARN LEVELS, then NO | The marks return to where they were |
| REC TGL, MUTE TGL, FILL HLD | Work |
| REC HLD, MUTE HLD | Act as REC TGL and MUTE TGL |
| FILL LAT | Acts as FILL HLD |
| A changed setting | Seemed to need REVERSE DIRECTION again |
| Power cycle | Settings kept |

Cause, reproduced in rytm-emu with CE12 (CI05's code): the module read the saved settings, and stock saves a changed ACTION only on leaving the menu, REVERSE DIRECTION or LEARN's YES, so a choice changed and tried without leaving the menu ran the one before it. CI06 follows the open menu's copy (CE13: REC TGL changed to REC HLD in the menu then acts as REC HLD; CE12 in the same steps acted as REC TGL).

Build CI06 alone (sha256 5d325777, -O2), 3 November 2026, with a footswitch, as the tester reported it: all the checks pass.

| Check | Result |
| --- | --- |
| MUTE HLD from no mode, SCNE, PERF | MUTE mode while held, then back to the screen it came from |
| MUTE TGL from SCNE | MUTE mode, then the play screen on the next press, as the tester expects of stock's MUTE key |
| REC HLD, REC TGL, FILL HLD, FILL LAT | Pass |

Build CI07 alone (sha256 69e82c16, -O2), 3 November 2026, with an expression pedal, as the tester reported it:

| Check | Result |
| --- | --- |
| EXPR mode, EXPRESSION LEARN, move the pedal, NO | The range drawn in the left bar during learning goes away |
| Leave the menu and come back | The bar is as before the test |
| EXPRESSION LEARN again, YES | The new range stays |
| Leave the menu and come back | The bar is as left: the new range |

Nothing else has run on a unit yet. What follows ran in rytm-emu (`~/dev/rytm-emu` at c5732f0), which only approximates the instrument and has no model of the EXP/CV IN converters.

## Emulator

Test builds FE02 to FE04, CE02, CE06, CE07, CE10, CE12 and CE13: the module built with `-DCIA_EMU`, which reads the jack's level from a word poked from outside (`dtboot --poke`) instead of stock's converter, and publishes the open mode screen and the live recording flag for `DTBOOT_PEEK`. Everything else is the module as committed. FE02 to FE04 ran the module before the rename and REC HLD; CE02 (sha256 cca7ea49) ran the rename and REC HLD, CE06 the bars and LEARN LEVELS' guard. Build CI03 (sha256 0ec0b5aa) booted and ran 2 G instructions with the same CPU exception count as CI01 and no fault. Build CI02 (sha256 43aab368, core-ar2 0.7 and this module, `-Os`) booted and ran 2 G instructions with the same CPU exception count as CI01 and no fault.

| Check | Result |
| --- | --- |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE turned right (CE02) | OFF, CV, EXPR, ACTION, and stops there; ACTION shows the ACTION row, LEARN LEVELS, REVERSE DIRECTION; the names fit |
| ACTION row turned right (CE02) | OFF, MUTE HLD, MUTE TGL, REC HLD, REC TGL, and stops there; the names fit the row |
| MUTE HLD, input high then low, from no mode (CE02) | MUTE mode on, then off |
| REC HLD, sequencer stopped, input high then low (CE02) | Sequencer playing with live recording on, then live recording off and still playing |
| REC HLD, input high, STOP on the panel, input low (CE02) | STOP ends live recording; the release does nothing, the sequencer stays stopped |
| REC TGL, sequencer stopped, three presses (CE02) | Live recording on and playing; off and still playing; on again. Releases do nothing |
| ACTION mode's screen (CE06) | Bars at the left laid out as EXPR's: the level line follows the poked input, and the box fills at 5 V, stays filled at 2.2 V and empties at 0 V |
| ACTION row turned right (CE10, CE12) | Adds FILL HLD, then FILL LAT, and stops there |
| FILL HLD, sequencer playing (CE10, CE12) | Stock's fill flag on while the input is high, off after |
| FILL LAT, sequencer playing (CE12) | First press latches fill, the release keeps it, the next press ends it; a panel FILL also ends it |
| EXPRESSION LEARN, NO, leave the menu (CI06, stock's NO) | The saved EXPR levels become the newly learned ones |
| EXPRESSION LEARN, NO, leave the menu (CI07) | The saved EXPR levels stay as they were; with YES they become the new ones |
| LEARN LEVELS, NO, leave the menu (CI07) | The saved levels stay as they were |
| LEARN LEVELS, then NO (CE07) | The bars' learned levels return to the saved ones |
| LEARN LEVELS (CE06) | Message PRESS OR SEND A FEW GATES. / THEN PRESS YES TO SAVE. fits; the module counts LEARN as open and acts on nothing until YES; the bars keep drawing behind the message. The levels learned are stock's converter reading, 0 V in rytm-emu, so learning itself is for the unit |
| MUTE HLD, input high then low, from no mode | MUTE mode on, then off |
| Same from CHRO, SCNE, PERF | MUTE mode, then back to CHRO, SCNE, PERF |
| Same with MUTE mode already on | Stays in MUTE mode on release |
| MUTE TGL, two presses | MUTE mode on, then off |
| LIVE REC (FE04, now REC TGL), sequencer stopped, press | Live recording on, sequencer playing |
| LIVE REC, press again | Live recording off, sequencer still playing |
| LIVE REC, a third press while playing | Live recording on |
| Afterwards: STOP, then PLAY on the panel | Plays without live recording: RECORD is not left held |
| ACTION OFF (FE04: FOOTSW DEST OFF), input high | Nothing |
| REVERSE DIRECTION, then 5 V, 0 V, 5 V | Nothing, MUTE mode on, MUTE mode off: 0 V is pressed |

## Not tested

- Anything on a unit: the real converter's levels, LEARN LEVELS with a real switch, a gate, the 50 ms worst-case delay.
- EXP/CV IN 2 (same code as port 1, not run).
- Settings after a power cycle, and a unit without the module reading ACTION settings.
- The CONTROL IN MOD macro of a jack switched from EXPR to ACTION mid-sweep.
- Beside other modules: not run, as the full Rytm set does not fit beside it in the shared mod RAM yet. CI09's code and data are 3,260 bytes and 32 of `.bss` at the default -O2.
- CPU and memory: UI only, two readings per UI tick; the module's code is about 1 KB. Not measured.
