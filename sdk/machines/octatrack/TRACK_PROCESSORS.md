# Returning track processors (proposal)

This shared Base service is under review. It is not a released capability.
The separately developed M/S Balance module processes stereo before both FX
slots; its controller, DSP, AMP control and project files remain module-owned.

## Shared route and package contract

Guarded site0 calls the returning processor aggregate, then the existing key-bus
tap, replays the displaced instruction and enters FX1/FX2. Source-chain skip
exits and post-FX Sidechain MON remain intact. Neither FX slot is occupied.

Up to16 independently owned processors share the aggregate, sorted by declared
order then module ID. Real P/Y/cycle capacity can refuse a combination. Base
allocates private Y state within800..bff andcc1..fef on both cores, excluding
stock data on both cores, Matrixc00..cc0 and Sidechainff0..fff. Modules declare
virtual state references instead of physical claims or allegedly spare bytes.

The existing ABI10 engine carries a versioned returning descriptor (long BRA
past metadata, magicMWT), authored code, P/Y relocation records, initialized
state, track stride, control/reset offsets, byte range, neutral and order.
processor_contract.h/c define and validate it. Base copies a deterministic
returning program plus state; transport retains no pointers into module code.
The Base-owned aggregate alone occupies feature16 in the existing allocator.

Optional source-runtime engine schema2 declares confined .asm sources, a P table
and a virtual-state layout/initial file. Independent fresh P/Y assemblies prove
relocation before the real ABI10 encoder attaches it. Filesystem escape, symlink,
undeclared includes, overlapping relocations and malformed layouts refuse.
Existing C-only recipes and engine schema1 retain their paths. Legacy Sidechain,
Matrix and Analog BD trust rows are unchanged. Returning controllers do not
require a digest row compiled into Base; their controller, DSP, table and state
updates travel in their own packages.

## Native admission and controls

The loader offers a narrow optional engine-data admission seam after validating
encoded bounds. A machine can materialize native words for its predicate and
PREPARE under the stable lock. The ordinary fallback invokes the existing
metadata-only predicate. Pool allocation overwrites all scratch pointers with
owned native arrays before publication; PREPARE scratch is never a lease.

modwerk_track_controls(entry,epoch,revision,lo,hi) validates the actual owner
generation, tick entry and caller PC. Eight bytes name T1..4 thenT5..8, MSB first.
The declared byte range is checked before requests change. CoreA handlesT5..8,
coreB handlesT1..4. Opcode13 carries only member index/reset and four bytes;
the currently placed Base metadata supplies that member's private Y cells.
All fields validate before any write. No caller-selected DSP address is accepted.

Result1 certifies both cores' exact epoch/revision/value ACKs;0 is pending and
negative unavailable/closed/invalid. New membership or activation invalidates
old ACKs. Latest intent survives a capacity pause and in-flight older updates.
Unchanged placed code can reset/re-enable after capacity returns without STOP.
Controller changes quiesce the chain through both known-off ACKs and drained
jobs before old program storage is reused. Unknown jobs retain resources and
close the boot. Reserved Base transport generations and runtime owner generations
have disjoint bounded namespaces; exhaustion refuses.

modwerk_track_publication exposes only the actual execution image's publication
serial: unrelated MODULES READY preserves it; Undo/reactivation changes it.
Zero means absent/exhausted. Modules never infer it from addresses or owner epoch.

## Budget and lifecycle

The aggregate sums existing executed/hardware prices plus a conservative wrapper
allowance, reserves before ENABLE and retains capacity until known-off/drained.
Mandatory bank/publication plans can pause it while preserving request context.
Ordinary uncommitted FX picks keep their refusal policy. Heavy scans stay outside
the short full-mask publication fence. Each fresh budget check shares one bank
scan across cores; no bank-dependent result is cached between checks.

The direct settings action API is upstream cumulative Base support, reviewed
separately in2359/2366. This processor proposal adds no settings ABI. Completed temporary whole-set readiness does not permit saved-set writes
during a trial.

