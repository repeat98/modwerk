# SPOS jump-colour stronger fixture tip (MOP-209)

Tip-docs only. Europe/London · 25 November 2026. After
[mop203](usb-jump-colour-open-mop203-2026-11-25.md) USB left jump-colour
**Open** (`sp_len=16` + toast 0/127 bound; WAV C≈D envCorr **0.99969**;
remapper OK). Catalog **SHUT**. No Accept / lifecycle / twin boot /
`sdk/catalog.json` force-list. Do **not** invent Proven.

## Verdict

| Question | Answer |
| --- | --- |
| mop203 blockers cleared? | **Yes** — `sp_len[0]=16`, toast 0/127 both bound, tip remapper |
| LEVEL/filter lock fixture? | **Exhausted** — mop201 + mop203 C≈D (peakΔ≈0) on same sample family |
| Clear remapper / firmware fix? | **No** — tip remapper Proven; words/toast/len OK |
| Stronger next USB path? | **Yes** — SAMPLE-slot or extreme PTCH bodies + stock mute-isolation preflight |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Why mop203 C≈D is not a remapper miss

mop203 tip twin tip-matched remapper `4ef940ac7942` + tip dual; toast-bound
highs **0** / **127**; peek `sp_len[t]=16`. Scaling at extremes is distinct
(`sp_map`: 0 → step 0, 127 → step 15 under len 16). Fixture used TRIG1
LEVEL↓/filter↓ vs TRIG16 LEVEL↑/filter↑ on the **same** one-shot family.
T1 peak C≈D ≈0.0476 (peakΔ≈0; envCorr **0.99969**). That is
**amplitude/sample non-separation**, not a missing remapper or toast miss.

LEVEL/filter-only engineering is therefore **exhausted** for this gate.
Do not re-run the same LEVEL/filter recipe and call it a new dig.

## Stronger fixture (sample / PTCH bodies)

Goal: step **0** and step **len−1** (default 16 → step 15) must have
**audibly distinct bodies** under stock isolation **before** any SPOS
park. Prefer identity/spectral difference, not loudness alone.

### Required engineering (pick at least one primary)

| Lever | Step 0 (TRIG1) | Step len−1 (TRIG16) | Why |
| --- | --- | --- | --- |
| **SAMPLE slot lock** (preferred) | Short click / kick (FLEX or STATIC slot A) | Contrasting hat / long tone / different slot B | Changes sample identity → ZC / spectrum / envelope shape |
| **PTCH lock** (fallback / add-on) | PTCH ≈ −24 | PTCH ≈ +24 | Shifts pitch → ZC / spectral separation when sample shared |
| LEVEL / filter | Optional polish only | Optional polish only | **Not** sufficient alone (mop203) |

Also: place trigs on **both** extremes; mute or quiet TRIG2–15 so stock
march is not a third loud body; keep T1 the only loud track.

Panel path (Keep-safe USB worker): hold TRIG → SRC / PLAYBACK knobs for
sample or PTCH locks ([OCTATRACK_DRIVING](../../../../docs/OCTATRACK_DRIVING.md)
sample / key steps). Prefer existing project slots already on the unit —
do not invent card contents in evidence.

### Mandatory stock mute-isolation preflight (before SPOS C/D)

Address mode **OFF** (PMTR away from SPOS; `sp_en` clear or toast OFF).
Matched tempo / LEVEL / capture length:

1. Mute all but **TRIG1** → WAV **S0** (T1 + MAIN; HOT sanity only).
2. Mute all but **TRIG16** → WAV **S15**.
3. Gate: require real separation — e.g. envCorr(S0,S15) meaningfully below
   ~0.95 **or** clear peak/rms/zc / sample-identity difference.
4. **Fail** → stop. Re-engineer samples/PTCH. Do **not** capture SPOS C/D
   and do **not** invent jump-colour Proven. Write **Open** (fixture still
   non-separating under stock).
