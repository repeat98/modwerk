# MIDI Mute testing

## Timing on the author's unit (measurement build MP02, 30 October 2026)

MP02 is MM04 with timing added, built only for this measurement and not part of the module: each handler reads DMA timer 0 (free running at the 132 MHz bus clock, as core-ar2 starts it) on entry and exit, and the PORT CONFIG row shows `N<average>/<worst> T<worst>` in microseconds in place of MUTE MIDI IN. The note figure covers the module's own work in the note-on and note-off handlers, up to the call into stock's play or release; the tick figure covers the whole UI tick handler, stock's release calls for newly silenced tracks included. Both are wall-clock times: anything that interrupts the task between the two reads counts too.

In rytm-emu 3c4c42c a 5 s flood read N0.2/0.3 T3.9. On the unit, with MUTE MIDI IN checked, after the bench's two 60 s floods (USB, then DIN through the AF16Rig; about 9,500 Note On/Off pairs, 33,000 CCs, 119 mute and 46 solo toggles each), the author read **N3.3/587.8 T1986.1**:

- **3.3 µs per incoming note on average:** the module's cost per Note On or Note Off on the unit, about 0.3 % of the 1 ms between notes at DIN's wire rate.
- **587.8 µs worst note:** dominated by interruptions of the MIDI task between the two reads (the handler is about 55 instructions with no loop).
- **1986.1 µs worst UI tick:** the tick after a mute or solo change calls stock's release once per note MIDI holds on the newly silenced track, and the UI task is interrupted by everything above it; how this splits between the module, stock's release and interruptions was not measured.

The first flood's after-flood silence check failed on a decaying tail: the kit had reverb and delay on, and the flood's CCs had given BD a long decay; its level fell steadily from -40 to -90 dBFS over 1.5 s, which a stuck note would not. The bench now judges the last second of four.

## Stock OS 1.74 on the author's unit: the baseline (30 October 2026)

To check that the unchecked runs really show stock behaviour, the author flashed Elektron's stock OS 1.74 (no module, no core) and the bench ran its full set as a stock baseline, in the author's own project (AUTO channel 15, PROG CH RECEIVE on), over USB and then over DIN through the AF16Rig, the flood with solo toggles, Start/Stop and 14 pattern changes.

- **USB, all 15 steps stock:** the muted BD heard on the AUTO channel and on channel 1 (notes 12, 36, 48, 59); another track muted, BD heard; a held BD note rang on after the CC 94 mute and after SD was soloed; with SD soloed BD heard; BD soloed and muted heard; after the flood (9,446 pairs, 32,905 CCs, 119 mute and 46 solo toggles) silent, then a new note heard.
- **DIN, 12 steps stock, 3 inconclusive:** the same results for every drop, solo and flood step (9,482 pairs, 32,965 CCs). The three held-note steps were inconclusive: the USB flood before them had changed BD's sound with CC 16-23, and it no longer rang while held. The bench now runs every port's floods last.

Every result matches MM04 with MUTE MIDI IN unchecked, step for step: unchecked, the module changes nothing the bench can see.

**Back on MM04, reported by the author:** after flashing MM04 again and reloading the project, MUTE MIDI IN was still checked: the project kept the module's bit through the stock OS. A live session followed, sequencing from an external sequencer and from the Rytm's own sequencer, using both mutes and solos; the author reported that everything behaved as expected.

## Build MM04: solo (rytm-emu, 30 October 2026)

MM04 adds solo: a track is now silenced as the sequencer silences it, every track but the soloed ones while any is soloed, otherwise the muted ones. Image SHA-256 `98089be3…4ae9`, built and run as MM03 below; MM03's hardware results above and below were taken before this change and have not been repeated on MM04.

**Stock's rule, observed first** (core-ar2 0.7 + the module, the factory pattern playing, voice trigs from `DTEMU_FRAME_TRACE=160,162`): MIDI CC 93 on a track's channel writes the project's solo mask (0x4131899b), as CC 94 writes the mute mask. With SD soloed only SD's trigs remained; with SD soloed and muted SD still played; with SD and RS soloed both played. No MUTE-mode gesture tried (pads held with MUTE, FUNC or TRK, a long pad hold) wrote the solo mask, so the panel gesture is not known here.

**Regression.** All 20 cases of the MM03 matrix gave the same counts on MM04.

| Case | MUTE MIDI IN | Input | Play | Release | Result |
| --- | --- | --- | --- | --- | --- |
| S0 | unchecked | SD soloed (`B1 5D 01`), BD note | 1 | 1 | stock: BD plays |
| S1 | checked | SD soloed, BD note | 0 | 0 | dropped |
| S2 | checked | SD soloed, SD note on channel 2 | 1 | 1 | the soloed track plays |
| S3 | checked | BD soloed and muted, BD note | 1 | 1 | plays: solo wins, as in the sequencer |
| S4 | checked | BD note held, then SD soloed | 1 | 1 | released on the solo |
| S5 | checked | SD soloed then unsoloed, BD note | 1 | 1 | plays again |
| S6 | checked | BD muted, SD soloed then unsoloed, BD note | 0 | 0 | BD is still muted |
| S7 | checked | BD and SD soloed, BD note | 1 | 1 | plays |
| S8 | checked | BD and SD soloed, RS note (AUTO note 2) | 0 | 0 | dropped |
| S9 | checked | BD held, BD muted, SD soloed, unsoloed | 1 | 1 | released once, on the mute |

