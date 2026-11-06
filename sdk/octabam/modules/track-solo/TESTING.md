# Track Solo testing

## Hardware results — 6 November 2026

**Evidence type:** functional RAM trials on a real Octatrack, reported by the
author at the panel. Status reads below are device readbacks; behaviour is the
tester's report. No Keep, save, flash or power cycle.

| | Trial 1 | Trial 2 (release build) |
| --- | --- | --- |
| Module | `0.2.2-experimental` | `0.2.3-experimental` |
| Package SHA-256 | `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` | `1895ceecbfa74cd00cf07b2557ddbdf4668e32327d7c03fcf5c9f529547a5677` |
| Source commit | `7acb980a…` inputs | `35ec1ddfdf39f41f86a94ae1c3afdfa35c1a8eee` |
| Length | 600 s | 300 s |

Both ran on base `462fbd2b2ee95dd71c02778ef3b17aacba945bac9b6206688d8ef8995003826e` (OS 1.40C, ABI 10, features 903) with Track Solo as
the only module: the inventory was empty before each trial. Tester: twwwy. The
USB identity reports `OCTATRACK 1.40C`, not the model; MKII comes from this
unit's earlier records. The project was a disposable one with audio on several
tracks.

Client: `scripts/device.mjs try FILE --seconds N` without `--accept`, over
`scripts/octatrack-usb-bridge.py`. It reads diagnostics every second and rolls
back at the end.

Reported as working on **both** builds, with playback running: the TRACK SOLO
row appears and takes HOLD; holding T2 solos it; tapping T3 joins and leaves,
each tap toggling once; a second anchor works; while held only the anchor and
joined tracks sound, and release restores the mix with no clicks, cuts or stuck
mutes; excluded TRACK lamps stay dim but lit and recover on release; pages,
encoders, MIXER and PLAY/STOP keep working. Trial 1 also covered stock behaviour
of short presses with TRACK SOLO OFF.

Read back after each rollback: phase normal, inventory empty, set identity
`87f28e38d5fe18c3f6133158ddb0369f9b62f2a46b0ada8c8fc19de1ca9885e8` unchanged from before, both saved slots confirmed. The refused-request
counter stayed at 1 throughout; it rose before the trials, on a development
`screen` request this release base refuses.

**Why the row was missing on 5 November.** The base rolls back any trial after
10 s without a USB request (`HOST_TIMEOUT_TICKS`, `mv_tick`), and that attempt's
private controller sent nothing while it waited for `undo`. The trial was very
likely gone before the menu was opened, which also fits the unconfirmed ENTER
and no restoration being needed. This is inferred from the source and from the
row appearing as soon as the link stayed active; that run left no timing record.

**0.2.3 changes one detour.** Tuner reached `main` patching `0x4000d99a`, which
`modules:compat` refuses for any pair. `ts_frame_leave` moved three instructions
earlier to `0x4000d98e`, the frame counter read: six bytes, no branch lands in
the span, nothing else claims it, and only register restores and that counter
run between the two sites. The two packages differ in four byte ranges only: the
replayed instruction, the return address, the site and its guard.

**Not tested on hardware:** Track Solo beside Tuner or any other module, the
card build, MKI, all eight anchors, external MIDI, arranger rows, Pickup
recording, the K09 modifier orderings, Part or project changes during a hold,
self-test, Keep, power-cycle behaviour, audio measurement, and CPU or frame
timing. The emulator results below are for `0.2.2` package `6b7a…`; they were
not rerun on `0.2.3`.

## Track Solo 0.2.2-experimental status — 5 November 2026

This draft uses a 30-UI-tick hold (approximately 0.5 seconds). The source
revision under this evidence review is
`7acb980a07ebef61b98b791e85b098175438d8c3`; exact evidence still retains each
lane's own recorded provenance. Earlier host gesture verification passed all
eight anchors, 1,024 groups, threshold/edge logic, hidden-anchor handling,
editing logic, latest-state transformation and panel-row isolation. Its
recorded host/source provenance remains
`e7858af5a26e11123064e6a756e94522f95a8df1`; it is host/source evidence, not a
hardware result or an automatic rebinding to this review commit.

The recorded ABI 8 package build has SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` (2,128
package bytes, 1,500 linked-image bytes, zero BSS, 24 relocations, seven guarded
sites) and source commit
`1d2b93234b7e834187c68c74522ebf10ef52cb82`. Its six production-input hashes
match the files at review source revision
`7acb980a07ebef61b98b791e85b098175438d8c3`; this does not claim a new build at
the review commit. Private build
receipts and firmware remain outside Git.

On 3 November, this exact package was admitted to a manual RAM set on the MKII
running OS 1.40C. That historical trial added Track Solo 0.2.2, Pattern Sample
Locks 0.1.8 and Beat Slicer 0.1.68 to an older 17-module inventory (20 modules
total); Undo returned to those original 17 modules. This records hardware
package admission and rollback only. A separate attempt on 5 November used a
fresh 20-module baseline on base
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`. The
candidate inventory then confirmed 21 entries, but the attempt did not expose
the TRACK SOLO setting: the owner observed GLIDE and no TRACK SOLO. Undo ENTER
was unconfirmed and ROLLBACK was never submitted; the controller and bridge
exited with the claim recovery-required and device state UNKNOWN at that time.
The owner later confirmed Undo complete and no restoration needed. No later
device readback or current base/set identity is recorded, and no functional
hardware result is claimed. This report grants no new device authority. See
[DEVICE_TRIAL.md](DEVICE_TRIAL.md) for the sanitized record and distinct
owner-reported follow-up.

A separate validator has completed provisional exact-package emulator lanes
for package `6b7a9d2c…a2fd` on base MAIN
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`. The
scoped results and their limits are recorded below. They are emulator evidence,
not hardware qualification. Two additional Neighbor/Pickup playback cases, six
T8 Master cases, and one named P-lock edit/activation case have passed for this
exact package. Pickup recording and routing, active arranger rows, and other
interaction cases remain open. The manifest's all-zero `tests.evidenceRevision`
remains a schema placeholder because final source evidence binding is pending.
Earlier emulator passes below retain their own package and base identities.

### Local readiness checks — 6 November 2026

On the local review checkout at source HEAD `7acb980a07ebef61b98b791e85b098175438d8c3`
with the documentation and manifest edits in this working tree, Node 24
`npm run modules:check` failed because publication qualification is absent.
`MODWERK_BOARD=off npm run module:doctor -- track-solo` also returned nonzero:
library availability, performance evidence, publication qualification and native
comparison remain open. Package presence, USB package version, declarations and
cross-compatibility passed. The board was not checked. These checks do not
establish hardware behavior, cycle measurements or native card functionality.

### Menu and hold on the review base

On the emulator, run-04 used package SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`
and base MAIN SHA-256
`877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`.
The installed module ID, hook and relocated bytes were checked before menu
input and before the hold. The OFF → HOLD → OFF → HOLD menu sequence passed.
Holding T2 activated the overlay at 30 UI ticks; release cleared it while
preserving the canonical mute/solo word. Sample logs indicate approximately
495 ms in this emulator, not a hardware timing measurement. This run did not
test audio or saving. Scheduler job `b50b759753ca4f069f2f0dbeb9ca7bc6`
completed with exit 0; its private report SHA-256 is
`5af9b708112bdc9aea6db1f59eb84ca8827919a81ef0091fa3180a25426f7d82`.

### Provisional exact-package emulator results

