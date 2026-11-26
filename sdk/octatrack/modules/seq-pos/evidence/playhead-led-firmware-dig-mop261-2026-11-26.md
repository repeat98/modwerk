# SPOS playhead / LED firmware dig (MOP-261)

Tip investigation only. Europe/London · 26 November 2026. Tracker
**MOP-261**. Follows Jon mop260 park (dens A/B parked; remapping =
0.1.x firmware gap). **No** `unit.s` / Detour / runtime wiring this
pass. **No** USB dens re-dig. **No** Accept invent. **No** playhead-
motion Proven invent. Catalog already **PINNED** (mop248).

## Verdict

| Question | Answer |
| --- | --- |
| Safe minimal firmware patch this pass? | **No** — investigation-only |
| Implemented LED / UI remapper? | **No** (would invent unproven firmware behaviour without OS guard re-measure + dual-install design) |
| Exact LED / UI hook identified? | **Yes** — stock `0x4009b2b0` (Play Modes `pm_step_getter`) |
| Smallest next firmware change? | Base-owned **`ev_ui_step`** at `0x4009b2b0` (mirror `ev_audio_step`); Play Modes 40 → SPOS 50 via `sp_map` |
| Private Detour alone? | Tractable for SPOS-alone prototype **only**; hard-conflicts with Play Modes; breaks tip dual-install path |
| Write remapped step into `PLAYHEAD` `0x800064d0[t]`? | **Reject** — corrupts stock counter (tempo / length / chain); Play Modes keeps counter marching |
| USB / Accept / catalog / dens re-dig? | **None** |

## How address mode / SPOS / PLAYHEAD / LEDs interact today

| Layer | Site / symbol | What 0.1.x does |
| --- | --- | --- |
| Stock step counter | `PLAYHEAD` `0x800064d0[t]` | Marches under address mode (mop258 uniqueT1=3 A/B/C) |
| Address enable | `sp_en[t]` | Armed by `sp_on_store` / FUNC+TRACK+LEVEL; cleared by FUNC+TRACK+NO |
| Dest word | `sp_pos_w[t]` (high byte 0..127) | LFO PMTR index **37** / panel LEVEL |
| Length | `sp_len[t]` (default 16; path to 64) | Maps `step = (value * len) >> 7` |
| Audio remapper | Base `ev_audio_step` @ `0x400a2d6a` → `sp_ev_audio_step` order **50** | Remaps *played* step via `sp_map` when `sp_en[t]`; tip-matched Proven mop167/184 |
| UI / LED step getter | Stock `0x4009b2b0(track)` | **Not** hooked by SPOS — LEDs / live recording / lock edit follow stock playhead |
| Play Modes LED path | Detour `pm_step_getter` @ `0x4009b2b0` → `pm_show` | LEDs show *played* step; stock counter still marches |
| Master LED byte | `0x800065b5` / master step `0x800065b4` | Used when track arg `< 0`; not a per-track remapper |

**Observed honesty (mop258/259, parked mop260):** toast/step-map
1–16 peeks work; dens A/B null; stock PLAYHEAD marches → tip remapper
does **not** own audible dens or LED playhead in 0.1.x.

**DRAM Enable:** `sp_en` / `sp_pos_w` are DRAM-only in 0.1.0 (mop247
inventory presence ≠ address-mode survival across reboot). Separate
from LED remap; still a gap.

## Call sites to pin (from Play Modes §4 + seq-pos unit)

Cited from published Play Modes investigation / hooks (stock guards
only; no firmware bytes in-tree):

| Role | Address | Length | Known stock_guard (Play Modes) | Owner today |
| --- | --- | --- | --- | --- |
| Audio step load | `0x400a2d6a` | 6 | `1cb5e6a4478a2248b033baac126f63d4930860b767556518139cf5f717c08433` | Base `ev_audio_step` (PM 40 / SPOS 50) |
| UI step(track) — **LED / live rec / lock edit** | `0x4009b2b0` | 6 | `6b9dc784b6d9954576ec3076f47f503b7e820106be6e2052c973c3ae96b761d0` | Play Modes private Detour only |
| Stock UI branch (per-track) | `0x4009b2be` | — | — | Called from `pm_step_getter` after displace |
| Audio rebuild peek | `0x4009dc86` | 6 | Play Modes | Not claimed by SPOS (look-ahead gap) |
| MIDI tick step | `0x400a39b6` | 8 | Play Modes | Unwired in SPOS 0.1.x |
| Step handler (consumes remapped) | `0x4009d1e8` | — | — | Downstream of audio remapper |

UI callers of `0x4009b2b0` (Play Modes INVESTIGATION round 3):
`0x40033ffc`, `0x40035b5a`, `0x40035d88`, `0x400373e8`, `0x40038686`,
`0x40038894`, `0x40044528`, `0x4004d1dc`, `0x4004d504`, `0x40061f34`,
`0x40061f4e`.

