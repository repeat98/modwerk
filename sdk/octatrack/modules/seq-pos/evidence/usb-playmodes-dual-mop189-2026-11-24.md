# SPOS + Play Modes 0.2.1 dual-install USB verify (MOP-189)

Host: DESKTOP-JH92J0W · Europe/London · 24 November 2026 ~23:22  
Tip main: `#158` → `96c633d09` (Play Modes 0.2.1 `runtime.json`)  
Prior tip: [`playmodes-runtime-mop188-2026-11-24.md`](playmodes-runtime-mop188-2026-11-24.md)  
Prior dual: [`usb-dual-install-mop167-2026-11-24.md`](usb-dual-install-mop167-2026-11-24.md) /
[`usb-words-move-mop184-2026-11-24.md`](usb-words-move-mop184-2026-11-24.md)

## Verdict (honest)

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24**, Screen Off + Mute Modes |
| Twin | **`775d9322…`** tip-matched RAM boot |
| Play Modes package | **0.2.1** `--octabam-machine` / `runtime.json` (`ev_audio_step` order 40) · **15998** B · sha16 `4520e4d451be1438` |
| Draft SEQ POS | tip subscribe · **600** B |
| Inventory dual | **YES** — Play Modes + SEQ POS (+ LFO peers; no trig-prob) |
| Tip remapper `0x400a2d6a` | **`4ef940ac7942`** = base ownership |
| Dial-max / PMTR | **37** / **37** (SPOS) |
| afterStore / words | afterStoreCalls **35664**; T1 words unique **25** (**moved**) |
| Runtime path live | **YES** — PM 0.2.1 runtime + SPOS coexist on tip remapper |
| Undo | inventory **`[]`** |
| Accept / lifecycle / catalog | **none** |

**Finding:** After mop188 tip land, Keep-safe Undo dual-install with the
source-built Play Modes **0.2.1** runtime package + draft SEQ POS proves
the `runtime.json` subscribe path lives on tip-matched `ev_audio_step`
(order 40) alongside SPOS (order 50): inventory dual, tip remapper match,
SETUP PMTR=SPOS, afterStore/words move. Catalog stays **SHUT**.

## Packages (private)

`modwerk-builds/mop189-spos-playmodes-usb/peers/` — tip Play Modes 0.2.1
+ tip draft LFO coexist peers (same set shape as mop167; **no** trig-prob).

## Limits / not claimed

- Catalog pin / Accept / lifecycle — **none**.
- Published public `0.1.1` `.mwrm` still Detours (`lagsBehind` 0.2.1) —
  this dig used the source-built 0.2.1 runtime package only.
- Jump-colour / audibleProven elevate — **not** this dig.
- FUNC+TRACK toast glyphs — still USB miss (mop175/mop185).

## Leave

Undo → `[]`. No Accept. **ASK JON power-cycle** before next twin / Keep soft.

## Private artifacts

`modwerk-builds/mop189-spos-playmodes-usb/publish/` — PNGs +
`dual-verify-log.json` / `summary.json`. Store copy:
`media/mop189-spos-playmodes-usb/`.
