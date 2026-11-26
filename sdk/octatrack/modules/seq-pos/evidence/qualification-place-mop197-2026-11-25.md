# Place `tests.qualification` (MOP-197, tip-only — mop176 §G)

Host tip after [MOP-196](usb-toasts-prove-mop196-2026-11-25.md) /
[#166](https://github.com/jonathanwardle1992-beep/modwerk/pull/166) toast
USB **Proven** + [MOP-192](qualification-memory-mop192-2026-11-24.md) /
[#162](https://github.com/jonathanwardle1992-beep/modwerk/pull/162) memory
**372** (pre-wire) / [MOP-195](toast-tip-wire-mop195-2026-11-25.md) tip
re-count **908** + [MOP-191](qualification-owner-fill-mop191-2026-11-24.md)
owner fill. Follow
[mop176 recipe](qualification-fill-recipe-mop176-2026-11-24.md) §G.
**Tip-docs only** — Keep tip24 free; no twin / Accept / lifecycle; no
`sdk/catalog.json` force-list. Do **not** invent numbers.

## Why this note

mop176 §G left `tests.qualification` **absent** until owner-reviewed
reports exist. Toast was the last publication media gap (mop175/185/194 →
mop195 wire → mop196 prove). Memory integers exist (372 then tip-wired
908). This tip places the complete ColdFire qualification object into
[`qualification.example.json`](../qualification.example.json) **and**
`octamod.module.json` `tests.qualification` after
`requireModuleQualificationForPublication` passes.

## What was placed (proven evidence only)

| Piece | Source |
| --- | --- |
| Cycles **752** / budget **4790** `emulator` | mop179 / mop181 / mop186 / mop191 |
| Memory **908** sharedBytes (`sdram`; image 848 + bss 60) | mop195 tip wire (mop192 was **372** pre-wire) |
| Hardware functional `reported` | mop157/167/172/184/188/189/196 digs |
| SETUP + toast PNGs | mop172 + mop196 |
| Remapper / words-move / Play Modes | mop167 / mop184 / mop188+189 |
| `sourceSha256` | Recomputed native inventory `427287b15a4c5a9e…` |
| `imageSha256` | mop172 SETUP OS image `34695b60…` |
| `tests.evidenceRevision` | Tip wire merge `8816abca1…` (#165) |

Also fixed toast media `otUi.shows` from invalid `"toast"` → `"controls"`
so `parseModuleDocument` accepts the publication media set.

## Remaining gates vs catalog SHUT (after this tip)

| Gate | Status |
| --- | --- |
| Tip-matched remapper + dual-install inventory | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** (mop184) |
| Measured cycles / stress ≥60 s | **Filled (emulator)**; stress **62 s Proven REACHED** (mop181) |
| SETUP PMTR=SPOS monochrome | **Proven** (mop172) |
| Play Modes Detours → `runtime.json` | **Proven** (mop188/189; 0.1.1 `.mwrm` still Detours / `lagsBehind`) |
| FUNC+TRACK toast pages | USB **Proven** (mop196) |
| Memory integers | **Measured** — tip-wired **908** (mop195; mop192 **372** lineage) |
| `tests.qualification` + owner review | **Placed** (this sheet) — object in manifest; publication parse OK |
| Jump-colour under address mode | Still **Open** (mop157 peaks near-null) |
| `sdk/catalog.json` | **Must stay absent** / **SHUT** |

## What this tip does **not** claim

- A catalog pin / force-list.
- Jump-colour proof.
- Chip wall-clock or hardware eight-track stress.
- Accept / Keep / lifecycle.
- Promotion out of `sdk/drafts/`.

Hub: [MOP-197](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-tests-qualification-place-mop-197)
(parent [MOP-196](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-functrack-toast-usb-prove-mop-196);
recipe [MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176)).
