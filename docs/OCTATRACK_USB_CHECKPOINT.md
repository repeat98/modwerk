# Octatrack USB development checkpoint — 9 October 2026

The owner requested a freeze here and will continue tomorrow. This is a WIP
checkpoint on `codex/octatrack-elekloader-migration`, not a hardware-qualified
release. Keep the work on this branch until the implementation is stable;
do not reopen the closed foundation PR or create small preparatory PRs.

## Resume first

The latest full check failed three app tests after two developer hardware-tool
fixes changed files inside `sdk/octabam/tools/hw/`. The release source inventory
fingerprints the entire imported `tools/` tree, including these host tools.
The approved compiled-package fingerprint therefore no longer matches.

- `scripts/module-source.test.mjs`: committed release source identity mismatch.
- `scripts/utility-releases.test.mjs`: same inventory mismatch.
- `scripts/module-doctor.test.mjs`: catalogue integration fails on that mismatch.

Do not weaken these guards, relabel the approved packages or replace their
fingerprints by hand. Prefer moving the two fixes into a reproducible developer
adapter outside `sdk/octabam/`, with exact guarded transformations and source
hashes, leaving the approved imported tree unchanged. Update the new host
regressions and reuse notes to exercise that adapter. Then run the full required
check again before treating this checkpoint as validated.

## Saved work

The checkpoint integrates approved main `0a3bd5008635f71c67347f23960bcdd73f5a571e`
(E-Verb release). Previous development checkpoint `c4a4fac` had passing app
checks against its then-current main and contains the shared TypeScript builder,
upload client/controller, private source-port recipes and verification tooling.

This session inspected Sam's existing hardware tools and prepared two fixes:

- `usb_probe.py`: stop-event naming no longer shadows `Thread._stop()`. The
  previous code fails during shutdown/report writing on Python 3.9; Python 3.14
  uses a different thread implementation.
- `rec.swift`: scale Float audio samples in Double before conversion to Int32.
  The previous code traps at positive full scale because Float rounds the
  multiplier past Int32's maximum.
- `sdk/tests/test_usb_hardware_probe.py`: seven synthetic host regressions,
  including actual report writing and execution of the recorder's conversion
  block without opening an audio device.
- `OCTATRACK_ELEKLOADER_MIGRATION.md`: hardware-tool reuse mapping, audio
  directions, verdict limits and the missing device identity requirement.

Both Python 3.9 and 3.14 pass the seven new checks with the fixes. Three checks
reject the previous code on Python 3.9. The complete recorder compiles on macOS.
The last full check passed all 94 SDK tests, lint, types and production bundling;
app tests were **1625 passed, 3 failed** for the source-inventory issue above.

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
