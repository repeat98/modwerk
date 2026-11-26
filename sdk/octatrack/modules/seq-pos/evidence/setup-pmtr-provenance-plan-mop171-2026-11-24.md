# SETUP PMTR=SPOS monochrome / capture.json plan (MOP-171, tip-only)

Host tip after [#139](https://github.com/jonathanwardle1992-beep/modwerk/pull/139)
/ [MOP-170](cycles-performance-plan-mop170-2026-11-24.md) and
[#137](https://github.com/jonathanwardle1992-beep/modwerk/pull/137) /
[MOP-168](qualification-fill-path-mop168-2026-11-24.md). Hub already lists
#8 SPOS as **audibleProven**
([#130](https://github.com/jonathanwardle1992-beep/modwerk/pull/130) /
[mop157](usb-audible-mop157-2026-11-24.md)) and catalog **SHUT**
([MOP-83](catalog-gate-mop83-2026-11-24.md) /
[MOP-113](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#catalog-gate-checklist-mop-113)).
**Docs only** — no USB twin, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent SETUP labels, PNG hashes,
image/emulator SHA-256 values, or readiness.

## Why this note

MOP-168 §3 named the publication path for elevating `media/` past
load-safe-only. This sheet turns that cite into a **PROB-shaped capture
recipe** a self-hosted host can run later (Keep-safe hardware LCD and/or
ot_emu framebuffer + `media/capture.json` + manifest `otUi`), citing the
TRIG PROB path that already closed the same gate
([`trig-prob/media/capture.json`](../../trig-prob/media/capture.json) /
[mop49](../../trig-prob/evidence/usb-undo-mop49-2026-11-23.md)). Cite
pattern only — do **not** copy PROB hashes, image SHA-256, or PNG bytes
into Seq Pos.

Filling this plan is **not** a catalog pin. Label confirmation ≠
qualification ≠ dual-install Keep proof ≠ measured cycles.

## Current state (leave empty)

| Path | Status |
| --- | --- |
| [`../media/LICENSE.md`](../media/LICENSE.md) | Placeholder — no publication captures yet |
| [`media/`](media/) under evidence | Load-safe twin/unit PNGs only (`mop18-SPOS37-lfo.png`, `mop22-lfo-page-empty.png`) — **not** SETUP label proof |
| Draft `media/capture.json` | **Filled by [mop172](usb-setup-pmtr-mop172-2026-11-24.md)** (hardware SETUP) |
| Manifest `access.screenshots` / `media[].otUi` | **Filled by mop172** for SETUP; toasts still empty |
| Qualification `documentation.screenshots` | Still empty until qualification object lands ([mop168 §1](qualification-fill-path-mop168-2026-11-24.md#1-testsqualification-stub-path)) |
| Label confirmation | **SETUP PMTR=SPOS proven** (mop172); toast pages still open |

This tip did **not** add PNGs; mop172 ran the recipe.

## A. Dial path (coexist MWMS — later USB / emulator)

Prefer tip-matched **coexist MWMS** so SETUP dial reaches PMTR **37**
(`SPOS`). Alone dial-max stays **30**
([MOP-122](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#alone-dial-max-30-vs-dest-33-mop-122);
[MOP-68](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md)).
Trial sheet shape: [MOP-133](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133).

Keep-safe rules for any later USB pass:

- Undo-only mid-trial; **no Accept** / lifecycle (protect production Keep)
- Undo → `[]` before leaving; ASK JON power-cycle before judging Keep soft
- Twin without Screen Off softs `UP+NO` under empty inventory (MOP-76)

## B. Capture surfaces (minimum for eligibility)

Real monochrome LCD pixels only — on≈255 / off≈24 style hardware, or
emulator 24/240 grayscale. Never draw labels, reconstruct UI, or submit
coloured/yellow captures
([MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md) /
[MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md#complete-documentation-and-screenshot-style)).

| Page | Why | Notes |
| --- | --- | --- |
| LFO SETUP with **PMTR = SPOS** (index **37**) | Primary gate elevating past load-safe-only | After+1 should stay **37** when count allows |
| FUNC+TRACK+LEVEL toast (`Tn SPOS nn`) | Panel enable / base edit | When panel path is live |
| FUNC+TRACK+NO toast (`Tn SPOS OFF`) | Bypass / clear | When panel path is live |

Optional supplementary (gallery only, not a substitute for SETUP): LFO
SPD/DEP while PMTR=SPOS is live — load-safe evidence already exists under
`evidence/media/`; do not treat those as label proof.

## C. Hardware path (PROB mop49 shape — cite only)

Mirror Keep-safe mid-trial hardware LCD:

1. Tip-matched `--dev` twin with Seq Pos contribute live under Undo.
2. STOP transport; select audio track T1; open LFO → FUNC+LFO (SETUP).
3. Scroll PMTR to index **37** (fine/coarse as needed under coexist).
4. Capture 128×64 LCD over the development screen request; scale with
   integer nearest-neighbour; palette on=255 / off=24.
5. Optionally capture FUNC+TRACK+LEVEL / FUNC+TRACK+NO toasts.
6. Roll inventory back to `[]`; leave unit on RAM twin for Jon PC — do
   **not** Accept.

Suggested filenames (publication `media/`, not evidence load-safe):

- `media/ot-setup-pmtr-spos.png`
- `media/ot-toast-spos-nn.png` (optional until panel path live)
- `media/ot-toast-spos-off.png` (optional until panel path live)

## D. Emulator path (optional alternate)

Headless ot_emu MKII framebuffer export is acceptable when it preserves
real rendered pixels
([MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md)). Record
`captureType: "emulator"`, emulator revision, and local image SHA-256.
Never commit firmware, cards, NVRAM, raw dumps, or private logs.

```sh
# Shape only — private OS image + plan stay local:
# npm run upstream:tools
# then the documented ot_emu capture helper with --image-sha256, --plan, --output
```

## E. `media/capture.json` schema (write after pixels exist)

Fill from the actual session. Cite PROB’s field set; leave every hash /
setup sentence empty until measured:

| Field | Content |
| --- | --- |
| `firmware` | e.g. `1.40C` |
| `imageSha256` | Local MAIN OS / remix image (64 hex) — **null until known** |
| `captureType` | `hardware` or `emulator` |
| `setup` | Host, twin/configHash or emulator id, Undo-only / no Accept, scale, palette, inventory during capture, rollback |
| `palette` | `{ "on": [255,255,255], "off": [24,24,24] }` (or emulator 24/240) |
| `plan` | Ordered panel gestures (press / encoder) ending in each `capture` |
| `screenshots.<png>` | `sha256`, `page`, `shows` (`controls` / `location` / …), honest `note` |
| `limits` | Unwired panel pages, emulator-vs-hardware, “not a catalogue force-list” |

Do **not** seed a stub `capture.json` with invented hashes. Absence is
honest until the session exists.

## F. Manifest / docs write-back (after capture — not this tip)

1. Copy reviewed PNGs into draft `media/` (publication paths above).
2. Write `media/capture.json` from the session.
3. Update `media/LICENSE.md` (original captures; MIT module source; Elektron
   UI rights retained — same shape as PROB).
4. Declare PNGs under `access.screenshots` and `media[]` with `otUi`
   (`page`, `shows`, `firmware`, `moduleVersion`, `imageSha256`, `setup`).
5. Point qualification `documentation.screenshots` +
   `screenshotStyle: "black-and-white"` at the same paths
   ([mop168 §1](qualification-fill-path-mop168-2026-11-24.md#1-testsqualification-stub-path)).
6. Link from README **Screens and audio**; record commands / limits in
   TESTING **OT UI capture evidence**.
7. Keep firmware, cards, raw dumps, and private logs out of Git.

## G. Honesty checklist

- Load-safe evidence PNGs ≠ SETUP PMTR=SPOS label proof.
- Alone dial-max **30** without coexist ≠ dest **37** label.
- Caption/alt must match visible pixels; do not claim audio or Keep from a
  still.
- UI documentation does not upgrade audible / cycles / qualification gates.
- Still **no** `sdk/catalog.json` pin until dual-install words-move /
  Keep proof, filled `tests.qualification`, measured cycles, SETUP media,
  and owner review close.

## Remaining gates vs Keep catalog SHUT (cite only)

| Gate | Status after this tip |
| --- | --- |
| Audible address-mode (coexist Undo) | **audibleProven** (mop157); jump-colour gap |
| Tip-matched base remapper (no private Detour) | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install inventory (PM + SPOS) | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md); T1 unique **33**; mop169 stall cited) |
| `tests.qualification` + owner review | **Not started** — [mop168](qualification-fill-path-mop168-2026-11-24.md) outline; [mop176](qualification-fill-recipe-mop176-2026-11-24.md) recipe |
| Measured cycles (`performance.json`) | **Filled (emulator)** — static/measured **752**; load 287.8/287.8 idle 0 ([mop179](usb-cycles-mop179-2026-11-24.md)); stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md)); static dig [mop178](usb-cycles-mop178-2026-11-24.md); recipe [mop170](cycles-performance-plan-mop170-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** hardware SETUP label [mop172](usb-setup-pmtr-mop172-2026-11-24.md) (recipe this sheet) |
| FUNC+TRACK toast pages | **USB miss** / still **Open** [mop175](usb-toasts-miss-mop175-2026-11-24.md) (no publication toast PNGs) |
| Standalone Play Modes Detours → `runtime.json` | **Stalled** — tip recipe [mop183](playmodes-runtime-mop183-2026-11-24.md); needs owner-approved Play Modes version + package rebuild / USB; published 0.1.1 `.mwrm` still Detours |
| `sdk/catalog.json` | **Must stay absent** |

## What this tip does **not** claim

- That FUNC+TRACK toast pages are captured (SETUP label filled by mop172; USB miss mop175 — still open).
- That qualification `documentation.screenshots` are filled.
- Dual-install Keep proof, tip-matched words-move, cycles measured/load/stress, or qualification.
- Any `sdk/catalog.json` pin / force-list.

Hub sync: [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
(prior [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182)).

## Cross links

- Parent outline: [`qualification-fill-path-mop168-2026-11-24.md`](qualification-fill-path-mop168-2026-11-24.md) §3
- Cycles recipe: [`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md)
- PROB pattern (cite only): [`../../trig-prob/media/capture.json`](../../trig-prob/media/capture.json),
  [`../../trig-prob/evidence/usb-undo-mop49-2026-11-23.md`](../../trig-prob/evidence/usb-undo-mop49-2026-11-23.md)
- Guides: [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md),
  [MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md)
- Claim honesty: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub this tip: [MOP-171](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-setup-pmtr-monochrome-capturejson-plan-mop-171)
