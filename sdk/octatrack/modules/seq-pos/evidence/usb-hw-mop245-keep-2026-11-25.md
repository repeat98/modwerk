# USB hardware — MOP-245 Keep of Seq Pos Accept PASS (+ reboot MOP-247)

Europe/London · 25 November 2026. Authorized Keep dig after tip
[`protocol-mop244-keep-usb-2026-11-25.md`](protocol-mop244-keep-usb-2026-11-25.md)
(#212). Jon authorized Accept / `device_keep` for **SPOS Keep only**.
Catalog **SHUT**. Jump-colour remains **Unproven/waived** (mop243 / #211).

## Envelope

| Check | Result |
| --- | --- |
| Jon Accept authorization | **Yes** (SPOS Keep only) |
| Base | tip24 production `eb6679620d0c9ed7…` (not a twin) |
| Tip package | `97de37e698ac88a7…` / **1224** B tip-matched (mop202) |
| Path | Single-package add (preserve tip24 companions incl. Micro Timing) |
| Self-test | **PASS** (state 2; failed 0; modules 26/26 intact; dsp 5) |
| Accept / `session.accept` | **Yes** |
| Card save (at Accept) | **savedOnCard true** |
| Catalog | **SHUT** |

## Baseline (preflight)

| Field | Before |
| --- | --- |
| Inventory | **25** (Mute Modes + Screen Off + Micro Timing present) |
| Seq Pos | **absent** |
| Companions to preserve | current tip24 set (Jon: tip24 companions survive) |

## After Accept

| Field | After |
| --- | --- |
| Inventory | **26** |
| Seq Pos | **present** (`SEQ POS`) |
| Companions lost | **none** |
| Mute Modes / Screen Off / Micro Timing | **present** |

## Post-reboot (Jon PC done · MOP-247 · Europe/London ~20:32)

Bridge restarted after PC (I/O err → new bridge on 47811). Re-IDENTIFY +
inventory (mop244 protocol step 7 / MT mop230-reboot pattern):

| Field | Result |
| --- | --- |
| Base | tip24 `eb6679620d0c9ed7…` (**PASS**) |
| Inventory count | **26** |
| Seq Pos | **present** (`SEQ POS`; module `f7bb3258`) |
| Mute Modes / Screen Off / Micro Timing | **present** |
| Companions lost | **none** |
| Reboot persistence | **PASS** |

Honest limit: SETUP PMTR / FUNC+TRACK toast reachability not re-checked
this pass (optional in ask-Jon). Persistence Proven here is **inventory
survival across physical reboot** on tip24 — package Keep ≠ DRAM Enable /
SPOS address-mode survival (0.1.0 expected gap).

## Verdict

| Gate | Result |
| --- | --- |
| Tip24 baseline confirm | **PASS** |
| Self-test before Keep | **PASS** |
| Keep Accept (inventory + save) | **PASS** |
| Physical reboot persistence | **PASS** (post-PC tip24 + SEQ POS still in inv; mop247) |
| Catalog pin | **SHUT** (pin-bound qual review still Open) |
| Jump-colour | **Unproven/waived** (mop243) — not re-opened |

Honest: Keep of Seq Pos is **inventory/card-save Proven** and
**reboot-persistence Proven** for this tip-matched package on tip24.
Qual pin-bound review / catalog pin remain **Open**. Jump-colour stays
**Unproven/waived**.

## Leave

Unit left on tip24 with Seq Pos Kept after Jon PC. Catalog **SHUT**.

## Artifacts

Private: `modwerk-builds/mop245-spos-keep-accept/publish/`  
Store: `media/mop245-spos-keep-accept/` (`summary.json`, inventories,
`02-reboot-confirm.json`)

## Cross links

- Protocol: [`protocol-mop244-keep-usb-2026-11-25.md`](protocol-mop244-keep-usb-2026-11-25.md)
- Keep gate: [`keep-publish-gate-mop244-2026-11-25.md`](keep-publish-gate-mop244-2026-11-25.md)
- Jump waive: [`publishability-gates-hub-mop243-2026-11-25.md`](publishability-gates-hub-mop243-2026-11-25.md)
- MT reboot pattern: mop230 post-PC inventory confirm
