# Octatrack base: FM engine take hooks for CX OSC and FM Synth (28 November 2026)

Status: proposed on branch `prop/cx-osc-fm-engine-hooks` for cumulative base `base/octatrack-next`. Stock tail guards for indices 69 through 90 are verified against original Octatrack OS **1.40C** (`main_load` `0x40000400`). The committed base package is regenerated on this branch (`npm run octatrack:base -- --beta --write` against private **1.40C** `34695b606…`). Branch tracks `origin/main` and `origin/base/octatrack-next` (merge 28 Nov 2026: already up to date).

## Problem

FM Synth and the draft CX OSC module (`module/cx-osc`, PR #2293) detour the same 22 ColdFire sites (Tim Hastie FM engine lineage). `npm run modules:compat` reports 23 clashes while both stay on guarded `Detour`s. A `group-owned` row in `compatibility.json` only covers the listing window; the durable fix is take hooks in `sdk/machines/octatrack/events.json`, with synth at order 40 and CX OSC at 45.

`ev_midi_note_on` and `ev_midi_note_off` (indices 8 and 9) already own `0x4000e746` and `0x4000dfd4`. This change adds the other 20 shared engine sites plus documents the MIDI pair as the migration target for the remaining note-on and note-off detours.

## What changed

Indices **63 through 65** are owner tables on the rebased base (`ot_lfo_pmtr_dest`, `ot_reserved_64`, `ot_dsp_effects`). Indices **66 through 68** are neutral call placeholders (`ev_hook_reserved_66` … `_68`) with no subscribers: **66** CLYPS (#1997), **67-68** #2261 and #2271 when ready. Placeholders stay in `unused-hooks.json` until the owning pull request replaces them.

Twenty-two new **take** events, indices **69 through 90**, each `room` 8:

| Index | Event | Site | FM Synth replaces | CX OSC replaces |
| --- | --- | --- | --- | --- |
| 69 | `ev_fm_lfo_depth` | `0x40003ca4` | `po_lfo3` | `cx_lfo_standalone` |
| 70 | `ev_fm_lfo_depth_frame` | `0x4000d03e` | `po_lfo3b` | `cx_lfo_frame` |
| 71 | `ev_fm_lfo_page` | `0x40031e62` | `po_lfopage` | `cx_lfo_page` |
| 72 | `ev_fm_amp_release` | `0x4000b51a` | `po_rel` | `po_rel` |
| 73 | `ev_fm_transport_stop` | `0x4000b2c8` | `po_stop` | `po_stop` |
| 74 | `ev_fm_sequencer_retrig` | `0x4000c634` | `po_retrig` | `po_retrig` |
| 75 | `ev_fm_voice_kill` | `0x4000685c` | `po_kill` | `po_kill` |
| 76 | `ev_midi_chromatic_on_gate` | `0x4000e452` | `po_mgate` | `po_mgate` |
| 77 | `ev_midi_chromatic_off_gate` | `0x4000de10` | `po_mogate` | `po_mogate` |
| 78 | `ev_midi_live_record_event` | `0x400625e0` | `po_mrec` | `po_mrec` |
| 79 | `ev_midi_live_record_trig` | `0x4006262a` | `po_mtrig` | `po_mtrig` |
| 80 | `ev_fm_amp_setup_stage` | `0x40059d56` | `po_ampstage` | `po_ampstage` |
| 81 | `ev_fm_amp_draw_names` | `0x4003685a` | `po_ampdraw1` | `po_ampdraw1` |
| 82 | `ev_fm_amp_draw_nibbles_a` | `0x400368ac` | `po_ampdraw2` | `po_ampdraw2` |
| 83 | `ev_fm_amp_draw_nibbles_b` | `0x40036946` | `po_ampdraw3` | `po_ampdraw3` |
| 84 | `ev_fm_amp_edit` | `0x4003ae40` | `po_ampedit` | `po_ampedit` |
| 85 | `ev_fm_amp_live_lane` | `0x4003af0a` | `po_amplane` | `po_amplane` |
| 86 | `ev_fm_octave_func` | `0x40051fce` | `po_octave` | `po_octave` |
| 87 | `ev_fm_slot_assign` | `0x400795ba` | `po_assign` | `po_assign` |
| 88 | `ev_fm_load_selector` | `0x40022686` (`jsr`) | `po_loadsel` | `po_loadsel` |
| 89 | `ev_fm_frame_source` | `0x4000d514` | `fm_source_dispatch` | `po_fmsource` |
| 90 | `ev_playback_page_resolve` | `0x40031ece` | `pg_resolve` | `pg_resolve` |

Guards and lengths match the FM Synth port (`sdk/octatrack/modules/synth` manifests) on OS 1.40C. Most site tails copy the displaced stock instructions and jump to the next stock address. Two resolver sites contain short branches that cannot be copied to a new address:

- `0x40031e62`: copy only the six-byte descriptor load, then jump to `0x40031ed6`.
- `0x40031ece`: copy only the four-byte table load, then jump to `0x40031ed6`.

## Stock tails (guards and continuation)

Each site `guard` is the SHA-256 of the first `length` stock bytes at the hook. Most tails replay `{"stock": length}` then jump back into stock; the two resolver tails omit the short branch as listed above. Addresses use Elekloader `main_load` `0x40000400`.

Verified against original **1.40C** stock (MAIN SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`, the fingerprint Elekloader pins for release **1.40C**): all **22** FM guards match. The original tail copied the short branches at two resolver sites. Those branches keep their relative displacements when moved into the base, so they jump into the new code instead of the resolver epilogue. The corrected tails omit the branches:

- `0x40031e62` (`ev_fm_lfo_page`): six-byte descriptor load, then `jmp 0x40031ed6`.
- `0x40031ece` (`ev_playback_page_resolve`): four-byte table load, then `jmp 0x40031ed6`.

Guards are the same hashes as `sdk/octatrack/modules/synth` `stock_guard` entries on 1.40C.

**`build_core.py --site-events` (same check as `octatrack:base --beta`):** every `events.json` `guard` on this branch matches **1.40C** stock (57 `base_sites` plus 69 owned table sites, including FM hooks 69 through 90).

**Base regeneration (28 Nov 2026, private 1.40C):** `npm run octatrack:base -- --stock … --beta --write` exits 0. Identity **`0fdb31fcb96b88c8…`**, package **`221e3241998bdffa…`**, browser `.bin` **`fad907f860f5084a…`** (847560 bytes). `node scripts/base-size.mjs --stock … --write` reports 847,544 of 851,712 container bytes, 4,168 free. The browser `.bin` matches `build_core.py` byte for byte.

**Unit (MKII, dev twin, 28 Nov 2026):**

| Build | `configurationHash` (prefix) | RAM boot | Notes |
| --- | --- | --- | --- |
| Dev twin **without** FM hooks 69-90 (same flags, `events.json` from `base/octatrack-next`) | `195915abb6bd4471…` | **Pass** | `device boot` reports `booted: base 195915ab…`; `stats` on dev base. |
| Dev twin **with** FM hooks 69-90 (earlier tip) | `38a6d03fba944b23…` | **Fail** | MODWERK **VEC:04** (`ADDR` in the base code area). The relocated resolver branches are a source-level cause candidate. Unit returns to flashed base after power cycle. |
| Dev twin with corrected resolver tails (this worktree) | `3afe6b2da03a30e6…` | **Pass** | MKII RAM boot reported `booted: base 3afe6b2d…`; the USB session reconnected and identified the same base. On saved B04, preflight passed. With no modules installed, PLAY, STOP and Part 1 to 2 to 1 completed. The unit reported stopped, and Part restore found working = saved with nothing to put back. |

**Not run on hardware yet:** FM Synth on subscribed hooks, LFO depth, and STOP with FM notes. FM Synth 0.1.5 still detours these sites and cannot load on this base; its package migration stays in follow-up. The Part switch above tested the base without a module.

`machine-ports.json` lists **synth** `subscribe` / `records`; **cx-osc** cites draft sources only (`sdk/drafts/cx-osc/`, #2293). Hook coverage passes: every hook has a declared user; placeholders cite `unused-hooks.json`.

Regeneration: `python3 -B sdk/machines/octatrack/events.py --write` (already run on this branch).

## STOP and MIDI note gates (call, every engine)

Indices **73**, **76**, and **77** use **`call`** with `results: notify`: every subscribed engine handler runs (FM Synth **40**, CX OSC **45** when both subscribe). No single taker; each module clears or gates only its own voices.

- **`ev_fm_transport_stop`** (`0x4000b2c8`): global STOP path. Each engine’s handler mirrors today’s `po_stop` for its tracks only.
- **Chromatic MIDI gates** (`ev_midi_chromatic_on_gate`, `ev_midi_chromatic_off_gate`): octave window tests before note-on/off. Each engine applies its own gate logic.

The other nineteen FM sites stay **`take`** (one winner per site).
- **Stock chromatic note-on/off** (`ev_midi_note_on` / `ev_midi_note_off` at indices **8** and **9**, not in 69-90) stay the migration target for `po_mon` / `po_moff`; this change does not move them.

Until packages migrate off detours, overlapping patches still win on the card image; hooks only serialize once the base ships and both subscribe.

## Follow-up (not in this base pull request)

1. **FM Synth package**: rename detour stubs to `mw_take_*`, extend `runtime.json` `subscribe` with `replaces`, drop the 22 `Detour`s (and the redundant `0x4000e746` / `0x4000dfd4` detours). Clear `rests` once migrated.
2. **CX OSC module PR #2293**: same migration; keep `conflicts: ["synth"]` until both packages ship without overlapping detours.
3. **Catalog listing**: merge `owner-compat-relation.json` into `compatibility.json` only with the same commit that lists CX OSC in `sdk/catalog.json`, if an interim `group-owned` row is still needed before packages migrate.
4. **Agent board**: claim indices 69-90 with `npm run pr:ready` before undrafting the base PR.
5. **Reserved 66-68**: replace neutral placeholders when CLYPS, #2261, and #2271 land; re-run `events.py` if indices shift.

## Checks run locally

```text
python3 -B sdk/machines/octatrack/events.py --check
python3 -B sdk/machines/octatrack/hook_coverage.py
python3 -m unittest sdk.tests.test_hook_coverage
```

All passed on this branch after the renumber.

Stock guard check (OS **1.40C**, `main_load` `0x40000400`): 22/22 FM sites match `events.json`; full registry 126/126 sites; tail jmp targets match synth (including `0x40031ece` → `0x40031ed6`).
