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
