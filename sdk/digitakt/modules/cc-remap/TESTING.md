# CC Remap testing

Module version 0.1.0-experimental, Digitakt I OS 1.54 (stock file SHA-256 `f78ba80f…3cf6`), Core 2.1. Firmware, linked images and emulator state stay on the developer’s computer; none of it is committed.

## Evidence tier

Author hardware: the three builds of section 5 on the author’s Digitakt I with an Allen & Heath Xone:1D, plus the emulator results below.

## How it works (OS 1.54)

**Stock.** The MIDI input task matches a CC’s channel against the sixteen track channels (TRACK 1–8, TRACK A–H) and the auto channel, and calls the per-track CC handler (0x400d6c80) with the track, the CC number and the value. For a MIDI track, CC 70–77 set CC VAL 1–8 through the same parameter setter a knob turn uses, so the value reaches the pattern, the screen and MIDI OUT (VAL’s CC SELECT number, on the track’s CHAN). Other CC numbers do nothing on a MIDI track.

Each parameter page is a view with a list of sub-pages (page numbers) and the index of the one shown; pressing the page’s key on that page steps the index, and the title gets " (n/m)" when there is more than one. A MIDI track’s AMP page has one sub-page, CC SELECT.

**The module.** Four 6-byte `jsr` sites:

- **0x400d6c80**, the CC handler’s entry: for tracks 8–15 (MIDI A–H on their own channel) a CC whose number is in that track’s table at slot k is passed on as 69+k. Then it replays the replaced test.
- **0x40030954**, in the parameter pages' getTitle, the copy of the page descriptor’s title: the first time the CC SELECT page asks (identified by its descriptor’s title object), its sub-page list grows from {n} to {n, n} (a new 8-byte list from the firmware’s allocator; the old one is freed), so the stock AMP key steps it. On sub-page 2 the title is "CC Receive".
- **0x4000fe10** and **0x40010b62**, the parameter read and write the pages use: while that view is on screen at sub-page 2, an access to SEL1–8 (local ids 33–40) of a MIDI track of the current pattern reads or writes the table instead, as value × 256. The write skips the setter’s pattern-edit step but keeps its change notice, which redraws the page.

The table is 64 bytes in the module, 70–77 for every track at power-on.

## 1. Stock behaviour (pinned digiemu c1b5735)

MIDI track A, CHAN on (channel 1), receive channel 9 (default). CCs fed through digiemu’s MidiIn, MIDI OUT captured with MidiOut, the parameter setter logged at 0x400e0b94.

| Input on channel 9 | Result |
| --- | --- |
| CC 70 = 85 | VAL1 = 85 (set_param id 25), MIDI OUT `b0 00 55` (SEL1 = 0) |
| CC 71, 77 | VAL2, VAL8 |
| CC 0, 1, 8, 16 | nothing |
| CC 70 on channels 1, 2, 10 | not track A |

## 2. Running firmware (pinned digiemu c1b5735, firmware-native drawing)

| Phase | Result |
| --- | --- |
| AMP on MIDI track A’s AMP page | "CC Receive (2/2)", the eight slots at 70–77 (SND CTRL1–8); AMP again: "CC Select (1/2)", SEL1–8 unchanged |
| Knob A on CC Receive | the table byte changes (70 → 66 in the capture); SEL1 unchanged |
| VAL1 receives 7, VAL2 receives 1, CHAN on; CC 7 = 85, CC 1 = 20, CC 70 = 40, CC 7 = 0 on channel 9 | VAL1 85, VAL2 20, VAL1 40, VAL1 0; MIDI OUT `b0 00 55`, `b0 00 14`, `b0 00 00` |
| CC 7 on channels 1 and 10 | track A unchanged |
| Every slot at 70–77 | as stock |
| TRK + trig 10 on CC Receive | track B’s table (stock numbers) |
| An audio track’s AMP page | stock (Amplitude) |
| FLTR, then AMP | CC Select (1/2) |
| Core 2.1 + this module + FX Track 0.1.0 (FX TRACK ticked, FX CONTROL CH 1, track A CHAN 1, SEL1 24), VAL1 receives 7; CC 7 = 100, then 20 on channel 9 | reverb PRE 8 → 100 → 20; nothing leaves MIDI OUT |
| Core 2.1 + this module + dt-support 1.0.1 + CC Assignment Names 2.1.1 | CC Receive (2/2) works and knob A edits it; FUNC + hold A on CC VALUE opens the CC1 NAME editor |

