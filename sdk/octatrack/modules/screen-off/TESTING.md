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

16 November 2026. A later RAM trial of the same package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`, was running without `--accept` on `OCTATRACK 1.40C`, base `3ee0515a0f474149…`. It was not kept. The person at the unit reported that hold UP, tap NO works as it should in a list, the sample editor, the arranger, the Modwerk status page, and beside Tiempos. The tick word is `(toggles << 1) | blank`. The log stayed `0x0` through 30 s. The first non-zero was `0x4` at 31 s: 2 toggles, blank off. The latest line read while this note was written was `0x54` at 432 s: 42 toggles, blank off. The trial process was still running. No SAVE, no flash, no power cycle, no Keep.

## Keep and power cycle

18 November 2026. The same package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c` (352 bytes), source `7105ec60e`, was added with `npm run device -- set` and `--accept` on `OCTATRACK 1.40C`, base `931a91bd7e571216…`. The offer was one change. The trial ran 5 s, the tick word stayed `0x0`, and the verdict was no crash, stall, freeze or skipped track. It printed `accepted` and left upload mode in 392 ms, then `normal, generation 1, active 9eba3924f12be60e…`. The inventory named the modules that were already kept, plus `screen-off`.

The person at the unit then held UP, tapped NO, and power cycled. They report that the expected behaviour was correct: the screen came back on, and the module was still installed. A read after that answered `normal, generation 0, active 931a91bd7e571216…`, tick word `0x4` (2 toggles, blank off). The inventory still named those modules, including `screen-off`. No SAVE, no flash.

## Removal while the screen is black

18 November 2026. The same package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`, was removed with `npm run device -- remove` and `--accept` on `OCTATRACK 1.40C`, base `931a91bd7e571216…`, while the person at the unit had the screen black. The trial ran 5 s. The tick word read `0x10000`, the slot stayed running, and refusals stayed at 0. The verdict was no crash, stall, freeze or skipped track. It printed `accepted` and left upload mode in 395 ms, then `normal, generation 1, active 9993a6d3bd0f59c4…`.

The person at the unit then held UP and tapped NO. They report that the expected behaviour was correct: the page came back, and the chord no longer blanks the screen. A later inventory on the same base named the modules that were already kept, and did not name `screen-off`: Mini Verb, Tape Echo, Euclid, Repitch, TapeHead, Air Chorus, Analog BD, FM Synth, Preview Vol, Play Modes, Mute Modes, Quant Live Rec, DirectJmp Kyoti, Arp Key Locks, beat-slicer, Slow LFO, Bar LED, tiempos, syntiz, Track Solo, Amiga, Kits. No SAVE, no flash, no power cycle.

## Try, then undo

18 November 2026. The live site cannot try this unpublished draft, and a Sync on the site keeps a set at once, so nobody pressed Undo there. The same check was `npm run device -- try` of package SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`, without `--accept`, on `OCTATRACK 1.40C`, base `931a91bd7e571216…`. The trial ran 5 s. The tick word stayed `0x0`, the slot stayed running, and refusals stayed at 0. The verdict was no crash, stall, freeze or skipped track. It printed `rolled back` and left upload mode in 5 ms, then `normal, generation 3, active 9993a6d3bd0f59c4…`.

A later status answered the same line, `normal, generation 3, active 9993a6d3bd0f59c4…`, with tick word `65536` (`0x10000`) and refusals at 0. The inventory on that base named the modules that were already kept, and did not name `screen-off`: Mini Verb, Tape Echo, Euclid, Repitch, TapeHead, Air Chorus, Analog BD, FM Synth, Preview Vol, Play Modes, Mute Modes, Quant Live Rec, DirectJmp Kyoti, Arp Key Locks, beat-slicer, Slow LFO, Bar LED, tiempos, syntiz, Track Solo, Amiga, Kits. No SAVE, no flash, no power cycle, no Keep.

## CPU price

19 November 2026, MKII, OS 1.40C. A development twin, identity `878307834ad3c23a9f87eea71250a7f104db7fdd5c32592cba6ddd816e61f718`, was RAM-booted and not flashed. `npm run device:price` measured package `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c` for 8 seconds, at rest, with the blank off. The pattern was whatever the unit came up on. The frame interrupt's share did not change (`resources.cpuPrice` 0.0). The CPU meter read +1.7 points; that is not the price. No frames were skipped. The price command was stopped before it printed a rollback, `recover` found the trial and rolled it back, and the inventory was empty. Nothing was kept.

