# Smallest base `ev_audio_step` remapper — SPOS + Play Modes (MOP-101, tip-only)

Host tip after #71 / MOP-99 and #68 / MOP-92. **Docs only** — no twin boot, no
Accept, no lifecycle, no `sdk/catalog.json` force-list. Do **not** invent an
audible address-mode claim here. Leaves MOP-100 USB queue and MOP-98 twin alone.

## Scope

**SPOS + Keep Play Modes coexistence only.** PHAS does **not** join this
remapper list (MOP-99 / #71 merge `01df4136b`): fire-time
`0x400a2e12` → `po_fire`, not tick remap `0x400a2d6a`. See
[`../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md`](../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md).

## Gap after MOP-92

MOP-92
([`playmodes-audio-step-conflict-mop92-2026-11-24.md`](playmodes-audio-step-conflict-mop92-2026-11-24.md))
prefers a base-owned remapper list over private Detour stacks. It names the
site and the migration goals; it does **not** pin event kind, handler ABI,
rejoin, or dispatch semantics. This note is the smallest concrete base change
so a later **owner-reviewed** implementation PR does not re-derive them.

## Smallest base change (one new call event)

Mirror `ev_play_increment` (`runtime_events.s` site `0x40004100`): one base
Detour, ordered subscribers, mutate-in-place, optional take.

| Field | Choice |
| --- | --- |
| Event name | `ev_audio_step` |
| Kind | **`call`** (not `take`, not table) |
| Site | `0x400a2d6a` length 6 |
| stock_guard | `1cb5e6a4478a2248b033baac126f63d4930860b767556518139cf5f717c08433` (Play Modes / SPOS today) |
| Rejoin | `0x400a2d74` (past stock `mvzb`; same as `pm_audio_step` / `sp_audio_step`) |
| Prototype | `int f(unsigned *step, unsigned track)` |
| Semantics | Base loads stock `step = 0x800064d0[track]` (track in `d5`); walks subscribers in `(order, module id)`; each may mutate `*step`; **nonzero return takes** (skip later handlers, same as play_increment); base leaves final step in `d0` and `jmp 0x400a2d74` |
| Room | small (4–8); two known remappers suffice for v1 |
| Registry | `events.json` + regenerate `EVENTS.md` / `runtime_events.*` index (next free after `ot_lfo_pmtr_dest`) — **owner PR only** |

### Why `call`, not `take` or table

- **Not `take`:** coexistence needs Play Modes **and** Seq Pos when both are
  installed; take would give the site to one subscriber only.
- **Not table:** remappers need the live track+step on the audio tick; the
  loader’s subscribe list already is the ordered remapper list (no second
  contrib table).
- **`call` + mutate:** matches `ev_play_increment` and today’s Detour bodies
  (`pm_step_entry` / `sp_map`) without a private Detour stack.

### Recommended subscriber orders (owner may flip)

| Module | Order | Handler role | Return |
| --- | --- | --- | --- |
| Keep **Play Modes** | 40 | Mode map of the raw (or prior) step | 0 (chain) |
| Draft **Seq Pos** | 50 | When `sp_en[t]`, address remap via `sp_map` | 0 (chain) |

Play Modes first, then SPOS, so address-mode modulates the play-mode-mapped
step. Nonzero take is reserved for a future exclusive remapper; v1 remappers
return 0. MIDI tick / rebuild / LED getter sites Play Modes already owns stay
Play Modes’ private Detours until a reviewed extension — SPOS 0.1.0 remains
audio-tick-only (unchanged from MOP-92).

### Base stub (conceptual only — not in this tip)

```
modwerk_site_400a2d6a:
        lea     0x800064d0,%a0
        mvz.b   %a0@(0,%d5:l),%d0      | stock step
        | frame + call chain like ev_play_increment:
        |   pea track(d5); pea &step; jsr handlers…
        | d0 := final *step
        jmp     0x400a2d74
```

Do **not** invent other addresses. Stock_guard must match the published Play
Modes hash; `seq-pos/verify.py` already fails if that hash drifts (MOP-92).

## Module migration (same owner PR or immediate follow-up)

1. **Base** claims `0x400a2d6a` once; packages that patch it are refused (loader
   rule 4), same as other base-owned sites.
2. **Play Modes** drops Detour → `pm_audio_step`; subscribes
   `{"event":"ev_audio_step","fn":…,"order":40}` whose body is today’s
   `pm_step_entry` path (no site claim).
3. **Seq Pos** drops Detour → `sp_audio_step`; subscribes order 50 with today’s
   `sp_map` when `sp_en` (else leave `*step`).
4. Drop `playmodes` from Seq Pos `compatibility.conflicts` only after Keep-safe
   Undo proves dual install (inventory includes both; both remappers arm; Undo
   → `[]`).
5. Only after that **and** audible address-mode proof consider catalog pin —
   still **no** force-list.

Stacking a second private Detour, or “SPOS wins when Play Modes is absent”
without the base event, remains **not** coexistence (MOP-92).

## Honest next hardware step (when twin is allowed)

1. Land base `ev_audio_step` (owner-reviewed), tip-match packages, Undo-prove
   dual Play Modes + SPOS install; **or**
2. Prove audible address-mode under Undo **without** Play Modes on Keep
   (declared conflict only) — null energy is a valid result.

Warn Jon first: RAM twin without Screen Off softs UP+NO until Keep returns
(MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`). Undo-only; never lifecycle.

## What this does **not** claim

- No base / Play Modes / Seq Pos behaviour change in this tip.
- No audible SPOS address-mode / playhead remap delta.
- No PHAS registration on `ev_audio_step` (MOP-99).
- No Accept / catalog pin / elemod / force-list.
- No MOP-100 USB queue / MOP-98 twin work.

## Cross links

- MOP-92 coexistence preference:
  [`playmodes-audio-step-conflict-mop92-2026-11-24.md`](playmodes-audio-step-conflict-mop92-2026-11-24.md)
- MOP-99 PHAS stays off remapper list (#71):
  [`../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md`](../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Structural Undo: Project store `internal/mop73-spos-phas.md`
- Call-event precedent: `sdk/machines/octatrack/elekloader/runtime_events.s`
  (`ev_play_increment`)
- LFO PMTR peers: `docs/OCTATRACK_LFO_PMTR_EXTENSION.md`
