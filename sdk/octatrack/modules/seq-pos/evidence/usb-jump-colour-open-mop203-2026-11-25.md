# SPOS jump-colour USB re-prove — Open (MOP-203)

Keep-safe Undo only. Europe/London · 25 November 2026. After
[mop202](sp-len-init-tip-mop202-2026-11-25.md) tip-wired `sp_len` `.data`
default **16** (#172 / `4356e4ba5`) and
[mop201](usb-jump-colour-open-mop201-2026-11-25.md) Open (`sp_len=0`).
Catalog **SHUT**. No Accept / lifecycle / force-list. Do **not** invent
Proven.

## Verdict

| Question | Answer |
| --- | --- |
| Keep tip24 preflight? | **Yes** (post-mop201 PC; tipTwin false) |
| Tip package mop202? | **Yes** — sha256 `97de37e6…` (944 sharedBytes) |
| Tip remapper / dual? | **Yes** — `4ef940ac7942`; Play Modes + SEQ POS |
| `sp_len[0]` peeked? | **16** (all tracks 16) — mop202 `.data` default live |
| Toast-bind `T1 SPOS 0` / `127`? | **Both bound** (PMTR parked away from SPOS) |
| Engineered TRIG locks? | **Attempted** — TRIG1 ↓ / TRIG16 ↑ + mid quiet |
| WAV C vs D body colour? | **Indistinguishable** (envCorr **0.99969**; peakΔ≈0) |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Why still Open (honest)

mop202 cleared the mop201 `sp_len=0` → remapper-follow blocker: peeks show
`sp_len[t]=16` and toast-bound highs **0** / **127**. Remapper tip-matched.
Colour gate still fails (envCorr ≈1; peak/rms/zc null) under engineered
LEVEL/filter locks on this project — fixture/sample-body non-separation
(or locks not audible on the parked one-shots), **not** a remapper miss and
**not** a Proven claim.

| Pair | envCorr | Note |
| --- | --- | --- |
| C vs D (jump-colour) | **0.99969** | Indistinguishable bodies |
| Gate | toastBound **true**; lenOk **true**; colour gates **false** | |

Peek layout note: after mop202, `sp_len` is `.data` at nm `0x372` while
`sp_pos_w` is `.bss` at `0x37c` — peek at `wordsPtr - 0x0a`. Contiguous
BSS `wordsPtr+26` reads toast (`'T'==84`) and must not be used.

## Protocol

1. Keep tip24 → tip twin boot (`775d9322…`).
2. Tip dual + mop202 `seq-pos.mwrm` (`97de37e6…`).
3. Engineer T1 TRIG locks; dial-max 37; PMTR away (12).
4. Toast-bind 0 / 127; peek `sp_en` / `sp_pos_w` / `sp_len` (=16).
5. WAV C / D. Colour gate.
6. Undo → `[]`. ASK JON PC.

## Artifacts

Private: `modwerk-builds/mop203-spos-jump-colour/`  
Store: `media/mop203-spos-jump-colour/`  
Log: `jump-colour-log.json` / `summary.json`

## Leave

Undo `[]`. Twin on RAM → **ASK JON power-cycle**. No Accept. Catalog
**SHUT**. Hub remaining-gate jump-colour still **Open**.

## Cross links

- Tip init: [`sp-len-init-tip-mop202-2026-11-25.md`](sp-len-init-tip-mop202-2026-11-25.md)
- Prior USB Open: [`usb-jump-colour-open-mop201-2026-11-25.md`](usb-jump-colour-open-mop201-2026-11-25.md)
- Tip stall: [`jump-colour-tip-dig-mop200-2026-11-25.md`](jump-colour-tip-dig-mop200-2026-11-25.md)
- Next fixture tip: [`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
- Hub: [MOP-203](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-usb-reprove-open-mop-203)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