## Draw cost

19 November 2026. ot_emu, the development twin `878307834ad3c23a…` (`MAIN.raw`, not a unit), package `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`. The trial was not kept. `so_draw` was watched from its entry to its `rts`. One UP+NO set the blank on (`off` 1, `toggles` 1). The count is executed instructions, interrupts included. With the blank still off the draw returned in 10. With the blank on, 26 draws cleared the 1024-byte frame in 6157 and did not take an interrupt inside the draw. The dearest of that run was 25033, the same clear with an interrupt inside it. An earlier run on the same image peaked at 25033 as well. `evidence/performance.json` records 25033. The audit calls that unit cycles/event. It is not the frame-interrupt price above, which was taken with the blank off.

The same session sent 21 UP+NO chords with no project loaded. `toggles` went from 0 to 21 and the tick kept running, with STOP sent between two groups of 10. The Part byte at `0x80000003` stayed 0, and the sequencer was not observed playing.

A later run on the same twin, with the DSP cores on (`--dsp --dsp-rt`), loaded set OCTABAM, project ONEAUX, pattern 0, on the internal clock. YES cleared SET DATE/TIME. Without the DSP cores that dialog stays up as DSP LOAD FAILED and the Part byte does not move. PLAY set the transport byte `0x800065b8` to 1. Ten UP+NO chords while it stayed 1 took `toggles` from 0 to 10. STOP set the transport to 0. PART+RIGHT changed the Part byte from 0 to 1. PLAY set the transport to 1 and ten more chords took `toggles` to 20. The diagnostic log at `0x100fc000` was read before the presses and after them: it stayed at 3 incidents (start, base, set), `crash_seen` 0, `stall_seen` 0, `freeze_state` 0. The trial was not kept. `evidence/performance.json` records 20 presses, playing, and no hang.

| row | result |
|---|---|
| cycles | worst event 25033 of 26600000 |
| stock benchmark | none for a key-press module |
| stress | 20 presses of the dearest event while playing, no hang |

## Memory

19 November 2026. The same package, SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`, 352 bytes, ABI 8. Its header says the linked image is 256 bytes and the bss is 12. The image's own SHA-256 is `42ddce28b94139986074dfbdf2dad1b11aee557689d23301daf8e28ce06ff028`. Disassembled with `m68k-elf-objdump -D -b binary -m m68k`, the image is 250 bytes of code, 2 zero bytes of alignment, and the 4-byte `so_at` pointer at image offset `0xFC` (one of the two relocations; the other is at `0x2`). The 12 bss bytes are `struct so`. Nothing else is allocated: no heap, no table, no DSP memory. The 1024-byte frame and the held-key row are stock's.

The only stack push in the image is `pea` of the redraw argument, 4 bytes, on the UI task's stack, and only on the chord that toggles. `so_key`, `so_draw` and `so_tick` allocate no frame of their own. The stock call at `0x4004d948` and the UI task's own stack below that are not measured. No hardware canary was set.

| region | bytes |
|---|---|
| ColdFire code | 250 |
| alignment before `so_at` | 2 |
| `so_at` | 4 |
| `struct so` (bss) | 12 |
| redraw argument on the UI stack | 4 |
| total, one instance | 272 |

## Release package

The release builder compiles `package.c`, which exports the three handlers in `screen_off.c` under the loader's core hook names. The resulting 352-byte package matches the MKII-tested package byte for byte (SHA-256 `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`). The performance and qualification source fingerprints include this packaging file.

## Not tested

- An MKI, and a card install. The MKII chord above is a report from the person at the unit, on 7 November and again on 16 November, both RAM trials of package `14aea62fbfef825e2ea23cc4baf6e01a2f2b0bf44b215db28748c1a546aeae0c`.
- The stock screen saver while this blank is on, and while a pattern plays.
- Whether the MKII panel can be powered down as well as painted black.
- Whether the MKI backlight stays lit behind the blank glass.
- Part save and project save. A power cycle on 18 November brought the screen back on, as the person at the unit reported, with the module still installed.
