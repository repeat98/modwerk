# SPOS dual-install words-move — tip remapper alt dig (MOP-184)

Host: DESKTOP · Europe/London · 24 November 2026 ~22:13  
Prior stall: [`usb-words-dig-mop169-2026-11-24.md`](usb-words-dig-mop169-2026-11-24.md)  
Protocol: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24** |
| Twin | **`775d9322…`** (tip-matched; RAM boot) |
| Tip dual remapper | **`4ef940ac7942`** = base ownership |
| Inventory dual | **YES** — Play Modes + SEQ POS (+ LFO peers; no trig-prob) |
| Dial-max / PMTR | **37** / **37** |
| Alt A (DEP/SPD max + mid-PLAY wiggle) | **words-move PASS** — T1 unique **33**; afterStore Δ **10313**; enArmed |
| Alt B (FUNC+TRACK+LEVEL hold) | **panel write PASS** — T1 `3237` → `32381` while held (no PLAY); post-PLAY sample unique **17** |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**Finding:** mop169 tip dual left T1 frozen at bipolar centre **`0x4000`**
(unique=1) while afterStore was live — consistent with DEP≈0. This dig’s
alt fixture maxes LFO-page encoders A–F (and FUNC+encoder) then mid-PLAY
wiggles A–D: T1 halfwords sweep across **33** distinct values (0…32512).
Tip-matched remapper dual-install **words-move peek: Proven**. Catalog
stays **SHUT** (other gates remain).

## Angle vs mop169

| | mop169 | mop184 |
| --- | --- | --- |
| Twin / remapper | `775d9322…` / `4ef940ac7942` | same |
| afterStore under dual | Δ 7543 | Δ **10313** (alt A) |
| `sp_pos_w` T1 | unique=1 @ **`0x4000`** | unique=**33** (moved) |
| Fixture delta | openLfoSetup max A/E/F only | + max B/C/D + FUNC+enc + mid-PLAY wiggle; LEVEL hold |

No Detour package attempted (refusal **9** on tip twin — mop169).

## Packages (private)

Same tip peers as mop167/mop169 (`mop167-dual-install/peers`): tip
`seq-pos.mwrm` **600** B subscribe; Play Modes + 7 LFO coexist; **no**
trig-prob.

## Limits / not claimed

- Catalog pin / Accept / lifecycle — **none**.
- Jump-colour / dual-install audibleProven — **not** this dig.
- FUNC+TRACK toast glyphs — still USB miss (mop175; mop185 TRACK
  re-probe); LEVEL hold moved words without claiming toast publication.
- Chip timing / qualification fill — separate gates.

## Leave

Undo → `[]`. Twin still on RAM → **ASK JON power-cycle** before next twin
/ Keep soft judge (MOP-76). No Accept. Catalog **SHUT**.

## Artifacts

Private: `modwerk-builds/mop184-spos-words-move/` (`publish/summary.json`,
PNGs).  
Project store: `media/mop184-spos-words-move/`.
