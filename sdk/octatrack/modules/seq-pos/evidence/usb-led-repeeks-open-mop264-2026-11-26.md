# SPOS Keep-restore LED re-peek — Open (MOP-264)

Host: DESKTOP-JH92J0W · Europe/London · 26 November 2026  
Tracker: **MOP-264**. Post power-cycle Keep restore, then Keep-safe Undo twin + LED re-peek.  
**No Accept. No lifecycle. Dens stay parked.** Catalog already **PINNED**.  
Tip-only LED-stick call-site dig was **not** opened — tip24 Keep was present.

## Keep restore (priority)

| Check | Result |
| --- | --- |
| tip24 Keep base | **`eb6679620d0c9ed7…`** present after Jon PC |
| Keep inventory | **25** modules (Mute Modes … Tempo LFO); **SEQ POS absent** |
| Tip dig fallback | **Skipped** (Keep present) |

## Twin + peeks

| Gate | Result |
| --- | --- |
| Tip twin | **`cdfb0c2755afedfd…`** RAM boot (Undo-only) |
| Tip UI site `0x4009b2b0` | **Loaded** — `4ef940ac791e` (jmp) |
| Tip audio site `0x400a2d6a` | `4ef940ac796e` |
| Dual inventory | Play Modes + SEQ POS (+ LFO peers) |
| Dial-max / toast bind 0 / 127 | **PASS** — expected steps **0** / **15**, `lenT1=16`, `enT1=1` |
| LED byte `0x800065b5` stick | **Fail** — unique≈12 A/B/C; mode≈3–4 (~10%); marched |
| Stock PLAYHEAD `0x800064d0[t]` | uniqueT1=**1** this run (vs mop263 unique=4); still not remapped LED |
| LED / playhead UI follows remapped step | **Open** — do **not** invent PASS |
| Dens A/B reopen | **None** (parked) |
| Accept / catalog invent | **none** |

**Honest class: Open (LED stick).** Same class as mop263: tip wire + toast/step-map PASS; master LED byte still marches under address. This run’s PLAYHEAD sample did not march (uniqueT1=1) while LED still marched — reinforces that `0x800065b5` is not sticking to remapped steps 0/15.

## What ran

1. Confirmed tip24 Keep after power-cycle (`eb667962…`, inv 25).
2. Keep-safe Undo RAM boot tip twin `cdfb0c27…`.
3. Undo trial coexist → toast OFF / SPOS 0 / SPOS 127 peeks.
4. Sample PLAYHEAD vs LED byte (~48×40 ms) per state.
5. Undo → `[]`. **ASK JON power-cycle** to restore Keep.

## Exact peeks (B = SPOS 0, C = SPOS 127)

| State | highT1 | en | len | expectedStep | playheadUnique | ledUnique | ledMode / share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A OFF | — | 0 | — | — | 1 | 12 | 4 / ~0.10 |
| B dest 0 | 0 | 1 | 16 | **0** | 1 | 12 | 4 / ~0.10 |
| C dest 127 | 127 | 1 | 16 | **15** | 1 | 12 | 3 / ~0.10 |

## Package / twin

| Field | Value |
| --- | --- |
| Twin | `cdfb0c2755afedfd…` |
| `seq-pos.mwrm` | `e797febe…` / 1268 B |
| `playmodes.mwrm` | `e86ca3b258…` / 15986 B |
| EVENT_ROW | `0x40ad6e86` |
| Undo leave | **`[]`** (twin base still on RAM) |

## Next levers (not this dig)

1. Confirm which `0x4009b2b0` caller feeds the trig-LED refresh (master/`track<0` vs track 0); master byte may ignore SPOS audio-track remap.
2. Dens A/B stay **parked** until LED stick PASS.
3. Tip-only call-site dig only if Keep is missing after a future PC.

## Artifacts

Private: `Projects/modwerk-builds/mop264-led-stick/publish/`  
Store media: project `media/mop264-led-stick/`  
Store status: project `internal/mop264-keep-restore-led-repeek.md`

## Cross links

- Prior Open: [`usb-led-peeks-open-mop263-2026-11-26.md`](usb-led-peeks-open-mop263-2026-11-26.md)
- Tip wire: [`base-ev-ui-step-impl-mop262-2026-11-26.md`](base-ev-ui-step-impl-mop262-2026-11-26.md)
- Dig: [`playhead-led-firmware-dig-mop261-2026-11-26.md`](playhead-led-firmware-dig-mop261-2026-11-26.md)
