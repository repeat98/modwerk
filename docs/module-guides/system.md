# System

Read [the module guides index](README.md) first.

**Applies to** modules with manifest `category: system`: behaviour that belongs to the project or system menus rather than to a track or an effect. No module uses this manifest category yet; the library shows [Scale Quantizer](../../sdk/octabam/modules/quantizer/README.md), [Repitch](../../sdk/octabam/modules/repitch/README.md) and [Preview Vol](../../sdk/octabam/modules/previewvol/README.md) under System, so read their READMEs as the nearest examples and also [machines.md](machines.md) (project machines) and [playback.md](playback.md).

## Behave like the instrument

- [ ] **Put the setting in the stock menu where it belongs.** Scale Quantizer's SCALE, ROOT and GLIDE rows sit under PROJ → CONTROL → SEQUENCER. Do not add a top-level screen.
- [ ] **A way to turn it off that restores stock behaviour exactly.** Test OFF against an unmodified build.
- [ ] **Defaults are stock behaviour,** so adding the module changes nothing until the musician changes a setting. Say so.
- [ ] **Persistence is honest.** Settings storage today is "nowhere, or a private file", and the proposed shared project store is not implemented ([MODULES.md, Settings on the card](../../sdk/octabam/docs/remixer/MODULES.md#settings-on-the-card)). Do not invent a format. State whether your setting survives Part Save, project save and load and power cycles, and test it.
- [ ] **A project saved with the setting loads on a build without the module.** State what the musician sees. **Verify.**
- [ ] **Say who is affected:** which track types, which models (MKI and MKII key sequences differ), which existing projects.
- [ ] **No effect slot and no new knob** unless the feature genuinely needs one. The README says so.
- [ ] **Timing-related settings** follow [sequencing.md](sequencing.md).

For a one-shot sample editor, preserving marker starts is only part of preserving
the sample: retain complete slice end/loop records and establish whether adding
a sorted marker renumbers slice locks. Resolve stock minimum-length and
working/saved-copy behavior before enabling Apply. Bind preview to sample,
content, markers, trim and chosen tempo; a stale or cancelled preview must not
write. Quiet marker boundaries are not evidence of click-free playback.

Match the stock edit workflow before adding recovery controls. Internal failure
rollback does not imply a user-facing Undo action. Beat Slicer's 1.40C emulator
observations distinguish cancelling deletion from confirming it, and show that
NO at the grid alignment question accepts an unaligned grid. Keep stock slice
clearing available; clearing removes slices rather than restoring the old grid.
Verify the exact prompts and saved-settings behavior separately on hardware.

Distinguish sample-settings save/revert from project save/load. Beat Slicer's
stock 1.40C emulator fixture keeps different Flex/Static layouts for the same
file. Check complete on-card tables separately from active metadata after
reload: the observed load normalizes a deleted inactive row even though both
project marker files stored it exactly. Wait for stock's final save completion
before flushing; a flush only persists writes already performed. Fresh emulator
processes do not establish physical reboot or module persistence. See the
[stock persistence probe](../../sdk/drafts/beat-slicer/BOOT_OBSERVATION.md#stock-sample-settings-versus-project-storage).

Test error paths before treating a stock loader as a transaction: a checksum
or short-read error can be returned after destination records have changed.
Likewise, a stock sanitizer may move old markers to satisfy its minimum-length
rules. Establish the exact behavior with synthetic fixtures; reject a proposed
edit that would alter preserved records rather than silently sanitizing them.
See the Beat Slicer draft's [storage probes](../../sdk/drafts/beat-slicer/TESTING.md#isolated-stock-storage-probes);
these are emulator observations, not physical save/reload qualification.

A stock sample-pool lookup is not necessarily a decoded reader or a safe
service for both Flex and Static. Verify readiness, sample kind, page bounds
and pointer lifetime before using it. Measure decoder reads as well as writes:
a packed 24-bit converter can read a fourth byte while returning the correct
three-byte value. Stage readable padding or use a bounded decoder. The Beat
Slicer draft's pool/converter probes demonstrate this in synthetic CPU state;
they do not qualify live streaming or concurrent sample changes.

A stock slot counter is not necessarily a content revision. Beat Slicer's
isolated 1.40C probes execute rotation and polarity edits that change audio
without changing the control record; the dirty flag stays set across repeated
edits. Bind preview invalidation to every relevant writer before mutation,
not only reload/release counters, length or a dirty flag. Allocation maps can
also change while another slot's metadata stays identical; reacquire them
under the verified ownership guard for each bounded read.

An unchanged stock busy field does not prove that an edit has finished.
Beat Slicer's isolated 1.40C instruction probes observe unmasked intervals
between masked PCM writes across eight edit families, without busy-field
updates. Track the complete writer lifetime before allowing new snapshots;
an early dirty-store notification alone only retires older ones. Cross-slot
copies invalidate the destination, and a failed operation can still mark it
dirty. These are synthetic execution results, not live scheduler evidence.

An empty worker queue also does not prove an edit has finished: the dequeued
command can still be writing PCM. Beat Slicer's synthetic 1.40C worker probes
find deferred UI completions that can be omitted when their record pool is
full. Retire exclusion at verified execution boundaries independently of UI
notification, and capture owned operation identity; a queued pointer can refer
to a reused command record. Full panel/scheduler/cancellation behavior remains
unproved by those fixtures.

Track nested writers independently: the 1.40C crop path calls rotation, and
its inner return must not reopen a preview before the crop finishes. A refused
crop can also advance the slot counter before range validation. Beat Slicer's
synthetic worker fixtures exercise both cases. Admission bookkeeping still
needs a separate verified lock around snapshot/map lookup and bounded copying;
a valid token alone does not pin memory or establish complete writer coverage.

Cover recorder and allocator writes outside the edit worker too. Beat Slicer's
synthetic 1.40C ordinary-recorder calls change shared page maps and PCM without
dirty/counter stores. Position/map publication precedes PCM; allocation shortage
can publish a prepared position, write none of that call's PCM and queue follow-up
work. A position or routine return therefore does not establish source readiness.
Refusing recorder slots alone does not serialize shared-pool access for Flex.
These fixtures do not establish the real ISR mask, timing or recording behavior.

Treat failed sample replacement as a possible content change. Beat Slicer's
synthetic 1.40C Flex-load fixtures release and clear the old PCM before directory,
file-open, header or allocation errors return; a surviving slot's map can move
while its audio and control record stay unchanged. Retire the old preview before
replacement starts and keep exclusion across nested release until the outer load
returns. These fixtures mock filesystem/header IO and do not qualify actual file
loading or persistence.

An exact marker Undo snapshot needs inactive rows too: adding slices overwrites
previously inactive record slots. Preserve the full table and count, and compare
the complete expected after-state before restoring it. Beat Slicer's candidate
tests cover this in memory; such equality still needs source identity, ownership
and verified native publication/persistence around it.

A stock editor action may mutate settings before its asynchronous search or
completion callback returns. Beat Slicer's synthetic 1.40C grid fixtures clear
the marker count before deferred zero searches and publish records later,
followed by pointer/selection refresh. Its redraw notification is not an Undo
service. Track the entire mutation/refresh lifetime; do not reuse this replacing
grid action as a preserving atomic Apply. Actual scheduling/cancellation and
physical persistence remain unproved by those fixtures.

For emulator memory watches, use the pinned machine implementation's canonical
address and verify a known store as a positive control. In Octabam `8250be0`,
1.40C editor busy/dirty writes at `0x46…` were observed by `0x46…` watches;
substituting `0x86…` observed none. A silent watch is not evidence of no mutation,
and a generic CLI alias note must not override the actual mapped window.

Retire an editor's selected row before rebuilding bindings for a shorter marker
table. Beat Slicer's isolated 1.40C refresh probes observe the old selection
being dereferenced after its row pointer has become null; resetting the selection
first avoids that path in the tested Flex/Static reductions, including zero
slices. Recompute selection from the cursor after rebuilding. This is a native
integration requirement, not an observed stock UI defect or hardware result.

Closing a native menu need not detach its label/callback/selection pointers.
Beat Slicer's compiled 1.40C menu fixture observes those pointers still retained
after selection. Keep composed arrays base-owned and refuse reuse until old
callbacks are quiescent; validate the owner under the loader's stable lock.
Verify tail-call argument storage too: the observed stock selection routine
rewrites its first incoming argument word, so a zero-argument C test call can
corrupt its caller even when all menu assertions pass. These are isolated
execution findings, not a proved live detach or loader integration service.

Verify editor gestures against the rendered stock page, not a remembered key
order. In Beat Slicer's pinned 1.40C full-emulator session, AED → AMP selected
SLICE and plain YES opened its action menu; LFO selected EDIT. Loading a Flex
slot also did not assign it to the track until the slot was confirmed. Bind a
preview to the editor's actual kind/slot, not merely to a successfully loaded
source. These panel observations still need physical qualification.

Keep loader ownership and sample ownership separate. The current
[`modwerk_machine_lock`](../../sdk/runtime/loader/loader.h) preserves loader
stability while deliberately allowing real-time interrupts. It is not, by
itself, proof of exclusion against recorder or PCM writers; establish that
additional boundary before connecting a live sample reader.

Establish menu-pointer lifetime before adding a row: stock menus can retain
label, callback and selection storage after their opener returns. Keep that
storage base-owned and make removal retire every reference before reclaiming
module memory; a callback that is not currently running can still be retained.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the menu path, with exact button sequences.
- [ ] If the library should group it under System while its manifest says otherwise, that is a one-line override in `src/catalog/modules.ts`, not a reason to change the manifest category.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

Compile portable C with the pinned freestanding ColdFire toolchain early and
inspect unresolved symbols (`m68k-elf-nm -u`) before claiming native readiness.
Host compilation can hide compiler-generated multiply/divide and memory helpers;
an object file alone does not prove that a module links. Use the shared
`sdk/runtime/m68k_codegen.py` flags and object guard too.

## Digitakt and Digitone

Settings rows come from the core's `ev_settings` event: add rows with `core_additem(menu, row)` and claim each row (`settings:FAST AUDIO`, for example) in `platform.claims`. Rows are claimed resources, so two mods cannot add the same one ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
