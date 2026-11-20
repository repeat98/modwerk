# What an installed, unused module costs the Octatrack's frame

On 20 November 2026 an Octatrack MKII on OS 1.40C ran development twins of base 0.7.10 in RAM over USB. Every reading
used the same scene: bank A, pattern A01, Part 1, eight FLEX tracks of which T1 to T7 have two trigs, FILTER and DELAY
on every track but T1 (SPRING REV) and T5 (SPATIALIZER), no module assigned anywhere. A reading is the frame guard's
share of time in the frame interrupt over 8 seconds after 3 to 4 seconds of settling (`guard`), its longest frame, and
the mean of ten CPU meter readings (`stats`). Every set ran as a USB trial that rolled back.

## Where the cost is: base 0.7.10, twin `acc111da`

Playing, the 24 packages of the [0.7.10 dispatch record](2026-11-19-octatrack-idle-dispatch.md) installed and unused
added 6.1 points of frame interrupt (56.6 % to 62.7 %) and took the longest frame from 94.9 % to 107.2 % of a frame.
Stopped readings moved by up to 5.5 points between two empty runs (the delays' tails after a play), so this record
compares playing readings.

Each package alone (`npm run device:price`, playing, 56.9 % before):

| Module | Kind | What runs in the frame while unused | Points |
| --- | --- | --- | ---: |
| POLY8 0.3.3 | machine | handlers on `ev_play_increment`, `ev_voice_bind`, `ev_voice_bind_run`; 11 detours in the render, trig and sequencer code | 2.3 |
| Repitch 0.2.1 | playback policy | `ev_play_increment` handler; 3 detours in the increment builder and voice renderer | 1.4 |
| Slow LFO 0.1.0 | LFO setting | 4 detours in the audio and MIDI LFO engines | 0.5 |
| Mute Modes 0.2.2 | mute policy | `ev_voice_bind` handler; 5 detours in the voice, trig and tail paths | 0.3 |
| Track Solo 0.2.5 | panel tool | 2 detours at the frame interrupt's entry and exit | 0.2 |
| Tuner 0.1.0 | panel tool | 1 detour at the frame interrupt's exit | 0.1 |
| the other 18 | effects, scenes, UI tools, table machines (Amiga, SYNTIZ) | nothing: UI detours, tick, key and draw handlers, tables, DSP code only when picked | 0.0 |

The seven modules with frame code together added 5.6 points; the other 17 together 0.1. So no measurable part of the
cost is base work that grows with the number of installed modules (0.7.10's sparse dispatch removed the UI tick's), and
none of it is in the DSP: it is module code the frame interrupt enters while no track uses the module, through the
hooks that rest and through each module's own detours.
