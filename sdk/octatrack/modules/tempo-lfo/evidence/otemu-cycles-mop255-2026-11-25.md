# Tempo LFO measured cycles / load / stress — PASS (MOP-255, 25 Nov 2026)

After mop254 reboot PASS + tip #221 merge (`f77df562e`). Catalog **SHUT**.
Index **39** locked. No Accept. No catalog invent/pin. Private dig only
(`modwerk-builds/mop255-tempo-cycles-measured/`); not a shipping remix.

Europe/London · 25 November 2026.

## Identify

| Field | Value |
| --- | --- |
| Host tip | post-#221 `f77df562e` |
| Private remix | `test/tempo-lfo` BUILD=`T5` (linked `sdk/drafts/tempo-lfo/unit.s`) |
| Linked symbols | `tm_on_store` `0x40a9573a`, `tm_map_bpm24` `0x40a956ac`, `tm_bpm_w` `0x40a977bc` |
| Watch | 43 PCs (`tm_on_store` + `tm_map_bpm24`) |
| Trampoline | `0x40a98000` callAsMain (poke high-byte → push `&tm_bpm_w[0]` → jsr) |
| Catalog | **SHUT** |

## Measured (PC-watch)

| Case | Events | Segment authored (worst) | ×16 cycles | REACHED |
| --- | --- | --- | --- | --- |
| high 0 | 8 | **39** | **624** | yes |
| high 64 | 8 | **39** | **624** | yes |
| high 127 | 8 | **39** | **624** | yes |
| OOR (`tm_bpm_w-2`) | 8 | **9** | **144** | yes |

`cycles.measured = 624` (matches static). Emulator instruction counts ≠
chip wall-clock.

## Load (cfmeter stock vs module)

| Image | Longest ISR µs (k=4) | Idle median % |
| --- | --- | --- |
| `test/cfmeter-port` (stock) | **287.8** | 0.0 |
| `test/cfmeter-tempo-lfo` | **287.8** | 0.0 |

Same mop179 `load.midi` / CFMLOAD card / `--watch-mem 0x80000a40,6`. TEMPO
did not add measurable frame-ISR under this flood (store-driven path). Idle
0.0 is dense-flood saturation (mop179 CFMLOAD shape), not a free-frame claim.

## Stress (≥60 s)

| Field | Value |
| --- | --- |
| Image | `test/cfmeter-tempo-lfo` BUILD=`T5` |
| Frames | **170887** REACHED |
| Flood | ~3000.1 msg/s · clock 240 BPM · 62 s |
| MIDI queue end | **0** |
| Hangs / ILLEGAL | **0** / none |
| Part `callAsMain` | **not used** |
| stuckNotes | null (not scored) |

## Budget

`cycles.budget = 4790` — 10% of 362.8 µs frame at 132 MHz (peer cite
envelope). Measured 624 sits well under; not a hard per-event ceiling.

## Verdict

Measured matches static; load delta ~0 under this flood; stress REACHED
clean. Catalog pin remains **SHUT** (qual / Proven / Accept still Open).

## Anti-claims

- No Accept invent / no Keep this dig
- No catalog pin / force-list
- No Proven invent from emulator alone
- Private remix / bus images stay off Git
