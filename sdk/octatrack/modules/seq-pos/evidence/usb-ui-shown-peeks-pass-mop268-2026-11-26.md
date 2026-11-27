# SPOS `sp_ui_shown` Keep-safe peeks — PASS (MOP-268)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026  
Tracker: **MOP-268**. Keep-safe Undo after #234 / MOP-267 tip latch.  
**No Accept. No lifecycle. Dens stay parked** (ask before any reopen).  
Catalog already **PINNED**.

## Verdict

| Gate | Result |
| --- | --- |
| tip24 Keep preflight | **`eb6679620d0c9ed7…`** inv 25; SEQ POS absent |
| Tip twin | **`cdfb0c2755afedfd…`** RAM boot (Undo-only) |
| Tip UI site `0x4009b2b0` | **Loaded** — `4ef940ac791e` (jmp) |
| mop267 seq-pos package | **`091d58558a…`** / 1312 B; live `0x80000000`; **no** battery `0x100b14cc`; ≠ mop266 `2d5d2a6a…` / 1288 B |
| Dual inventory | Play Modes + SEQ POS (+ LFO peers) |
| `sp_ui_shown` resolve | **`wordsPtr - 0x28`** → `0x40d28804` (idle `0xff×8` at load) |
| Toast / step-map 0 vs 127 | **PASS** — expected steps **0** / **15**, `lenT1=16`, `enT1=1` |
| **`sp_ui_shown[0]` stick** | **PASS** — mode **0** (share 1) then **15** (share 1); unique 1 |
| Live track `0x80000000` | mode **0** under B and C |
| Wrong metric `0x800065b5` | Recorded only (stopped samples unique 1); **not** a PASS metric |
| Dens A/B reopen | **None** (parked; ask first even after PASS) |
| Accept / catalog invent | **none** |

**Honest class: PASS (`sp_ui_shown` getter stick).** mop267 latch USB-readable; toast dest 0 vs 127 with `len=16` maps to steps 0 then 15; latch sticks. Dens remain parked until explicitly asked.

## What ran

1. Synced fork `main` (`7b911155f` = #234). Branch `cursor/mop268-spos-ui-shown-peeks-3932`.
2. Rebuilt machine-ports packages: seq-pos with mop267 `sp_ui_shown` + live `0x80000000`.
3. Keep-safe Undo RAM boot tip twin `cdfb0c27…`.
4. Undo trial coexist → resolve `sp_ui_shown` like `sp_en` (`wordsPtr-0x28`).
5. Toast OFF / SPOS 0 / SPOS 127 **while STOPPED** (avoids `sp_map` PLAYHEAD length-learn growing `sp_len` past 16).
6. Sample `sp_ui_shown[0]` under UI refresh; PASS 0 then 15.
7. Undo → `[]`. **ASK JON power-cycle.**

## Exact peeks (B = SPOS 0, C = SPOS 127)

| State | highT1 | en | len | expectedStep | `sp_ui_shown[0]` mode | share | unique |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B dest 0 | **0** | 1 | 16 | **0** | **0** | 1.0 | 1 |
| C dest 127 | **127** | 1 | 16 | **15** | **15** | 1.0 | 1 |

## Package / twin

| Field | Value |
| --- | --- |
| Twin | `cdfb0c2755afedfd…` |
| `seq-pos.mwrm` | `091d58558a…` / 1312 B (mop267 latch) |
| `playmodes.mwrm` | `e86ca3b258…` / 15986 B |
| `sp_ui_shown` | `0x40d28804` via `wordsPtr-0x28` |
| EVENT_ROW | `0x40ad6e86` |
| Undo leave | **`[]`** (twin base still on RAM) |

## Trap (folded)

`sp_map` learns `sp_len[t]` from `PLAYHEAD[t]+1` when larger. PLAY before both toast peeks grows len (here ~22) so dest 127 maps to step ~21 instead of 15. Sample `sp_ui_shown` under address **while STOPPED** (UI key refresh) to keep default `sp_len=16` for the formal 0-then-15 recipe.

## Artifacts

Private: `Projects/modwerk-builds/mop268-spos-ui-shown/publish/`  
Store media: project `media/mop268-spos-ui-shown/`  
Store status: project `internal/mop268-spos-ui-shown-peeks.md`

## Cross links

- Tip latch: [`panel-led-surface-tip-mop267-2026-11-26.md`](panel-led-surface-tip-mop267-2026-11-26.md)
- Prior Open (no surface): [`usb-panel-led-peeks-open-mop266-2026-11-26.md`](usb-panel-led-peeks-open-mop266-2026-11-26.md)
