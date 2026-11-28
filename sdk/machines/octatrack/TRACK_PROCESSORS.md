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

The direct settings action API and its tests are split into a separate proposal
on branch base/settings-direct-actions. This processor proposal adds no settings
ABI. Completed temporary whole-set readiness does not permit saved-set writes
during a trial.

## Evidence and limits

An earlier combined private Base identity is
57cf36e6af98cd7215f3bd6e62d4049266c4e6544ed13ef2d4b7c97c07eaa3e8.
The separate M/S package SHA is
c974ee3929ced354fbb37942d83f27698ec25b04704a9c1ba13cfbc5462821af.
No firmware, package or stock bytes are committed.

23 unchanged SDK behavioral tests pass with documented native adapters (UBSan,
ledger include path, host handling of GCC-only attributes, weak budget facts
for older non-M/S controller fixtures). Actual budget/publication code has its
own passing tests. Three old assertions expect absent feature16 or exact old
strings; they remain unchanged and need the proper test-maintenance review.
The unmodified broad SDK suite and full pr:ready are not claimed green.

Native contract/lifecycle fixtures cover16 members, separate state, owner/PC,
updated controller identity, ACK freshness, capacity pause and unknown work.
Actual generated transport tests cover32 member packets, legacy CAS, reset
boundaries and exact ownership.23 compatibility cases,18 fresh P/Y assemblies,
actual final package admission including unchanged Apply Scene, strict whole-
package stock-free checks and268 receiver instruction/operand comparisons per
core pass. Runtime owner/allocator/DSP ACK facts in native lifecycle tests are
modelled. No firmware, DSP execution harness, emulator or physical test ran for
this chain. Older private hardware results do not qualify this exact build.

The maintainer requested scheduling after0.8.3. Exact-build live-FX/both-core,
CPU/load, persistence, normal-set and longer Undo qualification remain pending;
an older1,562-second Undo failure is unresolved. Keep the proposal a draft.
The later module release needs its own PR; the owner has approved its library copy.

The generated Base binding records dspFeatures from the exact compiled
resident_engines.c and DSP ledger, after checking both against the build proof.
The browser uses the published binding's mask, preserving legacy key-bus-only
bindings while accepting returning-service requirements when that Base is
published. Draft source alone never advertises a service on an older download.
An unknown service expression or changed compiled input refuses metadata binding.

## Review follow-up — 28 November 2026

Board claims are linked to PR2248: dsp-region octatrack/returning-processor-chain reserves the existing DSP
dispatcher extension, with no ColdFire event claim; the two state-region keys are
octatrack/returning-y-800-bff-both and octatrack/returning-y-cc1-fef-both.
The three legacy-test assumptions are corrected only on the separate branch
fix/resident-tests-ledger, tested on both current main and the processor extension.
That fix needs its own review/merge before the full processor check can be green.
The private RAM pair named above still contains both proposals. Splitting the
source does not turn it into physical qualification of the eventual merged Base.

The processor source is merged with current cumulative Base0.8.4 at
607cb058fc13f3739691b082f962b0f574fb102a, including Modwerk's own Python
firmware builder and repository-owned core sources. Native returning contract, board and generated transport
fixtures pass on that merged source. Earlier private bundle identities above
do not name a build of this merge. A fresh official compiler/structural build
now passes; exact unit qualification is still required. The erroneous octatrack/0 hook claim
was released as requested; the chain claim uses the DSP-region kind.

Current processor-only Base identity:
ffe40c3228743683f8700f80d9fea017be6a665b433ba1fc5e9b805a9dadac1f.
The packed container is849472 of851712 bytes (2240 spare); MAIN is1363240
of1572864. The browser and native firmware images match exactly. Strict
stock-free package scanning passes. Analog BD's recipe was recaptured against
the actual new Base imports; its source hashes and six reconstruction copies
are unchanged. Base-bound packages were regenerated and rebuild identically
against this new binding. This build contains no M/S module or settings-action
API, and has not run on a unit. It is not the old combined RAM pair.
