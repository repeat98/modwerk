# SPOS jump-colour SLICE/STRT USB protocol tip (MOP-223)

Tip-docs only. Europe/London · 25 November 2026. After
[mop216](jump-colour-deadend-tip-mop216-2026-11-25.md) declared fixture
dead-end class **`shared-Flex-attr-lock`** (LEVEL/filter + PTCH on shared
Flex one-shot exhausted; Flex SAMPLE track-level; mute-isolation never
cleared on mop211), land the **concrete Keep-safe USB protocol** for the
named exit lever: **SLICE** first vs last (or **STRT** min vs max) on a
multi-slice / long sample. Catalog **SHUT**. No Accept / lifecycle /
twin boot / `sdk/catalog.json` force-list. Do **not** invent Proven.

## Verdict

| Question | Answer |
| --- | --- |
| mop216 dead-end class? | **Yes** — `shared-Flex-attr-lock` cited; remapper-colour dead-end **not** reached |
| LEVEL/filter / PTCH / Flex SAMPLE-slot? | **Refuse** — exhausted / unavailable (mop203 / mop211 / mop216) |
| Concrete next USB protocol? | **Yes** — this tip: SLICE first vs last (preferred) or STRT min vs max |
| Clear remapper / firmware fix? | **No** |
| Jump-colour Proven? | **No** — still **Open** |
| Catalog / Accept | **SHUT** / **none** |

## Naming (do not confuse with SLIC)

| Name in this tip | Meaning |
| --- | --- |
| **SLICE** (preferred lever) | First vs last **slice** of a **multi-slice** Flex/Static sample, locked per trig so TRIG1 and TRIG16 play different slice bodies |
| **STRT** (panel / lock slot) | PLAYBACK lock slot **1** on Flex/Static (`ot_spec` PLAYBACK: PTCH, **STRT**, LEN, RATE, RTRG, RTIM). On a sliced sample, STRT selects the slice; on a long unsliced sample, STRT min vs max picks different regions |
| **SLIC** (not this tip) | LFO PMTR dest **32** / `slice-num` module — **out of scope**. Do not boot slice-num or claim SLIC LFO peeks as jump-colour |

Mop216’s “SLICE first vs last” is the engineering intent; the USB worker
locks it through the **STRT** PLAYBACK p-lock (and/or LEN as polish).

## Why this lever (after mop216)

1. Attribute locks on a **shared Flex one-shot** cannot clear mute-isolation
   S0≠S15 (mop203 LEVEL/filter C≈D; mop211 PTCH S0≈S15).
2. Flex **SAMPLE** is track-level — mop209’s SAMPLE-slot-per-trig path is
   unavailable on this machine path.
3. A **multi-slice** (preferred) or **long multi-region** sample can still
   give step 0 and step len−1 **distinct bodies** under stock, without
   inventing per-trig SAMPLE slots.
4. Only then may a USB worker toast-bind SPOS 0/127 and ask colour C/D.

## Required sample (ASK JON — tip cannot invent card contents)

| Pref | Sample on T1 | Why |
| --- | --- | --- |
| **Preferred** | Multi-slice Flex or Static with **clearly distinct** first vs last slices | Slice identity → ZC / spectrum / envelope separation |
| **Fallback** | Long multi-region one-shot / loop where STRT≈min vs STRT≈max (and/or LEN) play different material | Region separation without slices |
| **Refuse** | Short shared one-shot family used on mop201–211 | Already exhausted for attr-lock colour |

If the unit still has only the short one-shot family: **stop**. Write
**Open** (fixture — sample not loaded). Do **not** re-run LEVEL/filter or
PTCH. Do **not** invent a multi-slice load in evidence.

## Stronger fixture (SLICE / STRT bodies)

Goal: step **0** (TRIG1) and step **len−1** (default 16 → TRIG16) must have
**audibly distinct bodies** under stock isolation **before** any SPOS park.
Prefer identity / spectral / onset difference, not loudness alone.

### Required engineering (pick primary; do not fall back to exhausted levers)

| Lever | Step 0 (TRIG1) | Step len−1 (TRIG16) | Why |
| --- | --- | --- | --- |
| **SLICE via STRT** (preferred) | First slice (STRT → slice 0 / low) | Last slice (STRT → last slice / high) | Different slice bodies on same track SAMPLE |
| **STRT region** (fallback) | STRT ≈ min (and/or short LEN at start) | STRT ≈ max (and/or LEN into a later region) | Different regions of a long sample |
| LEVEL / filter / PTCH / SAMPLE-slot | **Refuse** | **Refuse** | Exhausted / unavailable (`shared-Flex-attr-lock`) |

Also: place trigs on **both** extremes; mute or quiet TRIG2–15; keep T1
the only loud track.

Panel path (Keep-safe USB worker): hold **TRIG** → PLAYBACK page → turn
**STRT** (and LEN if needed) for per-trig locks
([OCTATRACK_DRIVING](../../../../docs/OCTATRACK_DRIVING.md);
[playback locks](../../../../docs/module-guides/playback.md)). Prefer
slots/samples already on the unit after Jon loads them — do not invent
card contents.

