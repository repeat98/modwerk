# ColdFire cycles / performance.json plan (MOP-170, tip-only)

Host tip after [#137](https://github.com/jonathanwardle1992-beep/modwerk/pull/137)
/ [MOP-168](qualification-fill-path-mop168-2026-11-24.md). Hub already lists
#8 SPOS as **audibleProven**
([#130](https://github.com/jonathanwardle1992-beep/modwerk/pull/130) /
[mop157](usb-audible-mop157-2026-11-24.md)) and catalog **SHUT**
([MOP-83](catalog-gate-mop83-2026-11-24.md) /
[MOP-113](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#catalog-gate-checklist-mop-113)).
**Docs only** — no USB twin, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent cycle counts, ISR µs,
idle %, stress outcomes, or readiness.

## Why this note

MOP-168 §2 named the `evidence/performance.json` fill targets and the
ColdFire frame budget. This sheet turns that cite into a **PROB-shaped
recipe** a self-hosted host can run later (ot_emu PC-watch + cfmeter flood
+ stress), citing the TRIG PROB path that already closed the same gates
([mop55](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md) /
[mop57](../../trig-prob/evidence/cfmeter-load-stress-mop57-2026-11-23.md)).
Cite pattern only — do **not** copy PROB numbers into Seq Pos.

Filling this plan is **not** a catalog pin. Measured cycles ≠
qualification ≠ dual-install Keep proof.

## Current stub (leave null)

[`performance.json`](performance.json) — `schema: 1`, kind `coldfire`,
module `seq-pos@0.1.0-experimental`. Every numeric field under `cycles` /
`load` / `stress` is **null**. Method text cites mop168 §2, which points
at this recipe (leave the stub bytes alone until a measured fill).

```sh
npm run perf:audit -- check sdk/drafts/seq-pos/evidence/performance.json
# Expected today: honest fail / unmeasured — never invent numbers to pass.
```

## A. Compose unblock (host with OS + upstream tools — not this tip)

Same trap PROB hit: empty `modules/*/upstream` in the Octabam cache breaks
any remix registry load.

```sh
npm run upstream:tools                  # verified checkout outside Git
# in ~/.cache/modwerk-upstream/octabam (or the cache path tools report):
git submodule update --init --recursive
make bus REMIX=test/cfmeter BUILD=<n>   # stock CF METER compose must succeed first
```

OS 1.40C stays local (`~/.cache/modwerk-native/section_3_MAIN_OS.bin` or
owner path). Never commit firmware, remix images, cards, or dumps.
Guide: [Performance](../../../../docs/module-guides/README.md#performance).

## B. Seq Pos measurement image (private remix)

Build a private (untracked) remix that links this draft's ColdFire unit —
prefer the tip-matched **event** path, not a private Detour alone:

| Path | Entry | Role for cycles |
| --- | --- | --- |
| Tip-matched remapper | `sp_ev_audio_step` (`MODWERK_EVENTS`, order 50) | Publication path — call into `sp_map` when `sp_en[t]` |
| Card / pre-event Detour | `sp_audio_step` @ `0x400a2d6a` → rejoin `0x400a2d74` | mop73 / mop157 lineage; mop166 honesty: Detour ≠ tip-matched base |
| LFO store arm | `sp_on_store` via contribute `after_store` | Arms `sp_en[t]`; not the per-step hot path |
| Map core | `sp_map` | Address remap when enabled; `.follow` when off |

```text
# Example shape (private upstream cache; adjust BUILD / key):
make bus REMIX=test/seq-pos BUILD=<n>
# Confirm objdump of the linked unit: sp_map / sp_ev_audio_step / sp_audio_step
```

Do **not** treat a Detour-only twin as tip-matched remapper proof
([mop166](dual-install-keep-proof-mop166-2026-11-24.md) /
[mop157](usb-audible-mop157-2026-11-24.md)).

## C. Static cycles (authored × 16 envelope)

Price the **longest authored path** through the hot map at the same
conservative ColdFire V4 envelope PROB used (**16** core cycles per
authored instruction — not chip wall-clock). Report the envelope and the
authored count in `cycles.method`.

### Count candidates (objdump after compose — do not invent)

| Path | When | What to count |
| --- | --- | --- |
| `sp_map` address-on | `sp_en[t] ≠ 0`, length > 0 | Longest through lea/frame, length clamp, playhead grow, `(high * len) >> 7`, return |
| `sp_map` `.follow` | enable off or length 0 | Short restore + return (not worst case) |
| `sp_ev_audio_step` wrapper | tip-matched | Stack load of `*step` / track + `bsr sp_map` + store back + `moveq #0` |
| `sp_audio_step` wrapper | Detour path | `mvz.b` playhead + `bsr sp_map` + `jmp` rejoin (exclude stock after rejoin) |
| `sp_on_store` | LFO frame when PMTR=SPOS | Arm path only — separate from per-step map; cite if budgeting LFO-frame cost |

`cycles.static` = authored_worst × 16. Leave **null** until the objdump
count exists. Unit remains `cycles/event`.

Worst-case narrative (TESTING.md once measured): **one map per enabled
audio-track step** + redirected lea / store→apply once wired **per LFO
frame when PMTR=SPOS**.

## D. Measured cycles (ot_emu PC-watch)

Mirror mop55 method; adapt symbols to Seq Pos:

1. `ot_emu --mkii` on the private Seq Pos remix (DSP flag only if the
   cfmeter project needs it — Seq Pos itself is ColdFire-only).
2. `--watch-pc` on every instruction of the chosen hot path
   (`sp_map` + wrapper from the same image's objdump).
3. Drive events with a register-correct trampoline if `callAsMain` stack
   ABI cannot load track/`*step` the way the unit expects (PROB used a
   DRAM `moveq`/`jmp` trampoline for `d0`/`d1`).
4. Cases to record (event counts + authored per event):
   - Address **off** (`.follow`) — baseline
   - Address **on**, SPOS mid (e.g. high byte ~64), length 16
   - Address **on**, SPOS extremes 0 / 127
   - Optional: length grow near `MAX_LEN` (64)
5. Worst event authored + wrapper = measured; compare to static.
6. State honestly: emulator instruction counts ≠ chip timing.

Fill `cycles.measured` / `cycles.budget` only from that run. Budget reminder:
module may add at most **10%** of a **362.8 µs** frame to the interrupt and
**10** points of idle vs stock under the same flood (load block below).

## E. Load benchmark (cfmeter stock vs module)

Mirror mop57:

| Role | Remix shape | Notes |
| --- | --- | --- |
| Stock | `test/cfmeter-port` (or successor) | CF METER + stock FX; no invented idle if port lacks CF METER IDLE |
| Module | same + Seq Pos | Tip-matched event path preferred |

```text
# Same flood both images (~12 s / four 2 s cfmeter.py --dump cycles):
# note on/off + CC on ch 1–8 (+11) + clock ~240 BPM; ~3,000 three-byte/s floor
cfmeter.py --dump
```

Fill when observed:

| Field | Source |
| --- | --- |
| `load.frameUs` | Keep **362.8** |
| `load.stockLongestUs` / `moduleLongestUs` | Largest per-cycle `isr max` across the four dumps |
| `load.stockIdlePercent` / `moduleIdlePercent` | Meter slot — record 0 honestly if the port has no IDLE |
| `load.method` | Host, date (Europe/London), upstream HEAD, BUILD ids, flood recipe, emulator-not-hardware |

## F. Stress (≥60 s)

On the **module** image under ot_emu:

- Dense flood (≥ guide ~1,000 msg/s; PROB used ~3,000) + clock
- Eight audio tracks, up to **three** LFOs on SPOS, dense trigs
- Transport STOP/START with a held note mid-run; optional Part select
- Record `floodMessagesPerSecond`, `clockBpm`, `seconds`, `stuckNotes`,
  `hangs`, `dropped` (+ explanation) honestly — zeros only when observed

## G. Write-back checklist (after measurement — not this tip)

1. Update [`performance.json`](performance.json) numeric fields + method
   prose (cite host, image, objdump/PC-watch/cfmeter commands).
2. `npm run perf:audit -- check sdk/drafts/seq-pos/evidence/performance.json`
3. Paste the judgement table into [`TESTING.md`](../TESTING.md)
   Performance.
4. Point qualification `cycles` method at this filled record
   ([mop168 §1](qualification-fill-path-mop168-2026-11-24.md#1-testsqualification-stub-path)).
5. Still **no** `sdk/catalog.json` pin until dual-install **words-move**,
   filled `tests.qualification`, SETUP PMTR media, and owner review close
   (inventory + tip remapper already Proven mop167).

## Remaining gates vs Keep catalog SHUT (cite only)

| Gate | Status after this tip |
| --- | --- |
| Audible address-mode (coexist Undo) | **audibleProven** (mop157); jump-colour gap |
| Tip-matched base remapper (no private Detour) | **Proven** (mop167 — `4ef940ac7942`) |
| Dual-install inventory (PM + SPOS) | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** ([mop184](usb-words-move-mop184-2026-11-24.md); T1 unique **33**; mop169 stall cited) |
| `tests.qualification` + owner review | **Not started** — [mop168](qualification-fill-path-mop168-2026-11-24.md) outline; [mop176](qualification-fill-recipe-mop176-2026-11-24.md) recipe |
| Measured cycles (`performance.json`) | **Filled (emulator)** — static/measured **752**; load 287.8/287.8 idle 0 ([mop179](usb-cycles-mop179-2026-11-24.md)); stress **62 s Proven REACHED** ([mop181](usb-stress-mop181-2026-11-24.md)); static dig [mop178](usb-cycles-mop178-2026-11-24.md); recipe [mop170](cycles-performance-plan-mop170-2026-11-24.md) |
| SETUP PMTR=SPOS monochrome `media/` + provenance | **Proven** hardware SETUP label [mop172](usb-setup-pmtr-mop172-2026-11-24.md) (recipe [mop171](setup-pmtr-provenance-plan-mop171-2026-11-24.md)) |
| FUNC+TRACK toast pages | **USB miss** / still **Open** [mop175](usb-toasts-miss-mop175-2026-11-24.md) (no publication toast PNGs) |
| Standalone Play Modes Detours → `runtime.json` | **Stalled** — tip recipe [mop183](playmodes-runtime-mop183-2026-11-24.md); needs owner-approved Play Modes version + package rebuild / USB; published 0.1.1 `.mwrm` still Detours |
| `sdk/catalog.json` | **Must stay absent** |

## What this tip does **not** claim

- That ColdFire measured / cfmeter / stress numbers exist for Seq Pos (static **752** Partial mop178).
- That `perf:audit -- check` passes on filled measurements.
- That a private remix compose was run on this tip host.
- Dual-install words-move, qualification fill, or toast-page captures.
- Any `sdk/catalog.json` pin / force-list.

Hub sync: [MOP-224](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-jump-deadend-mop-224)
(prior [MOP-182](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-publishability-gates-after-cycles-measured-mop-182)).

## Cross links

- Stub: [`performance.json`](performance.json)
- Parent fill path: [`qualification-fill-path-mop168-2026-11-24.md`](qualification-fill-path-mop168-2026-11-24.md) §2
- PROB recipe (cite only): [`../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md`](../../trig-prob/evidence/otemu-cycles-mop55-2026-11-23.md),
  [`../trig-prob/evidence/cfmeter-load-stress-mop57-2026-11-23.md`](../../trig-prob/evidence/cfmeter-load-stress-mop57-2026-11-23.md)
- Claim honesty: [`usb-audible-mop157-2026-11-24.md`](usb-audible-mop157-2026-11-24.md)
- Catalog ceiling: [`catalog-gate-mop83-2026-11-24.md`](catalog-gate-mop83-2026-11-24.md)
- SETUP provenance recipe: [`setup-pmtr-provenance-plan-mop171-2026-11-24.md`](setup-pmtr-provenance-plan-mop171-2026-11-24.md)
- Hub this tip: [MOP-170](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-coldfire-cycles-performance-plan-mop-170)
- Hub SETUP tip: [MOP-171](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-setup-pmtr-monochrome-capturejson-plan-mop-171)
