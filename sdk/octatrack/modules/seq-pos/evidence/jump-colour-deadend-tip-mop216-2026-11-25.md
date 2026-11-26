# SPOS jump-colour fixture dead-end tip (MOP-216)

Tip-docs only. Europe/London · 25 November 2026. After
[mop211](usb-jump-colour-open-mop211-2026-11-25.md) Keep-safe USB left
jump-colour **Open**: extreme PTCH TRIG1/− vs TRIG16/+; stock mute-isolation
**S0≈S15** (envCorr **0.99999**; zcΔ=0) → **abort SPOS C/D** per mop209.
Remapper OK (`4ef940ac7942`; dial-max **37**; `sp_len=16`). Catalog
**SHUT**. No Accept / lifecycle / twin boot / `sdk/catalog.json`
force-list. Do **not** invent Proven.

## Verdict

| Question | Answer |
| --- | --- |
| mop211 mute-isolation S0≠S15? | **Fail** — S0≈S15 (envCorr ~1) |
| SPOS C/D on mop211? | **Aborted** (protocol) |
| LEVEL/filter fixture? | **Exhausted** (mop201 + mop203) |
| PTCH-extreme on shared Flex one-shot? | **Exhausted** (mop211) |
| mop209 SAMPLE-slot-per-trig on Flex? | **Unavailable** — Flex SAMPLE is track-level |
| mop209 remapper dead-end (S0≠S15 then C≈D)? | **Not reached** — mute-isolation never cleared |
| Fixture dead-end class? | **Yes** — `shared-Flex-attr-lock` |
| One concrete next USB lever? | **Yes** — SLICE first vs last (or STRT min vs max) on a multi-slice / long sample |
| Clear remapper / firmware fix? | **No** |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Dead-end class: `shared-Flex-attr-lock`

Honest class for this project / machine path:

1. **LEVEL/filter locks** on the same one-shot family cannot separate stock
   step bodies (mop203 C≈D envCorr ≈1 after toast+len OK).
2. **PTCH extremes** on TRIG1 vs TRIG16 likewise fail stock mute-isolation
   (mop211 S0≈S15 envCorr **0.99999**, peakΔ≈0, zcΔ=0).
3. mop209’s preferred **SAMPLE-slot** lever is **not** a per-trig USB path
   on Flex — SAMPLE is track-level (mop211 note). Re-asking for “different
   SAMPLE slots on TRIG1 vs TRIG16” on the same Flex track is a fixture
   dead-end, not a pending dig.
4. Therefore attribute-lock engineering alone on a **shared Flex one-shot**
   cannot clear mute-isolation S0≠S15. Do **not** re-run LEVEL/filter or
   PTCH recipes and call them a new dig.

This is **not** the mop209 remapper-colour dead-end (that class requires
S0≠S15 under stock, then C≈D under toast+len with remapper OK). mop211
never entered that class — preflight failed first.

Jump-colour stays **Open**. Catalog stays **SHUT**. Remapper / toast /
`sp_len` remain Proven/OK; do not invent a firmware fix from this stall.

## One concrete next USB lever (exit path)

Only remaining Keep-safe Undo path that can still clear mute-isolation
without inventing per-trig Flex SAMPLE slots:

| Step | Action |
| --- | --- |
| 0 | **ASK JON** (if needed): put a **multi-slice** Flex/STATIC (preferred) or **long multi-region** sample on T1. Short one-shot family is exhausted for attr-lock colour. |
| 1 | Confirm Keep tip24. Twin tip remapper + tip dual. Never Accept / lifecycle. |
| 2 | Lock **SLICE** first vs last on TRIG1 vs TRIG16 (preferred). Fallback: **STRT** min vs max (and/or LEN) so the two extremes play different regions. Quiet TRIG2–15. |
| 3 | Stock mute-isolation **S0 / S15** gate. Fail → stop; still Open (sample still non-separating). |
| 4 | Pass → toast-bind `T1 SPOS 0` / `127`, peek `sp_len[0]=16`, capture WAV **C/D**. |
| 5 | Colour gate as mop209. Undo → `[]`. ASK JON PC. Catalog **SHUT**. |

Outcome classes (unchanged honesty):

| Result | Write as |
| --- | --- |
| S0≈S15 after SLICE/STRT on multi-region sample | **Open** (fixture) — sample still non-separating; do not invent Proven |
| S0≠S15, C≠D under toast+len | jump-colour **Proven** only if gates pass — **not** this tip |
| S0≠S15, C≈D with toast+len OK | **Open** — mop209 remapper-colour **dead-end** class |
| Re-run LEVEL/filter or PTCH only | **Refuse** — `shared-Flex-attr-lock` exhausted |

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept.
- A firmware behaviour change (no `unit.s` edit).
- That mop211 remapper, dial-max, or `sp_len` failed.
- That the mop209 remapper-colour dead-end (S0≠S15 → C≈D) already happened.
- That a multi-slice sample is already on the unit (Jon AFK; tip only).

USB protocol tip for this exit lever:
[mop223](jump-colour-slice-fixture-tip-mop223-2026-11-25.md).

## Cross links

- USB protocol tip (SLICE/STRT): [`jump-colour-slice-fixture-tip-mop223-2026-11-25.md`](jump-colour-slice-fixture-tip-mop223-2026-11-25.md)
- USB Open (PTCH mute-isolation fail): [`usb-jump-colour-open-mop211-2026-11-25.md`](usb-jump-colour-open-mop211-2026-11-25.md)
- Prior stronger fixture tip: [`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
- Toast+len OK / C≈D: [`usb-jump-colour-open-mop203-2026-11-25.md`](usb-jump-colour-open-mop203-2026-11-25.md)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-216](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-fixture-deadend-tip-mop-216)
- Hub: [MOP-216](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-fixture-deadend-tip-mop-216)
- Protocol tip: [MOP-223](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-slice-fixture-tip-mop-223)
- Current hub honesty: [MOP-242](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-mt-resume-mop-242)
