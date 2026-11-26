# Play Modes Detours → `runtime.json` (MOP-183, tip-only — honest stall)

Tip-only. Goal: move Keep Play Modes' SPOS-conflicting audio-step Detour
onto the module's own `runtime.json` (Mute Modes / Repitch pattern).
**No USB twin, no Accept, no lifecycle, no `sdk/catalog.json` force-list.**

## Verdict

| Question | Answer |
| --- | --- |
| Landed `runtime.json` on Play Modes tip? | **No** — blocked |
| Blocker | `modules:check` treats `hooks.s` / `runtime.json` as a **code** change; Play Modes needs a **greater** version than `0.2.0-experimental`, OT UI `moduleVersion` sync, and an owner `sdk/playmodes-build-approval.json` bound to that exact version + `sourceSha256` (`owner-approved-update`). Tip cannot invent owner approval. |
| Useful tip landed? | **Yes** — exact migration recipe below + remaining-gate honesty (mop181 stress **Proven REACHED**) |
| Catalog force-list? | **No** (`sdk/catalog.json` untouched; seq-pos absent) |

## Current state (unchanged on tip)

| Piece | State |
| --- | --- |
| Keep USB / tip remapper | machine-ports subscribe order **40** + `callWrappers` → `pm_ev_audio_step` via `pm_step_entry` (MOP-102) |
| Published standalone `.mwrm` | **0.1.1-experimental** still **Detours** `pm_audio_step` @ `0x400a2d6a` (`lagsBehind` 0.2.0 / #764) |
| Draft Seq Pos | `runtime.json` order **50** already (MOP-102) |
| MIDI / rebuild / LED / project / memcpy | Stay Play Modes' own Detours (mop102 scope) — **do not invent** migrations |

## Exact migration recipe (for owner-approved follow-up)

Cite only existing evidence: [MOP-102](base-ev-audio-step-impl-mop102-2026-11-24.md),
[MOP-101](base-ev-audio-step-remapper-mop101-2026-11-24.md),
[MOP-92](playmodes-audio-step-conflict-mop92-2026-11-24.md),
Mute Modes / Repitch `runtime.json` + `MODWERK_EVENTS` handlers.

1. Add `sdk/octabam/modules/playmodes/runtime.json`:

```json
{
  "schema": 1,
  "subscribe": [
    {
      "event": "ev_audio_step",
      "fn": "pm_ev_audio_step",
      "order": 40,
      "replaces": "pm_audio_step"
    }
  ]
}
```

2. Under `MODWERK_EVENTS` in `hooks.s` (sync into `playmodes.s` hooks tail),
   add `pm_ev_audio_step` with the **exact** MOP-102 `callWrappers`
   `step_ptr_track` body via `pm_step_entry` (store mapped step; return 0).
   Native assemble without `MODWERK_EVENTS` stays byte-identical for the
   Detour path.

3. Remove the Play Modes entry's `subscribe` + `callWrappers` from
   `machine-ports.json` (or the whole port once `runtime.json` owns the
   subscribe) so declaration does not dual-subscribe.

4. Update `events.json` subscriber evidence; `python3 -B
   sdk/machines/octatrack/events.py --write`.

5. Bump Play Modes to a new experimental version; changelog; OT UI
   `moduleVersion`; `lagsBehind` on the published 0.1.1 package; **owner**
   `sdk/playmodes-build-approval.json` for that version + source SHA
   (or full qualification). Rebuild standalone `.mwrm` + USB verify.

Tip probe (then reverted): `ported(playmodes)` would drop
`pm_audio_step` (36 → 35 detours); `modules:compat` stayed 0 problems
with the wire in place — gate failure was **qualification / owner
approval**, not compat.

## Gate after this pass

| Gate | Status |
| --- | --- |
| Standalone Play Modes Detours → `runtime.json` | **Stalled** — tip recipe ready; needs owner-approved Play Modes version + package rebuild / USB |
| Dual-install words-move peek | **Proven** (mop184; T1 unique **33**)
| mop181 stress | **Proven REACHED** (62 s; no Part) |
| `sdk/catalog.json` | **Must stay absent** |
