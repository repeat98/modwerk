# Testing: Pattern Sample Locks 0.1.5-experimental

28 October 2026 · twwwy · prototype in the contributor's fork only. Source
branches may be backed up there; no upstream PR, release, firmware flash or
physical-device module install. Every mutation below used disposable
MKII emulator RAM/card copies. The original history receipts used DSP execution
disabled. The newer device-preparation checks below ran DSP enabled; neither
set establishes audible output or physical power retention.

## Exact tested build

- Native source checkpoint: `105efaf13cdd7ffc40bc18155ccbdd875f2307be`.
- Private package: `~/.cache/modwerk-pattern-sample-locks/pattern-sample-locks-v015d.mwrm`.
- Package SHA-256: `f9f179e0f5536d3c0727f61df5e79106ff211721c75742646c747e9598b35fc9`.
- Base identity: `2e1a612832625e268492a06623c3cac5ebfb0ea324889d9e8f30509bbbffc248`.
- Private base MAIN SHA-256: `da5a9d93eaed2270af824e6c4b524f122865d01a2d1d168303e962651cb3e029`.
- Emulator SHA-256: `b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363`.

Pinned GCC 16.2.0, `-mcpu=54455 -Os`, freestanding with the shared late-combine
safety flag. Code/data: 13,980 bytes; BSS: 12,692 bytes; 217 relocations, four
core UI hooks plus the lifecycle contribution, eleven guarded sites. Private
battery storage: 12,288 bytes at `0x100f9000..0x100fc000` (end exclusive).
These are allocation sizes, not measured CPU/stack use.

This requires the separate **local** `prototype/module-lifecycle-base` proposal
(checkpoint `ae20ac58`). It is not a published base capability. The physical
unit's firmware has not been changed to this base or module.

## Device-test preparation build

The module package above rebuilt byte for byte with the merged SDK. The new
private development base is described in [DEVICE_TEST.md](DEVICE_TEST.md):
identity `0c5d5e91d6f1a93974eda2cc3e7535f93aefdc2e5c275a74e21d7ace3177de2e`,
MAIN SHA-256 `5d8261d050b0f0a756b7b7890081ba2ad74456fa33db61b996dbd0f58cf3ae9e`.
Its source checkpoint is `79cf179c`; its lifecycle ABI header is now fingerprinted.
Every frozen base input matched the local source or pinned upstream input.
The pinned base compile, MCF54455 guard and container round-trip passed.
The module's generated assembly/object reproduced unchanged, with no undefined
helpers. Portable sanitizer checks and the loader/lifecycle host checks passed.

These new receipts used **DSP execution enabled**:

- `media/capture-device-ui-dsp.json`: full initialized module image and eleven
  sites attested; all menus captured, trial Undo and continued execution passed.
  All popup screenshots match the earlier pixels. The closed stock screen can
  differ with live DSP state.
- `media/capture-device-seed-dsp.json`: STOP-before-edit, native Lock, manual
  retention, same-value manual edit, unrelated-byte/mirror preservation and
  Preview Vol coexistence/removal passed. DSP frame counter advanced from
  43,048 to 96,346; errors and stalls remained zero.
- `media/capture-device-reboot-dsp.json`: fresh process using saved card and
  battery only, automatic restore and complete package/site attestation.
  Default Clear removed the created lock and retained the manual one; explicit
  inclusion then cleared the manual lock. Playback stayed stopped. Both owners
  were removed in order; DSP frames advanced without new errors or stalls.

The local developer MCP's actual stdio initialization, tool discovery and site
catalogue call passed without touching USB. Its catalogue excludes this draft;
use the documented bounded USB session trial, never its immediate-Keep shortcut.
The Mac's existing bridge Python/libusb dependencies are available.
No physical unit has been accessed or changed during preparation.

## Actual software checks

- Node 24.22.1 and `npm ci` in the isolated worktrees.
- `python3 -B verify.py`: planner, ownership and UI tests pass with
  `-Wall -Wextra -Werror` and ASan/UBSan. Coverage includes all 64 stored steps,
  selected-track isolation, non-SAMPLE preservation, safe manual policies,
  stale source/origin and mirror refusals, recorder/STOP handling, cancellation,
  UI navigation/spacing, bounded storage, torn writes, corrupt records,
  foreign-storage protection, witnessed boot continuity and boot gaps.
- The CRC nibble implementation matches an independent bitwise oracle across
  256 persisted-header fixtures. It preserves the record CRC format.
- `test_native_scope.py` compiles the production bank-read wrapper with a fake
  writer. Read-only header probes do not retire ownership. Actual destinations
  retire only their bank; all sixteen banks and their aliases are checked.
- Final pinned compile/link passed, no undefined helpers. The object passed
  `sdk/runtime/m68k_codegen.py` for MCF54455 instructions and register-step
  safety. The eight writer guards match private stock hashes; no direct
  branch enters their overwritten interiors.
