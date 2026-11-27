# SPOS address-mode playhead A/B — Open (MOP-258)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026 ~01:05  
Tracker: **MOP-258**. Keep-safe Undo. **No Accept. No lifecycle.**  
Catalog already **PINNED** (mop248) — honesty only; no force-list invent.  
Jump-colour stays **Unproven/waived** (mop243) — **not** this dig.

## Verdict

| Gate | Result |
| --- | --- |
| Tip24 Keep preflight | **OK** — `eb667962…`, inv **25** (Screen Off + Mute Modes; **SEQ POS absent** on Keep after tempo path) |
| Twin | **`775d9322…`** tip-matched remapper `4ef940ac7942` / seq-pos `97de37e6…` / 1224 B |
| Dial-max | **37** |
| Toast bind SPOS 0 / 127 | **PASS** — LCD `T1 SPOS 00` / `T1 SPOS 127`; peeks `enT1=1`, `lenT1=16` |
| Expected step map | **PASS** — high 0 → step **0**; high 127 → step **15** (`(high×16)>>7`) |
| Address OFF peek | **PASS** — `enT1=0` after FUNC+T1+NO |
| Sparse onset-density A/B | **Fail** — densA=densB=densC=5.5/s (LEVEL mute of TRIG2–15 did not sparsify) |
| Stock PLAYHEAD peek | Still **marches** under address (uniqueT1=3 A/B/C) — LED not remapped in 0.1.0 |
| Playhead motion (lead claim) | **Open** — density gate failed; do **not** invent Proven |
| Accept / catalog | **none** / already pinned (no invent) |

**Honest class: Open (playhead motion).**  
Peek/toast **address→step map** on 1–16 is observed; audible **density** playhead stick is not. Post-hoc WAV pairwise corr AB≈−0.09 / BC≈0.13 shows content shift under toast-bound address — supportive, **not** jump-colour Proven, **not** density Proven.

## Fixture

Sparse density A/B (not jump-colour):

1. Tip coexist MWMS (Play Modes + LFO peers + SEQ POS) Undo trial on tip twin.
2. Isolate T1; LEVEL↓ TRIG2–15; LEVEL↑ TRIG1+TRIG16.
3. Park PMTR away from SPOS (12).
4. **A** OFF → PLAY WAV + PLAYHEAD peeks.
5. **B** toast-bind SPOS 0 → PLAY WAV + peeks (expect step 0).
6. **C** toast-bind SPOS 127 → PLAY WAV + peeks (expect step 15).
7. Pass density if address-on ≥3× denser than OFF. **Failed.**
8. Undo → `[]`. **ASK JON power-cycle.**

## Package / twin

| Field | Value |
| --- | --- |
| Tip remapper | `4ef940ac7942` (matched) |
| Tip `seq-pos.mwrm` | `97de37e6…` / 1224 B (matched) |
| Dual mid-trial | Play Modes + SEQ POS (+ peers) |
| Undo leave | **`[]`** (twin base still on RAM) |

## Leave / next

**ASK JON power-cycle.** Twin `775d9322…` on RAM; tip24 Keep returns after PC.  
Note: pre-dig tip24 inventory lacked SEQ POS / Micro Timing (Tempo LFO present) — PC restores Keep card state; do not invent Enable/SPOS DRAM reboot survival.

**Next levers:** dens digs **parked** after Jon mop260 — playhead remapping
= **0.1.x firmware gap** (stock PLAYHEAD marches; remapper not owning
audible/LED). Full peer LFO ratchet/reverse/stage through pattern
**blocked** until firmware LED/playhead remap under address mode. Reboot
Enable/SPOS survival remains a separate 0.1.0 gap. Tip does not own tempo.
See [`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md).

## Artifacts

Private: `Projects/modwerk-builds/mop258-spos-playhead/publish/`  
Store media: `media/mop258-spos-playhead/` (toast PNGs + T1 WAVs; kept out of module tree so native source SHA stays pinned)  
Store status: project `internal/mop258-spos-playhead-ab.md`

## Cross links

- Catalog pin: [`catalog-pin-mop248-2026-11-25.md`](catalog-pin-mop248-2026-11-25.md)
- Jump-colour Open (contrast): [`usb-jump-colour-open-mop219-2026-11-25.md`](usb-jump-colour-open-mop219-2026-11-25.md)
- Jump waive: mop243 — not re-opened
- Keep/reboot: mop245/247
- Audible coexist timing: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
