# Apply profiling

Profile the unchanged 0.1.8 runtime before choosing an optimization. This is an
emulator experiment, not physical timing or publication qualification.

`apply_profile_symbols.py` assembles the committed `unit.s`, binds the existing
instruction watches to the exact private package, and exports five additional
phase boundaries. The extra assembler labels emit no bytes. Both linked images
must match, and `profile_symbols.py` also requires the original linked image to
match the package. The assembly fingerprint fails closed if the boundaries need
review after a runtime change. Never install the symbol-only objects as a module.

In the pinned source-tools container, with this checkout mounted read-only at
`/work` and a private writable output directory at `/out`, run:

```sh
python3 -B sdk/drafts/pattern-sample-locks/apply_profile_symbols.py \
  --package /out/pattern-sample-locks-v018.mwrm --out /out/apply-symbols
python3 -B sdk/drafts/pattern-sample-locks/capture_emulator.py \
  --emulator /out/ot_emu --base /out/base --card /out/seed-card.private.img \
  --package /out/pattern-sample-locks-v018.mwrm \
  --profile-symbols /out/apply-symbols/symbols.json \
  --performance --out /out/apply-run
```

Each invocation creates its own card copy, LCD buffer, logs, process and USB
socket. Use a unique container and short private output path for each session;
mount the base, executable and seed card read-only. Never reuse a running
session's output directory. The harness closes only the process it starts.
Keep the private card, firmware, linked objects and raw logs outside Git.

The phase-enabled matrix runs Lock and Clear while playback is running:

- Two changed steps on one track, with no other parameter locks.
- All 64 steps on one track, with no other parameter locks.
- All 512 fields, with no other parameter locks (Clear scans all 31 other slots).
- All 512 fields, with another lock in the first slot (Clear can exit immediately).
- All 512 fields, with another lock in the last other slot (Clear scans 31 slots).

The disposable fixtures replace parameter slots explicitly; native panel gestures
perform the module actions. Complete track-byte and battery-mirror comparisons
check that only intended SAMPLE bytes changed. Each resulting index byte is
checked against all 32 slots on all eight audio tracks. Transport must remain
running during Apply. The legacy stopped-state meter experiment still runs when
the optional phase map is absent.

`performance.json` reports elapsed emulator instruction intervals for preflight
and initial validation, index planning, final revalidation, publication, native
follow-up and the epilogue. Index planning also includes mirror validation and
set/clear-mask preparation; compare the matched first-slot and last-slot cases
to investigate the scan contribution. The phase intervals must partition the
complete commit interval. Existing guard watches report the publication-mask
instruction span independently.

Instruction intervals include intervening interrupt execution. Neither these
counts nor model milliseconds are ColdFire wall-clock cycles, physical CPU
utilization or a complete scheduler/interrupt bound. The existing hardware-timer
guard maximum is cumulative across the run, excludes some entry/exit instructions and must not be presented as
the complete masked duration. A follow-up hardware run needs verified timer
configuration, measured overhead, matched load and the exact tested base/package.
No cached load-meter difference establishes an isolated module cost.

New physical hardware results: **not tested**. Completed emulator results and
their identities are in TESTING.md and evidence/apply-profile-20261030.json.
