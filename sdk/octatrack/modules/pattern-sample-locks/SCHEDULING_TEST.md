# Local scheduling test

This follow-up stays local pending review. It tests the existing 0.1.8 package,
not a CPU optimization or deferred cleanup. Run `scheduling_emulator.py` with the
same private inputs as the Apply profiler; it selects `--performance` itself.
Use a fresh output directory and an independent emulator process/card/socket.

The helper repeats four maximum-size native Lock/Clear pairs while playing. It
retains the full track-byte, battery-mirror and lock-index checks. Exact-package
attestation and opcode checks bind passive PC watches to the status-register
instructions that enter and leave the level-two task guard and each level-seven
publication guard. No status register, interrupt vector or writer is patched.

The trace reads handler addresses from the live vector table. It checks that
neither scheduler entry nor task-dispatch return occurs within the level-two
guard, that no watched handler enters a fully masked span, and that scheduler
dispatch resumes afterward. Audio, sequencer, UI-timer and selected DMA handler
entries are counted during the task guard. Vector aliases can share handlers;
their counts must not be summed as distinct acknowledged interrupt vectors.

Four model milliseconds before each final YES provide a nearby baseline. The
helper resets only emulator diagnostic gap maxima, then records another window
from YES delivery through closure and four model milliseconds of recovery.
The active window length is recorded and can differ from the baseline length.
`frame_gap` and `dl_frame_gap` are timer counts between frames; `tick_gap` is
frames without a UI tick, not task-dispatch latency. Timer configuration and
model-clock snapshots are retained. The native diagnostic source uses 132 timer
counts per microsecond; any conversion here remains emulator model time.

The task-guard and full-mask intervals include the boundary instructions. Inside
the guard, elapsed instruction counts include serviced interrupts and map to
the configured 3,990 instructions/sample at 44.1 kHz. This is not a ColdFire
cycle model. Outside the guard, idle time skips mean instruction distances to a
later dispatch must not be converted to time.

Handler entry counts show service, not assertion-to-entry latency. A missing
sequencer entry does not establish that a pending sequencer interrupt was
serviced. The test neither forces pending interrupts nor qualifies worst-case
streaming, MIDI, USB or companion load, audible continuity, hardware deadlines,
or total stack use. Results belong to the named package/base/emulator and fixture.

## Result — 30 October 2026

All four maximum-size Lock/Clear pairs passed on unchanged package `28766a01…`,
emulator base `2e1a6128…`, emulator executable `b087c97f…`. Each operation
changed 512 SAMPLE fields; full non-SAMPLE track bytes, mirrors, resulting index
bytes and running transport matched. Image/site attestation and removal passed.
DSP frames advanced 42,756 → 81,885 with errors/stalls remaining zero. The
[local receipt](evidence/scheduling-emulator-local-20261030.json) retains exact
identities, individual intervals, handler addresses, baseline/active windows and
the actual executed helper hashes.

| Observation | Emulator result |
| --- | --- |
| Task-switch exclusion, Lock | 0.414–0.564 model ms |
| Task-switch exclusion, Clear | 1.595–1.598 model ms |
| Longest full-mask span, including both boundary instructions | 87 instructions, 0.494 model µs |
| Publication guards checked | 512 (64 per operation) |
| Task dispatch inside task guard | Zero; dispatch observed after every restoration |
| Watched handlers inside full-mask spans | Zero |
| Nearby baseline maximum frame gaps | 362.8–380.8 model µs |
| Apply/recovery maximum frame gaps | 365.5–382.6 model µs |

Audio/DMA service continued within every task guard. Three Lock traces contained
an entry at the initial audio handler. All eight operations contained entries
at the shared DMA handler: one or two for Lock, four for Clear. DMA vectors 8
and 9 share that address and are not counted twice. The maximum paired increase
in the measured frame gap was 19.8 model µs; unequal observation windows and
ordinary interrupt phasing prevent treating that as an isolated module delay.
There was no millisecond-sized audio-frame gap in these windows.

The sequencer vector handler was observed 2,076 times across the complete watch
windows, but never inside a measured task guard. This run therefore does not
prove assertion-to-entry latency for a sequencer interrupt pending during Apply.
The checked status-register instructions leave level-three service enabled
between the short full-mask spans; actual pending-interrupt latency remains a
separate coverage gap. UI-timer service was observed during one Clear guard.

These observations support retaining the simple transaction while obtaining
physical timing. They show that the complete Apply duration is not one continuous
full interrupt mask in this emulator. They do not establish physical headroom,
audible continuity, universal load limits or release qualification. No runtime
optimization, new module version, hardware load or further push occurred.
