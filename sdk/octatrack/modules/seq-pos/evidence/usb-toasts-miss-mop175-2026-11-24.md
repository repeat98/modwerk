# SPOS FUNC+TRACK toast USB miss (MOP-175)

Host: DESKTOP-JH92J0W · Europe/London · 24 November 2026 ~19:45  
Recipe cite: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md) §B  
Prior SETUP: [`usb-setup-pmtr-mop172-2026-11-24.md`](usb-setup-pmtr-mop172-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24**, soft OK |
| Twin | **`775d9322…`** tip-matched; tip dual coexist staged |
| Gesture A: hold T1+FUNC + LEVEL | LCD = **SRC FLEX / LEV +63** — **no** `Tn SPOS nn` toast |
| Gesture B: hold T1+FUNC+NO | LCD = **`DISARM ALL`** (stock) — **no** `Tn SPOS OFF` toast |
| Retry: FUNC then T1 + LEVEL | Same SRC/LEV frame (sha match) — still **no** SPOS toast |
| Retry: FUNC then T1 + NO | SRC FLEX, no SPOS OFF toast |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**USB key path for SPOS panel toasts: not proven this session.**  
Do **not** treat private miss PNGs as publication toast evidence. SETUP PMTR=SPOS label (mop172) remains the only monochrome publication capture. Catalog stays **SHUT**.

## Why this is a miss (not a claim)

mop171 names toast pages only “when panel path is live.” Over USB development
keys, LEVEL while FUNC+TRACK held moved track **LEV**, and FUNC+TRACK+NO
hit stock **DISARM ALL** — same class of honesty as TRIG PROB mop49
(“FUNC+TRACK+LEVEL panel page not captured — key path still unwired”).

## Private artifacts (not publication `media/`)

`modwerk-builds/mop175-spos-toasts/publish/` — `ot-toast-spos-nn.png`,
`ot-toast-spos-off.png`, func-first retries. Store copy:
`media/mop175-spos-toasts/`.

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft (MOP-76).
