# Octatrack UI dispatch with 24 modules installed

On 19 November 2026 an Octatrack MKII running OS 1.40C booted two development builds of the cumulative 0.7.10 base into RAM over USB. The base identities were `759f357abe618c016e224586b168de6b602421981ce9f2f0c8a894e2ad5e6a91` before the dispatch change and `88d2e287d2db942e2894b21d7e303433bc48511b4b71a66ff1e512bd98f88dbb` after it. Both used the same build options, with profiling enabled and empty controller trust rows.

Both runs used pattern A01, saved Part 4, track 3 selected, with FILTER and DELAY on all eight tracks. Each began with an empty inventory, then repeated the measurements with the same 24 packages in a single USB trial. The test left the track assignments as saved and made no module selections.

| Installed | Transport | Runtime per UI tick, µs (before → after) | CPU meter, % (before → after) | Time in frame interrupt, % (before → after) |
| --- | --- | ---: | ---: | ---: |
| 0 | Stopped | 18.6 → 3.6 | 34.7 → 34.3 | 23.3 → 23.2 |
| 0 | Playing | 34.8 → 5.4 | 56.2 → 55.4 | 39.1 → 38.4 |
| 24 | Stopped | 38.6 → 22.2 | 45.9 → 45.1 | 34.3 → 33.6 |
| 24 | Playing | 110.9 → 52.2 | 59.7 → 59.5 | 50.9 → 50.7 |

The runtime column is the median of three 3-second `profile:3` windows, each about 180 ticks. It includes the subscribed tick handlers. CPU is the mean of ten `stats` readings. The final `guard` reading in each case reported zero skipped renders. On the changed build the installed set still added 10.4 percentage points of frame-interrupt time while stopped and 12.3 during playback. The measurements cover the set as a whole.

The set comprised LOFI2, Preview Vol, Apply Scene, Repitch, POLY8, Scale Quantizer, Play Modes, Mute Modes, Quant Live Rec, DirectJmp Kyoti, Deja Vu, Arp Key Locks, Beat Slicer, Temp Save, Slow LFO, Bar LED, Tiempos, Syntiz, Track Solo, Sample Locks, Amiga, MIDI Scenes, Tuner and Butter Fingers. Seven packages registered a tick handler, three a draw handler, five a key handler and five an encoder handler. Both trials verified the package hashes before installation and returned to the starting inventory and active identity on Undo.

After each run, the four Parts' working and saved hashes matched the starting hashes, with Part 1 and track 3 selected again. After the developer power-cycled the unit, USB reported the original flashed base `dfa43813` and the same ten modules. The developer reported their usual pattern sounded normal after the reboot.

## POLY8 installed on no track

On the same MKII and OS 1.40C, development build `06e08f35` ran pattern A01 with saved Part 4, track 3 selected and no POLY8 machine assigned. This Part had a different saved hash from the earlier comparison. Four whole-set trials used 23, 24, 24 and 23 packages in that order. Each used the packages above at the same hashes. The only difference between sets was POLY8 0.3.3-experimental (`1d9e9eca`). Each Undo restored the starting inventory and active identity.

| Measure | 23 stopped | 24 stopped | 23 playing | 24 playing |
| --- | ---: | ---: | ---: | ---: |
| Time in frame interrupt, % | 32.0 | 34.1 | 55.3 | 58.4 |
| CPU meter, % | 43.3 | 45.6 | 61.2 | 64.0 |

Both runs of each set gave the same frame-interrupt share to one decimal place, across at least 53,000 frames per reading. The CPU meter is the mean of 20 readings per cell. Installing unused POLY8 added 2.1 percentage points of frame time stopped and 3.1 playing. The longest frames during the two 24-package playback runs reached 103.1% and 103.5% of one frame. The guard reported zero skipped renders in all four trials.

After these four trials, the starting pattern, selected Part and track, and all four Parts’ working and saved hashes matched their initial values.

## Micro Timing and whole-set Undo

On development build `06e08f35`, the MKII ran the draft Micro Timing package `f5b96821` in RAM. With MICRO T highlighted in TRACK TRIG EDIT, the trial expired and Undo waited in recovery. Closing the page and running `device recover` restored the original inventory and base identity without restarting. The test left LEVEL untouched and the pattern hash was identical before and after.

The MKII then booted release build `694ddc855858d8a6f23503a230f0f24ef95dc9ae92c3377844878258f3725a40` into RAM. The 24-package set above and the same set with Micro Timing added each installed and rolled back as a single trial. Both ended with the starting inventory and active identity. The device logged no crash, stall, freeze or skipped track in either trial. The release tests covered installation and Undo while stopped. Playback with all eight delay sends open, Part switches during playback and audible Analog BD rollback remain unverified on this build.

A USB RAM boot of the original 0.7.9 base (`dfa43813`) restored the ten starting modules. Every module ID, name, handle and layout matched the inventory recorded before the first boot. All trials used RAM and the test did not use Keep.

## Track-machine lookups on the UI tick

On the MKII running OS 1.40C, baseline twin `06e08f35` repeated the empty and 24-package comparison twice on the saved Part used in the POLY8 comparison above. All eight tracks used FLEX, with SPRING REV on T1 and SPATIALIZER on T5. Installing the 24 packages increased frame-interrupt time by 4.0 percentage points stopped and by 6.3 and 6.4 points during playback. Both empty readings were 30.1% stopped and 52.0–52.1% playing. Both full readings were 34.1% and 58.4%.

The registry used to resolve each track's machine separately for the CPU budget and the DSP voice charge. A host fixture with two installed machines and eight FLEX tracks counted 16 lookups per charge pass. Reusing the owners within that tick brought it to eight. The next tick reads the Part again.

With the same 24 unused packages, two alternating trials on each development twin used five seconds of playback and four seconds stopped before taking measurements. Each table cell contains the medians for two trials, each from three `profile:3` windows.

| Development twin | Module UI tick stopped, µs | Module UI tick playing, µs |
| --- | ---: | ---: |
| Baseline `06e08f35` | 54.7, 54.6 | 69.3, 71.2 |
| Reused owners `ed563610` | 50.0, 50.1 | 63.6, 63.4 |

All four trials returned to the starting active identity and empty inventory and restored both pattern hashes and all four Parts' working and saved hashes. The guard counted zero skipped renders in the measured windows. The longest playback frame reached 103.5% of one frame. These timings cover the profiler's module UI tick section, which includes the machine registry. The whole-chain timing varied between runs.