Every result in this subsection is bound to package SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` and base
MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`. The
validator ran these cases in a separate worktree; no emulator was run during
this source-staging task.

| Lane | Result | Scope |
| --- | --- | --- |
| Native routines | **Passed** 8,693 checks and 12,820 balanced calls | Synthetic routine coverage; not hardware timing. |
| UI/control baseline | **Passed** all 18 named checks | Includes hidden-anchor behavior, LEDs, membership, edits, modifiers, transport, MIDI and active removal. |
| Standalone audio | **Passed** | Editing, membership, quick mute, MIDI mute, audio and removal. |
| Paired audio | **Passed** for OT, OTFX, OTFX-T and DT-T | The four Mute Modes policies; no hardware claim. |
| Standalone save/reload | **Passed** 52-file equality and stock reload | Emulator project-save/reload only. |
| Paired save/reload | **Passed** 52-file equality and stock reload | Emulator project-save/reload with Mute Modes installed. |
| Scoped control regressions `ts022-regressions-control-03` | **9 passed, 0 failed, 1 fixture-inconclusive** | The inconclusive case is the P-lock fixture; the broad no-save profile is not a save-regression test. |
| Mute Modes active-policy probe `ts022-regressions-control-02` | **Passed** modes 0–3 | Synthetic mode-setting writes; not a UI policy-change result. |

The scoped control regressions passed FUNC/CUE modifier-first and TRACK-first
ordering against the no-module stock result, preexisting mute and solo
restoration, CUE+TRACK behavior, timed MIDI mute changes, automatic
pattern/Part/bank transitions, tick-30 activation with synthetic anchor
key-up, and active-removal LED restoration. The removal check compared all 16
native TRACK LED levels immediately against the captured baseline before
releasing the anchor; the baseline was uniformly level 15 and the active group
was nonuniform.

In the earlier `ts022-regressions-control-03` profile, the REC/trig/encoder case
was **fixture-inconclusive**: no pattern bytes changed, and no no-module control
first proved that the same gesture writes a known parameter lock. That result
remains bound to its original profile; it is not revised by the separate case
below. The pinned project has `ARRANGEMENT=0` and no active row sequence;
arranger behavior remains untested. The additional playback and master lanes
below do not exercise Pickup recording, the full source/routing matrix, active
arranger rows, physical audio, or the remaining UI interaction cases.

### Named P-lock edit and activation case — 5 November 2026

Scheduled job `ab1a55300df9482781956db094ff1197` used fixture source commit
`b2cc52609880cce30f219058d53860396ec336dc`, manifest SHA-256
`09e77d9479b95e147420aa0d80c2571f11402504d0edab8a1578c34e9a87b257`, package
SHA-256 `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`,
base MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`, stock
MAIN SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`,
emulator SHA-256
`b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363`, fixture
card SHA-256
`cd01de72a311ac8e21e92782f671a18a65b8a0d26ab47a6ac23eaf9b1d1e94f0`, and
image SHA-256
`da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`. The
sanitized private execution report has SHA-256
`818a0b326ba8fcf848fa03feb1fee5b9a8d1dd1857cc9627062c2e1827e5c39e`.

Both the fresh stock-control stage and exact-package stage passed with zero
failed or inconclusive cases. Lead verification checked 399 ARTIFACT checksums;
the 349 frozen copied source/input files remained unchanged. The actual job
journal recorded `completed` / exit 0, both stage
predicates passed, AMP VOL preflight was verified, and the child process group
was clear after exact cleanup. In each stage, the SET DATE/TIME popup was
dismissed with UART YES and two quiet samples established normal context. On
the package stage, the actual T2 UART activation kept overlay
2 through REC, trig and encoder input; the T2 / pattern 1 / step 1 / slot 15
lock changed from `FF` to `3F`, matching stock. The canonical word stayed
`00000000`; release preserved the lock and left unrelated Part, RAM and CS1
state unchanged. Synthetic calls used the actual `ts_set` module-enable
function and the stock-reader probe; UART drove startup navigation, activation
and the P-lock edit. The frozen card remained unchanged. This closes only the
named emulator case; it is not hardware evidence and does not revise earlier
`33151`/`b45a` popup-blocked
activation failures or the `7d1` fixture-inconclusive result.

### Earlier `E-2.2` bounded control trace — historical capture

The following observations belong to the earlier `E-2.2` exact-package control
trace and its package/base binding above, not to scheduled P-lock job
`ab1a55300df9482781956db094ff1197`.

The bounded trace is collection evidence, not a global concurrency proof. Its
corrected panel sequence is module entry at `2736282.9`, restore at `2736291.1`,
panel canonical/mirror writes at `2736294.1`, then the next module entry at
`2736298.9` and restore at `2736307.0`. Thus the observed panel writes occurred
outside the adjacent module entry/restore pairs; this trace does not show a
panel write during the temporary module view, and no lost update is
demonstrated. Neither observation proves universal concurrency.
The corrected offline analysis found 16,782 events/8,388 pairs, zero known
stock writes inside a module pair, two panel writes outside, and four MIDI
writes with unknown pairing at the section start. SR/IPL and exception vectors
are unavailable to this capture, so Part-apply/higher-priority indirect paths
and universal concurrency remain unresolved.

### Additional exact-package playback and master lanes — 5 November 2026

Both runs use package SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` and base
MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`.

| Lane | Result | Scope and limits |
| --- | --- | --- |
| Neighbor/Pickup playback | **Passed 2/2** | Neighbor and Pickup each preserved the underlying state. Emulator playback only; Pickup recording and hardware audio are untested. Private report: `ts022-neighbor-pickup-sched-01`. |
| T8 Master | **Passed 6/6** | Three anchor selections and three joined-group selections passed with synthetic routing/mode inputs. The report does not exercise actual UART gestures, MIDI, DSP audio, glitch-free playback or hardware load. Private report: `ts022-master-profile-sched-01`. |

The scheduled Neighbor/Pickup summary records source commit
`177c52eb12c20ff2b90ca155ec12d67d597737b3`. Its package production-input
hashes match the six current inputs listed in
[resource-accounting.md](evidence/resource-accounting.md), while
`publication_runner.py` and its host-test file changed by source revision
`7acb980a07ebef61b98b791e85b098175438d8c3`. Keep that run package-bound; it
does not validate the changed runner. The T8 Master report records exact
package and base identities but no source commit, so it also supports only its
reported package-bound cases.

### Reproducing private runner lanes

The host runner pins the package SHA-256 above and defaults to immutable Docker
image ID `sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`
from the validation build receipt. Before a run, create a candidate hash-only
manifest for the exact lane selection and private inputs:

```sh
python3 -B sdk/octabam/modules/track-solo/publication_runner.py manifest \
  --manifest-output /private/track-solo-save-manifest.json \
  --cache-root /private/track-solo-cache \
  --build-dir /private/track-solo-build \
  --audio --save
```

Review every source and input hash against independent source/build receipts
and the trusted private input inventory; then retain the reviewed manifest
outside Git and pass that exact file with the same lane options:

```sh
python3 -B sdk/octabam/modules/track-solo/publication_runner.py run \
  ts022-save-new \
  --input-manifest /private/track-solo-save-manifest.json \
  --cache-root /private/track-solo-cache \
  --build-dir /private/track-solo-build \
  --audio --save
```

