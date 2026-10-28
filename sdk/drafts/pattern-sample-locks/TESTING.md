# Testing: Pattern Sample Locks 0.1.5-experimental

28 October 2026 · twwwy · local prototype only. No push, PR, release, firmware
flash or physical-device module install. Every mutation below used disposable
MKII emulator RAM/card copies. DSP execution was disabled; no audio or physical
power-retention result is claimed.

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
  and interrupt/task-lock duration remain **not tested**. Hardware use is not
  ready yet. Emulator results do not satisfy release qualification.
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
