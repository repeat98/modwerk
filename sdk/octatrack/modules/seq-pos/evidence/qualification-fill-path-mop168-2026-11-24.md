# Qualification stub fill path + eligibility notes (MOP-168, tip-only)

Host tip after [#136](https://github.com/jonathanwardle1992-beep/modwerk/pull/136)
/ MOP-166. Hub already lists #8 SPOS as **audibleProven**
([#130](https://github.com/jonathanwardle1992-beep/modwerk/pull/130) /
[mop157](usb-audible-mop157-2026-11-24.md)) and catalog **SHUT**
([MOP-83](catalog-gate-mop83-2026-11-24.md) /
[MOP-113](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#catalog-gate-checklist-mop-113)).
**Docs only** — no USB twin, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent cycle counts, hardware
pass marks, SETUP label PNGs, or readiness.

## Why this note

MOP-166 closed the tip-strengthen / dual-install **protocol** gap and cited
the remaining publishability gates. This sheet turns three of those cites
into an owner-reviewable **fill path**:

1. `tests.qualification` — replace `qualification.example.json` with a
   structure bound to mop157 identity (**no** invented numbers).
2. Measured ColdFire cycles — concrete `evidence/performance.json` plan.
3. SETUP PMTR=SPOS monochrome `media/` + `capture.json` provenance.

Filling a path is **not** a catalog pin. AudibleProven ≠ qualification.
Dual-install Keep proof remains a separate open gate
([mop166](dual-install-keep-proof-mop166-2026-11-24.md)).

## 1. `tests.qualification` stub path

### Starting point

| Artifact | Role today |
| --- | --- |
| [`../qualification.example.json`](../qualification.example.json) | Incomplete scaffold copy — nulls / placeholders / `hardware.status: "pending"`; deliberately fails validation |
| [`../octamod.module.json`](../octamod.module.json) `tests` | Draft report hooks only — **no** `tests.qualification` object yet |
| Public template | [`docs` → `public/module-qualification.example.json`](../../../../public/module-qualification.example.json) + field reference [`MODULE_QUALIFICATION.md`](../../../../docs/MODULE_QUALIFICATION.md) |

Leave the draft **without** `tests.qualification` until real numbers exist.
Never copy the example into the manifest with zeros, averages, or invented
measurements.

### Bind identity to mop157 (cite only — do not invent hashes)

When a filled record is authored later, bind it to the **exact** package /
twin / claim that already landed — do not invent a new identity:

| Field | mop157-bound source (cite; fill only when measured) |
| --- | --- |
| `moduleVersion` | Manifest version at publication (`0.1.0-experimental` today; bump if source changes) |
| `sourceSha256` | Recompute with `moduleNativeSourceSha256` after source + report paths are final ([MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md#record-in-the-module-manifest)) — never invent |
| `imageSha256` | Local image the **hardware** stress / functional report used — not the mop157 twin digest alone; mop157 Keep base `eb667962…` / twin `5dc7059cb2564384…` / package **620 B** are claim lineage only |
| `cycles` | One **`coldfire`** record (no DSP) — wait for §2 measured `performance.json`; `processor: "dsp"` does **not** apply |
| `memory.regions` | Authored DRAM unit + 8×(halfword + enable + length) — measure before claiming integers |
| `hardware` | Owner-reviewed functional report bound to that `imageSha256`; mop157 Undo audible is **not** a stress pass — cite it as prior Keep-safe Undo evidence with jump-colour / Detour-on-twin limits |
| `documentation.tutorial` | Already sketched in README Quick tutorial — keep step order identical |
| `documentation.screenshots` | Empty until §3 monochrome SETUP / toast captures land |

### Owner-reviewable structure (skeleton — **not** a filled record)

Copy shape only. Every `null` / `REPLACE_*` / `pending` / `failed` stays
until observed:

```json
{
  "moduleVersion": "0.1.0-experimental",
  "sourceSha256": "REPLACE_WITH_NATIVE_SOURCE_SHA256",
  "imageSha256": "REPLACE_WITH_LOCAL_TESTED_IMAGE_SHA256",
  "cycles": [
    {
      "processor": "coldfire",
      "worstCase": null,
      "maxConfiguration": null,
      "maxInstances": null,
      "budget": null,
      "unit": "cycles/event",
      "method": "ot_emu / cfmeter — see evidence/performance.json",
      "conditions": {
        "parameterExtremes": "SPOS 0/127; address on/off; DEP ends; WAVE TRI/SQR/RND",
        "parameterModulation": "LFO→SPOS + p-locks/scenes on DEP; justify unused CC",
        "modeSwitching": "FUNC+TRACK+NO off; Part change; Undo restore",
        "maxLoad": "Eight audio tracks address-on; up to three LFOs on SPOS",
        "inputConditions": "Sparse + dense trigs; silence vs full-scale sample"
      },
      "report": "TESTING.md"
    }
  ],
  "memory": {
    "regions": [],
    "perInstanceBytes": null,
    "sharedBytes": null,
    "maxInstances": null,
    "totalBytes": null,
    "conditions": "Measure DRAM unit + per-track state; no DSP memory",
    "report": "TESTING.md"
  },
  "hardware": {
    "status": "pending",
    "model": "MKII",
    "testedOn": "YYYY-MM-DD",
    "tester": "credited handle",
    "project": {
      "name": "local stress project",
      "sha256": "REPLACE_WITH_PROJECT_FINGERPRINT",
      "recipe": "generator/tool revision + settings; keep card/firmware local"
    },
    "durationMinutes": null,
    "audioTracks": 8,
    "midiTracks": null,
    "conditions": {
      "parameterExtremes": "…",
      "parameterModulation": "…",
      "modeSwitching": "…",
      "maxLoad": "…",
      "inputConditions": "…"
    },
    "checks": {
      "audioContinuity": "failed",
      "transport": "failed",
      "controls": "failed",
      "memoryIntegrity": "failed",
      "recovery": "failed"
    },
    "report": "TESTING.md",
    "maxInstances": null
  },
  "documentation": {
    "tutorial": {
      "title": "Quick tutorial",
      "steps": [
        "Include Seq Pos; put a pattern with distinct steps on an audio track.",
        "Hold FUNC+TRACK+LEVEL for SPOS; LFO SETUP → PMTR=SPOS; raise DEP.",
        "Hear/observe address-mode; FUNC+TRACK+NO restores stock playhead."
      ]
    },
    "screenshots": [],
    "screenshotStyle": "black-and-white"
  }
}
```

Place the filled object under `tests.qualification` in `octamod.module.json`
only after owner review of actual reports. Keep `tests.report` /
`evidenceRevision` synchronized. Catalog pin still requires the other
MOP-83 gates.

### What mop157 already contributes (and what it does **not**)

| Already true | Still open |
| --- | --- |
| Keep-safe Undo coexist audible (onset Δ −254) | Jump colour |
| Coexist dial-max **38** / PMTR **37** | Alone dial-max **30** (needs coexist for SETUP) |
| Tip-matched remapper + dual inventory (mop167) | Dual-install **words-move** (mop169) |
| SETUP PMTR=SPOS label (mop172) | Toast pages; measured cycles; filled qualification |

**Expanded recipe (MOP-176):** QLR-shaped ordered fill (anti-patterns,
identity command, coldfire cycles / memory / hardware / docs / placement)
— still no invented numbers:
[`qualification-fill-recipe-mop176-2026-11-24.md`](qualification-fill-recipe-mop176-2026-11-24.md).

## 2. Cycles plan (`evidence/performance.json`)

Current stub: [`performance.json`](performance.json) — `schema: 1`, kind
`coldfire`, all cycle/load/stress numeric fields **null**. Method text
already names ot_emu / cfmeter.

**Expanded recipe (MOP-170):** PROB-shaped compose / static ×16 /
ot_emu PC-watch / cfmeter stock-vs-module / ≥60 s stress — still all null,
no invented numbers:
[`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md).

### Commands (host with OS + upstream tools — not this tip)

```sh
npm run perf:audit -- template coldfire   # start from coldfire template if rewriting
# Measure under ot_emu / cfmeter against stock image and image+module:
#   PMTR=SPOS lea redirect; store→apply once wired; same flood both images
npm run perf:audit -- check sdk/drafts/seq-pos/evidence/performance.json
```

Upstream Octabam checkout from `npm run upstream:tools` needs
`git submodule update --init` before `make bus REMIX=test/cfmeter` (empty
`modules/*/upstream` breaks the registry). See
[Performance](../../../../docs/module-guides/README.md#performance).

### Fill targets (leave null until measured)

| Block | Fill when |
| --- | --- |
| `cycles.static` / `cycles.measured` / `cycles.budget` | Defensible upper bound + measured event cost; unit `cycles/event`; report sample/event basis |
| `load.frameUs` | Keep **362.8** (ColdFire frame); fill stock/module longest + idle % from matched cfmeter floods |
| `load` method | Same flood on stock image and image with Seq Pos |
| `stress.*` | Planned: eight tracks, three LFOs on SPOS, dense trigs, ≥60 s under ot_emu; record stuck/hangs/dropped honestly |

ColdFire budget reminder: module may add at most **10%** of a 362.8 µs frame
to the interrupt and **10** points of idle vs stock under the same flood.
Emulator instruction counts ≠ chip wall-clock — state that limit in the
report. Never invent numbers to pass `perf:audit -- check`.

Worst-case narrative (for TESTING.md once measured): one map per enabled
audio track step + redirected lea per LFO frame when PMTR=SPOS.

## 3. SETUP PMTR provenance (`media/` + `capture.json`)

### Today

| Path | Status |
| --- | --- |
| [`../media/LICENSE.md`](../media/LICENSE.md) | Placeholder — no captures yet |
| [`media/`](media/) under evidence | Load-safe twin/unit PNGs only — **not** publication SETUP label proof |
| Manifest `access.screenshots` / `media` | Empty |
| Label confirmation | Still gated (MOP-22/28; alone dial-max; coexist needed for dest **37**) |

### Publication path (later USB / emulator — **not** this tip)

1. Prefer tip-matched **coexist MWMS** so SETUP dial reaches PMTR **37**
   (`SPOS`) — alone dial-max stays **30**
   ([MOP-122](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#alone-dial-max-30-vs-dest-33-mop-122)).
2. Capture real monochrome LCD pixels (on≈255 / off≈24 style), not drawn
   labels — [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md) /
   [MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md#complete-documentation-and-screenshot-style).
3. Minimum pages for eligibility:
   - LFO SETUP with **PMTR = SPOS** (index **37**) — primary gate elevating
     past load-safe-only
   - FUNC+TRACK+LEVEL toast (`Tn SPOS nn`) when panel path is live
   - FUNC+TRACK+NO toast (`Tn SPOS OFF`) when panel path is live
4. Write `media/capture.json` with firmware/OS id, image/emulator SHA-256,
   capture type (`hardware` or `emulator`), setup prose, palette, panel
   `plan`, per-PNG sha256 + page/shows notes, and honest `limits` (mirror
   PROB’s Keep-safe mid-trial shape in
   [`trig-prob/media/capture.json`](../../trig-prob/media/capture.json) —
   cite pattern only; do not copy PROB hashes).
5. Update `media/LICENSE.md`, declare PNGs in the manifest / qualification
   `documentation.screenshots`, and link them from README Screens and audio.
6. Keep firmware, cards, raw dumps, and private logs out of Git.

This tip does **not** add PNGs or a `capture.json`. Label unconfirmed →
load-safe evidence stays non-publication. Full capture recipe after this
tip: [mop171](setup-pmtr-provenance-plan-mop171-2026-11-24.md).

## Remaining gates vs Keep catalog SHUT (cite only)

| Gate | Status after this tip |
| --- | --- |
| Audible address-mode (coexist Undo) | **audibleProven** (mop157); jump-colour gap |
| Tip-matched base remapper (no private Detour) | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install inventory (PM + SPOS) | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md); T1 unique **33**; mop169 stall cited) |
| `tests.qualification` + owner review | **Not started** — outline this sheet; full recipe [mop176](qualification-fill-recipe-mop176-2026-11-24.md) |
| Measured cycles (`performance.json`) | **Filled (emulator)** — static/measured **752**; load 287.8/287.8 idle 0 ([mop179](usb-cycles-mop179-2026-11-24.md)); stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md)); static dig [mop178](usb-cycles-mop178-2026-11-24.md); recipe [mop170](cycles-performance-plan-mop170-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** hardware SETUP label [mop172](usb-setup-pmtr-mop172-2026-11-24.md) (recipe [mop171](setup-pmtr-provenance-plan-mop171-2026-11-24.md)) |
| FUNC+TRACK toast pages | **USB miss** / still **Open** [mop175](usb-toasts-miss-mop175-2026-11-24.md) (no publication toast PNGs) |
| Standalone Play Modes Detours → `runtime.json` | **Stalled** — tip recipe [mop183](playmodes-runtime-mop183-2026-11-24.md); needs owner-approved Play Modes version + package rebuild / USB; published 0.1.1 `.mwrm` still Detours |
| `sdk/catalog.json` | **Must stay absent** |

## What this tip does **not** claim

- That `tests.qualification` is filled or owner-reviewed.
- That ColdFire measured / cfmeter / stress numbers exist (static **752** Partial mop178).
- That FUNC+TRACK toast pages are captured (SETUP label filled by mop172; USB miss mop175 — still open).
- Dual-install words-move, jump colour, or a catalog pin.
- Any `sdk/catalog.json` force-list.

Hub sync: [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
(prior [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182)).
Qualification fill recipe after this tip:
[MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176).

## Cross links

- Claim honesty: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Dual-install protocol: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md)
- Cycles stub: [`performance.json`](performance.json)
- Cycles recipe: [`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md)
- SETUP provenance recipe: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md)
- Qualification fill recipe: [`qualification-fill-recipe-mop176-2026-11-24.md`](qualification-fill-recipe-mop176-2026-11-24.md)
- Qualification scaffold: [`../qualification.example.json`](../qualification.example.json)
- Hub strengthen: [MOP-166](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-tip-strengthen-mop157-honesty-and-dual-install-mop-166)
- Hub this tip: [MOP-168](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-path-mop-168)
- Hub fill recipe: [MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176)
- Hub cycles tip: [MOP-170](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-cycles-performance-plan-mop-170)
- Hub SETUP tip: [MOP-171](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-setup-pmtr-monochrome-capturejson-plan-mop-171)
