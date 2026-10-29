# MIDI Mute testing

## Build MM02 on a unit (author, 29 October 2026)

- **Image:** MM02 (SHA-256 `08f8ad28…f080`), the build the emulator runs below, sent with Elektron Transfer to the author's Analog Rytm MKII on OS 1.74.
- **Reported:** the author's first test on the unit worked as intended. Which steps, ports and channels it covered was not reported in detail.
- **Restored:** the author then sent the stock OS 1.74 back with Transfer, and the unit runs stock again.

## Build MM02 (rytm-emu, 29 October 2026)

- **Source:** branch `module/rytm-midi-mute`, the working tree of this pull request's first commit.
- **Build:** compiled with `scripts/build-elemod-packages.mjs` (Homebrew m68k-elf GCC 16.2.0, binutils 2.47, Node 24.22.2) and linked with core-ar2 0.7 (`vendor/elekloader/catalog/core-ar2-0.7.elemod`) on the author's stock OS 1.74 (file SHA-256 `cb0f99d6…e123`) with the repository's own `linkMods` and ELE3 writer. Version string MM02. (MM01, the same code with the switch as a GLOBAL menu row, gave the same MIDI results.)
- **Emulator:** rytm-emu `3c4c42c`, `dtboot`, a fresh card, four NO presses for the calibration notices, then a snapshot. Every key and MIDI event sits at least 3M instructions off a chunk boundary.
- **What was counted:** visits to stock's per-track MIDI play routine (0x40083f40) and per-track release (0x4008420a), with `--count`. Note C0 on the AUTO channel (14) plays BD.

| Case | MUTE MIDI IN | Input | Play | Release | Result |
| --- | --- | --- | --- | --- | --- |
| A | unchecked | BD muted, DIN `9D 00 64` / `8D 00 00` | 1 | 1 | stock: the muted track plays |
| A2 | unchecked | BD muted, the same on USB MIDI | 1 | 1 | stock |
| B | checked | BD muted, DIN `9D 00 64` / `8D 00 00` | 0 | 0 | the note and its Note Off are consumed |
| B2 | checked | BD muted, the same on USB MIDI | 0 | 0 | consumed |
| E | checked | SD muted, BD note on / off | 1 | 1 | an unmuted track plays as stock |
| D | checked | nothing muted, note on / off | 1 | 1 | passthrough |
| C0 | unchecked | note on, then BD muted, no Note Off | 1 | 0 | stock: the note is never released |
| C1 | checked | note on (DIN), then BD muted, no Note Off | 1 | 1 | released by the module on the mute |
| C2 | checked | note on (USB), then BD muted, no Note Off | 1 | 1 | released on the mute |
| C | checked | note on, BD muted, then the Note Off | 1 | 1 | released once on the mute; the late Note Off is consumed |
| T0 | unchecked | nothing muted, BD's track channel (1) `90 30 64` / `80 30 00` | 1 | 1 | stock: a track channel plays notes 12-59 chromatically |
| T1 | unchecked | BD muted, the same | 1 | 1 | stock: the muted track plays |
| T2 | checked | BD muted, the same on DIN | 0 | 0 | consumed |
| T3 | checked | BD muted, the same on USB MIDI | 0 | 0 | consumed |
| T4 | checked | SD muted, BD's channel | 1 | 1 | an unmuted track plays as stock |
| T5 | checked | channel 1 note held, then BD muted, no Note Off | 1 | 1 | released on the mute |
| T6 | checked | two notes held on channel 1 (48 and 55), BD muted, then both Note Offs | 2 | 2 | both released on the mute; both late Note Offs consumed |
| T7 | checked | nothing muted, note on, then `90 30 00` | 1 | 1 | a Note On with velocity 0 releases as a Note Off |

**Power cycle.** With MUTE MIDI IN checked, `--power-off` ran stock's power-fail save (13.0M instructions, 4096 sectors to the card's state slots); a cold boot of MM02 on that card showed MUTE MIDI IN still checked in PORT CONFIG.

**SAVE PROJECT AS and LOAD PROJECT.** SAVE PROJECT AS to slot 002 finished (its progress bar, then the menu). After LOAD PROJECT of that slot showed LOAD OK, the emulator hung: the CPU stayed at 0x40000d00 with interrupts masked, taking vector 98 about once an instruction. Stock OS 1.74 and core-ar2 0.7 alone hang the same way at the same clock with the same input, so this is rytm-emu `3c4c42c`, not the module, and a reload of the saved project could not be checked here.

Stock's note-on routine plays notes 0-11 as the pads' drum map and 12-59 chromatically on the tracks of the note's channel; it ignores 60 and up, on every channel. The track channels are stock's defaults, BD on 1 to the FX track on 13, read from the live globals.

PORT CONFIG shows MUTE MIDI IN as its last row, after RECEIVE CC/NRPN, unchecked on a fresh card; YES checks it, LEFT unchecks it and RIGHT checks it again, each redrawn at once ([port-config-off.png](media/port-config-off.png), [port-config-on.png](media/port-config-on.png)). The checked state then drove cases B to C. MUTE mode's pads set the project mute mask on this build as on the core alone (MIDI OUT `B0 5E 01`).

## Not tested

- **The unit, case by case.** Beyond the author's report above, no hardware case was recorded: the track channels, a note held while muting, USB against DIN, and saving on the unit.
- **LOAD PROJECT.** That the setting comes back with a saved project when it is loaded again (the emulator hangs on any project load, stock included).
- **Flood and performance.** No wire-rate flood of notes, CC and clock, no pattern change while playing, no CPU measurement.
- **Other modules beside it.** Not built with any other Rytm module.