**Hardware bench.** The bench (`rytm_mute_test.py`) gained three solo steps (another track soloed; this track soloed and muted; a held note, then another track soloed). Against its simulated unit they passed for the module checked and unchecked and failed for stock behaviour where they should.

**On the author's unit (MM04, 30 October 2026).** Same setup as MM03 below (USB MIDI, the Rytm's USB audio channel 2, BD on channel 1, AUTO channel 15, a ringing BD sound, MUTE MIDI IN and RECEIVE CC/NRPN checked), with the box checked:

| Step | Result |
| --- | --- |
| calibrate | BD heard, -16 dBFS over a -86 dBFS floor |
| drop-track | BD muted: silent on channel 1 |
| drop-auto | silent, but not a valid result: the unchecked run right after showed AUTO-channel notes (channel 15) playing nothing even with BD unmuted, so the unit's AUTO channel was no longer 15 |
| held-baseline | rings while held, stops at its Note Off |
| held-mute | stopped 60 ms after the CC 94 mute |
| solo-other | SD soloed with CC 93: BD silent |
| solo-self-muted | BD soloed and muted: BD heard |
| solo-held | BD held, then SD soloed: stopped 65 ms after the solo |

All 8 steps reported PASS; drop-auto does not count (above). A first attempt stopped at calibrate: BD's channel read -15 dBFS during the silence check, just after flashing; a second later every channel was below -80 dBFS and the run above followed. **Unchecked baseline (MM04, right after):** drop-track heard the muted BD (stock); the held note kept ringing after the CC 94 mute (stock); with SD soloed BD was heard (stock); BD soloed and muted was heard; a held BD note kept ringing after SD was soloed (stock). drop-auto was silent, against stock's expectation, three times in a row; a probe then showed AUTO-channel 15 notes 0 and 1 silent with BD unmuted too, while channel 1 played, so the unit was not receiving the AUTO channel on 15 and the AUTO steps of both MM04 runs are void. The cause: the author was still in the new project made for the CREATE NEW check, whose MIDI channels are the defaults (AUTO 14, PERF 15), not the author's own (AUTO 15, PERF 14).

**Rerun on AUTO channel 14 (MM04, same project):** unchecked first: drop-auto and drop-track heard the muted BD, SD soloed left BD heard, BD soloed and muted heard (stock everywhere). Then checked: the bench's new AUTO-channel check heard the AUTO note before the tests; drop-auto and drop-track silent; held note stopped 80 ms after the CC 94 mute; SD soloed, BD silent; BD soloed and muted, heard; held BD note stopped 60 ms after SD was soloed. All 9 checked steps passed, and with the void steps above replaced, every MM04 step on the unit now has a valid result.

**DIN MIDI (MM04, same project, box checked).** The bench sent everything through the author's AF16Rig, its DIN 2 output cabled to the Rytm's MIDI IN, and recorded the Rytm's USB audio as before. All 15 steps passed: the AUTO-channel check heard the AUTO note; drop-auto, drop-track and track-channel notes 12, 36 and 59 silent for a muted BD; another track muted, BD heard; held note stopped 70 ms after the CC 94 mute; SD soloed, BD silent; BD soloed and muted, heard; held BD note stopped 75 ms after SD was soloed; the 60 s flood (9,469 Note On/Off pairs, 33,065 CCs, 5,760 clocks, 119 mute toggles, about 870 messages a second handed to the interface) left BD silent afterwards and a new note heard. How much of the flood the interface delivered at DIN's wire rate was not measured.

**Flood with solo (MM04, box checked).** The bench's flood gained CC 93 solo toggles on channels 1-4, about one every 1.3 s, all cleared at the end. Over USB: 9,435 Note On/Off pairs, 32,997 CCs, 5,760 clocks, 119 mute and 46 solo toggles in 60 s (about 870 messages a second); over DIN through the AF16Rig: 9,494 pairs, 33,108 CCs, 5,760 clocks, 119 mute and 46 solo toggles. Both times BD was silent once everything was released, unmuted and unsoloed, and a new BD note was heard.

