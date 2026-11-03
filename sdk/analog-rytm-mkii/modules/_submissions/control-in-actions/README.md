# Control In Actions

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.1.0-experimental. See [TESTING.md](TESTING.md) for what has run.

Adds an ACTION mode to the CONTROL INPUT menus: a gate or a footswitch on EXP/CV IN 1 or 2 then holds or toggles the MUTE screen or live recording, with both hands free for the pads.

## Setup

1. Connect a gate or a footswitch (0 to +5 V; the jack takes -5 V to +5 V) to EXP/CV IN 1 or 2.
2. Open GLOBAL > CONTROL > CONTROL INPUT 1 (or 2) and turn MODE past EXPR to **ACTION**.
3. Set the **ACTION** row:

| ACTION | Input goes high (pressed) | Input goes low (released) |
| --- | --- | --- |
| OFF | Nothing | Nothing |
| MUTE HLD | Opens MUTE mode | Goes back to the mode you were in: CHRO, SCNE, PERF, or none |
| MUTE TGL | Opens or closes MUTE mode, as the MUTE key | Nothing |
| REC HLD | Turns live recording on (RECORD + PLAY: starts the sequencer when stopped) | Turns live recording off; the pattern plays on |
| REC TGL | Turns live recording on (starting a stopped sequencer) or off (the pattern plays on) | Nothing |

4. For a footswitch, run **LEARN LEVELS** and press the switch a few times, then YES. If pressing does the opposite, choose **REVERSE DIRECTION**. A 0 to +5 V gate works without learning: until you learn, the input counts as pressed above about 3.1 V and as released below about 1.9 V.

The switch point is halfway between the two learned levels (2.5 V until you learn), with a margin of an eighth of the range, at least 0.2 V, either side of it so a noisy or slow edge switches once. Nothing ever stops the sequencer: a REC HLD release or a REC TGL press only leaves live recording, and if you press STOP during a REC HLD, the release does nothing.

Each jack has its own MODE, so one can switch while the other still plays the kit's CONTROL IN MOD macro as CV or an expression pedal. MODE, ACTION and the learned levels are stock's control-input settings, stored where stock stores them.

## How it works

Stock OS 1.74 already holds a footswitch mode (FSW), its FOOTSW DEST row and FOOTSWITCH LEARN in the CONTROL INPUT menus, left over from Elektron's other machines, but stops MODE at EXPR, and its own destinations do nothing on the Rytm. The module lets MODE and the setting reach that mode, shows the three as ACTION, ACTION and LEARN LEVELS, gives the ACTION row its four choices, and reads the jack's smoothed, calibrated level on each UI tick (about 20 times a second). The switch point is halfway between the two learned levels, with hysteresis. An action is the key press stock already handles (MUTE, CHRO, SCNE, PERF, PLAY), played through stock's own key path, so the pads, LEDs and modes behave as from the panel. REC HLD and REC TGL hold RECORD as stock reads it only for their one PLAY press.

## Changes to stock flows

| Change | For whom | Why | Neighbouring flows |
| --- | --- | --- | --- |
| MODE in CONTROL INPUT 1 and 2 goes one step further, to ACTION (stock's hidden FSW). | Anyone with the module installed. | The module's whole setup lives in stock's menus rather than a page of its own. | OFF, CV and EXPR are unchanged; the kit's CONTROL IN MOD keeps working on a jack in CV or EXPR. |
| Stock's hidden FOOTSW DEST row is named ACTION and lists OFF, MUTE HLD, MUTE TGL, REC HLD and REC TGL instead of stock's six, which the Rytm never acts on. | Anyone who sets MODE to ACTION. | Stock hides the row; its TEMPO, ACTIVE, PRESET and ENV TRIG are not handled by the Rytm's input code. | REVERSE DIRECTION is stock's, unchanged. |
| Stock's hidden FOOTSWITCH LEARN is named LEARN LEVELS. | Anyone who sets MODE to ACTION. | It learns a gate's levels as well as a switch's. | It works as stock's: it records the lowest and highest level seen. |
| A jack in ACTION mode plays no CONTROL IN MOD macro. | Anyone who sets MODE to ACTION. | Stock's input code leaves the macro's last value standing in this mode; the module clears it. | Switching back to CV or EXPR restores stock's behaviour. |

## Compatibility

It changes ten stock instructions: the two MODE limits, the ACTION row's limit, four of its names, and the names of the mode, the row and LEARN LEVELS. Stock's own text stays in the firmware; only these screens point at the module's. It subscribes to `ev_tick` and no key, encoder or audio hook. It claims the ACTION mode of the CONTROL INPUT menus and the jacks in that mode. It needs no other module.

## Limits

- The input is read about 20 times a second, so an action can come up to about 50 ms after it: fine for the MUTE screen, but a sequencer started from REC HLD or REC TGL can start that late.
- Without the module, a unit left in ACTION mode reads that jack as nothing, and the menu turns MODE back no further than EXPR.

## Credits

Original work by Nathaniel Pavel (@npp1993).
