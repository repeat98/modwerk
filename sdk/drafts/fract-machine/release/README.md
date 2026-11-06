# FRACT 0.1.1 USB candidate

The candidate package is built by the shared source-runtime recipe compiler.
It is USB-only, using the existing C runtime path, like the existing C-only
sample-editor module. No card image or base firmware is added or changed.

`catalog-entry.json` and `package-entry.json` are PROSPECTIVE release rows.
They are not active entries in sdk/catalog.json or the public package list.
The prospective row uses the canonical runtime id (5efef0cd), title FRACT,
base9b3ba417 and its seven published layouts. `candidate-proof.json` records
its exact binary hash; `reconstruction.json` has source hashes/copy addresses,
never firmware bytes. `resources.json` and `resources.md` account for 31,776
resident pool bytes and a conservative 712-byte own contribution per callback.
Worst-case ColdFire timing remains unmeasured.

## Before promotion

1. Review the recipe compiler and exact source/package proofs, including strict
   stock-free scans, base binding, and the full emulator candidate check.
2. Module-owned memory and per-callback stack are accounted for by the reproducible
   resource audit. Measure worst-case ColdFire work and the matched stock
   comparison. Do not turn average CPU into a bound. The report states the
   remaining audio-rate ColdFire record-format/method question for the owner.
3. On the physical unit, after fresh stopped-state/preflight confirmation, test
   the exact candidate's install, integrity, Keep, Undo, controlled replacement,
   removal/missing-module behavior, saved-state reload and power-cycle. Preserve
   the private grnyv1 package/set for recovery. Never run both FRACT ids together.
4. Record actual owner observations separately from USB/emulator evidence. The
   exact candidate has now passed the reported/USB functional steps in TESTING.md;
   missing-module reload remains unconfirmed; the later project-reload incident
   and controlled repeat are recorded separately below.
5. Only after qualification, move the module into sdk/octabam/modules, activate
   its catalogue/package rows and move CHANGELOG.json to the community changelog.
   Rebuild and verify identical public package bytes, regenerate catalogues,
   supply screenshot provenance and the qualification/performance records.
6. Run doctor/pr:ready, isolated builds and review, then request the repository
   owner's first-release approval. No automatic publication opt-in is used.

This draft release work does not grant release approval and does not claim an
installable public catalogue entry until those steps are completed.

The 6 November physical report covers install, explicit Undo, Keep/card readback,
removal, reinstall, owner audio/POS/SIZE and installed-Part reload, and verified
physical reboot. It supplies functional evidence for this exact candidate; it
does not replace missing measurements or finish publication qualification.

A later PROJECT RELOAD stopped audio frames and required an owner-operated power
cycle. A controlled stopped-state repeat passed, but the initial stall remains
unexplained; see TESTING.md. Source/readiness checks do not qualify that failure.
