# USB audible SPOS — MOP-157 coexist WAV A/B (DESKTOP, 24 Nov 2026)

Host tip after #126 (`241ac08bb`; main later moved). Keep-safe Undo only.
Twin: RAM `--dev` `5dc7059cb2564384…`. Tip-matched MWMS with mop73
`seq-pos` **620 B**. **No Accept. No lifecycle.** Protocol: mop110 +
mop133.

## Keep

Base `eb667962…`, **24**, Screen Off + Mute Modes (+ Play Modes). Media:
store `media/mop157-spos-undo/00-keep-before.json`.

## Preflight (coexist)

| Check | Result |
| --- | --- |
| Count | `0x27` |
| Dial max | **38** |
| PMTR → 37 | **Hit** |
| after_store | `0x40d24878` |
| Remapper `0x400a2d6a` | `4ef940d24860` (mop73 package jmp present this twin) |
| Peek A (PMTR 12) | words idle; `sp_en[0]=1` armed |
| Peek B (PMTR 37) | **moved** — words 7 unique; `sp_en[0]=1` |
| afterStoreCalls | 29722 |
| Counter gate | **pass** |

Honest (**MOP-166 strengthen**): remapper site shows package Detour bytes
on this twin (mop73 set: `4ef940d24860`); tip-matched base `ev_audio_step`
remapper coexistence (Play Modes order 40 → SPOS 50, **no** private Detour)
is **not** proven here. Do not relabel this twin as tip-matched remapper
proof. Dual-install Keep proof protocol (tip-only):
[`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md).

## WAV A/B (T1, 6 s, WDM-KS)

| Pair | Peak T1 | First onset |
| --- | --- | --- |
| A stock PMTR 12 | 0.04756 | 20912 |
| B SPOS PMTR 37 | 0.04757 | 20658 |
| Δ | ~null | **−254 samples** (~−5.8 ms @ 44.1 kHz) |

Peaks near-null. |onset| ≥200 → **audibleProven**. Honest: timing lag
under address-mode LFO; distinct-step jump colour **not** separately
verified this session. Peeks alone are **not** the audible claim.
AudibleProven is **not** a catalog pin and **not** dual-install Keep proof.

## Undo / leave

Undo → `[]`. Twin on RAM → **ASK JON power-cycle**. Next queue lever:
**#9 PROB**. Catalog still closed (MOP-83 / MOP-162). Media: store
`media/mop157-spos-undo/`.
