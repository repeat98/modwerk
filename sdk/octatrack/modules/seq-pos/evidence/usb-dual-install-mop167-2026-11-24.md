# Dual-install Keep proof — Play Modes + SPOS on tip-matched `ev_audio_step` (MOP-167)

Host: DESKTOP-JH92J0W · Europe/London · 24 November 2026 ~18:03  
Protocol: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24**, Screen Off + Mute Modes + Play Modes |
| Tip-matched `--dev` twin | **`775d9322…`** (`dev-twin-mop167-2026-11-24`, source `5dd98cc9a`) — owns `modwerk_site_400a2d6a` |
| Old mop71 twin `5dc7059c…` | **Unusable** for subscribe packages — remapper still stock `lea` (`41f9…`); tip packages refuse **malformed** (1) |
| Inventory dual | **YES** — Play Modes + SEQ POS (plus LFO coexist peers; **trig-prob omitted** — conflicts with Play Modes, refusal **3**) |
| Remapper `0x400a2d6a` | **`4ef940ac7942`** = base ownership (matches empty twin); **not** mop157 private Detour `4ef940d2…` |
| Dial-max / PMTR | **37** / scrolled **37** |
| after_store / `sp_en` | after_store non-NULL; **enArmed** |
| `sp_pos_w` words move | **NO** this session (unique=1 under PLAY A and B) |
| WAV A/B | peaks near-equal (~0.0476); onset Δ **−2878** — recorded; **not** claimed as dual-install audibleProven |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**Inventory dual + tip-matched remapper (no private Detour): proven.**  
**Full mop166 peek gate (words move): not met this run** — leave dualInstallProven false for that half. Catalog stays **SHUT**.  
Follow-up dig: [`usb-words-dig-mop169-2026-11-24.md`](usb-words-dig-mop169-2026-11-24.md) (after_store live; words still `0x4000`).

## Packages (private, tip-matched)

| Package | Bytes | Notes |
| --- | --- | --- |
| `playmodes.mwrm` | 16006 | `--octabam-machine playmodes` (machine-ports order **40**); remapper addr **not** in pkg |
| `seq-pos.mwrm` | **600** | `runtime.json` subscribe order **50**; **0** stock sites (vs mop157 Detour **620** B) |
| LFO coexist peers | 7 | seq-reset…time-stretch tip-matched; **no trig-prob** (site conflict with Play Modes) |

## Session envelope

1. Keep tip24 confirmed; Jon RAM OK (`--ram-ok`).
2. Rebuilt tip-matched `--dev` twin (mop71 twin lacked `ev_audio_step`).
3. Staged Play Modes + SPOS + LFO peers (minus trig-prob); trial; peeks; WAV A/B.
4. Undo → `[]`. No Accept.
5. **ASK JON power-cycle** before next twin / Keep soft judge (MOP-76).

## Limits / not claimed

- Words-move counter gate (MOP-73-class) under tip-matched subscribe — **failed** this fixture.
- Distinct-step jump colour — still unverified.
- Catalog pin / force-list / Accept / lifecycle — none.
- Published standalone Play Modes `.mwrm` still Detours until owner-approved `runtime.json`.
- mop157 audibleProven is **not** this dual-install claim.

## Artifacts

Private build dir: `modwerk-builds/mop167-dual-install/` (`publish/summary.json`, PNGs, WAVs).  
Project store media: `media/mop167-dual-install/`.