## Binding and packaging

The generated binding's dspFeatures is the ledger-service mask read from the
exact compiled resident_engines.c and canonical DSP ledger, checked against
the build proof. Every compile-time branch must agree on that mask. Program
areas remain the upstream separate unledgered service0x100. Unknown expressions
or changed compiled inputs refuse binding. Older bindings without this field
retain their key-bus-only interpretation; draft source never advertises a
service on an older published download.

The current cumulative Base plus this service exceeded the851712-byte packed
slot by5196 bytes. Base-only bounded lookahead now selects a smaller parse in
the existing section format. It compares against ordinary packing and cannot
choose a larger result. Native and browser builders share fixed tie rules;
synthetic fixtures pin parity and decode through the unchanged boot decoder
model and the independent codec. Ordinary firmware/module packing is unchanged.
This is computer-side packaging work, with no extra instructions in the audio
path and no device decoder change.

## Evidence and limits —28 November2026

Merged cumulative Base target817bc050b98d88365ed6ae6f20fc63fba1a4276e.
Official native/browser builds agree on firmware SHA
a20b65f87c11100439575eeb144742ae66c036c0864e2bd2d73faf635f4593e9.
Base identitye875ac1b6c71133b3219c3e3a94a93d5f4999a5da42d240f3aff3af052fed625.
MAIN1363156 bytes; packed container849452/851712 bytes (2260 spare).
The host file includes a16-byte wrapper outside that container.
This exact build has NOT run on a unit. Structural bootloader preservation
and byte equality do not prove successful boot, sound, load or Undo.

The conservative host-only standalone card readiness default is suppressed
when the real loader is included in the same native translation unit. Native
card guards, legacy-engine relocation and current complete on-demand chains
are checked without executing DSP code.

Native fixtures cover16 members, separate state, owner/PC bounds, changed
controller identity, both-core ACK freshness, capacity pauses and uncertain
retirement. Runtime/allocator/DSP ACK facts are modelled; no firmware or DSP
execution harness or emulator is used. Generated receiver instructions are
checked by assembly/disassembly rather than execution.

Linux source reproduction46141270869 passes using only the compiler, assembler
and disassembler. Official import verifies every authored package byte matches
the existing baseline; only source provenance changes.

The separate Fix2358 retains fixed main-branch measurement assertions and is
ready with its latest complete CI run green. This Base changes its own fixed
expectations alongside the rebound package hashes: earlier measurements are
not silently attached to different bytes. The shared settings action rows are
already in cumulative0.8.4 through2359; this proposal adds no settings ABI.

Earlier combined private buildcd7b50b133aeacbe58d078f8ff82a13d299ae9b2a631cce843d6a9b874b1dbe1
ran a1800-second RAM trial with the ten original module names rebuilt for that
candidate plus M/S; these were NOT the exact original saved package bytes.
The developer reported stereo samples, nonzero M/S and both FX sounding normal
on T1 and T5. During rollback M/S was removed first; after an orderly USB Audio
configuration reconnect, a fresh read showed the SAME RAM Base, normal state
and EMPTY live inventory, with tick continuity. The host lost the final ACK:
this is module-removal evidence, NOT a clean acknowledged CLI Undo pass.
A preceding attempt lost mains power and is inconclusive. The developer then
power-cycled; the original Base and exact ten-module saved/live set were verified
restored. No Keep or flash ran. These older bytes do not qualify this merge.

The historical1562-second Undo failure remains unexplained. Exact-current-build
live FX on both cores, load, persistence, a normal saved set and long Undo still
need the prescribed unit procedure. Keep this proposal a draft. The owner
accepts and releases the cumulative Base; M/S then needs its separate module PR.
The approved M/S copy and its private DSP/controller remain outside this PR.

Board claims linked to2248 are dsp-region octatrack/returning-processor-chain
and state regions octatrack/returning-y-800-bff-both and
octatrack/returning-y-cc1-fef-both. No ColdFire event index is claimed.
