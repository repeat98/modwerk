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

## Not yet on the unit

No after-figure exists yet. On 20 November 2026 the unit was off USB from about 10:30 (another session's RAM boot) until
the owner's power cycle, then held by other sessions. At 15:02 the run of `block2.sh` RAM-booted the before twin of 0.7.11
(`12108493`, base/octatrack-next without this change); the boot tool reported it had not come back within 60 s, the
script stopped there as written, and the unit was in fact up on that twin a few seconds later. No trial ran. At 15:07 the
flashed image the unit started on (`dfa43813`, 0.7.9) was RAM-booted back: identity `dfa43813`, the same ten kept
modules in the same order (Tape Echo, Air Chorus, Vibrato, VECTOR, BBD Delay, Mini Verb, E-Verb, Euclid, TapeHead,
Analog BD). That base answers no development requests, so the Part was not read; no step of the run changed one.

The after twin of this change on 0.7.11 is `4a6060b6`. The planned run, in `block2.sh`: empty, the 24 published and the
other 12 packages (every USB package in sets that fit, at most 32 modules a set and the pool) on both twins, the 24 with
the development POLY8 (11 detours resting), POLY8 alone, picks of resting POLY8, SYNTIZ and Amiga on T8 while playing
(the frame guard over the window holding the wake, a STATIC pick as control: the wake cost and its spread), the same
with a USB capture checked for zero runs, a self-test with the 24, a 120 s soak at 20 operations a second, and the
test procedure's unit steps by hand.

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
