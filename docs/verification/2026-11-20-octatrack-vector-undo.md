# VECTOR Undo and individual package costs on Octatrack 0.7.11

20 November 2026 · Octatrack MKII · Elektron OS 1.40C · Tracks + Main + Cue

## VECTOR rollback

A 30-second stopped whole-set trial of the released VECTOR 0.3.2 left the previous 0.7.11 development image `fac1523234f4bb0b` in recovery at generation 7. A fresh connection and the standard recovery command also failed. After the owner power-cycled, the 0.7.9 base, set digest, and all ten ordered inventory entries matched the original snapshot.

The loader now evaluates a departing track machine's own stock menu definitions as they will read after the switch restores them. A separate cached callback and all working and saved Part signatures are still checked live. A host regression exercises all three cases. The original unit log reported the recovery state without identifying the particular reference that blocked it.

| Physical trial with VECTOR alone | What Undo restored |
|---|---|
| Matched development build `a7227df2ba0bc27e`, original preceding set sequence, 30 seconds stopped | Normal, generation 8, original empty inventory and set digest |
| Same build, 30 seconds stopped again | Normal, generation 12, same baseline |
| Same build after playback | Normal, generation 14, same baseline |
| Controller-enabled development build `be86323a387211a5`, 30 seconds stopped | Normal, generation 2, same baseline |
| Release candidate `a08a1557c5bd7d04b6b0615361f059ac99ba2bc40f8a7e3b86842db2ccbbb5bd`, 30 seconds stopped | Normal, generation 2, exact starting inventory and set digest |

Each comparison and release trial ran through the hardware USB loader. The tested release candidate was RAM-booted. The unit returned to its flashed 0.7.9 base and the ten original modules after the release trial.

## Package measurements

The controller-enabled development build `be86323a387211a5f8ac3c255ac00da121de78854835dc518e50dc1587fd36b8` ran each of the 36 portable published packages alone. The five packages bound to specific release base identities are outside this pool. Each session began on A01 with T1 and the clean Part 4 selected. Kits can select another Part when playback starts. The repeat below names the Part observed in its measurement windows. Its working and saved copies and the current pattern matched the comparison scene. Part 1 had a different hash when this session acquired the unit again. Its contents were preserved from entry to exit.

Each package had an eight-second empty-base reading and an eight-second installed reading, with playback and advancing frames verified in each window. For FX packages, the available assigned reading is on T1 and uses the same empty-base reference. Each installed module and each completed Undo were checked. The columns give mean audio-frame interrupt time as a percentage of a frame and signed differences in percentage points. The 0.2-point test applies to the difference between the empty and installed windows. Values are individual paired observations at 0.1-point resolution. Differences include variation between playback windows. The table uses the warm E-Verb repeat and the matched-Part repeats for Kits and Tuner. Seven of the reported pairs exceeded +0.2 points.

