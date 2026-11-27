# SPOS publishability gates hub honesty after MT distraction (MOP-242)

Tip-docs only. Europe/London · 25 November 2026. Resume SPOS after the
Micro Timing (MT) publish distraction (mop225–240). MT catalog pin does
**not** open seq-pos. Restate remaining publishability gates vs catalog
**SHUT** from [mop227](publishability-gates-hub-mop227-2026-11-25.md) /
[mop219](usb-jump-colour-open-mop219-2026-11-25.md). Cite only already
Proven toast / `sp_len`. Do **not** invent jump-colour Proven, a catalog
pin, Accept, or a new USB dig protocol. No twin / USB / lifecycle /
`sdk/catalog.json` force-list this pass.

## Verdict

| Question | Answer |
| --- | --- |
| Twin / USB / Accept / lifecycle? | **No** |
| Catalog force-list? | **No** (`sdk/catalog.json` untouched; seq-pos absent) |
| Invented jump-colour / Proven / catalog pin? | **No** |
| MT distraction changed SPOS gates? | **No** — same Proven / Open as mop227 |
| FUNC+TRACK toast | **Proven** ([mop196](usb-toasts-prove-mop196-2026-11-25.md)) |
| `sp_len` default 16 on USB | **Proven** ([mop202](sp-len-init-tip-mop202-2026-11-25.md) tip + [mop203](usb-jump-colour-open-mop203-2026-11-25.md) peek) |
| mop223 SLICE/STRT USB protocol | **Consumed** by [mop219](usb-jump-colour-open-mop219-2026-11-25.md) — S0≈S15; C/D aborted |
| Safe next USB lever (tip-named)? | **None** — do not invent; do not re-run exhausted fixtures |
| Jump-colour under address mode | Still **Open** |
| Catalog | **SHUT** |

## Proven vs Open (actionable)

### Proven (do not re-dig as blockers)

| Gate | Status |
| --- | --- |
| Tip-matched base remapper + dual-install inventory | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md); mop169 stall cited) |
| Measured cycles / stress ≥60 s (`performance.json`) | **Filled (emulator)**; stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md)); measured/load [mop179](usb-cycles-mop179-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** ([mop172](usb-setup-pmtr-mop172-2026-11-24.md)) |
| Play Modes Detours → `runtime.json` | **Proven** ([mop188](playmodes-runtime-mop188-2026-11-24.md) tip + [mop189](usb-playmodes-dual-mop189-2026-11-24.md) USB; published 0.1.1 `.mwrm` still Detours / `lagsBehind`) |
| Memory integers | Tip-wired **944** ([mop202](sp-len-init-tip-mop202-2026-11-25.md); mop195 **908** / mop192 **372** lineage) |
| FUNC+TRACK toast pages | USB **Proven** ([mop196](usb-toasts-prove-mop196-2026-11-25.md); tip wire [mop195](toast-tip-wire-mop195-2026-11-25.md)) |
| `sp_len` `.data` default 16 | USB **Proven** ([mop203](usb-jump-colour-open-mop203-2026-11-25.md) peek `sp_len[0]=16` after [mop202](sp-len-init-tip-mop202-2026-11-25.md)) |
| `tests.qualification` + owner review | **Placed** ([mop197](qualification-place-mop197-2026-11-25.md)) |

### Open (blocks catalog)

| Gate | Status |
| --- | --- |
| Jump-colour under address mode | Still **Open** — [mop219](usb-jump-colour-open-mop219-2026-11-25.md) `slice-strt-mute-isolation`; [mop216](jump-colour-deadend-tip-mop216-2026-11-25.md) `shared-Flex-attr-lock`; mop209 remapper-colour **not** reached; [mop203](usb-jump-colour-open-mop203-2026-11-25.md) toast+len OK / C≈D |
| Next tip-named Keep-safe USB dig | **None** |
| `sdk/catalog.json` | **Must stay absent** / **SHUT** |

## Dead-end / consumed classes (do not re-dig as “new”)

| Class | Status | Meaning |
| --- | --- | --- |
| `shared-Flex-attr-lock` | **Dead-end** ([mop216](jump-colour-deadend-tip-mop216-2026-11-25.md)) | LEVEL/filter + PTCH on shared Flex one-shot exhausted; Flex SAMPLE track-level |
| `slice-strt-mute-isolation` | **Consumed / fixture-exhausted** ([mop219](usb-jump-colour-open-mop219-2026-11-25.md) after [mop223](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)) | STRT≈min TRIG1 / STRT≈max TRIG16 on Jon-confirmed multi-slice/long Flex failed stock mute-isolation S0≠S15; abort C/D. Re-running the same STRT recipe on the same sample family is **not** a new dig |
| mop209 remapper-colour (S0≠S15 then C≈D) | **Not reached** | Mute-isolation never cleared on mop211 or mop219 |

Refuse LEVEL/filter / PTCH re-runs. Refuse inventing SLIC / `slice-num`,
per-trig Flex SAMPLE slots, or a “stronger” unnamed attr lock.

## Jump-colour: park vs Jon decision

Tip recommendation after mop219/mop227: **park** is the honest default for
catalog — leave jump-colour **Open** documented and catalog **SHUT**. Park
does **not** pin catalog and does **not** invent Proven.

Any other path needs an **owner (Jon) decision**:

| Choice | Meaning | Catalog |
| --- | --- | --- |
| **Park** (tip default) | Stop SPOS USB digs; drafts-only; Open documented | Stays **SHUT** |
| **Waive** | Owner-named waive of jump-colour for catalog (still no invented Proven that colour passed) | May open catalog path only under that named scope |
| **Authorize distinct sample** | Jon loads an audibly distinct multi-slice / multi-region T1 sample; one named mop223-protocol retry | Stays **SHUT** until a future USB dig can claim Proven |
| **Authorize new named protocol** | Jon names a lever outside the exhausted classes above | Stays **SHUT** until Proven |

Tip alone cannot name a safe next USB lever without inventing Proven or
repeating a consumed fixture. Until Jon picks waive / authorize (or
explicitly confirms park-and-stop): jump-colour stays **Open**; catalog
stays **SHUT**; no queued SPOS USB dig from this tip.

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept.
- That MT publication changed SPOS readiness.
- A firmware behaviour change (no `unit.s` edit).
- That mop219 remapper, dial-max, toast, or `sp_len` failed.
- That mop209 remapper-colour dead-end (S0≠S15 → C≈D) already happened.
- Any next USB dig recipe beyond “none — wait for owner park/waive/authorize”.

## Cross links

- Prior hub after mop219: [`publishability-gates-hub-mop227-2026-11-25.md`](publishability-gates-hub-mop227-2026-11-25.md)
- USB Open (SLICE/STRT consumed): [`usb-jump-colour-open-mop219-2026-11-25.md`](usb-jump-colour-open-mop219-2026-11-25.md)
- Protocol tip (consumed): [`jump-colour-slice-fixture-tip-mop223-2026-11-25.md`](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)
- Attr-lock dead-end: [`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
- Prior hub: [`publishability-gates-hub-mop224-2026-11-25.md`](publishability-gates-hub-mop224-2026-11-25.md)
- Gate sheet: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-242](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-mt-resume-mop-242)
- Current checklist: [MOP-244](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-keep-publish-tip-mop-244)
