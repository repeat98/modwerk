# SPOS publishability gates hub honesty after jump-colour owner waive (MOP-243)

Tip-docs only. Europe/London · 25 November 2026. Jon **AUTHORIZES**
owner waive of the SPOS jump-colour gate for publish (tip-only; **not** a
new USB fixture unless Jon corrects). Cite
[mop219](usb-jump-colour-open-mop219-2026-11-25.md) Open fixture,
[mop227](publishability-gates-hub-mop227-2026-11-25.md) decision unblock,
[mop242](publishability-gates-hub-mop242-2026-11-25.md) park-vs-waive
menu. Do **not** invent jump-colour **Proven**, Accept, lifecycle, a new
USB dig, or a catalog pin. Catalog stays **SHUT** until Keep / qual / pin
are authorized **separately**.

## Verdict

| Question | Answer |
| --- | --- |
| Twin / USB / Accept / lifecycle? | **No** |
| Catalog force-list? | **No** (`sdk/catalog.json` untouched; seq-pos absent) |
| Invented jump-colour Proven / catalog pin / Accept? | **No** |
| New USB fixture / dig? | **No** — waive only; not a fixture unless Jon corrects |
| Jump-colour under address mode | **Unproven/waived** — mop219 Open fixture retained; **not** Proven |
| Catalog | Still **SHUT** |
| Remaining publish path | Keep / qual / catalog pin — each needs separate Jon auth |

## Owner waive (named scope)

Jon AUTHORIZES owner waive of the jump-colour publish gate for Seq Pos.
Scope:

- Removes jump-colour as the **blocking** gate on the publish *path*
  advancement documented here.
- Does **not** claim colour passed. Status stays **Unproven/waived**,
  never **Proven**.
- Does **not** pin `sdk/catalog.json`.
- Does **not** authorize Accept / lifecycle / Keep of Seq Pos.
- Does **not** authorize a new USB fixture or dig (unless Jon corrects).

Cite lineage: mop219 SLICE/STRT mute-isolation **Open (fixture)**
(`slice-strt-mute-isolation`; envCorr **0.970**; C/D aborted) after mop223
protocol **consumed**; mop216 `shared-Flex-attr-lock`; mop209
remapper-colour **not** reached; mop227 / mop242 decision menu (park /
waive / authorize sample / authorize protocol) — Jon picked **waive**.

## Proven vs Unproven/waived vs remaining path

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
| `tests.qualification` structure | **Placed** ([mop197](qualification-place-mop197-2026-11-25.md)) — pin-bound owner review still separate |

### Unproven/waived (not Proven)

| Gate | Status |
| --- | --- |
| Jump-colour under address mode | **Unproven/waived** — owner waive for publish gate; mop219 Open fixture + mop216/mop223/mop227/mop242 lineage retained; **do not** invent Proven |

### Remaining path (catalog still SHUT — separate auth)

| Step | Status after mop243 |
| --- | --- |
| Keep of Seq Pos (Accept/Keep onto tip — not Undo dual-install proof) | Still needs **separate** Jon Accept authorization — **not** invented this tip |
| Qualification pin-bound owner review | Structure **Placed** mop197; pin-bound review / publish still needs **separate** auth |
| `sdk/catalog.json` pin | **Must stay absent** / **SHUT** until Keep / qual / pin authorized separately |
| Next tip-named Keep-safe USB dig | **None** — waive is tip-only; no new fixture |

## Dead-end / consumed classes (unchanged — do not re-dig)

| Class | Status | Meaning |
| --- | --- | --- |
| `shared-Flex-attr-lock` | **Dead-end** ([mop216](jump-colour-deadend-tip-mop216-2026-11-25.md)) | LEVEL/filter + PTCH on shared Flex one-shot exhausted |
| `slice-strt-mute-isolation` | **Consumed / fixture-exhausted** ([mop219](usb-jump-colour-open-mop219-2026-11-25.md) after [mop223](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)) | STRT mute-isolation failed; re-running same STRT recipe is **not** a new dig |
| mop209 remapper-colour (S0≠S15 then C≈D) | **Not reached** | Mute-isolation never cleared on mop211 or mop219 |

## What this tip does **not** claim

- Jump-colour **Proven** (waive ≠ pass).
- Catalog pin / Accept / lifecycle / Keep of Seq Pos.
- A new USB fixture or dig protocol.
- A firmware behaviour change (no `unit.s` edit).
- That mop219 remapper, dial-max, toast, or `sp_len` failed.
- That Keep / qual / pin are already authorized.

## Cross links

- Prior hub after MT: [`publishability-gates-hub-mop242-2026-11-25.md`](publishability-gates-hub-mop242-2026-11-25.md)
- Prior hub after mop219: [`publishability-gates-hub-mop227-2026-11-25.md`](publishability-gates-hub-mop227-2026-11-25.md)
- USB Open (SLICE/STRT consumed): [`usb-jump-colour-open-mop219-2026-11-25.md`](usb-jump-colour-open-mop219-2026-11-25.md)
- Protocol tip (consumed): [`jump-colour-slice-fixture-tip-mop223-2026-11-25.md`](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)
- Attr-lock dead-end: [`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
- Gate sheet: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-243](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-colour-waive-mop-243)
- Current checklist: [MOP-244](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-keep-publish-tip-mop-244)
