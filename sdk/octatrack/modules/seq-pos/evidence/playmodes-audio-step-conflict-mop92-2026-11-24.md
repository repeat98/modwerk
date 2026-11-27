# Play Modes `0x400a2d6a` conflict — coexistence design (MOP-92, tip-only)

Host tip after #62 / MOP-89. **Docs + verify hygiene only** — no twin boot, no
Accept, no lifecycle, no `sdk/catalog.json` force-list. Do **not** invent an
audible address-mode claim here.

## Why this note

MOP-73 proved SPOS `sp_on_store` arm + Detour `0x400a2d6a` → `sp_audio_step`
under Undo. MOP-83 closed the honest catalog gate: structural proof alone does
**not** publish while Keep Play Modes owns the same tick remap site. The
remaining coexistence design work is naming what a base-owned shared event
must own — not another private Detour stack, and not a forged WAV delta.

## Exact site conflict (stock-identical)

| Claimant | Symbol | Manifest site | Length | stock_guard SHA-256 |
| --- | --- | --- | --- | --- |
| Keep **Play Modes** (`sdk/octabam/modules/playmodes`) | `pm_audio_step` | `0x400a2d6a` | 6 | `1cb5e6a4478a2248b033baac126f63d4930860b767556518139cf5f717c08433` |
| Draft **Seq Pos** (`sdk/drafts/seq-pos`) | `sp_audio_step` | `0x400a2d6a` | 6 | **same** |

Both Detours are `jmp` class over the tick audio pass that loads
`step = 0x800064d0[t]` before `0x4009d1e8(...)`. The remixer / package builder
cannot install both; Keep inventory that already carries Play Modes leaves no
room for a second owner of that span. Seq Pos lists `playmodes` in
`compatibility.conflicts`; Play Modes’ published `conflicts` array stays empty
(catalog module; draft is not offered beside it yet).

`verify.py` now fails if the draft’s guard hash drifts from Play Modes’
published one — the conflict is a machine check, not only prose.

## What coexistence needs (design only)

Prefer a **base-owned** hook (working name `ev_audio_step`, same family as the
LFO PMTR table) in an **owner-reviewed** PR, not a private SPOS→Play Modes
call chain:

1. Base claims `0x400a2d6a` once (stock_guard above) and dispatches a small
   ordered list of optional remappers (Play Modes map, then SPOS address map,
   or the reverse — order is an owner call).
2. Catalog Play Modes and draft Seq Pos drop private Detours at that site;
   each registers a remapper contrib (or equivalent) instead.
3. MIDI tick / rebuild / LED getter sites Play Modes already owns
   (`0x400a39b6`, rebuilds, step getter) stay Play Modes’ until a reviewed
   design extends the event; SPOS 0.1.0 remains audio-tick-only.
4. Re-prove Keep-safe Undo: both packages install, inventory includes Play
   Modes + Seq Pos, `sp_en` still arms, Play Modes modes still map, then Undo
   → `[]`.
5. Only after that (and audible address-mode proof) consider catalog pin.

Stacking a second private Detour, or “SPOS wins when Play Modes is absent”
as the published story without a base event, is **not** coexistence — it is
the current declared conflict.

## Honest next hardware step (when twin is allowed)

Either:

1. Land base `ev_audio_step` (owner-reviewed), tip-match packages, Undo-prove
   dual install; **or**
2. Prove audible address-mode under Undo **without** Play Modes on Keep
   (declared conflict only) — null energy is a valid result; do not invent
   movement.

Warn Jon first: a RAM twin without Screen Off softs UP+NO until Keep returns
(MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`). Undo-only; never lifecycle.

## What this does **not** claim

- No audible SPOS address-mode / playhead remap delta.
- No base `ev_audio_step` implementation in this tip.
- No Accept / catalog pin / elemod / force-list.
- No change to Play Modes published packages or Keep inventory.

## Cross links

- Catalog ceiling: `catalog-gate-mop83-2026-11-24.md`
- Structural Undo proof: Project store `internal/mop73-spos-phas.md`
- Soft UP+NO: MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`
- LFO PMTR peers: `docs/OCTATRACK_LFO_PMTR_EXTENSION.md`
- Smallest base change for SPOS + Play Modes (call ABI / rejoin / orders):
  `base-ev-audio-step-remapper-mop101-2026-11-24.md` (MOP-101)
- PHAS parallel (does **not** join remapper list; fire-time `0x400a2e12`):
  `../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md`
  (MOP-99 / #71)
