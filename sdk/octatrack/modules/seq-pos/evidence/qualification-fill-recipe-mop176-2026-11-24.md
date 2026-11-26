# Qualification stub fill recipe (MOP-176, tip-only strengthen of mop168 §1)

Host tip after [#144](https://github.com/jonathanwardle1992-beep/modwerk/pull/144)
/ [MOP-174](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-setup-capture-mop-174) / [MOP-177](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-toast-miss-and-qual-recipe-mop-177) / [MOP-180](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-static-mop-180) / [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182) / [MOP-187](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-toast-reprobe-miss-and-qual-stub-mop-187) / [MOP-190](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-playmodes-prove-mop-190) / [MOP-193](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-memory-measure-mop-193) / [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
and parent outline
[MOP-168](qualification-fill-path-mop168-2026-11-24.md). Hub already lists
#8 SPOS as **audibleProven**
([#130](https://github.com/jonathanwardle1992-beep/modwerk/pull/130) /
[mop157](usb-audible-mop157-2026-11-24.md)), SETUP PMTR=SPOS label **Proven**
([mop172](usb-setup-pmtr-mop172-2026-11-24.md)), Detours **Proven**
(mop188/189), and catalog **SHUT**
([MOP-83](catalog-gate-mop83-2026-11-24.md) /
[MOP-113](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#catalog-gate-checklist-mop-113)).
Current owner-fill stamp:
[MOP-191](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-owner-fill-mop-191).
**Docs only** — no USB twin, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent cycle counts, memory
bytes, hardware pass marks, toast PNGs, or readiness.

## Why this note

MOP-168 §1 named the mop157-bound identity table and a ColdFire-shaped
skeleton. This sheet turns that outline into a **QLR-shaped ordered fill
recipe** a later host can follow when real measurements exist, citing the
published ColdFire module that already closed the same gates
([quantize-live-rec-toggle](../../../octabam/modules/quantize-live-rec-toggle/octamod.module.json)
`tests.qualification`). Cite **structure only** — never copy QLR numbers
(416 / 95778 / 188 / 200 / image `026464de…`) into Seq Pos.

Filling this recipe is **not** a catalog pin. AudibleProven ≠ qualification.
Measured cycles ≠ owner review. SETUP label Proven ≠ filled
`tests.qualification`.

## Anti-patterns (never)

| Trap | Why it fails |
| --- | --- |
| Copy [`../qualification.example.json`](../qualification.example.json) into the manifest | DSP-shaped scaffold (`processor: "dsp"`, `cycles/sample`, `dsp-p`) — Seq Pos is ColdFire-only |
| Fill nulls with zeros / averages / QLR or PROB integers | Invented measurements; validators reject placeholders, and honesty forbids invented pass marks |
| Place `tests.qualification` before reports exist | Incomplete / pending / failed records fail publication; leave the object **absent** until owner-reviewed |
| Treat mop157 Keep-safe Undo as hardware stress | Undo audible is prior evidence only — not a stress / functional qualification pass |
| Use mop157 twin digest alone as `imageSha256` | Qualification image is the **local hardware stress** image; mop157 Keep / twin digests are claim lineage only |
| Force-list `sdk/catalog.json` | Pin stays **SHUT** until every MOP-83 gate closes |

## Ordered recipe (leave object absent until A–G are honest)

### A. Preconditions

Do **not** add `tests.qualification` until:

1. Source + local text report paths for the intended version are final
   (`tests.report` → `TESTING.md`; any `evidence/*.md` / `.json` reports
   declared).
2. `tests.evidenceRevision` will name the **exact** tested source commit.
3. Cycles path is either:
   - filled via [mop170](cycles-performance-plan-mop170-2026-11-24.md) into
     [`performance.json`](performance.json), **or**
   - still all-null with method text pointing at mop170 (honest unmeasured
     — never invent numbers to pass `perf:audit -- check`).
4. Screenshots path: mop172 SETUP PNG may be listed; FUNC+TRACK toast pages
   stay **empty** until captured ([mop171](setup-pmtr-provenance-plan-mop171-2026-11-24.md)).
5. This tip does **not** boot twin / Accept / lifecycle.

### B. Identity (cite; fill only when known)

Compute source identity after source + report paths are final — never invent:

```sh
node --input-type=module - <<'JS'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseModuleDocument } from './src/catalog/module-contract.ts'
import { moduleNativeSourceSha256 } from './scripts/module-qualification.mjs'
const folder = resolve('sdk/drafts/seq-pos')
const document = parseModuleDocument(JSON.parse(await readFile(resolve(folder, 'octamod.module.json'), 'utf8')))
console.log(await moduleNativeSourceSha256(folder, document))
JS
```

| Field | mop157-bound / later fill (cite only) |
| --- | --- |
| `moduleVersion` | Manifest version at publication (`0.1.0-experimental` today; bump if source changes) |
| `sourceSha256` | Output of the command above — never invent |
| `imageSha256` | Local image the **hardware** functional / stress report used — not mop157 twin digest alone; Keep base `eb667962…` / twin `5dc7059cb2564384…` / package **620 B** and mop167 tip remapper `4ef940ac7942` are claim lineage only |
| `tests.evidenceRevision` | Exact Git commit of the tested source tree |

Field reference:
[MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md#record-in-the-module-manifest).

### C. `cycles[]` — one **coldfire** record (no DSP)

| Rule | Detail |
| --- | --- |
| Count | Exactly one record: `processor: "coldfire"` |
| Unit | `cycles/event` (not `cycles/sample`) |
| Method | Point at filled [`performance.json`](performance.json) after mop170; until then leave `worstCase` / `maxConfiguration` / `maxInstances` / `budget` **null** |
| Conditions prose | SPOS endpoints from mop168 skeleton (0/127; address on/off; DEP; WAVE; LFO→SPOS; FUNC+TRACK+NO; eight tracks; sparse/dense) — rewrite with observed matrix when measured |
| Report | `TESTING.md` (or a nonempty `evidence/` text report) |

Cite QLR condition **keys** only. Emulator instruction counts ≠ chip
wall-clock — state that limit in the report when filling. Never copy QLR
`worstCase` / `budget`.

### D. `memory` — name regions; leave integers null until measured

Measure from the linked unit / map — do **not** invent bytes. Authored
estimate narrative in TESTING.md (“one DRAM unit (code + 16 halfwords + 8
enable + 8 length + toast)…”) is a **measurement target**, not a filled
record.

| Candidate region (name only) | Likely `space` | Scope |
| --- | --- | --- |
| Authored ColdFire unit (code + toast strings, ROM cave) | `cpu-flash` | shared |
| Detours / pokes over stock (if any in the tested image) | `cpu-flash` | shared |
| Per-track `sp_pos_w` halfwords (8 tracks) | `cpu-ram` | shared or instance — justify |
| Per-track `sp_en` (8) | `cpu-ram` | shared or instance — justify |
| Per-track length words (8) | `cpu-ram` | shared or instance — justify |

Leave `words` / `bytes` / `perInstanceBytes` / `sharedBytes` /
`maxInstances` / `totalBytes` **null** until counted. No DSP memory
(`dsp-p` / `dsp-x` / `dsp-y` do **not** apply). Cite QLR region **shape**
only — never copy 188 / 12 / 200.

### E. `hardware` — functional report (owner / later USB)

Prefer the QLR-shaped functional block (`kind: "functional"`, `status`,
`summary`, `limitations`) when filling — mop168’s older
pending/`checks.failed` skeleton is the incomplete scaffold only.

| Rule | Detail |
| --- | --- |
| mop157 | Cite as prior Keep-safe Undo audible evidence only — **not** a stress pass; jump-colour / Detour-on-twin limits remain |
| Image | Bind `hardware.imageSha256` to the same local image as top-level `imageSha256` |
| Remapper | Prefer tip-matched remapper (mop167 Proven) over Detour-only twin for publication qualification |
| Duration / checks | Leave null / failed until observed; never invent pass marks |
| DRAM survival | Enable / SPOS are DRAM-only in 0.1.0 — reboot survival is an **expected gap** until a store is designed; disclose in limitations |
| Project | Keep card / firmware / project fingerprint local |

### F. `documentation`

| Piece | Source |
| --- | --- |
| `tutorial.title` / `steps` | Must match README Quick tutorial order (Include → FUNC+TRACK+LEVEL → LFO SETUP PMTR=SPOS / FUNC+TRACK+NO) |
| `screenshots` | May list `media/ot-setup-pmtr-spos.png` (mop172); leave toast paths empty until captured |
| `screenshotStyle` | `"black-and-white"` |

UI contract:
[MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md) /
[MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md#complete-documentation-and-screenshot-style).

### G. Placement + validation (later — not this tip)

1. Place the filled object under `tests.qualification` in
   `octamod.module.json` **only** after owner review of actual reports.
2. Keep `tests.report` / `tests.evidenceRevision` / README / native
   declarations synchronized.
3. Recompute `sourceSha256` after reports are final; replace any temporary
   hash.
4. Run `npm run module:doctor -- seq-pos` until green on the filled tree.
5. Catalog pin still requires the other MOP-83 gates (words-move, measured
   cycles, owner review) — never force-list.

## What already contributes (and what does **not**)

| Already true | Still open for qualification |
| --- | --- |
| Keep-safe Undo coexist audible (onset Δ −254) | Jump colour |
| Tip-matched remapper + dual inventory (mop167); words-move **Proven** (mop184) | — |
| SETUP PMTR=SPOS monochrome + `capture.json` (mop172) | FUNC+TRACK toast pages (**Open/miss** — mop175/185) |
| Measured `performance.json` (mop178/179/181); mop186 cycles stub; mop191 owner functional fill; mop192 memory **372** in example | `tests.qualification` in manifest (pending toast mop176 §G) |
| Play Modes Detours → `runtime.json` **Proven** (mop188/189) | Published 0.1.1 `.mwrm` still Detours |

## Remaining gates vs Keep catalog SHUT (cite only)

| Gate | Status (current after mop193) |
| --- | --- |
| Audible address-mode (coexist Undo) | **audibleProven** (mop157); jump-colour gap |
| Tip-matched base remapper (no private Detour) | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install inventory (PM + SPOS) | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md) / #153; T1 unique **33**; mop169 stall cited) |
| `tests.qualification` + owner review | **Placed** — [mop197](qualification-place-mop197-2026-11-25.md); owner fill [mop191](qualification-owner-fill-mop191-2026-11-24.md) + memory [mop192](qualification-memory-mop192-2026-11-24.md); toast [mop196](usb-toasts-prove-mop196-2026-11-25.md); stub [mop186](qualification-fill-mop186-2026-11-24.md); **recipe this sheet** |
| Measured cycles (`performance.json`) | **Filled (emulator)** — static/measured **752**; load 287.8/287.8 idle 0 ([mop179](usb-cycles-mop179-2026-11-24.md)); stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md) / #152); static dig [mop178](usb-cycles-mop178-2026-11-24.md); recipe [mop170](cycles-performance-plan-mop170-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** hardware SETUP label [mop172](usb-setup-pmtr-mop172-2026-11-24.md) |
| FUNC+TRACK toast pages | **Open/miss** [mop175](usb-toasts-miss-mop175-2026-11-24.md) + [mop185](usb-toasts-reprobe-mop185-2026-11-24.md) (no publication toast PNGs) |
| Standalone Play Modes Detours → `runtime.json` | **Proven** ([mop188](playmodes-runtime-mop188-2026-11-24.md) tip + [mop189](usb-playmodes-dual-mop189-2026-11-24.md) USB); published 0.1.1 `.mwrm` still Detours |
| `sdk/catalog.json` | **Must stay absent** |

## What this tip does **not** claim

- That `tests.qualification` is in the manifest (mop191/192 fill the
  example; object stays absent pending toast §G).
- That FUNC+TRACK toast pages are captured (USB miss mop175/185 — still open).
- Jump colour or a catalog pin.
- Any `sdk/catalog.json` force-list.
- Any copy of QLR / PROB measured numbers into Seq Pos.

Hub: [MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176)
(parent [MOP-168](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-path-mop-168);
stub [MOP-186](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-mop-186);
owner fill [MOP-191](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-owner-fill-mop-191);
memory [MOP-192](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-memory-mop-192);
current [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)).

## Cross links

- Parent outline: [`qualification-fill-path-mop168-2026-11-24.md`](qualification-fill-path-mop168-2026-11-24.md)
- Cycles recipe: [`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md)
- SETUP provenance / capture: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md) / [`usb-setup-pmtr-mop172-2026-11-24.md`](usb-setup-pmtr-mop172-2026-11-24.md)
- Claim honesty: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Field reference: [`MODULE_QUALIFICATION.md`](../../../../docs/MODULE_QUALIFICATION.md)
- QLR shape cite only: [`quantize-live-rec-toggle/octamod.module.json`](../../../octabam/modules/quantize-live-rec-toggle/octamod.module.json)
