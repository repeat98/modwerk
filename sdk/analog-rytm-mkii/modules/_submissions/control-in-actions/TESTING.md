# Control In Actions testing

Nothing has run on a unit yet. What follows ran in rytm-emu (`~/dev/rytm-emu` at c5732f0), which only approximates the instrument and has no model of the EXP/CV IN converters.

## Emulator

Test builds FE02 to FE04 and CE02: the module built with `-DCIA_EMU`, which reads the jack's level from a word poked from outside (`dtboot --poke`) instead of stock's converter, and publishes the open mode screen and the live recording flag for `DTBOOT_PEEK`. Everything else is the module as committed. FE02 to FE04 ran the module before the rename and REC HLD; CE02 (sha256 cca7ea49) is the module as committed. Build CI02 (sha256 43aab368, core-ar2 0.7 and this module, `-Os`) booted and ran 2 G instructions with the same CPU exception count as CI01 and no fault.

| Check | Result |
| --- | --- |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE turned right (CE02) | OFF, CV, EXPR, ACTION, and stops there; ACTION shows the ACTION row, LEARN LEVELS, REVERSE DIRECTION; the names fit |
| ACTION row turned right (CE02) | OFF, MUTE HLD, MUTE TGL, REC HLD, REC TGL, and stops there; the names fit the row |
| MUTE HLD, input high then low, from no mode (CE02) | MUTE mode on, then off |
| REC HLD, sequencer stopped, input high then low (CE02) | Sequencer playing with live recording on, then live recording off and still playing |
| REC HLD, input high, STOP on the panel, input low (CE02) | STOP ends live recording; the release does nothing, the sequencer stays stopped |
| REC TGL, sequencer stopped, three presses (CE02) | Live recording on and playing; off and still playing; on again. Releases do nothing |
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
- Beside other modules. CI02's code and data are 1005 bytes at `-Os` (CI01: 805); not yet linked beside the RC19 set.
- CPU and memory: UI only, two readings per UI tick; the module's code is about 1 KB. Not measured.
