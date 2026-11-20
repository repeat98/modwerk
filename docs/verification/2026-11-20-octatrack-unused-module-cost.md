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

## The change: machines rest

The base now answers `ev_in_use` for a machine's module (HOOKS.md): it rests while no track of any Part of the project,
working or saved, is that machine. That takes POLY8's three handlers out of the frame on its own. Its 11 frame-path
detours rest only once its package marks them `"rests"`, a POLY8 release of its own; a development build of POLY8
0.3.3 with those 11 marked (same module id and image) was built for the unit run below and is not published.

The other five modules in the table are not machines: each needs its own `ev_in_use` answer (HOOKS.md) to rest.
Effect modules (DSP code) are answered for by the base as well: they rest while no slot of the project names their
effect id and no live slot runs it. Euclid (2.5 points at rest in its own record, base 0.7.8, the Tresor Prep scene,
18 November) and Tape Echo (0.4) were not in the 24-package set; their figures are the same measure on another base
and scene, and come from their ColdFire detours in the frame, which their next releases mark resting.

## 0.7.11 on the MKII

The Windows RAM boot exceeded its 60-second reconnect window before a trial started. The later Mac comparison used the same compiler and Tracks + Main + Cue layout for both twins. Control `69354a52b1142a6b` came from `e58e9805afb8`. Candidate `fac1523234f4bb0b` came from `618040e7ed12`. A01 played on Part 4, whose working and saved copies matched. Seven FLEX tracks had trigs. USB audio varied on T1 and Main during these captures.

| Playing window | Control mean frame | Candidate mean frame | Control longest frame | Candidate longest frame |
|---|---:|---:|---:|---:|
| Empty | 51.8% | 51.0% | 88.6% | 90.5% |
| 24 published packages | 58.0% | 56.0% | 102.6% | 104.4% |
| Published POLY8 alone | 54.5% | 53.2% | 98.5% | 97.6% |
| 24 with private resting POLY8 | — | 54.1% | — | 96.1% |
| Private resting POLY8 alone | — | 51.0% | — | 91.5% |
| Empty, repeated | 51.9% | 51.0% | 90.0% | 90.1% |

The 24 published packages added 6.2 percentage points on control and 5.0 on candidate. Each cell is one approximately eight-second window. A longest frame above 100% exceeded its frame period. The guard counted zero skipped renders in these windows.

All 18 picks landed on T8 as requested. Each machine pick had a matched STATIC control. The two uncaptured POLY8 wakes added 2.6 and 2.7 points of steady frame time. SYNTIZ and Amiga showed no repeatable increase on this scene. No pick added a skipped render. The six USB recordings had no consecutive all-zero Main frames or repeated non-silent 128-frame blocks. The 24-package self-test with private POLY8 returned 24/24 modules intact and 1/1 DSP effect run. The flat 3% wake estimate remains provisional near the 85% admission threshold.

A later stopped VECTOR trial exposed a rollback failure on the candidate. The follow-up records the fix, the 30-second Undo on the exact release image, the 36 individual package readings and the slower MIDI soak. [VECTOR and package qualification](2026-11-20-octatrack-vector-undo.md)

## Host checks

- `test_machine_registry.c` (and `sdk/tests/test_machine_charge.c` on it): resting after two idle scans, the frame
  path of eight unowned FLEX tracks with two resting machines equal to the path with none, wake on pick before the
  commit, the wake margin at the busy line, rest on release, a pasted track silent and START-less until the next tick,
  a saved copy or another Part keeping a machine awake, no idle scans during a project load, a set change and a late
  machine awake for two scans, removal while resting, RENDER_FLEX never resting. Without the resting check in the
  render path two of them fail.
- `sdk/runtime/loader/tests/events_test.c` at 32 and 128 modules: a judged module leaves and rejoins only the resting
  rows by the machine's answer, keeps its table record, its resting site holds stock's bytes, admission accepts the
  site, `modwerk_runtime_resting_at`, and Undo of a trial over a resting module and over a woken one. Without the
  judged path in the loader 12 checks fail.