- Declaration compatibility passes beside every active catalog module and the
  base. The track-paste hook is after the prologue bytes Euclid copies. No other
  module's source or stock-copy recipe was changed.
- The separate base passed its full-featured pinned build and ColdFire object
  guard. Host loader suite: 17 tests run, 3 optional skips. Saved-set, callback
  owner/bounds and diagnostic boot-witness tests passed separately.

## Actual native emulator checks

| Receipt | Observed result |
| --- | --- |
| `media/capture.json` | All agreed menu screens captured through actual panel input. The full initialized image and all eleven live patches matched the relocated package byte for byte. Trial Undo and continued execution passed. |
| `media/capture-origin-seed.json` | PLAY stopped before editing; a created lock was written, a manual lock retained, unrelated audio bytes preserved, and the battery mirror matched. A same-value manual writer call lost ownership. Preview Vol installed without retiring this owner's record. Both packages were removed afterward. |
| `media/capture-reboot.json` | A fresh process kept only the saved card and battery snapshot. Both modules restored automatically; no USB re-upload. The full live module image and eleven sites matched this exact package. Default Clear removed the created lock and retained the manual lock; explicit inclusion then cleared the manual one. Playback stayed stopped. Preview Vol survived target removal, then was removed too. |
| `media/capture-native.json` | 512 native locks written and cleared through the real menu. Native SAVE PROJECT completed; the copied card flushed with no errors. Native bank reload recovered the saved audio and Part bytes after a deliberate fixture change. Reload retired origin, so default Clear retained the reloaded unknown locks. All eleven sites restored on removal; stock without the module reloaded the saved locks. |
| `media/capture-history.json` | Same-value trig, track and pattern paste retained unknown locks. Track COPY alone preserved ownership. Native Undo completed and retired same-value ownership. Track clear retired origins. A native same-value SAMPLE store was reached while the module was absent; reinstall/default Clear retained those locks. Unselected tracks were unchanged. |

These receipts name the package, base, emulator and source fingerprints. The
reboot input snapshot SHA-256 is
`1803410724221a3443fedf6a6a934aac69d701ab3a4336c01964e63180777fee`;
the saved-card digest is in the seed receipt. Snapshots/cards themselves stay
private. The Preview Vol package SHA-256 is
`9fd95d9a9a5a1c5932892ab1af36b39994650a51161df3903f36fa8afa6cb1c2`.
This proves emulator coexistence/loading, not its audible behavior.

Fixture boundaries are explicit: maximum-step masks and empty SAMPLE bytes
were injected in matching working/battery copies; manual tests called the
native SAMPLE writer with a labelled held-step mask. Paste tests called actual
native routines/clipboard storage. The Undo test republished two owned bits
through this module's real ownership primitive without opening a stock menu,
which would retire Undo context. Actual panel Undo then restored identical
bytes; its successful native return path was watched. The absent-owner test
watched the native SAMPLE store itself. Those are integration fixtures, not
claims that every step was ordinary panel use.

Native SAVE PROJECT and bank reload ran on stock's engine task through its
native messages. Keep was used only on disposable emulator/card copies, to
allow storage operations beyond the trial timeout. Accepted empty packages
removed the kept modules, including with the track-selection overlay open.
The base effect map and diagnostic log tag were preserved in the checked runs.

## Performance evidence and limits

The maximum Lock operation used 36 full-mask write batches. Watch points at
the exact object's mask/restore instructions measured a maximum **203 emulator
instructions** per batch (32 sample batches at 203, four index batches at 187;
7,244 in total). The object fingerprint and watch offsets are in the native
receipt. This measures those write guards, not every masked span, hardware
cycles, total CPU load, stack depth or audible continuity.

Validation, CRC work and metadata updates use the native task lock at level
four, leaving frame/DMA interrupts enabled. Each full interrupt guard writes
at most sixteen changed entries. Only affected SAMPLE/index bytes and tracks
are published. Closed-menu work is constant; there is no DSP/audio-frame hook.
Physical deadlines still require measurement.

### DSP-enabled candidate performance estimates

The new candidate used exact-object PC watches around the native commit and
planner, on stopped disposable patterns with 2 or 512 changed locks. The
`ot_emu` default clock is 3,990 ColdFire instructions per sample: 175,959
instructions per model millisecond. This is a conversion in the emulator's
instruction-rate model, not a hardware cycle or cache/DDR timing model.

| Changed locks | Lock commit | Clear commit |
| --- | --- | --- |
| 2 | 234,302 instructions; 1.33 model ms | 90,951 instructions; 0.52 model ms |
| 512 (8 × 64) | 259,963 instructions; 1.48 model ms | 435,141 instructions; 2.47 model ms |