Manifest generation writes a candidate and never launches a container; the run
command refuses missing or mismatched identities before launch. The manifest
binds copied test/production/tool sources, base MAIN and symbols, stock MAIN,
package and package symbols, emulator, panel helper, and selected fixture
files. It contains hashes and lane options, not firmware, cards or other input
bytes. Paired, save and each broad profile select their own card identity;
optional Mute Modes inputs are included only when selected. A different
immutable Docker image requires a new reviewed manifest. Any reserved run
directory records `runner-error.json` and `isolation.json` on setup failures,
including lock and container cleanup state. Natural container exit is reported
separately from a stop issued for that run's owned container.

Host-only runner tests use synthetic temporary inputs and mocked process
boundaries; they do not launch Docker or an emulator:

```sh
python3 -B sdk/octabam/modules/track-solo/publication_runner_test.py
```

## Track Solo 0.2.1 with three companion modules — RAM load confirmed; tester reports no bugs; 2 November 2026

Track Solo 0.2.1 uses the one-second (60 UI tick) hold. Its rebuilt ABI 8
package SHA-256 is `df5dfcc9bc66079fe277316b48dd36e8ff5e21cc9adb8016ecd2f09ed18bc438`.
On the user's MKII running OS 1.40C and base identity
`2aa35c3965d13087e7b83ff6f29d17bd6e6b7a59c7ed443e8720684b2b6d157b`, a
manual RAM trial started with this exact four-package set:

- Track Solo 0.2.1: `df5dfcc9bc66079fe277316b48dd36e8ff5e21cc9adb8016ecd2f09ed18bc438`
- Pattern Sample Locks 0.1.8: `28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d`
- Beat Slicer 0.1.66: `6650ef77a837a61a570a300c3bd0b2d4dfd4c9bed6e52bb355034d39bf5ff90d`
- Mute Modes 0.2.1: `c35b154d7a6ff4d9affc339387d68bde87554aec82a87b60059b6307f5b2b848`

The complete set package SHA-256 is
`00ba3c63f34988fc76faca923334f30f3e50348e8f4a7b781c4269af3fa9d71e`.
The loader confirmed trial phase, that full active-set hash, and inventory for
all four modules. A first load was safely Undone when the running trial's
separate cached set-identity query stayed busy; the repeated load was verified
by its active-set hash and module inventory. Baseline restoration after that
first attempt was confirmed as normal with an empty inventory and the original
set identity. At the time of that historical report, the trial remained under manual Undo
with no host expiry; this is not a statement of current device state.
The user reports “didn't encounter any bugs”; tested actions and duration have
not yet been specified, so this remains an unscoped report rather than a
detailed hardware pass.
No SELF TEST, Track Solo gesture, audible routing, timing, LED, save, Keep,
flash, or persistence result is claimed. Private evidence is
`~/.cache/modwerk-track-solo/mkii-four-module-trial.log`.

## Track Solo 0.2.0 — solo-only RAM admission; superseded; 2 November 2026

The earlier 0.2.0 solo-only trial on the same base was Undone before loading
the four-package set. Its exact admission is recorded in
`~/.cache/modwerk-track-solo/mkii-manual-trial.log`; the empty baseline was
confirmed before the new set was staged.

## Historical 0.2.0 emulator and initial RAM admission — package `c26a5a6f…386d17c`; not 0.2.2 qualification

Every emulator result in this section belongs to package SHA-256
`c26a5a6f43ef4fec809d87c50f5a7a95bea7aadbffa1300cdff611108386d17c` and the
corrected private base MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`. These
are historical 0.2.0 results; they do not qualify the 0.2.2 package
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`.
The older storage findings and results remain in their original sections.

On 2 November 2026, a standalone MKII USB RAM trial began with the exact build 11
package below, on the unit's existing base identity
`2aa35c3965d13087e7b83ff6f29d17bd6e6b7a59c7ed443e8720684b2b6d157b`.
Read-only preflight confirmed ABI 10, normal/known baseline, empty inventory and
confirmed two-slot boot state. The existing loader accepted the ABI 8 package;
post-publication identity matched its full SHA-256 and inventory contained only
Track Solo. That solo-only trial was later Undone before the four-package trial
above. No base replacement, Keep, flash, project save, self-test or
functional/audible/LED/timing/persistence pass was claimed for this build.
Private evidence is `~/.cache/modwerk-track-solo/mkii-manual-trial.log`.
The earlier emulator evidence remains bound to its separately named private base;
this initial USB admission does not transfer that base's save qualification.

The revised input/LED path is local in `feature/track-solo-editing`, in the
isolated `~/.cache/modwerk-track-solo/ux-worktree`. The main checkout's earlier
uncommitted work and the separate ATA-ordering worktree remain preserved.

### Exact private candidate

- Track Solo 0.2.0, private build 11: package SHA-256
  `c26a5a6f43ef4fec809d87c50f5a7a95bea7aadbffa1300cdff611108386d17c`.
- 1,500 initialized image bytes, zero BSS, 24 relocations, seven guarded sites,
  2,128 package bytes; no DSP allocation. Native stack and hardware CPU remain
  unmeasured. The audio-frame shim source is unchanged from the corrected-base
  0.1.1 compatibility prototype.
- Corrected private base 4 MAIN SHA-256:
  `124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`.
  Its shared storage fix remains hardware-unqualified and owner-unreviewed.
- Unchanged optional Mute Modes 0.2.1 package SHA-256:
  `c35b154d7a6ff4d9affc339387d68bde87554aec82a87b60059b6307f5b2b848`.
- MKII emulator SHA-256:
  `b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363`.
- Build uses the shared guarded ColdFire code generator, verifies original stock
  identities at every site, proves linked-image/package parity and passes both
  unchanged strict stock-free scans (12 counted bytes / 16 literal bytes,
  including the packed DSP views). No scanner, admission gate or companion
  module was relaxed or modified.

### Fixture and observed intermediate findings

`ux_test.py` is a focused eight-tone fixture with separate control, DSP and
no-edit-save lanes. Input goes through the real panel UART; installation/removal
uses the actual runtime backend. Debugger calls are fixture setup, not USB or
hardware lifecycle evidence. Each run freezes private inputs and test sources,
uses a fresh scratch card, takes the emulator lock and monitors other host and
container emulators. A competing emulator aborts only this session's test.

The original hold installed a stock TRACK shortcut layer. Merely hiding held-key
queries left PLAY reaching that layer. Activation now retires it with one stock
release after the anchor is hidden; the later physical up is consumed. The real
panel control lane confirms ordinary transport, REC, editing, mixer operations,
cue and MIDI behavior, parameter retention and removal.

Early fixture failures are retained, including an unsupported encoder command
(corrected to the UART report) and an incorrectly sized removal packet. Build 2
passed its early controls, but its DSP run was deliberately stopped after the
LED implementation changed; it has no current qualification verdict. Intermediate
packages refused by stock-free scanning are not trial candidates. The final leaf
LED filter and early-exit non-track scan pass the unchanged scanners.

The long direct-call routine lane also exposed a caller error: the emulator's
`callAsMain` leaves argument cleanup to the caller, but the old Python wrapper
repeatedly supplied arguments without reclaiming their stack slots. It eventually
reached a stock HALT. `fixture_call.s` now supplies arguments from mutable data
through fixed test-only code, cleans its own argument area and records entry/exit
SP. The wrapper verifies stack balance and a stable caller SP on every native
call. It does not rewrite a previously executed trampoline and is never included
in the module or a device image. The production emulator and shared SDK are
unchanged.

### Reproducing the focused lanes

