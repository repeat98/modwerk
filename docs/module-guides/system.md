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

### Slice edits and persistence

For a one-shot sample editor, preserving marker starts is only part of preserving
the sample: retain complete slice end/loop records and establish whether adding
a sorted marker renumbers slice locks. Resolve stock minimum-length and
working/saved-copy behavior before enabling Apply. Bind preview to sample,
content, markers, trim and chosen tempo; a stale or cancelled preview must not
write. Quiet marker boundaries are not evidence of click-free playback.

A mathematical grid point close to trim end can create a segment shorter than the writer permits even when there are no old slices. Match preview admission to the writer's minimum, omit only invalid new tail points and retain the actual trim end. Preserve existing records in a preservation workflow; replacing them requires an explicit replacement warning and confirmation. Report a short trim separately from an old-record conflict. A transient busy result can retain an explicit confirmation intent, but revalidate before showing the native question and cancel the intent on Back, parameter changes or stale source.

Match the stock edit workflow before adding recovery controls. Internal failure
rollback does not imply a user-facing Undo action. Beat Slicer's 1.40C emulator
observations distinguish cancelling deletion from confirming it, and show that
NO at the grid alignment question accepts an unaligned grid. Keep stock slice
clearing available; clearing removes slices rather than restoring the old grid.
Verify the exact prompts and saved-settings behavior separately on hardware.

A shared editor's trial-readiness check must distinguish retained rollback data
from active work. The Octatrack loader retains its candidate and whole-set rows
until Keep/Undo even after publication completes. Gate edits on the transport's
actual completed phase plus restore/save/journal readiness; a saved-set export
predicate intentionally excludes that trial and cannot serve as editor readiness.

Give native contribution records the alignment their base decoder requires.
ColdFire C defaults to two-byte struct alignment, so a four-byte typed record
must declare that alignment explicitly. Check the descriptor in an actual
target-built package; a host build's pointer alignment can hide this mismatch.

Do not infer a read-only job from a mutable queue record's opcode alone. If a
display read must preserve an editor operation, block access for its entire
lifetime, identify the actual guarded dispatch branch, retire any unclassified
completion before reopening admission, and recapture the complete relevant
metadata. A known Flex rendering fixture does not qualify Static error paths.

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

An exact internal failure-rollback snapshot needs inactive rows too: adding slices overwrites
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

Retire an editor's selected row before rebuilding bindings for a shorter marker
table. Beat Slicer's isolated 1.40C refresh probes observe the old selection
being dereferenced after its row pointer has become null; resetting the selection
first avoids that path in the tested Flex/Static reductions, including zero
slices. Recompute selection from the cursor after rebuilding. This is a native
integration requirement, not an observed stock UI defect or hardware result.

### Source ownership

A geometry-only preview can avoid PCM access, but it still needs a coherent copy
of settings under the reviewed metadata-writer boundary. Give it a distinct
informational result: absent amplitude analysis means unknown boundary safety,
not zero-valued fade warnings. Do not feed a fake silent reader to a live planner
or let an informational grid authorize Apply.

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

Distinguish source writers from editor visualization work before invalidating
every preview on every engine command. Beat Slicer's pinned 1.40C full boot
observes recurring waveform commands invalidating a read-only preview under
that coarse policy. Isolated execution checks the ordinary Flex renderer's
source-read footprint across four formats and slots 0/127. That does not qualify
Static/recorder variants or mutable queued-record lifetimes. Never exempt an
opcode alone; establish its submode, input lifetime and complete write footprint
before using a narrower classification in a live base.

Keep loader ownership and sample ownership separate. The current
[`modwerk_machine_lock`](../../sdk/runtime/loader/loader.h) preserves loader
stability while deliberately allowing real-time interrupts. It is not, by
itself, proof of exclusion against recorder or PCM writers; establish that
additional boundary before connecting a live sample reader.

When tracing a recorder's deferred cleanup, distinguish worker startup from
the queued command and compare state after recording separately from state
after cleanup. A zero-to-zero map store is still a writer observation; byte
equality alone cannot establish exclusion. On the isolated 1.40C recorder-stop
fixtures, an empty queue preceded stores through the unused map tail. Preserve
per-track command identity, exercise separate recorder records queued together,
and test actual return/next-receive lifetime; neither
fixture completion nor an unmasked wait establishes live ISR/allocator coverage.

Distinguish the selected recorder bank from a pending start and retained history.
In Beat Slicer's stock 1.40C full boot, retriggering switches banks; STOP clears
the selected state while the other can remain `2` without advancing. Isolated
calls distinguish that retained state from a pending `1`, including delayed
starts. Neither "selected bank only" nor "any nonzero bank" is a complete
ownership rule. Capture overlapping stores too: the observed pending byte is
published by a four-byte write beginning two bytes earlier. These are emulator
observations, not a qualified native recorder/source boundary.