5. **Pass** → proceed to address-mode C/D below.

This preflight answers: “do the two addressed steps even sound different
under stock?” mop203 skipped it and measured C≈D on non-separating bodies.

## Next USB protocol (Keep-safe Undo only)

Pre: **ASK JON power-cycle** if a twin is still on RAM (MOP-76 Soft
UP+NO). Confirm Keep tip24. Prefer tip-matched coexist MWMS (dial PMTR
**37**). Never Accept / lifecycle / force-list.

1. Engineer SAMPLE/PTCH-distinct TRIG1 vs TRIG16 as above; quiet middles.
2. Twin tip remapper + tip dual (Play Modes + SEQ POS). SETUP PMTR may
   stay off SPOS for parked C/D (FUNC+TRACK parks address).
3. Run **mute-isolation S0 / S15** gate. Abort on fail.
4. Under PLAY, FUNC+track-pad+LEVEL until toast **`T1 SPOS 0`**; peek
   `sp_en[0]`, `sp_pos_w` high≈0, `sp_len[0]` (=16 expected after mop202).
   Capture WAV **C**.
5. Dial to toast **`T1 SPOS 127`**; peek high≈127; capture WAV **D**.
6. Colour gate (T1 body): envCorr C↔D meaningfully below ~0.95 **or**
   clear spectral / sample-identity difference. Peak/rms alone insufficient
   when amplitudes match.
7. Undo → `[]`. ASK JON PC. Catalog stays **SHUT**.

### Outcome classes (honest — do not invent Proven)

| Result | Write as | Meaning |
| --- | --- | --- |
| S0≈S15 under stock | **Open** (fixture) | Bodies still not engineered; retry samples/PTCH |
| S0≠S15, C≠D under toast+len | jump-colour **Proven** only if gates pass | Later USB may claim; **not** this tip |
| S0≠S15, C≈D with toast+len OK | **Open** — candidate **dead-end** | Remapper parks extremes but colour does not follow distinct stock bodies; document that class; still no Proven / no catalog pin |
| Toast / len / remapper fail | **Open** (infra) | Fix that first; not jump-colour colour |

A dead-end class still leaves catalog **SHUT**. Owner decides whether to
waive the colour gate or park the draft; this tip does not waive.

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept.
- A firmware behaviour change (no `unit.s` edit).
- That mop203 remapper, toast, or `sp_len` failed.
- That SAMPLE/PTCH locks were run on hardware this pass.
- That the mute-isolation gate already passed.

USB consumer: [mop211](usb-jump-colour-open-mop211-2026-11-25.md) (PTCH;
S0≈S15 → abort C/D). Dead-end tip after that fail:
[mop216](jump-colour-deadend-tip-mop216-2026-11-25.md)
(`shared-Flex-attr-lock`; SLICE/STRT exit). SLICE/STRT protocol tip:
[mop223](jump-colour-slice-fixture-tip-mop223-2026-11-25.md).

## Cross links

- USB Open (toast+len OK, C≈D): [`usb-jump-colour-open-mop203-2026-11-25.md`](usb-jump-colour-open-mop203-2026-11-25.md)
- `sp_len` init: [`sp-len-init-tip-mop202-2026-11-25.md`](sp-len-init-tip-mop202-2026-11-25.md)
- Prior fixture Open (`sp_len=0`): [`usb-jump-colour-open-mop201-2026-11-25.md`](usb-jump-colour-open-mop201-2026-11-25.md)
- Tip dig: [`jump-colour-tip-dig-mop200-2026-11-25.md`](jump-colour-tip-dig-mop200-2026-11-25.md)
- Audible fixture base: [`next-audible-fixture-mop110-2026-11-24.md`](next-audible-fixture-mop110-2026-11-24.md)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-209](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-stronger-fixture-tip-mop-209)
- Dead-end: [MOP-216](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-fixture-deadend-tip-mop-216)
- Current: [MOP-223](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-slice-fixture-tip-mop-223)
