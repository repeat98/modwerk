# SPOS words dig — tip remapper twin path (MOP-169)

Host: DESKTOP-JH92J0W · Europe/London · 24 November 2026 ~18:13  
Prior: [`usb-dual-install-mop167-2026-11-24.md`](usb-dual-install-mop167-2026-11-24.md)  
Protocol root: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** before twin (`eb667962…`, inv **24**) |
| Twin | **`775d9322…`** (tip-matched; owns `modwerk_site_400a2d6a`) |
| Tip dual remapper | **`4ef940ac7942`** = base ownership (tip-matched) |
| Tip dual dial-max / PMTR | **37** / **37** |
| Tip dual `sp_en` | **enArmed** |
| Tip dual `mw_lfo_dbg` | **afterStore Δ 7543** under PLAY (store path live) |
| Tip dual `sp_pos_w` | **frozen** — unique=1; T1 stuck **`0x4000` (16384)** |
| Tip alone | Loads; remapper tip-matched; dial-max **30** (cannot reach SPOS **37**); afterStore Δ **0** |
| Detour mop157 `seq-pos` 620 B on tip twin | **refusal 9** (patches owned remapper site) — control **not** runnable on this twin |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**Finding:** tip-matched remapper dual path fires `after_store` thousands of times while `sp_pos_w` stays a constant `0x4000` under this fixture (DEP≈0 bipolar centre). Words-move later **Proven** under tip remapper with alt DEP/SPD+wiggle: [mop184](usb-words-move-mop184-2026-11-24.md). Same twin cannot A/B Detour vs tip subscribe (refusal **9**). Catalog stays **SHUT**.

## Passes

1. **First pass** — tip dual + Detour control attempt: tip words frozen; Detour verify-rejected (refusal 9).
2. **Deep pass** — tip alone then tip dual with `mw_lfo_dbg` deltas:
   - alone: dial-max 30 / PMTR 30 / afterStoreΔ 0 / words frozen `0x4000`
   - dual: dial-max 37 / PMTR 37 / afterStoreΔ **7543** / storeΔ ~181k / words still frozen `0x4000`

## Packages (private)

| Package | Bytes | Notes |
| --- | --- | --- |
| tip `seq-pos.mwrm` | **600** | `runtime.json` subscribe; **0** stock sites |
| tip dual set | PM + SPOS + 7 LFO peers | **no trig-prob** (refusal 3 vs Play Modes) |
| mop157 Detour `seq-pos.mwrm` | **620** | private remapper path — refused on tip twin |

## Limits / not claimed

- Tip-matched words-move counter gate — **still open** (after_store live, words unique=1).
- Detour-vs-tip A/B on one twin — **impossible** (refusal 9).
- Dual-install audibleProven / catalog pin / Accept / lifecycle — **none**.
- Root cause of constant `0x4000` under tip subscribe (LFO value vs package write path) — **unresolved**; note PROB USB miss also saw T1 words stuck `4000`.

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft judge (MOP-76).

## Artifacts

Private: `modwerk-builds/mop169-words-dig/` (`publish/summary.json`, `summary-deep.json`, PNGs).  
Project store: `media/mop169-words-dig/`.