Run one emulator at a time. Prepare a private input directory containing
`MAIN.raw`, `base-symbols.json`, `track-solo.mwrm`, `symbols.json`,
`stock-main.raw`, `ot_emu`, `panel_link.py`, `card.private.img`, and, for paired
runs, `mute-modes.mwrm` and `mute-symbols.json`. The symbols must match the exact
base and packages. The card is a scratch eight-tone `SOLO/TEST` project made by
`prepare_fixture.py`; paired playback uses its delay variant. Copy inputs and
fixture sources per run, hash them, and keep all outputs outside Git.

```sh
python3 -B sdk/octabam/modules/track-solo/ux_test.py --inputs /private/inputs --output /private/control
python3 -B sdk/octabam/modules/track-solo/ux_test.py --inputs /private/inputs --output /private/audio --audio
python3 -B sdk/octabam/modules/track-solo/ux_test.py --inputs /private/inputs --output /private/paired --audio --paired
python3 -B sdk/octabam/modules/track-solo/ux_test.py --inputs /private/inputs --output /private/save --audio --save
python3 -B sdk/octabam/modules/track-solo/ux_test.py --inputs /private/inputs --output /private/paired-save --audio --paired --save
```

Outputs must be new directories. The `m68k-elf-*` toolchain is needed by the
test-only native-call helper. SAVE lanes use the plain card, write only their
private copy, compare 52 project files, check bank checksums and FAT structure,
exercise the real guarded project-reload entry, then load with original stock.
The private host runner additionally holds `/tmp/modwerk-emulator.lock`, monitors
host/container processes and verifies frozen input hashes after each run.

`ux-paired-2` retained a failed immediate-audio assertion in OTFX-T: a stopped
joined T3 was sampled before its next programmed trig. The fixture now waits
2,100 simulated milliseconds (one 16-step bar at 120 BPM plus margin) in OTFX-T
and DT-T, as the earlier companion fixture already did. This does not create a
new trigger or change production code. OT and OTFX retain immediate checks.

### Historical 0.2.0 result ledger — package `c26a5a6f…386d17c`

- Host contract suite: **passed** all eight anchors / 1,024 groups, hold boundary,
  paired edges, hidden anchor, modifiers, editing context, lost release, disabled
  behavior, frame-word transformation and TRACK-row isolation.
- Final-package control fixture `ux-controls-6`: **passed** 18 named observations,
  including a real parameter write retained after release and all seven sites
  restored on active removal; uses the corrected caller wrapper.
- Native routine fixture `ux-native-3`: **passed** 8,693 checks and 13,720 balanced
  native calls, including all group masks and four companion policies. Synthetic
  routine inputs do not establish real audio or hardware behavior.
- Standalone live-DSP fixture `ux-audio-2`: **passed** live editing, eight
  membership toggles, quick mute, actual MIDI mute, release and active removal;
  122 frame-progress observations. Audio source is an eight-tone project.
- Paired live-DSP fixture `ux-paired-3`: **passed** standalone controls in
  unchanged Mute Modes 0.2.1 OT, OTFX, OTFX-T and DT-T. The -T modes wait for
  their next programmed trig. Quick mute on joined T3 and actual MIDI mute of
  anchor T2 remain underneath the temporary group and take effect on release;
  active removal restores all seven sites.
- Standalone save fixture `ux-save-2`: **passed**. Two no-edit saves, including
  entry with the anchor held, left all 52 project files equal. FAT and bank
  checksum checks passed; a real project reload hit the guarded entry, preserved
  those files and loaded in a fresh original-stock emulator.
- Paired no-edit save / stock reload `ux-paired-save-2`: **passed** with
  unchanged Mute Modes 0.2.1 installed. Two saves including held-anchor entry,
  all 52 project files unchanged, FAT/bank checks, actual guarded project reload
  and fresh original-stock project load passed. The saved mute state remained
  underlying state; the temporary group was canceled on PROJECT entry.

