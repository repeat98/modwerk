# Syntakt 1.42: native sequencer contracts for a shared provider

Research contribution for review, 27 November 2026. No core, dependency, module,
firmware or device operation is supplied. Addresses below belong to **main CPU,
official OS 1.42 only**, loaded at `0x40000400`. They are not a 1.40/1.40A/1.41
port and are not addresses in the audio CPU's overlapping address space.

## 1. Current Modwerk state and the useful gap

Reviewed `repeat98/modwerk` main at
[`cbc4935da83d0c5c78e5602c2191cac3c495fd51`](https://github.com/repeat98/modwerk/tree/cbc4935da83d0c5c78e5602c2191cac3c495fd51).
Its Syntakt `core/interface.json` is interface 0.1, with empty events, tables,
exports and claims; `memory.area` is null. The Syntakt goal still describes a
boot probe, not a resident sequencer API. This is a real documentation/API gap;
it does not mean other machines lack shared sequencing.

Main now has `seq-events` for Digitakt MK1 and Digitone MK1. The Digitakt
[dependency](../../sdk/digitakt/dependencies/seq-events/README.md) is Dracyr's
GPL-2.0-or-later implementation from elekloader 0.11.0, unchanged source, with
15 guarded sites. [#2312](https://github.com/repeat98/modwerk/pull/2312) records
author hardware evidence for Track Solo, Modwerk link/UI checks, and its declared
Euclidean conflict. The Digitone dependency pins an author-tested binary;
Modwerk compilation is not substituted for that evidence. Neither is a Syntakt
implementation. Their existing contracts distinguish step selection, generator
and effect stages, condition outcome, notes, velocity and locks, plus a step
clock and read-only track facts. Reuse that vocabulary and composition policy
where it fits; do not copy device addresses, sizes or recovered code.

Open draft [#1922](https://github.com/repeat98/modwerk/pull/1922), head
`5df04951bbbcd790e610c0e8b6fd362ff7c11d4e`, pins Synfact core 2.4.0 at
`48e870a19a8bcc857b3a72ee6d5a263dc7c09bcc` for four UI site descriptions and
stock-USB `/mod-status`. It does not import Synfact's whole patch set or supply a
Syntakt step-fire provider. Its comments include **OTHER HARDWARE-REPORTED**
[Synfact 2.6.1 experimental status](https://github.com/repeat98/modwerk/pull/1922#issuecomment-7104012258)
and [stock 1.42 declining command 54](https://github.com/repeat98/modwerk/pull/1922#issuecomment-7133768696).
Those are link/status observations, not sequencer or core-memory qualification.

**Memory is a live blocker for a resident provider, not for this research.**
[#1411's latest retention result](https://github.com/repeat98/modwerk/pull/1411#issuecomment-7190866875)
is BOOT L0 A0 then RUN L32768 A0: every tested word at `0x47fe0000` through
`0x47fffffc` changed, while both DDR views agreed. The writer is unknown. This
fails retention; a normal boot/play report does not qualify that 128 KiB gap.
MAX's separate buddy-heap reservation is also not a Modwerk allocator contract.

The useful contribution is therefore a stock-authenticated map of **three
different timing layers**, lifetime/reset rules, Song ownership and native edit
helpers. It narrows future provider work without pretending the complete
`ev_gen_*`/`ev_fire_*` Syntakt pipeline has already been mapped.

## 2. Identity, guards and how to read the evidence

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| Official OS 1.42 container | 2,572,064 | `ded3c59fdb909eb9e2c3307b30a486452c8fa6947b12c14e0ce35a187b7f37c1` |
| Unpacked section 3, main OS | 3,442,576 | `1a9723b19fb54d0566c1f690379d2e6dfe43227f77e170ad731dd029430eb3e7` |

[Guard ledger](2026-11-27-syntakt-sequencer-guards.json): 47 address/length/SHA-256
windows, recomputed from the owner's authenticated main image. Every window was
checked against complete instructions in the local ColdFire objdump listing.
Offsets in that file are `address - 0x40000400`. Lengths are **identity windows**,
not sizes of entire functions or authorization to patch every helper. No native
bytes, disassembly, tables or firmware images are distributed.

**SOURCE-PROVEN** here means traced native instructions plus the named local
caller/wrapper; it does not mean an official ABI. **EMULATOR-PROVEN** means the
bounded native branch or retained fixture actually ran. **USER HARDWARE-PROVEN**
is restricted to the user's stated observation on an identified MAX image.
**OTHER HARDWARE-REPORTED** names the external report, not a local reproduction.
**UNTESTED** and **HYPOTHESIS** are explicit below. No MAX result qualifies a
Modwerk/Synfact build or proves hardware deadlines.

## 3. Native step advance: ISR context, not a UI clock

| Site / data | Window / shape | Contract and guard condition |
| --- | --- | --- |
| Sequencer interrupt `0x4008c99c` | 8 B | Entry, before native work. An entry hook alone does not imply a track advanced. |
| Per-track loop `0x4008d0ac` | 6 B | D2 is zero-based track 0..12; 12 is FX. A2 sequence, A3 current track record, A4 step-byte pointer, A5 cycle-byte pointer, A6 divider-code pointer, D3 divider-phase pointer. Native track-record stride is 1,177 B. |
| Due ordinary step branch `0x4008d15c` | 10 B | After active/divider gating and the pending-reset diversion; before incrementing the ordinary step. Useful place to latch **will advance**, not a fired-note event. |
| Historical Beat Repeat post-iteration site `0x4008d1ca` | 6 B | Reached even for disabled/not-due tracks and pending-reset diversion. D2 is already track+1; other pointer increments in this window have not run yet. **Never emit a step unconditionally here.** |
| Step-byte array `0x43bd83fc` | 13 bytes | Per-track native position. A length-1 track advances while its step value remains zero: comparing old/new position alone misses it. |
| Active flags `0x43bd83c8 + 4*t` | u32 per track | This branch advances only when flag equals 1. |
| Divider phase `0x43bd8409 + t`; code `0x43bd8469 + t` | byte each | Signed-byte phase increment compared with the native threshold indexed by code. Native threshold table starts `0x401dac58`; contents are not reproduced. |
| Length fields | sequence signed word +`0x21374`, mode byte +`0x21379`; track signed word +969 | Common versus per-track wrap uses native mode. Track speed byte +972 can refresh the code on its native pending-state path; cycle override byte +1112 is separate from ordinary step wrap. |

The ordinary branch is not every scheduler action. A pending-reset mask at
`0x43bd84ac` can divert around it; a provider must document reset/rearm separately.
Do not turn the post hook into a second clock, or equate pointer publication,
step preparation, step advancement and audible note onset. The interrupt also
prepares scheduled native work elsewhere, including look-ahead paths.

At `0x4008c9c4` onward, the native phase `0x43bcc3a4` is published to
`0x800046ec` under its provider condition, incremented by 900,000 and then
published to `0x800046e8`. ARP reads `0x800046ec` and expresses rates relative to
86,400,000 units. These are sequencer time units, **not audio sample frames**.
The relationship to all external-clock, swing and reset routes remains outside
this fresh replay. The 33 ms UI tick is unsuitable as a sequencer clock.

**Fresh EMULATOR-PROVEN, 27 November:** unmodified native instructions
`0x4008d0ac..0x4008d1d0` replayed in Unicorn 2.1.4, with explicit synthetic
sequence/track/stack/global state. No step instruction was replaced by Python.
The native cycle callback was also allowed to execute when reached. Assertions
check actual branch hits, step and previous-step bytes, stack and post-loop
register advances. The address space is a fixture, not a booted device.

| Replay | Passing cases |
| --- | ---: |
| Common-mode wrap, all 13 tracks, lengths 1..64 | 832 |
| Per-track wrap, all tracks, lengths 2/3/7/16/63/64 | 78 |
| Disabled tracks still reach post-iteration without advancing | 13 |
| All seven observed divider codes, due and not-due, all tracks | 182 |
| **Total** | **1,105; zero failures** |

There were 1,001 hits on the due ordinary-step branch. These counts are fixture
cases, not pytest test functions, full interrupt runs, tempo coverage or musical
hardware evidence. Pending resets, complete scheduling, swing, microtiming,
condition evaluation, external MIDI clock and real-time deadlines were not
qualified by this run. The first diagnostic assumption that a divider threshold
was one was rejected before replay; the final fixture uses the image's native
due phase rather than that assumption.

## 4. Scheduled events and accepted triggers are different interfaces

| Site | B | Observable contract |
| --- | ---: | --- |
| `0x400a3b88` | 6 | Native call of dequeue `0x4011a550`; ARP runs its clock work before dequeue. |
| `0x400a3bf4` | 6 | Event consumer; A2 points to the 80-byte event, A3 its timing node. This is **before** native mute/source/Sound checks. |
| `0x400a42b6` | 6 | Sound-resolved note input; A2 event, A4 Sound, A3 timing context. ARP can transform/suppress here. Still not proof of accepted trigger output. |
| `0x400a4c3e` | 6 | D3 native accepted-trigger bit mask; A2 working parameter frame. Track Dialogue consumes it after existing lock/Scene/LFO processing and before downstream filter-envelope/conversion work. |
| `0x4010dc52` | 6 | ARP MIDI ingress window. Contains PC-relative control flow: **not a generic relocatable six-byte trampoline**. |

The accepted mask can coalesce several accepted notes per track in one working
block; it is useful for modulation and metering, not an event history, velocity
stream or replacement for step-fire stages. Track Dialogue's retained fixtures
cover native notes, analog sources and ARP-emitted notes, while rejected muted,
solo/pattern-muted requests, note-offs and lock-only events do not become pulses.
This does not prove every retrig, condition or microtiming case. An audio mask
also does not establish the MIDI-output fire contract.

ARP's local audio event view is 20 big-endian u32 words / 80 bytes: word 0 kind,
1 action, 2 track, 3 source, 5 packed velocity, 6 note, 9 flags, 10/11 Sound-related
state, 12 duration, 17 lock-reference pointer, 19 ownership/release-related state.
Word 4 is kind-dependent: a pattern owner on one native route, a generation token
on ARP's generated route. This is a **partial reverse-engineered view**, not a
complete stable event struct. The node and event lifetime end in native handling.

| Native pool/queue helper | Guard window B | Use observed in local research |
| --- | ---: | --- |
| Allocate `0x4011a686` | see JSON | Allocate event; pool failure is possible. |
| Copy `0x4011a6f0` | see JSON | Native copy retains lock ownership; a raw memcpy of a retained event is insufficient. |
| Queue immediate `0x4011a8e6` / at-time `0x4011a80c` | see JSON | Native queue owns submitted event; timing-node capacity also matters. |
| Free `0x4011a6bc` | 6 | Native release; private kind must be restored before stock cleanup. |
| Release lock reference `0x4011a658` | see JSON | Balance each retained lock. |
| Flush `0x4011a950` | 8 | Reset/cancel private ownership around native flush. |

Queue head is `0x444df434`, free timing-node list `0x444df43c`. ARP handles
immediate-head reuse and pool exhaustion; failure must not leave an infinite
note. Its private kinds 7/8 and MIDI generation encoding are **not free native
types or a Modwerk ABI**. A shared provider needs owner-assigned event identity,
generation cancellation, exactly-once cleanup, no stale Sound/Kit/sequence/lock
pointers, and separate note-off safety. UI subscribers must receive bounded
snapshots, not borrowed live queue pointers.

Mute state is not one universal flag: local checks use solo `0x8000304c`, mute
`0x80003048`, pattern mute u16 `0x43bdd828`, the relevant Kit's track mask at
+5456 and panic `0x80003138`, at different native stages. Do not duplicate one
mask formula as a substitute for native accepted-trigger semantics.

## 5. Pattern identity and complete native edits

Active sequence pointer `0x43bd8430` is published at **four** six-byte sites:
`0x4008c438`, `0x4008cb08`, `0x4008d386`, `0x4008d6a6`. Pattern Sculpt guards all
four plus sequence decode `0x400a80c0` (8 B). Ordinary publication of the same
pointer need not invalidate a snapshot; decoding a new pattern into the same
slot **must** invalidate it. Pointer equality alone does not establish identity.
Bind state to project owner, slot/model identity, publication/load generation
and relevant content. This also matters for ARP stop/flush and delayed events.

Sequence encode is `0x400a8264` (8 B), decode `0x400a80c0`; serialized size is
**23,223 bytes**, not the runtime object's size. Native notification root is
`0x40016d28` (8 B). Whole-sequence restore can reset native track undo; it does
not establish an atomic Kit+Sequence filesystem transaction.

Track editor helpers: copy `0x4002c32c`, paste `0x4002b05a`, selected-trig clear
`0x40029544`, note/lock getters `0x4002787c` / `0x400278d8`, flag getter
`0x400272c4`, note/lock setters `0x40029f32` / `0x40029faa`, velocity setter
`0x40028362`, microtiming setter `0x40028456` (input uses signed timing +64).
Complete entry identity windows and full guards are in JSON. These are callable
native helpers, not automatically safe interrupt callbacks.

The editor's **80-byte clipboard trig record is not the 80-byte audio event**.
Its index is at +0, note/lock presence +4/+5, scalar data +8..55, flags +56..64,
lock-vector pointers +68/+72/+76. Padding +6/+7 and +65..67 is ignored. The
isolated copy leaf leaves +59/+60 unset although paste consumes corresponding
flags; local research completes them with the flag getter. This is not a claim
that the full stock panel-copy path is broken.

Pattern Sculpt uses stopped/record-off guards, native clipboard preservation,
lock lifetime handling, private encode/decode round trips, full expected-content
comparison before undo and rollback on rejected native copy/paste. Out-of-range
operations may silently leave data unchanged: readback matters. Its three
serialized snapshots occupy 69,669 bytes; they are not appropriate ISR scratch.
This suggests a later **task-context edit service**, separate from real-time
step-fire transforms. No such Modwerk service is implemented by this packet.

## 6. Song Mode and persistence contracts from Song Morph

| Native route | Entry identity B | Meaning |
| --- | ---: | --- |
| Advance `0x4011877c` | 8 | Native Song advancement; hidden output argument in A0. |
| Predict `0x401188f6` | 8 | Predictive/look-ahead tuple, **not the current audible row**. |
| Current callback `0x40118a18` | see JSON | Read current native state using its own calling convention. |
| Queue row `0x40118c0c` | 6 | Queue transition; not an independent immediate Song cursor. |
| Insert/delete/clear row `0x40023fda` / `0x40023afc` / `0x40023c5e` | 8 / 8 / 6 | Row-bound metadata must follow native edits. |
| Song writer/reader `0x400a8bae` / `0x400a8ab4` | see JSON | Native 3,072-byte stored Song, version 1. |
| Writer padding call `0x400a8ca2` | 6 | Original zeroing call; Song Morph's guarded extension is local schema, not shared free storage. |

State: provider `0x43bd8534` equals native Song provider `0x402d7350` for this
path; active Song `0x444db34c`, current row `0x444db354`, queued row
`0x444db358`, step count `0x444db364`. Transport checks include both
`0x43bd8424` and `0x43bd83bc`. Song Morph also checks the row's pattern against
the actually playing model (`project +304`, pattern id +68), and effective
length signed word `0x43bd8528` with native sequence-length fallback. Without
that guard, a queued row can apply Scenes to the outgoing pattern.

Project pointer is `0x444e23f4`; Song model is `project +0x37394 +84*song` for
16 Songs. Runtime/mirror pointers are model +16/+32; runtime rows start +16,
stride 34, count u16 at +3382. Row pattern is +0, repeat-minus-one +4. Morph
handles finite native lengths up to 2,048 steps and repeats 1..32, with at most
99 rows; it follows native Song progress rather than its own timer.

The codec writes meaningful fields through offset 2602, then zeroes 469 bytes
from 2603. Morph uses a checksummed 404-byte local extension at 2604..3007.
**Do not declare this padding unowned storage in Modwerk.** Native SaveSong may
write into fresh scratch (`0x405ff954` observed in the fixture), not the mirror
pointer. The source Song identity must select extension data; a destination
buffer lookup loses it. In the local wrapper the original source argument is
at 44(SP) on entry to the replacement call. This stack offset applies only to
that exact writer/call wrapper. Older firmware clears the extension on save.

Newer local Song Mutations source adds another relevant ownership lesson:
native deferred save `0x40023150` uses a model mutex at model +44. Local code
uses nonblocking try-lock `0x40001a16` and unlock `0x40001aa2`, acquires both
source/destination before acceptance and refuses a busy save. This is
**SOURCE-PROVEN only in this review**; no new native mutex replay or hardware
test was run. Interrupt masking alone is not a task-level save transaction.
Do not call these helpers in a sequencer subscriber. A prospective shared
persistence API needs versioning, source/destination ownership and save/reload
tests, rather than copying any MAX padding format.

Root key `0x4000839e` (8 B), encoder `0x400083f0` (6 B), frame `0x40100992`
(8 B) and Scene smoothing call `0x400a4a7e` (6 B) are adjacent integration
knowledge, not a new timing source. Native encoder ids are 1..8, LEVEL is 9;
event fields +12 id, +16 delta, +20 pressed. Multiple mods must share one base
dispatcher instead of independently owning these sites.

## 7. Retained tests and hardware evidence: exact scope

These experiments share source checkpoint
`7f2dbade3480476cee8ba076cd102f789a22b6c0` plus separate local changes.
They are independent MAX images, not a combined firmware and not Modwerk builds.
Forty retained artifact/source/log hash checks matched on 27 November, including
both protected baselines. Old suites were **not** rerun merely to add new dates.
The private audit retains absolute paths, expected/actual hashes and XML/logs.

| Research | Actual result / scope | Evidence limit |
| --- | --- | --- |
| ARP RC10 / v1.4.0 | Retained `docs/ARP-TESTING.md` reports 512 selected passes (507 ARP +5 integrity), plus user cursor-speed/hardware PASS. | Historical report; those 512 logs were not independently rehashed in this run. Detailed hardware duration/coverage unspecified. |
| Beat Repeat | Historical commit `9072526`, `mods/beat-repeat` and `tests/test_beat_repeat.py`, includes native release/advance replay. Removed from current MAX; stock behavior restored. | Source/history evidence; no historical pass total or hardware qualification asserted here. Fresh branch replay above is independent of its implementation. |
| Song Morph P1 | Authenticated retained exact-final JUnit: 388 passed, 1 skipped; 3 obsolete-fixture comparisons explicitly deselected. Includes 15 Morph tests for native rows/repeats/queued transitions, save scratch, reload/rebinding, isolation and row edits. User confirmed this image installed and positively reported the musical/interaction result. | USER HARDWARE-PROVEN limited to reported use. Power-cycle recall, all controls, timing/headroom and endurance remain UNTESTED. Exit-confirmation transient cleared after PLAY; cause unreproduced. FX-track selection confusion resolved through normal controls. Neither is evidence of a delivered firmware fix. |
| Track Dialogue P0 | Retained ledger reports 87 distinct focused passes: 45 prototype +42 existing boundaries. Logs/source/image all rehashed. Initial prototype log has 42 passes; later two passes plus one corrected lock-precedence pass complete the 45. Earlier failures remain in logs. | EMULATOR/source/package evidence; hardware untested, no full-suite claim. Do not sum every rerun as distinct tests or call raw requests accepted triggers. |
| Pattern Sculpt P0 | Authenticated retained JUnit: 23 passed, 0 skipped/failures/errors. Source and image identity tied by fixture; tested main section `b03b13d71c4f0f88bbf2a38b8ce2a9682c152945240d447a7fd4d573688091af`. Native complete-trig moves, locks, rollback, publication, same-slot decode, clipboard ownership and fresh serialization covered. | EMULATOR/source/package evidence; no hardware, actual filesystem or musical qualification. |

Private candidate SHA-256 identifiers (identity only; **no firmware is supplied**):

| Image | SHA-256 |
| --- | --- |
| ARP RC10 / v1.4.0 | `d57a1552546f3c5e60413a55c395710bda3f25b2ec09be499d674efdb5310c0c` |
| Song Morph P1 | `c87f90f60a11cf643feca9089f7b99e9809c71385f504f885bc4bf641d9f83ac` |
| Track Dialogue P0 | `091a76839b7ea00935bce18c99e47a885f40bfb211f192c3f17be4443c784fa7` |
| Pattern Sculpt P0 | `b6fc7b365dcd8a7f22963ff92289cfc1e6b2c1859360b891e5e7feab16fa005c` |

Track Dialogue's OFF/idle/trigger/decay hook samples were 22/98/124/123 emulator
instructions. ARP's retained report samples inactive 22, twelve active idle 850,
twelve due notes 10,742. These are **instruction counts, not cycles, worst-case
execution times, hardware CPU percentages or deadline proof**. The shared bus
must budget dispatch plus every subscriber and both native timing contexts.

## 8. Recommended shared-provider boundary and next proof

1. **One owner for each native site.** The base/shared dependency owns guards,
   displaced-instruction replay, subscriber order and conflicts. Check every
   site against Synfact and the chosen resident base before installing it. These
   guards authenticate stock, not an already-patched base. Do not allocate event
   indices or claims from this research document.
2. **Expose distinct semantics.** Native ordinary-step preparation/advance;
   timed event request/transform; post-acceptance audio trigger-mask/effective
   frame. Keep generator-before-effect ordering compatible with existing
   `seq-events` concepts where applicable, but map both native reads and
   condition/probability/lock/MIDI fire stages before promising that full API.
   A post-iteration callback or accepted bit mask cannot fill all eight stages.
3. **Keep interrupt handlers bounded.** Preserve live registers, CCR/X, stack,
   native continuation and EMAC state or prove generated code avoids EMAC.
   Prologue/SP-relative arguments and PC-relative branches require explicit
   replay. Whole instructions and matching hashes alone do not prove absence
   of inbound edges. No UI, filesystem, waiting mutex or unbounded allocation
   in the real-time dispatcher. Publish versioned snapshots to task context.
4. **Define lifetime before mutable callbacks.** State generations on stop,
   reset, flush, project/Kit/pattern replacement and same-slot decode; bounded
   event-pool failure behavior; retained lock ownership; reentrancy and exactly
   once cleanup. Ordinary track selection is not a pattern replacement.
5. **Separate editing and persistence.** A stopped task-context transaction may
   use native helpers with readback and rollback; it is distinct from transient
   playback transforms. Put durable module data behind an owner-reviewed schema,
   not undocumented padding or pointer identity. Keep stock projects readable.

The next useful engineering step is an **owner-coordinated design/ABI review**
against #1922 and current shared-dependency policy, followed by a read-only
instrumented provider on qualified memory. No implementation GO is issued here.
Before asking a musician to test it, offline checks should cover trampoline
register/CCR/EMAC preservation, disabled/not-due/length-1/reset/rearm semantics,
all speeds and lengths, two step reads, queue exhaustion/flush, stale-generation
cancellation, native mutes/locks/conditions, MIDI and pattern/Song transitions.

Only then would one short hardware test resolve the real clock/phase question:
log native versus provider events through an odd-length pattern with mixed
track speeds, swing/microtiming, stop/start, a pattern change and a Song-row
change. Require exact provider build/hash and one-to-one expected observations;
do not ask for a flash of an unchanged MAX image to validate Modwerk. This is a
future qualification plan, **not a request to test or flash now**.

## 9. Provenance and distribution boundary

Research was read from current local ARP/Scenes, historical Beat Repeat, frozen
Song Morph P1, separate Track Dialogue and Pattern Sculpt worktrees, and current
Song Mutations source; native facts were checked against the identified stock
image. Local source paths are `source/Synthack-OS/mods/<module>` and corresponding
`tests/test_*.py`; public Modwerk references above are pinned separately.
The research copy does not claim these working trees equal an upstream release.

REA admitted and hashed the raw m68k target but its available Windows provider
could not return native procedure assembly; no REA analysis evidence is claimed.
The existing ColdFire listing and original bounded Unicorn diagnostic supplied
the new checks. No tooling installation, firmware build, device operation,
push, PR, board post or message to another person occurred.

This packet transfers **facts, identities, limits and design recommendations**.
It transfers no DigiKit-derived source, translated implementation, hook wrapper,
loader, firmware bytes or recovered tables into Modwerk. Existing MAX/DigiKit
component licences remain attached to their original work; research does not
relicense them or claim clean-room implementation. Any later source contribution
needs function-level provenance and Modwerk-owner review separately. Publication
of even this documentation awaits Kári's review and authorization.
