# SPOS FUNC+TRACK toast USB Proven (MOP-196)

Host: DESKTOP-JH92J0W · Europe/London · 25 November 2026 ~01:42  
Tip wire: [#165](https://github.com/jonathanwardle1992-beep/modwerk/pull/165) /
`8816abca1` ([mop195](toast-tip-wire-mop195-2026-11-25.md))  
Prior misses: [mop175](usb-toasts-miss-mop175-2026-11-24.md) /
[mop185](usb-toasts-reprobe-mop185-2026-11-24.md) /
[mop194](usb-toasts-alt-stall-mop194-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24** |
| Twin | **`775d9322…`** tip-matched; tip dual + wired SEQ POS **1172 B** |
| Gesture A: T1+FUNC+LEVEL (track pad) | LCD toast **`T1 SPOS 127`** — **Proven** |
| Gesture B: T1+FUNC+NO | LCD toast **`T1 SPOS OFF`** — **Proven** |
| Compare: T1+FUNC+TRACK_PAGE+LEVEL | AMP SETUP underlay + lingering `T1 SPOS 127` (mop185 page key ≠ recipe) |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** / **SHUT** |

**USB FUNC+TRACK toast pages: Proven** on tip remapper after mop195 wire.
Publication PNGs: `media/ot-toast-spos-nn.png`, `media/ot-toast-spos-off.png`.

## Why mop175/185 missed (closed)

Recipe “FUNC+TRACK” means **FUNC + the track’s TRACK pad** (T1…T8), which
`sp_module_key` / `sp_module_enc` track. mop185 held the **TRACK page** key
(`0x23`) → stock AMP SETUP / RELOAD PAGE. mop175 used T1+FUNC but the tip
unit then had **no** toast handlers (mop194 stall). mop195 wired builders +
hooks; this dig re-proved the recipe gestures.

## Artifacts

| File | Gesture | Observed |
| --- | --- | --- |
| `ot-toast-spos-nn.png` | T1+FUNC+LEVEL | **`T1 SPOS 127`** |
| `ot-toast-spos-off.png` | T1+FUNC+NO | **`T1 SPOS OFF`** |
| `ot-toast-track-page-compare.png` | TRACK page compare | AMP SETUP + lingering toast |
| Package | tip rebuild | image **848** + bss **60**; sha256 `5c1b28d9…` |

Private: `modwerk-builds/mop196-spos-toasts-prove/`  
Store: `media/mop196-spos-toasts-prove/`

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft (MOP-76).

Hub: [MOP-196](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-functrack-toast-usb-prove-mop-196)