The first small Lock includes initial ownership-store setup. Confirmation
planning for 512 locks was another 46,530 instructions (0.26 model ms) for
Lock and 21,449 (0.12 model ms) for Clear. The commit watches include source
revalidation, metadata work, writes, native publication and intervening IRQ
execution. They exclude waiting for STOP, human input and drawing the menus.
These are single integration measurements, not a statistical hardware bound.

Both maximum operations used 36 full-mask write batches; the longest was 203
instructions, approximately 1.15 model µs. The module's raw guard timer maximum
was 151 counts. The modeled interval is not a measured physical deadline.
DSP frame count advanced from 43,035 to 117,783; errors and stalls stayed zero.
No DSP program or audio-frame callback is contributed by this module.

Ten half-second meter readings each were collected with the menu closed,
track selection open and the module removed. All three states reported CPU
100%, DSP core 0 0% and core 1 100%, despite fresh DSP window reads. These
saturated emulator readings cannot estimate absolute or incremental CPU/DSP
utilization. They are retained as a limitation, not reported as module load.
Host process CPU use is also not instrument load. Physical load, audible
continuity and a populated project's DSP cost remain unmeasured.

Receipts: `media/capture-device-performance-dsp.json` and
`media/performance-device-dsp.json`. Reproduce with `--performance
--profile-symbols <exact linked function/guard offsets>` and DSP enabled.
The object SHA-256 is recorded alongside those offsets; no module code was
patched for measurement. All small/maximum Lock/Clear results and battery
mirrors were checked; normal USB removal and continued execution passed.

## Reproduction

Run `python3 -B verify.py`. Compile `translation.c` with the pinned toolchain,
regenerate `unit.s`, inspect undefined symbols and run the MCF54455 guard.
Stage only this draft in the local lifecycle SDK's Octabam module folder, then
build with `sdk/runtime/loader/build.py --octabam pattern-sample-locks --name
'SAMPLE LOCKS' --upstream <verified elekloader> -o <private package>`.
Keep the package and stock outside Git; remove temporary staging afterward.

`capture_emulator.py` requires the emulator Unix socket and a private output
folder, and copies the card. Ordinary mode captures UI/trial Undo. `--stress-save`
checks maximum edits, native save/reload and removal. `--keep --exercise` seeds
saved modules; `--companion <previewvol package>` adds the other owner after Lock.
A fresh `--boot-auto --exercise --cs1-in <snapshot>` must use the seed's saved
card, without re-uploading. `--history --profile-symbols <exact object offsets>`
checks native history. The helper refuses a receipt if its frozen inputs change
mid-run. Internal Docker files were used after a shared-folder stall.

## Remaining qualification

- Physical MKII/MKI operation, physical power cycles, audio, worst-case CPU/stack
  and interrupt/task-lock duration remain **not tested**. This candidate is
  prepared only for the supervised first RAM trial in DEVICE_TEST.md.
  Emulator results do not satisfy release qualification.
- Complete native project/load/clear/Undo paths and all companion combinations
  remain unqualified. Native bank reload was tested, not every full-project
  load/reload path. Reboot evidence covers the fixture's current bank/pattern.
- The sparse ledger reserves at most 704 track/pattern records; full capacity
  refuses before sample edits and never evicts known ownership. It belongs to
  one project identity in local battery RAM, not portable project metadata.
- A native manual edit may conservatively retire an entire track's ownership.
  Reloaded or otherwise unknown locks are retained by default. Clear is not Undo.
- Boot continuity witnesses Modwerk sessions only. Edits under external firmware
  cannot be proved by this counter. Future contributed-machine signatures need
  review; current PL/AB/FM/S2 signatures are excluded. Upstream PLOCKS P2, outside
  this catalog, overlaps the battery region and is unsupported.
- Stock-only card integration, published packages, native/browser parity, owner
  review and a live download do not exist. Draft doctor passes category, UI claim
  and cross-compatibility; catalog/package/parity/qualification lines remain red.
  No checks were weakened or catalog entries added to bypass those gates.

## Candidate history

Earlier candidates were not carried forward: 0.1.3 overlapped base battery
storage; an early 0.1.5 bank hook retired origins during read-only startup probes;
another tracked the copy routine instead of paste; the first true paste-entry
hook conflicted with Euclid's stock-byte copy. None touched hardware. The final
package fixes these cases and was freshly tested. Interrupted Docker runs and
failed test fixtures are not passing evidence. Historical 0.1.4 and intermediate
receipts are retained separately; see [PROTOTYPE_HISTORY.md](PROTOTYPE_HISTORY.md).

## Fork backup checkpoint

For the authorized fork-only push, upstream main `d2cb12d6` was merged after
these exact-build tests. The module's native source and assembly are unchanged.
The results above remain bound to the listed package/base hashes; the merged
shared base SDK has not been rebuilt or physically qualified. Both prototype
branches are kept separate and no upstream PR is opened.
