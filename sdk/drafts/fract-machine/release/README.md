# FRACT 0.1.1 USB candidate

The candidate package is built by the shared source-runtime recipe compiler.
It is USB-only, using the existing C runtime path, like the existing C-only
sample-editor module. No card image or base firmware is added or changed.

`catalog-entry.json` and `package-entry.json` are PROSPECTIVE release rows.
They are not active entries in sdk/catalog.json or the public package list.
The prospective row uses the canonical runtime id (5efef0cd), title FRACT,
base9b3ba417 and its seven published layouts. `candidate-proof.json` records
its exact binary hash; `reconstruction.json` has source hashes/copy addresses,
never firmware bytes. `resources.json` states measured image/BSS counts and
keeps unknown stack/cycle budgets explicitly unmeasured.

## Before promotion

1. Review the recipe compiler and exact source/package proofs, including strict
   stock-free scans, base binding, and the full emulator candidate check.
2. Measure module-owned memory/stack and worst-case ColdFire work. Do not price
   stock firmware routines without evidence or turn average CPU into a bound.
3. On the physical unit, after fresh stopped-state/preflight confirmation, test
   the exact candidate's install, integrity, Keep, Undo, controlled replacement,
   removal/missing-module behavior, saved-state reload and power-cycle. Preserve
   the private grnyv1 package/set for recovery. Never run both FRACT ids together.
4. Record actual owner observations separately from USB/emulator evidence. The
   owner will connect later; these device checks are currently pending.
5. Only after qualification, move the module into sdk/octabam/modules, activate
   its catalogue/package rows and move CHANGELOG.json to the community changelog.
   Rebuild and verify identical public package bytes, regenerate catalogues,
   supply screenshot provenance and the qualification/performance records.
6. Run doctor/pr:ready, isolated builds and review, then request the repository
   owner's first-release approval. No automatic publication opt-in is used.

This draft release work does not grant release approval and does not claim an
installable public catalogue entry until those steps are completed.
