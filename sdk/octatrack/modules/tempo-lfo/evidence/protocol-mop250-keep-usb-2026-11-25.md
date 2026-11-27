# Keep of Tempo LFO — USB protocol (MOP-250 tip)

Tip-only sheet. Catalog **SHUT**. **Do not run** during Keep-safe Undo
AFK digs. **Do not** invent Proven. Execute only after Jon explicitly
authorizes an Accept / `device_keep` session for this package.

Prior behavioural digs (Undo-only) are **PASS** where cited and are
**not** Keep: mop205 USB smoke (SETUP TEMPO + words/BPM24). Audible WAV
is still **Open** ([fixture](next-audible-fixture-mop250-2026-11-25.md)).
Keep tip24 restore after Undo digs is **not** Keep of Tempo LFO.

## Why this sheet exists

Catalog stays closed while **Keep of Tempo LFO** is **Open**. FRONTEND_MCP
already defines review → trial → self-test → `device_keep` vs
`device_undo`. HARDWARE_TRAPS already warns that Accept on an empty
`--dev` twin can rewrite the card set. Micro Timing mop228→229→230 and
Seq Pos mop244→245→247 showed the same envelope (tip protocol → Open
abort without auth → PASS only after Jon Accept → reboot). This sheet
binds those published rules to Tempo LFO **without inventing that Keep
already ran** and **without inventing Accept authorization**.

**Accept auth (25 Nov 2026 Europe/London):** Jon authorized Accept /
`device_keep` for **TEMPO Keep only**. Keep inventory **PASS**
([mop253](usb-hw-mop253-keep-2026-11-25.md)); reboot persistence **PASS**
([mop254](usb-hw-mop254-reboot-2026-11-25.md)). Never use `device lifecycle`
accident paths. Do **not** invent catalog from Keep alone.

## Envelope (authorized Keep session only)

| Check | Rule |
| --- | --- |
| Jon authorization | Explicit Accept/Keep for Tempo LFO — not implied by AFK Undo dig, mop205 smoke, mop250 tip, or tip24 idle |
| Tip package | Rebuild tip-matched private package from exact tip under test (mop205 smoke used `643b46c3…` / 500 B — re-hash after tip moves) |
| Self-test | Actual passed device self-test on the trial — required before Keep |
| Accept path | Explicit `device_keep` only — never `device lifecycle` accident |
| Catalog / Proven invent | **SHUT** / none |

## Keep tip24 vs Keep of Tempo LFO

| Concept | Meaning |
| --- | --- |
| Keep tip24 | Production base `eb667962…` (or SHA Jon names), Screen Off + Mute Modes — restore via power-cycle after Undo digs |
| Keep of Tempo LFO | Card set **retains** the tip-matched Tempo LFO package after an explicit Keep of a reviewed trial |

Confusing the two forges Proven. mop205 Undo left tip24 path intact and
did **not** Keep Tempo LFO.

## Ordered steps (when authorized)

1. **Preflight with Jon.** Confirm which card inventory must survive
   (tip24 companions vs intentional empty / replacement). Do not invent
   a companion allowlist. Record the named baseline.
2. **Tip-matched package.** Build or reuse the exact tip commit package;
   record digest + byte length in evidence.
3. **`device_review`** of the module set that includes Tempo LFO (and only
   the companions Jon named). Prefer coexist so SETUP can hit PMTR **39**.
4. **`device_trial`** within the review window; require **actual** passed
   self-test. Mid-trial LCD may show TEMPO / PMTR 39 (already smoke-PASS
   on Undo twins — do not re-claim as Keep).
5. **Explicit `device_keep`.** Use the trial token; refuse if identity
   changed. Do **not** call lifecycle Accept helpers.
6. **Inventory after Keep.** Confirm Tempo LFO is present on the saved
   set. Record before/after inventory host-local (never commit Keep dumps).
7. **Physical reboot persistence** (separate check). Power-cycle; confirm
   Tempo LFO still present. Emulator / Undo dig ≠ reboot Keep.
8. **Evidence.** Write `usb-hw-*-keep-*.md` + frames under `media/` with
   provenance. Catalog pin stays **SHUT** until audible / measured /
   pin-bound qual also clear
   ([gates hub](publishability-gates-hub-mop250-2026-11-25.md)).

## Abort / honest miss

| Condition | Action |
| --- | --- |
| No Jon Accept auth | **Stop** — tip-ready only; leave Open |
| Self-test fail | Undo; do not Keep; write miss |
| Identity drift mid-trial | Abort; do not Keep |
| AFK temptation | Prefer Undo leave → `[]` + ASK JON PC |

## Cross links

- Audible Undo fixture: [`next-audible-fixture-mop250-2026-11-25.md`](next-audible-fixture-mop250-2026-11-25.md)
- Gates hub: [`publishability-gates-hub-mop250-2026-11-25.md`](publishability-gates-hub-mop250-2026-11-25.md)
- Catalog ceiling: [`catalog-gate-mop250-2026-11-25.md`](catalog-gate-mop250-2026-11-25.md)
- Pattern: MT mop228 / SPOS mop244 Keep USB protocols
