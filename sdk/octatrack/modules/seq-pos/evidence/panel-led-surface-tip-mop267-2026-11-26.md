# SPOS panel LED / remapped-step surface tip (MOP-267)

Tip dig + smallest glue latch after mop266 Open. Europe/London · 26
November 2026. Tracker **MOP-267**. **No USB / Accept / dens reopen**
this pass. Jon power-cycle after mop266 Undo `[]` still required before
any next Keep-safe Undo.

## Verdict

| Question | Answer |
| --- | --- |
| Stock SRAM holds remapped UI step? | **No** — remappers mutate `ev_ui_step` `*step` / `d0` only; mop266 wide SRAM scan found no B→0 / C→15 cross stick |
| Why `0x800065b5` still marches? | Stock master-step low byte (mop265) — not a remapper write |
| Battery `CUR_TRACK` `0x100b14cc` USB MEM? | **Null** — outside readable spans (`0x100f0000–0x100fffff` only for battery records) |
| Live current track | `0x80000000` — USB-readable; mop266 peeks used it |
| Play Modes `pm_hist` | Module DRAM last-two played steps for **mode** LEDs — not SPOS address latch; load-relative |
| Tip surface landed? | **Yes** — `sp_ui_shown[8]` latched after `sp_map` in machine-ports glue |
| Master `-1` track source | **Switched** to live `0x80000000` (was battery `CUR_TRACK`; USB-null) |
| PLAYHEAD / `0x800065b5` write? | **Still rejected** |
| USB / dens / Accept this pass | **None** / **parked** / **none** |

**Class: tip surface landed (USB getter stick deferred).** Remapped panel
step had no stock SRAM home; glue now latches it into USB-readable module
DRAM beside `sp_en` / `sp_len`.

## Trace (remapped step → panel)

1. UI callers (`0x40033ffc` … `0x40061f4e`) call stock getter
   `0x4009b2b0` with current track (`0x80000000`) or master `-1`.
2. Base `ev_ui_step`: load master `0x800065b4` when track `< 0`, else
   `jsr 0x4009b2be`; walk subscribers; return final step in `d0`.
3. Play Modes order **40** `pm_show_entry` / `pm_show` (mode map; may
   consult `pm_hist` in PM DRAM).
4. Seq Pos order **50** `sp_ev_ui_step` → `sp_map` when enabled.
5. Callers use the **return** to light trig LEDs / live rec / lock edit.
   Stock `0x800065b5` continues as the master counter byte — remappers
   never poke it (same reject class as `PLAYHEAD` `0x800064d0[t]`).

## Smallest tip change (implemented)

`machine_ports.py` shape `step_ptr_track_reg_map` only (native `unit.s` /
`runtime.json` unchanged — catalog pin):

1. track `0..7` → `sp_map` (unchanged).
2. track `-1` → load **live** `0x80000000`; if audio `≤7`, `sp_map`.
3. After remap: `sp_ui_shown[track] = remapped_step` (byte; `0xff` idle).
4. MIDI leave; never write `PLAYHEAD` / `0x800065b5`.

Rejected again: poke `0x800065b5`; write remapped into `PLAYHEAD`; private
Detour; hunt stock SRAM for a stick that does not exist.

## Exact addresses

| Role | Address / symbol | USB MEM? |
| --- | --- | --- |
| UI getter site | `0x4009b2b0` `ev_ui_step` | code (tip jmp) |
| Master step word / LED byte | `0x800065b4` / `0x800065b5` | yes — **wrong stick metric** |
| Per-track PLAYHEAD | `0x800064d0[t]` | yes — marches; **never write** |
| Live current track | `0x80000000` | **yes** (glue master `-1` source) |
| Battery CUR_TRACK | `0x100b14cc` | **no** (outside battery MEM window) |
| SPOS enable / len / dest | `sp_en` / `sp_len` / `sp_pos_w` | yes via package symbol resolve (~`0x40d1e…` on tip twin) |
| **New latch** | `sp_ui_shown[t]` | **yes** — same resolve class as `sp_en` |
| Play Modes LED hist | `pm_hist` (PM BSS) | yes if PM load known — mode path only |

## Next USB recipe (not this pass)

1. Power-cycle → tip24 Keep restored; Keep-safe Undo twin with this glue.
2. Resolve `sp_ui_shown` like `sp_en` (package symbols / wordsPtr class).
3. Toast OFF / SPOS dest **0** / dest **127** (len 16 → expected steps
   **0** / **15**); PLAY while sampling.
4. **PASS metric:** `sp_ui_shown[0]` unique/mode sticks to **0** under B
   and **15** under C (not `0x800065b5` unique; not PLAYHEAD).
5. Optional eyeball: trig LEDs park on addressed step.
6. Only then ask before dens reopen. No Accept.

## Tip checks

| Gate | Result |
| --- | --- |
| `events.py --check` | pass (after `--write`) |
| Glue contains `sp_ui_shown` + `0x80000000` | yes |
| Glue omits battery `0x100b14cc` | yes |
| Native `unit.s` / `runtime.json` | unchanged |
| USB / Accept | none |

## Cross links

- mop266 Open: [`usb-panel-led-peeks-open-mop266-2026-11-26.md`](usb-panel-led-peeks-open-mop266-2026-11-26.md)
- mop265 tip: [`led-stick-tip-dig-mop265-2026-11-26.md`](led-stick-tip-dig-mop265-2026-11-26.md)
- mop262 wire: [`base-ev-ui-step-impl-mop262-2026-11-26.md`](base-ev-ui-step-impl-mop262-2026-11-26.md)
- Hub: [MOP-267](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-panel-led-surface-tip-mop-267)
