# Foot Switch Control testing

Nothing has run on a unit yet. What follows ran in rytm-emu (`~/dev/rytm-emu` at c5732f0), which only approximates the instrument and has no model of the EXP/CV IN converters.

## Emulator

Test builds FE02 to FE04: the module built with `-DFSC_EMU`, which reads the jack's level from a word poked from outside (`dtboot --poke`) instead of stock's converter, and publishes the open mode screen and the live recording flag for `DTBOOT_PEEK`. Everything else is the module as committed. Build FS02 (sha256 6cf49db6, core-ar2 0.7 and this module) booted, opened the menus and ran 2 G instructions with no fault.

| Check | Result |
| --- | --- |
| GLOBAL > CONTROL > CONTROL INPUT 1, MODE turned right | OFF, CV, EXPR, FSW, and stops there; FSW shows FOOTSW DEST, FOOTSWITCH LEARN, REVERSE DIRECTION |
| FOOTSW DEST turned right | OFF, MUTE HLD, MUTE TGL, LIVE REC, and stops there; the names fit the row |
| MUTE HLD, pedal down then up, from no mode | MUTE mode on, then off |
| Same from CHRO, SCNE, PERF | MUTE mode, then back to CHRO, SCNE, PERF |
| Same with MUTE mode already on | Stays in MUTE mode on release |
| MUTE TGL, two presses | MUTE mode on, then off |
| LIVE REC, sequencer stopped, press | Live recording on, sequencer playing |
| LIVE REC, press again | Live recording off, sequencer still playing |
| LIVE REC, a third press while playing | Live recording on |
| Afterwards: STOP, then PLAY on the panel | Plays without live recording: RECORD is not left held |
| FSW with FOOTSW DEST OFF, pedal down | Nothing |
| REVERSE DIRECTION, then 5 V, 0 V, 5 V | Nothing, MUTE mode on, MUTE mode off: 0 V is pressed |

## Not tested

- Anything on a unit: the real converter's levels, FOOTSWITCH LEARN with a real switch, a gate, the 50 ms worst-case delay.
- EXP/CV IN 2 (same code as port 1, not run).
- Settings after a power cycle, and a unit without the module reading FSW settings.
- The CONTROL IN MOD macro of a jack switched from EXPR to FSW mid-sweep.
- Beside other modules.
- CPU and memory: UI only, two readings per UI tick; the module's code is about 1 KB. Not measured.
