# Shared Modwerk link and runtime for Digitakt II and Digitone II

**Status: design for joint review by Kári (`karigardarsson`), Lukas
(`prodbysmolec`) and Jannik (`repeat98`).** Repository review: 27 November 2026,
main `faff374b9d136f48d4e0159fe480f8f65d27cacc`. This document implements nothing.
The proposed file layout and responsibility split need both contributors'
agreement before new link, loader or page code. They are not board claims.

## Scope and owner decisions

DT2 OS 1.17 and DN2 OS 1.12 will use one implementation of the USB MIDI link,
diagnostics, runtime integration, TypeScript client, unit page and MCP device
tools. Each recipe selects its machine/OS bindings and command table. Shared
changes must pass both machines' checks. Review each other's shared changes on
separate contributor branches; never push to the other contributor's branch.
This follows the owner's [shared-design instruction][shared-instruction] and
[DN2 handover][handover]. The owner also [confirmed the DT2 work for Kári][dt2-go].

| Area | Owner decision and review boundary |
| --- | --- |
| Release base | Bounded identity, screen, diagnostics/log reads and runtime upload for RAM trials. Identity must name the exact base build and live module set. The current DN2 `ident` is not yet that complete identity contract. |
| Development base | Add remote keys/encoders, RAM boot, freeze and boot diagnostics. Enforce source selection and command refusal on the device; a client cannot enable development features in a release base. Preserve DT2's existing type-7 development machine fixture. |
| Try, Keep and Undo | Try runs in RAM; Undo restores the pre-trial set. Power cycling restores the flashed set. Before two slots, musician-facing Keep builds and verifies the chosen set into a base image and uses the stock OS upgrade, with physical YES on the unit. Today's upload-controller ACCEPT and developer `keep` only retain RAM modules until power-off; they are not persistent Keep. |
| Two-slot updates | Research first: a separate Docs PR must establish each target's flash layout, slot B, boot selection and failed-slot fallback. Obtain the owner's approval before flash code. After approval and qualification, Keep writes the inactive slot with at most one restart. The Octatrack's layout is a reference, not a DT2/DN2 layout. |
| Recovery | Preserve stock recovery independently of Modwerk, the browser and the USB link. The owner specifies FUNC + TRIG 4 and the stock OS SysEx over MIDI DIN. Verify and record the exact procedure on each model before release; this design is not a new recovery run. Refer non-stock flash writes, interference with recovery and decisions outside the handover to Jannik. |

Reference: [Octatrack two-slot base](OCTATRACK_TWO_SLOT_BASE.md).

## Starting point and evidence

These are source snapshots and existing contributors' reported unit results.
They do not establish hardware qualification of an extraction or a DT2 port.