### Mandatory stock mute-isolation preflight (before SPOS C/D)

Address mode **OFF** (PMTR away from SPOS; `sp_en` clear or toast OFF).
Matched tempo / LEVEL / capture length:

1. Mute all but **TRIG1** → WAV **S0** (T1 + MAIN; HOT sanity only).
2. Mute all but **TRIG16** → WAV **S15**.
3. Gate: require real separation — e.g. envCorr(S0,S15) meaningfully below
   ~0.95 **or** clear peak/rms/zc / slice-identity / onset difference.
4. **Fail** → stop. Re-check sample / STRT locks. Do **not** capture SPOS
   C/D and do **not** invent jump-colour Proven. Write **Open** (fixture
   still non-separating under stock — sample or locks still wrong).
5. **Pass** → proceed to address-mode C/D below.

## Next USB protocol (Keep-safe Undo only)

Pre: **ASK JON** multi-slice / long sample on T1 if needed. **ASK JON
power-cycle** if a twin is still on RAM (MOP-76 Soft UP+NO). Confirm Keep
tip24. Prefer tip-matched coexist MWMS (dial PMTR **37**). Never Accept /
lifecycle / force-list.

1. Engineer SLICE/STRT-distinct TRIG1 vs TRIG16 as above; quiet middles.
2. Twin tip remapper + tip dual (Play Modes + SEQ POS). SETUP PMTR may
   stay off SPOS for parked C/D (FUNC+TRACK parks address).
3. Run **mute-isolation S0 / S15** gate. Abort on fail.
4. Under PLAY, FUNC+track-pad+LEVEL until toast **`T1 SPOS 0`**; peek
   `sp_en[0]`, `sp_pos_w` high≈0, `sp_len[0]` (=16 expected after mop202).
   Capture WAV **C**.
5. Dial to toast **`T1 SPOS 127`**; peek high≈127; capture WAV **D**.
6. Colour gate (T1 body): envCorr C↔D meaningfully below ~0.95 **or**
   clear spectral / slice-identity difference. Peak/rms alone insufficient
   when amplitudes match.
7. Undo → `[]`. ASK JON PC. Catalog stays **SHUT**.

### Outcome classes (honest — do not invent Proven)

| Result | Write as | Meaning |
| --- | --- | --- |
| No multi-region sample on unit | **Open** (fixture) | ASK JON load; do not invent sample |
| S0≈S15 after SLICE/STRT locks | **Open** (fixture) | Bodies still not engineered; retry sample/locks — **not** a return to LEVEL/PTCH |
| S0≠S15, C≠D under toast+len | jump-colour **Proven** only if gates pass | Later USB may claim; **not** this tip |
| S0≠S15, C≈D with toast+len OK | **Open** — mop209 remapper-colour **dead-end** class | Remapper parks extremes but colour does not follow distinct stock bodies; still no Proven / no catalog pin |
| Toast / len / remapper fail | **Open** (infra) | Fix that first; not jump-colour colour |
| Re-run LEVEL/filter or PTCH only | **Refuse** | `shared-Flex-attr-lock` exhausted (mop216) |

A dead-end class still leaves catalog **SHUT**. Owner decides whether to
waive the colour gate or park the draft; this tip does not waive.

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept.
- A firmware behaviour change (no `unit.s` edit).
- That mop211 remapper, dial-max, or `sp_len` failed.
- That SLICE/STRT locks or a multi-slice sample were run on hardware this
  pass (Jon AFK / no USB; tip only).
- That the mute-isolation gate already passed.
- Any SLIC / `slice-num` LFO claim.

USB consumer: [mop219](usb-jump-colour-open-mop219-2026-11-25.md) ran this
protocol → S0≈S15 Open (fixture); class `slice-strt-mute-isolation` —
**consumed**. Do **not** re-queue the same STRT recipe as a new dig without
an owner-authorized distinct sample / new named protocol (see mop227).

## Cross links

- Dead-end tip: [`jump-colour-deadend-tip-mop216-2026-11-25.md`](jump-colour-deadend-tip-mop216-2026-11-25.md)
- Prior SAMPLE/PTCH tip: [`jump-colour-fixture-tip-mop209-2026-11-25.md`](jump-colour-fixture-tip-mop209-2026-11-25.md)
- PTCH mute-isolation fail: [`usb-jump-colour-open-mop211-2026-11-25.md`](usb-jump-colour-open-mop211-2026-11-25.md)
- USB consumer Open: [`usb-jump-colour-open-mop219-2026-11-25.md`](usb-jump-colour-open-mop219-2026-11-25.md)
- Toast+len OK / C≈D: [`usb-jump-colour-open-mop203-2026-11-25.md`](usb-jump-colour-open-mop203-2026-11-25.md)
- Audible fixture base: [`next-audible-fixture-mop110-2026-11-24.md`](next-audible-fixture-mop110-2026-11-24.md)
- Gate: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- Hub: [MOP-223](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-jump-colour-slice-fixture-tip-mop-223)
- Current hub honesty: [MOP-242](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-mt-resume-mop-242)
