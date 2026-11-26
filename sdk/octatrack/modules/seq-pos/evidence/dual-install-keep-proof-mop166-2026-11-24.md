# Dual-install Keep proof — Play Modes + SPOS on tip-matched `ev_audio_step` (MOP-166, tip-only)

Host tip after #134 (`ffbdad23e`; main later may move). Hub already lists
#8 SPOS as **audibleProven** ([#130](https://github.com/jonathanwardle1992-beep/modwerk/pull/130) /
[mop157](usb-audible-mop157-2026-11-24.md)) and catalog **SHUT**
([#131](https://github.com/jonathanwardle1992-beep/modwerk/pull/131) /
[#133](https://github.com/jonathanwardle1992-beep/modwerk/pull/133)).
**Docs only when written** — no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent peeks / WAV here.
**MOP-167 ran this sheet:** [`usb-dual-install-mop167-2026-11-24.md`](usb-dual-install-mop167-2026-11-24.md)
(inventory dual + tip remapper proven; words-move open).  
**MOP-169 dug words:** [`usb-words-dig-mop169-2026-11-24.md`](usb-words-dig-mop169-2026-11-24.md)
(after_store Δ 7543; words frozen `0x4000`; Detour control refusal 9).  
**MOP-184 closed words-move:** [`usb-words-move-mop184-2026-11-24.md`](usb-words-move-mop184-2026-11-24.md)
(alt DEP/SPD+wiggle; T1 unique **33**; tip remapper).

## Why this note

MOP-102 landed base `ev_audio_step` at `0x400a2d6a` (Play Modes order **40**
→ SPOS order **50**). MOP-157 proved coexist Keep-safe Undo **audible**
address-mode energy for SPOS alone as the exercised lever — but that twin
used the mop73 package Detour path at the remapper site
(`4ef940d24860` present). Tip-matched **base remapper coexistence** (both
modules subscribe; **no** private Detour) and Keep-safe **dual-install**
inventory proof remain open publication gaps (MOP-83 / MOP-102 limits).
This sheet is the executable protocol for that dual-install Keep proof —
largest coexistence publication blocker after audible.

## Honest mop157 gap (cite only)

| Claim | mop157 status |
| --- | --- |
| Coexist dial-max / PMTR **37** | Proven (count `0x27`, dial-max **38**) |
| Words move / `sp_en` arm | Proven |
| WAV onset Δ **−254** → audibleProven | Proven (peaks near-null) |
| Distinct-step jump colour | **Not** separately verified |
| Remapper site = tip-matched base `ev_audio_step` (no private Detour) | **Not** proven — package Detour bytes observed |
| Play Modes + SPOS both in Undo inventory on tip-matched remapper | **Not** run |

Peeks ≠ audible claim. AudibleProven ≠ tip-matched remapper proof.
AudibleProven ≠ dual-install Keep proof. AudibleProven ≠ catalog pin.

## Keep-safe Undo envelope (dual-install session)

Run **one** dual-install session per twin. Prefer tip-matched coexist MWMS
so SETUP reaches PMTR **37** (alone dial-max **30** vs dest **37** —
[MOP-122](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#alone-dial-max-30-vs-dest-33-mop-122)).

1. **Confirm Keep before twin:** Identify Keep (not a twin digest),
   inventory **24**, Screen Off + Mute Modes present, nothing missing.
2. RAM `--dev` Undo twin of tip-matched packages whose inventory includes
   **both** Keep Play Modes (order 40 subscribe via `machine-ports.json`)
   **and** draft Seq Pos (order 50 / `sp_ev_audio_step`) on a tip-matched
   base that already owns `ev_audio_step` (after #75 / MOP-102).
3. **Refuse** a standalone Play Modes Detour `.mwrm` on a site-owning base
   (loader rule 4). Tip-matched remapper only — no private Detour at
   `0x400a2d6a`.
4. **Never** Accept / lifecycle / `device lifecycle` (MOP-67 / MOP-74).
5. Complete peeks (+ optional WAV) below, then Undo → inventory `[]`.
6. **ASK JON power-cycle** before the next twin or before judging Keep soft.

**Twin trap (MOP-76):** RAM twin without Screen Off softs `UP+NO` until Keep
returns — expected residue, not a Keep / Mute Modes clash.

## Preflight peeks (must pass before any dual-install claim)

| Check | Pass rule |
| --- | --- |
| Keep preflight | Keep base; **24**; Screen Off + Mute Modes; nothing missing |
| Inventory dual | Undo twin inventory includes **Play Modes** and **Seq Pos** (or tip-matched MWMS naming both) |
| Contribute index | SETUP PMTR coexist **37** (`SPOS`); alone may dial-max 30 |
| after_store | `sp_lfo_pmtr.after_store` → `sp_on_store` |
| Words / enable | `sp_pos_w` moves under PLAY; `sp_en[track]` non-zero while LFO targets SPOS |
| Remapper site | `0x400a2d6a` = base `ev_audio_step` — **no** private Detour bytes |
| Remapper chain | Play Modes order **40** + SPOS order **50** both subscribe; both return 0 to chain |
| Store | `0x4000d07a` = base `mw_lfo_pmtr_store` only |

Fail → stop. Do **not** treat mop157 Detour-on-twin peeks as this proof.
Structural arm (MOP-73) and remapper assemble (MOP-102) are **not**
dual-install Keep proof.

## Optional WAV (same honesty as mop110 / mop157)

If peeks pass, a matched PLAY A/B (address mode OFF vs ON / high DEP on a
**distinct multi-step** pattern) may confirm address-mode still moves under
the remapper chain. Null / near-null deltas are valid — write them. Do not
invent jump colour. Peaks-only MAIN is sanity, not enough alone. Do not
relabel mop157 onset Δ as dual-install proof.

## What this tip does **not** claim

- That dual-install Keep proof already ran (it has **not**).
- That mop157 tip-matched the base remapper (Detour bytes on that twin).
- Distinct-step jump colour (still unverified).
- Measured ColdFire cycles (`performance.json` all null).
- Filled `tests.qualification` + owner review (example stub only).
- Monochrome SETUP PMTR=SPOS `media/` with label provenance (load-safe PNGs
  only until confirmation).
- Standalone Play Modes `.mwrm` → `runtime.json` (still Detours until
  owner-approved version).
- Any `sdk/catalog.json` pin / force-list.

## Remaining gates vs Keep catalog SHUT (cite only)

| Gate | Status |
| --- | --- |
| Audible address-mode (coexist Undo) | **audibleProven** (mop157); jump-colour gap |
| Tip-matched base remapper (no private Detour) | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install inventory (PM + SPOS) | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md); mop169 stall unique=1 @ `0x4000`) |
| `tests.qualification` + owner review | **Not started** — outline [MOP-168](qualification-fill-path-mop168-2026-11-24.md); recipe [MOP-176](qualification-fill-recipe-mop176-2026-11-24.md) |
| Measured cycles (`performance.json`) | **Filled (emulator)** — static/measured **752**; load 287.8/287.8 idle 0 ([mop179](usb-cycles-mop179-2026-11-24.md)); stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md)); static dig [mop178](usb-cycles-mop178-2026-11-24.md); recipe [mop170](cycles-performance-plan-mop170-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** hardware SETUP label [mop172](usb-setup-pmtr-mop172-2026-11-24.md) (recipe [MOP-171](setup-pmtr-provenance-plan-mop171-2026-11-24.md)) |
| FUNC+TRACK toast pages | **USB miss** / still **Open** [mop175](usb-toasts-miss-mop175-2026-11-24.md); TRACK re-probe [mop185](usb-toasts-reprobe-mop185-2026-11-24.md) (no publication toast PNGs) |
| Standalone Play Modes Detours → `runtime.json` | **Stalled** — tip recipe [mop183](playmodes-runtime-mop183-2026-11-24.md); needs owner-approved Play Modes version + package rebuild / USB; published 0.1.1 `.mwrm` still Detours |
| `sdk/catalog.json` | **Must stay absent** |

Hub sync: [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
(prior [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182)).

## Cross links

- Claim honesty: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Audible fixture: [`next-audible-fixture-mop110-2026-11-24.md`](next-audible-fixture-mop110-2026-11-24.md)
- Qualification path: [`qualification-fill-path-mop168-2026-11-24.md`](qualification-fill-path-mop168-2026-11-24.md)
- Cycles recipe: [`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md)
- SETUP provenance recipe: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md)
- Remapper lineage: MOP-92 · MOP-101 · MOP-102
- Hub trial: [MOP-133](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133)
- Hub strengthen: [MOP-166](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-tip-strengthen-mop157-honesty-and-dual-install-mop-166)
- Hub fill path: [MOP-168](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-path-mop-168)
- Hub SETUP tip: [MOP-171](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-setup-pmtr-monochrome-capturejson-plan-mop-171)
- Soft UP+NO: MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`
