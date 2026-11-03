# Foot Switch Control

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.1.0-experimental. See [TESTING.md](TESTING.md) for what has run.

A footswitch or a gate on EXP/CV IN 1 or 2 holds or toggles the MUTE screen, or switches live recording, with both hands free for the pads.

## Setup

1. Connect a footswitch or a gate (0 to +5 V; the jack takes -5 V to +5 V) to EXP/CV IN 1 or 2.
2. Open GLOBAL > CONTROL > CONTROL INPUT 1 (or 2) and turn MODE past EXPR to **FSW**.
3. Set **FOOTSW DEST**:

| FOOTSW DEST | Pedal down | Pedal up |
| --- | --- | --- |
| OFF | Nothing | Nothing |
| MUTE HLD | Opens MUTE mode | Goes back to the mode you were in: CHRO, SCNE, PERF, or none |
| MUTE TGL | Opens or closes MUTE mode, as the MUTE key | Nothing |
| LIVE REC | Turns live recording on (RECORD + PLAY: starts the sequencer when stopped) or off (PLAY: the pattern plays on) | Nothing |

4. For a footswitch, run **FOOTSWITCH LEARN** and press the switch a few times, then YES. If pressing does the opposite, choose **REVERSE DIRECTION**. A 0 to +5 V gate works without learning: until you learn, 5 V is pressed and 0 V released.

Each jack has its own MODE, so one can be a footswitch while the other still plays the kit's CONTROL IN MOD macro as CV or an expression pedal. MODE, FOOTSW DEST and the learned levels are stock's control-input settings, stored where stock stores them.

## How it works

Stock OS 1.74 already holds the FSW mode, its FOOTSW DEST row and FOOTSWITCH LEARN in the CONTROL INPUT menus, left over from Elektron's other machines, but stops MODE at EXPR, and its own destinations do nothing on the Rytm. The module lets MODE and the setting reach FSW, gives FOOTSW DEST its three choices, and reads the jack's smoothed, calibrated level on each UI tick (about 20 times a second). The switch point is halfway between the two learned levels, with hysteresis. An action is the key press stock already handles (MUTE, CHRO, SCNE, PERF, PLAY), played through stock's own key path, so the pads, LEDs and modes behave as from the panel. LIVE REC holds RECORD as stock reads it only for its one PLAY press.

## Changes to stock flows

| Change | For whom | Why | Neighbouring flows |
| --- | --- | --- | --- |
| MODE in CONTROL INPUT 1 and 2 goes one step further, to FSW. | Anyone with the module installed. | The module's whole setup lives in stock's menus rather than a page of its own. | OFF, CV and EXPR are unchanged; the kit's CONTROL IN MOD keeps working on a jack in CV or EXPR. |
| FOOTSW DEST lists OFF, MUTE HLD, MUTE TGL and LIVE REC instead of stock's six, which the Rytm never acts on. | Anyone who sets MODE to FSW. | Stock hides the row; its TEMPO, ACTIVE, PRESET and ENV TRIG are not handled by the Rytm's input code. | FOOTSWITCH LEARN and REVERSE DIRECTION are stock's, unchanged. |
| A jack in FSW plays no CONTROL IN MOD macro. | Anyone who sets MODE to FSW. | Stock's input code leaves the macro's last value standing in this mode; the module clears it. | Switching back to CV or EXPR restores stock's behaviour. |

## Compatibility

It changes six stock instructions: the two MODE limits, the FOOTSW DEST limit and three of FOOTSW DEST's names. It subscribes to `ev_tick` and no key, encoder or audio hook. It claims the FSW mode of the CONTROL INPUT menus and the jacks in that mode. It needs no other module.

## Limits

- The pedal is read about 20 times a second, so an action can come up to about 50 ms after it: fine for the MUTE screen, but a sequencer started from LIVE REC can start that late.
- Without the module, a unit left in FSW mode reads that jack as nothing, and the menu turns MODE back no further than EXPR.

## Credits

Original work by Nathaniel Pavel (@npp1993).
