# SPOS jump-colour USB dig — Open (MOP-199)

Host: DESKTOP-JH92J0W · Europe/London · 25 November 2026 ~02:06  
Context: [mop197](qualification-place-mop197-2026-11-25.md) left jump-colour
**Open** as the remaining catalog gate after toast Proven / `tests.qualification`
placed. Prior gap: [mop157](usb-audible-mop157-2026-11-24.md) onset Δ −254
with peaks near-null.

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24** |
| Twin | **`775d9322…`** tip-matched remapper `4ef940ac7942` |
| Inventory dual | **Yes** — Play Modes + SEQ POS (+ LFO peers) |
| Dial-max / PMTR | **37** / **37** |
| WAV A (stock PMTR 12) | T1 peak **0.04760**, rms **0.00455** |
| WAV C (address ON, SPOS low) | T1 peak **0.04759**, rms **0.00453**; words uniqueT1 **11** |
| WAV D (address ON, SPOS high) | T1 peak **0.04762**, rms **0.00454**; words uniqueT1 **16** |
| C vs D colour | peakΔ **≈0**; rmsRatio **≈1.0008**; envCorr **0.99986**; zcΔ **2** |
| Jump-colour Proven? | **No** — **Open** (bodies indistinguishable) |
| Undo | inventory **`[]`** |
| Accept / catalog | **none** / **SHUT** |

**Jump-colour under address mode: still Open.** Peeks prove address-mode
words move at both extremes; WAV C≈D so distinct-step *body* colour is not
established on this project/fixture. Do not invent a Proven claim. Do not
force-list catalog.

## Why this is not a miss of remapper / toast

Tip remapper + dual-install + toast pages already Proven (mop167/184/196).
This dig isolates the mop157 honesty gap: onset/timing lag ≠ step-body
colour. Same tip twin / tip dual path; FUNC+track-pad LEVEL extremes for
SPOS low/high (not TRACK page key).

## Artifacts

| File | Role |
| --- | --- |
| `07-wav-C-spos-low-*.wav` / `09-wav-D-spos-high-*.wav` | Extreme SPOS bodies |
| `04-wav-A-stock-*.wav` | Stock control |
| `jump-colour-log.json` / `summary.json` | Full metrics |
| `99-leave.json` | Undo `[]`; ASK JON PC |

Private: `modwerk-builds/mop199-spos-jump-colour/`  
Store: `media/mop199-spos-jump-colour/`

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft
(MOP-76). Catalog **SHUT**.

Hub: [MOP-199](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-usb-open-mop-199)
