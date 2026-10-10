# Octatrack: one Elekloader builder and fewer power cycles

## Direction and current boundary

The owner chose Elekloader as the core builder for every machine on 9 October
2026. Machines extend it with profiles, cores, linkable modules and resource
rules. Elekloader owns stock identification, linking, patching, allocation,
packing and output verification. A machine-specific whole-image composer
wrapped in a format-1 `.elemod` would retain the second builder and does not
meet this goal.

The owner explicitly requires the builder to run natively in the browser.
Use the TypeScript kit in a Web Worker for firmware construction and
verification. Native C/DSP compilation prepares linkable packages for authors;
the upstream Python builder is an offline independent comparison. Neither is
a runtime dependency for browser users, and stock firmware stays local.

[`machine-build.ts`](../src/engine/elekloader/machine-build.ts) is the shared
Modwerk entry point. Digitakt and Digitone use it today, with their existing
catalogue and download behaviour. The private Octatrack verifier uses the same
kit service and format-2 linker. The public Octatrack build still uses the
approved Octabam-derived composer until its replacement preserves all current
features and passes qualification. Octabam remains useful as a source library,
emulator and independent reference after its production composer is retired.
Catalogues and release authority remain separate; see
[the developer workflow](DEVELOPER_WORKFLOW.md#separate-catalogues-and-current-builders).

The kit is unchanged at **0.5.0**, commit
`3acac10ea86882a2ea51c9377ac6bd58fc4fec57`, protocol 1. This migration does not
change published module versions, catalogue pins or hardware evidence.

## Actual private build evidence

The upstream source converter was run against Modwerk source `ae8a1d0` and the
owner's local original OS 1.40C. Its eight successful ColdFire source ports
were **Preview Vol, Repitch, Scale Quantizer, FM Synth, CC Map, VECTOR,
Play Modes and Recorder Loop Fix**. Each passed the converter's native linker
reference checks. These are development packages, not approved releases.

The kit's TypeScript service and the pinned upstream Python builder then ran
**37 selections**: core alone, each of those eight modules with core, and every
pair. **35 produced byte-identical complete `.bin` and `.syx` files**; both
implementations refused the other two. Quantizer + Synth duplicates included
quantizer code; Synth + Vector duplicates included vector code. The verifier
compares the refusal details as well as accepting the same outcome.

Every successful file was saved outside Git and read back to verify its hash.
The decoded MAIN image and version also matched Python. Input firmware and
source packages remained unchanged. These comparisons use Elekloader's
format-2 linker directly; the verifier never imports the Octabam composer.
They establish Python/TypeScript parity, **not behavioural parity with the
public Octatrack builds or hardware safety**. No emulator, physical reboot,
live sampling, timing or stress-project result has been recorded for these
new candidates.

Adding upstream **dspbus 0.1** and **dsp-tone 1.0** extends the same matrix to
**56 selections: 45 byte-identical saved builds and 11 matching refusals**.
The original two duplicate-code refusals remain; nine additional selections
correctly refuse the tone without its required DSP bus. Core + DSP bus + tone
builds successfully. This exercises actual DSP source assembly, relocation,
event-table linking and the kit's dependency checks, not just ColdFire code.
The tone replaces input A and the bus removes SPATIALIZER; these private
examples are validation inputs, not proposed production defaults.

The private [`build_ports.py`](../sdk/machines/octatrack/elekloader/build_ports.py)
recipe registers Modwerk's internal USB MIDI platform dependency explicitly
with the pinned converter. It does not move or rewrite the imported source.
USB MIDI, USB AUDIO OUT TRACKS MAIN CUE and hook-bus CC Map passed **3, 7 and
3 native source checks**, respectively. The upstream converter already serves
the 18-byte USB device descriptor from a relocated copy; its protected
original remains stock and the sole responder reference is guarded.

With these USB packages, hook-bus CC Map, the other seven ColdFire ports and
the experimental DSP bus/tone, the TypeScript/native matrix covers **79
selections: 65 byte-identical saved builds and 14 matching refusals**. USB
Audio carries its USB MIDI implementation and correctly refuses a second copy;
the existing duplicate-code and missing-DSP-bus refusals remain. The verifier
gives Python the kit's filename order so conflicting owners and spans must
match exactly, rather than relaxing refusal comparison. A larger explicit
selection also builds identically: the Modwerk base, USB Audio/MIDI, hook-bus
CC Map, Preview Vol, Repitch, FM Synth, Play Modes, Recorder Loop Fix and
DSP bus/tone. These remain static firmware source ports, not packages that
the runtime upload controller can execute.

The private Modwerk core source recipe now compiles logger 0.2.0, startup
artwork and the unwired upload controller directly with Elekloader's SDK.
The shared TypeScript service and native reference produced identical saved
core-only `.bin` and `.syx` files. This prototype's decoded MAIN hash is
`e2fe2804a780c58ee4c40c6b5e96c961963cdfbca03413747a2be038a1e0e7ea`.
The identity describes the core-only configuration; it is not a catalogue
release or a flash candidate.

An isolated emulator built from this branch passed its EMAC and peripheral
gates. Its mc68k source matched all 72 tracked files at the repository's exact
pin. A private probe of the TypeScript-built MAIN passed RTOS handoff, run
image copying, BSS clearing from poisoned RAM, preservation of every byte in
the 8 KiB retained/I/O region, draw-gate initialization, data/address-register
and stack restoration, and stock task scheduling. A separate MKII-panel
emulator run with the startup animation enabled also reached the scheduling
gate. These are bootstrap smoke checks without a card/project or DSP
execution. They do not establish physical reset retention, logger card I/O,
audio, live sampling, cache behaviour or USB module loading; hardware remains
untested. Stock-bearing outputs and the detailed probes remain private.

The TypeScript-built base plus USB Audio/MIDI also passed **27 emulator USB
checks**: high/full-speed enumeration, storage INQUIRY, MIDI receive/transmit,
20-channel synthetic source mapping, packet sizes, stream stop/restart and
the current 64-frame cushion. The imported USB verifier initially failed
three assertions: two still expected the earlier 512-frame cushion, and one
read the missed-host-poll log before buffered output was flushed. A private
guarded test adapter used the source's 64-frame target and line-buffered
emulator output; both the original failure and adapted success are retained.
This is source-specific emulator evidence with synthetic taps, no card/project
or DSP execution. Real USB timing, audio, storage, cache behaviour and hardware
remain unqualified, and this image has no module-update transport.

### Reproduce locally

Use Node 24, GNU `m68k-elf` tools and a clean Elekloader checkout at the kit's
exact commit; `npm run upstream:tools` keeps one in
`~/.cache/modwerk-upstream/elekloader`. Supply your own original firmware. Convert selected source with
upstream `python3 -B -m elekloader.sdk.octabam --octabam /path/to/modwerk/sdk/octabam
--stock /private/stock-1.40C.syx --module NAME --out /private/source-ports`.
The converter also emits core 0.3. Read its check results: a file emitted before
a failed check is not a successfully qualified port.

```sh
npm run octatrack:elekloader:verify -- \
  /private/stock-1.40C.bin /private/NEW-proof-directory \
  /path/to/pinned-elekloader \
  /private/source-ports/core/core-0.3.elemod \
  /private/source-ports/octabam-previewvol-SOURCE.elemod \
  /private/source-ports/octabam-repitch-SOURCE.elemod --pairs
```

The output directory must be new and outside every Git checkout. `proofs.json`
records package pins, complete output hashes, saved-file verification,
refusals and explicit limitations. Keep it and the images private; the report
does not confer release approval. The helper refuses format-1 wrappers,
changed package pins, a mismatched protocol or stock identity, colliding file
names and automatically selected files outside the supplied pins.
`--combined` additionally compares the complete explicitly supplied selection;
`--pairs` compares each pair. Neither admits unpinned dependencies.

## Existing upstream DSP work to extend

The inspected current Elekloader `main` is the kit-pinned commit. Pina has
already merged the [DSP linker/SDK](https://github.com/irpina/elekloader/pull/53),
the [DSP hook bus](https://github.com/irpina/elekloader/pull/54) and
[USB Audio In conversion onto that bus](https://github.com/irpina/elekloader/pull/55).
Use these interfaces and extend their resource model; do not recreate DSP
linking in Modwerk's app or wrap the previous composer.

The format already has `.dsp.<payload>` program sections, word-addressed symbols,
`dsp24` relocations and ordered DSP collections/subscriptions. The SDK assembles
at two origins and refuses packed addresses it cannot relocate. The linker
places code/tables in a claimed harvest area and rejects overflows, overlaps
and references across incompatible ColdFire/DSP address domains.

`mods/dspbus-ot` supplies `ev_dsp_rx` at the head of the audio frame on core 0.
It currently frees **261 P words** by removing SPATIALIZER from both choosers;
core 1's existing SPATIALIZER code remains. This is build-time program placement,
not a general runtime allocator or USB updater. The one event is useful for
USB input injection; it is not yet the complete per-track FX/machine ABI.

Upstream's own `tests/test_octatrack.py` was also run privately with both stock
containers and the real DSP assembler: **22 passed, 0 failed, 3 skipped**.
The skips reported no cross compiler for three C-based SDK examples in that
test environment. They are not passing results. Upstream emulator/hardware
reports belong to their stated images; they do not qualify Modwerk's new core.

### DSP memory and transaction requirements

The installed catalogue and the currently active instances are different
resource sets. Share immutable code/tables once per algorithm **per core**;
allocate mutable state and delay buffers per track/slot. Admit each active
Part/project against the real memory and processing budget, including loading
and transition overhead. A larger catalogue alone must not require every
algorithm to remain resident, and unloading unused code alone does not reduce
the processing already spent on active algorithms.

The owner's explicit priority is to support as many module combinations as
possible through dynamic DSP loading and runtime allocation/relocation. Module
code, data and per-instance buffers must use allocated P/X/Y locations with
checked relocation records, symbol references or ABI handles. Remove baked-in
module allocation addresses as source ports permit it. Resolve and share
compatible immutable dependencies per core, while keeping each instance's
mutable state and buffers isolated.

Minimize static reservations throughout the design. Allocate for active code,
instances and operations, then reclaim memory when its owners safely retire.
Avoid permanent banks or quotas assigned to particular modules, tracks or FX
slots, and permanently earmarked staging/rollback banks. Obtain transition
storage from the runtime pools for its required lifetime, retaining rollback
resources until the transaction is safely accepted. Keep allocation work out
of the audio-critical path unless a bounded method has been proved.

Audit every software reservation, including stock buffers, loader/bus workspace
and recovery storage, for safe dynamic allocation, relocation or lifetime
sharing. Use one ownership ledger across the verified pools and physical RAM
aliases. Start the ColdFire side from the fixed USB and file-layer buffers
upstream has named (see [the USB constraints](#what-the-imported-usb-stack-leaves-for-the-vendor-interface))
and verify each entry. Each remaining fixed reservation needs a recorded constraint and an
explanation of what would permit reclaiming or moving it. Hardware register
addresses and proven architectural constraints are genuine fixed locations;
current stock/kernel regions must remain protected until their dependencies
and a safe replacement have been verified. Existing fixed layouts are inputs
to this audit, not the intended permanent allocator design.

Admission must account for real capacity, alignment, fragmentation, processing
headroom and old/new transition residency. Avoid unnecessary fixed module-count
or combination restrictions; explain actual ABI, resource or hook conflicts
before changing the live set. Test pairwise and larger selections, load-order
variants, multiple instances, repeated load/replace/unload and memory reuse on
both cores. Include exhaustion and rollback tests that prove live allocations
survive failed admission and retired allocations are reclaimed only after both
cores confirm retirement. Broad combinability is a qualification target, not
a claim that every legacy fixed-address module already supports this ABI.

### Prevent recurrence of the reported memory failures

The owner supplied the Air Chorus investigation record on 9 October 2026 as
an explicit prevention requirement. It describes stock shared-data collisions
in T3/T7 FX2 buffers, limits on per-instance X state, substantial table/program
footprint, and fragmentation refusing Chorus + Analog BD + MiniVerb after other
combinations had been made to fit. It also records a packed-table decoder
failing audio parity before correction. These are regression inputs for the
new SDK/allocator; the record does not qualify our new loader on hardware.

For the dynamic ABI, turn these classes of failure into mandatory admission
and qualification gates rather than discovering them after deployment:

| Failure class | Required prevention and regression |
| --- | --- |
| Stock/shared-data overlap | Track physical ownership across both cores and P/X/Y aliases, including stock buffers and dispatcher state. Check actual linked ranges and effective access bounds against the ownership plan before publication. Protect surrounding stock X/Y regions in native tests and verify them after stress runs; detecting a canary change is a failure, not proof that corruption was prevented. |
| Per-instance state/buffer overflow | Derive code/table sizes from compiled packages and check declared mutable-state/buffer requirements, alignment and modulo-addressing constraints. All permitted parameter, warm-up, wrap, reset and legacy-state paths must stay inside the assigned extent. Every instance gets owned state; unknown access bounds or undeclared scratch use block admission. |
| Baked-in layout assumptions | Relocate internal references and check ring/index arithmetic against the allocated base, length and declared alignment. Qualify different valid placements and load orders on both cores; an old absolute address or address mask cannot silently stand in for an allocation contract. |
| Avoidable fragmentation | Place relocatable code, tables and buffers according to their actual constraints, sharing immutable dependencies and reclaiming retired allocations. Try alternate valid placements and prepare a new layout at the agreed stopped safe point while preserving rollback. Test known feasible fragmented layouts against a reference feasibility check; an avoidable layout failure is an allocator regression. |
| Incomplete combination coverage | Retain Chorus + E-Verb, Chorus + Analog BD and Chorus + Analog BD + MiniVerb as named cases when their ports support the ABI. Add larger selections, boundary-sized requests, track/slot/instance permutations, randomized load/unload histories, fragmentation, reuse and cross-core retirement. Test intentional exhaustion and preserve failed histories as reproducible cases. |
| Footprint optimization changes behavior | Compression, table sharing or other representation changes need exact decoded-value tests and audio/control/full-delay-range parity under the stated baseline, plus a new CPU/DSP cost measurement. An app test pass or a smaller package alone is insufficient. |

The shared builder's admission plan and the device's verified resource state
must agree for the exact package set and current generation. Validate the
entire allocation/relocation/initialization transaction before publishing any
dispatch changes. A failure leaves the active set and its allocations intact;
stale messages, rollback and interrupted uploads cannot free or repurpose live
memory. No public arbitrary memory-write interface is part of this design.

Expose a bounded memory-accounting report through our device interface:
owned/used/free space, largest usable extents, sharing and per-instance costs,
and transient staging/rollback requirements by pool/core. Distinguish total
capacity exhaustion, genuine contiguity/alignment constraints, transition
headroom, incompatible ABI and allocator placement failures. Physical capacity
can still prevent a combination; that must be a precise pre-activation refusal
with the previous configuration usable. The acceptance target is no ownership
violations or avoidable placement refusals in qualified workloads, enforced by
these regressions and the automated physical-device tests. These gates remain
planned work while this branch is frozen.

| Resource | Contract needed for the module-set loader |
| --- | --- |
| Private P | Account for current kernel, transport, bus and stock shared-helper ownership and audit these reservations for safe relocation/reuse; allocate and relocate incoming code without moving or overwriting executing code. Share identical dependencies instead of including duplicate Quantizer/VECTOR implementations. |
| Private X/Y | Separate immutable coefficients, mutable state and per-instance buffers. Declare worst-case sizes, alignment, initialization, reset and retirement. Preserve the existing FX1/FX2 base convention until source ports remove that dependency. |
| Shared RAM | Use one physical ownership ledger across both cores and P/X/Y views. An address range cannot be allocated independently in each view. Pin all stock, recorder, audio-frame and transport uses before treating it as free. |
| Transitions | Account for incoming staging plus outgoing code/state/buffers until both DSP cores acknowledge that old users have retired. Insufficient transition space must leave the active set intact. Cancellation and stale acknowledgements must not release live memory. |
| Processing | Bound active instances and loader/verification work under full load. Keep executed instructions, modeled cycles and actual chip timing distinct. Live sampling/recording must remain in the qualification matrix. |
| Existing modules | Port direct DSP/OS hooks, stock-helper dependencies, shared buses, custom machines and delay-buffer lifecycles to explicit ABI/resource contracts. The generic insert model cannot silently admit a module with a different contract. |

The DSP56721 manual specifies shared RAM `0x030000–0x03ffff` as the same
physical storage in both cores' P/X/Y views. Its default private map has 8K
program, 36K X and 48K Y words; the documented 16K-program configuration keeps
36K X and reduces Y to 40K. Increasing P therefore consumes data/buffer
capacity, rather than creating free memory. See the
[NXP reference manual, chapter 3](https://www.nxp.com/docs/en/reference-manual/DSP56720RM.pdf).
These are chip capabilities, not qualified free pools on the OT. Do not change
the memory map until boot clearing, stock buffers and recorder/audio operation
have been checked on both cores and hardware.

The retained `sdk/octabam/platform/dsp-dynload-transport` experiment is a useful
reference for P residency, staged uploads, acknowledgement/retirement and Y
buffer planning. It is outside the shipping path. Its host planner's 12 tests
pass on the inspected source; separate strict C checks passed for buffers,
manager, transfer, selection, preflight and publication. The allocator test
fails compilation on missing `buffer` initializers, and the complete controller
check stops at stale generated `transfer.s`. No experiment was enabled or
regenerated. These gaps and the documented unsupported publication/ABI paths
must be resolved before reusing its runtime; old model/host evidence is not
hardware qualification for the new Elekloader base.

### Milestones in the emulator

On 10 October 2026 the private base gained its own USB configuration (stock
mass storage plus the vendor interface, 41 bytes) and the EP0 glue
([recipe](../sdk/machines/octatrack/elekloader/README.md#usb-vendor-interface)).
Unmodified stock fails the same checks.

1. **Read-only IDENTIFY.** Answered in the USB ISR with the base's exact
   configuration identity; refusals stall; mass storage still answers.
2. **Frames to a read-only controller.** Disassembling the stock USB ISR
   (local only) showed how to receive SUBMIT's data stage without the
   layouts stack's spin. Stock tracks EP0 in a state word (10 while an IN
   stage is pending, 11 when idle) and consumes EP0 OUT completion bits in
   its loop. In state 11 with no awaited OUT descriptor that is harmless, and
   a descriptor with interrupt-on-complete raises the interrupt again, so the
   base finishes the transfer from its descriptor at the start of the next
   transfer path. Stock's own USB ISR already calls the kernel's `post`
   (to the mass-storage and sys queues), and the engine ignores message
   opcodes above 45, so a private `0xFF` message wakes the engine safely into
   its idle hook. A HELLO now travels SUBMIT → data stage → engine task →
   controller → RESULT; ENTER is refused by a backend that refuses every
   change; a bus reset keeps the session.

3. **One runtime module without a reboot.** The backend runs one
   position-independent ColdFire module on core-ot's 60 Hz tick: load,
   trial, accept, replace, roll back and remove over USB, with activation
   only while nothing plays or records, and a bus reset mid-staging leaving
   the active module running. Stock sets no instruction ACR and its CACR
   (`0xa40ce000` on every write) caches instruction fetches even through the
   uncached alias, so new code is followed by an instruction- and
   branch-cache invalidation with that value.

Octabam's bench passed 27 checks at both speeds, and the unmodified browser
`UsbVendorTransport` and `UploadSession` passed 7 against the same build:
interface discovery from the device's descriptors, IDENTIFY, HELLO status,
and the whole module lifecycle above with its effect read back from the
module. The emulator models no caches, so the invalidation is unverified
until hardware. This is emulator protocol evidence only.
The emulator has no packet timing, so the race between priming and the
stock loop is exercised only in its worst ordering; no host OS driver,
WebUSB claim, cache behaviour or hardware result exists yet.

### First hardware runs (owner's MKII, 10 October 2026)

The private base booted on the owner's MKII from a card OS upgrade and ran
for hours across several sessions. Driven from the terminal through
[`usb_bridge.py`](../sdk/machines/octatrack/elekloader/usb_bridge.py) (libusb
carrying the emulator bench protocol, so the same browser client and
lifecycle run unchanged), the runtime-module lifecycle passed on the unit:
IDENTIFY, HELLO, the 60 Hz tick, module A loaded, run in its trial and
accepted, replacement B run and rolled back to A, removal, and module C
running its own code from the slot that had just run A (no stale
instructions after the cache invalidation). 56 data stages were primed and
completed with no refusals. These are protocol and lifecycle results for a
test module; audio, projects, live sampling and DSP were not exercised.

Two stock USB behaviours the emulator does not model surfaced and are now
handled:

- **A reply of exactly 64 bytes** (one full EP0 packet, as IDENTIFY and DIAG
  were) leaves the controller holding a zero-length packet the host never
  reads. It answered the next IN request with 0 bytes, and stock's EP0
  handler stayed in its IN-pending state (10). When the host then finished
  the transfer, stock's interrupt handler looped until the next request: a
  probe that ended on such a reply froze the unit until a power cycle.
  Replies are now never a multiple of 64 bytes (IDENTIFY 72, DIAG 68, checked
  at compile time).
- **Stock's EP0 state was 10, not idle,** when SUBMIT arrived, because a new
  SETUP can clear the previous IN completion before stock processes it. The
  base now takes EP0 into the idle state for its own data stage, the state
  in which stock's loop handles the completion harmlessly.

With both fixes (`usbtest3`, base `66647c8a…`) installed the same day, the
lifecycle passed seven times in a row with no host workaround: over 250 data
stages primed and completed, no refusals, no abandoned stages, and every reply
at its full length (IDENTIFY 72, DIAG 68).

### Hooks for real modules, reusable on every machine (10 October 2026)

The loader is now machine-neutral, in
[`sdk/runtime/loader`](../sdk/runtime/loader/README.md). Every machine
Elekloader supports has a ColdFire CPU and a hook bus with tick, draw, key
and encoder events. A module is plain C with any of those four handlers, its
own data and bss, built by `build.py` into a package (ABI 2) that the loader
relocates into a slot. A machine supplies only the glue: when activation is
safe, its uncached alias, its cache invalidation and trampolines from its
bus (the Octatrack's is `runtime.c`, about 60 lines). The first real module
is Elekloader's hello-marker as a runtime module (`examples/hello.c`): 92
bytes, 4 relocations.

`usbtest4` (base `06dc5403…`) carries it and passed the flash-safety check.
In the emulator the client lifecycle passed, and the example loaded, ran and
was accepted through `npm run device -- --emulator`. The bench check passed
in 7 of 8 runs; the one failure was on a cold first start and did not recur.
The hook dispatch, relocation and bss are host-tested only: `ot_emu` takes no
panel input while it holds the USB bench, and the emulator does not show the
composed frame, so the key, encoder and draw hooks need the unit.

On the owner's MKII the same day, `usbtest4` passed the client lifecycle,
and the example, loaded over USB without a reboot, drew its square in the
screen's top-right corner (seen by the owner) and counted exactly the 5 key
presses made, and 98 encoder events while the owner turned an encoder
freely (not compared with a known number of detents). The module was then
removed over USB.

### Catalogue modules: patching stock code at load time (10 October 2026)

No catalogue module runs on the hook bus alone: each patches stock code at
sites. The loader (package ABI 3) now applies and removes those patches on a
running unit, so modules converted by Elekloader (`build_ports.py`) load
without a reboot. The [loader README](../sdk/runtime/loader/README.md) has
the rules; in short, it writes RAM only (the device itself refuses any site
outside the stock OS image's RAM copy or inside the bootloader copy the OS
can re-flash), only over the exact stock bytes expected, with interrupts
masked, and only when no paused task's stack or saved registers point inside
a site. Module memory is never reused before a reboot, and a power cycle
restores stock.

`verify_static.py` links each module statically with Elekloader and requires
the runtime package, placed at the same address, to match byte for byte.
PREVIEW VOL (2 sites), RECORDER LOOP FIX (8 sites) and PLAYMODES (35 sites,
75 relocations) match; the check caught a builder bug (site bytes stored
before their relocation) on the way. In the emulator with `usbtest5` (base
`5b170b8d…`, rebuilt from the commit, flash-safety check passed): the bench and client lifecycle
passed, PREVIEW VOL loaded with both jumps in RAM pointing at its code 0x12
apart as statically linked, its rollback put the stock bytes back, and
PLAYMODES loaded, ran and was accepted.

On the owner's MKII the same day, `usbtest5` passed the client lifecycle,
and PREVIEW VOL, loaded over USB without a reboot, made a sample preview on
a turned-down Flex/Static track play at the default volume (heard by the
owner). Removed over USB, the same preview was quiet again: the first
catalogue module whose patches to stock code were applied and undone on a
running unit. Not supported:
data-table sites, modules that add to the core's tables (CC MAP), DSP
modules.

### Working on the unit safely (owner requirement, 10 October 2026)

Development and tests on the owner's unit must never brick it:

- Flash changes only when the owner installs an OS from the card, and only
  builds that passed `check_flash_safety.py` (bootloader copy identical,
  every change inside a declared site). Recovery stays the Startup Menu over
  DIN MIDI with the stock `.syx`.
- Everything done over USB is RAM-only and enforced on the device: runtime
  modules, their hooks and stock-code patches, all gone at power-off. The
  vendor interface has no memory read or write command.
- A crash or freeze from a bad module costs a power cycle, never the flash.
  Unplugging USB rolls back anything not accepted.

### Reference: Octabam's REMIX SWITCH

Sam's open [Octabam PR #655](https://github.com/sambanks/octabam/pull/655)
(head `879cecb`, 10 October 2026; from sanderlegit's #542) switches the unit
to a whole OS image from the card: it loads the image into a stage in SDRAM,
parks both DSP cores and soft-resets into it, without writing the flash.
That is a reboot, so it does not meet the no-reboot goal; the owner chose
on 10 October 2026 to use it as a reference, not as Modwerk's mechanism. It
is not vendored. Its README marks what was measured on an MKII on
29 September 2026 and what was not (endurance, caches, MKI).

| Technique in REMIX SWITCH | What it informs here |
| --- | --- |
| DSP park: host command `$0F` on stock's unused vector `P:$1E`, a handler in the run of dead vectors from `P:$20` that stops DMA 0–5 and both ESAI ports, then a boot-ROM-style loader (count, address, words, jump) | Reloading DSP code on both cores without a chip reset, for activation. Its measured traps: clear HPCR bit 7 or every host echo reads `0x010101` and the stock record sender silently abandons the upload; drain stale words from each core's host receive register first. |
| `verify_dspvectors.py` audits on every build that those vectors are self-jumps no armed DMA, ESAI or interrupt can reach | Code in dead vectors is safe only under that audit. Any P allocation that uses them needs the same check. |
| Stage at the top of the platform reserve, `0x49200000`–`0x49495de0` (uncached), which stock never touches and which survives a soft reset | A ledger entry and a staging candidate, not free memory: the reserve is shared with every platform runtime. |
| Before running new ColdFire code: caches off, I-cache and branch cache invalidated, the bootstrap's exit `CACR` (`0x0008c000`) restored | Activating relocated ColdFire code needs explicit cache invalidation; the open cache-handling item above. |
| The card scan saves and restores the stock browser's name pool and cache around its own listing | Needed if packages are ever read from the card. |
| Soft reset (`RCR` `SOFTRST`) after parking the DSPs; the unit's own panel handshake first | Not the routine path. A possible recovery for base changes without a power cycle, if qualified separately. |

## Work required before public cutover

| Area | Observed gap / next implementation |
| --- | --- |
| Mandatory infrastructure | The [private base source recipe](../sdk/machines/octatrack/elekloader/README.md) extends upstream core 0.3 with logger/startup and the unwired upload controller. Qualify its guarded stock replay, retained/I/O memory and bootstrap; integrate exact selected-module identity. Old source-specific exceptions do not qualify a different core. |
| Mute Modes | The pinned converter and its native check append tables, while this module inserts the PERSONALIZE row at index 2. The private recipe explicitly refuses that unsupported layout. Its callable `Linked.reference` also reaches a tuple-only path. Support and independently verify both contracts before accepting the port. |
| MIDI Scenes | Its writes inside the bootloader-copy range are refused. Port the source to a safe layout; do not weaken the protected-range rules. |
| Poly8 | Conversion emits a package, but native linking fails on unresolved dependencies. Supply explicit source dependencies and remove duplicate shared implementations. |
| DSP / FX | The converter refuses custom DSP/FX-menu modules. Extend upstream's existing DSP linker/bus with stock-free source recipes, general P/X/Y resource accounting, per-track dispatch, descriptors and choosers on both cores. Do not run the old composer behind an `.elemod`. |
| USB Audio | The private source port now registers the internal USB MIDI dependency and uses upstream's guarded descriptor clone. Static parity and the adapted emulator USB checks pass; hardware, cache, real-host audio/MIDI/storage compatibility and the module-update transport still require implementation/qualification. |
| Publication | Add reviewed source-built catalogue packages, preserve configuration ids/versions and exact logger identity, verify all offered selections/refusals and qualify the final images before routing the public OT build to the kit. |

Core 0.3 reserves only the 6 KiB pages occupied by its RAM image, rather than
core 0.2's fixed 10 MiB. This does not prove a DSP speed improvement or that the
logger, live recording and the full Modwerk catalogue fit the same smaller
reservation. Their exact RAM and retained/I/O regions need separate accounting.

## USB and reducing power cycles

Read-only enumeration on the owner's stock OT in USB disk mode found Elektron
VID `0x1935`, PID `0x0002`, USB high speed and a mass-storage interface (class
`0x08`, subclass `0x06`, protocol `0x50`). No card contents were changed and no
USB commands or firmware transfers were sent.

WebUSB protects mass-storage and audio interfaces; a browser cannot claim the
stock card interface as an updater. A device-side vendor interface and update
protocol are required. See the [WebUSB protected-interface rules](https://wicg.github.io/webusb/#protected-interface-classes)
and [Chrome's WebUSB documentation](https://developer.chrome.com/docs/capabilities/usb).
No firmware flashing transport was found in the inspected pinned Elekloader,
Octabam or octemu source trees. This is a scoped source inspection, not a claim
that no other implementation exists.

The owner confirmed the first target is an **MKII**, with playback and live
recording stopped for activation. A dedicated upload mode is acceptable.
Routine module loading, replacement and removal must return to normal
operation **without rebooting or power cycling the instrument**. The one-time
base install and later base replacements are separate installation events.

The implementation target is a **recovery-capable base installed once**, then
selecting and loading complete module sets over USB, supporting as many
combinations as their declared resources and ABI permit. Use the same
Elekloader builder and extend its DSP support with runtime memory management.
Simply transferring complete OS images over USB would still need
the OT's existing restart/activation path. Hookbus subscriptions alone also do
not make linked modules safely replaceable while running.

The [upload controller](../sdk/runtime/upload/README.md) now implements the
bounded transaction and versioned frame decoder in freestanding ColdFire C.
Its fault backend tests staging, verification, trial playback, confirmed
retirement and rollback; all mutations require a complete device backend and
fresh session binding. It is not connected to USB or stock firmware and does
not execute packages. The TypeScript wire codec and serial browser session
client now pass 23 interoperability/fault scenarios against that real C
controller with a synthetic backend. The client keeps staging, publication,
trial playback, acceptance and rollback separate, verifies acknowledged
identities/transitions and stops its connection after unconfirmed replies.
This is not USB or module-execution evidence. The device implementation should
proceed in this order:

1. Add a bounded vendor USB interface alongside the existing interfaces,
   within the [constraints of the imported USB stack](#what-the-imported-usb-stack-leaves-for-the-vendor-interface).
   Start with identification, base/ABI identity, capabilities and a read-only
   status command. Keep stock MIDI recovery available and verify boot/USB
   behaviour on MKI and MKII.
2. Stage an update in a separate bounded region. Bind it to the exact machine,
   OS, base ABI, module set, lengths and hashes. Sequence chunks, verify
   readback, make retries idempotent and refuse unknown writes. Disconnect,
   malformed input, wrong base, overflow and failed verification must leave
   the active configuration usable.
3. Activate only explicitly supported runtime modules at a safe point, with
   playback/recording stopped, callbacks quiesced, DSP/cache handling proved
   and a valid previous configuration retained. Verify the active identity
   and rollback. Establish the RAM budget before promising two simultaneous
   runtime slots; do not assume dual-bank flash exists.
4. Extend the shared browser/hardware-test client with the same protocol.
   Report actual transfer, verification, activation and rollback states;
   reconnect alone is not evidence of a successful update. Test interrupted
   transfers and failed activation before enabling a public update button.

Initial hot updates must be limited to modules whose hooks, state and resource
ownership support this ABI. Legacy direct stock patches, base changes, USB
descriptor changes and unsupported DSP layouts can still require a complete
OS install and power cycle. Persisting a runtime selection across boot also
needs an explicit validated loader/storage design. These mechanisms are
**not connected to the device or hardware verified**. The controller is an
implementation component, not evidence that the runtime loader works on an OT.

For later hardware qualification, keep the exact candidate hash and record
boot, project/Part persistence, eight-track delays, A/B scene movement,
Flex recording/live sampling and both DSP-core behaviour under the owner's
stress project. Use actual reported results. A successful transfer or an
emulator boot cannot substitute for these observations.

### What the imported USB stack leaves for the vendor interface

Source inspection on 10 October 2026; nothing here was measured on hardware.
The imported stack drives the MCF5445x USB OTG device controller through
endpoint queue heads (dQHs) listed at `0x4ec94800`. Every source and the
emulator treat EP0–EP3 as the limit. EP1 carries mass storage, EP2 USB MIDI
and EP3 IN the USB Audio stream. EP3 OUT is the only free endpoint, and
upstream's USB Audio In uses it. That input path is what Sam's
device-versus-emulator capture needs (see the next section), so the vendor
interface should not take it.

The planned interface therefore has no endpoints of its own: a vendor-class
(`0xFF`) interface whose requests travel as vendor control transfers to that
interface on EP0, with each response read back by a control IN. The
[EP0 transport](../sdk/runtime/upload/README.md#ep0-vendor-transport-version-1)
and its browser peer now implement that protocol: one frame slot owned by the
engine task, sequence numbers that never execute twice, and positive refusals
the browser can retry safely. They are tested against the real controller on
the host only. These gaps must be closed before the transport can run on the
unit:

- The stock EP0 path has no control OUT data stage (milestone 2 below
  receives one in the emulator). The vendored "layouts"
  USB Audio stack (not the one the source port converts) takes a 4-byte data
  stage by polling up to 100,000 times (~10 ms) inside the USB ISR: returning
  first races the stock completion loop, which would take the data for the
  previous transfer's status OUT. A 4,148-byte frame needs a real receive
  path that tells the data stage from that status OUT, is bounded to the
  maximum frame, STALLs anything larger or out of sequence and never spins
  in the ISR beside the audio interrupts.
- USB Audio's `audio_ctrl_shim` owns the unknown-request STALL tail at
  `0x4001de64`, where it also answers the `0xc0/0x55` counters. Vendor
  requests need one dispatcher at that site that keeps audio's requests,
  not a second detour on the same instruction.
- `usb_ep0_send` fills only the first buffer page of its transfer descriptor
  unless `audio_ep0page_shim` is linked, so a response must not straddle a
  4 KiB page. Write responses through the uncached alias: the controller does
  not snoop the copyback cache. The existing `0x55` reply is sent from a
  cached address, so its counters may be stale (inferred, not measured).
- No queue exists from the USB ISR to the engine task that must own the
  controller, and the logger's engine idle hook is not periodic. Stock's own
  USB ISR calls the kernel's `post` (`0x40000c3c`), which masks interrupts
  itself; calling it from the frame path hard-crashed an MKI. The base now
  posts a private wake-up from the USB ISR (milestone 2 below); prove it on
  both models before any write command exists.
- Hashing up to 1 MiB cannot run inside a control transfer. The OUT request
  only queues the frame; the host polls for a response bound to that
  request's command and transaction. A busy slot refuses a new frame rather
  than overwriting it.
- Windows binds WinUSB to a vendor interface automatically only through
  Microsoft OS descriptors (1.0 through string `0xEE`, or 2.0 through a BOS
  descriptor with bcdUSB 2.01). Neither exists, and the device reports
  bcdUSB 2.00; adding either is a base change. macOS attaches no class driver
  to a vendor interface, so WebUSB can claim it; Linux needs a udev rule.
- Upstream's placement table ([Octabam PR #656](https://github.com/sambanks/octabam/pull/656),
  10 October 2026) names fixed USB and file-layer buffers in ColdFire DRAM:
  the dQH list, EP2 queue heads, descriptors and buffers, the mass-storage
  sector buffer and the file-layer staging buffer (`0x4ec94004`–`0x4ecd3000`,
  sizes unmeasured). They enter the ownership ledger; staging and response
  buffers are allocated against it, never placed beside them by assumption.
- Elekloader refuses two packages on one stock site and has no USB or
  engine-task event, so the base owns the configuration responder (its four
  table pointers and two length clamps) and the unknown-request tail. USB MIDI
  and USB Audio claim the same sites; they become base features compiled into
  it, which their descriptor changes require anyway.
- The emulator models EP0–EP3, transfers up to 8 KiB and no packet timing.
  Its source here cannot build as is: the CPU cores under `sdk/octabam/vendor/`
  and `remixes/` are absent, and the 27 USB checks used a private adapter.
  Emulator control-transfer results are protocol evidence only.

## Reusing Octabam's hardware tools

The imported `sdk/octabam/tools/hw/` already contains the tools Sam described.
Use them as developer-side test inputs to the loader work; they do not require
keeping the Octabam firmware composer. The shared user-facing builder remains
browser-native TypeScript.

| Tool | What it supplies | Integration boundary |
| --- | --- | --- |
| `rec.swift` | CoreAudio HAL capture of every input channel on a named device | Listen to the OT's output-only USB Audio module; no USB Audio In module is needed for this direction. Verify the selected device and channel layout rather than relying on the script's interface-name defaults. |
| `usb_counters.py` | Device-to-host audio ring counters through read-only vendor request `0xc0/0x55` | Pair counters with the audio capture. No interface claim or audio-driver detach is required. A stock image does not implement this request. |
| `usb_probe.py` | Sustained host-to-OT tone or stream-open/close churn, counter polling and JSON output | Requires the OT to expose a host audio-output device, supplied by USB Audio In. This is separate from the output-only package currently ported. |
| `ot_midi.py` | CoreMIDI CC, notes, transport and event monitoring | Reuse for project-driven test actions after selecting the exact port; it is independent of the builder and updater protocol. |
| `ot_spec.py`, `ot_bank.py`, `ot_project.py` | Test-project preparation, stored FX/defaults and parameter-lock inspection | Work on private project copies. Preparing a project is separate from proving that an old project loads safely on the candidate. |
| `ot_soak.py`, `ot_ladder.py`, `hw_sweep.py` | Stress, freeze/dropout and parameter-response measurements | Adapt the rig, channel selection and thresholds to the exact project. Several defaults assume Sam's external interface and MIDI rig. |
| `midi_flash.py` | Existing MIDI recovery flashing | Recovery remains a separate operation; this script does not implement runtime module loading without a reboot. |

Two host-tool faults are repaired before reuse: `usb_probe.py` no longer
shadows `Thread._stop()`, which caused `join()` to fail before the JSON report
could be saved on affected Python runtimes (reproduced on 3.9; 3.14 changed
the thread implementation); `rec.swift` scales Float samples in Double so a positive
full-scale sample cannot overflow `Int32` after Float rounding. The imported
files stay unchanged because the release source inventory fingerprints all of
`tools/`. The [hardware-tool adapter](../sdk/machines/octatrack/hw/README.md)
writes repaired copies outside Git, bound to the imported source hashes and
the reviewed output hashes. The SDK check runs synthetic poller/report/counter
regressions on those prepared copies. Where Swift is installed it also
executes the prepared recorder's PCM conversion block with synthetic
full-scale samples; this check opens no audio device. Compile the complete
prepared recorder separately on the developer's Mac before physical capture.

Sam Banks confirmed on 9 October 2026 that `tools/hw` holds his on-device USB
test tools. Modwerk's copy came from `repeat98/octamad` at `b8deefc`, and it
has diverged from `sambanks/octabam` in both directions. Against upstream
`a67a111` (10 October 2026), 16 of the 22 vendored files are identical,
including `rec.swift` and `usb_probe.py`: both faults above are still present
upstream. Six differ in comments, documentation paths or constants, and
`usb_counters.py` disagrees on the USB Audio In counter list (28 names here,
15 upstream; the copy here also has that tuple pasted into its docstring).
Match its `--in` mode to the exact USB Audio In source before trusting it.
Upstream has two tools Modwerk lacks:

| Tool | What it supplies | Integration boundary |
| --- | --- | --- |
| `sos_capture.py` | Plays a known signal into inputs A/B over USB Audio In, records the sixteen track channels over USB Audio Out and compares them sample by sample with the emulator running the same project and signal | The device-versus-emulator method for agent testing. Needs USB Audio In on EP3 OUT, 24-bit fixture projects and upstream's emulator build. A sample-exact match is evidence for that project and signal only. |
| `usb_offset.py` | Per-click sample offset between two channels of one capture | Channel alignment and latency checks on a capture from the prepared recorder. |

`npm run upstream:tools` keeps Sam's complete current tree, where every tool
runs in the layout it expects, in `~/.cache/modwerk-upstream/octabam`. The
commit is pinned in `sdk/upstream-tools.json`, and the two repairs above are
applied there and are the only edits allowed. `--update` moves the pin to
upstream `main`, unless Sam changed a repaired tool, which needs a new review
first. Upstream's own `make setup` and `make emu-cf` build its emulator and
DSP assembler inside that checkout. The same command keeps Elekloader's full
tree at the vendored kit's commit. Nothing in either checkout enters a
Modwerk build or the release fingerprint. Vendoring the tools into
`sdk/octabam/` would change that fingerprint and need its own reviewed
import.

Consume the structured probe verdict rather than its process exit code: the
upstream command can return zero for a reported failure or ambiguous result.
Its `CLEAN` verdict describes the measured USB failure signature, not module
qualification or a successful update. In particular, missing USB Audio In
counters cannot establish an input-path pass, and stream-close counters are
reported separately from the sustained stream. Churn runs include multiple
close events and need separate interpretation.

These tools do not currently read a loader/base/module identity from the
device. A supplied build note or local image hash is expected-build context,
not proof of the installed image. The runtime transport must provide that
identity before automation can associate a trial with the exact candidate or
accept it. Keep captures and raw reports private; none of these tools is
connected to automatic log uploads or automatic trial acceptance here.

## Modwerk's own interface for safe agent access

The owner wants the agent to access the physical machine safely through an
interface we own. Provide a versioned Modwerk device interface and a shared
TypeScript client used by the browser and automated hardware tests. Reuse the
existing upload protocol/controller where applicable. Developer transports
may adapt host APIs, but must use the same command validation, capability
checks and state transitions. The existing Octabam hardware tools supply
capture and test actions; they are not the complete device-access interface.
The device transport and execution backend remain unimplemented.

Connection starts with read-only identification and status: exact machine/OS,
installed base/ABI and active module identities, supported capabilities,
session/generation and device health. Refuse a mismatched or unknown target
before any state-changing request. Bind an automation session to the selected
unit and its explicitly enabled operations; reconnecting must re-establish
identity and ownership. A local firmware filename or USB product name is not
installed-image verification.

Expose a bounded command set: status, CPU/DSP measurements and diagnostic
snapshots; validated test transport/parameter actions; and module staging,
verification, activation, trial, acceptance and rollback. Define parameter
ranges, lengths, deadlines and supported state transitions for every command.
Keep diagnostics collection out of the audio-critical path and report missing
or dropped observations. Raw memory access, arbitrary writes and unbounded
command forwarding are outside this automation interface. Base installation
and recovery need their own validated workflow.

Use the agreed dedicated upload mode and stopped playback/live recording for
initial activation. Validate package hashes, installed base compatibility,
resource ownership and both-core quiescence before changing dispatch. Retain
the previous usable module set through the trial. Missing acknowledgements,
disconnects or uncertain execution must leave the client in an explicit
unconfirmed/recovery state; never infer success or retry activation blindly.
Only a confirmed device response establishes activation or rollback, and a
diagnostic result does not automatically accept a trial.

Before autonomous state-changing access, prove the interface on the physical
unit with wrong-target/base and unsupported-command refusals, malformed and
oversized requests, stale/replayed messages, lost acknowledgements,
disconnect/reconnect, interrupted staging and failed activation/rollback.
Verify that status/audio monitoring survives the supported fault paths and
that stock recovery remains available. This interface is the foundation for
the measurements below and routine module changes without rebooting.

## Quantify CPU and DSP load on the device

The automated hardware tests must measure the ColdFire CPU and each DSP core
on the physical OT, alongside audio correctness. This is an agreed deliverable,
not telemetry implemented by the current prototype. USB ring counters and
audible dropouts remain useful symptoms, but cannot supply a CPU/DSP utilization
percentage by themselves.

Establish a validated device timing source and the actual processing window
before reporting load. Record the timer units, resolution, clock calibration,
wrap handling and which work is included. Distinguish elapsed processing time,
busy time, waiting and hardware cycle counts wherever those can actually be
observed; keep emulator modeled cycles and executed instructions separate.
Compute utilization and remaining deadline headroom only from a measured
quantity and a verified budget for that same processor and window. Report
unavailable measurements explicitly rather than estimating them from silence
or a clean USB stream.

| Measurement | Required evidence |
| --- | --- |
| ColdFire CPU | Whole-workload busy time/utilization and peak load; task/interrupt breakdown where validated instrumentation permits it. |
| DSP core 0 and core 1 | Separate processing-time distributions and budget/headroom for each core, with mean, p95, p99, observed maximum and deadline-miss counts. Preserve their parallel execution rather than adding their percentages together. |
| Module cost | Matched baseline, individual-module and combined-module runs, repeated for different instance counts, tracks and FX slots. Whole-project load remains the acceptance context. |
| Measurement cost | Matched runs with diagnostics enabled/disabled and capture/USB streaming controlled, to quantify timing-hook, logging and transport overhead. Bound collection and report dropped telemetry. |

Use reproducible private projects with identical tempo, track speed, swing,
sample rate, settings and test duration. Include idle and playback baselines,
stock SPRING REV at its expensive types/settings and trigger splits on both
cores, then the owner's stress project: eight-track delays, A/B scene movement,
Flex recording and live sampling. Exercise module combinations, replacement
and removal, and report before/after resource usage separately from processor
load. Compare stock behavior through a reference with the same diagnostic and
capture stack, explicitly accounting for the instrumentation's added work.

Each report must bind the observed installed base/module identities, hardware
model, project/settings identity, timing method, instrumentation version and
raw timing statistics to the audio and USB-counter observations. Correlate
load peaks and missed deadlines with glitches or freezes; preserve failed
runs. Validate the measurement method and overhead on hardware before setting
acceptance budgets or claiming performance savings. SPRING REV is the design
reference from the module guide, not an arbitrary universal per-effect ceiling.
Export bounded diagnostic snapshots through the planned USB interface;
collection must not block the audio path. Existing private-evidence and
explicit trial-acceptance rules still apply.

## End-user workflow (owner, 10 October 2026)

The target for the browser flow: the user opens a sync mode on the unit,
connects over WebUSB, loads new modules, the site runs automated stress and
bug checks, and failed attempts are uploaded and filed as issues
automatically. Base installs and base updates (including USB MIDI/Audio
changes) remain a card OS install.

| Step | Built (emulator only) | Still needed | Rules |
| --- | --- | --- | --- |
| 1. Sync mode on the unit | Upload mode entered by the host's ENTER while nothing plays or records | A MODWERK SYNC entry in the unit's menus (REMIX SWITCH's BRAIN rows are a reference) that shows the session, holds transport and recording, and is the only state in which state-changing commands are accepted; leaving it on the unit leaves upload mode and rolls back an unaccepted trial | Physical presence gates every write. IDENTIFY, HELLO and DIAG stay read-only and always available; stock MIDI recovery is untouched |
| 2. Connect over WebUSB | `UsbVendorTransport`, the session client and a Chrome test page (`dev/octatrack-usb.html`) | Site UI on the configuration page, Chrome/Edge only; Windows WinUSB binding; the first hardware run | Claim only the vendor interface; a mismatched base identity is refused before any write |
| 3. Load new modules | One runtime module with tick, draw, key and encoder hooks, its own data and relocations, and patches to stock code ([machine-neutral loader](../sdk/runtime/loader/README.md)): load, trial, accept, replace, roll back and remove without a reboot; catalogue ColdFire modules converted by Elekloader | Data-table patches, modules that add to the core's tables, MIDI and audio-frame hooks, runtime DSP allocation (sequence step 3), several modules at once, ledger memory, a browser builder | The previous set stays live until acceptance; refusals happen before dispatch changes |
| 4. Automated stress and bug checks | DIAG counters, emulator checks, Octabam's MIDI/audio hardware tools | A test runner driven over the vendor interface in sync mode: bounded transport and parameter actions on a generated test project, CPU/DSP load and audio-path counters, a trial verdict per module | Never write the user's projects. A failed check rolls back automatically; acceptance stays an explicit user action unless the owner changes that rule |
| 5. Upload failures, open issues | `OCTAMOD.LOG` format, the strict browser/Worker parser, the report API and GitHub issue mirroring with author commands | Read the logger ring and test results over USB (a bounded read command) instead of from the card; a run report bound to the exact base and module identities; automatic submission after a one-time opt-in, de-duplicated by failure signature and version into existing reports for the module's author | Show the user what is sent. Never upload firmware, stock bytes, projects, samples or audio. Reuse the existing sanitized report contract and rate limits |

Sync mode must survive disconnects, dropouts, faulty cables and host USB
driver failures (owner, 10 October 2026). The unit must never wait on the
host and must end every interruption in a known, working state.

| Failure | Now | Still needed |
| --- | --- | --- |
| Unplug, bus reset, host closes the session | The controller's disconnect: staging discarded, an unaccepted trial rolled back, upload mode left | If something is playing, the rollback cannot hold transport and the trial stays live: retry it once stopped, and show it on the unit |
| Dropped, short or corrupted transfer | A short data stage or a new SETUP refuses the frame; the client retries a positively refused frame under a new sequence; the whole package's SHA-256 is checked before activation; an unconfirmed command stops the connection | Resume an interrupted upload from the last confirmed chunk instead of restarting |
| Host stops talking without a bus reset (driver or app hang, half-broken cable) | After 10 s without any request during an upload or trial, the unit handles it as unplugged (`usbtest6`, emulator-checked: a silent host's trial is rolled back) | A client keeps a long trial alive with status reads (the CLI reads DIAG every second); the site's UI must do the same |
| Device-side stalls | Replies are never a whole number of 64-byte packets (a stale zero-length packet once froze the unit), and nothing spins on the host | Keep that rule for every future request; fault-injection runs with random unplugs |
| Power loss | RAM only: a reboot starts stock plus the base | When accepted modules persist (planned), write the new set beside the old one and switch only once it is complete |

The SDK exposes the same interface for working directly on a unit, for
module authors and agents (owner, 10 October 2026): a command-line client
over the shared TypeScript client, with commands such as `identify`, `diag`,
`load <package>`, `trial`, `accept`, `rollback`, `remove` and `logs`. It
drives real hardware through a host USB backend (Node has no WebUSB; a
Node WebUSB implementation is a new dependency to review) and the emulator
through the bench socket that `scripts/verify-octatrack-vendor-client.mjs`
already uses, so the same commands work on both. It follows the
[safe-access contract](#modwerks-own-interface-for-safe-agent-access): the
sync-mode gate, base identity binding, bounded commands and no raw memory
access.

The first version is `npm run device` ([`scripts/device.mjs`](../scripts/device.mjs)),
driving a unit through `usb_bridge.py`, so it adds no Node dependency:
`status` (IDENTIFY, HELLO, DIAG), `try <file> [--seconds N] [--accept]`,
`remove [--accept]` and `lifecycle`. Each command is one whole transaction:
stage, publish, run the trial while printing DIAG, then roll back unless
`--accept` is given. Ctrl-C rolls back early, and unplugging USB rolls back
anything not accepted. All four commands passed on the owner's MKII
(`usbtest3`, 10 October 2026), including Ctrl-C during an `--accept` trial.
`--emulator` drives `ot_emu`'s bench socket instead (one command per
emulator run). Not yet built: `logs`, a module file that names its base, and
the sync-mode gate.

Down the road the interface should cover every supported machine. The
frames, sessions, IDENTIFY's model and capability fields, the transport's
rules, the TypeScript client and the runtime module loader and package
format are already machine-neutral; each machine
needs its own base glue, runtime ABI and transport. Where a stock USB stack
cannot carry an endpoint-free vendor interface, a machine may use another
transport (for example SysEx over USB MIDI, which the Digitakt and Digitone
stock OS already accept for updates) carrying the same frames.

## Agreed implementation sequence

1. Qualify the Elekloader base and stopped upload mode, preserving logger,
   startup identity and recovery. Establish bounded transport, identification
   and status before accepting writes.
2. Load, replace and remove one runtime module; verify interrupted staging and
   rollback without a reboot. Keep the previous live set until activation has
   succeeded. A host simulation does not establish this hardware milestone.
3. Extend the existing DSP SDK/bus with runtime P/X/Y allocation and checked
   relocation, shared dependencies, isolated instance ownership and coordinated
   acknowledgement/retirement on both cores. Maximize supported combinations
   within verified ABI, memory and processing budgets; refuse resource
   exhaustion before modifying live dispatch.
4. Preserve stock and legacy module identities and validate saved state before
   use. Missing modules need an explicit safe fallback with project data
   preserved. The present SPATIALIZER donor bus is not a compatible default.
5. Integrate an autonomous local hardware runner using USB MIDI, audio,
   counters and bounded diagnostics through Modwerk's own versioned device
   interface and shared TypeScript client, with the safe-access contract above.
   Octabam already supplies
   `tools/hw/usb_probe.py`, `usb_counters.py`, `ot_midi.py` and test-project
   generators; its USB AUDIO IN work is separate from Modwerk's imported
   output-only stack. Reports bind exact base/module identities to observed
   results. Add validated on-device CPU and separate DSP-core load/headroom
   measurements, matched SPRING REV and stress-project benchmarks, and measured
   diagnostic overhead as described above. Uploaded logs follow the existing
   sanitized report contract.
6. Add the browser upload/verify/activate/diagnostic flow and retire the public
   Octabam composer only after catalogue and hardware qualification pass.

The first physical acceptance target is one module loaded, updated and removed
over USB, an interrupted upload recovered, and playback resumed without a
reboot. Later acceptance adds legacy projects, multiple instances, both DSP
cores and the owner's stress project. Firmware, projects, card images and audio
captures remain local unless separately authorized for sharing.

At the owner's request, keep all these pieces on one development branch until
stable. The foundation-only PR #374 was closed on 9 October 2026; do not open
separate small PRs for each preparatory component. Physical qualification still
requires concrete private builds and actual results for this source.
