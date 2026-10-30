# MIDI Mute testing

## Build MM02 on a unit (author, 29 October 2026)

- **Image:** MM02 (SHA-256 `08f8ad28…f080`), the build the emulator runs below, sent with Elektron Transfer to the author's Analog Rytm MKII on OS 1.74.
- **Reported:** the author's first test on the unit worked as intended. Which steps, ports and channels it covered was not reported in detail.
- **Restored:** the author then sent the stock OS 1.74 back with Transfer, and the unit runs stock again.

## Build MM03 (rytm-emu, 30 October 2026)

MM03 is the current source. It differs from MM02 in one line: checking MUTE MIDI IN now also releases the notes MIDI holds on tracks that are already muted (case Y), where MM02 left them to their own Note Off. Image SHA-256 `b460740b…bf7d`, built and run as MM02 below. Counts come from runs without `DTBOOT_STEPS`: its 40M settle after each key release can swallow a MIDI event due at that clock, which once made a dropped Note On look as if it never came.

**Regression.** Cases A, A2, B, B2, C, C0, C1, C2, D, E, T1, T2, T3, T6 and T7 below gave the same counts on MM03 as on MM02.

| Case | MUTE MIDI IN | Input | Play | Release | Result |
| --- | --- | --- | --- | --- | --- |
| U | checked | BD muted, note dropped, BD unmuted (pad in MUTE mode), note on / off | 1 | 1 | unmuting plays the next note |
| K | checked | `B0 5E 01` (CC 94 mutes BD), auto note on / off | 0 | 0 | a CC 94 mute drops notes like a pad mute |
| K2 | checked | note held, then `B0 5E 01` | 1 | 1 | released on the CC 94 mute |
| K3 | checked | `B0 5E 01`, `B0 5E 00`, note on / off | 1 | 1 | a CC 94 unmute plays again |
| K0 | unchecked | note held, then `B0 5E 01` | 1 | 0 | stock: never released |
| W | checked | AUTO note 48 held on BD, TRK + SD (SD active), BD muted | 1 | 1 | the module releases BD (track 0, note 48); stock, unchecked, releases SD on the Note Off and leaves BD held |
| X | checked, then unchecked | BD muted, note dropped, box unchecked in PORT CONFIG, its Note Off, a new note on / off | 1 | 1 | the dropped note's Note Off is consumed; unchecked, the muted BD plays as stock |
| Y | unchecked, then checked | note held, BD muted (still held), box checked, then its Note Off | 1 | 1 | released when the box is checked; the late Note Off is consumed |
| R | checked, RECEIVE NOTES unchecked | nothing muted, note on / off | 0 | 0 | stock's RECEIVE NOTES still turns notes off before the module |
| P0-P3 | either | BD muted, MUTE mode left, BD pad or TRIG 1 | 1 | 1 | the same with the box checked and unchecked: pads and TRIG keys are stock's |

**Audio.** With `--analog-wav` (the emulator's model of the analog voices), a velocity-127 note for a muted BD peaked at -19 dBFS with the box unchecked and was silent with it checked. Whether a held note's release is audible could not be shown here: the factory BD decays within about 100 ms whether or not its note is held, and CC 79 / CC 80 at 127 did not change that.

**Sequencer.** With the factory pattern playing, the voice-trigger trace (`DTEMU_FRAME_TRACE=160,162`) gave the same 77 trigs on the same frames, after the PLAY offset, unchecked and checked. With 30 MIDI notes for SD (unmuted) while it played, every pattern trig stayed on its frame; the notes only added their own.

**Flood.** `flood.py` (seed 1) made 187,141 bytes for DIN at the wire rate, 59.9 s: 15,814 Note On / Note Off pairs (AUTO channel notes 0-3 and channels 1-4 notes 48-55, held 1-60 messages, 30 % of the releases as velocity-0 Note On, running status), 29,162 CCs, 5,847 clocks and 129 CC 94 mute toggles on channels 1-4, ending with every note released and channels 1-4 unmuted. Each run pressed PLAY, fed the flood, pressed STOP 30 s in, mid-note, and PLAY again 1.5 s later, at the factory tempo (127 BPM; 240 BPM was not set). The held-note counters of all 13 tracks (0x418f13e8) and the mute mask were read at the end.

| Image | Plays | Releases | Held at the end | Idle units over the flood |
| --- | --- | --- | --- | --- |
| core-ar2 0.7 alone | 15,814 | 15,814 | 0 on every track | 1,306,545 |
| MM03, unchecked | 15,814 | 15,814 | 0 on every track | 1,306,590 |
| MM03, checked | 9,040 | 9,040 | 0 on every track | 1,318,521 |

No hang or fault in any run. Checked, 6,774 Note Ons for muted tracks were dropped and every played note was released. The idle measure is rytm-emu's idle-skipped count from the status line; unchecked it is within 0.004 % of the core alone, and checked it is higher because fewer voices play.

**Cost per event.** From the compiled code: a played note takes about 55 instructions in the module (the site's stub and `midi_mute_note_on`) before stock's play routine, a dropped note about 35, and a Note Off about the same. The UI tick reads the mute mask and returns when it has not changed; on a new mute it scans that track's four words of held notes. Not timed on a unit.

**Beside other modules.** MM03's source linked with core-ar2 0.7 and Filter Hz 1.2.0 (pinned package), with Loop Sync 0.2.0 (pinned package), and with Filter Hz and Loop Sync 0.3.2 compiled from this checkout, all three together (MA03, `edec45ed…f746`). MA03 booted; cases A, B and C1 gave the same counts as on MM03; PORT CONFIG showed the row; Filter Hz's FRQ label read 21.1kHz on the FILTER page as on the same build without MIDI Mute. Loop Sync's own behaviour was not exercised.

**CREATE NEW.** LOAD PROJECT > CREATE NEW first saves the current project; the emulator hung in that save (SAVING 'PRESETS', the progress bar stopped), like the project load below. Stock was not run through this path, and that a new project starts unchecked is not tested.

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

- **The unit, case by case.** Beyond the author's report on MM02 above, no hardware case was recorded: the track channels, a note held while muting, USB against DIN, saving on the unit. MM03 has not run on a unit.
- **LOAD PROJECT and CREATE NEW.** That the setting comes back with a saved project, and that a new project starts unchecked (the emulator hangs on a project load, stock included, and in the save before CREATE NEW).
- **On the unit's clock.** CPU time per event and under the flood, measured with DTIM0; a flood at 240 BPM; a pattern or kit change during the flood.
- **USB timing.** A real USB host; the emulator's USB MIDI input is its own model.
- **Silent Pad+Trig and Retrig Grid** (core-ar2 0.3 submissions) were not built beside it.
