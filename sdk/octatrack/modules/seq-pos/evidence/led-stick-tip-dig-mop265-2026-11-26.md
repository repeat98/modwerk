# SPOS LED stick tip dig + master remap (MOP-265)

Tip-only. Europe/London · 26 November 2026. Tracker **MOP-265**.
After mop263/264 Open (LED `0x800065b5` marched under address). **No
USB / Accept / dens reopen** this pass. Jon power-cycled after mop264;
Keep restored; tip dig only.

## Verdict

| Question | Answer |
| --- | --- |
| Who writes `0x800065b5`? | **Stock** — low byte of master step word `0x800065b4` (DIRECT JUMP "b5"); not a remapper output |
| Does `ev_ui_step` / SPOS write it? | **No** — remappers mutate the `0x4009b2b0` **return** in `d0` / `*step` only |
| Why mop263/264 peeks marched? | Peeking stock master-step byte; remappers never stick that RAM (same class as rejecting `PLAYHEAD` write-back) |
| Why LEDs may still follow stock after #229? | MOP-262 glue left **unsigned track > 7**, so master caller arg `-1` (`0xffffffff`) never hit `sp_map` |
| Tip fix landed? | **Yes** — `step_ptr_track_reg_map`: master `-1` → `CUR_TRACK` `0x100b14cc` when audio 0..7, then `sp_map`; MIDI leave; never write `PLAYHEAD` / `0x800065b5` |
| USB LED stick PASS? | **Deferred** — next Keep-safe Undo must judge **panel LEDs / getter return**, not `0x800065b5` unique |
| Dens / Accept | **Parked** / **none** |

## Call sites (exact)

| Role | Address / symbol | Notes |
| --- | --- | --- |
| UI step getter (site-event) | `0x4009b2b0` `ev_ui_step` | Base loads master `0x800065b4` when track `< 0`; else `jsr 0x4009b2be`; returns (possibly remapped) step in `d0` |
| Stock per-track branch | `0x4009b2be` | Used when track `>= 0` |
| Master step word / LED byte | `0x800065b4` / `0x800065b5` | Word + low byte; stock counter/display RAM — **do not poke** |
| Per-track PLAYHEAD | `0x800064d0[t]` | Marches by design; **never** write remapped |
| Current track | `0x100b14cc` | Play Modes `CUR_TRACK` (hooks.s); MIDI mode may be 8+ |
| Play Modes show | `pm_show` / `pm_show_entry` | Master `-1` → track 0 under NORMAL scale; PER TRACK leaves raw |
| SPOS map | `sp_map(d0=track,d1=raw)` | `andi #7`; `.follow` unless `sp_en[t]` |
| UI callers of getter | `0x40033ffc`, `0x40035b5a`, `0x40035d88`, `0x400373e8`, `0x40038686`, `0x40038894`, `0x40044528`, `0x4004d1dc`, `0x4004d504`, `0x40061f34`, `0x40061f4e` | Trig LEDs, live recording, lock editing — track = current or `-1` (Play Modes INVESTIGATION round 3) |

## Smallest tip fix (implemented)

Change only machine-ports glue shape `step_ptr_track_reg_map` (native
`unit.s` / `runtime.json` unchanged — catalog pin):

1. track `0..7` → `sp_map` as mop262.
2. track `-1` → load `CUR_TRACK`; if `<= 7`, `sp_map` that track (selected-track address).
3. else (MIDI) → leave `*step`.
4. Still **never** write `PLAYHEAD` or `0x800065b5`.

Rejected again: poke `0x800065b5` alone; write remapped into `0x800064d0[t]`;
private Detour conflict with Play Modes.

## Next USB (not this pass)

1. Keep-safe Undo twin with this glue: address ON, dest 0 vs 127.
2. Observe **trig LEDs** stick to expected step (or peek getter return /
   a diagnostic that samples the remapped `d0` path) — **do not** use
   `0x800065b5` unique as the stick metric.
3. Only then reopen dens / ratchet.

## Tip checks

| Gate | Result |
| --- | --- |
| `events.py --check` | pass |
| machine-ports `check_sources` (seq-pos) | pass |
| Glue text contains `0x100b14cc` + master `-1` | yes |
| `m68k-*-as` on this host | unavailable — CI / owner host |
| USB / Accept | none |

## Cross links

- mop263 Open: [`usb-led-peeks-open-mop263-2026-11-26.md`](usb-led-peeks-open-mop263-2026-11-26.md)
- mop264 Open: [`usb-led-repeeks-open-mop264-2026-11-26.md`](usb-led-repeeks-open-mop264-2026-11-26.md)
- mop262 wire: [`base-ev-ui-step-impl-mop262-2026-11-26.md`](base-ev-ui-step-impl-mop262-2026-11-26.md)
- mop261 dig: [`playhead-led-firmware-dig-mop261-2026-11-26.md`](playhead-led-firmware-dig-mop261-2026-11-26.md)
- Play Modes: `hooks.s` `pm_step_getter` / `CUR_TRACK`; INVESTIGATION § UI playhead
