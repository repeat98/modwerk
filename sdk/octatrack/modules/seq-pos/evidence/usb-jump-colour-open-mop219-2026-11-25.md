# SPOS jump-colour SLICE/STRT USB — Open (MOP-219)

Keep tip24. Twin tip `775d9322…`. Undo only. **No Accept. No lifecycle.**
Catalog **SHUT**. Follows mop223 SLICE/STRT fixture tip after mop216
`shared-Flex-attr-lock`. Does **not** invent Proven / cycles / Keep / PC.

## Package / twin

| Field | Value |
| --- | --- |
| Tip remapper | `4ef940ac7942` (matched) |
| Tip `seq-pos.mwrm` | `97de37e6…` (matched) |
| Dual | Play Modes + SEQ POS (inventory 9 mid-trial) |
| Dial-max (audio LFO SETUP) | **37** |
| `sp_len[0]` / peek | **16** (`enT1=1`, `highT1=111`) |
| Undo leave | **`[]`** (twin base still on RAM) |

## Fixture engineering

| Lever | Attempted |
| --- | --- |
| SLICE via STRT | TRIG1 SRC STRT≈min (enc B −) / TRIG16 STRT≈max (enc B +) |
| Middle quiet | TRIG2–15 LEVEL↓ |
| Sample | Jon confirmed multi-slice/long on T1 (tip24 SRC **LxnnGin 32** / Flex) |

Protocol: mop223 Keep-safe USB — mute-isolation S0/S15 before toast C/D.
Refuse LEVEL/filter / PTCH re-runs.

## Mute-isolation preflight (stock, address not required for colour)

| Capture | T1 peak | T1 zc | Notes |
| --- | --- | --- | --- |
| S0 (mute all but TRIG1) | ≈0.0476 | 518 | onset ~16718 |
| S15 (mute all but TRIG16) | ≈0.0476 | 514 | onset ~21086 |
| S0 vs S15 | peakΔ≈0; rmsRatio≈0.994; zcΔ=4; envCorr **0.970** | | **Not separate** |

Per mop223 / mop209: **Fail → stop. Do not capture SPOS C/D.**

## Verdict

| Gate | Result |
| --- | --- |
| Mute-isolation S0≠S15 | **Fail** (S0≈S15 under stock) |
| SPOS C/D | **Aborted** (protocol) |
| Jump-colour Proven | **No** — still **Open** (fixture) |
| Accept / catalog | none / **SHUT** |

Honest class: **Open (fixture)** — STRT min/max p-locks on the confirmed
T1 multi-slice/long sample did not yield mute-isolation separation. Not a
remapper miss (`dialMax` 37; remapper tip-matched; `sp_len=16`). Not toast
or len infra (C/D never reached). Does **not** invent Proven or PC.

## Leave

Undo `[]`. Twin `775d9322…` still on RAM → **ASK JON power-cycle**.
Catalog pin stays **SHUT**. MOP-222 MIDI stock USB waits on tip24 after PC.

## Artifacts

Private: `modwerk-builds/mop219-spos-slice-usb/`  
Store: `media/mop219-spos-slice-usb/`  
Frames/WAV: `evidence/media/hw-*-mop219.*`

## Cross links

- Protocol tip: [`jump-colour-slice-fixture-tip-mop223-2026-11-25.md`](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)
- Dead-end tip: [`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
- Prior PTCH Open: [`usb-jump-colour-open-mop211-2026-11-25.md`](usb-jump-colour-open-mop211-2026-11-25.md)
- Hub honesty (post-mop219): [`publishability-gates-hub-mop227-2026-11-25.md`](publishability-gates-hub-mop227-2026-11-25.md)
- Current hub honesty (after MT resume): [`publishability-gates-hub-mop242-2026-11-25.md`](publishability-gates-hub-mop242-2026-11-25.md)
- Prior hub: [`publishability-gates-hub-mop224-2026-11-25.md`](publishability-gates-hub-mop224-2026-11-25.md)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
