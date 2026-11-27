# SPOS dens A/B separable fixture tip (MOP-270)

Tip-docs only. Europe/London · 26 November 2026. After
[mop269](usb-dens-ab-reopen-open-mop269-2026-11-26.md) dens reopen left
onset dens **Open/null** (5.5/s A=B=C) while STOPPED
[`sp_ui_shown`](usb-ui-shown-peeks-pass-mop268-2026-11-26.md) stick 0 then
15 **PASS**. Catalog already **PINNED**. **No** USB / Accept / lifecycle /
twin boot / `sdk/catalog.json` invent this pass.

## Verdict

| Question | Answer |
| --- | --- |
| Why mop258/269 dens stayed null? | **Fixture class** — both addressed ends loud; LEVEL mute did not sparsify; B≈C expected |
| Audio path vs UI path? | UI remapper **Proven** (toast + `sp_ui_shown`); dens measures audible onsets on the **audio** remapper path |
| Smallest separable dens fixture? | **Asymmetric silent-end** — TRIG1 only; steps 2–16 **empty** (no trig), not LEVEL↓ |
| dens A/B can prove remapper today? | **Not yet** — prior recipes cannot; one USB with verified empty grid still owed |
| Latch-only ratchet gate? | **Fallback** only after verified asymmetric fixture still nulls |
| Accept / catalog | **none** / already PINNED |

## Why sparse dens fixtures stay null under remapped steps

### Two paths (do not conflate)

| Path | Site / surface | mop268/269 status |
| --- | --- | --- |
| **UI remapper** | `ev_ui_step` → `sp_map` → `sp_ui_shown[t]` + toast | **PASS** — sticks 0 then 15 (STOPPED; `len=16`) |
| **Audio remapper** | `ev_audio_step` → `sp_map` → played step | Tip-matched Proven (words/toast/arm); **dens** never separated |
| Stock PLAYHEAD / `0x800065b5` | Counter / master-step low byte | Still **marches** by design — **not** a dens or latch metric |

Address mode parks the **played** step at `(high × len) >> 7`. With
`len=16`: toast **0** → every tick plays step **0**; toast **127** → every
tick plays step **15**. Stock PLAYHEAD underneath still advances — dens
must judge **audio onsets**, not LED/PLAYHEAD peeks.

### Why mop258 / mop259 / mop269 densA=B=C=5.5/s

1. **mop258 / mop269 fixture (TRIG1+TRIG16 loud, TRIG2–15 LEVEL↓)**  
   Parks B on step 0 and C on step 15 — **both ends have content**. Under
   address mode both ends re-fire every tick → **densB ≈ densC by
   construction**. LEVEL↓ also failed to sparsify address-OFF march
   (`densA` stayed 5.5/s), so A vs B never got a sparse baseline.

2. **mop259 (TRIG1-only intent)**  
   Stronger idea, but grid REC clear of TRIG2–16 stayed **unverified**
   (LCD SRC+FLEX). dens still 5.5/s — empty-end not proven on the twin.

3. **Identical 5.5/s across A/B/C**  
   Matches a **non-separating** pattern / onset floor, not a UI latch miss.
   mop269 reconfirmed the UI latch while dens stayed null — remapper USB
   readability ≠ audible dens separation.

Do **not** re-run mop258-class TRIG1+TRIG16 loud and call it a new dens dig.

## Separable dens fixture (asymmetric silent-end)

Goal: onset dens must diverge when address remaps **0 vs 15**.

| State | Address | Expected played step | Pattern requirement | Expected dens |
| --- | --- | --- | --- | --- |
| **A** | OFF (`sp_en=0` / toast OFF) | Stock march 0…15 | Only TRIG1 present | Sparse (~tick/16) |
| **B** | toast SPOS **0** | Step **0** every tick | TRIG1 present | Dense (~tick rate) |
| **C** | toast SPOS **127** | Step **15** every tick | TRIG16 **absent** | Near silent / ≪ densB |

### Required engineering (before any dens WAV)

1. Isolate **T1**. Prefer short one-shot / click on TRIG1 (avoid long Flex
   tails that inflate onset counts). Quiet other tracks.
2. **Clear** TRIG2–16 (no trig) — not LEVEL↓ alone. Prefer project/grid
   edit that leaves steps empty; mop259 REC path was unreliable on twin.
