# SPOS jump-colour SAMPLE/PTCH USB — Open (MOP-211)

Keep tip24. Twin tip `775d9322…`. Undo only. **No Accept. No lifecycle.**
Catalog **SHUT**. Follows mop209 stronger-fixture tip. Does **not** invent
Proven / cycles / Keep.

## Package / twin

| Field | Value |
| --- | --- |
| Tip remapper | `4ef940ac7942` (matched) |
| Tip `seq-pos.mwrm` | `97de37e6…` (matched) |
| Dual | Play Modes + SEQ POS (inventory 9 mid-trial) |
| Dial-max (audio LFO SETUP) | **37** (after forcing MIDI off) |
| `sp_len[0]` | **16** |
| Undo leave | **`[]`** |

## Fixture engineering

| Lever | Attempted |
| --- | --- |
| PTCH | TRIG1 SRC enc A − / TRIG16 enc A + (extreme) |
| Middle quiet | TRIG2–15 LEVEL↓ |
| SAMPLE slot | Not locked (FLEX sample is track-level; PTCH preferred USB path) |

Infra note: first dial attempts hit **MIDI LFO SETUP** (MIDI button left
on from prior Micro Timing dig) → dial-max **29**. Audio LFO SETUP after
MIDI off → dial-max **37**.

## Mute-isolation preflight (stock, address not required for colour)

| Capture | T1 peak | T1 zc | Notes |
| --- | --- | --- | --- |
| S0 (mute all but TRIG1) | ≈0.0476 | 514 | |
| S15 (mute all but TRIG16) | ≈0.0476 | 514 | |
| S0 vs S15 | peakΔ≈0; zcΔ=0; envCorr **0.99999** | | **Not separate** |

Per mop209: **Fail → stop. Do not capture SPOS C/D.**

## Verdict

| Gate | Result |
| --- | --- |
| Mute-isolation S0≠S15 | **Fail** (S0≈S15) |
| SPOS C/D | **Aborted** (protocol) |
| Jump-colour Proven | **No** — still **Open** (fixture) |
| Accept / catalog | none / **SHUT** |

Honest class: **Open (fixture)** — bodies still not engineered under stock
on this project (PTCH locks did not yield audible/spectral separation;
same one-shot family). Not a remapper miss (`dialMax` 37; remapper tip-matched;
`sp_len=16`). Not the mop209 remapper-colour dead-end (that requires
S0≠S15 then C≈D). Later tip [mop216](jump-colour-deadend-tip-mop216-2026-11-25.md)
declares the broader `shared-Flex-attr-lock` mute-isolation dead-end and the
SLICE/STRT exit lever.

## Leave

Undo `[]`. Twin on RAM → **ASK JON power-cycle**. Catalog pin stays **SHUT**.

## Artifacts

Private: `modwerk-builds/mop211-spos-jump-sample-usb/`  
Store: `media/mop211-spos-jump-sample-usb/`  
Frames/WAV: `evidence/media/hw-*-mop211.*`

## Cross links

- Dead-end tip: [`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
- Tip: [`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
- Prior USB Open: [`usb-jump-colour-open-mop203-2026-11-25.md`](usb-jump-colour-open-mop203-2026-11-25.md)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
