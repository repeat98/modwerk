# Play Modes Detours → `runtime.json` (MOP-188, owner-authorized tip)

Owner-authorized follow-up to [mop183](playmodes-runtime-mop183-2026-11-24.md)
("lets do it"). Applies the Mute Modes / Repitch migration for Keep Play
Modes' SPOS-conflicting audio-step Detour → module `runtime.json`.
**No Accept / lifecycle. Catalog SHUT. USB Undo dual-install verify follows tip.**

## Verdict

| Question | Answer |
| --- | --- |
| Play Modes `runtime.json` on tip? | **Yes** — `ev_audio_step` → `pm_ev_audio_step` order 40, `replaces` `pm_audio_step` |
| Version | **0.2.1-experimental** (above 0.2.0) |
| Owner approval | `sdk/playmodes-build-approval.json` bound to exact version + `sourceSha256` (`owner-approved-update`; retained UI 0.2.0) |
| Machine-ports subscribe/callWrappers | **Retired** — module owns the subscribe |
| Published standalone `.mwrm` | Still **0.1.1-experimental** Detours (`lagsBehind` **0.2.1**); recipe rebuild is separate |
| Catalog force-list? | **No** |
| Invented Detour behaviour? | **No** — MOP-102 `callWrappers` `step_ptr_track` body only; MIDI/rebuild/LED stay Play Modes' own |

## Gate after this tip

| Gate | Status |
| --- | --- |
| Play Modes tip `runtime.json` wire + owner approval | **Landed** (this pass) |
| USB Undo dual-install with Seq Pos on tip-matched base | **Pending** after tip (Jon authorized; Keep tip24 restored; Undo-only) |
| Published 0.1.1 `.mwrm` drops Detour | **Open** — needs reviewed standalone recipe rebuild |
| `sdk/catalog.json` | **Must stay absent** |

## Cross links

- Recipe stall: [mop183](playmodes-runtime-mop183-2026-11-24.md)
- Remapper: [mop102](base-ev-audio-step-impl-mop102-2026-11-24.md) / [mop101](base-ev-audio-step-remapper-mop101-2026-11-24.md)
- Conflict: [mop92](playmodes-audio-step-conflict-mop92-2026-11-24.md)
