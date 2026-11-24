# MIDI CC Slots investigation

Status: unqualified development draft. Software evidence below is locally
observed; hardware reports are identified separately. No physical unit was
driven by the verification scripts.

## Observed stock behavior

- Original local MAIN SHA-256:
  `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
- MAIN load base is `0x40000400`, not `0x40000000`.
- MKII boot and actual panel keys reach MIDI CONTROL 1 and its SETUP.
  SETUP A/B are blank; C–F show the four stock CC assignments.
- CONTROL 1 SETUP writers at `0x4003fc44`, `0x4003fd34` and `0x4003fe14`
  address six bytes per MIDI track with a 36-byte track stride and 6322-byte
  Part stride. The direct assignment writer only accepts four CC positions.
- The shared value transmitter starts at `0x4009eec8`. Parameter IDs 18/19
  dispatch PB/AT; 20–29 dispatch the ten assigned CCs. Its active value and
  assignment records use a 68-byte live track stride.
- SETUP visibility uses a 64-bit descriptor mask, shifted by four bits per
  position. Its first SETUP positions start at bits 24/28 of the low word;
  editing only the high word does not expose them.

These are local source/control-flow observations, not proof of full saved
project semantics or of the candidate feature.

## Earlier candidate: 0.0.2-experimental

MAIN SHA-256 `984120afb2d5255a9d708caa83647cd900f0e0fe544a19394bfc5e9fa875fe85`.
The private unit is 420 bytes including local replay spans, at the same
guarded solo-image zero run. It remains outside the composer/base allocation.

Double-tapping stock FX1 already opens MIDI CTRL 1 SETUP. Its encoder handler
receives down and up events; only a clean A/B release switches mode. Stock's
turn-while-held guard suppresses the click after accelerated editing. The
new clamp preserves STK while turning and keeps CC0 as the mapped lower bound.
The other encoder handlers and normal main-page presses retain stock behavior.

The updated gate passed 382 checks and a second build reproduced the private
candidate byte-for-byte. It adds 16 menu checks to the previous 366 output checks:
double-tap entry, independent A/B click toggles, rotation staying in its mode,
CC0/127 boundaries, stock CC1 click confirmation, held-encoder acceleration,
main-page isolation, and immediate live/in-memory Part updates on mode clicks.
Those in-memory Part observations are not saved-project persistence results.
The gate also requires the actual SETUP popup to be open before editing it;
stale staged values alone cannot establish that a double-tap opened the menu.

## Previous candidate: v4 / 0.0.1-experimental

MAIN SHA-256 `49ce9b6cd40f5d9195472e7a60792784a50060700d32e5110df996713d133c53`.
Built with `build_probe.py`; original adapters occupy a guarded stock zero
run at `0x400d6b20`. This is a solo emulator experiment, not an allocation
claim in the card composer or base. Original replay spans stay in the private
build folder and are not source assets.

The MKII panel/UART gate passed 366 assertions:

- Eight tracks on eight distinct output channels, both slots assigned to
  CC0/127, with values 1/63/64/126/127/0: 96 assertions.
- Both slots traversed every other CC assignment on track 1: 254 assertions.
- Remaining CONTROL 1 and CONTROL 2 CC positions transmitted their stock
  controllers and value 37: 10 assertions.
- STK restored native pitch bend and channel aftertouch: two assertions.
- Changing track 1 back to STK left track 2's two mappings intact: two assertions.
- Actual grid recording and playback emitted track 2's CC0/127 locks at
  42/43 while the live base remained 5/5: two assertions.

The gate reads actual UART0 transmission from the private native monitor.
It rejects emulator faults and decodes running status. The lock fixture uses
the stock sequencer, internal clock, actual grid-record and transport keys,
and a 1.2-second playback. It does not test card writes or a receiver's response.
Run the command in README.md with `--sequencer` to include that fixture.

The manual transmitter is not the playback transmitter. Candidate v3 passed
the 364 panel checks but failed the lock fixture: UART0 carried native PB/AT
at the locked values. PC watches identified separate sequencer paths at
`0x4009fd84` and `0x4009fdf8`. Candidate v4 routes mapped lanes from those
paths into the same stock CC sender after stock enable/channel eligibility
checks. Unmapped lanes replay the original guarded span. The passing lock
fixture is a regression against that observed failure, not evidence of full
sequencer/LFO/mute/shared-channel coverage.

The first append-after-image placement was rejected after SETUP stopped with
an illegal instruction; a peek read all-ones at that proposed address. It was
replaced with the SDK's guarded zero-run location before any passing result.
An early byte-string MIDI assertion also failed on valid running status;
the gate now decodes complete channel messages before comparing them.

`module:doctor -- midi-cc-slots` reports no catalogue module. This research
folder deliberately has no release manifest and is not publication-ready.

## Required acceptance matrix — outstanding

Enable/disable behavior beyond initial enabling; wider sequencer locks and LFOs;
shared channels; Part save/reload; project
save/load and fresh volatile state; missing-module fallback; MIDI Scenes and
base coexistence; bounded wire-rate flood; runtime install/removal; hardware.

Never describe an injected-memory or borrowed-call probe as a front-panel,
sequencer, persistence or physical reboot test.

## Local USB draft 0.0.3 — 24 October 2026

- `build_runtime.py`: deterministic ABI 7, 1,470 bytes, 14 guarded sites,
  seven hash-backed copies, 420-byte image; no ColdFire self-reference words.
- `verify_runtime.py`: every site and copy guard passed against stock MAIN and
  a user-supplied Modwerk ELEKLOADER card image (SHA-256 in evidence/runtime.json).
  No direct current-base patch overlap. Literal stock-overlap scan passed at
  the existing 16-byte floor, without exemptions.
- Package reconstruction at 0x400d6b20 reproduces the 382-check candidate
  byte for byte. Reconstruction at 0x400d7000 passed all 382 panel/sequencer
  checks again. This proves the adapter can move; it does not test USB loading.
- `verify_loader.py`: exact package prepare, publish, Undo, repeated install,
  removal and full memory reclamation passed against the user's MAIN using
  the real C loader with host glue. ColdFire code is not executed by this test.
- Local HTTP endpoint returned the same package digest as the direct build.
  Capability/stale-inventory/package-identity and DOM trial tests cover that
  preparation sends nothing, an explicit trial adds only the draft, and the
  real link's self-test callback is supplied. At that revision no Keep action existed.
- Hardware USB, actual loader coexistence, saved Part/project persistence,
  LFO/shared-channel behavior, Keep/restart and physical reboot: **not tested**.
  The 14 unchanged sites in a supplied file do not prove the connected unit's
  identity or its currently installed runtime set; the page reviews both.

## Assignment headers and SETUP captions 0.0.4 — 24 October 2026

- 398 emulator checks passed: all 382 previous checks plus four mode-caption
  checks, native PB/AT header restoration, numeric headers on eight tracks,
  the CC5–CC10 headers on CONTROL 2, and two other-page isolation checks.
  Label values are traced at the
  authored renderer, using real panel edits and read-only PC watches.
- Private LCD captures visually inspected: CONTROL 1 headers 0, 127, 7, 1,
  2, 10; CONTROL 2 headers 71–76; SETUP CC127/CC0 and the complete highlighted
  CC caption. Captures stay outside Git.
- The display adapter takes only the label argument path on the two MIDI
  CONTROL descriptors. Other page descriptors pass through stock. Native
  PB/AT headers retain their stock text. SETUP's short PB/AT/CC captions fit
  the existing highlight rather than changing shared text rendering.
  Private stock disassembly contains no incoming branch into either displaced
  label span. The guarded replacements reproduce the displaced argument pushes.
- The 1,914-byte package has 16 guarded sites, eight copies and an unchanged
  sender/click implementation. Guard and literal scans passed; exact C-loader
  install, Undo, repeat install, removal and reclamation passed with host glue
  against the supplied firmware MAIN. Its reconstructed image is byte-identical
  to the panel-tested private candidate.
- The local compiler now refuses a generated package whose digest differs
  from local-build.json, so editing native source cannot silently offer an
  unverified package through the running development server.
- User reported “the control works” on the unit before this display update.
  No build identity was independently read; this is a reported control
  result, not qualification of persistence, coexistence or this version.
- User subsequently reported the display update working. The connected build
  identity was not independently read; this remains a reported result.
- Exact-build USB lifecycle and physical restart persistence: **not tested**.


## Local persistence workflow — 24 October 2026

The native package remains 0.0.4-experimental, 1,914 bytes, SHA-256
`1f435661235af72d7cd5847e380a14c6cfe29c1189c33471e62ea072e8016c64`.
Only the local app workflow and software verification changed.

- Explicit Keep follows this page's own tested one-module trial; Undo remains.
  Removal stages only the empty same-ID package, then requires explicit Keep.
- DOM checks cover review sending nothing, explicit Keep, save-failure and
  missing-diagnostics rejection/recovery, companion preservation, removal and
  Undo, plus refusal of an unreported legacy self-test. Restart verification rejects the immediate saved result and requires
  the distinct startup-restored result with matching base and IDs/layouts.
- `verify_persistence.py` compiles the actual C runtime loader and modset.c
  against the supplied private MAIN. The exact package is kept, restored in a
  fresh process, removed, then absent in another fresh process. A synthetic
  companion survives throughout. Failed writes leave the prior saved set
  restorable in a fresh process. Files are simulated in a temporary directory;
  no physical card I/O, ColdFire execution, task scheduling or USB is exercised.
- The running local compiler endpoint returned the same pinned package digest.
- The user subsequently pasted “Startup restoration confirmed by the base”
  from the local page and reported the controls working after restart. This
  is a reported Keep/restart result, not an independently read exact-build
  hardware qualification. Persistent removal on the unit remains untested.
- Module persistence does not establish assignment persistence in saved Parts
  or projects. Inventory/diagnostic checks do not read back package bytes.


## Midi Mode 2 presentation — 24 October 2026

The presentation name is now Midi Mode 2. Proposed listing copy, control
instructions, five screenshot captions and an original vector thumbnail are
in `presentation/`. The thumbnail follows CC Map’s dark grid and lilac routing
style and was rendered locally and visually inspected. It is a conceptual
illustration, not device UI evidence. No native source, installed module ID,
package bytes, catalogue entry or generated publication metadata changed.
The initial capture plan distinguished physical LCD photographs, supported
development-base exports and emulator captures; the user then chose emulator images.


## Midi Mode 2 emulator screenshot walkthrough — 24 October 2026

- Five actual LCD images captured with the shared capture script and the
  existing reviewed ot_emu, MKII panel, stopped transport, disposable empty
  card and real key/encoder input. No memory injection or reconstructed labels.
- Source slots.s SHA-256 matches the candidate build receipt. The captured
  image SHA-256 matches the previously verified runtime reconstruction of the
  unchanged pinned 0.0.4 package. Full bindings and capture plan are in
  media/capture.json; firmware and raw planes remain private.
- All five 768×384 PNGs visually reviewed. SETUP starts at native PB/AT/STK;
  CC assignment capture shows A=0/B=127; CONTROL 1 shows enabled values 64/32
  on channel 01; CONTROL 2 shows headers 71–76, all values OFF; restoration
  shows native PB with B still assigned CC127. Captions match visible states.
- Palette uses only grayscale 24/240 at integer scale 6, preserving every
  rendered LCD/popup pixel. No error popups or private project names appear.
- This is UI illustration evidence from an emulator. It does not add physical
  USB, receiver MIDI, project-persistence or release-qualification evidence.
  Catalogue registration remains outstanding.


## Local catalogue and normal USB preparation — 24 October 2026

The native package and its pinned SHA-256 remain unchanged. Focused domain/DOM
checks cover opt-in/development gating, normal catalogue parsing, installed ID
recognition, Add/detail/screenshots, configuration round-trip, USB-only card
refusal, companion preservation and capability rejection. Normal Sync preparation
accepted the exact 1,914-byte package and prepared its 32-byte removal package
without changing a companion. No device writes were performed.

The running development server returned the exact pinned binary, thumbnail,
screenshot and module page successfully. The user confirmed the Local draft
listing and Add button are visible. Normal catalogue Sync/Keep on the physical
unit has not been tested; earlier reported hardware results used the diagnostic
page. This does not add release qualification or card-composer support.


## Combined 0.0.5 naming test — 24 October 2026

Exact package: 3,500 bytes, 1,756-byte authored image, ABI7, 20 guarded sites,
16 hash-backed copies. SHA-256:
`0012a6d8a4c4fd9714d3dca7c52b80555aa86052a25e0a92f86b40d317e0cc09`.

- The existing 398 CC/menu/label/sequencer assertions pass on the combined
  image. Its reconstruction matches the native emulator image exactly; two
  placements reconstruct and the naming lifecycle is exercised at both.
- Each of the two final naming runs passes 81 checks, using real panel input for all eight tracks and four Parts,
  confirm/cancel, ten-character bounds, unchanged MIDI settings, native audio
  exclusion, and actual pixel rows to match PUSH's baseline to adjacent OFF.
- Removal-with-editor-open fault tests restore all package sites, poison the
  entire module image with illegal instructions, then close with YES or NO.
  Both close without executing retired code. Only lifecycle code is injected;
  name edits use panel input. This simulates retirement, not physical USB.
- The original pointer-table approach failed the poison test because stock
  cached callbacks. This build detours stable stock routine entries instead;
  the stock editor retains only its own buffer and a stock redraw callback.
- Exact C-loader host checks pass prepare/publish/Undo/reinstall/removal and
  full allocation recovery. The exact 0.0.4-to-0.0.5 upgrade, Undo to 0.0.4,
  Keep new and removal also pass with the actual C loader. Simulated saved-set checks pass Keep, fresh-process
  restoration, removal/restart and failed-write fallback with a companion.
  These restore the package, not runtime-entered names.
- Stock-free scan passes at the existing 16-byte floor with no exemptions;
  direct current-base overlap is absent and site/copy guards match both the
  original MAIN and the privately supplied Modwerk MAIN.
- Local JSON and binary compiler endpoints return the exact pinned package.
  No hardware writes were performed. Earlier hardware reports concern 0.0.4;
  0.0.5's naming, exact USB lifecycle and physical reboot remain untested.

Names do not save, do not follow bank/project identity or Part copy/clear,
and reset on replacement/restart. Test within one disposable project and bank.
Screens were visually reviewed for alignment, native editor and BASS alongside
the numeric CC headers. Existing gallery assets explicitly retain their 0.0.4
captions and provenance. No public release or native card-composer support.

## Persistent project-profile test 0.0.6 — 24 October 2026

Exact package: 7,732 bytes, 5,616-byte authored image, ABI7, 21 guarded sites,
16 hash-backed copies, 81 relocations. SHA-256:
`8b3c10ad5e670da3eca6eba7094dbf1be95fefcb4313e8f48f1df9a7e2da920e`.
The package's ordinary hook 0 schedules the UI work. Card operations run only
in the stopped engine task through a separate guarded stock receive callsite;
the blocking receive retains a stock return address and the wake queue retains
a stock ROM sentinel, never a module buffer. All new C objects pass the shared
ColdFire code-generation guard.

- Real profile C core, host filesystem/platform: separate processes restore all
  eight names, Bank 1 defaults, independent bank/Part channels and OFF; projects
  remain separate. Playing defers writes. Shortening a name normalizes stale
  trailing bytes; failed and truncated writes retain the prior checkpoint. An owned truncated peer is repaired on a subsequent save; unrelated files remain protected.
  Foreign files are refused without being overwritten. CI runs this core test.
- Native ColdFire/card test starts with an empty scratch FAT16 card; stock
  firmware initializes missing working banks. Every name/channel edit uses
  panel inputs, with no RAM/name/channel/file injection. It confirms a name,
  Bank 1 channel 2, Bank 2 override 5 and Bank 3 inherited channel 2. A fresh
  process reloads the same files, checks names and channels, and verifies the
  stock SRC SETUP reads the restored channel. Both card checkpoints have valid
  checksums and sector writes flush without errors.
- The stock reconstruction has no resident runtime registry. A declared private
  UI-tick shim supplies ordinary hook-0 scheduling and replays the displaced
  stock calls; package code and stock card routines are unchanged. Evidence
  binds original and instrumented image hashes, shim address and hash. This is
  not a full-base boot, companion coexistence or physical persistence test.
- 33 native assertions across two fresh lower-placement processes include
  restoring all package sites and poisoning the entire image with an editor
  open. YES and NO close safely; reopening SRC finds no retired callbacks.
  A second placement repeats these 33 checks, including both editor retirement paths.
- The existing 398 CC/menu/label/sequencer assertions pass on the exact lower
  image. Actual C-loader host checks pass install/Undo/repeat/removal/recovery,
  exact 0.0.5-to-0.0.6 upgrade/Undo, and module-set Keep/fresh-process restore/
  removal/failed-save simulation with a synthetic companion.
- Guarded reconstruction, 16-byte stock-free scan and supplied MAIN guards pass;
  no direct current-base site overlap. Evidence is in runtime-0.0.6.json.

The sidecars are autosaved independently of normal native project saves.
Copy both MIDI2_*.DAT files with a backup. Native Save As/project copy/reload,
Part copy/clear semantics, card-removal races, physical boot timing, real storage
latency, receiver MIDI and full companion coexistence remain unqualified.
Keep saves the module package; MIDI PROFILE SAVED reports the entered profile's
separate verified checkpoint. No device writes or public release performed.

## Bank name defaults/overrides 0.0.7 — 24 October 2026

Exact package: 10,536 bytes, 8,324-byte initialized image, ABI7, 21 guarded
sites, 16 hash-backed copies, 105 relocations. SHA-256:
`5db4164bb52849497e93f0dc5fc3c42b755626bbc5065eb44baab010fb3b4244`.

- Portable C core tests confirm Bank 2 can rename one track and explicitly
  blank another without changing Bank 1; unedited names follow later Bank 1
  changes. Names are shared across Parts within a bank. NO-style preparation
  without commit creates no override. Fresh processes restore the defaults,
  local names, blanks and channel profiles. Existing write-failure, truncated
  peer repair, foreign-file and project-isolation cases continue to pass.
- Migration reads both original 0.0.6 checkpoints and writes the newer format
  in MIDI3_*.DAT. Shared names become Bank 1 defaults; channel defaults and
  bank/Part overrides (including OFF) remain intact. A second fresh process
  reads the new names/overrides; both old files remain byte-identical.
- Native ColdFire/card checks pass 48 assertions at each of two placements,
  each with two fresh processes. Panel edits name Bank 1, rename Bank 2, change
  Bank 1 again, and verify Bank 3 follows the default while Bank 2 retains its
  local name. A fresh process reloads both checkpoints and the actual stock
  editor reads the restored override and inherited name. Both checksums match.
  Site restoration plus full image poisoning with an editor open passes YES
  and NO close paths and subsequent stock SRC access.
- This larger profile no longer fits the earlier firmware zero cave. The probe
  boots stock, checks unused scratch RAM and every site guard, then publishes
  the exact relocated image and site fixture. A private UI shim supplies the
  ordinary module tick. Publication initializes the module only: names/channels
  are edited with panel events. Evidence binds stock, package, relocated image,
  fixture, shim and verifier hashes. It does not execute the resident loader.
- All 398 existing CC/menu/label/sequencer assertions pass after the same exact
  runtime publication. Shared ColdFire code-generation checks, 16-byte stock
  scan, original/supplied MAIN guards and direct current-base overlap checks
  pass. Actual C-loader host tests pass install/Undo/removal/reclamation,
  exact 0.0.6-to-0.0.7 upgrade/Undo, and simulated module-set save/restore/
  removal/failed-save recovery with a companion.

The user reported names working and observed the earlier shared-name behavior
between Banks 1 and 2; device/build identity was not independently read. Those
reports do not qualify the new overrides. No 0.0.7 device writes were performed.
Physical restart, actual USB lifecycle/companion coexistence and native project
Save As/copy/reload remain unqualified. Old MIDI2 files are retained for rollback;
0.0.6 cannot display the newer bank overrides. Copy both MIDI3 files for backups.

## Naming gallery and main fork checkout — 24 October 2026

Four actual emulator LCD exports use the unchanged 0.0.7 package SHA-256
`5db4164bb52849497e93f0dc5fc3c42b755626bbc5065eb44baab010fb3b4244`.
The gallery run passes 51 checks across fresh processes and uses only panel
inputs to enter BASS and LEAD. Guarded runtime publication and the private UI
shim are the same declared native fixture; no names/channels are injected.

All four 768×384 images were visually reviewed: NAME/PUSH in MIDI NOTE SETUP,
BASS in the stock editor, LEAD on B01, and BASS still present after returning
to A01. Original LCD/popup pixels are preserved at integer scale 6 with only
24/240 grayscale. `media/capture-names.json` records package, source, stock,
module/fixture, emulator, shim, renderer, plane and PNG hashes plus panel
inputs. Firmware, raw planes, cards and logs remain private.

The current gallery declares eight assets: four new naming images plus four
retained CC captures with their original 0.0.4 identity. The earlier fifth CC
image remains historical documentation. Five main images teach the short
walkthrough; three extra CC pages appear under More screenshots. The local
media endpoint has an explicit allowlist and enabled-path DOM checks cover
the new paths, captions and grouping. Production still excludes the draft.

The user reported the bank-specific naming behavior works after the 0.0.7
instructions. Exact device/base/package identity and a fresh reboot were not
independently read, so this remains reported behavior rather than complete
release qualification. No firmware bytes or version changed for the gallery.
# Isolated one-time template prototype (24 October 2026)

The experiment in `prototype/` passed 222 native assertions over three fresh
emulator processes using package SHA-256
`edc9eab0b85d3a616e366a85d5317fb419c5f30f605707b97d3e02cac24d5e0a`.
The staged template initializes all 16 banks' current and saved Part copies.
Panel edits then change Bank A to channel 3 / BASS3 and Bank B to channel 5 /
LEAD2, while Bank C retains channel 2 / BASS2. Reload Part retains initialized
channels, Bank B sends a controller message on channel 5, and stock project
save plus a fresh process retains independent native channels and names.

Actual panel Save to New creates COPYTEST. A guarded private stock-call
notification invokes the prototype's name-copy callback with an explicitly
supplied source identity. A third fresh process restores the copied channels
and names. Editing COPYTEST's Bank B name to COPY2 leaves TEMPLATE's LEAD2
checkpoint unchanged. Native saved-bank checksums and channel fields across
all current/saved Part copies are checked after the operations. Host C tests
also refuse missing/wrong source identity and destination collisions, preserve
foreign files, exercise write failure/retry, and abort if the names-only service
tries to restore channels.

Limits: initialization happens in a new disposable card tree on the host, not
an on-device atomic operation. Scheduling, runtime publication and the proposed
Save to New event are private fixtures, not the complete Modwerk base/loader.
The source identity is supplied by the bench, not a public SDK event. No new
UI action, interrupted-initialization recovery, production migration, physical
timing, companion compatibility or hardware result is claimed. This prototype
is not served by the local app. The normal 0.0.7 package was rebuilt and remains
byte-identical (`5db4164bb52849497e93f0dc5fc3c42b755626bbc5065eb44baab010fb3b4244`).


## 0.0.8 one-time initialization and actual native Save to New

Source: `d2c05e7608a6b83ad4dd871c43ebaa22f1d93dbd`, template/ implementation.
Exact package SHA-256:
`876e3aa98455364181be7e055bfb5dd0d7f3b81f45051f8d85dc8894a5b47fad`.
29,434 bytes, 25,564-byte authored image, 416 relocations, 24 sites, 22 stock
copies, ABI 8, feature bits 3. Default `--profile` without the template flag
still reproduces the historical 0.0.7 package byte-for-byte.

Observed privately on the same stock MAIN and emulator hashes listed above:

- 353 exact-build native assertions: actual D INIT editor, NO cancellation,
  APPLY, all 32 saved bank checksums, every unrelated bank byte unchanged,
  all current/saved Part channel copies, legacy overrides, independent names,
  refusal to initialize twice, native Save to New with package-owned source
  capture and completion hooks, and independent fresh-process source/copy
  restore. No source identity or channel initialization was injected by host.
- 398 exact-build CC/menu/header/sequencer regressions passed.
- Actual INIT interrupted after bank01.work changed and before initialized
  metadata committed. A fresh VM restored every byte of all 32 bank files,
  completed native project reload, left its marker uninitialized and left
  uninitialized Bank D OFF; waiting and bank selection did not reapply defaults.
- YES and NO both closed the INIT editor after every package site was restored
  and module RAM was poisoned. Returning to SRC stayed stock afterward.
- Host core checks cover six fresh-process transaction cuts, failed-save retry,
  foreign-file refusal, read-only legacy import, protected-template dirty-name
  copy, independent copied names, and zero profile reads/writes or channel
  restoration across 64 ordinary bank changes after initialization. Busy key
  and encoder callbacks consume navigation while allowing STOP press/release.
- The actual portable sector algorithm was tested with real 636,113-byte files:
  exact neighboring-byte preservation, torn work/strd sector repair from the
  saved peer, checksum repair, and refusal for missing/unsaved/native-mismatched
  banks or two damaged peers. The host adapter models close-time truncation.
- Exact host C loader prepare/publish/Undo/repeat/removal/free-space reclamation
  passed against the private supplied user MAIN. Two-placement reconstruction
  and strict 16-byte stock-overlap scans passed; no direct current-base site
  overlap was found. Host loader execution is not resident-base execution.

Private reports: `template-v8-native-10/report.json`,
`template-v8-panel-3/report.json`, `template-v8-recovery-2/report.json`, and
`template-v8-removal-2/report.json` under the developer's private MIDI draft
folder; no firmware, card images or dumps are committed. INIT capture hashes
and exact build provenance are in `media/capture-init.json`.

The native bench publishes the guarded package after boot and supplies a UI
tick shim. It also records a separate first-sector IRQ timing fixture for the
known emulator race; this fixture does not ship in the module. Native saves
need substantially more simulated time than a short UI delay: the bench waits
for the stock panel to return. Generic resident key/encoder dispatch is not
wired by that private tick fixture. Shared project lifecycle event admission,
full base execution, physical install/Keep/Undo/power loss/restart, protected
physical template copy, CF/FAT failure modes and timing remain unqualified.
The UI names old screenshot versions explicitly instead of relabeling their
captures as 0.0.8. No physical device was driven for these checks.


## 0.0.9 hardware-report follow-up and Apply gesture

The user reported that 0.0.8 held the controls until an automatic project
reload, and that a name appeared in the next bank but its channel did not.
With permission, the test project and fixed module-set/log files were copied
read-only from CF into a private directory; the card was not edited.

Observed on that snapshot: the newest saved set body hash is valid and contains
exact 0.0.8 (`876e3aa9…`, 29,434 bytes), base configuration
`0c5934e1bea411fc43143a75ee2a0fcf1c09a71b8c386732ed7526517d3b0846`.
Both MIDI4 name checkpoints are uninitialized, the pending/aborted journal
pair has valid CRCs, and all 32 bank copies have valid checksums and match the
journal's non-channel fingerprints. Bank A has channels 1–8; Bank B is OFF.
The sixth name saved independently. This confirms rollback, not which I/O
check failed. Active RAM identity/model and the reported reload message were
not independently read. The same project succeeds in the isolated emulator;
its low-level physical failure cause remains unconfirmed.

Candidate firmware source: `bc8871f1d05fc38a436532f78696f89b03d1f115`.
Exact 0.0.9 package SHA-256:
`04d883c23abc0831e99e802cd30647098a0ae6eb57aa8cda384958c4c6856360`.
31,266 bytes, 27,092-byte image, 492 relocations, 24 sites, 22 copies, ABI 8,
feature bits 3. Default historical `--profile` still rebuilds 0.0.7 identically.

Observed on this exact private package:

- 352 native Apply/cancel/independent edit/Save to New/fresh-process assertions.
  Plain D opens no editor or request; FUNC + D applies on its clean release.
  The real panel's NO key cancels a running check. Progress is captured from
  the native LCD. The encoder handler's event polarity was traced as 1 down,
  0 up; the bench keeps FUNC held through the encoder's release.
- 398 CC/menu/header/sequencer regressions pass.
- The private reported-project copy retains its sixth name, applies channels
  1–8 to Bank B, verifies channel 6 in every current/saved Part of both native
  bank files, and transmits actual controller output on MIDI channel 6.
- Actual interrupted Apply after native bank writes begin recovers in a fresh
  VM; the touched-bank bitmap limits repair, all original bank bytes restore,
  the marker remains uninitialized, and Bank D stays OFF without remapping.
- NAME's stock editor closes on YES and NO after every package site is restored
  and module RAM is poisoned. Apply itself retains no text editor.
- Host tests cover cancellation before writes and after one touched bank,
  failed persistence followed by in-place restore with zero reload calls,
  six fresh-process interruption boundaries, protected source copying,
  foreign files, migration and no sidecar I/O on ordinary bank changes.
  The sector adapter aborts if the same file is concurrently open for read
  and write. Torn-sector peer repair, exact unrelated-byte preservation and
  double-corruption/unsaved/missing-file refusal still pass.
- Exact host C loader install/Undo/reinstall/removal/reclamation against the
  supplied private user MAIN, two-placement reconstruction, codegen checks
  and strict 16-byte stock-overlap scan pass. Card transfer buffers are
  16-byte aligned and the builder rejects drift; this is defensive alignment,
  not a demonstrated cause of the physical failure.

Private reports live under `template-v9-native-4`, `template-v9-panel-1`,
`template-v9-reported-4`, `template-v9-recovery-4` and
`template-v9-removal-1` in the private MIDI draft folder. The read-only physical
inspection report, personal project and card logs stay private. Public capture
provenance is `media/capture-apply.json`; older images keep their old versions.
The native bench still uses private publication, UI tick and first-sector IRQ
fixtures. NO cancellation is also polled from the actual held-key row on the UI
tick. Full resident event dispatch, physical writer behavior, latency and a
physical fix/restart remain unqualified. This is a test candidate, not a claim
that the hardware failure has been resolved.


## Clarified physical 0.0.9 result and 0.0.10 responsiveness follow-up

The user first described another freeze, then clarified that Apply completed,
Bank B MIDI track 6 used channel 6, and controls returned after more than ten
seconds. Record this as a reported successful application with excessive
blocking, not a permanent freeze. Active RAM identity and elapsed time were
not instrumented; the served 0.0.9 hash was independently checked by HTTP.
The earlier 0.0.8 card snapshot still documents a real aborted initialization.

The physical card is MS-DOS FAT32 (512-byte device blocks, about 16 GB).
Additional disposable 64 MB FAT32 emulator images round-tripped the private
reported project and both exact 0.0.8 and 0.0.9 completed Apply (native backend
0x40018a84). FAT32 alone therefore did not reproduce the physical 0.0.8 abort
in the port. Card timing/cache/DMA and the physical geometry remain unmodeled.
The FAT32 fixture and personal data stayed private.

0.0.10 firmware source: `d0d55e296bed53911b9e0117a2cb74870865606e`.
Exact package SHA-256:
`d738fce658e0c44eea5d959d5771654d302cae40d17419eaed7388b544f5c583`.
32,310 bytes, 28,132-byte image, 493 relocations, 24 sites, 22 copies, ABI 8,
feature bits 3. Bank CRC uses a generated 256-entry byte table (one lookup per
byte rather than two). Host golden file/fingerprint tests pass unchanged;
no file verification was removed, and no cache alias or interrupt-mask change
was introduced.

Observed exact-build gates: 353 native Apply/page-view/NO/copy/restart
assertions, 398 CC regressions, interrupted recovery, reported-project names
and actual channel-6 output, NAME editor retirement with poisoned RAM, host C
loader lifecycle and two-placement stock-free reconstruction. Host key-policy
checks allow all five bare page down/up events and consume modified page
shortcuts while bank/project changes and encoders remain held. The real FX1
page can open during the private native Apply/cancel scenario. Full resident
key dispatch and physical responsiveness remain unqualified; emulator input
coverage is not a timed hardware result.

Private exact reports: `template-v10-native-1`, `template-v10-panel-1`,
`template-v10-recovery-1`, `template-v10-reported-1`, and
`template-v10-removal-1`. Captures: `media/capture-responsive-apply.json`.
There is no physical 0.0.10 latency result and no claim that it finishes below
ten seconds. An already initialized project is not remapped to measure it.


## 0.0.11: INIT position and visible modifier hint

Firmware source: `344e48e428e1bb970e00905863c3b3c22a01ab9e`.
Exact package SHA-256:
`0b6bdf28444595fe4b8acb7e995bcd197f5fb5ee60d1b02448e901e3215a78a0`.
32,462 bytes, 28,196-byte image, 493 relocations, 24 sites, 24 checked stock
copies, ABI 8, feature bits 3. Only template UI assembly and its reviewed
copy spans changed; storage, channels, CRC and key-handler sources are unchanged.

INIT is centered under CHAN in encoder D’s cell. FN+ and PUSH occupy two
short lines below it, inside the cell borders. Both exact-build native LCD
captures were visually inspected. Provenance is `media/capture-init-layout.json`;
private report `template-v11-native-2/report.json` passes 353 Apply, page-view,
NO cancellation, native bank/checksum preservation, independent edits, actual
Save to New and fresh-process restore checks. Two-placement reconstruction,
strict 16-byte stock-overlap scan and current-base direct overlap checks pass.
The local HTTP endpoint serves the exact package and both PNG routes return
200 image/png. All 19 focused local-app tests pass.

Earlier 0.0.10 CC, recovery, outgoing channel-6, NAME retirement and loader
results remain tied to their original version; they were not rerun for this
UI-only change. The user reports that the latest trial seems to work and
supplied a physical photo of INIT/PUSH, but the installed version was not
independently identified. No physical 0.0.11 result or latency claim is made.
The native bench retains private publication, UI tick and first-sector IRQ
fixtures; this is not full resident-base or hardware qualification.


## 0.0.12: explicit replacement of a saved setup

Firmware source: `d3212cca` (full pin in local-module.json and capture record).
Exact package SHA-256:
`50e162828c2665a3212b11bf7269a685b8f45b1866aebd30f5a5acdf1fd6244c`.
32,990 bytes, 28,580-byte image, 518 relocations, 24 sites, 25 checked copies,
ABI 8, feature bits 3. First initialization preserves legacy overrides. An
initialized project instead asks REPLACE ALL? YES/NO after FUNC + D. Only a fresh
YES starts the repeat; NO or STOP dismisses it. The repeat copies Bank A / Part 1
into all bank names and all current/saved Part channels, including blanks/OFF.
Normal bank changes/project loads never request replacement.

Observed exact-package software results:

- 634 native assertions (`template-v12-native-1/report.json`) cover first Apply,
  page browsing, NO cancel, independent edits, native Save to New, replacement
  confirmation/cancel, YES replacement in every bank and both native copies of
  all Parts, and restoration in a fourth fresh VM. Subsequent Bank A edits do
  not remap Bank D. Older project/checkpoint data remains unchanged.
- Native interrupted first Apply and interrupted replacement each restore
  every original bank byte in a fresh VM. Repeat recovery keeps marker 1 and
  the old independent Bank D name/channel. Private reports:
  `template-v12-recovery-first-1` and `template-v12-recovery-replace-1`.
- Host journal/bank suites pass: six interruption points on first setup and
  repeat (before/after metadata commit), cancellation after a bank write, stale
  held YES refusal, empty-name and OFF overwrite, old-name preservation on
  rollback, independent ordinary bank changes and existing file fault checks.
- Host C loader prepare/publish/Undo/reinstall/removal/reclamation passes against
  local stock MAIN. Two-placement reconstruction, codegen guard, strict 16-byte
  stock-overlap scan and current-base direct-overlap checks pass.
- Nineteen focused local app tests pass. HTTP serves exact 0.0.12/hash/size and
  the confirmation PNG route returns 200 image/png. Three native LCD captures
  were visually inspected; provenance is `media/capture-replace-setup.json`.

These native runs retain private publication, UI tick and first-sector IRQ
fixtures. They are software evidence, not full resident dispatch, hardware
latency, physical power-loss or CF/FAT qualification. Earlier CC/output/NAME
retirement results remain tied to their recorded versions. No physical 0.0.12
result is claimed, and these tests did not write a physical card or unit.


## 0.0.13: reported saved-project check loop

Firmware source: `93dd9ae36514b141ac38f84f7363762bd55dcf33`. Exact SHA-256:
`086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a`.
33,386 bytes, 28,916-byte image, 533 relocations, 24 sites, 25 checked copies,
ABI 8, feature bits 3. A read-only card snapshot showed both Bank B checksums
valid and all non-channel bytes identical; working MIDI track 3 used channel 3
and the stored copy used OFF. The exact 0.0.12 package reproduced status 14,
code 101 on a private copy and left all 32 bank files unchanged. A separate
normal edited-Bank-B fixture passed, so that fixture had missed the distinction.

Current exact-package evidence:

- 634 native initialization/replacement/cancel/copy/restart assertions
  pass (`template-v13-native-final/report.json`).
- Private reported-project apply, NO cancellation and interrupted replacement
  each pass in a fresh VM: all 32 native files match their exact expected bytes.
  Cancellation/recovery restore each original copy independently, including
  the original working/stored channel difference; names and marker remain
  correct. Apply persists Bank A names and all channels across all banks.
  Reports: `test02-v13-apply-final`, `test02-v13-cancel-final`,
  `test02-v13-interrupt-final`.
- Host bank tests cover differing maps, exact apply/restore, torn work/strd
  peer repair, checksums, unrelated-byte and unsaved working-map refusal. Host
  journal tests cover initial/repeat interruption cuts, both v2 peers before
  mutation, old MAP1/untagged recovery and existing confirmation checks.
- The actual 0.0.12 host reader refuses new pending journals without RAM/bank
  writes and accepts a current completed terminal record. Pending MAP2 records
  use version 2; committed/aborted terminal records use version 1. Older
  modules must not recover an unfinished new operation; Keep 0.0.13 first.
- Exact host loader lifecycle, codegen, two-placement reconstruction, strict
  stock-overlap scan and current-base direct-overlap checks pass. Three native
  LCD captures are bound in `media/capture-bank-map-fix.json`.

The card/project snapshot, saved module sets and all personal data stay private.
No physical unit/card was written. These native runs retain publication/tick/IRQ
fixtures; they are not physical timing, full resident dispatch, arbitrary CF
failure or physical power-loss qualification. Hardware 0.0.13 remains untested.


## 0.0.13 follow-up: new destination missing stored copies

The user reported check 100 after starting a temporary 0.0.13 trial and using
Save to New. A new read-only card snapshot contained all sixteen valid working
banks, no stored `.strd` bank files, and two valid initialized name checkpoints.
The refusal was the expected missing-peer guard, not the prior divergent-map
problem. No initialization journal existed in the destination.

On a disposable copy of that project, exact unchanged 0.0.13 reproduced status
14/code 100. A native full Save Project created all sixteen stored copies.
Confirmed INIT then reached status 7, all 32 files/checksums/current and saved
Part channels matched Bank A, and every bank's channels restored in a fresh VM.
Private report: `test03-full-save-v13-1/report.json`. The physical card was read
only; this remains emulator/publication/tick/IRQ-fixture evidence. The local
page, module instructions and template guide now explicitly require full
PROJECT → SAVE PROJECT after Save to New. There is no firmware version or
package change and no physical success claim.


## 0.0.14 standalone card candidate — 26 October 2026

Private first card test only; the normal USB listing and its exact 0.0.13 bytes
are unchanged. Build inputs and hardware procedure are in [CARD_TEST.md](CARD_TEST.md).
No physical CF card was copied to or flashed. Hardware, mixed-module builds,
resident USB loader integration and public publication are not qualified.

`build_card.py` translates the reviewed USB package to native format 2, retaining
all 533 relocations, 24 guarded sites and 25 hash-backed stock references. Its
tick/key/encoder contributions use the unchanged pinned core-ot 0.3.1 shared
bus, not another feature module. Shared original Modwerk artwork is added to
the core package. The linker reserves five 6,144-byte pages; the 29,256-byte
runtime blob ends at 0x40a9c7e8. Module image base is 0x40a956c0.

Two independent private builds produce the same BIN SHA-256:
`fe4d539ae304a4fd8143fbb5b1ca11f0ea9f62c8dcd0d0b1dbdf402327581fa3`.
The packaged MAIN SHA-256 is
`f0fa5f5ebf7e19bff452d645764835eb4a80574698109033b6c470d28a76e649`.
Core package SHA-256:
`d772d1d71af23109cb3f22f8089b0578e63cbf83bae86353504c6225e1ef3d66`.
Module package SHA-256:
`d6a8276f1237ca9cd31251179335655df067c3c639bde94bb56ac4e2c2ecfa88`.
Native Elekloader and the app's unchanged TypeScript kit produce byte-identical
complete BIN and SYX outputs (`verify_card_package.mjs`, `browser-parity.json`).
The original full 1.40C firmware remains unchanged. Container/bootloader,
flash bounds and depacking checks pass in the native builder.

`template/verify_card.py` boots MAIN decoded from that exact packaged BIN, from
reset in a fresh headless MKII emulator. It does not publish a module after
boot, inject state, call private entry points, or use tick/IRQ fixtures.
The scratch CF contains a copied TEST/TRIAL saved project, no MODWERK0/1.SET.
Sixteen assertions pass: code/profile startup, NAME autosave, CC0/CC127 setup,
restoring PB/AT assignments, real event-bus NO/YES confirmation, MIDI SETUP SAVED,
Bank A to Bank D initialization, independent bank names and fresh-process name
and channel restoration. Private report: `card14-boot-final/report.json`.
MIDI wire output is **not tested** by this card probe: the available interactive
emulator lacks `midi-tx`, and its batch `--midi-out` path does not capture the
interactive session. Setup state and encoder input are not UART output evidence.
Physical flash, timing, audio, power cuts, Save to New and recovery cuts were not
requalified for this card dispatch. Earlier USB evidence keeps its stated limits.

Emulator executable SHA-256: `489024df15f4ccc562b22365f7251180f3965c7887b1aa1fe4b94fe4e186c776`.

Three synthetic stock-free translation tests pass:
`python3 -B -m unittest sdk.tests.test_midi_card_package`.
The literal scanner at 16 bytes, with **no skipped sites**, finds no MIDI module
literal stock runs. Core has two matches in the existing source-authored Modwerk
wordmark at site 0x400c3c32: offset 86/18 bytes and offset 154/22 bytes. They are
recorded in `literal-scan.json`, not silently exempted; no strict whole-core
clean claim is made. The normal shared-core scanner already documents artwork
handling. Firmware and scan artifacts stay outside Git.

`module:doctor -- midi-cc-slots` reports an unknown module because this remains
an unregistered draft. This is an intentional public-registration boundary,
not a claim of release readiness. The source/draft checks run through pr:ready.


## Reported standalone hardware test — 26 October 2026

After receiving the private MIDI2-C14 card candidate and hardware instructions,
Cooper Scobey reported that it worked, then explicitly confirmed a physical
power cycle worked and everything was saved. The requested checks included
names, channels and CC assignments. The supplied BIN identity was
`fe4d539ae304a4fd8143fbb5b1ca11f0ea9f62c8dcd0d0b1dbdf402327581fa3`;
the exact running bytes/version were not independently read back. The earlier
supplied photo shows an MKII. Project, duration, worst-case load and receiver
measurements were not recorded. This remains a reported functional/persistence
test, not a new measured performance or power-loss qualification. It does not
qualify the different 0.0.15 combined card integration.

## 0.0.15 local combined card integration — 26 October 2026

USB implementation and normal local listing remain exact 0.0.13, SHA-256
`086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a`.
The new card adapter compiles that image with the unchanged shared bus source
at Elekloader revision `3b31ef3c0e43c810e3acd0be6257e2484b20fc40`.
Its stock-free resident ELF SHA-256 is
`0cdb83ecd28e501351fbb000c6cb4815f9fd3473698a4176df9bb758449d2044`.
The on-demand JSON package SHA-256 is
`1855453aaba61e82f50e8dee17c5591279e341d35a171d1bff52216f6138b690`.
It uses the existing native linker/bootstrap/logger/arena; no second core boot
or arena writes ship. Only three shared bus sites and the original 24 guarded
module sites are added. All 25 copies remain checked against original firmware.

The actual local HTTP compiler and engine session pass sixteen compositions:
all subsets of Sidechain Compressor, Play Modes and Mute Modes with both
classic/docking startup. Four representative complete BIN downloads (alone and
all three companions, both startups) pass packaging round-trip and digest checks.
An unreviewed TapeHead combination is refused; original firmware is unchanged.
The full resident text, including all pointers and checked stock replay, matches
an independent GNU link byte-for-byte. Private report:
`card15-combined-reviewed/report.json`. This is relocation parity, not a full
independent GNU composition of every companion's implementation.

The four-module docking candidate, label **MIDI2 C15**, has BIN SHA-256
`0f900d76718eddb167c1434d9a7e9344aa0104a241ee90a2a3d6e29d6db96f2f`
and MAIN SHA-256
`d30cfab0fecac4ff3a4a1484c0065e227a1aa419a9707e5bbb199507861f23f1`.
Its 116,396-byte native runtime uses the ordinary companion reservation of
10,586,112 bytes (unchanged legacy policy). Midi Mode 2 alone reserves 165,888
bytes, rather than triggering the legacy full reservation just for this adapter.
The build report separates the card package pin/version from the unchanged
USB implementation and published compiler identities.

Direct reset boot of that exact four-module MAIN, decoded from the packaged
BIN, passes all sixteen card panel/persistence assertions in fresh MKII emulator
processes: code/profile startup, NAME autosave, CC0/CC127 setup and native PB/AT
assignment restoration, NO/YES replacement, MIDI SETUP SAVED, cross-bank names
and channels, independent bank names and fresh-process restoration. No saved
USB set, private runtime publication, state injection, direct call or timing/IRQ
fixture is used. Private report: `card15-combined-boot/report.json`.

An allocated-section literal scan at 16 bytes with no skipped sites finds no
stock runs in the new unfilled resident object (`literal-scan.json`).

Focused app tests cover resident stock guards/zero placeholders/checksums,
copy overlap rejection, image/site relocation, missing symbols, ordinary
write-plan overlap refusal, local companion restrictions and unchanged published
compiler identity. Physical combined flashing/restart, actual MIDI transmission,
companion playback/muting/compression audio, timing, project copying and recovery
power cuts remain untested. No physical card was modified. The draft stays
unregistered publicly; module:doctor retains its intentional unknown-draft limit.

The local combination gate is bound to the published source-tree fingerprint
and exact companion versions in local-card-build.json. A future companion or
SDK source update requires rechecking the local combinations before building;
matching module names alone do not retain review.


## 0.0.16 USB-capable card installer — 26 October 2026

This supersedes the C15 local baked-card download with a ZIP of the unchanged
published USB base and initial saved sets. No base/loader/controller/DSP source
or compiled base package changes. Midi Mode 2 remains exact USB 0.0.13. All
three companions use their existing checked USB packages, not their C15 baked
objects. Normal USB inventory, update/removal, self-test and Keep/Undo remain
owned by the existing loader. Public production registration is still pending.

Exact default base identity:
`0c5934e1bea411fc43143a75ee2a0fcf1c09a71b8c386732ed7526517d3b0846`.
Base BIN SHA-256:
`110f1d57d6fc81f89d35288f06d44147b7477d9e0966b4845bcb922f5baebe2c`.
The site-session verifier compares it byte-for-byte by digest with the ordinary
Download base request on the same original 1.40C input. Actual link metadata
reports 281,996 runtime bytes and 4,571,136 reserved bytes. The callback added
to buildBase only exposes link facts; it does not change the linked firmware.

Initial sets use MWST v1, 84-byte header, four-byte record padding and 512-byte
file padding. Generations 1 and 2 contain the identical four packages. Their
file SHA-256 values are respectively
`a1fffd7b7265bf6f0097ecb6105cbcdb4090da56e8f93c4706047b53d054188a`
and `ba162cae19dc41d6c767bc6f690c2ec3b71eeaf17d0faade3986f8250b02da45`.
Packages, all exact bytes from the ordinary Sync fetch/validation path:

- Sidechain Compressor 95cff696: 1,236 bytes,
  `38d00b16b13382e152c01cc82e0af18e348dae6951e05eebbd910996f04990c2`.
- Play Modes be4ff75a: 14,846 bytes,
  `abf1cda888e617408b4d088bb9afd536f9ea96c1bdb90339e56a3932d300bced`.
- Mute Modes 73bab3b1: 2,702 bytes,
  `c35b154d7a6ff4d9affc339387d68bde87554aec82a87b60059b6307f5b2b848`.
- Midi Mode 2 f36a496d: 33,386 bytes,
  `086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a`.

Final installer ZIP SHA-256:
`2a74c5a19365f34fe704dc6322b33b61ca8ac846f0757baffff348664b8f0c92`.
`verify_usb_installer_session.mjs` passes the actual engine session and HTTP
package routes, independent unchanged kit ZIP-member/CRC decoding, exact base
comparison, both seed counts/digests, copyright notices, unsupported startup
refusal and original-input preservation. Private report:
`usb-card16-reviewed/session-proof.json`. The installer includes full component
notices and the module MIT text. Only source/metadata/tests enter Git.

`verify_installer_host.py` passes the exact four packages through the real C
loader plus the actual modset.c sector reader, with normal files in a temporary
host fixture. All four restore; corrupting the newer slot falls back to generation
1; foreign-base and FUNC skip restore nothing. A normal removal and Undo restore
all four and preserve the companions. Machine locks, DSP admission/ACKs, paused
contexts and event-dispatch boundaries are synthetic host glue; ColdFire code,
DSP engines and actual USB transfers do not execute in this proof.

Native emulator restoration did **not** complete. The old workspace emulator
stopped on the base's read-only boot mailbox scan. A fresh tool build from the
repository-pinned Octabam 8250be0 checkout fixes that scan. Reusing another
checkout's modified DSP vendor tree caused a host SIGSEGV; fresh matching pinned
vendors removed that failure. The matched build reached the RTOS handoff with
DSP frames, then timed out before the project-load/interactive stage. It reported
the stock M6a p1b-task assumptions as failing. Its optional real-time DSP mode is
unavailable on this host because DSP memory is not MMU-backed. No base firmware
was patched and no private publication, IRQ or timer fixture bypassed this.
There is no native four-module restore/persistence pass for C16.

Physical installer flashing, enumeration/WebUSB on macOS, complete restoration,
self-test, distinct-version update, Keep/Undo/removal/reinstall and physical
power-cycle/project persistence remain open. C14's reported hardware success
and C15's emulator proof do not qualify this different install path. The supplied
candidate is an initial test installer; it is not declared production-ready.

## C16 hardware follow-up and label-only USB revision test — 26 October 2026

After the C16 installation walkthrough, Cooper said “i think that all works”.
This is a tentative user report for the installer workflow, not an independently
captured exact-base inventory/self-test/Keep/restart receipt. No new physical
measurement, host/model/duration/load or firmware read-back was obtained here.
It does not complete the production performance/resource or owner-review gates.

A separate 0.0.17-usb-test fixture now tests a distinct package revision, retaining
the exact 0.0.13 baseline. It changes only package header bytes [50,66), the name
`MIDI CC SLOTS` to `MIDI2 TEST 17`. Both are 33,386 bytes, ABI 8, runtime ID f36a496d,
layout 1; all image, hooks, sites, copies, relocation and project-format bytes
remain identical. This exercises replacement, not new MIDI functionality.

Original SHA-256: 086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a.
Test SHA-256: 1d740235d843dbb6ab499809b7c6f5c77d85b08b1220cff1ce7504e64415e83e.
The ordinary local catalogue pin and C16 ZIP/base/saved sets are unchanged.

The actual local endpoint compiles the reviewed original and derives the exact
pinned test package. `verify_usb_test_pair.mjs` checks both hashes and proves the
limited header difference; private proof/packages are in usb-update17-reviewed.
The real C loader harness passes original→test→Undo, test retirement, reverse
replacement→Undo and return to original, with identical reclaimed memory and
closed masks/locks. This uses synthetic host glue, not CPU execution, USB,
DSP/CF work or physical restart.

The page compares the newest valid saved-file package set to the live MWS1
identity before staging, checks inventory/name and completed self-test during
trial, and exact package/companion hashes after Undo/Keep and after restart.
Request 38 is intentionally unavailable during a whole-set trial; the test does
not bypass that ownership condition. After Keep it requires saved=7 and complete
counts; after restart saved=1 and the exact kept revision. Both export snapshots
must validate; checksum-valid logical bodies accept unspecified sector padding.

Distinct-revision physical USB Update/Undo/Keep/power-cycle and return-to-original
checks are **not tested yet**. Follow USB_UPDATE_TEST.md and report each outcome.

Focused software checks for this test page: 80 tests in five files passed,
including exact MWS1 construction, saved-pair checks, substituted package refusal,
changed inventory/Undo refusal, failed card-save retry, self-test failure, both
Keep/restart directions and trial-only interface access. Typecheck, lint (existing
warnings) and licence checks passed. DOM/link fakes validate the test controls;
they are not physical USB results.

### Optional export correction after hardware preparation report

Cooper reported “Both saved module files must be readable for this test” at
Prepare. The guard failed before staging any package. Source audit of the exact
published base asset finds its runtime set-identity symbols but no saved-set
export/session implementation; export is an optional build flag, disabled by
default. The first page wrongly required a feature this reviewed base lacks.

The page now uses the pinned original/test and companion package hashes when
savedBackup returns unsupported (undefined), requiring an exact live MWS1 match
before and after the review read. It still validates both snapshots if export
exists; incomplete, unavailable, foreign or corrupt files and transport failures
do not fall back. Unknown companions or modified package hashes are refused.
Keep requires saved=7 and complete live/saved counts; restart requires saved=1
and the exact kept runtime set. These are base-reported persistence checks, not
an independent export of saved-file bytes. No firmware or package bytes changed.

Domain regressions cover both revisions across all eight reviewed companion
subsets, mismatched digests, duplicates, wrong base and unknown companions.
DOM regressions cover no-export preparation, Undo, Keep/restart in both directions
and mismatched-digest refusal. The corrected hardware run is still pending.

## Upstream merge and current-base 0.0.18 — 26 October 2026

Merged upstream main 1d61937a into the MIDI branch (merge d58e2b8b). The fork's
main was 264 commits behind; its own MIDI work was retained without rebasing.
There were no textual conflicts. A semantic conflict was reproduced: the current
compiler refused 0x40036548 because the newer base owns NOTE SETUP's entry for
`ot_midi_generators`. Old source cannot be offered on that new base unchanged.

Current candidate 0.0.18 leaves that entry and its stock-copy span out of the
package. The module instead takes the private epilogue at 0x4003678a, guarded by
SHA-256 47052304944b9cfc9cfc341c0fc61d2b8bc4e9bcd990d9608a46aef99cde5bda,
then returns at 0x40036792. Original MAIN disassembly shows the null-window
branch and ordinary path both enter the epilogue start; no observed branch enters
its displaced interior. The wrapper preserves volatile registers while the
stock 52-byte save frame remains intact, draws the same right-hand NAME/INIT
labels without calling stock's entry recursively, then replays the epilogue.
The base remains responsible for the entry and generator list. Project code,
controls and storage formats are unchanged. This is a source/disassembly proof;
full native UI execution and physical behavior of the new hook remain untested.

Exact current package: 8d971baca19198b9e35d7644c7c8810f917471f980eadc2db03fab8de3668451,
33,434 bytes / 28,964-byte image, 533 relocations, 24 sites and 25 checked copies.
Both authored image placements reconstruct with stock and installed-base guards;
the strict 16-byte literal stock scan passes with no direct current-base site
overlap. The real C loader passes install/publish/Undo/repeat/removal and full
memory reclamation against the new base MAIN (host glue, not CPU execution).

Published base c1ae2ee92a829e06aa9398d35981b8228efdd34c578c9583ef36fba8f5bc637f;
BIN SHA 9ce0529941588b06536d4caeeb724ad7f7e38a986b2daf10642a23f6318ab19e,
766,636 bytes. Actual runtime 299,748 bytes; reservation 4,644,864 bytes.
The current Sidechain package changes to
ed2431f0ffe91e3def6a0101441ed650cab1db9a25a6bf83bff2dc2555b8cd0e;
Play Modes and Mute Modes retain the hashes recorded for C16.

All eight subsets of the three reviewed companions plus MIDI build through the
actual local session. Independent ZIP/CRC decoding, saved-set identities/counts,
standard Download base byte identity, classic-startup refusal and unchanged
original firmware checks pass. The real C loader + modset reader restores all
four exact packages, falls back from a corrupted newer peer, refuses foreign
base/FUNC startup, and removes/undoes MIDI while preserving companions. The
harness adds stubs for the newer base's trig-muted raiser and refusal diagnostics;
these synthetic host tests do not execute DSP, USB, CF or ColdFire instructions.

Four-module ZIP SHA:
787c07d3c743f8c361cd5cc53fd69ddd54db8cf448dde6250807cd8408a549e9.
Initial saved sets (52,736 bytes each):
- MODWERK0.SET: 198b0c1d9ce879a2755b62894e262b50219d72883f1cde6d7ff5a745b86257b6.
- MODWERK1.SET: 23c3aa7c5d15178731aa87747b5bc16ae73777c30a01220b699f6d30fbf7a669.
Private outputs: usb-card18-upstream, usb-card18-session,
usb-card18-reconstruction. No physical card/device was modified by this merge.

The legacy compiler explicitly targets a hash-pinned ownership snapshot of the
older base; it still reproduces the exact original 0.0.13 package and label-only
0.0.17 package through the actual local endpoint after the merge. The old test
pins are independent of the current installer's new base/Sidechain/MIDI pins.
The normal new listing and trial refuse the older base rather than installing
new or old code on an unreviewed base. Historical C15 remains fingerprint-blocked
on this updated source and can be reproduced only at its recorded revision.

Cooper pasted the old-base test page's “Undo verified: MIDI CC SLOTS returned
with every original companion package. Nothing was kept.” and “Restart verified:
MIDI2 TEST 17 and every exact companion package restored.” After instructions to
return to the original and restart-check it, Cooper replied “yep”; the final
original restart message was not pasted separately. These are reported hardware
results for the exact legacy fixture, not independent device captures or evidence
for 0.0.18. Host/model/maximum load/elapsed time and receiver measurements remain
unrecorded. C18 needs fresh native UI and hardware install/self-test/Keep/Undo,
removal/reinstall/restart, names/channels/CC and companion audio/load checks.
Production qualification and owner first-release review remain open.

### Release measurement preparation — 29 October 2026

After the upstream integration, Cooper reported “it works” for the current
local candidate. This is a functional report, without a separately captured
individual package digest, model, duration or detailed coverage. It does not
upgrade the earlier version-bound lifecycle reports to 0.0.18 measured passes.
The local draft now marks hardware operation as reported, with these limits.

The memory audit reproduces the exact current package with compiler stack
reporting enabled. Its target-ABI allocation is 31,216 bytes, or 62,432 bytes for
two same-size revisions retained during replacement/Undo. Largest individual C
frame is 1,440 bytes; complete stack/stock-call and whole-system lifetime bounds
remain open. See [MEASUREMENTS.md](MEASUREMENTS.md) and its sanitized layout.
Public meter reads on the connected base returned unavailable values before
and after leaving disk mode. Those are incomplete observations, not zero load.
No device mutation was performed during these captures.
Cooper reported playback did not start after leaving disk mode; after the USB
bridge was released and Cooper power-cycled, playback worked again. Attribution
and reproduction remain open; this is not a timing or recovery qualification.
After restart a stopped public-meter comparison briefly removed only MIDI2 in
a RAM trial and then verified Undo by the exact original whole-set digest and
five-item inventory. CPU sampled maximum was 55.8% before, 55.5% without MIDI2
and 55.5% restored; DSP mean maxima stayed 50.9% / 41.9%. This is whole-device
stopped observation, not module worst-case timing. No Keep or project write.
The device's running MWS1 digest also matches an independent reconstruction
from the four published companion hashes and reproduced 0.0.18 MIDI2 hash.
See `evidence/runtime-identity-2026-10-29.json`; exact running package identity
and post-Undo restoration are established for this measurement session.
Cooper then confirmed “Eight tracks at 240; no issues” after a requested
65-second playback, Part change and STOP test. Passive MIDI and public load
observations are in `evidence/hardware-observations-2026-10-29.json`. This is a
functional report and captured traffic, not a wire-rate/drop-count, worst-case
cycle or stack qualification. No Keep or project write was sent by the tools.
All 26 pinned published runtime packages also had no patch/copy intersection
with this candidate in a static scan; no full coexistence pass is inferred.

The approved development-twin RAM session measured a 31,216-byte MIDI pool
delta: 77,168 bytes for all five packages versus 45,952 for the same four
companions. Eight readings per trial were stable. Each Undo restored all
786,432 free bytes and the largest free run. An initial probe returned
needs-recovery before automatic recovery completed; readback verified normal
and the empty set, and the repeat used the standard bounded recovery wait.
No Keep/accept or flash was sent. After the operator's normal power cycle,
the original flashed base and exact five-package digest were verified again.
See `evidence/hardware-pool-2026-10-29.json`. Stack, whole-system peak and
worst-case timing qualification remain incomplete.
The optional compiler call graph reproduces identical package bytes and prices
the known direct C chain at a conservative 1,932 bytes, with explicit return
allowances. This excludes indirect stock calls, assembly/reentry and task/IRQ
context, so it does not close the complete stack gate.
The three INIT screenshot records/captions were corrected to 0.0.13, matching
their existing capture provenance. No fresh 0.0.18 UI capture is inferred.

## 0.0.19 current-base compatibility — 5 November 2026

The authored MIDI runtime is unchanged from 0.0.18 and reproduces SHA-256 `8d971baca19198b9e35d7644c7c8810f917471f980eadc2db03fab8de3668451`. The new integration targets base `462fbd2b2ee95dd71c02778ef3b17aacba945bac9b6206688d8ef8995003826e`. The actual builder reconstructs its standard BIN to `2ababa2ad4a4622ab1e60a9ff60dd6f9f6abf3db6e4657f1a58afc1b391bdf3c` (780,868 bytes). Historical 0.0.18 pins are preserved separately.

Observed offline: strict 16-byte stock-free scan; all 24 patch and 25 copy guards against original and new MAIN; no base-owned overlap; both relocation fixture placements; actual C loader prepare/publish/Undo/reinstall/removal and full reclamation; actual C saved-set restoration with all four exact packages, corrupt-newer-slot fallback, foreign-base/FUNC refusal, and MIDI removal/Undo. The real local worker produced and independently decoded all eight companion subsets, matching the ordinary standard base output, with ZIP CRCs and both seed generations checked. These tests use host glue and authored reconstruction, not executed ColdFire or physical firmware behavior.

TypeScript and 240 focused local UI/link tests passed. Hardware execution, audible behavior, native UI capture, current-base memory/timing, Keep/Undo and restart persistence remain not tested on 0.0.19. Existing 0.0.18 hardware evidence is not transferred. See `evidence/compatibility-0.0.19.json` and the versioned hardware test steps.

`module:doctor -- --draft midi-cc-slots` cannot validate this local-overlay format: it expects `octamod.module.json` under the temporarily copied catalogue folder, which this intentionally unregistered draft does not provide. It exits with ENOENT; no release/doctor readiness is claimed. The explicit runtime, installer, domain and UI checks above remain the relevant local-candidate evidence.

Final candidate validation: 350 Vitest files passed (2,861 tests passed, two skipped), TypeScript and bundling passed; ESLint reported no errors and 13 existing warnings. No physical test was performed. Version notes remain in the existing draft `CHANGELOG.json`: the public per-module changelog registry correctly refuses unregistered module IDs. No catalogue or qualification gate was bypassed.

## Shared bank-load feedback — 21 November 2026

0.0.20-experimental is a new opt-in `--shared-bank-events` build, with caller/mask pairing across the two shared notifications and no private bank-load patch/copy. Eight host tests run the actual C profile/event code and real-file fixture: failed load, dirty-name preservation, pending recovery preservation/completion, settled A-to-B change, conservative same-project behavior, nested/unmatched contexts, bounded stack overflow and coalesced/retried engine wake. All passed. The test model and the limits of result-less notifications are explicit in BANK_LOAD_EVENTS.md; no native/hardware load failure is claimed.

The codec regression command passes (12 tests, one checkout-dependent skip by default); all 12 pass with the existing pinned Elekloader checkout supplied via ELEKLOADER_UPSTREAM. The historical standalone card builder now initializes that checkout through firmware_codec before importing Elekloader.

The 33,988-byte package (`236d5101468e9c186fec99fa6724eba4baa8fa32e5676affaddae7f7ab6bb622`) reproduces exactly. Its 42-word hook array subscribes indices 40/41 at order 60; 23 private sites and 24 stock copies pass guards, current base ownership/patch checks and a strict 16-byte stock-free scan. The real host C loader passes admission, publication, Undo, reinstall, removal and complete reclamation using the generated event registry. Legacy 0.0.13 still reproduces `086fc3c7…`. No firmware execution, full current-base composition, device update, card write, INIT or hardware trial was performed. Earlier physical measurements are not transferred to this build.
