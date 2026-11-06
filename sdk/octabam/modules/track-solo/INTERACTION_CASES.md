# Track Solo interaction case matrix

This module-local matrix copies the approved case groups from
`docs/TRACK_SOLO_INTERACTION_SPEC.md` (1 November 2026; case-spec commit
`cd1d8469`, author `twwwy`). The approved design's two-second hold is updated
here to the current 0.2.2 behavior: 30 instrument UI ticks, approximately 0.5
seconds. It also records the accepted rules that editing continues while solo
is active, the anchor is hidden from stock combinations, unmodified member
presses toggle once, excluded TRACK LEDs remain dim but lit, MIXER indicators
show underlying state, and release reveals the latest underlying mute/solo
state. There is no long-hold track-selection workaround.

This is a status matrix, not a claim that the 64 cases have passed.

## Evidence bindings

- **Current review source (`S`):** source revision
  `7acb980a07ebef61b98b791e85b098175438d8c3`; the six production-input
  hashes match the inputs listed in
  [resource-accounting.md](evidence/resource-accounting.md). The exact package
  under review is SHA-256
  `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`; this
  input-hash match does not claim a new build at the review commit. The existing
  package-build evidence retains source commit
  `1d2b93234b7e834187c68c74522ebf10ef52cb82`.
  Existing host/source prose retains its recorded provenance
  `e7858af5a26e11123064e6a756e94522f95a8df1`; final evidence-revision binding
  remains pending. Host checks cover eight anchors, 1,024 groups,
  threshold/edge/cancel logic, hidden-anchor behavior, editing logic,
  latest-state transformation and panel-row isolation.
- **Exact-package emulator (`E-2.2`):** package SHA-256
  `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` on
  base MAIN SHA-256
  `124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`.
  Focused native, control, standalone/paired audio and 52-file save/reload lanes
  passed provisionally. Scoped cases and limits appear below and in
  [TESTING.md](TESTING.md); this is emulator evidence, not hardware
  qualification, and final source evidence binding remains pending.
- **Historical device admission (`D-03`):** on 3 November the exact
  `6b7a…a2fd` package was admitted to a 20-module MKII RAM set; Undo restored
  the older 17-module baseline. This is admission/rollback evidence only and
  validates none of the functional interaction cases below.
- **Historical device attempt (`D-05`):** on 5 November, base
  `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc` had a
  confirmed 20-ID baseline and a confirmed 21-entry candidate inventory. The
  owner observed GLIDE but no TRACK SOLO; Undo ENTER was unconfirmed and no
  ROLLBACK was submitted. The receipt was uncertain and the hardware state was
  UNKNOWN at the time of the attempt; this was not a confirmed Undo failure.
  The owner later confirmed Undo completed and no restoration was needed. The
  recovery claim was administratively closed on that owner report, not on a
  machine readback. No current base/set identity is verified. This owner report
  adds no functional hardware qualification or new device authority, and no
  case below passed on hardware.
- **Historical emulator (`E-old`):** package SHA-256
  `c26a5a6f43ef4fec809d87c50f5a7a95bea7aadbffa1300cdff611108386d17c` on
  corrected private base MAIN SHA-256
  `124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`.
  Those 0.2.0 results do not qualify package `6b7a…a2fd`. The earlier
  two-second timing result does not establish the 0.5-second threshold.

## Approved case groups

