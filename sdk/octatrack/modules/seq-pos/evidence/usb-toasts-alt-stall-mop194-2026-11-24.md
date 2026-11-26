# SPOS FUNC+TRACK toast alt stall (MOP-194, tip-only)

Host: DESKTOP-JH92J0W · Europe/London · 25 November 2026 ~01:24  
Prior misses: [`usb-toasts-miss-mop175-2026-11-24.md`](usb-toasts-miss-mop175-2026-11-24.md),
[`usb-toasts-reprobe-mop185-2026-11-24.md`](usb-toasts-reprobe-mop185-2026-11-24.md)  
Recipe cite: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md) §B

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 | **OK** — `eb667962…`, inv **24**, Screen Off + Mute Modes |
| Twin / USB key dig | **Not run** — tip-only source-structure angle |
| Fresh angle | Built `unit.s` has **no** toast/panel handlers; archive `unit.full.s` does |
| `sp_level` / `sp_off` / `sp_toast` in tip-built nm | **Absent** |
| `runtime.json` module_key / panel subscribe | **Absent** (only `ev_audio_step` + `ot_lfo_pmtr_dest`) |
| Publication toast PNGs | **None** — still Open/miss |
| Undo / Accept / catalog | Keep free; **no** Accept; **SHUT** |

**USB FUNC+TRACK toast path: stalled at source.** Further key-order USB
digs without wiring `sp_level` / `sp_off` (and a key subscription) into the
linked unit will keep hitting stock pages (mop175 SRC/LEV / DISARM ALL;
mop185 AMP SETUP / RELOAD PAGE). Do **not** publish miss frames. Catalog
stays **SHUT**.

## Why this angle (not another TRACK order)

mop175 omitted TRACK; mop185 held TRACK — both miss, different stock
pages. Fresh path: ask whether the **built package** can show `Tn SPOS`
at all.

| Source | Toast / panel |
| --- | --- |
| `manifest.py` `Linked("unit", …/unit.s)` | Production linked unit |
| Tip-built `unit.nm` (mop192 package, byte-identical tip) | `sp_on_store`, `sp_ev_audio_step`, `sp_lbl_spos` present; **`sp_level` / `sp_off` / `sp_toast` absent** |
| `runtime.json` | subscribe `ev_audio_step` only — **no** module_key / FUNC+TRACK hook |
| `unit.full.s` | Archive header: “Archive only — linked production unit is unit.s”; contains `sp_level` / `sp_off` + `NOTIFY 0x4005a2b8` toast builders |

Address mode on the live tip path arms via **`sp_on_store`** (LFO
contribute after_store), not via FUNC+TRACK+LEVEL. README Quick tutorial
still describes the panel toasts as the intended UX; those handlers are
not in the linked image.

## What this tip does **not** claim

- That toast PNGs exist or that the panel path is live.
- That `unit.full.s` is safe to link (archive; needs reviewed key hook /
  NOTIFY / stock_guard work — out of this dig’s scope).
- Any catalog pin / Accept / twin boot.
- Invented readiness from mop175/185 miss frames.

## Artifacts

- Audit JSON + nm: Project store
  `media/mop194-spos-toasts-alt/` (`source-toast-audit.json`, `unit.nm`,
  `00-keep-tip24.json`)
- Private: `modwerk-builds/mop194-spos-toasts-alt/`

## Leave

Keep tip24 free. No twin → **no ASK JON PC**. No Accept. Catalog **SHUT**.

Hub: [MOP-194](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-functrack-toast-alt-stall-mop-194)