| Released package | Version | Empty | Installed | Added at rest | Added on FX slot |
|---|---|---:|---:|---:|---:|
| FM Synth | 0.1.4-experimental | 51.4% | 53.7% | +2.3 | — |
| Repitch | 0.2.1-experimental | 51.5% | 53.7% | +2.2 | — |
| POLY8 | 0.3.3-experimental | 51.5% | 53.7% | +2.2 | — |
| Euclid | 0.1.5-experimental | 51.4% | 53.6% | +2.2 | +4.3 |
| Tape Echo | 0.1.6-experimental | 51.5% | 52.4% | +0.9 | +9.3 |
| Slow LFO | 0.1.0-experimental | 51.5% | 52.4% | +0.9 | — |
| Mute Modes | 0.2.2-experimental | 51.4% | 52.1% | +0.7 | — |
| DirectJmp Kyoti | 0.1.2-experimental | 51.3% | 51.5% | +0.2 | — |
| Tuner | 0.1.0-experimental | 51.4% | 51.6% | +0.2 | — |
| SC Ringmod | 0.2.1-experimental | 51.5% | 51.6% | +0.1 | +0.1 |
| Preview Vol | 0.1.2-experimental | 51.4% | 51.5% | +0.1 | — |
| Apply Scene | 0.2.0-experimental | 51.4% | 51.5% | +0.1 | — |
| VECTOR | 0.3.2-experimental | 51.5% | 51.6% | +0.1 | — |
| BBD Delay | 0.1.2-experimental | 51.4% | 51.5% | +0.1 | +0.1 |
| SAMPLE LOCKS | 0.1.9-experimental | 51.4% | 51.5% | +0.1 | — |
| MIDI Scenes | 0.3.0-experimental | 51.4% | 51.5% | +0.1 | — |
| Vibrato | 0.1.0-experimental | 51.3% | 51.4% | +0.1 | +0.2 |
| TapeHead | 0.1.2-experimental | 51.5% | 51.5% | +0.0 | +0.0 |
| Air Chorus | 0.1.3-experimental | 51.5% | 51.5% | +0.0 | -0.1 |
| LOFI2 | 0.1.1-experimental | 51.5% | 51.5% | +0.0 | +0.1 |
| Scale Quantizer | 0.1.4-experimental | 51.5% | 51.5% | +0.0 | — |
| Quant Live Rec | 0.1.1-experimental | 51.5% | 51.5% | +0.0 | — |
| Arp Key Locks | 0.1.0-experimental | 51.5% | 51.5% | +0.0 | — |
| beat-slicer | 0.1.66-experimental | 51.5% | 51.5% | +0.0 | — |
| Temp Save | 0.1.1-experimental | 51.5% | 51.5% | +0.0 | — |
| Bar LED | 0.1.0-experimental | 51.5% | 51.5% | +0.0 | — |
| tiempos | 0.1.0-experimental | 51.5% | 51.5% | +0.0 | — |
| Track Solo | 0.2.5-experimental | 51.4% | 51.4% | +0.0 | — |
| Amiga | 0.3.0-experimental | 51.5% | 51.5% | +0.0 | — |
| Butter Fingers | 0.1.0-experimental | 51.5% | 51.5% | +0.0 | — |
| E-Verb | 0.1.2-experimental | 51.5% | 51.4% | -0.1 | +0.1 |
| Mini Verb | 0.2.3-experimental | 51.4% | 51.3% | -0.1 | +0.2 |
| Play Modes | 0.1.1-experimental | 51.5% | 51.4% | -0.1 | — |
| Deja Vu | 0.1.0-experimental | 51.5% | 51.4% | -0.1 | — |
| Kits | 0.1.0-experimental | 56.6% | 56.5% | -0.1 | — |
| syntiz | 0.1.0-experimental | 51.5% | 51.3% | -0.2 | — |

E-Verb was the first package after boot. Its initial empty window read 53.0%. On a warm repeat, empty read 51.5% and installed read 51.4%, a difference of -0.1 points. Both trials rolled back.

Kits first measured 51.5% empty and 56.6% installed (+5.1 points). The following empty control stayed at 56.5%. A warm repeat measured 56.5% empty and 56.6% installed (+0.1 points). After another RAM boot, Kits measured 51.4% empty and 56.6% installed (+5.2 points). Its empty window played Part 4 and its installed window played Part 1. After Undo, the empty base measured 56.5%. The large increase tracked the change of playback Part.

With empty and installed both playing Part 1, Kits measured 56.6% empty and 56.5% installed (-0.1 points).

Tuner followed Kits in the first session and initially measured +0.4 points. With Part 4 confirmed in both windows on a fresh session, it measured 51.4% empty and 51.6% installed (+0.2 points).

Vibrato's first run rolled back and restored the entry scene at exit. The runner could not verify the scratch Part before Undo, so the table uses the separately verified repeat.

## Transport and pattern soak

The 24-package set included the private POLY8 build with its 11 resting detours. The first run at 20 operations per second was interrupted by the owner after 86.1 seconds, 1,722 operations and 141 observed pattern changes. USB communication stopped at that point. The next connection verified the flashed base and its ten kept modules.

At the owner's requested slower pace, seed 1849 sent 120 operations at one per second over 121.7 seconds. The preflight verified MIDI START and A01/A02 program changes on channel 11. The monitor observed 16 pattern transitions and passed its frame, UI tick, crash, stall and loader-error checks. The measured peak CPU was 68.5%.

Undo restored the starting set after the soak. A01, A02 and all four working and saved Parts matched their pre-run hashes. The original Part and track selection, flashed base `dfa438130710fea9`, kept set `100ed1fccfd7bd6b` and its ten ordered modules matched at exit.
