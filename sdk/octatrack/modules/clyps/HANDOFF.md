## Current integration checkpoint · 23 November 2026

**DRAFT / NOT_FLASH_CANDIDATE / HARDWARE NOT TESTED.** Use the contributor
branch `integration/clyps-current-base-nov23` at
`5c32cbacd2b1efea3d70e9b543a9a43cfe634651` for native development.
Its parents are the cumulative #1910 revision and the preserved integration
candidate. The source-only module remains on Draft #1997.
[Build identities and current results](evidence/nov23-reliability.json).

Two builds reproduced MAIN, its symbol map, base.elemod and the complete proof.
The matched MKII T2 slice passed at wrap 90 (384 events, 400 writes,
786432 bytes free after OFF). Popup re-entry retained R04. The SDK
catalogue checker excludes the draft. The integration branch's release
package reconstruction check fails because the USB Audio recipe pins
the generated event header SHA-256 to the cumulative revision. Preserve
that review gate when proposing new event declarations.

The unchanged eight-lane strict grader passed at both 5 ms and 1 ms on
this MAIN. The old pair was reproduced byte for byte with absolute clock
witnesses. Its stock and module reads fell on opposite sides of the same
five frame-consumer clears. See [timing and MIDI results](TESTING.md).
The early/late diagnostic gates remain failed. Native MIDI note/CC semantics
matched on the two-lane fixture; candidate and fixed-A01 stock differ by
one running-status byte and by up to 64.1 samples in relative message-end
timing. No native MIDI source switch has been implemented.

The production-callback EOF fixture reproduces loss of the row-defined mask
after destination initialization. The isolated mock and offline codec are
under `offline/`. See [bank records and recovery](ROW_STORAGE.md).
No archive reader or writer is linked into the runtime.

Next engineering gate: inject a late abort on a disposable same-bank
project change and qualify a stock terminal callback. Confirm that the old
incarnation, bank and source epoch were restored before re-enabling R04;
otherwise keep selection suspended with the old generation recoverable.

# CLYPS contributor checkpoint · 23 November 2026

[Authoritative Bank and copy/paste requirements](BANKS_COPY_PASTE_REQUIREMENTS.md) · artist decision, 23 November 2026.

PR #1997 remains an experimental source draft. See [testing](TESTING.md) for per-build results. The 22 November checkpoint below is historical. The final module reproduced byte-for-byte (SHA-256 32ebca98345840f4e107550683f4fd14f2be35e5355df3d8933b7132f324aea9). On the pinned MKII base it passed popup re-entry, the matched T2 wrap, stock Arranger restoration, fail-closed admission and a real transition from GATE3/A to GATE4/B with the module installed.

The final eight-lane replay at 1 ms matched every ordered event and relative write. Its strict queue comparison failed at tick 193 (218/219 states matched). Full timing equivalence remains open.

## Maintainer findings

- Stock UI takeover discards the Row Edit draft, disarms row capture and yields new keys, the base ownership query and encoders. Keys already consumed retain their releases. A key pressed in a popup stays with stock through repeats and release, including when it closes the popup. ARR reopens the view after dismissal. The transition never calls the launch or row-commit paths.
- Rows represent local slot numbers in the current volatile session. The pre-load mask suspends foreign-source selection during a read of A. Wrap and tick preserve requests while A is being replaced. A read of B–P leaves selection active. The paired return releases this guard on either outcome and retains the row definitions. Each recall checks current grid compatibility. A relevant successful bank read can change what the same slot sounds like. Stock project initialization clears row validity, active lanes and pending work together. It can also occur during CHANGE and RELOAD. A failed whole-project operation that initializes stock state cannot be distinguished from a new epoch. The public callbacks supply neither a committed project identity nor a success mask. Confirm this boundary before extending the lifetime of rows. The module writes no bank, Part or project files.

## Artist contract and next design work

The historical artist handoff and idea register are in the private design branch `design/clyps-session-view-ui-2026-11-22`, files `docs/CLYPS_MODWERK_HANDOFF_2026-11-21.md` and `docs/CLYPS_IDEAS.md`. D18–D22 and I60–I64 were appended at `e376ba5`. The public summary below supports implementation review.

| Decision / idea | Status | Engineering consequence |
|---|---|---|
| D18 / I60 | Artist confirmed A–P × 16; storage layout proposed | Sixteen local rows per bank A–P, versioned project storage, extensible row count. Compare against 128 global rows. [Decision record](ROW_STORAGE.md). |
| D19 / I61 | Artist confirmed | A popup cancels only the unconfirmed row edit. Keep playback and pending launches intact. |
| D20 / I62 | Artist confirmed, future scheduler | A defined row can request CLIP(source), STOP (empty default) or explicit HOLD. STOP executes at the common boundary. Undefined rows issue no operations. Voice cutoff, FX tails, MIDI note-offs, representation and gestures remain open. |
| D21 / I63 | Artist confirmed, future scheduler | Select Restart or Legato at clip or row level. Both use the common launch boundary. |
| D22 / I64 | Artist confirmed, future editing | Edit Source changes all references. Duplicate & Edit requires an independent destination and must preserve the original and other references. Prove safe allocation, full-bank refusal, trig/p-lock/sample/slice-lock and metadata copying, retarget scope, undo and cross-bank behavior. E1 remains interlocked. |