Together the five exact-final lanes `ux-controls-6`, `ux-audio-2`, `ux-paired-3`,
`ux-save-2` and `ux-paired-save-2`, plus `ux-native-3`, passed. Each private
report binds package SHA-256 `c26a5a6f43ef4fec809d87c50f5a7a95bea7aadbffa1300cdff611108386d17c`
and corrected-base MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`. All
lanes observed no competing emulator and preserved their frozen inputs. The
standalone/paired save lanes took about 17.6/17.4 minutes of emulator wall time;
this is harness/emulator duration, not instrument timing.
- Physical MKII/MKI, visual LED brightness, USB review/trial/Undo, CPU/cache/IRQ
  bounds and power-cycle persistence: **not tested**.

At the time of this historical 0.2.0 record, the module doctor confirmed
cross-compatibility and the existing author claim, while reporting absent
catalogue/packages, current native comparison and hardware qualification.
Those findings are not a fresh gate result for this checkout: the current
catalogue/package facts are recorded above. Do not invent hardware evidence
or infer publication readiness from local staging.

### Coverage limits and device preparation

The 64-case interaction specification is the design target, not a claim of 64
independent completed native tests. The lean fixture targets the changed paths.
Live arranger-row automation, the full recording/Pickup source matrix, every
machine/routing combination and a long maximum-load soak are not established by
its simple eight-tone tests. Earlier broader-machine results belong to their
named earlier bases/packages. Follow up on the exact revised package rather than
transferring those results automatically.

Changing Mute Modes through PROJECT cancels naturally at PROJECT entry. A live
policy change outside that workflow is left to the companion without new private
state coupling; either cancel/keep outcome was explicitly accepted for this edge.

[DEVICE_TRIAL.md](DEVICE_TRIAL.md) records the later 3 November admission and
Undo of package `6b7a9d2c…a2fd`. It establishes no functional behavior. The
historical emulator lanes above remain tied to `c26a5a6f…386d17c`; the newer exact-
package results and their limits are recorded near the top of this file.

## Historical 0.1.x source and storage evidence — not current 0.2.2 qualification

The remaining sections describe the earlier prototype and shared storage work;
their dates, hashes and qualification limits remain applicable to those builds.


The following sections preserve the `0.1.x` source and storage history. Their
builds and results are not evidence for `0.2.2-experimental`. The current
manifest's all-zero `tests.evidenceRevision` is only a schema placeholder; the
final source and qualification binding is deferred until exact-package results
and the release scope are settled.

## Compatibility change

The former late level-register override could force stock-style hard cuts after
Mute Modes had already calculated its soft mute, and could not reopen its
voice/trig gates for a previously muted anchor. The new code removes that site.

Track Solo alone now lends the normal audio-frame interrupt a temporary
mute/solo word: low eight solo bits are the group, mute bits are clear and the
upper 16 bits, including cue, are preserved. It restores the original word
before returning to tasks. Neither Mute Modes nor the shared SDK was changed.
Each frame snapshots the current underlying word; there is no hold-long
snapshot that could overwrite a later underlying edit.

Candidate B enters at 0x4000aee0, after timer/DMA setup and before track
processing. The early-return path and re-entry guard precede it.
Exit was at 0x4000d99a through 0.2.2; 0.2.3 moved it to 0x4000d98e, three
instructions earlier, because Tuner patches 0x4000d99a. Both are before USB Audio's producer at 0x4000d9a0 and the base's
frame guard at 0x4000d9a6. Both six-byte sites have original-OS SHA-256 guards.
The patches avoid the base's shared entry/exit sites and all Mute Modes sites.
They replay their displaced instruction and its flags. The new scope adds no
interrupt masking, loops, allocation, DSP engine or stock-function calls.
The production wrappers inline the same macros as the direct-call probes.
OFF uses no stack or state write. Active wrappers use four extra stack bytes;
the standalone probe helpers use eight including their return.

Source review: the normal frame body retains interrupt priority at least five;
UI, save, MIDI message processing and runtime publication are tasks. Higher
priority UART interrupts enqueue bytes; the lower priority MIDI framer and
MIDI task process mute/solo CCs. The loader commits a module's two site writes
together with interrupts masked, and retires it from task context. Thus a task
cannot unload between the paired frame operations. These are OS 1.40C/source
findings, not hardware qualification or a guarantee for arbitrary future modules
that might write the live word inside the same interrupt.

## Reproducing the private build

```sh
python3 -B sdk/octabam/modules/track-solo/verify.py
python3 -B sdk/octabam/modules/track-solo/generate.py
python3 -B sdk/octabam/modules/track-solo/generate.py --check
```

Generation uses the pinned ColdFire compiler in `modwerk-source-tools` and both
unchanged shared code-generation guards. Build the module from its published
source path with the unchanged `sdk/runtime/loader/build.py --octabam
track-solo`. Keep package and firmware outputs outside Git.
Native linking must have no undefined symbols. Private reports and artifacts
are under `~/.cache/modwerk-track-solo/`; original firmware never enters Git.

## Historical evidence for the 0.1.1 candidate — package identities below

Host gesture regression **passed**: OFF, threshold at 119/120 UI ticks, all eight
anchors and 1,024 valid groups, repeat suppression, paired press/release edges,
all other keys before/during arming and active solo, encoder cancellation,
disable and context changes. The gesture creates no musical clock.

Candidate B compiled ColdFire and actual stock level-routine comparison
**passed 533 checks** as part of `scope-b-routine-mute-1/report.json`. All 255 nonempty groups are compared
against stock solo inputs in both stock routing branches. Canonical word and
Studio-mode byte restore checks are separate from the resulting level bytes. The
helpers also restore their own snapshot if the selection changes before exit.

Candidate B's extended test **passed 8,693 checks**, including those 533 plus 8,160 calls
to unchanged Mute Modes' actual voice-bind gate: four modes, 255 groups, eight
tracks (`scope-b-routine-mute-1/report.json`). OTFX-T and DT-T drop excluded
tracks' voice resets and allow group members, including previously muted
members. OT and OTFX pass all voice resets as designed. These are direct calls
with synthetic inputs; they do not establish complete sequencer/DSP behavior.
The gate's own code, not a reimplementation of it, supplies the answers.

The original paired audio evidence covers FLEX sequencer playback. The broader
checks below add a specific external chromatic-note case; they do not qualify
every voice-start path outside the audio interrupt.

Candidate B paired audio **passed all four modes** in four complete runs:
`scope-b-ot-1`, `scope-b-otfx-1`, `scope-b-otfxt-1`, `scope-b-dtt-1`.
Each covers ordinary solo as control, held solo/group toggles, cold-muted anchor,
pre-existing solo and removal of both packages. A post-run audit of every log
also passed periodic frame-count progress; `scope-b-pair-summary.json` preserves
these exact-build results. Standalone candidate B **failed** its byte-preservation check
(`scope-b-save-1`): both saves completed, FAT mirror/dangling-link checks pass,
but bank13.strd has 184 changed bytes inside one 512-byte sector and its bank
checksum is invalid. Sector 689 duplicates sector 688 of that same bank.
This is not a legitimate saved mute-setting difference. Native module code is
frozen while interrupt-register preservation and stock I/O controls are traced.
The candidate B / original-base combination remains withdrawn. The first paired-save attempt stopped earlier on
a debugger peek made within the intentional temporary-view window; that probe
was corrected to sample outside the stock frame-busy guard, with the DSP/frame
clock still running. The corrected paired-save run (`scope-b-paired-save-2`)
also **failed**: bank08.strd sector 801 duplicates sector 800, changing nine
bytes and leaving an invalid checksum. Both saves completed. This used unchanged
Mute Modes, with synthetic OTFX-T input for the held-save case.

Two module-free controls **passed** two saves, including the held-TRACK gesture:
original stock firmware (`pure-stock-save-1`) and the exact empty Modwerk base
(`empty-base-save-1`). All saved files remained byte-identical and every bank
checksum was valid. Their periodic frame-count audits also passed. Their panel
sequence omits Track Solo's group/mask cases, so this is not a matched full-
workflow control. It does not clear candidate B's save failure.
A third original-stock control (`pure-stock-playing-save-1`) keeps PLAY
requested through the second panel save and also passes byte equality, every
bank checksum and its periodic frame-count audit. It does not capture PCM or
replay the complete Track Solo gesture/mask sequence.

The save harness now independently validates every bank checksum at baseline
and after saving, in addition to FAT and byte-equality checks. Applying this
validator to the two control cards passes; both damaged candidate cards fail.
The stock first-sector PIO write path has an observed ordering race in the
failing emulator workflow; see the trace below. This is not proof of an
emulator-only defect or an excuse to relax preservation checks.

A diagnostic replay of the original standalone workflow
(`scope-b-save-trace-2`) reproduces the bank13 failure and matches **147,011**
frame entries to returns with no general-purpose-register or stack-pointer
differences. It has zero unpaired returns and one unfinished entry where the
debugger stopped; the capture did not saturate. This checks the full saved GPR
set, not MAC state or all exception-header fields, and does not prove timing
safety. Its periodic frame-count audit passes despite the corrupted bank.

The next diagnostic (`scope-b-save-ata-trace-1`) reproduces the same bank13
checksum failure. Its 57,351 PC probes include 11,786 first-sector pointer-
update probes. One catches the first writer delayed until after two ATA
handler transfers: the handler loads 0x4ecd9000 (the first sector again), then
0x4ecd9200, before the writer resumes. The writer's actual first-sector end
remains 0x4ecd9200 in a0/d1, but it now computes 0x4ecd9600 from the shared
pointer. That 1,024-byte discrepancy demonstrates handler progress before
the initial writer's bookkeeping; the repeated first-sector transfer explains
the observed duplicate. Private `ata-pc-order-report.json` retains the register
sequence. The RAM-write watch in this diagnostic used the wrong address alias
and is unusable; the independent PC probes supply this evidence.

The module code remains frozen. The user approved a separate local SDK/base
prototype that prepares the next pointer/count before first-sector completion,
preserving the current Track Solo package and unchanged Mute Modes. Exact-build
results are recorded below; the original failing base remains withdrawn.
Completion-event ordering, single-sector requests and original-stock reload
are required checks; moving the pointer alone does not qualify a fix.

A separate stopped, module-free diagnostic wrote four distinct sector markers
10,000 times at varying phases and passed (`pio-stock-diagnostic-1`). Its
direct-call fixture cleans its arguments from main's stack. The corresponding
PLAY attempt could not reach the emulator's required main idle context and
performed no writes, so it is not a storage pass or failure. These diagnostics
do not clear the reproduced full-workflow failure or qualify hardware.

An isolated replay attempt (`isolated-save-1`) used frozen, read-only copies
of the same emulator, firmware, package, fixture and test sources. Resource
checks initially found no other emulator, but another session started one at
2026-10-30 15:04:11 UTC. Only this replay was stopped. The isolation report
records 47 checks, detected overlap and unchanged inputs. The save check did
not complete, so this attempt supplies no new preservation pass or failure.

The requested isolated rerun (`isolated-save-2`, 2026-10-31 Taipei) completes and
**fails with the same corruption**. Its Python dependencies and replay script
match the previous isolated attempt byte for byte, retaining the original raw
debugger stimulus and trace limitations. No native code changes were made.
Its 161 resource observations detect no other emulator, and every frozen input
hash is unchanged. Both saves return engine-idle (10,300 and 11,000 simulated
milliseconds; these are not device throughput measurements).

The first saved baseline has valid banks. After the second save, 51 of the 52
work/stored project files remain identical; only `bank13.strd` changes, by 184
bytes. Sector 689 duplicates sector 688. Its computed checksum is 14,091 versus
the stored 59,323. Both cards pass FAT mirror and allocation-link checks. The
complete final card SHA-256 is
`604c18b84e985716abf597b9ffa035faf117909462edd05aef138b7cbd27b617`,
identical to the earlier standalone failures. The periodic frame-progress audit
passes 426 observations. Fresh stock reload is not attempted after preservation
fails. Private `isolated-save-2/result/preservation-audit.json` records the file,
sector and checksum comparisons. This isolated reproduction does not establish
that the defect is emulator-only or qualify MKII use.

### Separate shared-base ordering prototype — 31 October 2026 Taipei

The local change is isolated in `~/.cache/modwerk-track-solo/storage-fix-worktree`,
branch `fix/ata-first-sector-ordering`. It changes the shared base's first-sector
PIO ordering, not Track Solo or Mute Modes. Both module package hashes remain
those listed above. The current correctly configured candidate is
`ata-order-experiment-1/integrated-base-4`, MAIN SHA-256
`124548dc353b2f9cd41ba0a27113ae441e82b68a16d10a1b9509920c61839587`.

The native proof (`probe-run-5`) passes 480 interrupt/data cases and 80 stock-
oracle ABI/error cases, including one-sector requests, maximum counts, latched
completion, the caller's IPL at every first-sector write, full register/SR/SP
comparison and rejected arguments. The unchanged stock negative control
reproduces a duplicated first sector. The 68-byte helper adds ten instructions
to the existing masked setup and restores caller SR before polling/streaming;
it does not mask the entire transfer. No BSS or DSP code is added. Hardware
duration remains unmeasured.

The generic TypeScript kit verifier passes; its unpacked intermediate is separate
from the boot candidate. The unchanged browser `buildBase` path fills and packs
the stock-free package and matches the exact build-4 bin and MAIN byte for byte.
The unchanged strict scanner passes at 16 bytes. Complete SDK source checks pass
with Node 24 and normal generated-file preparation (493 Python tests, 69 declared
skips; upload/transport checks; 39 recipe tests, one skip). The candidate itself
was compiled with the reviewed MCF54455 toolchain in Docker and passed codegen
and site compatibility. There is no new native source change since those checks.

Earlier build 3 (`e32cbe63…`) passes standalone `ata-order-save-3` with the
unmodified guarded panel harness and default card timing, both DSP cores and
frame progress. Both panel saves complete (10,300 and 11,000 simulated ms).
All 52 project filenames/bytes remain identical, all 32 bank checksums validate,
and both cards' FAT mirrors/links pass. Its baseline files exactly match
`isolated-save-2`'s baseline. Fresh original-stock MAIN (`164f3122…`) reloads the
final card with DSP enabled and sixteen FX assignments still NONE. All 172
resource observations are exclusive; frozen inputs remain unchanged. These
results belong to build 3, not automatically to the rebuilt candidate.

Build-3 paired runs -1, -2 and -4 stop before saving. Trace -4 shows the staged
Mute Modes package, live prepare code, event entries and fourteen live stock
guards all match expected bytes. The refusal comes from metadata admission:
the prototype build omitted the original base's existing `--table-owners`
option and four unchanged ownership inputs. Empty table storage correctly
refuses Mute Modes. Build 4 restores that option and the exact existing reviewed
record; every original input now matches except the intended build_core.py
change and the two helper files. No module source or admission rule was changed.

No-module attempt -1 and paired trace -3 were interrupted when another session's
emulator appeared; neither has a save verdict. No-module attempt -2 was cancelled
to test the corrected configuration instead. Only this session's tests were
stopped. The first appended-helper boot experiment is withdrawn because its
address lies in stock live-bank RAM; the project did not finish loading. The
correctly linked builds place the helper at `0x40abf23c` in reserved runtime.
Legacy trace `ata-order-save-2` kept an intentionally disabled task guard and
stopped on an in-frame debugger peek before the second save; it has no
preservation verdict. Passing guarded runs keep frame/DSP execution and all
file/checksum assertions intact.

Full paired workflow `ata-order-paired-save-5` passes on build 4: eighteen
checks, two real panel saves (10,300 / 11,000 simulated ms), all 52 project file
names/bytes identical, all 32 bank checksums and both FAT mirrors/links valid,
fresh original-stock DSP-enabled reload, companion OTFX-T mode preserved and
476 frame-progress observations. All 170 resource observations are exclusive;
frozen inputs remain unchanged. The independent preservation audit confirms
the baseline's 52 files match the original failing isolated run exactly.

Standalone `ata-order-save-4` also passes on build 4: seventeen checks,
two real panel saves, all 52 filenames/bytes identical, 32 valid bank checksums,
FAT checks and fresh original-stock reload. Its independent audit records 471
frame-progress observations, 175 exclusive resource checks and unchanged inputs.
The standalone and paired final card images also have identical SHA-256
`d83d4466719f443aa69203f436abad3b4b879ec264bda09b64545b3b6dfe3daa`.
The no-module control `ata-order-empty-save-3` passes both real panel saves
(10,300 / 10,800 simulated ms), all 52 filenames/bytes, all 32 bank checksums,
FAT checks and fresh original-stock reload. Its independent audit records 336
frame-progress observations, 163 exclusive resource checks and unchanged inputs.
All three final card images (paired, standalone and no-module) match exactly.
These save workflows contain 508 exclusive resource observations in total.
Four-mode paired playback `ata-order-pair-audio-2` passes on build 4: all
sixteen mode cases plus removal of both packages (17 observations), original
sites restored, underlying mute/solo and mode preserved, 553 frame-progress
observations, 247 resource checks with no other emulator detected and unchanged
frozen inputs. The private task-context wrapper only samples/edits canonical
fixture inputs outside the stock frame-busy guard; DSP/frame execution and all
musical predicates remain intact. Inputs are explicit synthetic mute/mode state,
real UART gestures and real DSP stem capture, not hardware or USB lifecycle.

| Mute mode | Observed held-solo behavior |
| --- | --- |
| OT | Excluded stems are silent. |
| OTFX | Excluded dry signals stop; the existing delay tail remains. |
| OTFX-T | The tail remains and excluded trigs are blocked; a stopped joined voice resumes at its next programmed trig. |
| DT-T | Existing looping voices continue; excluded new trigs are blocked. Releasing restores the prior control state without forcing those voices to stop. |

The three save workflows and four-mode playback contain 755 resource checks
with no competing emulator detected, and 1,836 frame-progress observations.
At the time of this historical prototype report, its required local checks
passed on that named build; hardware, full-machine/companion matrices and
release qualification remained separate. The report recorded no push, PR,
public beta regeneration, USB/device load, Keep, flash or physical project
save at that time; this is not a current repository or device-status claim. Physical MKI/MKII,
card/CPU/interrupt timing and release qualification remain pending. Earlier
broader-machine/routing/MIDI results below belong to the original base, not
this rebuilt candidate. Exact receipts and limitations are in the shared
prototype's `ata-order-probe/README.md` and private run directories.

Candidate A passed 16 paired mode cases across three runs (preserved in
`scope-pair-summary.json`) but is **withdrawn**: its second DSP-enabled SAVE
stopped producing frames and stopped sector writes. Increasing only the test
wait did not resolve it. The original 0.1.0 package passed the identical full
workflow, byte comparisons and fresh original-stock reload
(`scope-save-old-control-1/report.json`). Candidate B therefore moves entry
past the DMA setup and removes frame-path helper calls. The actual cause of
candidate A's frame stop has not been proven; B must pass that exact workflow.

Both unchanged strict stock-free scanners **passed** the exact new package.
Declaration-level cross-compatibility passes beside all active modules and the
base in that historical report. The doctor's public listing,
package/fingerprint, native comparison/pair listing and release qualification
failures were recorded draft gaps at that time; they are not fresh gate
results for the currently staged checkout. No gate was weakened to hide them.

## Pairing method and expected behavior

`mute_modes_test.py` installs the exact two packages through the real runtime
backend, uses actual UART track-button gestures and runs both DSP cores with
the frame interrupt. Mode and underlying mute/solo inputs are explicitly
synthetic. It records eight PCM stems for ordinary solo, the two-second hold,
T3 joining/toggling, release, a cold-muted T2 and a pre-existing T1 solo.

| Mode | Behavior to verify |
| --- | --- |
| OT | Excluded tracks cut after FX; selected tracks play. |
| OTFX | Excluded dry voices cut; stock FX tails remain; trigs keep running. |
| OTFX-T | Excluded dry voices release, FX tails remain and new trigs are suppressed. |
| DT-T | Already sounding voices finish under their own envelopes; new excluded trigs are suppressed. An infinite loop can keep sounding. |

The fixture uses eight original generated tones, all Parts and banks, with
stock DELAY on T1 FX2 for tail comparisons. `prepare_fixture.py --t1-delay`
reproduces it from a private local template; other tracks retain FX NONE.
The unchanged companion is Mute Modes `0.2.1-experimental`, byte-identical to
its published package. Ordinary solo on that same companion is the control.
Track Solo never reads Mute Modes' private settings or state.

Voice-start counters at 0x80004a68 + 168*t have other writers and are supporting
observations only. Their deltas do not prove the complete number of sequencer
trigs suppressed; use the direct gate results and DSP observations separately.
The original pairing fixture does not cover short/non-looping/retrig samples.
The separate broader checks below exercise those cases without Mute Modes;
their complete four-mode pairing remains a qualification gap.

This fixture has one trig on step 1, 16 steps at 1X and 120 BPM. The -T tests
record immediate join audio, then allow 2,100 ms for the next programmed trig
before requiring a previously stopped voice to sound. Release likewise lets
restored tracks reach their next trig. Track Solo never manufactures a trig.
The initial matrix stopped in OTFX-T because its old 100 ms join assertion did
not allow that restart. Its completed OT/OTFX observations remain separately
recorded; the two -T modes are rerun with this explicit timing distinction.

## Broader emulator checks, 2026-10-31

These checks use the unchanged candidate B and unchanged Mute Modes package
identified below. `broad-run-1` freezes the harness and inputs, runs one emulator
at a time, and monitors for another session's emulator. It uses generated tones,
both DSP cores, frame interrupts and UART button/MIDI inputs. Routing/settings
and initial mute words are synthetic fixture inputs. Ordinary stock solo on the
same running firmware is the audio control; this is not a module-free comparison.
The backing card is read-only and no SAVE PROJECT result is supplied by this
suite. Native module, base and companion code remain unchanged.

**Latest combined coverage: 26 scoped cases pass**, using the first run's
passing observations and the completed targeted follow-up below. The original
failed/inconclusive observations are retained, with their test corrections
explained here. This is playback/control evidence, not save qualification.

The first run completed **20 passing cases, one failed case and two
fixture-inconclusive cases**. Its 642 resource observations detected no other
emulator; all frozen inputs remained unchanged. Periodic frame-progress audits
pass in all three profiles (1,286 control, 466 machines, 192 master observations).
Completed observations:

- Four normal/Studio and CUE MUTES TRACK combinations pass MAIN, CUE and eight
  stem comparisons, with positive CUE signal and preserved underlying state.
- Actual MIDI mute, solo and cue CCs during a hold pass. Underlying edits survive
  release while the active group remains T2; MAIN contains only T2 in the capture.
- External MIDI clock at 120 then 240 BPM passes the sampled hold-threshold and
  release checks. This is not a sub-millisecond timing measurement.
- Bounded stress passes eight anchors, groups containing all eight tracks,
  24 short holds, eight stock delays, all seven track-speed indices and swing,
  followed by 20 simulated seconds of steady running.
- An external chromatic note to a joined, previously muted T3 sounds in OT,
  OTFX, OTFX-T and DT-T, with the sequencer on a silent pattern. This specific
  stopped-sequencer note test passes in all four unchanged companion modes.
- Static, a short one-shot, retrigger, Neighbor, Pickup recording/playback and
  Thru each pass positive audio controls and stock/held-solo comparisons.
- With T8 configured as master, T1-only, T2-only and T8-only selections match
  stock solo. These are limited parity checks: MAIN/CUE are silent in both
  control and held captures. T1/T2 stems remain positive for their selections;
  T8 alone excludes all source tracks. These silent captures do not establish
  positive master output; the follow-up supplies that separately below.

The first automatic pattern/Part/bank case is fixture-inconclusive: it read
byte-sized UI bank/pattern fields as words. The first panel-context case fails
to arm; the harness also unconditionally tapped MIDI during cleanup, which can
leave the wrong context. A diagnostic repeat corrects those test operations and
records context before arming. The original failure is retained, and a failure
in a valid context remains a failure. The first direct recorder-buffer case is
fixture-inconclusive because its Neighbor consumes the upstream signal, leaving
the recorder track's MAIN stem silent. An isolated recorder fixture removes that
Neighbor to provide an independent positive control.

The corrected follow-up (`broad-followup-1`) started with no other emulator,
but another session's `psl-audio-fixture-r1` appeared at 2026-10-30 16:56:14 UTC.
Only the Track Solo emulator was stopped. No follow-up case completed, so it
supplies no pass or failure. Its 64 resource observations and unchanged-input
audit are retained.

After the developer authorized resuming, `broad-followup-2` passes all six
targeted cases without native changes. It passes both corrected
transition cases and its 240 frame-progress observations. MIDI program changes
reach bank/pattern 0/1, 0/2 and 1/0, with engine bank/Part 0/1, 0/2 and 1/0;
the T2 overlay remains active and release preserves the current word. MIDI,
PART, PATTERN, BANK, RECORD and STOP each cancel the overlay. The diagnostic
shows MIDI mode remains off after the MIDI action, so the original test's
unconditional cleanup tap was inappropriate. No native code was changed.
The direct recorder-buffer repeat also passes: ordinary/held MAIN RMS is
1,429.751/1,429.516, CUE is 998.492/998.327, and only the T5 stem sounds.
Underlying state is preserved and 85 frame-progress observations pass.
The three audible master groups also pass MAIN, CUE and stem comparisons,
underlying-state preservation and release, with 218 frame-progress observations:

| Anchor / joined track, T8 master enabled | Ordinary MAIN RMS | Held MAIN RMS |
| --- | ---: | ---: |
| T1 / T8 | 547.607 | 547.689 |
| T2 / T8 | 547.632 | 547.594 |
| T8 / T1 | 547.609 | 547.533 |

Both source and master must be in the group for output in these tests. A source
alone excludes the master; the master alone excludes all sources. Track Solo
matches the stock solo control instead of adding special master routing.
The completed follow-up has 285 resource observations, no detected emulator
overlap, unchanged frozen inputs, three passing profile reports and no fatal
errors. It does not supply a new SAVE result.

All four generated cards (including the isolated recorder fixture) reproduce
byte for byte from the canonical private fixture; every bank checksum validates.
Reports remain private under `~/.cache/modwerk-track-solo/broad-run-1/`,
`broad-followup-1/` and `broad-followup-2/`; `broad-results-summary.json` retains
the original reports and the latest case provenance. The harness and fixture generator are
`broad_emulator_test.py` and `prepare_broad_fixtures.py`. The harness supports
`--categories` and exact `--cases` filters for targeted repeats and reports a
nonzero exit for failed or inconclusive results. The frozen first-run harness
returned zero even for such reports; its JSON results above govern the outcome.
Periodic frame progress, audio comparisons and bounded emulator stress do not
establish glitch-free operation, hardware timing/CPU cost or save integrity.
The original-base save regression remains recorded; the separate prototype
above now passes standalone, paired and no-module saves plus four-mode playback;
physical-unit qualification remains pending.

## Persistence and fixture integrity

`panel_test.py --audio --persistence` exercises real panel gestures, both-core
PCM stems, the base's stopped-track requirement, removal with both anchor and
joined key held, and stock SAVE PROJECT. The save path cancels the overlay
while the anchor remains physically held. Every saved work/stored file is
compared to a saved baseline. A separate fresh original-stock emulator then
loads the saved card with DSP enabled. Direct backend calls are emulator
fixtures, not USB review/trial/Keep/Undo evidence.

The first combined DSP/save run hit its old 30 s wait while bank16.strd was
still partially written. That aborted card is not reload evidence. The rerun
allows up to 90 simulated seconds, failing if sector writes make no progress
for 10 simulated seconds; completed saves, sector counts and wait durations
are recorded. FAT and byte comparisons remain strict. An earlier-build control
uses the same fixture, base and workflow. These are emulator timings, not unit
save-throughput measurements.

The canonical fixture strips sixteen SDK-generated TRIM_BARSx100/LOOP_BARSx100
hints that stock SAVE omits. An earlier fixture shrink from 4,293 to 3,989 bytes
left a dangling FAT link even without Track Solo; repacking identical content
loaded. This is an emulator/scratch-fixture finding, not a proven device bug.
The harness checks both FAT mirrors and allocated links before extraction;
file-size-limited extraction alone can hide that defect.

## Exact artifacts and resources

The current ABI 8 package is SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`:
2,128 package bytes, 1,500 linked code/data bytes, zero BSS, 24 relocations and
seven guarded sites. It was built at source revision
`1d2b93234b7e834187c68c74522ebf10ef52cb82`; its six production input hashes
match review source `7acb980a07ebef61b98b791e85b098175438d8c3`, without claiming
a new build at that review revision. Host/source results remain bound to
`e7858af5a26e11123064e6a756e94522f95a8df1`.

