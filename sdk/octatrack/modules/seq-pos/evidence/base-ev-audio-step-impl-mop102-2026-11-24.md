# Base `ev_audio_step` implementation (MOP-102, tip-only)

Host tip after #72 / MOP-101 (`c80fe4b1`). Implements the MOP-101 design.
**No USB twin, no Accept, no lifecycle, no `sdk/catalog.json` force-list.**
Leaves MOP-100 USB queue and MOP-98 twin alone. PHAS stays off (MOP-99 / #71).

## What landed

| Piece | Detail |
| --- | --- |
| Event | `ev_audio_step` index 32, `call`, room 8 |
| Site | `0x400a2d6a` length 6 · guard `1cb5e6a4…c08433` · rejoin `0x400a2d74` |
| ABI | `int f(unsigned *step, unsigned track)` — `&d0`, `d5`; nonzero takes |
| Head | `lea 0x800064d0,%a0` + `mvz.b (0,%a0,%d5.l),%d0` |
| Orders | Play Modes 40 → Seq Pos 50 (both return 0 to chain) |

Generated: `runtime_events.s` / `.h`, `modwerk_events.h`, `EVENTS.md`, `site-events.json`.

## Module wiring

| Module | How | Notes |
| --- | --- | --- |
| Keep **Play Modes** | `machine-ports.json` subscribe + `callWrappers` → `pm_ev_audio_step` via `pm_step_entry`; replaces `pm_audio_step` | Native sources / owner approval untouched. Standalone `--octabam` `.mwrm` still Detours until an owner-approved version carries `runtime.json`. |
| Draft **Seq Pos** | `runtime.json` subscribe order 50 replaces `sp_audio_step`; `sp_ev_audio_step` under `MODWERK_EVENTS` | Draft only; not catalog-listed. Card Detour kept for non-event builds. |

## Tip assemble (no USB)

| Artifact | Tool | Result |
| --- | --- | --- |
| `elekloader/runtime_events.s` | `m68k-linux-gnu-as -mcpu=5475` | pass (`modwerk_site_400a2d6a`) |
| playmodes glue wrapper | `m68k-linux-gnu-as -mcpu=54455` | pass |
| `sdk/drafts/seq-pos/unit.s` | with / without `MODWERK_EVENTS=1` | pass |
| `npm run drafts:park-check` | — | pass |
| `npm run modules:compat` | — | 0 problems |

## Limits

- No USB twin / Undo dual-install proof (Play Modes + SPOS) — tip protocol
  only: [`dual-install-keep-proof-mop166-2026-11-24.md`](dual-install-keep-proof-mop166-2026-11-24.md)
  (MOP-166; **not** run). mop157 audible claim used package Detour bytes,
  not tip-matched remapper coexistence.
- Audible address-mode coexist Undo later landed separately
  ([mop157](usb-audible-mop157-2026-11-24.md) / #130) — jump-colour gap;
  not dual-install Keep proof.
- Published Play Modes standalone package still Detours until a follow-up owner-approved version; on a base that owns the site, that Detour package is refused (loader rule 4) — tip24 / Mute Modes / Screen Off unchanged.
- No Accept / catalog pin / force-list.
- No MOP-100 / MOP-98 work.

## Cross links

- Design: [`base-ev-audio-step-remapper-mop101-2026-11-24.md`](base-ev-audio-step-remapper-mop101-2026-11-24.md)
- Conflict note: [`playmodes-audio-step-conflict-mop92-2026-11-24.md`](playmodes-audio-step-conflict-mop92-2026-11-24.md)
- PHAS off list: [`../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md`](../../track-phase-offset/evidence/audio-step-remapper-relation-mop99-2026-11-24.md)