Compare a native writer wrapper against the unmodified whole routine, including
both continuation states, caller arguments, status flags and ordered external
stores. Preserve SR/CCR when displaced instructions do not reset them. Keep
stock cleanup running after observer failure. Beat Slicer's isolated 1.40C
recorder comparison retains two idle voice-flag clears in its write oracle;
no PCM write does not mean no write at all. A narrow fixture exception is not
a production writer allowlist, and instruction counts are not physical latency.

Compose writer families in a normal full boot and retain uncovered stores as
qualification gaps. Beat Slicer's shared recorder/engine fixture exposed
preparation writes before the recorder scope; whole-call preparation scopes
cover those observed stores in later ordinary-recording runs. Record saved
caller SR when establishing interrupt context: a paused task/SP is insufficient.
The pinned 1.40C emulator records mask level 5 here, not physical latency or
complete writer coverage. Test the actual bootstrap action too: an empty
editor may queue no job. Separate intentional setup changes from the source
that the operation must preserve, and verify that setup difference explicitly.

### Background work

Budget the entire protected interval, including metadata validation before and
after a bounded PCM copy. Include the maximum supported metadata count as
a distinct workload; a short sample with few markers does not cover that cost.
A work-call or byte-count limit is not a lock-time measurement. When one backend lock also protects requests/results, separate
those coordination windows from actual source accesses. Pair exact mask/restore
observations and account for the measurement method; executed instructions do
not establish physical latency, cache behavior or complete ISR cost.

Cancellation must follow the stock screen transition. In Beat Slicer's private
1.40C MKII resident-menu emulator fixture, TRACK + REC1 closes the dialog and
returns to playback. Keep it closed through Stop; require a fresh editor
opening for new work. Do not force a stale-state dialog over the stock page.
This observation is emulator evidence, not a hardware behavior claim.

Test wake identity with a foreign record queued before an owned record while
that owned wake is pending. Identical payload bytes and a pending flag do not
establish ownership. Preserve the actual queue order in the evidence; separately
check that WAITING does not self-poll and that cancellation survives readiness
returning. Beat Slicer's private engine fixture exercises those cases with
fixed storage, not native loader reclamation or USB disconnect qualification.

When adding a worker observer at runtime, account for the command already
waiting inside the old receive call. A changed call site does not wrap that
in-flight receive. Start admission closed and establish quiescence before
opening it; keep queue waiting outside the observer lock. Beat Slicer's 1.40C
reserved-memory emulator experiment checks a compiled whole-command observer,
not complete writer coverage or physical lock timing.

Keep arithmetic and decoding of owned PCM copies outside the source critical
section. Reacquire and revalidate before the next live read; the validation from
before an unlocked interval is insufficient. Test writers becoming runnable at
each release, including after a successful copy. Instruction counts from a
synthetic backend can verify lock scope, but do not establish physical interrupt
latency or a safe native time budget.

Use the base-owned engine boundaries for background work, retiring the previous
writer before a reader runs. An idle callback may need an explicit queue wake;
do not assume it runs periodically. Coalesce wakes using stable base-owned
identity, not an opcode exemption that would admit unrelated commands. A pending
reader must wait for readiness or cancellation instead of immediately waking
itself forever. Beat Slicer's private 1.40C engine fixture exercises this with
one bounded work call per event: at most eight private reader transitions and
one PCM copy, plus optional begin/setup and publication. Revalidation precedes
each live copy. Earlier fixtures used eight single-transition steps; name the
counter unit when comparing them. Neither is a physical-time budget or
qualification of the production USB/module-set chain.

Keep one background owner for a mutable preview session. UI callbacks publish
copied, sequence-tagged intents and consume copied results; they must not inspect
or cancel the engine's session storage directly. Recheck cancellation/replacement
under source ownership before capture or copy, including after unlocked planning.
An old result must remain unreadable after a newer intent is accepted. Every
accepted intent also needs a wake or ordinary-event guarantee: it may arrive as
a service releases its final lock, after its local return-state value was chosen.
Beat Slicer's host/ColdFire exchange tests inject those late-publication cases;
this is not proof of a native loader lifetime, writer coverage or physical budget.

### Menus and loader lifetime

Keep a native confirmed answer pending when source readiness is temporarily busy;
revalidate source and owner before any write, and consume it before publication.
Cancel that pending answer on Back or another stock gesture. Busy is not evidence
of a changed sample. If a workflow replaces an existing table, use an explicit
replacement warning and test NO against the complete old table as well as YES
with fewer new entries. Preserve older preservation-only API callers.