| Future phase fixture | Acceptance at the common boundary |
|---|---|
| Restart 16→32 and 32→16 | Observe new source step 1 and unchanged phase on the other seven lanes. |
| Legato 16→32 and 32→16 | Agree the phase rule first, then compare actual next steps against an independent oracle in both directions. |
| Clip/row modes disagree or either mode is unset | Choose precedence/default with the artist before fixing expected values. |
| Independent scales, polymeter, looping and one-shots | Define clock domain and terminal behavior. Test requests either side of wrap and STOP cancellation. |

**Next gate:** on the agreed #1910 build, interrupt a disposable full-project load after stock has initialized the destination but before its final card operation succeeds. Keep separate R04 sentinels for the two project identities. Correlate request, resulting identity and outcome. Require zero cross-project recall and recoverable previous rows on failure before accepting persistence.

---

# CLYPS · chiusura indipendente del 22 novembre 2026

**Sessione chiusa. Modulo Draft, ABI proposta, hardware NOT TESTED / NOT_FLASH_CANDIDATE.** Questa verifica ha riletto sorgenti, build e ricevute conservate e rieseguito i grader offline. I replay MKII e le misure appartengono allo sprint precedente. Le sezioni storiche più sotto ne conservano il contesto.

| Riferimento | Identità verificata alla chiusura |
|---|---|
| [PR modulo #1997](https://github.com/repeat98/modwerk/pull/1997), aperta in Draft | `feature/clyps-community-draft`, checkpoint pre-verbale `93481e7c5509a914f6a8cdf8e9f5d140400ef2bd`. Sorgente consumatore testato con harness a `3478465af605575964c215dfef9e6b6fca8c27f3`. |
| Candidato pubblicato sul fork contributor | `integration/clyps-shared-sequencer` a `b3184dd5e19caaae8c88e2e002c6ab5204ac27d6`, incorpora `23f41e720e6f3d90ecf44f66780fa76324a5ff9f`. MAIN e simboli identici alla build di replay `18e28a172b7836199e17d6da987649eda1710be2`. |
| [PR cumulativa #1910](https://github.com/repeat98/modwerk/pull/1910), aperta in Draft | `base/octatrack-next` a `3375b212c55d85ef59ced4201f87d007d213c61c`. Quattro commit successivi alla base incorporata modificano il calcolo della riserva e la build. Questo HEAD richiede riqualificazione. |
| Agent Board | Claim modulo `5f767223-670c-414e-88cd-301fcc8b1a6e` e claim hook `6bc7b6d1-559b-462f-8c5b-a05185f120e3` attivi. 63/64/65 e capability ABI 9 `0x4000` attendono la decisione del maintainer. [RFC](https://github.com/repeat98/modwerk/pull/1910#issuecomment-7084762329) |

### Evidenza conservata

SHA-256 del modulo MWRM `8aa6ccef2afd7db7874de28e8f6948f948e70f1e8b94a2f023d22452e4e90423`; MAIN `6a9d7518ba7707e3763215ecc50be1c7eec09628b1bdf45b86b3f207a02b434b`. Ricontrollati 33/33 digest delle ricevute, eseguibile Octabam MKII, scheda sintetica preparata, MAIN positivo e negativo, mappa simboli e digest di configurazione. Ambiente OS 1.40C, Python 3.12 e toolchain ColdFire. OS e progetto seed sono input locali. La scheda MODWERK/GATE3 è costruita su copie temporanee. L'archivio locale è `CLYPS-shared-replay-evidence/rc3/` nella workspace. [Manifesto delle identità](evidence/shared-base-refresh.json) · [Ricetta riproducibile](NATIVE_REPLAY.md) · [Provenienza e licenze](PROVENANCE.md)

| Confronto su catture native | Esito riverificato offline |
|---|---|
| T2 da A01 ad A02 su A01 globale | PASS al wrap 90, 384 chiamate ordinate e 400 timestamp. SRC/ARR coerenti, altre sette tracce invariate, STOP annulla il pending. |
| Otto tracce | 624 eventi e 608 timestamp coincidono. Default FAIL al tick 193, 218/219 stati coincidenti. Osservatore appaiato a 1 ms PASS con 219/219 e tre troncamenti respinti dallo stesso grader. |
| Anticipato / RESTORE tardivo | Anticipato PASS, 576 eventi, 560 timestamp, 202 tick. Tardivo: coincidono 848 eventi, 816 timestamp e 298 tick. Richiesta a +1 ms del 187, pubblicazione a +5 ms del 187, T2 home al 282. FAIL del diagnostico che attende 188. |

Le ricevute archiviate documentano 128 combinazioni su sedici righe, rifiuto 259 prima dell'attivazione con zero callback e owner, pool ripristinato a 786432 byte e Arranger stock con 336 chiamate e 336 scritture dopo OFF. Track Solo in entrambi gli ordini, ritorno SRC di Grain e delle schermate POLY8/VECTOR, popup, pool, AMP/LFO/FX, Scene A/B, crossfader, MAIN 64 → 56 → 64 fuori da Meta e trig/p-lock AMP su HOME sono coperti nei percorsi descritti. FLEX T1 passa da picco 0 a 1930. STATIC T2 registra 2117 prima e 2337 dopo anche nel controllo stock: fallisce il silenzio pre-lancio, isolamento audio inconclusivo. [Dettaglio prove e limiti](TESTING.md)

5456 byte code/data, 164 BSS, 238 rilocazioni. Massimi osservati nel carico denso: 160 istruzioni emulate per selezione e 540 al wrap. Zero skip/shed nelle sei finestre. Frame locali del compilatore: 8 byte per callback del sequencer, 188 per draw. High-water totale dello stack e worst-case di cicli fisici non misurati. CI del checkpoint `93481e7c5`: 9 riusciti, 5 saltati. Compatibilità di catalogo archiviata: 44 moduli, 946 coppie, zero problemi. Doctor del draft rieseguito: FAIL, manca `octamod.module.json`.

### Unico gate per la prossima sessione

**Risolvere i due difetti di ownership con regressioni indipendenti.** Jannik ha compilato il draft e superato i quattro test circoscritti. Entrambi i difetti sono confermati dal maintainer e aperti sul sorgente ispezionato. La chiusura ha verificato il codice e la sua storia; la riproduzione dinamica dei difetti appartiene al prossimo gate. [Commento originale](https://github.com/repeat98/modwerk/pull/1997#issuecomment-7084719712)

1. **Row Edit interrotto.** Aprire un popup stock durante Row Edit, chiuderlo e premere/rilasciare ARR. In [check_src_context](live_module.c) il popup azzera la visibilità lasciando attivo `editing`; [module_key](session_controls.h) può consumare ARR nel ramo di editing nascosto. Per accettare la correzione, verificare uscita pulita o ripristino visibile, ownership del rilascio e ritorno allo stock. Dopo la chiusura del popup ARR deve sempre poter riaprire una UI valida.
2. **Invalidazione delle righe.** Definire una riga, notificare il pre-load di un banco estraneo e provare un caricamento fallito. [clyps_bank_load](live_module.c) ignora `mask` e `caller` e azzera `defined`, rendendo indisponibili tutte le sedici definizioni. Stabilire quale completamento riuscito autorizzi invalidazione o ripristino. Verificare conservazione delle righe su banco estraneo e fallimento, integrità del progetto e comportamento atteso sul successo pertinente.

Per chiudere il gate devono restare validi SRC/ARR, quantizzazione e recupero stock. Poi riprendere il coordinamento su #1910 e riqualificare il candidato sulla base concordata. E1 resta interlocked.

---

## Source integration update

The eight-track engine, UI implementation, executable checks and source inventory are available in this branch. Start with [TESTING.md](TESTING.md) and [PROVENANCE.md](PROVENANCE.md). The numbered work items below preserve the initial RFC and its original evidence dates.

# CLYPS community engineering handoff
**22 November 2026 — early DRAFT, source-only, no physical hardware qualification**

## Product requirements

Original artistic target: eight independently replaceable Octatrack audio-track sequences, quantized to the shared stock musical boundary; sixteen references per track, sixteen global rows, row launch then individual-track override. One playing source **per** track; no simultaneous clip polyphony. Preserve the instrument's scenes, crossfader, p-locks, Parts, samples, recorders, other Modwerk modules and stock Arranger data.

Jannik Aßfalg's proposed integration approach, as conveyed by the artist: **track-local clip chooser on SRC and global Meta matrix on ARR**. This avoids a full-time alternative control layout. Grain's native SRC integration is a useful *UI pattern*, not a machine dependency. CLYPS is a project-level module, not a new instrument/machine.

## Initial RFC snapshot (before the source publication)

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

## Original RFC work items (see TESTING.md for completed checks)

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
- Keep this PR in DRAFT while the dependent public build, maintained hook contract and physical qualification are outstanding. Review discussion is welcome; merge is not.
