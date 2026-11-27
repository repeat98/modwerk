# SPOS jump-colour USB fixture dig — Open (MOP-201)

Keep-safe Undo only. Europe/London · 25 November 2026. After
[mop200](jump-colour-tip-dig-mop200-2026-11-25.md) tip stall named the next
fixture (engineered step 0 vs len−1; toast-bind `Tn SPOS 0` / `127`; peek
`sp_len`). Catalog **SHUT**. No Accept / lifecycle / `sdk/catalog.json`
force-list. Do **not** invent Proven.

## Verdict

| Question | Answer |
| --- | --- |
| Keep tip24 preflight? | **Yes** — `eb667962…` / inv 24 / Screen Off + Mute Modes |
| Tip remapper / dual? | **Yes** — `4ef940ac7942`; Play Modes + SEQ POS |
| Engineered distinct step locks? | **Attempted** — TRIG1 LEVEL↓+filterA↓; TRIG16 LEVEL↑+filterA↑; mid TRIG2–15 LEVEL↓ |
| Toast-bind `T1 SPOS 0` / `127`? | **Partial** — `127` **bound**; `0` **not** (high≈43 under LFO on SPOS) |
| `sp_len[0]` peeked? | **0** (all tracks 0) — BSS never got init default **16** |
| WAV C vs D body colour? | **Indistinguishable** (envCorr **0.99977**; peakΔ≈0) |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Why still Open (honest)

`sp_map` follows the stock playhead when `sp_en[t]==0` **or**
`sp_len[t]==0` (`unit.s` `.follow`). This dig peeked `sp_len[0]=0` while
`sp_en[0]=1` and tip remapper matched — so address-mode never parked on
engineered step 0 vs len−1, and C≈D is expected.

`sp_dest_audio_init` sets every `sp_len[t]=16`, but `runtime.json` does
**not** subscribe an init / place hook for it — USB trial BSS stays zero.
mop200’s “fixture stall” remains possible *after* len is non-zero; this
pass’s primary honesty is **len=0 → remapper follow**, not a remapper miss
and not a Proven claim.

Toast-bind: held T1+FUNC+LEVEL until peek high==target. `T1 SPOS 127`
bound (toast PNG `09-toast-spos-127.png`); bind to **0** failed while
PMTR=SPOS (LFO store fought the park — high≈43). Colour C/D still null
under that limit; do not invent Proven from amplitude locks alone.

| Pair | envCorr | Note |
| --- | --- | --- |
| C vs D (jump-colour) | **0.99977** | Indistinguishable bodies |
| Gate reasons | all false | toastBound false; lenOk false |

## Protocol

1. Keep tip24 confirm → tip twin boot (`775d9322…`).
2. Tip dual coexist MWMS; dial-max **37**; remapper tip-matched.
3. Engineer T1 TRIG locks (step 0 vs 15 + quiet middle).
4. Optional WAV A (PMTR 12) — timing lineage only.
5. PMTR=SPOS; toast-bind 0 / 127; peek `sp_en` / `sp_pos_w` / `sp_len`.
6. WAV C / D (T1). Colour gate (envCorr &lt; 0.95 or clear separation).
7. Undo → `[]`. ASK JON PC.

## Artifacts

Private: `modwerk-builds/mop201-spos-jump-colour/`  
Store: `media/mop201-spos-jump-colour/`  
Log: `jump-colour-log.json` / `summary.json` / toast + WAV PNGs

## Leave

Undo `[]`. Twin on RAM → **ASK JON power-cycle**. No Accept. Catalog
**SHUT**. Hub remaining-gate jump-colour still **Open**.

## Cross links

- Tip stall + fixture recipe: [`jump-colour-tip-dig-mop200-2026-11-25.md`](jump-colour-tip-dig-mop200-2026-11-25.md)
- Prior USB Open: [`usb-jump-colour-open-mop199-2026-11-25.md`](usb-jump-colour-open-mop199-2026-11-25.md)
- Hub: [MOP-201](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-usb-fixture-open-mop-201)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
