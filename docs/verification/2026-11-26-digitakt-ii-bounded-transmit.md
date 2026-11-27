# DT2 OS 1.17: bounded transmit investigation

**Result:** the public stock SysEx send path is unsuitable for a bounded UI-tick
responder. A small adapter using stock's resource APIs is a candidate, with
explicit admission guards and asynchronous completion/reset handling. It is
**not implemented or hardware-qualified**. There is no native implementation GO
until its remaining conditions below and ownership coordination are settled.

Commit `9f551e4ff8f2e62a5c3d822602ae9f31a38aceda` is preserved unchanged.
This investigation adds facts and preflight guards, not a competing DN2 link.

## Maintainer review, 26 November

- [#1763, bounded reads](https://github.com/repeat98/modwerk/pull/1763#issuecomment-7184870951):
  the device chooses the bytes. `ident` and a snapshot-based `screen OFF` are
  accepted; old `mem` is refused with status 2. Misaligned screen offsets
  and a later part before the first snapshot return status 4 in the source/host
  fixture. The current host interface has also removed `mem`.
- [#1842, build identity](https://github.com/repeat98/modwerk/pull/1842#issuecomment-7184871925):
  HELLO names the source/layout digest of the particular dev build. The stale
  fixed `UPLOAD_BASE` constants have now been removed from #1842. The host fixture
  refuses an offer for another build; the exact current build still needs its
  unit run, package SHA-256 and matching/mismatching `.identity` checks.
- [#1763, shared wire](https://github.com/repeat98/modwerk/pull/1763#issuecomment-7185281980):
  retain the shared `link-wire.ts` imports/exports and bounded `screen` command,
  remove the local header, and merge the cumulative branch up the stack.
  Both current heads import/export the shared wire. No local header or request
  implementation should be carried into the DT2 adapter.
- [09:45 maintainer update](https://github.com/repeat98/modwerk/pull/1763#issuecomment-7188423077):
  all code-review points across #1763, #1817, #1820, #1821 and #1842 are answered.
  What remains is one exact-build unit session and refreshed descriptions. The
  owner will merge down in that order, then #1842. His base-merge/lint fixes are
  already on the named branches; this is not work for us to duplicate.

Final source snapshot: #1763 `7419aeda95a1a5e51ac093ed62a9b20cba221737`,
#1842 `02bbb0cb86b28d7c4a8c0b5a9c64bbe809ffe7bf`. These supersede the early
morning heads inspected while this investigation was underway. Current #1842
still calls stock's SysEx sender from the UI tick: a bounded diagnostic *data
interface* is distinct from a bounded native *transmit execution path*.

Reuse these contracts; do not repair or fork prodbysmolec's stack in this work.
The two PRs remain open, and old reported unit results do not qualify their new
heads or DT2. The board question about DT2 ownership remains unanswered.

## Local evidence and provenance

The owner's exact `Digitakt_II_OS1.17.syx`:
`26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`.
MAIN at `0x40000400`, 3,275,616 bytes:
`a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964`.
Decoded with Modwerk's ELE3 reader. Local Capstone 5.0.6 plus Modwerk's ColdFire
classifier established instruction boundaries; no stock implementation was
translated into contribution source. Private extracts/tools stay in the ignored
`firmware/dt2-usb-investigation-20261126/` directory. No DigiKit code was read or
imported for this investigation. REA access to the binary was rejected by automatic
approval review over possible disclosure to an unverified connector; inspection
continued entirely locally. No device, emulator or firmware build was run.

The [binding record](../../sdk/machines/digitakt-ii/usb-link-bindings.json)
contains hashes, not instruction bytes. Run the existing preflight to check them
and their overlap against a local base ref. Patch candidates also pass Modwerk's
whole-instruction check. Other hash ranges are fingerprints, not patch lengths
(the original sender-entry fingerprint ends within an instruction).
A matching hash establishes identity,
not an execution-time bound. Direct-call/pointer searches were targeted; they
are not proof of exhaustive indirect-call coverage.

## Transmit execution path

| Stage | OS 1.17 fact | Consequence |
| --- | --- | --- |
| Chunk sender `0x40121d2a` | Chunks at most 144 MIDI bytes through `0x40121adc`; abort checked between chunks | Abort cannot interrupt a blocked inner call |
| Port route `0x40121adc` | Explicit USB port 2 acquires the MIDI mutex via `0x40004668`, calls the serializer, releases via `0x40004678` | Mutex acquisition itself may sleep; USB plus DIN routes must not be selected |
| Serializer `0x40004734` | Waits at `0x40004774` and `0x400047a2` for pending bytes to fall | No deadline, abort or yielding in these loops |
| Transfer helper `0x400045d6` | Normal traffic calls `0x400057b8` for a descriptor, then submits endpoint index 5 | Checking ring space does not reserve a descriptor |
| Wait allocator `0x400057b8` | Retries and waits on native synchronization until a descriptor exists | Moving stock send off the MIDI task does not make it bounded |
| Try allocator `0x40005764` | Returns null for an empty pool, but polls a popped descriptor's active bit at `0x40005792` | Not unconditionally bounded; a guarded call is required |
| Submit `0x40005a86` | Walks the supplied chain, cleans at most two old entries, attempts the add-transfer tripwire at most 1,000 times | A single terminal descriptor bounds its own chain; worst-case critical-section duration is still unmeasured |

The ordinary pool has 32 descriptors, 64-byte stride, at
`0x80000200..0x80000a00`, free head `0x40965b1c`. Stock owns it.
The separate rotating real-time descriptors must not be borrowed as a shortcut.
The stock ring at uncached `0x4fe3c000` and queue heads remain stock-owned too.

Stock completion in USB ISR `0x40006e9a`, around `0x40007032..0x400070c2`,
captures callback arguments, returns the descriptor through its native free
callback, advances the queue and invokes completion. The cancellation helper
`0x40005878` and endpoint drain `0x400059aa` also release via native callbacks.
By contrast, bus reset `0x40006dba` drains/resets hardware and calls `0x40005826`
at `0x40006e4c` to rebuild the pools, then clears queue software heads, without
walking their ordinary completion callbacks. A responder cannot infer buffer
ownership from completion alone or free a pre-reset descriptor afterwards.

## Smallest coherent native integration candidate

1. **Receive:** prefer the six-byte table-load site `0x40120006` over the earlier
   eight-byte function-entry candidate. Here a1 is the assembled message, d1
   its length and d2 its source, before the manufacturer comparison. This matches
   DN2's shim shape: observe, preserve registers, replay the table load and let
   stock continue. Accept only MWL from USB sources 2/4; never replace stock's
   USB parser or DIN path. The normal USB parser's state byte is `0x44d2e8c0`,
   distinct from the transmitter's SysEx state at `0x409659c8`.
2. **Service:** the existing `ev_tick` consumes a bounded base-owned request
   slot and replies with complete MWL messages. No new task or framework.
   Reuse `link-wire.ts` on the host. A request slot must not be reused until its
   owner publishes consumption; reject excess traffic rather than queue forever.
3. **Try-send candidate:** packetize one complete, bounded reply from the USB-MIDI
   specification into a base-owned DMA buffer. Acquire stock's MIDI mutex
   (`0x47db406c`) with the bounded native try-acquire `0x40001680`; if busy,
   return without sending. Refuse while the native USB parser or transmitter is
   mid-SysEx. Admit only to an **idle endpoint**, not an existing transfer queue:
   require software head and tail zero, hardware PRIME/STAT clear and no active
   queue-head overlay. Under one critical section that excludes reset and
   competing allocation, validate a non-null,
   aligned, in-pool free head and next pointer, with the head's active bit clear **before** calling
   `0x40005764`. That condition prevents entry into its active-bit loop.
   Allocate through stock, never unlink a descriptor ourselves. Initialize only
   the loaned descriptor and submit one terminal transfer through stock's
   endpoint API; do not call its serializer or waiting allocator. These guards
   select the submit helper's empty-queue path, avoiding its 1,000-attempt loop.
   An unexpected submit result quarantines ownership until it is resolved; do
   not assume it is safe to free a possibly queued descriptor. Release the native
   mutex outside the explicit transmit critical section. Busy attempts may drop
   the reply. This is a conditional source path, not measured native behavior.
4. **Lifetime:** at most one descriptor loan and one immutable DMA reply buffer.
   **Correction to the first candidate:** native submit overwrites descriptor
   `+0x30` with the buffer pointer; completion receives a byte count and that
   pointer, not a caller-supplied epoch cookie. Do not put epoch metadata there.
   Completion never waits or runs a loader, and cannot by itself prove that a
   later callback belongs to the post-reset transaction. A second guarded
   lifecycle shim is necessary
   for reset. Candidate `0x40006e4c` needs **ten** whole instruction bytes (the
   four-byte call plus following six-byte instruction), not a six-byte overwrite
   of half an instruction. Replay stock, advance the epoch, discard old requests
   and forget the old loan only after native DMA quiescence/pool reconstruction.
   The reset ISR must finish clearing queue heads before UI service can resume.
   A captured callback in another native context is a separate CPU-lifetime
   concern: do not reuse the same buffer merely because hardware is quiescent.
   Verify profile-switch drains and all callback contexts as well as bus reset.
   Until that serialization/barrier is established, quarantine is the safe
   stopping state; it is not completed reconnect support.

This is a conditional reuse path, **not** a proven safe native driver API.
The adapter would add two guarded stock sites plus the existing tick subscription,
one loan from the shared pool and its own buffer/state. No new USB interface,
endpoint, descriptor template, ring, persistent storage, SHARC allocation or
runtime pool is justified for this milestone. Base `.bss` owns the buffer, using
a proven uncached/DMA mapping and placement that stays within one 4 KiB page;
do not choose a fixed cave or assume the normal cached pointer is DMA-safe.
The [NXP data-structure note](https://www.nxp.com/docs/en/application-note/AN3631.pdf)
documents the page constraint and active status; packetization comes from
[USB-MIDI 1.0 section 4](https://www.usb.org/sites/default/files/midi10.pdf), not
from stock's serializer. No example driver code is needed or imported.

## Identity boundary, tests and stopping conditions

M1 remains a useful **device/base identity and bounded status** connection.
Counters alone do not satisfy it. Generate identity with `machine-base.py`'s
layout digest, as #1842 does, not an OS filename, fixed text hash or self-referential
image hash. `ident` currently differs across machines and DN2 does not yet expose
that digest outside upload HELLO. Agree its diagnostic representation with the
shared-link owner; retain the existing prefix rather than silently changing it.
Do not initialize an upload controller with fictitious capacity to obtain identity.
The existing MWUI schema with submit disabled is a possible reusable identity
payload, not an agreed MWL command. Device-selected counters/status must represent
unsupported values explicitly. Runtime upload/loading stays out until real DT2
pool, cache, stopped-state and paused-task contracts exist.

Before native implementation GO, verify:

- A synthetic fault harness for the actual adapter returns immediately for a
  held mutex, empty/malformed/active free head, active stock SysEx and disabled
  endpoint. No stock wait/serializer call is reachable. Check all reply lengths,
  terminal descriptor construction, FIFO ordering and failure cleanup.
- Completion, cancellation, reset without completion, mode change and stale
  epoch callbacks cannot double-free, reuse an in-flight buffer or retain stale
  requests. A host timeout never proves DMA stopped.
- The critical section's measured DT2 worst case meets the actual audio deadline;
  a finite 1,000-attempt loop is not a latency measurement. If that bound is too
  costly, stop and coordinate a shared native API rather than rewrite the driver.
- Exact-build unit tests cover disconnected/non-reading hosts, simultaneous stock
  SysEx, MIDI notes/clock, DIN rejection, all three USB modes, reset and reconnect.
  No hardware qualification is claimed here.

Stop if those guards require unsynchronized native state edits, a driver takeover,
unbounded waits, guessed cache/DMA behavior or an unagreed wire contract. Keep the
native changes on the owner's cumulative DT2 base, and coordinate shared native
link extraction with prodbysmolec before writing it.

## Validation of this investigation

The extended preflight passed on Node 24.22.3 against DT2 cumulative commit
`de972bf0ca8c08c6270bc0c94a8099a57eaf411e`: nine hash guards, all three USB
profiles and no overlap with 47 base sites. The three spans marked as patch
candidates passed the whole-instruction check. Controlled negative checks kept
the stock identities intact but supplied matching hashes for truncated candidate
spans: seven bytes at `0x40120006` and six at `0x40006e4c` were both refused as
ending mid-instruction. No firmware bytes were altered for that experiment.

The new synthetic-container regression verifies that a matching hash does not
clear a partial instruction. All 28 affected Vitest cases passed (preflight,
ColdFire classifier, shared link wire and ELE3); ESLint and `git diff --check`
passed. This validates the offline checks, not the proposed transmit adapter.

## Focused closure: lifetime, reset, duration and identity

This follow-up preserves both `9f551e4ff` and `404568bac` unchanged. Ownership
remains unanswered on the existing board thread. No native adapter, shared wire
change or DN2 implementation has been made. The independent contribution is the
offline preflight and this stock-free evidence, for review against main.

### DMA lifetime and reset ownership

| Event | Observed order | Reuse rule |
| --- | --- | --- |
| Normal completion | ISR saves length, buffer pointer and callback; calls native descriptor release; advances queue; calls completion | Callback must not dereference the released descriptor. The payload remains immutable until retirement is established |
| Unqueued cancellation helper | `0x40005878` calls error callback **before** clearing active and releasing descriptor | A callback alone does not establish that cancellation has finished; do not generalize its order from normal completion |
| Endpoint drain | `0x400059aa` saves arguments, clears active, releases descriptor, calls success/error callback, then clears software heads | Idle admission must inspect queue heads too; callback return is not the end of the whole drain |
| Bus reset | Native reset waits for hardware quiescence, rebuilds pools, then clears heads; ordinary completion callbacks are not walked | Drop old loans without freeing them into the rebuilt pool. Do not reuse payload storage until CPU callbacks are also retired |

The hardware and CPU lifetimes are distinct. A phase/epoch counter is useful for
discarding requests, but a late callback carrying only a reused buffer address
cannot identify its old epoch. The earlier free-form cookie assumption is
withdrawn. Resolve callback serialization with the owner of the shared native
link; no new closure framework, extra task or unbounded buffer queue is proposed.
If serialization cannot be proved, disable/reject further sends after reset
rather than describe recovery as safe. That limitation prevents a full M1 GO.

Stock boot sets ACR0 to `0x4007e020` at `0x4000055e..0x40000564`; stock USB DMA
uses buffers in the `0x4f...` view. This supports the existing uncached-alias
direction. It does **not** prove a new buffer in Modwerk's allocation is coherent
through both aliases on DT2. Verify its final address, single-page containment,
cache/alias access discipline and DMA backing before native use. A successful
transfer or host timeout alone is not a lifetime test.

### Idle-only critical section: a smaller bound

For USB MIDI IN, native logical endpoint index 5 maps to queue head
`0x800000c0`, software head/tail at `0x800000f0`/`0x800000f4`, and hardware mask
`0x00020000`. These mappings were read from stock's endpoint tables. Under the
same interrupt exclusion as admission and submission:

- Require both software pointers zero; PRIME (`0xfc0b01b0`) and STAT
  (`0xfc0b01b8`) clear for that mask; overlay active clear; endpoint enabled and
  software flush bit 5 clear. Never reserve by a check made before the lock.
- Pre-check the free head and its active bit before the try allocator. The
  accepted path has **23 native instructions** with no repeated instruction.
- Submit exactly one terminal descriptor with a completion callback to the
  empty endpoint. The accepted path has **46 native instructions**, no repeated
  instruction and no visit to `0x40005b6c..0x40005bb4`. It bypasses both existing
  head cleanup and the append/tripwire path. Busy endpoints are refused.

These are classifier-assisted, condition-selected CFG counts, not execution or
cycle measurements. The 69-instruction sum excludes the adapter's guards,
descriptor initialization, call instructions, try-lock/unlock and cache/bus
latency. Packetization and identity hashing must remain outside this critical
section. Leave descriptor headroom for stock; taking the last free descriptor
is not cleared by this investigation, and one spare is not a proved stock budget.

Thus the *USB-wait dependency* can be removed from the proposed accepted path.
The *worst-case duration in microseconds* is still unestablished: no adapter has
been linked, and no DT2 timing measurement is authorized/performed. Do not turn
69 instructions into an estimated audio-safety result. A future native run must
measure the complete accepted/refused path and the existing unlock section,
including cache misses and audio/Overbridge contention, against DT2's deadline.

### Identity compatibility checked without a new protocol

Snapshot: main `10905d879` and DN2 runtime head
`cfc60fb5d207762fb1c1727f08042e4e411f9f3d`. The shared wire/identity source files
used in the local checks are unchanged from the preflight branch's main base.
Main does not yet contain DN2's `layout_digest`/`write_identity`; they remain in
that open stack and must be reused when landed, not reimplemented here.

An isolated host probe executed those **existing two functions**, extracted
from that exact head, with synthetic staged sources and a DT2 OS 1.17 recipe.
Two fresh stages with identical inputs produced the same 32-byte digest; changing
one recipe defsym changed it. No compiler or firmware build was involved.

That digest was then passed through the existing host implementations:

- MWL `pack7`/`unpack7` preserved all 32 bytes.
- The existing 72-byte MWUI parser accepted the same digest at offset 16 with
  model `digitakt-ii` and `canSubmit=false`.
- A genuine-format synthetic MWUR HELLO decoded the same digest at offset 48;
  MWUP BEGIN encoded those exact bytes at offset 48. A mismatching base was
  rejected. The fixture had a nonzero session and staging capacity; neither is
  advertised as an implemented DT2 capability.

This establishes **digest/data-schema compatibility**, not a new diagnostic
wire command. Current DN2 `ident` returns counters/status, not the build digest;
the current shared MWL envelope leaves command payloads machine-specific. MWUI's
72 bytes are an existing reusable payload shape, but no MWL carrier for them has
been agreed. Do not append them to `ident`, allocate an opcode, duplicate the
builder or fabricate upload capacity while coordination is pending. Full M1
build-identity discovery therefore remains an explicit integration gate.