A separate ABI 10 source probe calculates a 2,544-byte pool extent for one
module, including the runtime object, seven descriptors and 16-byte
alignment. That is a configuration-specific estimate, not an installed-base
pool measurement. Static ELF accounting for this exact package finds 44
writable bytes inside the image and a separate 28-byte menu row descriptor.
At the project-load detour, the package's eight-byte guard hash
`2701c9f06c655d1a5b7aab9961c0a3d23848764c2e559d362850d8d7831e7702` matches
canonical MAIN `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`
and the trampoline replay. The 1,468-byte frame belongs to the stock function,
not module-added stack: Track Solo's load detour has a 20-byte temporary peak
before replay. The tick-to-LED-setter path has a 56-byte module subtotal before
replay and a 68-byte continuation subtotal including the 12-byte stock frame;
neither is a whole stack maximum. Static event envelopes are instruction counts, not ColdFire
cycles; ordinary ColdFire static/measured cycle values and hardware stress
remain **NOT MEASURED**. Earlier mixed 92-byte stack accounting remains
partial, not a maximum. See [resource accounting](evidence/resource-accounting.md)
for symbol counts, path assumptions, input binding, image accounting and
limits.

### Historical artifact identities from earlier emulator runs

| Artifact | SHA-256 |
| --- | --- |
| Track Solo package | `b72b87efddfd363e032294497f3fab1b88ce8d3e123dc50e24f4885bdc0c3def` |
| Unchanged Mute Modes package | `c35b154d7a6ff4d9affc339387d68bde87554aec82a87b60059b6307f5b2b848` |
| Paired-test private base MAIN | `68daa06e37daf178839bddcd7d0a394b040989b2615bd70b6d4dec1847a9b372` |
| Original stock MAIN | `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e` |
| Emulator executable | `b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363` |
| track_solo.c | `7e65250373b48c04fc860431bebe6cd090fef0994174ccb8a4604b77791b281f` |
| core.s | `6de1a9017404a69fe5802e0f2c04d9eecb3f1e6fe2d076204b77679fef596f16` |
| gate.s | `be22167d318543910d19ef07dcb2e17c12d46a5c215d09775f2282560e3e3825` |

