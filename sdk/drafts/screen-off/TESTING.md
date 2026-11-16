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

## USB trial

7 November 2026. Package SHA-256 `2a76c9e26118c0d6e314b8bda69df368abeaee46d9d35fbedf4f69ffba8286fd` (340 bytes, ABI 8, title `screen-off`, hooks `module_tick`, `module_draw`, `module_key`, no stock sites). Built with WSL `m68k-elf-gcc` 16.2.0 from `screen_off.c`. `npm run device -- try` for 8 seconds, without `--accept`, on the unit that answered `OCTATRACK 1.40C`, base `671f0afd406290cb…`.

The slot stayed running. The tick counter moved from 941389 to 941812. The diagnostic value stayed `0x0`. Refusals stayed at 1. The trial printed `rolled back` and left upload mode in 3 ms, then `normal, generation 5, active b068a052ccbb6d63…`. No SAVE, no flash, no power cycle, no Keep.

The diagnostic value is the module's own tick word. It stayed `0x0` for all eight seconds, so the blank never latched while that package was running. The glass was not watched.

The chord failed for a real reason in that package. `so_key` treated UP as down only after it had seen UP's own press. A press from before the module was installed never arrives, and the base's status handler (order 89) can take a press before this hook (order 90). NO then saw UP as up and did nothing. The panel's held-key row at `0x46100b18` already has the key under the finger; the base reads that row in `boot.c` before it posts the event. The draft now toggles when that row says UP is down, as well as when this hook saw the press. Returning 1 still consumes NO. `module_draw` still clears the composed frame after stock has drawn it (`core-ot` `ev_draw`), and `0x4004d948(-1)` only asks for that compose. The host gate passed 24 checks on 7 November 2026.

A second package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`, was tried the same way for 180 seconds, without `--accept`, on the same unit (`OCTATRACK 1.40C`, base `671f0afd406290cb…`). It reached the slot. The glass was not watched, so this does not show that the chord blanks it.

The same package was tried again without `--accept`, from 21:08:12. The slot was running. At 21:08:33 the diagnostic left `0x0` and read `0x3`. The last line in the log was `0x40` at 21:12:07: 32 toggles, blank off. The person at the unit reported that hold UP, tap NO blanks the screen and the same chord restores it. The log never printed `rolled back`. The link then dropped. A later `npm run device -- status` answered `normal, generation 0`, with no slot running. No SAVE, no flash, no power cycle, no Keep.

16 November 2026. The same package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c` (352 bytes), was tried again without `--accept` on `OCTATRACK 1.40C`, base `3ee0515a0f474149…`. The slot was running. The tick word is `(toggles << 1) | blank`. It stayed `0x0` until 25 s, then read `0x3` (one toggle, blank on). The last line before the trial process was killed was `0x68` at 125 s: 52 toggles, blank off. A following `status` still showed the trial, value 104 (`0x68`). `npm run device -- recover` then printed `recovered from trial` and `normal, generation 2, active 3ee0515a0f474149…`. The inventory after that named the same modules as before the trial, including Tiempos. The person at the unit reported that it runs great. No SAVE, no flash, no power cycle, no Keep. The trial process itself did not print `rolled back`.

## Not tested

- An MKI, and a card install. The MKII chord above is a report from the person at the unit, on 7 November and again on 16 November, both RAM trials of package `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`.
- The package size, the executed instructions of the chord, and the cost of clearing the frame.
- The stock screen saver while this blank is on, and while a pattern plays.
- Whether the MKII panel can be powered down as well as painted black.
- Whether the MKI backlight stays lit behind the blank glass.
- UP + NO in a list, a dialog, the sample editor and the arranger, side by side with stock.
- Part save, project save and a power cycle. The blank is only a byte in the module's RAM, so a power cycle should turn the screen back on. That has not been seen.
