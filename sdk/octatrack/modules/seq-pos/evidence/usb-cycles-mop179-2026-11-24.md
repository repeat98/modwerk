# ColdFire cycles measured / cfmeter / stress dig (MOP-179)

Host: DESKTOP · Europe/London · 24 November 2026  
Keep-safe: no Accept, no catalog pin, no elemod flash.

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24** (before twin + after Jon PC) |
| Twin leave | tip twin `775d9322…` → tip dual → Undo inventory **`[]`** → Jon PC → Keep tip24 |
| Accept | none |
| `cycles.static` | **752** (mop178 object dump; unchanged) |
| `cycles.measured` | **752** (worst ot_emu PC-watch event; matches static) |
| `cycles.budget` | **4790** (10% of 362.8 µs @ 132 MHz) |
| cfmeter load | stock longest **287.8** µs / module **287.8** µs; idle **0.0** / **0.0** |
| ≥60 s stress | **Incomplete** here — ILLEGAL at Part call ~30.8 s (hangs=1); **REACHED** later without Part ([mop181](usb-stress-mop181-2026-11-24.md)) |
| Catalog | **SHUT** |

## Measured (ot_emu PC-watch)

Private remix `test/seq-pos` BUILD=94. Card-backed SPOS project. Trampoline
`moveq #0,d0; moveq #8,d1; jmp sp_map` at `0x40a98000`. `--watch-pc` on
address-on `sp_map` + Detour `sp_audio_step` (45 PCs).

| Case | Events | Authored / event | ×16 cycles |
| --- | ---: | ---: | ---: |
| follow (en=0) | 8 | 20 | 320 |
| on_mid (SPOS=64) | 64 | 33 | 528 |
| on_0 | 8 | 47 | **752** |
| on_127 | 8 | 47 | **752** |

Worst = **752**; matches tip static (39+8)×16.

## Load (CF METER page-2 watch-mem)

`test/cfmeter-port` BUILD=92 vs `test/cfmeter-seq-pos` BUILD=95. Same
33,075-frame flood. `cfmeter.py --dump` found **no** T8 sync edges
(block-dump read-back silent on this fresh NOPROJ). Decoder used CF METER
publisher lane `0x80000a40` (`--watch-mem`; sample on k-write at
`0x40aa786a`).

| Image | isr max (4 cycles) | longest | idle % |
| --- | --- | ---: | ---: |
| Stock | 266.1 / 279.5 / 287.8 / 266.8 | **287.8** | 0.00 |
| Module | 266.1 / 279.5 / 287.8 / 266.8 | **287.8** | 0.00 |

Δ ISR **0.0** µs under this flood with address mode off / empty patterns
(SEQ POS not armed). Port period slot ~725 µs (≈2×362.8 late-frame under
USB-in-remix flood) — noted, not used as `frameUs`.

## Stress

Attempted 62 s / 170,887 frames + STOP/START holds + Part
`callAsMain 0x4004a8a4` at frame 85,000. Ended **ILLEGAL** (opcode `4ac8`
at `0x4003b108`) after **85,002** frames (~30.8 s). MIDI IN still queued;
MIDI OUT 3 bytes; watch-pc total 95,483. **Not** a passing ≥60 s soak.
`hangs=1`. Full REACHED re-run without Part: [mop181](usb-stress-mop181-2026-11-24.md).

## What this dig does **not** claim

- Chip timing (emulator instruction counts / port steps only).
- A completed ≥60 s stress REACHED (closed by mop181 without Part).
- Dual-install words-move, toast pages, qualification fill, or catalog pin.
- That `cfmeter.py --dump` audio decode worked on this host/project.

## Leave

Undo `[]` on tip twin before Jon PC; Keep tip24 confirmed after. **No
Accept.** Catalog **SHUT**.

Private artifacts: `modwerk-builds/mop179-spos-cycles-measured/` (not
committed).

## Cross links

- Recipe: [cycles-performance-plan-mop170-2026-11-24.md](cycles-performance-plan-mop170-2026-11-24.md)
- Prior static dig: [usb-cycles-mop178-2026-11-24.md](usb-cycles-mop178-2026-11-24.md)
- Record: [performance.json](performance.json)
- Hub sync after this dig: [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
- Gate: [catalog-gate-mop83-2026-11-24.md](catalog-gate-mop83-2026-11-24.md)
- PROB cite-only: [otemu-cycles-mop55](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md) /
  [cfmeter-load-stress-mop57](../../trig-prob/evidence/cfmeter-load-stress-mop57-2026-11-23.md)
