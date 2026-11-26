# SPOS jump-colour tip dig — stall + next USB fixture (MOP-200)

Tip-docs only. Europe/London · 25 November 2026. After
[mop199](usb-jump-colour-open-mop199-2026-11-25.md) USB left jump-colour
**Open** (WAV C≈D envCorr **0.99986**; words uniqueT1 11 / 16). Catalog
**SHUT**. No Accept / lifecycle / twin boot / `sdk/catalog.json`
force-list. Do **not** invent Proven.

## Verdict

| Question | Answer |
| --- | --- |
| Tip remapper / Play Modes path? | **Found** — order 40 `pm_ev_audio_step` → order 50 `sp_ev_audio_step` → `sp_map` when `sp_en[t]` (MOP-102 / mop167 tip-matched `4ef940ac7942`) |
| Should SPOS extremes change audible colour? | **Yes** — parked address mode plays `(SPOS_hi * len) >> 7` instead of stock playhead; distinct step bodies → distinct colour |
| Clear remapper / sample-path code fix? | **No** — tip remapper Proven; words move; `sp_map` maps 0→step0 and 127→step(len−1) under default len 16 |
| Why mop199 C≈D? | **Fixture / project non-separation** (honest) — peeks prove address words; bodies indistinguishable on that project |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Remapper / sample path (tip)

Publication path (tip-matched base owns `0x400a2d6a` as `ev_audio_step`):

1. Base loads stock playhead into `*step`.
2. Play Modes order **40** (`pm_ev_audio_step` / `pm_step_entry`) may map the step.
3. Seq Pos order **50** (`sp_ev_audio_step`): when `sp_en[t]`, call `sp_map`
   and write the addressed step back to `*step`; else leave it. Return 0
   to chain.
4. Stock rejoins at `0x400a2d74` and calls the audio-step consumer with the
   final step (`modwerk_events.h` / EVENTS.md).

`sp_map` (linked `unit.s`): address-on uses SPOS high byte 0..127 scaled
across `sp_len[t]` (default **16**, grows from observed playhead, clamp
1..64). Address-off (or len 0) follows the incoming step. Card/pre-event
Detour `sp_audio_step` is the same `sp_map` core — mop157 Detour-on-twin
honesty retained; mop167 tip remapper is the publication path.

**Not a remapper miss:** mop199 tip twin tip-matched remapper + tip dual;
words moved at both extremes. Timing-lag vs stock remains the mop157
audibleProven half (mop199 colourAC/AD envCorr ≈0.20) — that is **not**
jump-colour.

## Why C≈D is not a clear code fix

mop199 gateReasons all false (peak/rms/env/zc). Body metrics:

| Pair | envCorr | Note |
| --- | --- | --- |
| C vs D (jump-colour) | **0.99986** | Indistinguishable bodies |
| A vs C / A vs D | ≈0.20 | Address-on vs stock envelope move (timing lineage) |

If remapper/sample path were broken, words would not move or tip remapper
would not match. They did. Scaling at extremes is distinct (0 vs len−1)
unless `sp_len[t]` collapses to **1** (both map to step 0) — mop199 did
**not** peek `sp_len`; next USB must. Speculative one-shot re-fire or
length-from-pattern (`+0x50`) changes are **not** clear fixes from this
evidence; do not ship them as jump-colour closure.

Honest stall class: **project/fixture did not separate step-body colour**
at parked SPOS extremes (same amplitude/sample family across addressed
steps, or extremes not toast-verified against labels). mop199 peekC sat
near `0x7F00` while labeled “low” — next fixture must toast-bind
`Tn SPOS 0` vs `Tn SPOS 127` before WAV.

## Next USB fixture (Keep-safe Undo only)

Pre: **ASK JON power-cycle** if mop199 twin still on RAM (MOP-76 Soft
UP+NO). Confirm Keep tip24. Prefer tip-matched coexist MWMS (dial PMTR
**37**). Never Accept / lifecycle.

1. **Engineer T1 pattern** with clearly distinct step bodies at the two
   addresses `sp_map` will park: step **0** vs step **len−1** (default
   len 16 → step 15). Prefer different short FLEX/STATIC samples, or
   extreme LEVEL / filter locks — not the same one-shot on every trig.
2. Twin tip remapper + tip dual (Play Modes + SEQ POS). SETUP PMTR may
   stay off SPOS for this dig (FUNC+TRACK parks address); optional LFO
   on SPOS is **not** required for parked C/D.
3. Under PLAY, FUNC+track-pad+LEVEL until toast **`T1 SPOS 0`** (or low
   parked); peek `sp_en[0]`, `sp_pos_w` high≈0, optional `sp_len[0]`.
   Capture WAV **C** (T1 + MAIN; HOT sanity only).
4. Dial to toast **`T1 SPOS 127`**; peek high≈127 / words parked (not a
   free LFO sweep); capture WAV **D**.
5. Optional stock control WAV **A** (address OFF / PMTR away) — timing
   only; does **not** close jump-colour.
6. Colour gate (T1 body): require a real separation — e.g. envCorr C↔D
   meaningfully below ~0.95 **or** clear sample-identity / spectral
   difference. Peak/rms alone insufficient when amplitudes match.
   Null / near-null → write **Open** again; do not invent Proven.
7. Undo → `[]`. ASK JON PC. Catalog stays **SHUT**.

Do **not** relabel mop157 onset Δ, mop184 words-move, or mop199 C≈D as
jump-colour Proven.

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept.
- A firmware behaviour change (no `unit.s` edit).
- That mop199 remapper failed.
- That `sp_len` was 1 on mop199 (unpeaked).

## Cross links

- USB Open: [`usb-jump-colour-open-mop199-2026-11-25.md`](usb-jump-colour-open-mop199-2026-11-25.md)
- Audible timing: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Fixture base: [`next-audible-fixture-mop110-2026-11-24.md`](next-audible-fixture-mop110-2026-11-24.md)
- Remapper: mop102 / mop167 / EVENTS.md `ev_audio_step`
- Hub: [MOP-200](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-tip-dig-mop-200)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
