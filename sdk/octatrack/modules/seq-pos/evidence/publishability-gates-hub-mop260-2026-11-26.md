# SPOS publishability gates hub — playhead remapper 0.1.x firmware gap (MOP-260)

Tip-docs only. Europe/London · 26 November 2026. Jon **DECIDES**: park dens
digs; treat SPOS playhead remapping as a **0.1.x firmware gap**. Cite dens
A/B **Open** ([mop258](usb-playhead-ab-open-mop258-2026-11-26.md) /
[mop259](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)) + stock
PLAYHEAD still marches under address mode = tip remapper does **not** own
audible/LED playhead. Catalog already **PINNED** (mop248) — honesty only.
No USB dens re-dig. No Accept invent. No catalog invent.

## Verdict

| Question | Answer |
| --- | --- |
| Twin / USB dens re-dig / Accept / lifecycle? | **No** |
| Catalog force-list / re-pin? | **No** (`sdk/catalog.json` already pinned mop248; untouched) |
| Invented playhead-motion / jump-colour Proven / Accept? | **No** |
| Dens digs | **Parked** (Jon decision after mop258/259 Open) |
| Playhead remapping (audible density + LED) | **0.1.x firmware gap** — remapper not owning audible/LED playhead |
| Full LFO ratchet / reverse / stage through pattern | **Blocked** until firmware LED/playhead remap under address mode |
| Jump-colour | Still **Unproven/waived** (mop243) — not re-opened |
| Catalog | Already **PINNED** (mop248) |

## Owner decision (named scope)

Jon DECIDES after mop258/259 dens Open:

- Park further sparse-density / dens USB digs.
- Classify address-mode playhead remapping (audible stick + LED playhead)
  as a **0.1.x firmware gap**, not a tip-only dig that invents Proven.
- Evidence stamp: dens A/B Open (mop258/259) + stock PLAYHEAD marches
  under address = tip-matched remapper does **not** own audible/LED
  playhead in 0.1.x.
- Full ratchet / reverse / stage through 1–16 (path to 64) stays
  **blocked** until firmware remaps LED/playhead under address mode.
- Does **not** invent playhead-motion Proven, jump-colour Proven, Accept,
  or a catalog change.
- Catalog pin mop248 stays as-is — honesty stamp only.

## Proven vs Unproven/waived vs firmware gap

### Proven (unchanged — do not re-dig as blockers)

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
| Toast / step-map peeks under address (0→step0, 127→step15) | **Observed** mop258/259 — not density Proven |
| `tests.qualification` structure | **Placed** ([mop197](qualification-place-mop197-2026-11-25.md)) |
| Keep Accept + reboot inventory | **PASS** ([mop245](usb-hw-mop245-keep-2026-11-25.md) / mop247) |
| `sdk/catalog.json` | **PINNED** ([mop248](catalog-pin-mop248-2026-11-25.md)) |

### Unproven/waived (not Proven)

| Gate | Status |
| --- | --- |
| Jump-colour under address mode | **Unproven/waived** — [mop243](publishability-gates-hub-mop243-2026-11-25.md); mop219 Open fixture retained; **do not** invent Proven |

### 0.1.x firmware gap (park dens; not tip Proven)

| Gate | Status |
| --- | --- |
| Audible playhead motion via sparse dens A/B | **Open → parked** — mop258 dens null; mop259 dens null + grid REC unverified; Jon parks dens digs |
| LED / stock PLAYHEAD under address mode | Still **marches** (mop258 uniqueT1=3 A/B/C) — LED not remapped in 0.1.x |
| Remapper owns audible + LED playhead | **No** — toast/step-map observed; dens + LED gap = remapper does not own them in 0.1.x |
| Full LFO ratchet / reverse / stage through pattern | **Blocked** until firmware LED/playhead remap under address mode |
| DRAM Enable / SPOS address-mode survival across reboot | Still **0.1.0 gap** (mop247 proves inventory presence only) |

## Dead-end / consumed / parked classes

| Class | Status | Meaning |
| --- | --- | --- |
| `shared-Flex-attr-lock` | **Dead-end** ([mop216](jump-colour-deadend-tip-mop216-2026-11-25.md)) | LEVEL/filter + PTCH on shared Flex one-shot exhausted |
| `slice-strt-mute-isolation` | **Consumed** ([mop219](usb-jump-colour-open-mop219-2026-11-25.md) after [mop223](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)) | STRT mute-isolation failed |
| Sparse dens A/B (LEVEL mute / TRIG1-only) | **Parked** (Jon mop260 after mop258/259 Open) | Re-running dens recipes is **not** authorized |
| mop209 remapper-colour | **Not reached** | Mute-isolation never cleared |

## What this tip does **not** claim

- Playhead-motion **Proven** or dens **Proven**.
- Jump-colour **Proven** (waive ≠ pass).
- That tip remapper already owns audible/LED playhead in 0.1.x.
- Accept / lifecycle / catalog re-pin.
- A firmware behaviour change from the tip alone (no `unit.s` edit).
- Authorization for ratchet/reverse USB until LED/playhead remap lands.

## Cross links

- Dens Open: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md),
  [`usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)
- Prior Keep hub: [`publishability-gates-hub-mop244-2026-11-25.md`](publishability-gates-hub-mop244-2026-11-25.md)
- Catalog pin: [`catalog-pin-mop248-2026-11-25.md`](catalog-pin-mop248-2026-11-25.md)
- Jump waive: [`publishability-gates-hub-mop243-2026-11-25.md`](publishability-gates-hub-mop243-2026-11-25.md)
- Gate sheet: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-260](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-playhead-remapper-firmware-gap-mop-260)
