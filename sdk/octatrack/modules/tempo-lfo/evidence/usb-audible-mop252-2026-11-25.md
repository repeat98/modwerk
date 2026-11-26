# USB audible TEMPO — MOP-252 Keep-safe Undo WAV A/B (DESKTOP, 25 Nov 2026)

Host tip after #218 park. Keep-safe Undo only on tip twin. **No Accept
this dig.** Catalog **SHUT**. Index **39** locked.

## Keep preflight (flashed)

Base `eb667962…`, **24**, Screen Off + Mute Modes. After Jon’s base
update inventory no longer listed SEQ POS / Micro Timing. Media:
store `media/mop252-tempo-audible-keep/00-keep-before.json`.

## Twin / package

| Field | Value |
| --- | --- |
| Twin | `775d9322d45235d5…` RAM `--dev` |
| `tempo-lfo.mwrm` sha256 | `643b46c3e1b694b4c8d290d240762a1f415005e059f986a3ba790be8326c893c` |
| Tip matched | **Yes** |
| Coexist | PROB…TSTR + Tempo LFO (10) → dial **39** |

## Preflight peeks

| Check | Result |
| --- | --- |
| Dial max | **39** |
| PMTR B | **39** TEMPO |
| after_store | `0x40d2518a` |
| Peek A (PMTR 12) | bpm/words idle (unique 1) |
| Peek B (PMTR 39) | **moved** — bpm unique **19** (`720…7200` BPM24); words unique **19** |
| Store path | `4ef940ac7d8e` (base `mw_lfo_pmtr_store`) |
| Counter gate | **pass** |

## WAV A/B (T1, 6 s, OT WDM-KS 20ch)

| Pair | Peak T1 | First onset |
| --- | --- | --- |
| A stock PMTR 12 | 0.04762 | 17258 |
| B TEMPO PMTR 39 | 0.02964 | 18022 |
| Δ | peak ratio ≈0.62 | **+764 samples** (~17.3 ms @ 44.1 kHz) |

Onset lag crosses the ≥200-sample claim threshold → **audibleProven**.
MAIN A was near-null (T1 isolation); MAIN B carried grid energy — timing
claim uses T1 onset pair under matched PLAY length.

## Undo / leave

Undo → **`[]`**. Twin still on RAM → **ASK JON power-cycle** before tip24
soft judge and before TEMPO Keep Accept (must not Accept on `--dev` twin).

Accept auth for TEMPO Keep was previously recorded this session — Keep
**deferred** until tip24 returns after PC. Catalog still **SHUT**.

## Media

Store `media/mop252-tempo-audible-keep/` — peeks PNGs, WAV A/B (main/t1/hot),
`summary.json`, `99-leave.json`.
