# Tempo LFO — site plan (OS 1.40C)

Measured facts below come from published octabam REPITCH sources and the
sibling LFO-PMTR drafts. Spans that need a local OS extraction are marked
**fill**. Run:

```sh
python3 sdk/drafts/tempo-lfo/fill_guards.py --os ~/path/to/section_3_MAIN_OS.bin
```

for reference hashes only — this tip does **not** Detour lea/store.

## Behaviour

| Piece | Mechanism |
| --- | --- |
| Project tempo | Stock longword `PROJECT_BPM24` at `0x8000181c` (BPM × 24; 720…7200) |
| LFO mapping | PMTR index **39** = **TEMPO**; engine store writes `tm_bpm_w[t]` |
| Publish | After store: high byte → BPM 30…300 → `× 24` → `PROJECT_BPM24` |
| Sync | When `tm_dirty[t]` is clear, shadow ← map from `PROJECT_BPM24` |
| Defaults | Follow the project’s existing tempo; no new DRAM base editor |
| Manual edit | Stock **TEMPO** key / LEVEL |

Live amount is the high byte of `tm_bpm_w[t]` (bits 8–15), the same form
stock LFO stores into destination words. Publish is **global** (last
writer wins); this tip does not own per-track scale (**TSPD**).

## PMTR index assignment (coordinated map)

| Index | Label | Module |
| --- | --- | --- |
| 30 | PROB | Trig Prob |
| 31 | RST | Seq Reset |
| 32 | SLIC | Slice Num |
| 33 | SWING | Swing LFO |
| 34 | TSPD | Track Speed LFO |
| 35 | TLEN | Track Len |
| 36 | PHAS | Track Phase Offset |
| 37 | SPOS | Seq Pos |
| 38 | TSTR | Time Stretch |
| **39** | **TEMPO** | **Tempo LFO (this)** |

Index **39** is the next clear unused slot after the nine parked peers
(loader room 16). Confirm against the Project store allocation lock
(`lfo-pmtr-index-allocation.md`) if another claim lands first.

**Out of scope for this tip**

- Track scale/speed (`tr+0x51`) — owned by **TSPD**
- `ev_audio_step` / Play Modes / SPOS remapper sites — not claimed
- Catalog pin / Accept — still **SHUT** (MOP-250); USB smoke PASS (mop205);
  audible Undo + Keep-auth protocols tip-ready (mop250); AFK must not
  `device_keep` without Jon Accept auth

## LFO destination (audio)

| what | address | note |
| --- | --- | --- |
| destination lea+cmpi | `0x4000d042` (pad_to=8) | base `mw_lfo_pmtr_dest` — **do not Detour** |
| dest store | `0x4000d07a` (6 B) | base `mw_lfo_pmtr_store` + contribute `after_store` → `tm_on_store` |
| PMTR count (audio) | `0x400d38a8` | base-owned |
| PMTR formatter | `0x4003bf64` | base-owned; prints **TEMPO** from contribute label |

## Project tempo record

From REPITCH `repitch.s` (published module source):

| what | value |
| --- | --- |
| `PROJECT_BPM24` | `0x8000181c` (long) |
| Range | 720…7200 (= 30…300 BPM × 24) |
| Consumers | Frame builder / MIDI clock / REPITCH tempo scale |

## Publish without fighting peers

Contribute ABI 2 wires `tm_on_store` as `after_store` so publish runs only
when the base store hits TEMPO words — do not claim `0x4000d07a`. Do not
subscribe to `ev_audio_step` (SPOS / Play Modes ownership). Do not write
`tr+0x51` (TSPD).

## Panel / UI claims

| what | plan |
| --- | --- |
| Base edit | Stock TEMPO key (no new gesture) |
| uiClaims | `[]` |
| Modulation | LFO SETUP → PMTR = TEMPO |

## Catalog / publish ceiling

| Stamp | State |
| --- | --- |
| MOP-204 tip scaffold | Parked draft; catalog **SHUT** |
| MOP-205 USB smoke | SETUP TEMPO + words/BPM24 PASS; not Proven |
| MOP-213 tip publish gates | `cycles.static` **624**; qual recipe hooked; measured / WAV / `tests.qualification` place / catalog still open |
| MOP-226 catalog-gate honesty | Smoke + static + qual hooks restated; pin still **SHUT**; no Accept / Proven invent |

Catalog pin **SHUT**. No Accept. No force-list. No invented Proven.
Current stamp:
[`evidence/catalog-gate-mop226-2026-11-25.md`](evidence/catalog-gate-mop226-2026-11-25.md)
/ hub [MOP-226](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-catalog-gate-honesty-mop-226)
(publish gates [MOP-213](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-tip-publish-gates-mop-213)).