Verify editor gestures against the rendered stock page, not a remembered key
order. In Beat Slicer's pinned 1.40C full-emulator session, AED → AMP selected
SLICE and plain YES opened its action menu; LFO selected EDIT. Loading a Flex
slot also did not assign it to the track until the slot was confirmed. Bind a
preview to the editor's actual kind/slot, not merely to a successfully loaded
source. These panel observations still need physical qualification.

Establish menu-pointer lifetime before adding a row: stock menus can retain
label, callback and selection storage after their opener returns. Keep that
storage base-owned and make removal retire every reference before reclaiming
module memory; a callback that is not currently running can still be retained.
An appended action must also leave the native remembered selection valid for a
later stock-only menu. Test both selected-slice and unsliced variants and prepare
their marker state explicitly. A closed window may be used to cancel a preview,
but is not evidence that retained table pointers can be reclaimed.

Closing a native menu need not detach its label/callback/selection pointers.
Beat Slicer's compiled 1.40C menu fixture observes those pointers still retained
after selection. Keep composed arrays base-owned and refuse reuse until old
callbacks are quiescent; validate the owner under the loader's stable lock.
Verify tail-call argument storage too: the observed stock selection routine
rewrites its first incoming argument word, so a zero-argument C test call can
corrupt its caller even when all menu assertions pass. These are isolated
execution findings, not a proved live detach or loader integration service.

A retained no-argument callback must not adopt a newer opening's global token.
Bind authority to the actual selection path before native close, validate it at
the direct callback tail and consume it once; retire only after callback return.
Refuse nested selection before it can use the outer context. Beat Slicer's pinned
1.40C experiment also observes stock overwriting its caller's first argument:
an extra nested call frame would change that ABI effect. Compare original and
wrapped register, SR, stack and argument behavior separately from full-popup
execution. These checks do not authorize reclaiming retained references.

Immutable resident tables can support repeated fixed-owner openings without
claiming native detachment: keep every retained label/callback/action alive,
require completed dismissal and dispatch return, and issue fresh exact selection
authority. Keep distinct layouts independently stable and test transitions caused
by normal stock edits. This strategy does not supply owner replacement, changing
contributions or USB reclamation; retiring an owner must withdraw its action
without freeing retained storage. Beat Slicer's private 1.40C fixture is limited
to that fixed-owner lifetime.

The runtime owner ledger includes staged candidates and retained rollback
predecessors. `modwerk_runtime_owner_valid` proves intact retention, not current
publication. Under the stable loader lock, also match the exact published owner
before resolving an admitted menu handler; retain separate registry/module-set
readiness gates. Retire the activation before replacement/removal, even if an
Undo later restores the same image. Polling alone can miss that whole interval
and must not revive an old activation. Compose retirement into the existing
loader metadata SWITCH callback before publication changes; PREPARE must not
retire live actions. A later refused switch may conservatively retire an
activation, so restoration/reopening needs a fresh one. Preserve all other
admission checks. Beat Slicer's isolated real-loader host/ColdFire fixture tests
this callback ordering and partial-set rollback; production board registration,
source cancellation and native reference retirement remain separate.

Cancel copied preview exchanges before publication as well as retiring their
menu actions. Acquire their nonblocking source boundary within the established
loader lock; a refusal must prevent publication. A later refusal may leave an
earlier exchange cancelled, requiring fresh activation even though the image
stays published. Do not mutate an engine-owned session from the loader path or
reroute old intents into reused storage. Beat Slicer's generated-PCM real-loader
fixtures cover partial cancellation and set rollback; production lock/handle
admission and reference reclamation still require their own proof.

When a menu stores a short module/generation identity, resolve it through an
admitted full-owner activation and an explicit action allowlist before dispatch.
Copy registration records into base-owned storage; do not retain a caller's
temporary array or an unchecked module function pointer. Different modules may
share an action ID, so qualify coexistence and one-owner removal independently.
Beat Slicer's proposed backend tests this with real-loader host and ColdFire
execution under synthetic machine services; typed package admission and native
transition hooks are still not installed.

Validate and publish the same bounded copy of a contributed descriptor. Keep
labels and action metadata in base-owned storage, and resolve entry offsets
only inside the exact owner's initialized image. The loader lock pins that
image but may leave real-time module writers running; descriptor coherence
needs its own verified boundary. An owner digest is reconstruction identity,
not a fresh hash of mutable live data. The Beat Slicer proposal tests malformed
records and copied metadata; it does not establish production table admission.

### Emulator evidence

