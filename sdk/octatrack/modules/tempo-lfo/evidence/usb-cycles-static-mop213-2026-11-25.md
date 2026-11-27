# ColdFire cycles static dig (MOP-213)

Host tip after mop205 USB smoke PASS
([usb-smoke-mop205-2026-11-25.md](usb-smoke-mop205-2026-11-25.md) /
[#175](https://github.com/jonathanwardle1992-beep/modwerk/pull/175)).
Europe/London · 25 November 2026. **No USB twin / Accept / lifecycle.**
Catalog **SHUT**. Do **not** invent measured / cfmeter / stress / Proven.

| Check | Result |
| --- | --- |
| Toolchain | `m68k-linux-gnu-as -mcpu=54455` + `m68k-linux-gnu-objdump -d` on `unit.s` |
| Hot path | Contribute `after_store` → `tm_on_store` (publish) + `tm_map_bpm24` |
| Static authored | **39** → **`cycles.static = 624`** (×16 V4 envelope) |
| ot_emu PC-watch (`cycles.measured`) | **Not run** — no private remix compose / ot_emu image on this tip host |
| cfmeter load | **Not run** |
| ≥60 s stress | **Not run** |
| Accept | none |
| Catalog | **SHUT** |

## Static method (honest envelope)

```text
m68k-linux-gnu-as -mcpu=54455 -o tempo-lfo.o sdk/drafts/tempo-lfo/unit.s
m68k-linux-gnu-objdump -d tempo-lfo.o
```

Count every authored instruction on the **publish** path through
`tm_on_store` (in-range `tm_bpm_w` pointer; both range branches not taken)
plus the happy-path `tm_map_bpm24` for a valid high byte 0…127 (BPM clamps
and BPM24 clamps do not fire for that input set). ColdFire V4 envelope ×16
(same conservative per-instruction pricing as PROB / SPOS TESTING notes —
**not** chip wall-clock).

| Piece | Authored |
| --- | --- |
| `tm_on_store` publish (incl. `.tm_done` epilogue) | **25** |
| `tm_map_bpm24` (high byte 0…127) | **14** |
| **Total** | **39** → **624** cycles |

Out-of-range early exit through `.tm_done` is **9** authored (shorter).
Object-only (unlinked); **not** a linked remix objdump and **not** ot_emu
PC-watch. Emulator instruction counts ≠ chip timing.

`evidence/performance.json`: `cycles.static` filled; `measured` / `budget`
/ load / stress remain **null**. `npm run perf:audit -- check` still fails
on measured + load + stress — expected until a mop55/mop57-shaped host run.

## What this dig does **not** claim

- That `perf:audit` passes.
- That measured / cfmeter / stress numbers exist.
- Audible WAV A/B, SETUP OCR, or catalog pin.
- That mop205 smoke is Proven.

## Cross links

- Recipe (measured later): [`cycles-performance-plan-mop213-2026-11-25.md`](cycles-performance-plan-mop213-2026-11-25.md)
- Stub: [`performance.json`](performance.json)
- USB smoke: [`usb-smoke-mop205-2026-11-25.md`](usb-smoke-mop205-2026-11-25.md)
- Catalog gate: [`catalog-gate-mop213-2026-11-25.md`](catalog-gate-mop213-2026-11-25.md)
- Qual recipe: [`qualification-fill-recipe-mop213-2026-11-25.md`](qualification-fill-recipe-mop213-2026-11-25.md)
- Hub: [MOP-213](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-tip-publish-gates-mop-213)
- PROB pattern (cite only): [`../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md`](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md)
