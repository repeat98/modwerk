# Next audible fixture plan — SPOS Keep-safe Undo (MOP-110, tip-only)

Host tip after #73 / MOP-100 (queue) and #75 / MOP-102 (`ev_audio_step` on
main). **Docs only** — no twin boot, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent a WAV / USB peak or
address-mode delta here. Leave other audible-prep siblings alone (SWING /
TSPD / SLIC / … tips and mop98 twin).

## Why this note

MOP-73 proved contribute `after_store` → `sp_on_store` arms `sp_en[track]`
and remaps the tick audio step when address mode is on (words unique **11**,
after_store calls **15853** under PLAY; Detour then at `0x400a2d6a`).
MOP-83 closed the honest catalog gate: **arm + remap peeks are not an
audible claim**. MOP-92 / MOP-101 / MOP-102 landed the Play Modes coexistence
path: base owns `0x400a2d6a` as `ev_audio_step` (Play Modes order 40 → SPOS
order 50). MOP-100 places **SPOS as lever #8** in the ordered Keep-safe Undo
audible queue. This note is the concrete first-audible protocol for that
lever — remapper-aware preflight peeks, fixture steps, WAV compare plan, and
Screen Off / twin-trap notes — ready for a later USB worker.

## Ordered queue context

Shared queue (do not reorder this tip):
[`docs/OCTATRACK_LFO_PMTR_EXTENSION.md#audible-usb-queue-after-store-wire-tip-mop-100`](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#audible-usb-queue-after-store-wire-tip-mop-100).

Catalog ceiling (still closed):
[`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md).

Remapper lineage (link only — already on main):

- Conflict: [`playmodes-audio-step-conflict-mop92-2026-11-24.md`](playmodes-audio-step-conflict-mop92-2026-11-24.md)
- Design: [`base-ev-audio-step-remapper-mop101-2026-11-24.md`](base-ev-audio-step-remapper-mop101-2026-11-24.md)
- Impl: [`base-ev-audio-step-impl-mop102-2026-11-24.md`](base-ev-audio-step-impl-mop102-2026-11-24.md)

Peer tip style (SWING lever #1):
[`swing-lfo` MOP-103 fixture](../../swing-lfo/evidence/next-audible-fixture-mop103-2026-11-24.md).

## Keep-safe Undo envelope (every SPOS audible session)

Run **one** lever per twin session. **Prefer tip-matched coexist MWMS**
(nine-draft mop71 set) so SETUP dial can reach PMTR **37** — alone
`seq-pos` dial-maxes at **30** while the record stays at **37**
(same count = 30+N ABI that blocked SWING dest 33 / TSPD dest 34 /
SLIC dest 32;
[`../../swing-lfo/evidence/dial-max-diagnosis-mop122-2026-11-24.md`](../../swing-lfo/evidence/dial-max-diagnosis-mop122-2026-11-24.md);
MOP-68). Executable after-PHAS sheet:
[`docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133`](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133).
Still exercise **only** the SPOS destination under PLAY (Play Modes may be
present for remapper coexistence peeks — see below).

1. **Confirm Keep before twin:** Identify base is Keep (not a twin digest),
   inventory **24**, Screen Off + Mute Modes present, nothing missing.
2. RAM `--dev` Undo twin of the tip-matched coexist MWMS (or alone package
   only if dial already reaches 37) — tip-matched base that already owns
   `ev_audio_step` (after #75 / MOP-102).
3. **Never** Accept / lifecycle / `device lifecycle` on the twin
   (accidental Accept wiped Keep — MOP-67, MOP-74).
4. Complete peeks + captures (below), then Undo → inventory `[]`.
5. **ASK JON power-cycle** before the next twin **or** before judging Keep
   soft — restore tip24 Screen Off / Mute Modes first.

**Twin trap (MOP-76):** a RAM twin without Screen Off makes `UP+NO` look
soft until Keep returns. Soft chord on twin is expected residue, not a
Keep / Mute Modes clash. See
[`docs/OCTATRACK_HARDWARE_TRAPS.md`](../../../../docs/OCTATRACK_HARDWARE_TRAPS.md).

## Preflight peeks (must pass before any energy claim)

On tip-matched private package, RAM `--dev` Undo twin (never lifecycle).
Sites match MOP-73 Undo publish + MOP-102 remapper ownership; do not treat
them as audible proof.

| Check | Site / counter | Pass rule |
| --- | --- | --- |
| Keep preflight | Identify + inventory | Keep base; **24**; Screen Off + Mute Modes; nothing missing |
| Contribute index | SETUP PMTR | Coexist hits **37** (`SPOS` glyph); alone may still dial-max 30 ([MOP-122 why](../../swing-lfo/evidence/dial-max-diagnosis-mop122-2026-11-24.md); MOP-68; [MOP-133 trial](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#queue-8-undo-trial-spos-after-phas-tip-mop-133)) |
| after_store | `sp_lfo_pmtr.after_store` | non-NULL → `sp_on_store` |
| Words live | `sp_pos_w` / `wordsPtr` | under PLAY, unique halfword samples move (MOP-73: **11**) |
| Enable arm | `sp_en[track]` | non-zero while LFO targets that track’s SPOS (MOP-73: track 0 armed) |
| Remapper site | `0x400a2d6a` | base `ev_audio_step` owns site — **no** private Detour when tip-matched base is Keep |
| Remapper coexist (optional dual) | Play Modes order 40 + SPOS order 50 | Both subscribe; both return 0 to chain; Undo dual-install inventory includes both; standalone Play Modes Detour package refused on site-owning base (loader rule 4). Full dual-install Keep proof tip: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md) (MOP-166; **not** run; mop157 used package Detour bytes) |
| Remapper alone (declared conflict) | SPOS without Play Modes | Address remap via `sp_ev_audio_step` / `sp_map` when `sp_en`; honest if Play Modes absent on Keep |
| Store ownership | `0x4000d07a` | base `mw_lfo_pmtr_store` only — **no** private dest-store detour |
| Screen Off | warn Jon | twin without Screen Off softs UP+NO until Keep returns (MOP-76) |

If preflight fails, stop — do not compare WAVs or claim address-mode energy.

Optional dbg (twin-diagnostic only, not a publish gate): base
`mw_lfo_dbg` after_store call count advancing under PLAY (MOP-73 saw
~15.9k after SPOS pass).

## Candidate fixture (when twin is allowed)

Prefer a **single-track pattern with clearly distinct steps** where
changing SPOS is heard as a jump to a different step body vs the stock
marching playhead — not a mute gate and not a PROB drop counter.
**LEVEL/filter** (mop203) and **PTCH** extremes on shared Flex one-shot
(mop211 S0≈S15) are **exhausted**; Flex SAMPLE is track-level — see
dead-end tip
[`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
(`shared-Flex-attr-lock`). Next USB lever: **SLICE** first vs last (or
**STRT** min vs max) on a multi-slice / long sample, then mute-isolation
S0≠S15 **before** toast-bound C/D (`sp_len` peek) — full protocol
[`jump-colour-slice-fixture-tip-mop223-2026-11-25.md`](jump-colour-slice-fixture-tip-mop223-2026-11-25.md).
Do not re-run LEVEL/filter or PTCH-only recipes — see also
[`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
(+ [`jump-colour-tip-dig-mop200-2026-11-25.md`](jump-colour-tip-dig-mop200-2026-11-25.md)).

1. Keep-safe inventory check; tip-matched `seq-pos` package only (or MWMS
   that still leaves SPOS as the exercised lever). For coexistence peeks,
   include Keep Play Modes only when the tip-matched packages subscribe
   `ev_audio_step` (order 40/50) — not a Detour stack.
2. T1 = clear multi-step grid (FLEX or STATIC with short non-continuous
   samples if RECORDING1 densifies like PROB mop75–85). Leave address mode
   **off** for reference A; enable via LFO → SPOS or FUNC+TRACK+LEVEL for B.
3. LFO SETUP → **PMTR = SPOS**; WAVE TRI or SQR; DEP low vs high (or HOLD
   extremes); TRIG FREE or HOLD. Leave other tracks quiet.
4. Capture under matched PLAY length / LEVEL / tempo / track speed:
   - USB MAIN (and T1 channels if available)
   - Still frames: SETUP PMTR=SPOS, FUNC+TRACK toast / enable, WAVE/DEP
5. Record peak / envelope / onset tables honestly for:
   - **A** stock playhead / DEP≈0 / address mode OFF (or PMTR away from SPOS)
   - **B** high DEP / extreme SPOS window (address mode ON)
6. A null or near-null audible delta is a **valid** result — write it; do
   not invent movement. Arm / words / remapper peeks already proven in
   MOP-73 / MOP-102 do not substitute.
7. Undo → `[]`. Leave unit for Keep restore (power-cycle if twin softed
   Screen Off).

### WAV compare plan (honest)

| Pair | Intent | Claim rule |
| --- | --- | --- |
| A vs B (same pattern, matched length) | Hear / measure which step body plays when SPOS LFO depth moves | Only after preflight peeks pass |
| Module twin vs stock (no seq-pos) | Same pattern; confirm module path, not panel LEVEL alone | Separate Undo sessions; never Accept |
| Alone vs coexist (Play Modes + SPOS on `ev_audio_step`) | Same SPOS fixture; confirm remapper chain does not mute address-mode | Separate Undo sessions; tip-matched base + packages |
| Peak-only MAIN | Useful sanity, **not** enough alone | Address-mode colour must be stated honestly; null peaks OK |

Do **not** relabel PROB drop counters, PHAS bias counters, SWING groove
lag, SLIC slice bytes, or MOP-73 `sp_pos_w` / `sp_en` peeks as audible
address-mode energy.

## What does **not** count

- `sp_pos_w` / `sp_en` / after_store arm alone (already MOP-73).
- Base `ev_audio_step` assemble / subscribe alone (already MOP-102).
- Emulator-only step remap.
- Catalog pin / elemod / Accept / lifecycle.
- Forcing `sdk/catalog.json` (MOP-83 still closed).
- Writing other audible-prep sibling tips, or running mop98 twin, in this
  pass.

## Cross links

- Queue: MOP-100 audible USB queue (SPOS lever #8)
- Catalog ceiling: `catalog-gate-mop83-2026-11-24.md`
- Conflict / design / impl: MOP-92 · MOP-101 · MOP-102 evidence notes
- Structural Undo: Project store `internal/mop73-spos-phas.md`
- Soft UP+NO: MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`
- Peer fixture style: `swing-lfo` MOP-103 next-audible plan
