# SPOS dens A/B reopen after mop268 — Open (MOP-269)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026  
Tracker: **MOP-269**. Keep-safe Undo dens reopen after #235 / mop268 `sp_ui_shown` PASS.  
**No Accept. No lifecycle.** Jon authorized dens reopen (ask satisfied).

## Verdict

| Gate | Result |
| --- | --- |
| tip24 Keep preflight | **`eb6679620d0c9ed7…`** inv 25; SEQ POS absent |
| Tip twin | **`cdfb0c2755afedfd…`** RAM boot (Undo-only) |
| Tip UI site `0x4009b2b0` | **Loaded** — `4ef940ac791e` (jmp) |
| mop267/268 seq-pos package | **`091d58558a…`** / 1312 B; live `0x80000000` |
| Dual inventory | Play Modes + SEQ POS (+ LFO peers) |
| Toast / step-map (STOPPED) | **PASS** — steps **0** / **15**, `lenT1=16`, `enT1=1` |
| **`sp_ui_shown[0]` stick** | **Reconfirmed** — mode **0** then **15** (share 1, unique 1) |
| Sparse dens A/B (mop258-class) | **Null** — densA=B=C=**5.5**/s |
| Wrong metric `0x800065b5` | Recorded only (unique 1 under STOPPED stick); **not** PASS metric |
| Accept / catalog invent | **none** |
| Peer LFO ratchet unblocked? | **No** — dens still Open |

**Honest class: Open (dens null).** Remapper still USB-readable (`sp_ui_shown` / toast); audible onset-density A/B does not separate under address mode — same class as mop258/259. Stock PLAYHEAD still marches by design.

## What ran

1. Synced fork `main` (`24619cf52` = #235 mop268). Branch `cursor/mop269-spos-dens-reopen-60f3`.
2. Reused mop268 tip peers (`091d58558a…` latch).
3. Keep-safe Undo RAM boot tip twin `cdfb0c27…`.
4. Phase 1 STOPPED: toast 0 vs 127 + `sp_ui_shown[0]` stick 0 then 15 (mop268 recipe; `len=16`).
5. Phase 2 PLAY: mop258-class sparse (TRIG1+16 loud / 2–15 LEVEL↓) + WAV dens A/B/C.
6. Undo → `[]`. **ASK JON power-cycle.**

## Exact peeks (STOPPED stick)

| State | highT1 | en | len | expectedStep | `sp_ui_shown[0]` mode | share | unique |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B dest 0 | **0** | 1 | 16 | **0** | **0** | 1.0 | 1 |
| C dest 127 | **127** | 1 | 16 | **15** | **15** | 1.0 | 1 |

## Density (PLAY)

| Pair | densA | densB | densRatio | playheadMotionHint |
| --- | --- | --- | --- | --- |
| B vs A | 5.5 | 5.5 | 1.0 | false |
| C vs A | 5.5 | 5.5 | 1.0 | false |
| C vs B | 5.5 | 5.5 | 1.0 | false |

Note: PLAY after stick grows `sp_len` from PLAYHEAD (mop268 trap); dens peeks may show `len≠16` / expected step ≠15. Stick gate used STOPPED samples only.

## Package / twin

| Field | Value |
| --- | --- |
| Twin | `cdfb0c2755afedfd…` |
| `seq-pos.mwrm` | `091d58558a…` / 1312 B |
| `sp_ui_shown` | `0x40d28804` via `wordsPtr-0x28` |
| Undo leave | **`[]`** (twin base still on RAM) |

## Artifacts

Private: `Projects/modwerk-builds/mop269-spos-dens-reopen/publish/`  
Store media: project `media/mop269-spos-dens-reopen/`  
Store status: project `internal/mop269-spos-dens-reopen.md`

## Leave / next

Peer LFO ratchet still **blocked**. Do **not** re-run mop258-class
TRIG1+TRIG16 loud dens. Next dens USB must use the asymmetric silent-end
fixture tip ([MOP-270](dens-ab-fixture-tip-mop270-2026-11-26.md)) — TRIG1
only; steps 2–16 empty; empty-end preflight before dens A/B/C. Latch-only
ratchet fallback only after that verified fixture still nulls dens.

## Cross links

- mop268 PASS: [`usb-ui-shown-peeks-pass-mop268-2026-11-26.md`](usb-ui-shown-peeks-pass-mop268-2026-11-26.md)
- Dens fixture tip: [`dens-ab-fixture-tip-mop270-2026-11-26.md`](dens-ab-fixture-tip-mop270-2026-11-26.md)
- Prior dens Open: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md), [`usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)
