# Control In Actions testing

## 0.1.1: faster actions

Where the delay came from, read in OS 1.74's code: the audio interrupt (vector 191, 32 frames a block, 1,500 blocks a second) reads each jack's converter result once a block in 0x4013f394 and smooths it by 2% a block into the level the CONTROL INPUT code and 0.1.0 read. From a clean edge between levels 1.6 V or more apart, that level crosses the switch point (5/8 of the way) after 49 blocks, about 33 ms. 0.1.0 read it once each UI tick, about every 50 ms, so an action came 33 to 83 ms after the edge. The converter is set up and started once at boot (0x40000946) and nothing restarts it per block, so its result is taken to follow the jack between blocks; what the jack's analog input stage adds is not known. Actions must play on the UI task, through KEYDISP, as a panel key does.

0.1.1 reads the converter's result in `ev_render_out`, unsmoothed, against thresholds the UI tick works out from the settings on the converter's scale (with stock's own conversion, 0x4013f5c6). On an edge it puts a key message (type 0, the module's own key) on the UI task's queue with stock's 0x400013b2, as stock's converter report does from the same interrupt (0x4013f53e), at most one waiting at a time. The UI loop (0x400a46f0) takes it as a panel key and the module's `ev_key` handler, at order 10, plays the edges and keeps the message from every other handler and stock. The UI tick plays any edge the message has not. After each edge the jack is not read for 15 blocks (10 ms), for a switch's bounce.

### rytm-emu, delay from the input's edge to the action's KEYDISP call

rytm-emu (`~/.cache/modwerk-upstream/rytm-emu`, 2ac0f1f, 200 M instructions an emulated second), test builds with `-DCIA_EMU`, which read the poked level in place of the converter: CE15 is 0.1.0's code, CE16 0.1.1's. CONTROL INPUT 1 in ACTION mode, REC TGL, menu left; the level poked to 5 V at ten points 1.03 M instructions apart, spanning one UI tick; `--break 0x400a0336` (KEYDISP, which nothing else calls while no key is pressed) gives the clock of the PLAY press.

| Build | Delay, instructions | ms |
| --- | --- | --- |
| CE15 (0.1.0) | 0.84 M to 9.80 M, mean 5.35 M | 4.2 to 49.0, mean 26.8 |
| CE16 (0.1.1) | 4 k to 224 k, mean 83 k | 0.02 to 1.12, mean 0.42 |

CE15's figures leave out stock's smoothing, as its level is poked; on a unit 0.1.0 adds about 33 ms to each.

### rytm-emu, CE16 behaviour

| Check | Result |
| --- | --- |
| REC TGL: press, release, press | Live recording on, stays on, off |
| MUTE HLD: press, release, twice | MUTE mode on, off, on, off |
| MUTE TGL: press, release, press, release | MUTE mode on, stays on, off, stays off |
| REC HLD: press, release, twice | Live recording on, off, on, off |
| FILL HLD, sequencer playing: press, release, twice | Fill on, off, on, off |
| FILL LAT, sequencer playing: press, release, press, release | Fill on, stays on, off, stays off |
| MUTE TGL, press bouncing 5 times 0.1 ms apart | One action: MUTE mode on |
| Then a bouncing release and a bouncing press | One action: MUTE mode off |
| MUTE HLD, press and release 0.3 ms apart | Ends with MUTE mode closed (only the end state was read) |
| REVERSE DIRECTION with the input at 0 V, MUTE TGL | CE16: reads as pressed, no action; CE15 (0.1.0): MUTE mode opened |

CI10 (sha256 78bfe9e1, -O2, this package) alone booted and ran 2 G instructions with the same CPU exception count as core-ar2 0.7 alone (1,661, all TRAP #0) and no fault; its three screens are byte for byte CI09's. Beside the author's 13-module set RC24 (base 441d96f7, RC24's store lock, unchanged layout), CI10 links (combined test image CC10, sha256 8281aa34) and boots in rytm-emu with only TRAP #0 exceptions.

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

- 0.1.1 (CI10) on a unit: the delay as played, a real switch's bounce against the 10 ms quiet time, the unsmoothed result's noise against the 0.2 V margin, the audio interrupt's added load.
- Before 0.1.1, on a unit: a gate, and the delay measured rather than felt.
- EXP/CV IN 2 (same code as port 1, not run).
- Settings after a power cycle, and a unit without the module reading ACTION settings.
- The CONTROL IN MOD macro of a jack switched from EXPR to ACTION mid-sweep.
- Beside other modules on a unit: not run with CI10; linked and booted only (above).
- CPU: each audio block, a comparison of each jack in ACTION mode with its thresholds; the core's load figure was not read. Memory (CI10, -O2): 3,946 bytes of code and data and 84 of `.bss`.
