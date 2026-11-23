# Octatrack: the transport word in each stopped state, and late entries past the wait (23 November 2026)

The owner's MKII, OS 1.40C, CF card in, project LIVE/Dev17, Part 1, pattern C01, empty module inventory. Read over USB
with `mem:` on development bases; every run in RAM, nothing kept, nothing saved. MIDI went through
`scripts/octatrack-midi-bridge.py` on the Windows host. Why: octabam (Sam Banks, `docs/firmware/STEM_REC.md`) reads the
transport long at `0x800065b8` as 0 stopped and rewound, 1 running and 2 "stopped by the STOP key, position kept", and
base 0.8's `modwerk_machine_stopped()` took only 0 as stopped, where 0.8 now releases its brake, re-times held
renders, and judges CPU at STOP.

## The readings (development twin `9138bd29`, base/octatrack-next at 5db3b4e8d, so the old test)

`state` is the base's own verdict (`modwerk_machine_stopped()`); the track bytes are `0x80006500`, 16 tracks.

| State | `0x800065b8` | Track bytes | `state` |
| --- | --- | --- | --- |
| Stopped, as found | 0 | all 0 | stopped |
| PLAY, 1.5 s | 1 | all 1 | playing |
| One panel STOP (0.3 s and 1.8 s after) | 0 | all 0 | stopped |
| A second panel STOP | 0 | all 0 | stopped |
| PLAY while playing (pause) | 2 | all 2 | **playing** |
| PLAY again (resumes) | 1 | all 1 | playing |
| MIDI START (TRANSP RECV on) | 1 | all 1 | playing |
| MIDI STOP (0.3 s and 1.8 s after), and a second MIDI STOP | 2 | all 2 | **playing** |
| MIDI CONTINUE, then MIDI STOP | 1, then 2 | all 1, then all 2 | playing, then **playing** |
| MIDI START from there | 1 | all 1 | playing |
| One panel STOP after a MIDI STOP | 0 | all 0 | stopped |
| MIDI STOP while the panel's PLAY plays | 2 | all 2 | **playing** |
| Panel PLAY from that | 1 | all 1 | playing |

With TRANSP RECV off (the project as found) MIDI START, STOP and CONTINUE changed nothing.

- **The panel's STOP writes 0 at once**, with one press: octabam's "the STOP key writes 2" does not hold for the panel
  key on OS 1.40C. Their 2 is real, but it comes from PLAY while playing (pause) and from every MIDI STOP, and the
  sixteen track bytes follow the long.
- **So a unit a computer stopped read as playing** until someone pressed STOP on the panel: the 20 November soak's
  "MIDI STOP pauses, `health.playing` stays true" was this. On base 0.8 a braked Part stayed silent until a Part change,
  the frame ceiling never re-timed its held renders, and the CPU guard took the paused unit's light readings as
  playing ones, which after four seconds replace the kept figure picks are judged by.

The fix: `modwerk_machine_transport_stopped()` (`runtime.c`) takes 0 and 2 as stopped, for the long and each track
byte; any other value reads as running. Every caller means "not running" (brake release, ceiling re-time, CPU guard,
predicted brake, module switch, the loader's gate and journal, the self-test start, resident engines, saved project
effects, the USB format change). `dsp.c`'s and `diag.c`'s `PLAYING` already test `== 1`. The core logger
(`sdk/runtime/logging/stock_140c.c`) keeps its own test and still waits for a rewind before it writes the card.

## Late entries past the wait

Not measured here: no entry 190 µs late or more could be made safely on a unit (each risks a stall that needs a power
cycle; octabam's two such entries both stalled). The count is host-tested (`test_machine_registry.c`, `test_diag.c`,
`trial-verdict.test.ts`, `device-log.test.ts`).

## The fixed build on the unit

Development twin `348d4ded62d06107e81ba7fabf3d0b758f0aab4eb808beaa081202fd809b252` of `561ea9395` (this fix on
base/octatrack-next 5db3b4e8d, with the beta base's flags and `--dev`), RAM-booted from twin `9138bd29` and booted back
to it after each pass. Nothing installed or kept; the one trial rolled back.

| State | `0x800065b8` | Track bytes | `state` (the fixed test) |
| --- | --- | --- | --- |
| Stopped after the RAM boot | 0 | all 0 | stopped |
| PLAY | 1 | all 1 | playing |
| One panel STOP, then a second | 0 | all 0 | stopped |
| PLAY while playing (pause) | 2 | all 2 | **stopped** |
| PLAY (resumes) | 1 | all 1 | playing |
| MIDI START (TRANSP RECV on) | 1 | all 1 | playing |
| MIDI STOP (0.3 s, 1.8 s), a second MIDI STOP | 2 | all 2 | **stopped** |
| MIDI CONTINUE, then MIDI STOP | 1, then 2 | all 1, then all 2 | playing, then **stopped** |
| Self-test started from that MIDI STOP | | | started and passed (0 modules, longest frame 421 µs) |

The self-test start is one of the callers: it refuses unless `modwerk_machine_stopped()`, so with the old test it
would have refused at a MIDI STOP. The brake release, the ceiling's re-time, the CPU guard and the module switch were
not driven on the unit. Braking needs a frame two frames behind or 16 held entries in a row, which only a load that
risks a stall makes, and the guard's figures sit outside the range `mem:` reads. They call the same function.

**The late-over count** read 0 on the log's last page right after the boot ("live: 0 renders skipped since the start
(MWSK), 0 frame entries later than the late-entry wait can hold"). It read 0 again after a 5 s trial of Mute Modes
0.2.3 (`d460c7e2`), whose verdict was "no crash, stall, freeze or skipped track logged during the trial"; the trial
rolled back to generation 2 with nothing installed. It was never seen above 0 (above).

Seen on the way: the `late` read just after that boot gave 174 entries in the window, all held, the latest 171 µs late.
The log's LATE incidents from this boot and the two before (18, 28 and 174 held) are stamped at +0 s, so a RAM boot of
a 0.8 twin holds entries while it starts. Whether that is heard is not known.

**Driving notes.** The Windows MIDI bridge's port went dead at each RAM boot (`midiOutShortMsg refused`) until the
bridge was restarted. TRANSP RECV, set from the panel and not saved, survived the RAM boots both ways. The PROJ menu
reopens where it was left (MIDI > SYNC), so a key path written for a fresh boot lands elsewhere on a second open (here
in MIDI TURBO STATUS, where it pressed NEGOTIATE; the speed stayed ×1.0). The project ended with TRANSP SEND and RECV
off, as found, checked by a MIDI START that no longer started the unit.
