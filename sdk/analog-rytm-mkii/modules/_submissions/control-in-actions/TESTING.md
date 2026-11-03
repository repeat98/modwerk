# Control In Actions testing

## Unit

Analog Rytm MKII, OS 1.74, build CI02 alone (sha256 43aab368, core-ar2 0.7 and this module), 3 November 2026, as the tester reported it:

| Check | Result |
| --- | --- |
| Flash and boot | Passes |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE | OFF, CV, EXPR, ACTION |
| ACTION mode's rows | ACTION (OFF, MUTE HLD, MUTE TGL, REC HLD, REC TGL), LEARN LEVELS, REVERSE DIRECTION; all text fits |
| Bars at the left | None in ACTION mode, unlike EXPR (CI03 adds them) |
| LEARN LEVELS' message | Stock's wording, PUSH THE SWITCH SOME TIMES. / PRESS YES/NO WHEN DONE. (CI03 rewords it) |
| REVERSE DIRECTION | No message; stock shows none in EXPR mode either |

Nothing else has run on a unit yet. What follows ran in rytm-emu (`~/dev/rytm-emu` at c5732f0), which only approximates the instrument and has no model of the EXP/CV IN converters.

## Emulator

Test builds FE02 to FE04, CE02 and CE06: the module built with `-DCIA_EMU`, which reads the jack's level from a word poked from outside (`dtboot --poke`) instead of stock's converter, and publishes the open mode screen and the live recording flag for `DTBOOT_PEEK`. Everything else is the module as committed. FE02 to FE04 ran the module before the rename and REC HLD; CE02 (sha256 cca7ea49) ran the rename and REC HLD, CE06 the bars and LEARN LEVELS' guard. Build CI03 (sha256 0ec0b5aa) booted and ran 2 G instructions with the same CPU exception count as CI01 and no fault. Build CI02 (sha256 43aab368, core-ar2 0.7 and this module, `-Os`) booted and ran 2 G instructions with the same CPU exception count as CI01 and no fault.

| Check | Result |
| --- | --- |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE turned right (CE02) | OFF, CV, EXPR, ACTION, and stops there; ACTION shows the ACTION row, LEARN LEVELS, REVERSE DIRECTION; the names fit |
| ACTION row turned right (CE02) | OFF, MUTE HLD, MUTE TGL, REC HLD, REC TGL, and stops there; the names fit the row |
| MUTE HLD, input high then low, from no mode (CE02) | MUTE mode on, then off |
| REC HLD, sequencer stopped, input high then low (CE02) | Sequencer playing with live recording on, then live recording off and still playing |
| REC HLD, input high, STOP on the panel, input low (CE02) | STOP ends live recording; the release does nothing, the sequencer stays stopped |
| REC TGL, sequencer stopped, three presses (CE02) | Live recording on and playing; off and still playing; on again. Releases do nothing |
| ACTION mode's screen (CE06) | Bars at the left laid out as EXPR's: the level line follows the poked input, and the box fills at 5 V, stays filled at 2.2 V and empties at 0 V |
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
- Beside other modules. CI04 is CI03 built at the default -O2: 2622 bytes of code and data (CI03 at `-Os`: 1840; CI02: 1005 at `-Os`; CI01: 805 at `-Os`, 1203 at -O2). Combined image RC20 (sha256 953ae59b, CI02 with twelve other Rytm modules) links with 1,508 B of module RAM spare and boots in rytm-emu with no fault; not on a unit.
- CPU and memory: UI only, two readings per UI tick; the module's code is about 1 KB. Not measured.
