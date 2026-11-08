# Sample-editor base service

The beta base carries this service (`npm run octatrack:base -- --beta` passes
`--sample-editor`) since the owner accepted it on 27 October 2026. It came from
[Beat Slicer #840](https://github.com/repeat98/modwerk/pull/840) and
[#914](https://github.com/repeat98/modwerk/pull/914). The physical report below
applies only to its named private build, not to the beta base.

## Why the base owns it

An independently loaded module needs a safe way to propose slice starts without
retaining instrument pointers or replacing a stock menu another module uses.
The base copies metadata, owns native confirmation and atomic marker
publication, and admits typed action records against the complete current
loader owner. Modules retain their own algorithms and controls.

**Beat Slicer is the first consumer.** The owner accepted base ownership so
that later AED SLICE actions share one menu and one confirmed marker writer
instead of patching the same stock sites. A synthetic test client proves
interface behavior, not demand from another module.

## Event allocation

`ot_sample_editor_actions` is index 36, after the MIDI events at 32–34 (#857)
and `ev_trig_muted` at 35 (#912). Packages built against the earlier
provisional indices 32 and 35 do not load on the beta base.
The target descriptor test reads the registry index instead of assuming 32.

## Boundary and scope

- `include/modwerk_sample_editor.h`: copied views, starts-only proposals and an
  explicitly aligned 64-byte action descriptor. No sample/PCM pointer crosses it.
- `module-adapters/sample_editor_service.*`: one-use source/owner token,
  revalidation, create/replacement confirmation and complete failure rollback.
- `sample_editor_actions.*`: copied labels and image-relative callbacks admitted
  against the exact current owner. Retirement withdraws menu reachability.
- `sample_editor_board.*`: the private 0.1.64 experiment extends file-backed
  Flex/Static slots 0–127 to inactive recorder buffers 128–135, and permits
  pattern playback. Recording blocks only its own edited buffer, not unrelated
  files or buffers. Empty recorder sources stay empty. Table copies, comparisons
  and row writes preserve frame/DMA interrupts. The 0.1.65 candidate briefly
  excludes level 5 only for a recorder's final state/controls/trim check and
  count store, with DMA still enabled; physical timing remains unqualified.
  PCM analysis, playback processing and implicit saves remain out of scope.
- `sample_editor_menu.c` and `sample_editor_hooks.s`: native menu/selection and
  waveform-worker boundaries, built with `--sample-editor`. The beta base sets
  it; a base built without it leaves the stock editor sites alone and refuses
  contributions.
- Loader changes carry typed table declarations, source-built C descriptor
  alignment and the machine's reviewed MCF54455 target/code-generation guard.

The five proposed stock spans are declared in `events.json`: SLICE opener
`0x40072c30`, opener dispatch `0x40072caa`, popup selection `0x4006d8f4`, selection
tail `0x4006d91c` and waveform command dispatch `0x400858c0`. Selection entries
are broader than one row; unchanged stock dispatch and pointer lifetime need
review across normal menus, not only this client.

The ordinary-recorder emulator fixtures distinguish the selected state bank
from an inactive bank retaining state 2 after Stop. An OR of both banks would
incorrectly keep editing blocked. Completed lengths come from published source
metadata, never reserved capacity. The slot counter did not advance across the
observed re-recordings; it cannot establish the whole content lifetime by itself.
Stock can clamp several recorder rows onto the same final start after a shorter
recording. Preserve those existing rows for cancellation and replacement; new
grid proposals still require strictly increasing starts.

The candidate orders the count commit against recorder preparation: a start
before that decision cancels the edit, restores/verifies the old marker table
and consumes the intent. It never restores recorder PCM, extent or trim, and
never queues a retry after Stop. A start after the count store observes a
completed grid. Row work and rollback remain outside the short level-5 section;
queued engine cleanup remains excluded by the outer metadata lock. Timer
diagnostics record the protected body separately. Authored forced-timing tests
and complete stock-call metadata audits support this candidate, not a claim of
physical deadline qualification or all Pickup/allocator paths.

## Review and verification

The SDK test is independent of Beat Slicer: authored backend/lifetime/rollback
fixtures plus a tiny generic source-built C action verify descriptor alignment.
Beat Slicer's actual controller/grid and package tests belong in its draft.
Run `python3 -B -m unittest discover -s sdk/tests -p test_sample_editor.py -v`;
the target case needs the reviewed `m68k-elf-gcc` toolchain.

Committed beta packages are stock-free metadata, not firmware images. Full
native/browser parity, unchanged stock paths with no subscriber, all base-bound
packages, companion resource checks and exact-build hardware qualification must
remain bound to their actual source. Combined #840 prototype receipts are
historical evidence for that combined snapshot; they are not relabeled as this
split branch. No physical test, Keep, flash or project/sample save is authorized
by opening this proposal.

Creation actions are grouped immediately before stock CREATE SLICE GRID in both pinned stock variants. Stock row order and callbacks are preserved, and remembered selections remain stock indices. This placement is shared policy, not a module-name special case.

## Physical playback replacement report — 27 October 2026

A contributor's MKII ran a fresh private build from base proposal #914 commit
`5fc2c4717e3f21a7dc36e0cac05a15a3f78debc6` plus Beat Slicer #840 commit
`4a01dae04e1789e8c4d2da03704e4f871d8cb663` (0.1.66, provisional event 35):

- RAM base: `8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`.
- Module SHA-256: `5e5e1e41257b0f290110e47ee6881a485661fc1daafa0986a7dd7ae6e6ca1e03`
  (5,776 bytes). Module C sources are unchanged from the earlier .66 package;
  its longer hook list follows the move from event 32 to 35.
- Source-built native/browser BIN parity:
  `d995496790bac6429c10fcf64cdfac01f7a4ba6decc019de6a38915272367acc`
  (775,296 bytes). Private firmware and raw diagnostics are not committed.

After the contributor confirmed a power cycle, stopped transport/recording and
a disposable test project/sample copies, read-only checks verified the original
flashed base and sixteen saved module IDs. The private RAM base was then booted
and reviewed from its empty baseline. Actual singleton upload and device
self-test passed: one live/intact Beat Slicer module, zero failures and no DSP
modules. Recorder Loop Fix and all companion modules were absent.

The contributor then tested slice creation/replacement during the instructed
same-source slice-trig playback workflow and reported the following. This is
contributor-reported panel/audio evidence, not an independent audio capture or
physical interrupt-timing measurement.

| Source | Pattern BPM | Sample BPM | Sample length | Beats per slice | Contributor report |
| --- | --- | --- | --- | --- | --- |
| Flex recorder buffer, recording completed | 120 | 120 | 9.14 bars | 4 | Slicing, re-slicing and playback were flawless. |
| Flex file slot | 108 and 120 | 108 and 120 | 6 and 15.9 bars | 1 and 4 | Flawless; both settings tested. |
| Static file slot | 108 and 120 | 108 and 120 | 6 and 15.9 bars | 1 and 4 | Flawless; both settings tested. |

The contributor clarified that the bar counts are sample lengths and reported
**more than 20 minutes of testing overall**. Separate elapsed times for each
source and a full pairing of the file-slot values were not supplied; no
per-source duration or additional cross-product coverage is inferred.

The private helper recorded USB loss at 10:41 Taipei time on 27 October.
The author confirmed they deliberately powered the machine off, then unplugged
USB after testing. On the next power-on, they reported Beat Grid was gone and
the other modules returned. A fresh read-only check before the later Undo test
verified original flashed base `77226ffcdc7ebc704040c92530dfd40401896ba7567450494a1a917686f7088d`
and all sixteen saved module IDs/names. The interrupted playback run's final
USB Undo remains unverified; the separate successful run below does not relabel it.
No Keep, flash, sample/project save, persistence or final Undo result is claimed. Exact physical short-commit
timing, complete scheduler/Pickup coverage and extended cancellation remain
open. These results belong to the event-35 build above; the later merge of
#912 allocates event 35 to `ev_trig_muted`, moving this proposal to 36. They are
not relabeled as tests of a regenerated event-36 base or default beta build.
The board, service, menu, hooks and action implementation files still match
the tested snapshot byte for byte; this source comparison does not qualify
the different complete binary or its physical interrupt timing.


### Separate same-build USB Undo verified — 27 October 2026

The author explicitly requested completing the USB Undo test and confirmed
stopped playback/recording, connected USB and a safe/disposable project.
At 20:36 Taipei time, a fresh read-only connection verified the original
flashed `77226ffc…` base, normal/known state and all sixteen saved modules.

The exact playback-test private base `8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`
was RAM-booted again. A new single-use review bound its empty active baseline
to the identical Beat Slicer 0.1.66 package
`5e5e1e41257b0f290110e47ee6881a485661fc1daafa0986a7dd7ae6e6ca1e03`
(5,776 bytes; provisional event 35). No interrupted session was resumed.
Actual singleton trial and physical self-test passed: one live/intact module,
zero failures and no DSP modules. The authorized USB Undo then succeeded.

At 20:37:54 Taipei time, a separate fresh read-only connection independently
confirmed the same private base, normal phase, known active digest exactly
`8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`
and the original empty inventory. This is an observed same-build hardware
USB trial/self-test/Undo result. No Keep, flash, sample/project save or new
audio test occurred. Receipts remain private under
`usb-undo-20261027/hardware1/`; no firmware or raw diagnostics are committed.

The verified Undo restores the empty private RAM baseline. Returning to the
flashed base and saved sixteen-module set after this new run needs a user
power cycle; no post-test power-cycle result is claimed here. The earlier
power-off/interrupted-run outcomes and later event-36 build qualification
remain separate.
