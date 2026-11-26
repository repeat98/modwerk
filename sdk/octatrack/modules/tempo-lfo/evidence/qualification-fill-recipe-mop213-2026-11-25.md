# Qualification stub fill recipe (MOP-213, tip-only)

After mop205 USB smoke PASS and mop213 static cycles. Hub checklist:
[MOP-113](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#catalog-gate-checklist-mop-113).
**Docs only** — no USB twin, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent cycle measured, memory
package totals, hardware pass marks, WAV, or readiness. Leave
`tests.qualification` **absent** from the manifest until A–G are honest.

Cite QLR / SPOS mop176 **structure** only — never copy their numbers.

## Why this note

Publishability after smoke needs a ColdFire-shaped fill path for later
owner review. Smoke ≠ qualification ≠ catalog pin. Static cycles ≠
measured. This sheet is the hook; filling it later is a separate dig.

## Anti-patterns (never)

| Trap | Why it fails |
| --- | --- |
| Copy [`../qualification.example.json`](../qualification.example.json) DSP fields into the manifest | Example stays a scaffold; TEMPO is ColdFire-only |
| Fill nulls with zeros / peer integers | Invented measurements |
| Place `tests.qualification` before reports exist | Incomplete records fail publication |
| Treat mop205 smoke as hardware stress / Proven | Smoke is SETUP + words/BPM peeks only |
| Use mop205 twin digest alone as `imageSha256` | Qualification image is the local stress/functional image |
| Force-list `sdk/catalog.json` | Pin stays **SHUT** |

## Ordered recipe (leave object absent until A–G are honest)

### A. Preconditions

1. `tests.report` → `TESTING.md`; evidence sheets declared.
2. `tests.evidenceRevision` will name the exact tested source commit.
3. Cycles: static filled ([mop213 static](usb-cycles-static-mop213-2026-11-25.md)); measured / load / stress filled ([mop255](otemu-cycles-mop255-2026-11-25.md)).
4. Screenshots: mop205 SETUP PNG may be listed; OCR / tutorial still open.
5. No twin / Accept / lifecycle from this tip.

### B. Identity (cite; fill only when known)

```sh
node --input-type=module - <<'JS'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseModuleDocument } from './src/catalog/module-contract.ts'
import { moduleNativeSourceSha256 } from './scripts/module-qualification.mjs'
const folder = resolve('sdk/drafts/tempo-lfo')
const document = parseModuleDocument(JSON.parse(await readFile(resolve(folder, 'octamod.module.json'), 'utf8')))
console.log(await moduleNativeSourceSha256(folder, document))
JS
```

| Field | Fill rule |
| --- | --- |
| `moduleVersion` | Manifest version at publication |
| `sourceSha256` | Command above — never invent |
| `imageSha256` | Local image the **hardware** report used — not mop205 twin digest alone |
| `tests.evidenceRevision` | Exact Git commit of the tested source tree |

### C. `cycles[]` — one **coldfire** record (no DSP)

| Rule | Detail |
| --- | --- |
| Count | Exactly one: `processor: "coldfire"` |
| Unit | `cycles/event` |
| Method | Point at [`performance.json`](performance.json); static **624**; measured **624** (mop255) |
| Conditions | TEMPO endpoints: high byte 0/64/127; DEP; WAVE; eight tracks last-writer; out-of-range pointer |
| Report | `TESTING.md` |

### D. Memory regions (named; totals when measured)

Authored `.bss` from `unit.s`: `tm_bpm_w` 16 + `tm_dirty` 8 = **24** bytes
(source-visible). Package / flash / shared totals stay **null** until a
linked image accounts them. Named regions for the example scaffold:
`cpu-flash` (unit text+data), `cpu-ram` (bss shadows). No DSP.

### E. Hardware functional (QLR shape; mop205 ≠ stress)

Functional prose may **cite** mop205 smoke (dial 39 / SETUP TEMPO /
words+BPM24 move / Undo `[]`) as prior evidence only. Stress /
persistence / multi-instance remain **untested**. Checks stay failed /
pending until a real report.

### F. Documentation / screenshots

Tutorial steps already in presentation. SETUP panel PNG retained under
store `media/mop205-tempo-lfo-usb/` — list only when path is in-repo or
declared; do not invent OCR Proven.

### G. Place `tests.qualification` + owner review

Only after A–F are honest and an owner (or scoped author) reviews.
Until then the object stays **absent**. **MOP-256** audited A–G and
**stops for Jon** — example stub filled; place not authorized from tip
alone ([gate](qualification-gate-mop256-2026-11-25.md)). Catalog pin
remains **SHUT** even after place — migration step 6 is separate; **ask
Jon** before any `sdk/catalog.json` edit.

## Cross links

- Static: [`usb-cycles-static-mop213-2026-11-25.md`](usb-cycles-static-mop213-2026-11-25.md)
- Cycles plan: [`cycles-performance-plan-mop213-2026-11-25.md`](cycles-performance-plan-mop213-2026-11-25.md)
- Catalog gate: [`catalog-gate-mop213-2026-11-25.md`](catalog-gate-mop213-2026-11-25.md)
- Smoke: [`usb-smoke-mop205-2026-11-25.md`](usb-smoke-mop205-2026-11-25.md)
- Field reference: [MODULE_QUALIFICATION.md](../../../../docs/MODULE_QUALIFICATION.md)
- Hub: [MOP-213](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-tip-publish-gates-mop-213)
- SPOS recipe structure (cite only): [`../../seq-pos/evidence/qualification-fill-recipe-mop176-2026-11-24.md`](../../seq-pos/evidence/qualification-fill-recipe-mop176-2026-11-24.md)