| Source reviewed | State and work to carry forward |
| --- | --- |
| DT2 main and `base/digitakt-ii-next` (`e18ca55eb`) | Cumulative base [#1999][dt2-base] is already merged into main. Both inspected recipes retain the OS 1.17 type-7 SAMPLE fixture and have no native link/runtime entry. Preserve the cumulative base work. [#2325][preflight-pr] merged as `e15800c93`: retain its stock-free bindings, offline preflight and synthetic tests. Fresh preflight on main `faff374b9` and the cumulative tip checks 47 sites, nine guards and all three high-speed USB profiles. `runtimeReady` remains false. Native transport, identity discovery and runtime bindings remain unqualified. |
| DN2 [#1767][dn2-base], `c15ec02b3` | Open cumulative base draft. OS 1.12 reuses `core-dt2` 1.1 through `source: digitakt-ii` with its own sites and three provenance-checked overlays in `copies/core-dt2/`: `mod.json`, `store.s`, `store.c`. Preserve the plain build, binding, image fitting and disabled download approval. Earlier reported runs include boot, hooks, project persistence and stock restore; the owner requires the release build on two units with image SHA-256s. |
| DN2 development stack | Open [#1763][link-pr] `7419aeda9`, #1817 `5d37e3f2c`, #1820 `43a464fd1`, #1821 `1a68b5ea3`, [#1842][loader-pr] `cfc60fb5d`. Use #1842 as the cumulative source reference and carry later fixes forward. The [owner's checklist][unit-checklist] still requires the changed heads' exact-package unit session and descriptions. Older unit results do not qualify those changes. |
| Installer [#1819][installer-pr], `4f02c3bf5` | Open draft with stock USB upgrade, cancellation handling and an owner-controlled install flag. Preserve the panel/hook; current-head page sends answered with YES and NO still need the image SHA-256 and unit record. |
| Voice Spread [#2003][voice-spread-pr], `9e4dd6aac` | Merged into `base/digitone-ii-next`. The [later owner decision][voice-spread-decision] puts the module and preview status in #1767 on its way to main. It supersedes the handover's earlier separate-main-PR step. Plain-base, persistence, listening and lock/LFO gaps must close in a follow-up before #1767 ships. |
| MCP [#1846][mcp-pr], `286ee99d0` | Open draft. Preserve line locking, per-request log turns, keepalive and uncertain-acknowledgement handling. Its head still carries older DN2 reads and machine-specific tools; reconcile it with the newer bounded link and [#2126][shared-mcp-pr], already on main. |

The dated [DT2 transmit investigation](verification/2026-11-26-digitakt-ii-bounded-transmit.md)
and [DT2 link guide](../sdk/machines/digitakt-ii/LINK.md) remain the provenance
and stopping conditions for the native port. Source/static, host, emulator,
other-user hardware and our own hardware results stay explicitly separate.

## Proposed responsibilities

This is a proposed split for Kári and Lukas to accept or revise in this Docs PR.
The board still has Lukas's wanted task for the DN2 link and sharing with DT2;
Kári's earlier adapter question is unanswered there. Jannik's DT2 go-ahead and
shared-design instruction establish the direction, not acceptance of this table.
After agreement, record the exact pieces on the [agent board](AGENT_BOARD.md).

| Piece | Proposed lead | Shared review and handoff |
| --- | --- | --- |
| Finish existing DN2 stack and exact-head unit records | Lukas | Jannik's checklist and ordered cumulative-base integration; Kári does not duplicate those PRs. |
| Shared native link/diagnostic extraction from the DN2 work | Lukas | Kári reviews the DT2 binding seam, bounded execution and both-machine regression evidence. |
| DT2 RX/TX, DMA lifetime/reset and OS 1.17 bindings/tests | Kári | Lukas reviews the shared interface; Jannik reviews native resource and base ownership. Preserve the imported core and Claptom's base/services. |
| Shared runtime glue; per-model runtime bindings | Lukas leads common glue and DN2; Kári leads DT2 bindings | Agree one adapter contract and review both targets; no copied DN2 addresses or claimed DT2 DSP support. |
| Shared TypeScript client and diagnostic identity carrier | Kári, using Lukas's client | Joint review of backwards compatibility, capability reporting, line scheduling and HELLO identity consistency. |
| Shared beta unit panel and persistent Keep flow | Kári | Lukas reviews DN2 behavior; Jannik retains install/download and release approval. |
| Shared MCP integration | Lukas, carrying #1846 | Kári reviews DT2 capabilities and tests; reuse main's device tool names and review gates. |
| Recovery, flash proposal and release approval | Each contributor records their model; Jannik approves policy/release | Separate two-slot Docs proposal and owner approval before any new flash writer. |

## Proposed file map

Destinations below are proposals, not files already on main. Keep the recipes
as the source of truth for addresses, sites, release/dev selection and supported
features. Extract existing behavior before extending it; avoid a second framework.

| Shared destination | Existing implementation to reuse | Per-machine inputs |
| --- | --- | --- |
| `sdk/runtime/elektron/link.c`, `link.h`, with development dispatch in `link-dev.c` | [DN2 `base/link.c`][dn2-link-source]: MWL validation, bounded receive storage, request dispatch and upload framing. Review reply scheduling at the asynchronous TX seam. | `base.json` command/capability table and release/dev sources; thin `base/link-bindings.c` and `link.s` for router ABI, USB source IDs, sender/completion/reset, framebuffer and development panel/boot bindings. |
| `sdk/runtime/elektron/diag.c`, `diag.h` | DN2's Octatrack-compatible records and bounded capture. Keep `src/engine/elekloader/device-log.ts` as decoder. | Tick/frame cadence, input IDs and proved counters. Meters/self-tests are conditional capabilities. |
| `sdk/runtime/elektron/runtime.c` | Common parts of [DN2 `base/runtime.c`][dn2-runtime-source] and its upload-to-loader integration. Stage existing `sdk/runtime/loader/`, `sdk/runtime/upload/` and `sdk/runtime/logging/freestanding.c`; reuse #1842's builder identity generation. | Thin `base/runtime-bindings.c` and recipe symbols for stopped state, pool/staging, cache, interrupt operations, code/task spans, core event/bitmap adapters and DSP capabilities. |
| `src/engine/elektron/elektron-link.ts` | Broaden `dn2-link.ts`, retaining main's `link-wire.ts`, `upload-session.ts`, `upload-wire.ts` and `device-log.ts`. Carry framing/refusal tests forward. | A host table keyed by machine ID for USB MIDI port pairing, commands, response shapes and status wording. Intersect the selected profile with the connected build's capabilities. |
| `src/components/ElektronUnitPanel.tsx` | `OctatrackHub.tsx` interaction, `BaseDialogFrame.tsx` first-install flow and #1819's `DigiBuildPanel.tsx`, `UsbUpgradePanel.tsx`, `useUsbUpgrade.ts`; mount through `src/devices/MachinePages.tsx`. | Model name/ports, approved build and fit policy, recovery copy and supported meters. Preserve `hasBetaUi` and owner-controlled download/install approval. |
| `scripts/frontend-mcp.mjs` and a common Elektron MIDI adapter | Main's `--elektron-midi`, `--elektron-images` and device tools from #2126. Carry #1846's `LineLock`, per-exchange turns, keepalive and uncertain-result behavior into the shared client/session boundary. | Port matcher and capabilities. DN2 `device_load` stays unsupported until a meter exists; apply the same rule to DT2. Retain `device_status`, `device_log`, `device_review`, `device_trial`, `device_keep`, `device_undo`. |

`scripts/machine-base.py` already stages shared runtime sources and guarded
machine overlays. Its `layout_digest`/`write_identity` extension is still in
#1842, not main: carry that implementation forward rather than recreating it.
Keep `base-binding.json`, `machine.json`, `GOAL.md`, `LINK.md`, verification and
recovery records under each machine, with its existing core overlays and catalogue
behavior. Main's `src/engine/elekloader/dt2-link.ts` is an image linker, not a
native device transport. Reference: [machine recipe](MACHINE_RECIPE.md).

## USB transport and native bindings

Use MWL v1 over the existing stock USB MIDI endpoints. Main's
[`link-wire.ts`](../src/engine/elektron/link-wire.ts) supplies framing and packing:
`F0 7D 4D 57 4C 01`, a 7-bit sequence, command, payload, `F7`. A reply echoes
the sequence, sets command bit `0x40` and inserts status before the payload.
Scalar u32 values use five least-significant-first 7-bit bytes; byte blocks use
the existing high-bit-prefix packing. Match command and sequence and validate
decoded payload lengths. Serialize complete request/reply exchanges on the paired
line; a long capture must yield between chunks so keepalive can take its turn.

| Operation | DN2 IDs to preserve as starting table | Shared behavior |
| --- | --- | --- |
| Identity and bounded reads | `ident 0x01`, `screen 0x20`, `diag 0x22`, `log 0x24` | Eight 128-byte screen parts from one 128x64 snapshot, matching the copy number. Aligned log parts must share a sequence; re-read part zero and verify its header/sequence against the completed capture. Preserve the last complete capture on failure. |
| Upload | `0x30` | One packed controller frame and packed 144-byte response. Use an independently verified per-machine chunk limit; DN2 CLI uses 2,048-byte chunks and one pending upload slot. DT2 capacity is unverified. |
| Development controls | `disarm 0x02`, `key 0x10`, `enc 0x11`, `release 0x12`, `ramboot 0x14`, `freeze 0x23`, `bootdiag 0x25` | Release refuses them. Development prioritizes physical input and services deferred releases. At stock flash confirmation, guard already queued remote events at dispatch as well as incoming requests. The remote YES key-up case is still an open unit check, not an observed flash. |
| Refusals | `0 OK`, `1 disarmed`, `2 bad request`, `3 busy`, `4 bounds`, `5 physical-input priority`, `6 stock confirmation pending`, `7 staged-image mismatch` | Retired `mem 0x21` and unknown commands return 2. Malformed/out-of-range requests leave stock traffic/state intact. Ignore link requests from DIN. Preserve existing statuses while extending capabilities. |

The MIDI-task hook copies complete, size-bounded requests into owned storage and
returns promptly while stock routing continues. Decode/service work has a fixed
budget in the designated UI task. A non-reading host must not block it. The TX
interface must distinguish not-admitted from accepted/in-flight: retain accepted
payload storage until ownership actually ends, and stop taking more work when
that storage is occupied. Dropping a diagnostic reply must not later replay a
state-changing upload operation. Agree timeout/retry behavior with the existing
controller before using this seam for upload. Expose supported busy/drop counters.

| Binding | DN2 OS 1.12 source reference | DT2 OS 1.17 acceptance condition |
| --- | --- | --- |
| RX and coexistence | Router `0x4012197a`, sources 2/4, up to four requests per UI tick; USB parser state `0x445090ac`; screen pointers `0x402a10c8`. | #2325 guards router `0x4011ffda` and table-load candidate `0x40120006`. MIDI, Audio/MIDI and Overbridge profiles have MIDI interfaces 1/4/5 and high-speed endpoints 01/81. Verify route ABI, source tags, port pairing and full-speed fallback where supported. |
| TX ownership | Current `send()` calls stock `0x401236d2`; bounded native sending and hostile-backpressure evidence are still required. | Stock `0x40121d2a` reaches serializer and allocator waits. Prove atomic idle admission, descriptor reserve for stock, DMA coherence/lifetime, callback retirement, reset/epoch behavior and full critical-section duration. A check followed by a blocking call is insufficient. |
| Build identity | #1842 hashes staged sources and merged recipe, emits `.identity`, and puts that digest in HELLO. Bounded `ident` reports counters/status and live count, not a full build/live-set identity. | Agree a versioned, backwards-compatible diagnostic carrier for the digest and live entries, consistent with HELLO. Review existing MWUI schema compatibility first; it does not allocate an MWL command. Keep legacy counter parsing. Opcode/offsets remain open. |

DT2's preflight does not prove transmit timing. Its selected 23+46 native
instruction paths exclude adapter guards, initialization, lock/unlock and
cache/bus costs. Completion, cancellation, endpoint drain and reset have different
retirement orders. Reset reconstructs pools without ordinary callbacks; a reused
buffer address is not an epoch cookie. Establish CPU callback retirement as well
as hardware quiescence before reuse. Do not enable native TX with guessed
coherence or recovery behavior. No USB driver takeover is proposed.

## Loader ABI, admission and lifecycle

Reuse the big-endian MWRM format and runtime API in
[`sdk/runtime/loader/`](../sdk/runtime/loader/README.md). Package ABI/feature bits,
MWUP transport version and base-layout identity are separate checks. The shared
loader documents ABI through 10, but each base accepts only its implemented
features. DN2's adapter rejects DSP payloads. DT2 ColdFire, DSP and catalogue
conversion claims stay gated on their own tests; shared source does not make a
compiled package portable between machines.

Common traversal invokes tick with the runtime API, draw with the native bitmap,
and key/encoder hooks with normalized integers, in the core's UI context and
stable module-position order. First consumption stops key/encoder propagation.
Keep native event signatures in the adapter. DN2 reads input ID at +12, flags or
signed raw delta at +16, with bit 0 for key press; tick is 30 Hz. Verify DT2 call
context, raw delta, bitmap contract and hook order before sharing those adapters.

| Loader boundary | DN2 source reference | DT2 acceptance condition |
| --- | --- | --- |
| Stopped and owned memory | Playing word `0x42c5b918`; 2 MiB pool `0x46800000`, 256 KiB staging `0x46a00000`, separated from DN2 stock DMA, RAM-boot copy and base. | Establish stopped/recording state and exclusive regions across boot, USB modes, DMA, base variants and optional modules. Check size/alignment. DN2 addresses are not DT2 reservations. |
| Code/cache | Code `[0x40000400,0x401d0800)`; uncached alias +`0x08000000`; instruction/branch invalidation and data-range flush. Vectors/tables excluded. | Prove code window, alias and cache maintenance for writes and rollback; check exact-stock site guards. |
| Interrupts/tasks | Level-4 scheduling lock keeps higher-priority frame/audio work running, with separate fully masked sections. Snapshot registers and all sixteen possible TCBs' saved registers/stacks; unknown ready tasks or invalid spans refuse switching. | Establish actual interrupt priorities, current task, ready lists, every created task and saved-stack layout. Prove paused-task/live-return-address refusal and meet audio deadlines. |
| Identity/active state | Builder layout digest; HELLO supplies base/session/active digests, generation, capacity and phase. | Reuse builder identity end to end. Reject wrong target/build, stale session/generation and unsupported features before trial; re-read live state after reconnect. |

Keep the existing upload-controller flow: HELLO, ENTER, BEGIN, CHUNK, VERIFY,
COMMIT. BEGIN binds base/package digest, generation and byte length. Admission
and switching run in the UI context, with stopped state, valid package and
rollback capacity established before a switch. Refusal preserves the prior set.
Controller ACCEPT is RAM-only acceptance on the current DN2 development base.
The planned page Keep uses the stock upgrade as decided above; MCP has no
automatic stock-flash path and must label RAM-only `device_keep` accurately.

During a trial, the host must meet the device watchdog: DN2 uses ten seconds;
#1846 pings every three. Lost-host rollback waits until stopped. Distinguish an
explicit unsafe refusal, which can leave a live trial, from an unknown Keep/Undo
acknowledgement: stop that uncertain session's old keepalive, obtain fresh status
and report uncertainty while the unit settles. A slow log yields between exchanges.
Reuse main's `device_review`: report package SHA-256 and bind the short-lived
review to HELLO's base and the active digest, then revalidate before `device_trial`.
Reference: [upload controller](../sdk/runtime/upload/README.md),
[shared MCP tools](FRONTEND_MCP.md).

## Unit page, installation and diagnostics

The beta panel identifies the connected model, exact base, live modules, trial
state and supported load/self-test readings. Show flashed and live sets separately
where both can be established. Pair ports by model and verify the reply before
enabling controls. Diagnostic sharing uses the existing explicit-consent path
and a consent version naming the machine. DN2 currently has START, FREEZE and
periodic load-window records; actual load meters, richer self-tests and DT2
counters are conditional, not inferred from the shared record format.

First install and pre-two-slot Keep use the fitted stock-upgrade image in the
existing dialog, with recovery instructions and explicit send. Revalidate when
the selection changes. Cancellation, including A -> B -> A and delayed MIDI
permission, must never send an old selection or leave current controls disabled.
`sendUpgrade()` waits for stock's final upload-complete response; that confirms
staging, not installation. Physical confirmation and a subsequent exact identity
read establish the installed set. Preserve physical YES/NO even while development
traffic overlaps the prompt. The remote YES-release behavior remains a release gate.

## Verification and merge gates

| Stage | Both machines | DN2 carry-forward | DT2 gate |
| --- | --- | --- | --- |
| Source/build | Recipe guards/overlap, deterministic identity, release/dev source and command selection, unchanged existing variants. Build `machine:base` with/without `--dev` from each private stock OS; run `test_machine_base.py`, relevant host/client tests, `check`, then `pr:ready`. Record exact commits, package/image SHA-256s. | Preserve the three overlays and OS 1.12 2 MiB update-fit limit; browser selects the intended binding. | Run existing preflight and Vitest tests against exact 1.17 and selected recipe refs. Preserve SAMPLE fixture and merged cumulative-base compatibility. |
| Link/diagnostics | Reuse/parameterize `dn2_link_host.c`, `test_dn2_link.py`, `dn2-link.test.ts`. Test malformed/unknown/retired requests, sequence/command/size matching, release-command refusal, screen/log overflow and capture consistency. Test reset, disconnect, non-reading host, MIDI/audio/Overbridge coexistence and measured UI/sequencer continuity in all modes. | Run checklist A on #1842's exact package: deferred releases, queued remote events/physical input at confirmation, stable log, freeze priority, RAM-boot CRC refusal, bootdiag and full-image CRC stall timing. Record repeated RAM boots or leave open. | Establish USB routing/source IDs, endpoint ownership, complete DMA/callback lifetime through unplug/reset/mode change and full-speed fallback where supported. Measure full accepted/refused TX paths; a host timeout is not DMA retirement. |
| Runtime | Wrong digest/ABI/features/build/session, unsafe switching while playing, pool/staging limits, occupied sites, Try/Undo, removal, timeout rollback and reboot. Slow log during trial must allow keepalive with at most one exchange in flight. | Rerun historical trials after identity changes; matching `.identity` accepted, other build refused. Keep stock copies, paused-site and catalogue conversion cases open until observed. | Establish DT2 task/cache/code/pool bindings before advertising upload. Record trial/removal/rollback and live-hook behavior on exact DT2 build; DSP support is a separate capability gate. |
| Page/MCP/release | Client, panel, review/upload/device-tool tests: A -> B -> A, unknown acknowledgements, port pairing, stale review/build and capability refusal. Physical YES and NO for an approved image; independent stock recovery via DIN. Images stay local. | Checklist B/C for Voice Spread and #1819; close #2003 gaps before #1767 ships. Owner requires release build on two units with both SHA-256s. | Preserve existing unit records, obtain the outstanding second-unit base evidence and separately record the new link/runtime's exact-build results. |

Host, emulator and static checks supplement named hardware records; they do not
prove visible behavior, musical continuity, persistence or recovery. A shared
source change requires both machines' build/check evidence; machine-specific
code needs its target checks and proof that shared interfaces remain compatible.
Each implementation PR updates the affected `GOAL.md`, recipe table and
`machine.json` stack. This design PR changes no capability/status declaration.

Agree responsibilities and record claims first. Finish and integrate the existing
DN2 stack in the owner's order. Extract one shared implementation with both-machine
checks, then introduce each verified native adapter. Move the approved functions
into release builds only after release/dev refusal and exact-build coexistence
tests. A two-slot proposal and approval remain a separate later milestone.

## Decisions still needed in this joint review

- Accept or revise the file map and proposed leads before claiming the pieces.
- Agree the nonblocking complete-reply TX admission/completion/reset contract,
  including retry semantics for later state-changing upload operations.
- Agree the versioned diagnostic build/live-set identity carrier and capability
  discovery while preserving legacy counter parsing; no opcode is allocated here.
- Agree release/dev command tables and bitmap/event adapter boundaries against
  both native ABIs, and the qualification handoff for each implementation PR.

Nothing here copies or mechanically translates DigiKit or proprietary firmware.
Retain Modwerk component licences, authorship and import provenance. Firmware,
extracts and built images stay local; share stock-free findings and verification
records. This Docs PR does not authorize native implementation or hardware actions.

[shared-instruction]: https://github.com/repeat98/modwerk/pull/1767#issuecomment-7188528252
[handover]: https://github.com/repeat98/modwerk/pull/1767#issuecomment-7188520919
[dt2-go]: https://github.com/repeat98/modwerk/pull/1819#issuecomment-7186904955
[dt2-base]: https://github.com/repeat98/modwerk/pull/1999
[preflight-pr]: https://github.com/repeat98/modwerk/pull/2325
[dn2-base]: https://github.com/repeat98/modwerk/pull/1767
[link-pr]: https://github.com/repeat98/modwerk/pull/1763
[loader-pr]: https://github.com/repeat98/modwerk/pull/1842
[unit-checklist]: https://github.com/repeat98/modwerk/pull/1763#issuecomment-7188423077
[installer-pr]: https://github.com/repeat98/modwerk/pull/1819
[voice-spread-pr]: https://github.com/repeat98/modwerk/pull/2003
[voice-spread-decision]: https://github.com/repeat98/modwerk/pull/2003#issuecomment-7193982718
[mcp-pr]: https://github.com/repeat98/modwerk/pull/1846
[shared-mcp-pr]: https://github.com/repeat98/modwerk/pull/2126
[dn2-link-source]: https://github.com/prodbysmolec/modwerk/blob/cfc60fb5d207762fb1c1727f08042e4e411f9f3d/sdk/machines/digitone-ii/elekloader/base/link.c
[dn2-runtime-source]: https://github.com/prodbysmolec/modwerk/blob/cfc60fb5d207762fb1c1727f08042e4e411f9f3d/sdk/machines/digitone-ii/elekloader/base/runtime.c
