# Proposed sample-editor base service

This is an owner-review proposal, not released capability. It is split from
[Beat Slicer staging #840](https://github.com/repeat98/modwerk/pull/840).
Do not merge or publish it until the reuse and event-allocation decisions below
are resolved. The physical report below applies only to its named private build, not the default beta base.

## Why it is proposed

An independently loaded module needs a safe way to propose slice starts without
retaining instrument pointers or replacing a stock menu another module uses.
The proposed base copies metadata, owns native confirmation and atomic marker
publication, and admits typed action records against the complete current
loader owner. Modules retain their own algorithms and controls.

**Beat Slicer is the only confirmed consumer.** Its recording-buffer extension
would still be the same module and does not establish a second consumer. A
synthetic test client proves interface behavior, not demand from another module.
No released catalogue subscriber is declared. Maintainer review must decide
whether another real module needs this AED SLICE list; otherwise its stock sites
should remain the module's own declared patch under the module guide's rule.
Do not invent future consumers to justify base ownership.

## Event allocation is unresolved

This snapshot appends `ot_sample_editor_actions` at provisional index 36,
following main's MIDI events at 32–34 (#857) and `ev_trig_muted` at 35 (#912). No module package may be
released against the provisional allocation.
The target descriptor test reads the registry index instead of assuming 32.
This branch is based on main, not stacked on #857 or another module.

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
  waveform-worker boundaries, enabled only by the private `--sample-editor` flag.
  Ordinary beta bases leave the stock editor sites and contribution disabled.
- Loader changes carry typed table declarations, source-built C descriptor
  alignment and the machine's reviewed MCF54455 target/code-generation guard.

The five proposed stock spans are declared in `hooks.json`: SLICE opener
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

The private helper later recorded USB loss at 10:41 Taipei time on 27 October
and stopped; its final Undo was not verified. Whether this was a deliberate
unplug/restart after testing or an unexpected disconnect awaits clarification.
No Keep, flash, sample/project save, persistence or final Undo result is claimed. Exact physical short-commit
timing, complete scheduler/Pickup coverage and extended cancellation remain
open. These results belong to the event-35 build above; the later merge of
#912 allocates event 35 to `ev_trig_muted`, moving this proposal to 36. They are
not relabeled as tests of a regenerated event-36 base or default beta build.
The board, service, menu, hooks and action implementation files still match
the tested snapshot byte for byte; this source comparison does not qualify
the different complete binary or its physical interrupt timing.