3. **Verify empty ends** under address **OFF** before toast:
   - Mute / solo check: TRIG1 alone loud; step 16 silent under stock.
   - Optional: short WAV **S0** (TRIG1) vs **S15** (step 16) — S15 near
     silent / dens ≪ S0. **Fail → stop** (fixture Open; not remapper miss).
4. Park PMTR away from SPOS for A; FUNC+TRACK toast for B/C. Peek
   `sp_en` / `sp_len=16` / expected step; judge remapped UI via
   `sp_ui_shown` / toast (STOPPED stick) — never `0x800065b5`.
5. Capture matched PLAY WAVs A/B/C (same tempo / LEVEL / length). Prefer
   STOPPED latch peeks before PLAY so `sp_map` length-learn does not grow
   `sp_len` past 16 (mop268 trap).

### Pass / fail gates (honest)

| Gate | Pass rule |
| --- | --- |
| Empty-end preflight | Step 15 silent (or densS15 ≪ densS0) under stock |
| dens B vs A | densB ≥ **3×** densA (parked TRIG1 denser than sparse march) |
| dens B vs C | densB ≥ **3×** densC **or** densC near silent (empty park) |
| UI latch (optional same session) | STOPPED `sp_ui_shown` 0 then 15 (already PASS mop268/269) |

All dens gates must pass to claim dens playhead motion **Proven**. Fail
with verified empty grid → dens still cannot isolate remapper (see latch
fallback). Fail without empty verification → **Open (fixture)** — retry
engineering, do not park dens yet.

## Latch-only ratchet fallback (after verified null)

If one Keep-safe Undo USB run uses the **verified** asymmetric fixture
above and densA=B=C still (or B≈C with empty step 15 confirmed), stamp:

> **Audible onset dens cannot prove the remapper** for peer LFO ratchet.
> Remapper remains Proven on UI latch (`sp_ui_shown` / toast) + audio
> arm/words path. Peer LFO ratchet/reverse/stage gates on **latch/toast +
> peer LFO plan**, not dens A/B.

Until that verified null (or a dens PASS), preference stays: ratchet
**blocked** until dens separates. This tip does **not** waive dens or
unblock ratchet by itself. Tip-gate matrix while dens USB pending:
[`peer-lfo-ratchet-tip-gates-mop275-2026-11-26.md`](peer-lfo-ratchet-tip-gates-mop275-2026-11-26.md).

## Next USB protocol (Keep-safe Undo only — later worker)

**No USB this tip pass.** When the unit is free:

1. ASK JON PC if twin still on RAM. Confirm tip24 Keep.
2. Twin tip remapper + tip dual (Play Modes + SEQ POS latch package).
3. Engineer asymmetric TRIG1-only empty 2–16; run empty-end preflight.
4. STOPPED toast 0/127 + `sp_ui_shown` stick (sanity).
5. PLAY dens A/B/C with gates above.
6. Undo → `[]`. ASK JON PC. No Accept. No catalog invent.

### Outcome classes

| Result | Write as | Next |
| --- | --- | --- |
| Empty-end preflight fails | **Open (fixture)** | Re-engineer grid; do not park dens |
| dens gates pass | dens playhead **Proven** (USB claim) | Peer LFO ratchet unblocked for dens gate |
| Empty verified + dens still null | **Open → dens cannot isolate** | Latch-only ratchet gate + peer LFO plan |
| Toast / `sp_ui_shown` / remapper fail | **Open (infra)** | Fix latch/toast first |

## What this tip does **not** claim

- No dens Proven invent; no Accept; no catalog invent.
- No USB this pass.
- Does not reopen jump-colour (still Unproven/waived mop243).
- Does not treat stock PLAYHEAD / `0x800065b5` as remapped UI.
- Does not unblock peer LFO ratchet until dens PASS **or** owner accepts
  the latch-only fallback after verified dens null.

## Cross links

- mop269 dens Open: [`usb-dens-ab-reopen-open-mop269-2026-11-26.md`](usb-dens-ab-reopen-open-mop269-2026-11-26.md)
- mop268 latch PASS: [`usb-ui-shown-peeks-pass-mop268-2026-11-26.md`](usb-ui-shown-peeks-pass-mop268-2026-11-26.md)
- mop258/259 dens Open: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md), [`usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)
- mop260 park / gap: [`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md)
- Jump-colour fixture style: [`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
- Hub: [`docs/OCTATRACK_LFO_PMTR_EXTENSION.md`](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-dens-ab-fixture-tip-mop-270)