**Pattern changes and the unchecked baseline over DIN (MM04, the author's own project, AUTO channel 15, PROG CH RECEIVE on).** The flood also sent MIDI Start, a Program Change on channel 15 every 4 s (14 in all, patterns A01-A04 at random) and Stop at the end. The author saw the unit on A03 afterwards, so the changes arrived; whether each one switched pattern and kit was not observed.

- Unchecked, over DIN, all 15 steps behaved as stock: the muted BD heard on the AUTO channel and on channel 1 (notes 12, 36, 48, 59), held notes ringing on after a mute and after another track's solo, BD heard while SD was soloed; after the flood (9,473 pairs, 32,869 CCs, 119 mute and 46 solo toggles, 14 pattern changes) silent, then a new note heard.
- Checked, the same flood over USB (9,482 pairs, 32,965 CCs) and over DIN (9,473 pairs, 32,871 CCs), each with 119 mute and 46 solo toggles and 14 pattern changes: BD silent afterwards and a new note heard, both times. The test note peaked at -30 and -33 dBFS here, against -8 before: after the pattern changes the unit played a different kit.

## Build MM03 on a unit (author's Rytm MKII, 30 October 2026)

- **Image:** MM03 (SHA-256 `b460740b…bf7d`) on the author's Analog Rytm MKII, OS 1.74, sent with Elektron Transfer.
- **Setup:** PORT CONFIG with INPUT FROM including USB, RECEIVE NOTES, RECEIVE CC/NRPN and MUTE MIDI IN checked; BD on track channel 1, AUTO channel 15; BD given a sound that rings while its note is held. Sequencer stopped.
- **Bench:** a script on the author's Mac (Python, mido and sounddevice) sent MIDI to the Rytm's USB MIDI port and recorded the Rytm's USB audio, channel 2 (BD's own voice; MAIN and the other voices stayed below -79 dBFS when only BD played). It muted and unmuted BD with CC 94 on channel 1, the project mute the pads set, and judged each step from the recording: sound is above -60 dBFS (the noise floor was -86 dBFS).

| Step | Input | Expected with the box checked | Result |
| --- | --- | --- | --- |
| calibrate | BD unmuted, channel 1 note 48 | heard | heard, -9 dBFS: PASS |
| drop-auto | BD muted, AUTO channel note 0 | silent | silent: PASS |
| drop-track | BD muted, channel 1 note 48 | silent | silent: PASS |
| channel notes | BD muted, channel 1 notes 12, 36, 59 | silent | silent, each: PASS |
| other muted | SD muted, BD note | heard | heard: PASS |
| held baseline | BD note held 2 s, then its Note Off | rings while held, stops at the Note Off | both: PASS |
| held mute | BD note held, BD muted 0.7 s in | stops within 150 ms | stopped 50 ms after the mute: PASS |
| flood | 60 s over USB: 9,511 Note On/Off pairs (AUTO channel notes 0-3, channels 1-4 notes 36-59, 30 % of releases as velocity-0 Note On), 32,975 CCs on channels 1-4, 5,760 clocks (240 BPM), 119 CC 94 mute toggles; about 870 messages a second; then every note released and channels 1-4 unmuted | silent 1 s later; a new BD note heard | silent, then heard: PASS |

**Stock baseline, box unchecked** (same setup, right after): calibrate heard BD; drop-auto, drop-track and channel notes 12, 36 and 59 all heard the muted BD, as stock plays it; another track muted, BD heard; after the flood (9,496 pairs, 33,131 CCs, 5,760 clocks, 119 mute toggles, about 870 messages a second) silent, then a new note heard. The held steps were inconclusive there: the checked run's flood had changed BD's sound with CC 16-23, and it no longer rang while held. After the author restored a ringing BD sound, the held steps ran again, still unchecked: the note rang while held and stopped at its Note Off (baseline), and with BD muted 0.7 s into a held note it kept ringing to the end of the take, as stock leaves it. Then, with the box checked again and the same sound, the held note stopped 130 ms after the CC 94 mute was sent (PASS). With this sound a plain Note Off fades below -60 dBFS 25-35 ms after it, from a quieter point late in the note; the rest is the wait for the module's UI tick and the trip over USB, so the release after a mute measured 50 and 130 ms on two runs.

All 11 checked steps passed. The first two attempts failed for setup reasons, not the module: BD had been muted by hand before calibration, and then RECEIVE CC/NRPN was unchecked, so the Rytm ignored CC 94 and BD was never muted (every drop step heard BD, as stock does). With RECEIVE CC/NRPN checked, the run above passed.

**By hand, reported by the author (MM03):**

- **Saving and reloading:** with MUTE MIDI IN checked, the project saved and reloaded with the box still checked, and it was still checked after a power cycle. Reported as working as expected.
- **CREATE NEW:** a new project opened with MUTE MIDI IN unchecked.
- **Pad mutes:** muting a track with its pad in MUTE mode silenced incoming notes for it, a note held while the pad muted the track stopped, and after unmuting the next note played. Reported as working.
- **Live use:** with notes coming from an external sequencer, muting and unmuting tracks with the pads in MUTE mode worked as intended. A full live performance has not been played with it yet.

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

**CREATE NEW.** LOAD PROJECT > CREATE NEW first saves the current project; the emulator hung in that save (SAVING 'PRESETS', the progress bar stopped), like the project load below. Stock was not run through this path here; that a new project starts unchecked was checked on the unit instead (above).

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

- **The unit, still open.** How the worst UI tick (about 2 ms) splits between the module, stock's release calls and interruptions.
- **On the unit's clock.** CPU time per event and under the flood, measured with DTIM0; a flood at 240 BPM; a pattern or kit change during the flood.
- **USB timing.** A real USB host; the emulator's USB MIDI input is its own model.
- **Silent Pad+Trig and Retrig Grid** (core-ar2 0.3 submissions) were not built beside it.
