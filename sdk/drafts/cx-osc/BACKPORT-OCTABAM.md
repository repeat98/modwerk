# Backport notes for `octabam` `modules/cxosc`

Items proved on Modwerk MKII (dev twin `46c30886`, Nov 2026) that apply to the standalone octabam CX remix module.

## Machine registration (ColdFire)

- **Do not pass stock detours as C callbacks** (`assign`, `fm_type`, `fm_validate`): the base owns admission; descriptor `assign` and validator callbacks stay **0** (Modwerk `cx_registration.s`).
- **`MODWERK_MACHINE_SETUP_ALL`**: required so SRC SETUP encoder **E (FDBK)** is writable; matches octabam PLAYBACK/FDBK UX (`machine.c` flags).
- **Do not use `MODWERK_MACHINE_RENDER_FLEX`** with a separate START `SymbolRef` on stock FLEX cells if the base provides `ot_machine_starts`; use **`cx_machine_start` → `po_fmstart`** only.
- **`cx_machine.reserved[0]`**: price one playing track at **6 %** of a frame (mean audition +5.0 to +5.6 on T1/T5); peak guarded render ~16–19 %.
- **`runtime.json` `rests`**: same FM hook sites as FM Synth; frame cost at rest **21.4 %** booked, hooks **rest** when no CX track.

## UI / page

- **`fm_track_page` must preserve `a2`** across the call (diaglog crash at `mw_ui_tick+0x192` when `a2` was clobbered). Backport to `page.s` / `cx_ui_tick` path.
- **PLAYBACK page resolver**: Modwerk uses DRAM `page.s` + `pg_resolve` detour; octabam cave placement stays pinned (`PAGE_AT` in manifest).

## Conflicts and coexistence

- **Never install with FM Synth** (`synth`): shared Tim Hastie engine detours; octabam manifest already declares `conflicts=['synth']`.
- Modwerk **group-owned** `compatibility.json` relation waits until `cx-osc` is catalogued; until then rely on `conflicts` only.

## Performance (reference, not octabam gates)

- Instance curve **first/each 2.1 %**, **rest 21.4 %** (base 0.8.2).
- Host port gate: `test_cx_osc_port.py` (import pins, runtime contribute, package build).

## Still Modwerk-only

- **No detours on `ot_machines` table-owned sites** (`fm_main_commit`, `ml_*`, `po_lfdname`, …): Modwerk refuses them once the base contributes those tables; cx-osc manifest keeps engine/page detours only, **`contribute.replaces` = []** like `synth` (Nov 2026 migration). octabam still uses pinned detours in its own image layout.
- USB `.mwrm` package, `device:test`, and frame-cost table in `sdk/machines/octatrack/frame-costs-base.json`.