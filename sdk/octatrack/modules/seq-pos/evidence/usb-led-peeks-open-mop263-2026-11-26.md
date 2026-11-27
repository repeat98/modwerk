# SPOS Keep-safe LED peeks — Open (MOP-263)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026  
Tracker: **MOP-263**. Keep-safe Undo after #229 / MOP-262 `ev_ui_step`.  
**No Accept. No lifecycle. Dens stay parked.** Catalog already **PINNED**.

## Verdict

| Gate | Result |
| --- | --- |
| Tip twin (main after #229) | **`cdfb0c2755afedfd…`** (config `cdfb0c27…`) |
| Tip UI site `0x4009b2b0` | **Loaded** — `4ef940ac791e` (jmp; not stock) |
| Tip audio site `0x400a2d6a` | `4ef940ac796e` |
| Mid-trial UI handlers (room) | **2** (`0x40d26f0c`, `0x40d287bc` — PM then SPOS) |
| Mid-trial audio handlers | **2** |
| Dual inventory | Play Modes + SEQ POS (+ LFO peers) |
| Dial-max / toast bind 0 / 127 | **PASS** — expected steps **0** / **15**, `lenT1=16`, `enT1=1` |
| LED byte `0x800065b5` stick under address | **Fail** — unique≈12 A/B/C; mode≈4 (~10%); marched |
| Stock PLAYHEAD `0x800064d0[t]` | Marches (uniqueT1=4) — by design (never write-back) |
| LED / playhead UI follows remapped step | **Open** — do **not** invent PASS |
| Dens A/B reopen | **None** (parked) |
| Accept / catalog invent | **none** |

**Honest class: Open (LED stick).**  
Tip wire + machine-ports subscribe are on the unit; toast/step-map 1–16 peeks PASS; master LED byte still marches under address the same as OFF. Dens remain parked.

## What ran

1. Tip twin build from `1b7c35aa7` (#229) with `ev_ui_step` site present.
2. Tip packages via `--octabam-machine` (playmodes + seq-pos machine-ports glue) + draft LFO peers.
3. Keep preflight tip24 `eb667962…` inv 25 (SEQ POS absent).
4. RAM boot twin → Undo trial coexist → toast OFF / SPOS 0 / SPOS 127 peeks.
5. Sample PLAYHEAD vs LED byte (~48×40 ms) per state.
6. Undo → `[]`. **ASK JON power-cycle.**

## Exact peeks (B = SPOS 0, C = SPOS 127)

| State | highT1 | en | len | expectedStep | playheadUnique | ledUnique | ledMode / share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A OFF | — | 0 | — | — | 4 | 12 | 4 / ~0.10 |
| B dest 0 | 0 | 1 | 16 | **0** | 4 | 12 | 4 / ~0.10 |
| C dest 127 | 127 | 1 | 16 | **15** | 4 | 12 | 4 / ~0.10 |

## Package / twin

| Field | Value |
| --- | --- |
| Twin | `cdfb0c2755afedfd…` |
| `seq-pos.mwrm` | `e797febe…` / 1268 B (machine-ports `ev_ui_step` + audio) |
| `playmodes.mwrm` | `e86ca3b258…` / 15986 B (machine-ports `ev_ui_step`, no LED Detour) |
| EVENT_ROW | `0x40ad6e86` (`modwerk_runtime_event_row` on this twin) |
| Undo leave | **`[]`** (twin base still on RAM) |

## Next levers (not this dig)

1. Better per-track LED / panel evidence — master byte `0x800065b5` may track master/`track<0` (SPOS leaves master/MIDI stock); confirm which getter arg the trig-LED refresh uses.
2. Dens A/B stay **parked** until LED stick PASS.
3. Owner-approved Seq Pos / Play Modes `runtime.json` migrations for `ev_ui_step`.

Follow-up Keep-restore re-peek: [`usb-led-repeeks-open-mop264-2026-11-26.md`](usb-led-repeeks-open-mop264-2026-11-26.md) (same Open class; tip dig skipped because Keep present).

## Artifacts

Private: `Projects/modwerk-builds/mop263-spos-led-peeks/publish/`  
Store media: project `media/mop263-spos-led-peeks/`  
Store status: project `internal/mop263-spos-led-peeks.md`

## Cross links

- Tip wire: [`base-ev-ui-step-impl-mop262-2026-11-26.md`](base-ev-ui-step-impl-mop262-2026-11-26.md)
- Dig: [`playhead-led-firmware-dig-mop261-2026-11-26.md`](playhead-led-firmware-dig-mop261-2026-11-26.md)
- Gap park: [`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md)
- Prior dens Open: mop258 / mop259
