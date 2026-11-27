# SPOS FUNC+TRACK toast USB re-probe miss (MOP-185)

Host: DESKTOP-JH92J0W · Europe/London · 24 November 2026 ~22:45  
Prior miss: [`usb-toasts-miss-mop175-2026-11-24.md`](usb-toasts-miss-mop175-2026-11-24.md)  
Recipe cite: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md) §B

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24**, Screen Off + Mute Modes |
| Twin | **`775d9322…`** tip-matched; tip dual coexist staged |
| Gesture A: hold **T1+FUNC+TRACK** + LEVEL | LCD = **AMP SETUP** — **no** `Tn SPOS nn` toast |
| Gesture B: hold **T1+FUNC+TRACK+NO** | LCD = **`RELOAD PAGE`** (stock) — **no** `Tn SPOS OFF` toast |
| Compare C: hold T1+FUNC + LEVEL (mop175-shaped, **no TRACK**) | LCD = **SRC+FLEX / LEV +63** — same class as mop175 |
| Compare D: hold T1+FUNC+NO (mop175-shaped, **no TRACK**) | LCD = **`DISARM ALL`** — same class as mop175 |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**USB key path for SPOS panel toasts: still not proven.**  
TRACK was held this session (stock pages differ from mop175’s SRC/LEV /
DISARM ALL), but no `Tn SPOS nn` / `Tn SPOS OFF` glyphs appear. Do **not**
treat private miss PNGs as publication toast evidence. SETUP PMTR=SPOS
label (mop172) remains the only monochrome publication capture. Catalog
stays **SHUT**.

## Why mop175 was a miss (honesty)

mop175 prose said FUNC+TRACK, but the recorded gestures were **T1+FUNC**
(+LEVEL / +NO) without TRACK — LCD SRC/LEV and DISARM ALL. This dig
re-probes with TRACK held and retains mop175-shaped captures for compare.
With TRACK: LEVEL → AMP SETUP; NO → RELOAD PAGE. Without TRACK: same
SRC/LEV / DISARM ALL class as mop175. Neither path shows SPOS toast text.

## Private artifacts (not publication `media/`)

`modwerk-builds/mop185-spos-toasts/publish/` — `ot-toast-spos-nn.png`,
`ot-toast-spos-off.png`, mop175-shaped compares, idle. Store copy:
`media/mop185-spos-toasts/`.

| File | Gesture | Observed LCD |
| --- | --- | --- |
| `ot-toast-spos-nn.png` | T1+FUNC+TRACK+LEVEL | AMP SETUP |
| `ot-toast-spos-off.png` | T1+FUNC+TRACK+NO | RELOAD PAGE |
| `ot-toast-mop175-shaped-nn.png` | T1+FUNC+LEVEL | SRC+FLEX / LEV +63 |
| `ot-toast-mop175-shaped-off.png` | T1+FUNC+NO | DISARM ALL |

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft (MOP-76).