Link checks (Modwerk engine, OS 1.54): CC Remap combines with every Digitakt 1.54 catalogue module that combines with Core 2.1 (each pairwise, and in one build with dt-support, CC Assignment Names, Euclidean, MIDI Retrig, FX Track, Input Pre-Fader Sends, Digi Health, Digi EQ, Note Accumulator, Digi Utils, DigiChain and DigiMatrix).

Build `.syx` SHA-256: module alone `eaa72c8c…c85079`. No halt.

Seen in passing, stock as well: after an audio track’s page, TRK + a MIDI track keeps the previous title until the page is opened again; with CC Receive shown before, the knobs still show the table.

## 3. Build and rules

- Memory: 423 bytes in DDR (code, the 64-byte table and the title), 8 bytes of BSS; no fast SRAM. Plus an 8-byte sub-page list from the firmware’s allocator, once.
- Load (emulator): the three hooks timed with digiemu’s CycleClock at 250 MHz, zero-wait memory. CC handler entry: 76–83 cycles per CC on any track (stock instruction about 2). Parameter read: median 30, 95th percentile 76 cycles (stock about 2), over 406 reads while drawing and turning. Parameter write: 28–42 cycles. All in the UI and MIDI input tasks; nothing in the audio interrupt. Not a hardware measurement.

## 4. Screens

[capture.json](media/capture.json): CC Select (1/2), CC Receive (2/2) and CC Receive with knob A turned, from the module-alone build in the pinned emulator.

## 5. Hardware steps (for the author)

Builds: module alone `eaa72c8c…c85079`, with FX Track `5196ccac…dd5c74`, with CC Assignment Names `024ff31b…66edcc`.

1. MIDI track A, AMP page: AMP shows CC Receive (2/2) with SND CTRL1–8 (70–77); AMP again shows CC Select (1/2), unchanged.
2. Untouched, the Xone (or any controller) on channel 9 sending CC 70–77 moves VAL1–8 as stock.
3. On CC Receive set knobs A–H to the Xone’s eight pot numbers. Turn each pot: VAL1–8 follow on the FLTR page, and the synth on track A’s CHAN receives each slot’s CC SELECT number.
4. Change pattern: the same table still applies (one table for all patterns).
5. Set the Xone to channel 10 and set up track B the same way: each track follows its own channel and table.
6. With FX Track: track A on FX CONTROL CH, FX TRACK ticked, SEL1 a delay or reverb CC: the Xone pot moves that effect.
7. With CC Assignment Names: CC Receive still works, and FUNC + hold a knob on CC VALUE still renames.
8. Power-cycle: CC Receive is back at 70–77.

**Author’s results (draadpiraat, 29 October 2026, Allen & Heath Xone:1D):** 1 works perfect; 2, 3 and 4 confirmed; 5 “different channels work and follow its own channel”; 6 (with FX Track) “fx track seems to work exactly as described”; 7 (with CC Assignment Names) “confirmed everything works”; 8 confirmed each time. Also noticed: copying an entire MIDI track does not copy its CC Receive table. Tested for about 20 minutes. Details in [evidence/hardware-testing.json](evidence/hardware-testing.json).

## Stock flows compared

| Flow | Result |
| --- | --- |
| MIDI input with every slot at 70–77 | Stock |
| CC SELECT (1/2) | Stock |
| Other parameter pages, audio tracks | Stock |
| Saved data | Unchanged; the table is not saved |
| Power cycle | 70–77 again (author’s unit, each time) |
| Copying a MIDI track | Copies the track’s data; the CC Receive table stays with the track slot (author’s unit) |

## Still to test

- The auto channel (not remapped by design), USB MIDI input, a CC flood.
