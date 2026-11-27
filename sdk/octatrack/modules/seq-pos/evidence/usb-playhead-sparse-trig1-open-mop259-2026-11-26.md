# SPOS sparse TRIG1 playhead A/B — Open (MOP-259)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026 ~01:15  
Tracker: **MOP-259** (after mop258 Open + Jon PC). Keep-safe Undo.  
**No Accept. No lifecycle.** Catalog pinned. Jump-colour stays  
**Unproven/waived** (mop243) — not this dig.

## Verdict

| Gate | Result |
| --- | --- |
| Tip24 Keep after Jon PC | **OK** — `eb667962…`, inv **25** |
| Twin | **`775d9322…`** remapper `4ef940ac7942` / seq-pos `97de37e6…` |
| Toast bind 0 / 127 | **PASS** — peeks `enT1=1`, `lenT1=16`, expected steps 0 / 15 |
| Grid REC clear TRIG2–16 | **Unverified** — LCD stayed **SRC+FLEX** after REC; PATTERN opened SELECT PATTERN |
| Sparse density A/B/C | **Fail** — densA=B=C=**5.5**/s (identical) |
| Post-hoc WAV corr | AB≈−0.59 · BC≈−0.72 · AC≈0.68 (content shifts; **not** density Proven) |
| Playhead motion (lead) | **Open** |
| Accept / catalog invent | **none** |

**Honest class: Open (sparse TRIG1 density).**  
Toast/step-map still observed (same as mop258). Stronger sparse lever did  
**not** yield density separation — grid-entry recipe on this twin UI path  
unconfirmed. Do **not** invent Proven.

## Fixture attempted

1. Tip coexist MWMS Undo trial on tip twin.
2. STOP → NO → T1 → REC → toggle TRIG2–16; TRIG1 LEVEL↑; LEVEL↓ backup.
3. A OFF / B SPOS0 / C SPOS127 WAVs + peeks.
4. densOk required B≫A **and** (C silent or B≫C) — **failed**.
5. Probe follow-up: PATTERN → SELECT PATTERN modal; double-REC still SRC+FLEX.
6. Undo → `[]`. **ASK JON PC.**

## Leave / next

**ASK JON power-cycle.** Twin on RAM.  
Dens digs **parked** after Jon mop260 — playhead remapping = **0.1.x
firmware gap** (stock PLAYHEAD marches; remapper not owning audible/LED).
Full ratchet/reverse **blocked** until firmware LED/playhead remap under
address mode. Reboot Enable/SPOS survival remains a separate 0.1.0 gap.
See
[`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md).

## Artifacts

Private: `Projects/modwerk-builds/mop259-spos-sparse-trig1/publish/`  
Store media: `media/mop259-spos-sparse-trig1/`  
Store status: `internal/mop259-spos-sparse-trig1.md`  
Prior Open dens: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md) (merged #225)
