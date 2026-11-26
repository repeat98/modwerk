# Tempo LFO — draft release notes

Catalog `src/community/module-changelogs/` entries are for listed modules
only. Keep this file until the module is promoted out of `sdk/drafts/` and
listed in `sdk/catalog.json`.

## 0.1.0-experimental — tip scaffold 2026-11-25 (MOP-204)

- New parked draft `sdk/octabam/modules/tempo-lfo/`: LFO PMTR **TEMPO** index **39**,
  contribute `tm_lfo_pmtr` (order 100), `after_store` → `tm_on_store`
  publishes stock `PROJECT_BPM24` (`0x8000181c`, 30–300 BPM).
- Does not own track speed (TSPD) and does not claim SPOS / Play Modes
  remapper sites.
- Catalog **SHUT**. No Accept / force-list / USB trial in this tip. Do not
  invent Proven.
- Peer LFO drafts list `tempo-lfo` in `compatibility.conflicts`;
  `drafts:park-check` includes the draft; hub
  `docs/OCTATRACK_LFO_PMTR_EXTENSION.md` notes the index.

### Docs / evidence note — MOP-205 USB smoke (same version, 25 Nov 2026)

- Keep-safe Undo twin smoke: tip package `643b46c3…`, coexist dial **39**,
  SETUP TEMPO, PLAY `tm_bpm_w` / `PROJECT_BPM24` moved; Undo `[]`.
- Catalog still **SHUT**. Not Proven / WAV / cycles. Evidence
  `evidence/usb-smoke-mop205-2026-11-25.md`.

### Docs / evidence note — MOP-213 tip publish gates (same version, 25 Nov 2026)

- ColdFire `cycles.static = 624` from objdump (`tm_on_store` 25 +
  `tm_map_bpm24` 14 = 39 ×16). Measured / load / stress stay null.
- Qualification fill recipe + catalog-gate honesty hooked; `tests.qualification`
  remains absent. Catalog still **SHUT**. No Accept. No Proven invent.
- Evidence: `evidence/usb-cycles-static-mop213-2026-11-25.md`,
  `evidence/cycles-performance-plan-mop213-2026-11-25.md`,
  `evidence/qualification-fill-recipe-mop213-2026-11-25.md`,
  `evidence/catalog-gate-mop213-2026-11-25.md`. Hub MOP-213.

### Docs / evidence note — MOP-226 catalog-gate honesty (same version, 25 Nov 2026)

- Tip-docs restatement: USB smoke PASS (mop205) + static **624** + qual
  hooks (mop213) do **not** open `sdk/catalog.json`. Measured / WAV /
  `tests.qualification` place still open. No Accept. No Proven invent.
- Stamp at that pass: `evidence/catalog-gate-mop226-2026-11-25.md` + hub
  MOP-226 (checklist TEMPO row + HARDWARE_TRAPS pointer).

### Docs / evidence note — MOP-250 audible + Keep tip (same version, 25 Nov 2026)

- Tip-docs: Keep-safe Undo audible fixture + Keep Accept USB protocol
  (Jon auth only; AFK must not `device_keep`) + publishability gates hub.
- Catalog still **SHUT**. No USB dig claimed. No Accept invent. Index **39**
  locked. Current stamp: `evidence/catalog-gate-mop250-2026-11-25.md` +
  hub MOP-250.