An emulator can pause inside observer bookkeeping, after an entry diagnostic
changes but before its scope is published. For a quiescent checkpoint, wait
within a fixed bound for both empty scopes and balanced entry/return diagnostics;
do not weaken fault assertions or hide a persistent mismatch. Beat Slicer's
private 1.40C full-marker fixture reaches this intermediate wrapper state.

Do not infer physical pool capacity from a mutable allocation-map endpoint.
In the 1.40C full-boot fixture, recorder reservations reduce that endpoint; after
three explicit arena pages are removed, 14,599 physical usable pages coexist
with a 10,919 map endpoint. Verify the build's actual reservation geometry and
current map bounds separately. Never inject test code into apparently unused
stock heap/globals or delay memory; use a real arena reservation.

For emulator memory watches, use the pinned machine implementation's canonical
address and verify a known store as a positive control. Attribute stores using
the callback's PPC value, not the CPU's advanced fetch PC. In Octabam `8250be0`,
1.40C editor busy/dirty writes at `0x46…` were observed by `0x46…` watches;
substituting `0x86…` observed none. A silent watch is not evidence of no mutation,
and a generic CLI alias note must not override the actual mapped window.

The pinned full-boot emulator's interactive `call` requires main's idle spin;
a normal panel `run` may pause elsewhere. Advance normal execution to a verified
idle boundary before borrowing a call. A retry is safe only for a proved
pre-entry refusal; never replay a call after an uncertain timeout or CPU stop.
Do not force PC/registers to manufacture that boundary. The pinned `8250be0c`
`callAsMain` pushes arguments but does not perform caller cleanup; repeated calls
need a balanced native wrapper, or zero-argument test entries. Keep such driver
behavior bound to the tested emulator source and separate from native service
scheduling. Derive native argument counts from the caller and callee, not the
number of stack words a watch prints: the 1.40C recorder preparation caller
passes two words and removes eight bytes; later watched words belong to its frame.

A longer source file does not prove a longer preview extent. In the pinned 1.40C
emulator, replacing a one-second WAV with a 30-second file retained the old trim;
EDIT SELECT ALL changed the edit selection, not that trim. Verify the actual
trim and tempo after normal sample preparation. Measure both total service work
and the longest callback when optimizing bounded background work; fewer calls
alone can hide a longer interruption. Whole-machine request windows include
stock/UI/scheduler work and must not be labeled isolated module cost or hardware
time. Bounded idle retries may advance normal execution only after a verified
pre-entry refusal; all uncertain execution remains terminal.

Prove that instrumentation observes the execution path in use. On the pinned
`ot_emu` revision `8250be0c`, `Machine::setStepHook` is invoked by `Machine::run`,
not a probe's direct `Machine::step` loop. Use explicit PC checks or memory
watches there, and require a positive read/write control before interpreting
zero counts as evidence of absent accesses.

When testing a captured tempo source, change the instrument through its ordinary
panel path and verify the displayed value, runtime value and unchanged sample
attributes separately. Beat Slicer's pinned 1.40C stock fixture measures TEMPO /
LEVEL adjustment at 90, 137 and 120 BPM; a private native preview run compares
90 BPM PROJECT results with the sample's distinct BPM. These stopped-source
observations do not establish external sync, pattern tempo or changes in flight.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the menu path, with exact button sequences.
- [ ] If the library should group it under System while its manifest says otherwise, that is a one-line override in `src/catalog/modules.ts`, not a reason to change the manifest category.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

Compile portable C with the pinned freestanding ColdFire toolchain early and
inspect unresolved symbols (`m68k-elf-nm -u`) before claiming native readiness.
Host compilation can hide compiler-generated multiply/divide and memory helpers;
an object file alone does not prove that a module links. Use the shared
`sdk/runtime/m68k_codegen.py` flags and object guard too.

For an isolated CPU fixture that links a complete loader, check ELF static-data
and BSS extents against the runner's code and stack regions. The flat loaded
binary can omit a large zero-initialized pool. Record the actual section address
and extent; an object-size or binary-length check alone cannot prove separation.
Beat Slicer's real-loader fixture places the 768 KiB pool in separate synthetic
RAM. This is a test layout, not an allocation or cache result on the instrument.

When an owner-backed menu participates in a whole-set transaction, test each
publication boundary with the actual upload controller and set backend. A
retained old owner is not necessarily published, and restoration must not
revive an explicitly retired activation. Check an unchanged companion and
require fresh activation after rollback or acceptance. Synthetic stopped-state
and explicit test-side retirement do not establish production transition hooks,
USB disconnect behavior, physical self-test or persistence.

## Digitakt and Digitone

Settings rows come from the core's `ev_settings` event: add rows with `core_additem(menu, row)` and claim each row (`settings:FAST AUDIO`, for example) in `platform.claims`. Rows are claimed resources, so two mods cannot add the same one ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
