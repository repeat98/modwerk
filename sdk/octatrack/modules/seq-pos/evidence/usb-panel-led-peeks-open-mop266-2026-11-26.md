# SPOS panel LED / getter peeks — Open (MOP-266)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026  
Tracker: **MOP-266**. Keep-safe Undo after #232 / MOP-265 tip (`CUR_TRACK`→`sp_map`).  
**No Accept. No lifecycle. Dens stay parked.** Catalog already **PINNED**.  
Correct metrics only: **panel LEDs / `ev_ui_step` getter return** — not `0x800065b5` unique.

## Verdict

| Gate | Result |
| --- | --- |
| tip24 Keep preflight | **`eb6679620d0c9ed7…`** inv 25; SEQ POS absent |
| Tip twin | **`cdfb0c2755afedfd…`** RAM boot (Undo-only) |
| Tip UI site `0x4009b2b0` | **Loaded** — `4ef940ac791e` (jmp) |
| Tip audio site `0x400a2d6a` | `4ef940ac796e` |
| mop265 seq-pos package | **`2d5d2a6a…`** / 1288 B; contains `0x100b14cc`; ≠ mop263 `e797febe…` / 1268 B |
| Dual inventory | Play Modes + SEQ POS (+ LFO peers) |
| Dial-max / toast bind 0 / 127 | **PASS** — expected steps **0** / **15**, `lenT1=16`, `enT1=1` |
| Live current track `0x80000000` | mode **0** under B and C (T1) |
| Battery `CUR_TRACK` `0x100b14cc` | USB MEM returns null — tip glue still encodes it; peeks used live track |
| Wrong metric `0x800065b5` | Marches unique≈14–15 — **recorded only; not a PASS metric** (mop265) |
| Panel / getter stick 0 vs 15 | **Open** — no confirmed SRAM candidate stuck to remapped step across dest 0→0 and dest 127→15 |
| Dens A/B reopen | **None** (parked) |
| Accept / catalog invent | **none** |

**Honest class: Open (panel / getter stick).** Tip wire + mop265 master/-1 glue + toast/step-map PASS on-unit; remapped panel/getter stick not proven via USB MEM. Do **not** invent PASS from `0x800065b5` (still marches by design).

## What ran

1. Synced fork `main` (`a8814a96b` = #232). Branch `cursor/mop266-spos-panel-led-peeks-2caf`.
2. Rebuilt machine-ports packages: seq-pos with mop265 `step_ptr_track_reg_map` (master `-1` → `CUR_TRACK` → `sp_map`).
3. Keep-safe Undo RAM boot tip twin `cdfb0c27…`.
4. Undo trial coexist → toast OFF / SPOS 0 / SPOS 127 peeks.
5. Sample live track + wrong LED byte; hunt panel/getter shown-step candidates in SRAM (exclude `0x800065b5` / PLAYHEAD).
6. Wide follow-up dump: no confirmed B/C stick (abbreviated run also hit a len glitch — primary toast PASS is the main fixture).
7. Undo → `[]`. **ASK JON power-cycle** to restore Keep.

## Exact peeks (B = SPOS 0, C = SPOS 127)

| State | highT1 | en | len | expectedStep | curTrack live | wrongLed unique | panel/getter cross |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B dest 0 | 0 | 1 | 16 | **0** | 0 | ≈15 | none |
| C dest 127 | 127 | 1 | 16 | **15** | 0 | ≈14 | none |

## Package / twin

| Field | Value |
| --- | --- |
| Twin | `cdfb0c2755afedfd…` |
| `seq-pos.mwrm` | `2d5d2a6a…` / 1288 B (mop265 CUR_TRACK glue) |
| `playmodes.mwrm` | `e86ca3b258…` / 15986 B |
| EVENT_ROW | `0x40ad6e86` |
| Undo leave | **`[]`** (twin base still on RAM) |

## Next levers (not this dig)

1. Find a USB-readable panel-LED / remapped-`d0` surface (trig LEDs not on LCD; battery `CUR_TRACK` not readable via MEM).
2. Dens A/B stay **parked** until panel/getter stick PASS.
3. No Accept; ask before any dens reopen even after a clear PASS.

## Artifacts

Private: `Projects/modwerk-builds/mop266-spos-panel-led/publish/`  
Store media: project `media/mop266-spos-panel-led/`  
Store status: project `internal/mop266-spos-panel-led-peeks.md`

## Cross links

- Tip fix: [`led-stick-tip-dig-mop265-2026-11-26.md`](led-stick-tip-dig-mop265-2026-11-26.md)
- Prior Open (wrong metric): [`usb-led-peeks-open-mop263-2026-11-26.md`](usb-led-peeks-open-mop263-2026-11-26.md), [`usb-led-repeeks-open-mop264-2026-11-26.md`](usb-led-repeeks-open-mop264-2026-11-26.md)
- Tip wire: [`base-ev-ui-step-impl-mop262-2026-11-26.md`](base-ev-ui-step-impl-mop262-2026-11-26.md)
