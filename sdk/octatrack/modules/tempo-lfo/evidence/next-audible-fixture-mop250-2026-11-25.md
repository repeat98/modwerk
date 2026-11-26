# Next audible fixture — TEMPO Keep-safe Undo (MOP-250, tip-only)

Host tip after mop205 USB smoke PASS / mop213 static / mop226 catalog-gate
honesty. **Docs only** — no twin boot claimed in this tip, no Accept, no
lifecycle, no `sdk/catalog.json` force-list. Do **not** invent a WAV /
timing delta here. Index **39 TEMPO** stays locked
([allocation](../../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#lfo-pmtr-destination-index-map)).

## Why this note

MOP-205 proved SETUP PMTR=TEMPO + PLAY `tm_bpm_w` / `PROJECT_BPM24` word
motion under coexist MWMS. MOP-213 filled `cycles.static` **624**. MOP-226
restated catalog **SHUT**. **Word publish is not an audible claim.** This
note is the concrete Keep-safe Undo audible protocol for TEMPO (outside
audible queue #1–#9) — preflight peeks, fixture steps, WAV compare plan,
and twin-trap notes — ready for a later USB worker when the unit is free.

Pipeline (SPOS mop245–248 / MT mop230–240 pattern):
**audible Undo → Keep Accept → reboot → cycles.measured → qual → catalog.**
This tip covers **audible Undo readiness only**. Keep Accept needs
**explicit Jon auth** ([protocol](protocol-mop250-keep-usb-2026-11-25.md)) —
AFK must **not** `device_keep`.

## Keep-safe Undo envelope (every TEMPO audible session)

1. **Confirm Keep before twin:** Identify tip24 Keep (or SHA Jon names),
   inventory named count, Screen Off + Mute Modes present, nothing missing.
2. RAM `--dev` Undo twin of tip-matched private `tempo-lfo` package **inside
   a coexist MWMS that includes TEMPO** so dial reaches **39** (alone
   dial-max stays **30** ABI — mop205).
3. **Never** Accept / lifecycle / `device_keep` / `device lifecycle` on the
   twin (accidental Accept wiped Keep — MOP-67, MOP-74).
4. Complete peeks + captures (below), then Undo → inventory `[]`.
5. **ASK JON power-cycle** before the next twin **or** before judging Keep
   soft — restore tip24 companions first.
6. Do **not** `holdTrial` before Undo leave (empties inventory — mop205).

**Twin trap (MOP-76):** a RAM twin without Screen Off makes `UP+NO` look
soft until Keep returns. Soft chord on twin is expected residue, not a
Keep / Mute Modes clash. See
[`docs/OCTATRACK_HARDWARE_TRAPS.md`](../../../../docs/OCTATRACK_HARDWARE_TRAPS.md).

## Preflight peeks (must pass before any energy claim)

Sites match mop205 smoke; do **not** treat them as audible proof.

| Check | Site / counter | Pass rule |
| --- | --- | --- |
| Keep preflight | Identify + inventory | Keep base; named count; Screen Off + Mute Modes; nothing missing |
| Contribute index | SETUP PMTR | Coexist hits **39** (`TEMPO`); alone may still dial-max **30** |
| after_store | `tm_lfo_pmtr.after_store` | non-NULL → `tm_on_store` |
| Words live | `tm_bpm_w` / `wordsPtr` | under PLAY, unique halfword samples move (mop205: T1 unique **16**) |
| Publish BPM | `PROJECT_BPM24` `0x8000181c` | under PLAY, unique samples move (mop205: unique **25**, ≈30–163 BPM) |
| Dirty marks | `tm_dirty[track]` | non-zero while LFO drives that track’s TEMPO word |
| Store ownership | `0x4000d07a` | base `mw_lfo_pmtr_store` only — **no** private dest-store detour |
| Screen Off | warn Jon | twin without Screen Off softs UP+NO until Keep returns (MOP-76) |

If preflight fails, stop — do not compare WAVs or claim tempo motion.

## Candidate fixture (when twin is allowed)

Prefer a **clear rhythm** so BPM motion is heard as grid speed change —
silence-only is insufficient (qualification recipe).

1. Keep-safe inventory check; tip-matched `tempo-lfo` in coexist MWMS
   (PROB…TEMPO or current tip-matched set that still leaves TEMPO
   reachable at dial **39**).
2. T1 = clear even grid (FLEX/STATIC short hit). Set a known project BPM
   with the TEMPO key (e.g. 120) so DEP=0 remains the reference.
3. LFO SETUP → **PMTR = TEMPO**; WAVE TRI or SQR; DEP low vs high (or
   HOLD extremes); TRIG FREE or HOLD. Leave other tracks quiet.
4. Capture under matched PLAY length / LEVEL / track speed:
   - USB MAIN (and T1 channels if available)
   - Still frames: SETUP PMTR=TEMPO, TEMPO key BPM, WAVE/DEP
5. Record peak / envelope / onset-timing / perceived BPM tables honestly for:
   - **A** stock / DEP≈0 (or PMTR away from TEMPO)
   - **B** high DEP / extreme TEMPO window
6. A null or near-null audible delta is a **valid** result — write it; do
   not invent movement. Word peeks already proven in mop205 do not
   substitute.
7. Undo → `[]`. Leave unit for Keep restore (power-cycle if twin softed
   Screen Off).

### WAV compare plan (honest)

| Pair | Intent | Claim rule |
| --- | --- | --- |
| A vs B (same grid, matched length) | Hear / measure grid speed change when TEMPO LFO depth moves | Only after preflight peeks pass |
| Module twin vs stock (no tempo-lfo) | Same pattern + TEMPO key; confirm module path, not menu alone | Separate Undo sessions; never Accept |
| Peak-only MAIN | Useful sanity, **not** enough alone | Timing / BPM colour must be stated honestly; null peaks OK |

Do **not** relabel mop205 `tm_bpm_w` / `PROJECT_BPM24` unique counts as
audible tempo energy.

## What does **not** count

- `tm_bpm_w` / `PROJECT_BPM24` publish alone (already mop205).
- Emulator-only timing / ot_emu without host WAV plan.
- Catalog pin / elemod / Accept / lifecycle / `device_keep`.
- Forcing `sdk/catalog.json` (MOP-226 / mop250 gates still closed).
- Inventing Keep Accept or Proven from this tip.

## Auth / stop for Jon

| Gate | AFK tip | Needs Jon |
| --- | --- | --- |
| Audible Keep-safe Undo USB | Protocol tip-ready | Unit free + twin allowed |
| Keep Accept / `device_keep` | Protocol tip-ready only | **Explicit Accept auth** — do not invent |
| Power-cycle after twin / Keep | Ask note only | Physical PC |
| Catalog pin | **SHUT** | Separate authorization |

## Cross links

- Smoke: [`usb-smoke-mop205-2026-11-25.md`](usb-smoke-mop205-2026-11-25.md)
- Static / qual hooks: mop213 evidence set
- Catalog ceiling: [`catalog-gate-mop250-2026-11-25.md`](catalog-gate-mop250-2026-11-25.md)
- Gates hub: [`publishability-gates-hub-mop250-2026-11-25.md`](publishability-gates-hub-mop250-2026-11-25.md)
- Keep Accept (auth-only): [`protocol-mop250-keep-usb-2026-11-25.md`](protocol-mop250-keep-usb-2026-11-25.md)
- Soft UP+NO: MOP-76 / `docs/OCTATRACK_HARDWARE_TRAPS.md`
- Peer fixture style: `swing-lfo` MOP-103 next-audible plan
