# ColdFire cycles USB dig (MOP-178 / mop170 recipe)

Host: DESKTOP · Europe/London · 24 November 2026  
Keep-safe: no Accept, no catalog pin, no elemod flash.

| Check | Result |
| --- | --- |
| Keep tip24 preflight | **OK** — `eb667962…`, inv **24**, Screen Off + Mute Modes |
| Twin | `775d9322d45235d5…` (tip RAM; mop167 lineage) |
| Tip dual staged | Play Modes + SPOS + LFO peers (9 inventory names) |
| Tip remapper @ `0x400a2d6a` | **`4ef940ac7942`** — tip-matched |
| Static authored (object dump) | **39** `sp_map` address-on + **8** `sp_ev_audio_step` = **47** → **752** cycles (×16) |
| ot_emu PC-watch (`cycles.measured`) | **Not run** — no private seq-pos remix compose this pass |
| cfmeter load | **Not run** |
| ≥60 s stress | **Not run** |
| Undo | inventory **`[]`** |
| Accept | none |

## Static method (honest envelope)

```text
m68k-elf-as -mcpu=54455 --defsym MODWERK_EVENTS=1 sdk/drafts/seq-pos/unit.s
m68k-elf-objdump -d unit-events.o
```

Count every authored instruction in address-on `sp_map` (exclude `.follow`)
plus the tip-matched `sp_ev_audio_step` wrapper. ColdFire V4 envelope ×16
→ `cycles.static = 752`. Object-only (unlinked); **not** a linked remix
objdump and **not** ot_emu PC-watch. Emulator instruction counts ≠ chip
timing. `.follow` = 4 authored; Detour `sp_audio_step` wrapper = 6
(cite only).

`evidence/performance.json`: `cycles.static` filled; `measured` / `budget`
/ load / stress remain **null**. `npm run perf:audit -- check` still fails
on measured + load + stress — expected until mop55/mop57-shaped runs.

## What this dig does **not** claim

- That `perf:audit` passes.
- That measured / cfmeter / stress numbers exist.
- Dual-install words-move, qualification fill, toast pages, or catalog pin.

## Leave

Empty twin. **ASK JON power-cycle** before next twin / Keep soft (MOP-76).

Private JSON: `modwerk-builds/mop178-spos-cycles/cycles-usb.json` /
`static-summary.json` / `unit-events.objdump.txt` (not committed).

## Cross links

- Recipe: [`cycles-performance-plan-mop170-2026-11-24.md`](cycles-performance-plan-mop170-2026-11-24.md)
- Stub: [`performance.json`](performance.json)
- Tip remapper Proven: [`usb-dual-install-mop167-2026-11-24.md`](usb-dual-install-mop167-2026-11-24.md)
- PROB pattern (cite only): [`../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md`](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md)
- Hub: [MOP-178](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-cycles-usb-dig-mop-178);
  gates [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
