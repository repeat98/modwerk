# Screen Off testing

0.1.0-experimental. The host gate has been run. A private USB package was built from `screen_off.c`. On 7 November 2026 the person at the unit reported that hold UP, tap NO blanks the glass and the same chord brings it back. That trial's own counter moved. The process was killed before it printed a rollback; a later status showed the normal base and no slot running.

## Host gate

`python3 -B verify.py` compiles `screen_off.c` with the host gcc and sends it panel events. UP is `0x33`, NO is `0x32`.

Passed, 21 checks, 6 November 2026, on this computer (mingw gcc, `python3 -B verify.py`):

- NO alone and UP alone are not taken, and the frame is left as it was.
- NO pressed while UP is held is taken, the blank turns on, and a redraw is asked. A repeat of that NO does not toggle again. Its release is taken.
- PLAY while the screen is black is not taken, and the frame stays clear.
- The same chord turns the blank off, asks for a second redraw, and the frame is left as it was.
- NO pressed before UP does not blank.
- UP released before NO still keeps the blank, and that NO release is taken.
- A garbage state word behaves as a fresh module: screen on, and the frame is not cleared.

`screen_off.s` is the same decisions, written for the unit. It was not assembled here.

## USB trial

7 November 2026. Package `C:\Users\Roy Walker\modwerk-builds\screen-off.mwrm` (340 bytes, ABI 8, title `screen-off`, hooks `module_tick`, `module_draw`, `module_key`, no stock sites). Built with WSL `m68k-elf-gcc` 16.2.0 from `screen_off.c`. `npm run device -- try` for 8 seconds, without `--accept`, on the unit that answered `OCTATRACK 1.40C`, base `671f0afd406290cb…`.

The slot stayed running. The tick counter moved from 941389 to 941812. The diagnostic value stayed `0x0`. Refusals stayed at 1. The trial printed `rolled back` and left upload mode in 3 ms, then `normal, generation 5, active b068a052ccbb6d63…`. No SAVE, no flash, no power cycle, no Keep.

The diagnostic value is the module's own tick word. It stayed `0x0` for all eight seconds, so the blank never latched while that package was running. The glass was not watched.

The chord failed for a real reason in that package. `so_key` treated UP as down only after it had seen UP's own press. A press from before the module was installed never arrives, and the base's status handler (order 89) can take a press before this hook (order 90). NO then saw UP as up and did nothing. The panel's held-key row at `0x46100b18` already has the key under the finger; the base reads that row in `boot.c` before it posts the event. The draft now toggles when that row says UP is down, as well as when this hook saw the press. Returning 1 still consumes NO. `module_draw` still clears the composed frame after stock has drawn it (`core-ot` `ev_draw`), and `0x4004d948(-1)` only asks for that compose. The host gate passed 24 checks on 7 November 2026.

A second package, `C:\Users\Roy Walker\modwerk-builds\screen-off-2.mwrm`, was tried the same way for 180 seconds, without `--accept`, on the same unit (`OCTATRACK 1.40C`, base `671f0afd406290cb…`). It reached the slot. The glass was not watched, so this does not show that the chord blanks it.

The same package was tried again without `--accept`, from 21:08:12. The slot was running. At 21:08:33 the diagnostic left `0x0` and read `0x3`. The last line in the log was `0x40` at 21:12:07: 32 toggles, blank off. The person at the unit reported that hold UP, tap NO blanks the screen and the same chord restores it. The log never printed `rolled back`. The link then dropped. A later `npm run device -- status` answered `normal, generation 0`, with no slot running. No SAVE, no flash, no power cycle, no Keep.

## Not tested

- An MKI, and a card install. The MKII chord above is a report from the person at the unit, on the RAM trial of `screen-off-2.mwrm`.
- The package size, the executed instructions of the chord, and the cost of clearing the frame.
- The stock screen saver while this blank is on, and while a pattern plays.
- Whether the MKII panel can be powered down as well as painted black.
- Whether the MKI backlight stays lit behind the blank glass.
- UP + NO in a list, a dialog, the sample editor and the arranger, side by side with stock.
- Part save, project save and a power cycle. The blank is only a byte in the module's RAM, so a power cycle should turn the screen back on. That has not been seen.
