# CLYPS community engineering handoff
**22 November 2026 — early DRAFT, source-only, no physical hardware qualification**

## Product requirements

Original artistic target: eight independently replaceable Octatrack audio-track sequences, quantized to the shared stock musical boundary; sixteen references per track, sixteen global rows, row launch then individual-track override. One playing source **per** track; no simultaneous clip polyphony. Preserve the instrument's scenes, crossfader, p-locks, Parts, samples, recorders, other Modwerk modules and stock Arranger data.

Jannik Aßfalg's proposed integration approach, as conveyed by the artist: **track-local clip chooser on SRC and global Meta matrix on ARR**. This avoids a full-time alternative control layout. Grain's native SRC integration is a useful *UI pattern*, not a machine dependency. CLYPS is a project-level module, not a new instrument/machine.

## Current status by environment

| Capability | Earlier private native emulator evidence (owner-reported) | In this public PR |
| --- | --- | --- |
| Eight ordinary audio lanes | 16 source references per lane; T8 Master refused | Source transfer pending |
| 16 rows | Store/retrieve/override; volatile | Source transfer pending |
| Quantized launch | 624 events and 608 scheduling writes in the eight-lane fixture | Re-run pending |
| UI | SRC list with LEVEL/YES; ARR Panorama 8×4, Zoom 4×4 and Row Edit, native 128×64 captures | Transfer and rerun pending |
| Module install/remove | 20 emulator cycles and 27 project-file comparisons | Re-run pending |
| Native editing | Foreign-source editing locked after wrong-target regression | Still gated |
| Audio | One synthetic T1 FLEX PCM transition reported; T2 STATIC audio inconclusive | Hardware not tested |
| Compatibility | Grain/POLY8/VECTOR SRC screen restoration reported; Track Solo key conflict | Requires independent audit |
| Base ABI | Local callback extensions; current public base lacks them | Maintainer design decision needed |
| Timing | A one-tick diagnostic/queue observation difference remains | Reproduce before changing oracle |
| Physical MKII | No authorized installed/played CLYPS build | NOT TESTED / NOT_FLASH_CANDIDATE |

**The tested local integrated checkout is not automatically the same as this public branch.** This handoff is not a reproducible release. The local developer must import only reviewed source files, build against the exact updated Modwerk base, run its checks and supply exact source/package identities.

## Minimal musical acceptance

1. Prepare distinguishable source sequences in A01–A16 on the same bank and Part.
2. A global A01 plays; on selected T2, request A03 from SRC. Request becomes queued, then playing at the musical boundary; T1 and T3–T8 continue unchanged.
3. Open ARR Meta; observe current source T2=A03, other lanes=A01; enter Zoom and edit a row reference, with no stock pattern writes.
4. Launch row 05; every addressed lane switches on the qualified boundary, not on arbitrary UI refresh.
5. Override one track again; actual playing sources must reflect the override, not falsely show the last complete row.
6. Reenter native SRC of a track with Grain or other compatible machine; controls, sample pool and overlay must remain intact. Test Track Solo independently.
7. STOP, uninstall/undo, verify original stock Arranger, memory and project/Parts/scene/saved data.
8. Reject incompatible bases before activation. Native foreign-source editing stays locked until display, write, dirty flag, undo, timing and reload pass.

Emulator comparisons must include exact native event order/timestamp/queue and real panel frames. They do not establish analog audio quality or device CPU headroom.

## Subtasks for contributors (independent boundaries)

**A — Base/sequencer hooks (maintainer-owned):** decide how the stock scheduling-wrap and per-track audio source-selector entry points should be exposed as shared, versioned Modwerk events, with correct site ownership, task context, ordering, admission and public base compatibility.

**B — Timing verification (emulator):** independent before/after wrap fixtures and a trace of the request edge vs pending-state publication and actual musical commit. Investigate the historical tick 193 and 187-versus-188 observations with independent witnesses. Do not relax tests to hide anomalies.

**C — Panel/UI coexistence:** replace/condition the Meta TRACK navigation that conflicts with Track Solo; preserve stock TRACK gesture, SRC controls, Grain's page and sample pool, crossfader/scene, LEVEL master semantics, p-lock edit and popup ownership; test key-down/up and modifier handling.

**D — Reproducible build/import (source review):** port only code demonstrably reviewed and licensed from the private experiment to `sdk/drafts/clyps/`, with source pins and source-only test cases. Avoid importing a second SDK copy or private hook index 61. Run doctor/compat and native emulator fixtures.

**E — Native source editing (separate):** trace source pattern vs global pattern editor read/write, dirty/undo ownership. Do not enable the unsafe path in the integrated draft.

**F — Storage design (later):** versioned CLYPS row data and stock-compatible recovery; no Arranger RAM alias or unverified card format.

**G — MKII physical qualification (later, explicit independent authorization):** real hardware test and recovery, CPU cycles, memory, analog audio and proof of versioned build identity. Do not flash an emulator research image.

## Collaboration rules

- Claim the corresponding module/hook or issue through Modwerk's real Agent Board **before changing shared sites**; check outstanding claims and existing draft base PR. Do not claim an already-owned index.
- All code contributions to a published branch require appropriate source licence/provenance and attribution. Original author permission to experiment privately does not automatically authorize representing their module as your own.
- Keep only source, manifests, documentation, test fixtures without proprietary content, and legitimate captures. Never commit Elektron's OS, firmware binaries, dumps, personal projects or credentials.
- Keep this PR in DRAFT while it lacks code, exact build, hardware and a qualified compatible base. Review discussion is welcome; merge is not.