## Earlier baseline and remaining qualification

The committed `0.1.0-experimental` baseline passed 531 compiled checks, actual
OFF/HOLD menu rendering, panel/backend removal, DSP stems, unchanged saved
project files and fresh original-stock saved-card reload. Those historical
reports (`routine-final`, `menu-quiet`, `audio-final-canonical`, `save-canonical`)
apply to package `7d1abf6e4e201c6834af514974fbcd935ed86b90bf5b1e77c20f35b8d5fdbe47`.
The unchanged-package pairing matrix (`mute-dsp-matrix`) reproduced the soft-mode
conflicts that motivated this revision. Existing menu captures retain their
honest 0.1.0 provenance; the menu and gesture code are unchanged in 0.1.1.

Physical MKII and MKI functional qualification, hardware CPU/timing, Pickup
recording/source routing, active arranger rows, other route combinations, long
Static streaming, sustained MIDI/card-I/O stress, native card settings and
broader custom companions remain unqualified. The 5 November attempt did not
clear these gaps; its device state was UNKNOWN at the time, followed by the
owner's confirmation that Undo completed and no restoration was needed. No later
device readback or current identity is recorded. A completed functional USB
trial and independently verified Undo remain unqualified; self-test and
durable card operations are separate owner-directed steps. This checkout
locally stages catalogue/package records as described above; public deployment
is unverified and release qualification remains incomplete.

## Historical repository validation

The earlier recorded SDK suite passed with generated Python caches removed
and bytecode writes disabled. The recorded full repository checks failed one
unchanged Git-catalog test
(`scripts/author-update-git.test.mjs`, served Elekloader catalog), which exceeds
its existing five-second timeout even with emulator jobs paused and one test
worker. The other 338 frontend test files passed; the affected file passed all
17 tests on an isolated unchanged rerun. The report recorded no changes to
the Git test timeout or repository-wide gates. Historical logs:
`check-scope-idle.log`, `check-scope-git-retry.log`. These observations do not
establish current-head/base PR readiness; no checks were run for this status
wording review.