| IDs | Agreed behavior represented by the cases | Current 0.2.2 evidence | Earlier emulator evidence and remaining work |
| --- | --- | --- | --- |
| G01–G13 | OFF and short press; lone-anchor 30-tick activation; pre-activation cancellation; single-press membership toggles; all eight tracks; no new anchor or long-hold selection; joined/anchor release ordering; no re-arm; disable/unload cleanup. | `S`: host checks cover eight anchors, all 1,024 groups, threshold/edge/cancel logic and panel-row isolation. `E-2.2`: activation at tick 30 survived synthetic anchor key-up while the physical anchor remained down. This is a focused emulator case, not completion of all G cases or hardware qualification. | `E-old`: `ux-controls-6` covers G01, G02, G05–G10, G12 and G13; its G02 timing was the older two-second behavior. Full short/long-hold, repeat, lost-release and per-anchor hardware coverage remains open. |
| K01–K10 | Hide the held anchor from PLAY/STOP, REC, BANK, YES/NO, LEFT/RIGHT and modifier combinations; let recognized non-anchor stock combinations execute once; release the anchor before selecting another editing track. | `E-2.2`: FUNC and CUE modifier-first and TRACK-first ordering matched the no-module stock result; the stock action ran once only for modifier-first. This resolves only those scoped ordering cases; other recognized combinations and hardware remain open. | `E-old`: `ux-controls-6` covers K01–K08 and K10, including modifier-first cases. Retest unlisted combinations on hardware; do not generalize the two exact emulator cases to all K cases. |
| M01–M09 | Mixer, quick-mute, stock-solo, MIDI, arranger, repeated/scheduled underlying changes; preserve active membership; reveal the latest stock state on release; audition previously muted tracks and restore pre-existing stock solos. | `E-2.2`: preexisting mute/solo restoration, CUE+TRACK, timed MIDI mute changes, and automatic pattern/Part/bank transitions passed. Corrected trace order is entry `2736282.9` → restore `2736291.1` → panel write `2736294.1` → next entry `2736298.9` → restore `2736307.0`; the panel write is outside both adjacent module pairs. No lost update is demonstrated, but no global concurrency proof exists. Active arranger rows and full schedule coverage remain untested. | `E-old`: `ux-controls-6` covers M01–M03 and M07; `ux-audio-2` / `ux-paired-3` cover specific quick-mute and MIDI changes. Do not transfer those package identities. Active arranger-row testing and unresolved Part/higher-priority indirect paths remain open. |
| V01–V07 | MIXER shows underlying state; member LEDs stay normal; excluded LEDs are dim but lit; membership/restoration updates promptly; audible tails do not redefine group membership. | `E-2.2`: active removal restored all 16 native TRACK LED levels to the captured uniform-level-15 baseline before anchor release; the active group was nonuniform. Emulator panel capture only; physical brightness/color remains untested. | `E-old`: `ux-controls-6` covers V01–V06 using the emulator panel stream. Physical brightness/color, MIXER behavior and hardware removal cleanup remain open; V07 is an interpretation rule, not a separate LED measurement. |
| E01–E09 | Keep audition active through pages, edits, MIXER, scenes, trig/parameter-lock edits, ordinary popups, playback and same-project pattern/Part/bank changes; cancel for MIDI editing mode. | The earlier `ts022-regressions-control-03` REC/trig/encoder P-lock case remains fixture-inconclusive. The separate 5 Nov scheduled case `ab1a55300df9482781956db094ff1197` passed on the exact package/base after the fresh stock control proved the same gesture: the T2/P1/step 1/slot 15 lock changed `FF`→`3F`, matching stock. Synthetic calls used `ts_set` and the stock-reader probe; UART drove startup navigation, activation and the lock edit. This closes only that named emulator case; the remaining E cases stay open. See the dated report hash in [TESTING.md](TESTING.md). | `E-old`: `ux-controls-6` covers E01–E04 and E06–E09. Physical P-lock behavior, other E cases and hardware remain untested; do not transfer the new emulator result to hardware. |
| R01–R10 | Preserve cue/recording routes; keep Track Solo independent; let unchanged Mute Modes govern tails/trigs; retain native Neighbor and T8-master routing; record actual policy-change behavior. | `E-2.2`: standalone and paired audio passed for OT, OTFX, OTFX-T and DT-T. On 5 November, two Neighbor/Pickup playback cases and six T8 Master anchor/group cases passed on the exact package and emulator base. The latter lanes use synthetic routing/mode inputs; Pickup recording/source routing, active policy changes through the UI, MIDI/arranger changes, physical audio, and full routing coverage remain open. | `E-old`: `ux-controls-6` covers R01; `ux-audio-2` and `ux-paired-3` cover earlier package identities. Historical results do not fill current-package gaps. |
| P01–P06 | Cancel at PROJECT/save entry; do not persist the temporary group or session enable; cancel on load/create/reload; start OFF after boot/replacement; avoid duplicate restoration after cancellation; no-edit save leaves project data unchanged. | `E-2.2`: standalone and paired 52-file save/reload lanes passed with stock emulator reload. This does not prove the physical no-edit project-unchanged case, power-cycle persistence, or every P case. | `E-old`: `ux-save-2` and `ux-paired-save-2` cover earlier package identities. The physical no-edit save/reload regression remains planned pending separate owner authorization; no hardware result exists. Power-cycle persistence is unclaimed. |

The corrected offline analysis counted 16,782 trace events and 8,388 paired
events: zero known stock writes were inside a module entry/restore pair, two
panel writes were outside, and four MIDI writes at the section start had
unknown pairing. This is trace evidence only. The capture lacks pre-snapshot
timing, SR/IPL and exception vectors; Part-apply and higher-priority indirect
paths remain unresolved, so no universal concurrency claim follows.

The seven rows represent all 64 approved case IDs: G01–G13, K01–K10, M01–M09,
V01–V07, E01–E09, R01–R10 and P01–P06. For lane names, failure history and
package identities, see [TESTING.md](TESTING.md). User-reported results remain
labelled under their reported version; no report transfers across source or
package hashes.

## Qualification boundary

The exact-package validator supplied provisional results for package
`6b7a…a2fd` and base MAIN `124548dc…9587`. Focused emulator results are recorded
above with their limits; final source evidence binding remains pending, so this
matrix is not a completed qualification record. The 3 November admission/Undo
record does not substitute for functional hardware. The 5 November attempt
provides no hardware pass; state was UNKNOWN at the time, and later Undo
completion is owner-reported without a machine readback or current identity.
CPU/cycle and complete memory evidence remain open; physical persistence is not
claimed.