## Smallest firmware change (proposed — not implemented)

### Preferred: base `ev_ui_step` (mirror `ev_audio_step`)

1. Owner-reviewed base PR: claim `0x4009b2b0` as site-event
   **`ev_ui_step`**, displace stock `movel 4(sp),d0 ; bges …` (6),
   rejoin / return mapped step in `d0` like stock.
2. Prototype (sketch only): `int f(unsigned *step, unsigned track)` or
   return-in-`d0` getter matching stock ABI — exact wrapper must match
   measured stock entry (Play Modes already documents the displace).
3. Migrate Play Modes `pm_step_getter` → subscribe order **40**
   (`pm_show` / `pm_show_entry`).
4. Seq Pos: subscribe order **50**; when `sp_en[t]`, run existing
   `sp_map(track, raw)` and publish mapped step; else leave stock.
5. Dual-install stays tip-matched (same pattern as mop102/188 audio).

### Rejected as first patch

| Idea | Why not |
| --- | --- |
| Write mapped step into `0x800064d0[t]` | Breaks stock counter semantics (Play Modes explicitly leaves it marching) |
| Poke master LED `0x800065b5` alone | One byte for all tracks; fights stock refresh; not Play Modes’ measured path |
| SPOS private Detour @ `0x4009b2b0` without base event | Same-site hard conflict with Play Modes; dual-install words-move path regresses |
| Claim LED Proven from tip docs | Invented Accept / qual |

### SPOS-alone private Detour (prototype-only dig, later)

Only if owner authorizes an **SPOS-alone** LED USB dig before base
`ev_ui_step`: Detour `sp_step_getter` @ `0x4009b2b0` calling `sp_map`
when enabled (mirror `pm_step_getter` structure: stock branch then map).
Requires local `fill_guards` against 1.40C, native assemble, Keep-safe
Undo LED peeks — **not** this pass (no OS in cloud; no USB).

## Risks

- Remapping UI step also remaps **live recording** and **lock editing**
  callers of `0x4009b2b0` — intentional for Play Modes; SPOS must decide
  whether address mode should bind those too.
- Master track arg `< 0` / `0x800065b4`: Play Modes maps under NORMAL
  scale via track 0; SPOS needs an explicit rule (likely: leave master
  stock unless a named track is address-enabled).
- Rebuild / look-ahead (`0x4009dc86` / MIDI) still unwired — LED-only
  remap does not complete audible dens or ratchet alone.
- Dens A/B Open may remain a **fixture** problem even after LEDs track
  address (mop258/259 dens null while step-map peeks worked).
- Cycles budget: UI getter is hot for LEDs; price after assemble (Play
  Modes quotes ~1.5k worst UI query — cite only, do not copy integers
  into SPOS claims).

## Why not implement this pass

1. Preferred path is a **base** event + Play Modes migration — owner-
   reviewed, multi-module, larger than a tip-only SPOS PR.
2. Private Detour without re-measured OS guards + USB LED proof would
   invent firmware behaviour.
3. Assignment: do not invent firmware behaviour; land focused
   investigation with concrete call sites when full remap is too large.

## Next dig (ordered)

1. Owner-reviewed base `ev_ui_step` design PR (events.json /
   runtime_events.s / EVENTS.md / Play Modes runtime migrate) — tip
   sketch only until authorized.
2. SPOS subscribe + `sp_map` on UI path; tip assemble; cycles note.
3. Keep-safe Undo USB: LED / playhead peeks under address (SPOS 0 vs
   127) with stock PLAYHEAD still marching underneath — LED must stick
   to addressed step.
4. Only then reopen dens / ratchet USB; dens stay parked until then.
5. Do **not** AFK-merge a behaviour firmware PR without green CI +
   named hardware evidence; this tip is docs-only.

## Cross links

- Gap stamp: [`publishability-gates-hub-mop260-2026-11-26.md`](publishability-gates-hub-mop260-2026-11-26.md)
- Dens Open: [`usb-playhead-ab-open-mop258-2026-11-26.md`](usb-playhead-ab-open-mop258-2026-11-26.md),
  [`usb-playhead-sparse-trig1-open-mop259-2026-11-26.md`](usb-playhead-sparse-trig1-open-mop259-2026-11-26.md)
- Audio remapper: [`base-ev-audio-step-remapper-mop101-2026-11-24.md`](base-ev-audio-step-remapper-mop101-2026-11-24.md)
- Play Modes LED Detour: `sdk/octabam/modules/playmodes/hooks.s`
  `pm_step_getter`; INVESTIGATION § “The playhead the UI shows”
- Hub: [MOP-261](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-playhead-led-firmware-dig-mop-261)
