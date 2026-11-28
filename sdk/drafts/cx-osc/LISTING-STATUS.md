# Listing status (28 Nov 2026)

**Draft only.** Owner review on PR #2293 (28 Nov 2026): CX OSC stays under `sdk/drafts/cx-osc/` until FM engine take hooks land in the cumulative base ([#2352](https://github.com/repeat98/modwerk/pull/2352)) and FM Synth plus CX OSC subscribe instead of detouring the shared 22 sites. A `compatibility.json` row does not make that overlap catalog-safe.

## Deferred (do not ship on the module PR yet)

- `sdk/catalog.json` and `src/catalog/module-documents.json` entry
- `public/octatrack-modules/cx-osc/` and committed `.mwrm`
- `src/community/module-changelogs/cx-osc.json`
- `requested-packages.json` / dev import rows tied to catalog listing
- Base `machine_registry.c` chooser viewport fix (belongs on cumulative base #2333 / hooks work, with unit notes)

## Ready in draft

- Source under `sdk/drafts/cx-osc/` (manifest, standalone bake, evidence, host tests)
- `scripts/build-module-packages.py` per-module workdirs when synth and cx-osc both link `poly.s`
- `machine-ports.json` cites draft paths only (no full subscribe until hooks merge)

## Next after hooks merge

1. FM Synth and CX OSC packages drop overlapping detours and subscribe to take events.
2. Re-open catalog listing with qualification, `device:price` curve, and `modules:generate`.