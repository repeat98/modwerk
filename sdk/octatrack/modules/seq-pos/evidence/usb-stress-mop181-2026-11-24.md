# ColdFire ≥60 s stress re-run (MOP-181)

Host: DESKTOP · Europe/London · 24 November 2026  
Keep-safe: no Accept, no catalog pin, no elemod flash.

| Check | Result |
| --- | --- |
| Keep tip24 | **OK** — `eb667962…`, inv **24** (before + after; no twin this pass) |
| Undo | inventory left on Keep tip24; no trial staged → **no Accept** |
| Accept | none |
| ≥60 s stress | **REACHED** — 170,887 / 170,887 frames (**62.0** s) |
| Part `callAsMain` | **none** (mop179 abort path omitted) |
| Catalog | **SHUT** |

## Stress (ot_emu, no Part call)

Reused mop179 private remix `test/cfmeter-seq-pos` BUILD=95 + CF METER
card `CFMLOAD`, mop57-shaped flood (~3,000 three-byte/s + clock 240 BPM;
STOP/START holds at 7/22/37/52 s). **No** `--step …:call:0x4004a8a4`.

| Field | Value |
| --- | ---: |
| frames | **170887** / 170887 |
| seconds | **62.0** |
| ended | **REACHED** (`exit=0`) |
| MIDI IN queued end | **0** |
| MIDI OUT | **3** bytes (0 after transport) |
| watch-pc total | **191960** (note/CC/clock sites) |
| hangs | **0** |
| stuckNotes | **0** |
| dropped | **0** (queue drained; watch total = flood three-byte + clocks) |

Private artifacts: `modwerk-builds/mop181-spos-stress/` (not committed).

## What this dig does **not** claim

- Chip timing (emulator only).
- Dual-install words-move, toast pages, qualification fill, or catalog pin.
- That mop179's Part `callAsMain` path is port-safe (still ILLEGAL on this
  ot_emu build — omitted here on purpose).

## Leave

Keep tip24 confirmed after. No twin / Accept. Catalog **SHUT**.

## Cross links

- Prior incomplete stress: [usb-cycles-mop179-2026-11-24.md](usb-cycles-mop179-2026-11-24.md)
- Recipe: [cycles-performance-plan-mop170-2026-11-24.md](cycles-performance-plan-mop170-2026-11-24.md)
- Record: [performance.json](performance.json)
- PROB cite-only: [cfmeter-load-stress-mop57-2026-11-23.md](../../trig-prob/evidence/cfmeter-load-stress-mop57-2026-11-23.md)
