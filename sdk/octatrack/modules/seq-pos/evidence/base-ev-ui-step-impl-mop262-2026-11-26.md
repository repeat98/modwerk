# Base `ev_ui_step` implementation (MOP-262, tip-only)

Host tip after #228 / MOP-261 dig (`4cbb30fe1`). Implements the MOP-261
preferred path. **No USB Accept / Keep / dens re-dig / catalog invent.**
Dens A/B stay parked (mop260). Peer LFO ratchet remains blocked until
Keep-safe Undo LED peeks ran in MOP-263 and Keep-restore re-peek in
MOP-264: tip wire loaded + toast/step-map PASS; LED byte stick **Open**
(see usb-led-peeks-open-mop263 / usb-led-repeeks-open-mop264).

## What landed

| Piece | Detail |
| --- | --- |
| Event | `ev_ui_step` index 33, `call`, room 8 |
| Site | `0x4009b2b0` length 6 · guard `6b9dc784…b761d0` · return via `rts` |
| ABI | `int f(unsigned *step, unsigned track)` — `&d0`, `site+4` |
| Head | stock load: master `0x800065b4` when track `< 0`; else `jsr 0x4009b2be` |
| Tail | restore mutated `d0` and `rts` (UI getter, not audio rejoin) |
| Orders | Play Modes 40 → Seq Pos 50 (both return 0 to chain) |
| PLAYHEAD | **Never** written with remapped step (`0x800064d0[t]` marches) |

Generated: `runtime_events.s` / `.h`, `modwerk_events.h`, `EVENTS.md`,
`site-events.json`.

## Module wiring

| Module | How | Notes |
| --- | --- | --- |
| Keep **Play Modes** | `machine-ports.json` subscribe + `callWrappers` → `pm_ev_ui_step` via `pm_show_entry`; replaces `pm_step_getter` | Native sources / owner approval untouched. `runtime.json` still owns `ev_audio_step` (MOP-188). Standalone `--octabam` `.mwrm` still Detours the LED site until an owner-approved version carries `ev_ui_step` in `runtime.json`. |
| Catalog **Seq Pos** | `machine-ports.json` subscribe + `callWrappers` shape `step_ptr_track_reg_map` → `sp_map`; order 50 | **Native `unit.s` / `runtime.json` unchanged** (catalog pin / version gate). Audio tracks `0..7` only; master / MIDI leave `*step`. `runtime.json` still owns `ev_audio_step`. |

## Tip assemble (no USB)

| Artifact | Tool / check | Result |
| --- | --- | --- |
| `events.py --write` / `--check` | registry generate | pass |
| `elekloader/runtime_events.s` | reviewed generated dispatch | site `modwerk_site_4009b2b0` present |
| machine-ports `check_sources` | playmodes + seq-pos | pass |
| Cloud host | no `m68k-*-as` on this runner | **assembler not available here** — CI / owner host must assemble |
| `modules:compat` / park / imports | tip gates | pass |

## Limits (honest)

- Keep-safe Undo LED peeks: **Open** in MOP-263 / MOP-264 (wire loaded; LED byte still marches).
- **No** dens A/B reopen; dens stay parked until LED USB proves address stick.
- **No** Accept / catalog invent / Seq Pos version bump.
- Rebuild / MIDI sites (`0x4009dc86` / `0x400a39b6`) still Play Modes private /
  unwired in SPOS.
- Published Play Modes standalone package still Detours `0x4009b2b0` until a
  follow-up owner-approved version; on a base that owns the site, that Detour
  package is refused (loader rule 4).
- Seq Pos follow-up may move `ev_ui_step` into its own `runtime.json` when a
  versioned release is authorized (same path as mop188 for Play Modes audio).
- UI getter cycles unpriced this tip (Play Modes cites ~1.5k worst UI query —
  cite only; do not copy into SPOS claims).

## Cross links

- Dig: [`playhead-led-firmware-dig-mop261-2026-11-26.md`](playhead-led-firmware-dig-mop261-2026-11-26.md)
- Audio remapper precedent: [`base-ev-audio-step-impl-mop102-2026-11-24.md`](base-ev-audio-step-impl-mop102-2026-11-24.md)
- Gap park: [`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md)
- Hub: [MOP-262](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-ev-ui-step-impl-mop-262)
