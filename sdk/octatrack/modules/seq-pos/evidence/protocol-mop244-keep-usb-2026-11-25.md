# Keep of Seq Pos — USB protocol (MOP-244 tip)

Tip-only sheet. Catalog **SHUT**. **Do not run** during Keep-safe Undo
AFK digs. **Do not** invent Proven. Execute only after Jon explicitly
authorizes an Accept / `device_keep` session for this package.

Prior behavioural digs (Undo-only) are **PASS** / **Proven** where cited
and are **not** Keep: mop167 / mop172 / mop184 / mop189 / mop196 /
mop202/203. Jump-colour is **Unproven/waived** (mop243) — not Keep.
Keep tip24 restore after Undo digs is **not** Keep of Seq Pos.

## Why this sheet exists

mop243 / mop244 Keep publish gate: catalog stays closed while **Keep of
Seq Pos** is **Open**. FRONTEND_MCP already defines review → trial →
self-test → `device_keep` vs `device_undo`. HARDWARE_TRAPS already warns
that Accept on an empty `--dev` twin can rewrite the card set. Micro
Timing mop228/mop229/mop230 showed the same envelope (tip protocol →
Open abort without auth → PASS only after Jon Accept). This sheet binds
those published rules to Seq Pos without inventing companion lists or
inventing that Keep already ran.

## Envelope (authorized Keep session only)

| Check | Rule |
| --- | --- |
| Jon authorization | Explicit Accept/Keep for Seq Pos — not implied by AFK Undo dig, mop243 waive, or tip24 idle |
| Tip package | `97de37e698ac88a7…` / 1224 B tip-matched (mop202), or rebuild from exact tip under test |
| Self-test | Actual passed device self-test on the trial — required before Keep |
| Accept path | Explicit `device_keep` only — never `device lifecycle` accident |
| Catalog / Proven invent | **SHUT** / none |

## Keep tip24 vs Keep of Seq Pos

| Concept | Meaning |
| --- | --- |
| Keep tip24 | Production base `eb667962…` (or SHA Jon names), inventory **24** (or current named count), Screen Off + Mute Modes — restore via power-cycle after Undo digs |
| Keep of Seq Pos | Card set **retains** the tip-matched Seq Pos package after an explicit Keep of a reviewed trial |

Confusing the two forges Proven. Dual-install Undo left tip24 intact and
did **not** Keep Seq Pos.

## Ordered steps (when authorized)

1. **Preflight with Jon.** Confirm which card inventory must survive
   (tip24 companions vs intentional empty / replacement). Do not invent
   a companion allowlist. Record the named baseline.
2. **Tip-matched package.** Build or reuse `97de37e698ac88a7…` from the
   exact tip commit; record digest + byte length in evidence.
3. **`device_review`** of the module set that includes Seq Pos (and only
   the companions Jon named).
4. **`device_trial`** within the review window; require **actual** passed
   self-test. Mid-trial LCD may show SPOS / PMTR 37 (already Proven on
   Undo twins — do not re-claim as Keep).
5. **Explicit `device_keep`.** Use the trial token; refuse if identity
   changed. Do **not** call lifecycle Accept helpers.
6. **Inventory after Keep.** Confirm Seq Pos is present on the saved
   set. Record before/after inventory host-local (never commit Keep dumps).
7. **Physical reboot persistence** (separate check). Power-cycle; confirm
   Seq Pos still present and SETUP PMTR / toast still reachable. Emulator /
   Undo dig ≠ reboot Keep. DRAM-only enable/SPOS state may clear — that is
   a known 0.1.0 limit, not a substitute for package Keep evidence.
8. **Evidence.** Write `usb-hw-*-keep-*.md` + frames under `media/` with
   provenance. Catalog pin stays **SHUT** until pin-bound qual review also
   clears ([keep-publish-gate](keep-publish-gate-mop244-2026-11-25.md)).

## Abort / honest miss

| Condition | Action |
| --- | --- |
| No Jon Accept / `device_keep` authorization | **Do not run** — leave Keep **Open** |
| Self-test fails | Undo; record miss; no Keep |
| Foreign saved set / Keep refused | Record MCP refusal; do not invent recovery |
| Accidental lifecycle Accept | Stop; ASK JON; treat as Keep-tip24 incident (MOP-67 / MOP-74 class) |
| Empty-twin Accept wiped tip24 | Honest miss; restore Keep tip24 before further digs |

## What this tip does **not** claim

- That Keep of Seq Pos already ran (it has **not**).
- That mop167 / mop189 Undo digs are Keep Proven.
- That mop243 jump-colour waive is Keep or colour Proven.
- Companion inventory Jon did not name.
- A catalog pin.
- That tip-only AFK may Accept.

## Cross links

- Keep gate: [`keep-publish-gate-mop244-2026-11-25.md`](keep-publish-gate-mop244-2026-11-25.md)
- Hub after waive: [`publishability-gates-hub-mop243-2026-11-25.md`](publishability-gates-hub-mop243-2026-11-25.md)
- Proven cite: [`publishability-gates-hub-mop242-2026-11-25.md`](publishability-gates-hub-mop242-2026-11-25.md)
- Catalog gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- MT pattern: [`protocol-mop228-keep-usb-2026-11-25.md`](../../../octabam/modules/micro-timing/evidence/protocol-mop228-keep-usb-2026-11-25.md)
- MCP Keep/Undo: [FRONTEND_MCP.md](../../../../docs/FRONTEND_MCP.md)
- Card Accept trap: [OCTATRACK_HARDWARE_TRAPS.md](../../../../docs/OCTATRACK_HARDWARE_TRAPS.md)
