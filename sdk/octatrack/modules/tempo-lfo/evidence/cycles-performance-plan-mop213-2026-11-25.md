# Tempo LFO cycles / performance plan (MOP-213, tip-only)

After mop205 USB smoke and mop213 static fill. **Docs + static only** —
no twin, no Accept, no invented measured / load / stress. Cite PROB /
SPOS **method shape** only; never copy their integers into TEMPO.

## Goal

Fill [`performance.json`](performance.json) as far as honest evidence
allows, then leave remaining nulls until a host with ot_emu + tip-matched
private package can run mop55/mop57-shaped passes.

## Ordered recipe

### A. Static (done this tip)

See [`usb-cycles-static-mop213-2026-11-25.md`](usb-cycles-static-mop213-2026-11-25.md).

- Assemble `unit.s` with `m68k-*-as -mcpu=54455`
- Objdump; count publish `tm_on_store` + `tm_map_bpm24`
- `cycles.static = authored_worst × 16`
- **Filled:** static **624** (39 × 16)

### B. Measured (host later — leave null until run)

PROB shape ([mop55](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md)):

1. Private tip-matched remix / USB package that links this `unit.s`.
2. `ot_emu --mkii` with `--watch-pc` on every instruction of
   `tm_on_store` + `tm_map_bpm24` (PCs from the linked image).
3. Cases: high byte 0 / mid / 127; out-of-range pointer early exit.
4. Worst event authored + compare to static **39**.
5. Write `cycles.measured`; keep method prose bound to the exact image.

Do **not** invent a measured number to match static.

### C. Load / stress (host later — leave null)

cfmeter stock-vs-module under the same flood (mop57 / mop179 shape) and
≥60 s stress without Part `callAsMain` traps. Until then leave
`load.*` / `stress.*` null with honest method text.

### D. Budget

Optional once measured exists: `4790` = 10% of 362.8 µs frame at 132 MHz
(same envelope peers cite). Leave **null** until measured is real.

## Anti-patterns

| Trap | Why |
| --- | --- |
| Copy PROB 640 / SPOS 752 into TEMPO | Invented; wrong hot path |
| Fill measured = static without PC-watch | Forged Proven |
| Claim `perf:audit` green from static alone | Audit requires measured + load + stress |
| Force-list catalog | Pin stays **SHUT** |

## Cross links

- Static dig: [`usb-cycles-static-mop213-2026-11-25.md`](usb-cycles-static-mop213-2026-11-25.md)
- Qual recipe: [`qualification-fill-recipe-mop213-2026-11-25.md`](qualification-fill-recipe-mop213-2026-11-25.md)
- Catalog gate: [`catalog-gate-mop213-2026-11-25.md`](catalog-gate-mop213-2026-11-25.md)
- Hub: [MOP-213](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-tip-publish-gates-mop-213)
