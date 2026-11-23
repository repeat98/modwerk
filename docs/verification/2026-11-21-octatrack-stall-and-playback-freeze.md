# Octatrack 0.7.12 audio stall and playback freeze

## Field evidence

On base 0.7.12 (`254c5a75`), a tester's instrument logged an audio-frame stop and a subsequent UI freeze in separate boots. The unit records an audio stall at the start of the next boot. A UI freeze retains the boot and elapsed time at which the UI tick stopped.

| Incident | Observation | What would explain it |
| --- | --- | --- |
| Audio-frame stop with ten packages installed | CPU was 57.2%. A 513 µs frame interrupt preceded a 528 µs gap. The next entry was 172 µs late, two frames before the last. The last entry was on time. The watchdog found no eDMA error or ongoing effect change or install. | The timing fits the [documented late-entry window](../MODULE_PERFORMANCE.md). A controlled repeat with frame timing around the triggering operation would establish whether that entry caused the stop. |
| UI freeze during playback | At 4m28s into the following boot the sequencer was playing at about 142 BPM. CPU was 89.5%. Audio frames continued long enough to trip the five-second UI watchdog. The next boot restored all ten packages. | A repeat with UI hook timing and the same track assignments would help identify where the tick stopped. |

The retained event identifies nine installed packages from the released catalogue. One package remains unidentified. The field project, the exact gesture and the USB Audio settings at the instant of either incident are unknown. The two records provide separate observations of failure. The earlier [project-load stall](2026-11-19-octatrack-project-load-dsp.md) involved an effect placement in progress.

## Comparison on a physical Octatrack MKII

On the released base `254c5a75`, the instrument restored Screen Off and USB Audio from its card. A reversible trial added the eight identified packages from the release catalogue. The resulting ten-module inventory contained nine IDs from the field record. Screen Off was the extra module.

The trial ran for 345 seconds. Audio frames and UI ticks advanced in all 308 meter intervals over 5m13s, at 36.0% to 36.9% sampled CPU. The unit logged no crash, stall, UI freeze or skipped track. MIDI Start was sent, but the unit counted zero playing samples in its available five-minute window. Undo restored the two saved modules. Re-encoding the trial with the restored whole-set digest reproduced its original upload hash prefix.

A second run used development build `d24c5acb` for its panel and transport controls. It differs from the release in its development interface and DSP controller configuration. The PLAY key started pattern A01 at 140 BPM. After a short control with no modules, a trial loaded the five portable packages Mini Verb, Repitch, Play Modes, Beat Slicer and Tuner. The unit confirmed playback after PLAY and just before STOP, 4m42s later. All 280 meter intervals advanced both clocks. CPU ranged from 47.1% to 48.1%. The trial logged no crash, stall, freeze or skipped track, and Undo restored its starting set.

After the return to `254c5a75`, the unit restored Screen Off and USB Audio from its card. The whole-set digest, off list and saved/live module counts matched their pre-boot values. The crash and stall counters were unchanged.

Both failures remain open. The release comparison exercised nine of the field modules together. The panel comparison crossed the reported freeze time at a lower CPU load. A closer reproduction needs the tenth package, the track assignments or project, and the action immediately before the fault.

## Follow-up near the reported load

Both field freezes recorded the MKI keymap. The earlier freeze occurred at 76.9% CPU during playback, before the tenth runtime ID first appeared in a set record. The later record shows 89.5% CPU. The two sets of running effects had FILTER on all eight FX1 slots and DELAY on seven FX2 slots. T3 FX2 was COMP for the earlier freeze and PLATE REV for the later one. The runtime ID remains unidentified in the available package files and catalogue records.

Development build `d24c5acb` on the MKII played the STRETCH8 scratch project at 140 BPM. Mini Verb, Repitch, Play Modes, Beat Slicer and Tuner were installed in a temporary trial alongside Tape Echo running on T2 FX2. CPU averaged 88.2% and ranged from 86.6% to 90.7%. Of 296 readings, 166 fell between 88% and 91% and three read exactly 89.5%. The unit confirmed playback at both ends of the 4m56s measurement. Every interval advanced both the audio frame and UI tick counters. No new stall, freeze, crash or skipped render was logged. The largest frame gap in the five-minute device window that overlapped the run was 455 µs. That window included time outside the soak.

Undo removed the trial packages. Reloading STRETCH8 from disk restored the original FX assignments. One of the 6,322 working Part bytes differed from the pre-test snapshot after reload. No project save was performed. The unit returned stopped to the original TARGET project and pattern, then booted the original release image. The base identity, whole-set digest, inventory and saved/live counts matched the starting state. The result covers high-load playback on the MKII. The field reports came from an MKI with different project settings and packages.
