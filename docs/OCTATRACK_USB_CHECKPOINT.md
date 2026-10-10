# Octatrack USB development checkpoint — 9 October 2026

The owner froze implementation here on 9 October and resumed it on
10 October. This is a WIP checkpoint on `codex/octatrack-elekloader-migration`,
not a hardware-qualified release. Keep the work on this branch until the
implementation is stable; do not reopen the closed foundation PR or create
small preparatory PRs.

## Resumed 10 October 2026

The source-inventory failure is resolved. The two host-tool fixes had changed
`sdk/octabam/tools/hw/`, which the release source inventory fingerprints, so
three app tests rejected the approved package identity. Those files are back
to their approved bytes. The fixes now live in the
[hardware-tool adapter](../sdk/machines/octatrack/hw/README.md), which writes
repaired copies outside Git only when each imported file matches its reviewed
hash, every edit matches exactly once and the output reproduces the reviewed
hash. The ten host regressions (seven earlier, three adapter guards) run on the
prepared copies and pass on Python 3.9 and 3.14; the unrepaired probe still
fails `join()` on 3.9. No guard, fingerprint or approved package was changed.
The branch also integrates main `ca36b1f` (Air Chorus T3 isolation, compact
media credits).

No full check on this tree finished green in one uninterrupted run, because
of the machine rather than the code. The first had only timeouts, while
another session's check pushed the load average past 160 on eight cores. The
second passed every step (licences, catalogues, generation, lint, types, all
98 SDK tests, bundling) except four app test files that hit a full disk
(`ENOSPC`). The failed files then passed in isolation, so every test has
passed on this tree. The repository's disk filled to 144 MB free during the
run; other sessions' scratch worktrees under `/private/tmp` hold about 20 GB.

Sam's upstream `tools/hw` has two tools Modwerk lacks, including the
device-versus-emulator capture over USB Audio In, and the imported USB stack
leaves only EP3 OUT free. Both are recorded in the migration record; together
they set the next step below.

## Next: read-only vendor interface

