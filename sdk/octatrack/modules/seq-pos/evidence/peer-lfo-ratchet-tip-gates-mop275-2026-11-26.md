# SPOS peer LFO ratchet tip gates (MOP-275)

Tip-docs only. Europe/London · 26 November 2026. Unit may be off —
**no USB / Accept / dens invent / ratchet Proven invent** this pass.
Catalog already **PINNED**.

Honest gate matrix after [mop268](usb-ui-shown-peeks-pass-mop268-2026-11-26.md)
latch **PASS**, [mop269](usb-dens-ab-reopen-open-mop269-2026-11-26.md) dens
Open (old fixture), [mop270](dens-ab-fixture-tip-mop270-2026-11-26.md)
asymmetric dens recipe tip, and mop271 dens USB **parked** until unit/Keep.

## Verdict

| Gate | Status |
| --- | --- |
| `sp_ui_shown` latch (mop268) | **PASS** (done) |
| Dens reopen mop269 (TRIG1+TRIG16 class) | **Open / null** (old fixture) |
| Dens fixture tip mop270 | **Landed** (asymmetric silent-end recipe) |
| Dens USB mop271 (mop270 recipe) | **Pending / PARKED** — unit off; no dens result |
| Latch-only ratchet fallback | **Not stamped** — needs verified-empty USB dens null |
| Peer LFO ratchet / reverse / stage tip dig | **Blocked** |
| Stock PLAYHEAD / `0x800065b5` | Still **marches** by design — not a PASS metric |
| dens Proven / ratchet Proven / Accept | **No** / **no** / **none** |

## Intended SPOS role (not claimed Proven)

SPOS is step-addressable (1–16 / path to 64) so peer LFOs can drive
**ratchet / reverse / stage** through the pattern under address mode.
TEMPO owns project BPM; TSPD owns track speed — SPOS tip does **not** own
tempo vs global. Peer TEMPO/TSPD → SPOS ratchet tip dig waits on the dens
gate below. This tip does **not** claim that ratchet behaviour is proven.

## Gate matrix (honest)

| Prerequisite | Evidence | State | Unblocks? |
| --- | --- | --- | --- |
| UI remapper latch | mop267 tip + mop268 USB | **PASS** — STOPPED `sp_ui_shown[0]` 0 then 15 | Necessary, **not** sufficient for ratchet tip dig |
| Toast / step-map | mop268 / mop269 | **PASS** / reconfirmed | Same |
| Audible dens (old fixture) | mop258 / mop259 / mop269 | **Open / null** (5.5/s A=B=C) | **Does not** unblock — fixture class |
| Separable dens recipe | mop270 tip | **Landed** | Enables dens USB retry only |
| Dens USB (asymmetric) | mop271 | **PARKED** — no run; no invent PASS | Preferred unblock when **PASS** |
| Latch-only fallback | mop270 protocol | **Pending** verified-empty null stamp | Fallback unblock only after that USB |
| Peer LFO plan (TEMPO/TSPD → SPOS) | — | Tip dig **not started** | After dens PASS **or** latch-only stamp |

### What unblocks peer TEMPO/TSPD → SPOS ratchet tip dig

1. **Preferred:** Keep-safe Undo dens USB with mop270 asymmetric TRIG1-only
   silent-end fixture **PASSes** dens gates (empty-end preflight + densB ≥
   3× densA and densB ≥ 3× densC). Then peer LFO ratchet tip dig may open
   for dens-gated work.
2. **Fallback:** Same USB verifies empty ends and dens still null → stamp
   mop270 latch-only fallback (remapper Proven on latch/toast + arm/words;
   ratchet gates on latch/toast + peer LFO plan, not dens A/B). Owner
   accepts that stamp before tip dig.
3. Until (1) or (2): peer LFO ratchet/reverse/stage tip dig stays
   **blocked**. Do **not** invent dens PASS. Do **not** claim ratchet
   proven from latch alone.

### Stock PLAYHEAD march (expected)

Stock `PLAYHEAD` / `0x800065b5` still advance under address mode by design.
Judge remapped UI via `sp_ui_shown` / toast (STOPPED stick). Judge audible
playhead via onset dens on `ev_audio_step` → `sp_map`, not LED/PLAYHEAD
peeks. Marching PLAYHEAD is **expected** and is **not** a dens or latch
fail.

## Tip-only AFK leave

- Unit may be powered off — **no device touch** this tip.
- Dens USB resumes when the unit is free again (mop271 resume path);
  tip docs/protocols only until then.
- No Accept. No catalog invent. No dens PASS invent. No ratchet Proven.

## Next (not this tip)

| When | Do |
| --- | --- |
| Unit free + asked | Resume mop271 dens USB (mop270 recipe); Undo-only |
| dens PASS | Note peer LFO ratchet tip dig unblocked for dens gate |
| verified-empty dens null | Stamp latch-only fallback; then peer LFO tip dig may open |
| After unblock | Peer TEMPO/TSPD → SPOS ratchet/reverse/stage tip dig (separate mop) |

## What this tip does **not** claim

- No dens USB result; mop271 remains PARKED.
- No dens Proven; no latch-only fallback stamp.
- No peer LFO ratchet/reverse/stage tip dig started or proven.
- No Accept; no catalog invent; no jump-colour reopen.

## Cross links

- mop270 dens fixture: [`dens-ab-fixture-tip-mop270-2026-11-26.md`](dens-ab-fixture-tip-mop270-2026-11-26.md)
- mop269 dens Open: [`usb-dens-ab-reopen-open-mop269-2026-11-26.md`](usb-dens-ab-reopen-open-mop269-2026-11-26.md)
- mop268 latch PASS: [`usb-ui-shown-peeks-pass-mop268-2026-11-26.md`](usb-ui-shown-peeks-pass-mop268-2026-11-26.md)
- mop258/259 dens Open: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md), [`usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)
- Hub: [`docs/OCTATRACK_LFO_PMTR_EXTENSION.md`](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-peer-lfo-ratchet-tip-gates-mop-275)