Build the vendor interface without endpoints, on EP0 control transfers, so
EP3 OUT stays free for USB Audio In. Start read-only (identity and status),
with one bounded frame slot handed from the USB ISR to the engine task. The
[migration record](OCTATRACK_ELEKLOADER_MIGRATION.md#what-the-imported-usb-stack-leaves-for-the-vendor-interface)
lists the gaps to close first: no control OUT data stage, the shared request
hook at `0x4001de64`, uncached response buffers, the unproven ISR-to-task
wakeup, Windows driver binding and the emulator's limits.

## Saved work

The checkpoint integrates approved main `0a3bd5008635f71c67347f23960bcdd73f5a571e`
(E-Verb release). Previous development checkpoint `c4a4fac` had passing app
checks against its then-current main and contains the shared TypeScript builder,
upload client/controller, private source-port recipes and verification tooling.

The 9 October session inspected Sam's existing hardware tools and prepared two
fixes, now applied by the adapter rather than in the imported tree:

- `usb_probe.py`: stop-event naming no longer shadows `Thread._stop()`. The
  previous code fails during shutdown/report writing on Python 3.9; Python 3.14
  uses a different thread implementation.
- `rec.swift`: scale Float audio samples in Double before conversion to Int32.
  The previous code traps at positive full scale because Float rounds the
  multiplier past Int32's maximum.
- `sdk/tests/test_usb_hardware_probe.py`: synthetic host regressions,
  including actual report writing and execution of the recorder's conversion
  block without opening an audio device.
- `OCTATRACK_ELEKLOADER_MIGRATION.md`: hardware-tool reuse mapping, audio
  directions, verdict limits and the missing device identity requirement.

Both Python 3.9 and 3.14 pass the seven new checks with the fixes. Three checks
reject the previous code on Python 3.9. The complete recorder compiles on macOS.
The 9 October full check passed all 94 SDK tests, lint, types and production
bundling; app tests were **1625 passed, 3 failed** for the source-inventory
issue resolved above.

Private local evidence remains in `/tmp/`:

- `modwerk-usb-hardware-tools-check.log`: full check and the three failures.
- `modwerk-usb-hardware-tools-tests.log`,
  `modwerk-usb-hardware-tools-python39.log`: passing host regressions.
- `modwerk-usb-hardware-tools-before.log`: expected failures on prior code.
- `modwerk-usb-hardware-rec-build.log`,
  `modwerk-usb-hardware-tools-proofs.json`: native compilation and source hashes.

The private firmware/build/parity/emulator artifacts from earlier sessions are
still local. See the migration record for their qualified scope and limits;
none is a ready-to-flash no-reboot loader candidate.

## Decisions and remaining implementation

- Elekloader is the shared browser-native TypeScript builder; machines extend
  it. Native tools prepare packages and developer tests. Retire the public
  Octabam composer only after catalogue and hardware qualification.
- Target: OT MKII, stock OS 1.40C. No USB writes, flashes or audio/MIDI test
  commands were sent to the physical OT during this session.
- Routine module load/update/remove must avoid rebooting. Dedicated upload
  mode is acceptable; first activation requires stopped playback/recording.
- The client and C controller have synthetic-backend evidence. Real USB
  transport, runtime execution/lifecycle, both-core DSP P/X/Y allocation,
  recovery across connections and installed-identity verification remain.
- Maximize supported module combinations through dynamic DSP loading and
  runtime P/X/Y allocation/relocation. Replace baked-in module allocation
  addresses with checked relocations/symbols or ABI handles. Minimize all static
  reservations: allocate for active owners and operations and reclaim after
  safe retirement; avoid permanent per-module/track/FX-slot or staging banks.
  Audit stock buffers and loader/bus/recovery workspace for safe relocation or
  lifetime sharing. Record the reason for every unavoidable fixed reservation;
  protect existing stock/kernel dependencies until a safe replacement is
  verified. Share compatible immutable dependencies per core and isolate
  per-instance state/buffers. Admit against memory,
  fragmentation, CPU/DSP headroom and old/new transition residency. Qualify
  larger combinations, load-order variants, multiple instances, reclamation,
  exhaustion and rollback on both cores; report real conflicts before changing
  the active set. This remains a required implementation target.
- Make the owner-provided Air Chorus memory investigation a set of mandatory
  SDK/allocator regressions: stock/shared X/Y collisions (including T3/T7),
  instance-state/buffer limits, relocation/alignment assumptions, avoidable
  fragmentation and packed-table/audio parity. Check compiled footprints and
  access bounds before admission; exercise named two-/three-module examples,
  larger sets, placement/load-order variants, reuse and both-core retirement.
  Expose exact pool/instance/transition accounting. Genuine exhaustion must
  refuse before activation and preserve the live set; avoidable placement
  failures and ownership violations fail qualification. The migration record
  details these prevention gates; they are not implemented or hardware-proved
  by this documentation update.
- Provide safe agent access through our own versioned Modwerk device interface
  and the same TypeScript client used by the browser. Start with read-only
  identity/status, bind the session to the selected unit and permitted
  capabilities, and expose bounded diagnostic/test/module operations. Validate
  identity, parameters, package/resource compatibility and state transitions;
  retain stopped activation and explicit trial acceptance/rollback. Prove
  wrong-target, malformed/replayed requests and disconnect/uncertain-result
  behavior on hardware before autonomous state-changing access. The migration
  record specifies the contract; the real device backend is still future work.
- Reuse the existing hardware capture/counter/MIDI/project tools. Listening
  to the ported output-only USB Audio module needs no USB Audio In module;
  the upstream host-to-OT tone probe does require that separate input path.
- Quantify ColdFire CPU load and each DSP core's load/headroom on the physical
  OT through the automated tests. Establish validated device timing and budget
  measurements, record mean/p95/p99/observed maximum and deadline misses, and
  quantify diagnostics/USB-capture overhead. Compare matched baselines, worst
  SPRING REV settings/trigger splits on both cores, individual modules,
  multiple instances and combinations under the owner's stress project.
  Bind timing and audio/counter observations to the installed identities and
  exact project/settings. Keep modeled emulator cycles and executed
  instructions distinct from hardware timing; USB counters and silence alone
  do not establish utilization. The migration record has the measurement plan;
  this telemetry is required future work, not already implemented.
- Test legacy projects, multiple instances, Parts, both DSP cores and live
  sampling under the owner's stress project. Record only actual observations;
  neither a local image hash nor a `CLEAN` diagnostic verdict proves an
  installed module set is safe. Keep raw firmware, projects, captures and logs
  private, and preserve the explicit trial/acceptance boundary.
