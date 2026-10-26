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

On POSIX hosts, set `umask 077` before preparing private firmware, including
`npm run octatrack:base -- --stock PRIVATE_OS --out NEW_PRIVATE_DIRECTORY`.
The CLI's output directory inherits the shell's permissions. Keep its parent
private, its output directory at 0700 and firmware files at 0600; save images
outside every Git checkout.

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

### Runtime recipe identity and lifetime

Guarded StockCopies and authored fills encode zero placeholders, so the encoded
package hash and independently reconstructed native image hash are different
identities. Pin both, the reviewed recipe and its exact source map; never relabel
one hash as the other. A guard over an arena word proves that resource binding,
not the complete base identity. Runtime card rehydration must independently
refuse a foreign full base identity before restoring packages.

Table-owner preparation and replacement must fence current and paused
stock table, menu and callback consumers, including cached/uncached references
to the entire outgoing image from byte zero. Undo restores all three original
arrays, their count and every stock site before retirement. Empty compiled
trust reservations remain closed; package preparation or native fixtures do
not grant admission or hardware qualification.

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

### RAM boot on hardware: USB after the soft reset (10 October 2026)

Of about six RAM boots on the owner's MKII with `usbtest7` flashed, one came
back with the screen working but no USB: the Mac saw no device, a replug did
not help, a power cycle did (same port). The likely cause is that the soft
reset restarts the ColdFire but leaves the USB controller (and its PHY) as
they were, while stock's start-up expects them as after power-on. Also, a
boot armed by a RAM-booted base fell back to the flashed base, because the
flashed base's gate read the mailbox only at its own stage address, which
moves between builds.

`usbtest9` changes both: before the reset the base stops the USB controller
(USBCMD.RS = 0) and waits about 50 ms, so the host sees a clean unplug; and
the gate scans Octabam's platform reserve (`0x40a955e0`-`0x41495de0`, 16-byte
steps, about 0.1 s with the caches off) and spends every mailbox it finds,
booting only when exactly one checks out. The build refuses a stage outside
that range. In the emulator: the proof image boots from a mailbox at the
base's own stage and at another address; two mailboxes, a flipped byte and
another bootstrap version each boot the base instead. Not yet on the unit.

The several-modules check then found a second EP0 trap on the unit: a
SUBMIT whose frame is a whole number of 64-byte packets (128 and 192 bytes
failed; 127, 191 and 255 passed, `usbtest9` from RAM) never completes. The
EP0 OUT queue head keeps stock's zero-length termination, so the controller
waits for a zero-length packet the host never sends; the base abandons the
stage and recovers. The base now clears ZLT when it primes the stage, and
the client never sends such a frame (it shortens that chunk by a byte), so
already-flashed bases work too: with the client fix both sizes passed on the
unit.

`usbtest9` (base `19d37e25…`, `.bin` `cd5ee27c…`, built from `508b0e52`,
flash-safety check passed) ran from RAM on the owner's MKII the same day.
`device boot` armed it from a RAM-booted base, came back on the flashed
`usbtest7`, re-armed from there and booted it (21 s, unattended). A raw
128-byte SUBMIT that skips the client's guard was answered with no abandoned
stage, and the client verifier passed in full, including the several-modules
check (Q and P kept together; R, patching P's bytes, refused before
activation with P still running; R loaded once P was removed; all removed).
The owner then flashed `usbtest9`. Twenty RAM boots in a row, alternating
between `usbtest9` and a copy differing only in its identity digest (each
armed by the image the previous boot started), all came back with USB and
the new identity, 12-16 s each, none needing the fallback re-arm: the USB
detach ran before every reset and the flashed gate found every mailbox.
Before the detach, one boot in about six had left USB dead. Twenty is
evidence, not a guarantee; the images shared one stage address, so the
scan across different addresses is shown by the emulator only.
`npm run device -- boot` now waits for the unit to go away and answer HELLO
again, and re-arms once from the flashed base if a boot falls back to it.

### Updates stop playback themselves (owner, 10 October 2026)

The owner wants an update started from the site (and Keep or Undo) to stop
playback itself after the site asks in a modal, instead of refusing. While
the unit plays, the host's ENTER (or the hold before Keep or Undo) makes the
base press STOP exactly as the panel does: a press and a release record from
STOP's keymap entry, stamped with the panel's clock, posted by pointer to the
queue(s) the entry names, at most once a second. The step still answers
`unsafe` (the controller now maps the backend's "not stopped" to `unsafe`,
other backend failures stay `backend`) and the host retries every 200 ms for
up to 3 s. A recording is never stopped this way, and a disconnect's rollback
(`mu_disconnecting`) never presses STOP.

On the owner's MKII the first version crashed the unit twice, minutes after
it pressed STOP, and a remote STOP made a brief distortion without stopping
playback. That version posted key event records to the keymap's queues
directly. Stock's handlers also read the held-key rows the panel parser
keeps (`0x4009220c`), and something kept the foreign records. Keys now go
in as the panel sends them: a row report `{0x20 | row, the row's held
keys}` through the panel's own byte ringer (`0x40092254`, UART1's receive
callback), which forces the parser's interrupt; the parser updates the rows
and posts its own events, as for a physical press (octemu's emulated panel
sends the same frames). With that (development base `54f2ce5c…`, from RAM):
a remote PLAY played and a remote STOP stopped; an update started while
playing stopped the unit and went through on the first ENTER (15 ms), then
the unit ran for more than three minutes without a crash.

`build_core.py --dev` adds development-only requests on the vendor
interface (`dev.c`, never in a base users install): KEY, PANEL (encoder
turns and the crossfader as raw panel bytes), STATE (stopped, recording)
and SCREEN (the last composed 128x64 frame), used by
`npm run device -- key FUNC+FX1 | enc A+3 | fader 128 | state | screen`.

Development bases also stream MAIN and CUE to the computer as USB audio
(owner: for development only, never in the base users install). They carry
Octabam's USB AUDIO OUT MAIN CUE (`usbaudio.s`, layout 3, hardware-proven at
high speed on Bryan T's MKII) with AudioControl and AudioStreaming as
interfaces 2 and 3 after the vendor interface (the source's two interface
`.set`s rewritten at build time), the composite device class, and its own
sites for SET/GET_INTERFACE, the EP0 page fix and the frame producer. Where
both would own a stock site, the base's shims hand over: requests that are
not the base's go on to `audio_ctrl_shim`, bus reset and session end to the
audio shims (which replay stock), and the audio ISR shim ends in the base's
poll. In the emulator (`--frame`) both speeds pass the vendor and mass
storage checks plus the audio clock (44.1 kHz), alt 1 starting a stream of
whole frames, and alt 0 stopping it.
On the owner's MKII (development base `2b6ee017…`, from RAM) macOS listed
"Elektron Octatrack DPS-1" with 4 input channels at 44.1 kHz. With a
remote PLAY, Octabam's CoreAudio recorder (`rec.swift`, the adapter's
repaired copy) captured the main out over USB: MAIN L/R peaking near
-12 dBFS, CUE silent (nothing routed there), no gap longer than 59 samples
(the tail after a remote STOP). The development loop needs no one at the
unit now: RAM boot, keys and encoders, screen and state, and audio.

### DSP loader: first hardware run (10 October 2026)

A base with `--dsp-loader --dev`, RAM-booted on the owner's MKII from the
flashed `usbtest9`, played normally before any module was involved
(recorded over USB audio). The owner's project already references effect id
27 (E-Verb's, most likely from a static E-Verb build). Installing E-Verb
started its upload to core 0 at once (`npm run device -- loader`: job 0
pending), and from that moment the loader's frame counter stood still (42857
for four seconds and on): no sound, the sequencer stuck on its first step,
the ColdFire, UI and USB unaffected, no error counted. A power cycle
restored the unit. The upload handshake never completes on a real core; it
completes in `ot_emu`.

**First guess at the cause, from stock's code (the second run disproved it as the whole cause).** The
pending job was the first PROBE (no table known yet). Core 0's main loop
waits at P:$97 (`brclr #HTDE,x:M_HSR,*`) for the host to empty its host
transmit register before every frame. The receiver answered each packet
with status words the ColdFire pulled from core 0 with host command $89 and
an eDMA burst. Stock's frame-transfer machine (states 0-7, read locally)
pulls only from core 1 (state 0, X:$6600) and never from core 0. With the
host bus on auto-acknowledge, the burst can end before core 0 has taken the
$89 and armed its DMA channel 1. Words then stay in HTX, and P:$97 waits for
ever. `ot_emu` makes a host read wait for the DSP's word, so the race never
happened there. Writes are not suspects: core 0's are the same transfer USB
Audio In makes at state 7, proven on an MKII.

**First fix** (`7c33cdf2`, base `f1ef80ee…`):
- No host reads from either DSP. The receiver (`dsp_receiver.asm`, from
  Octabam's) answers with one HCR write per packet: HF2 toggled for
  handled, HF3 for refused. The ColdFire reads both from the host ISR
  without taking a word. Stock's payloads never set either flag.
- An upload carries its own sum, and the receiver checks its P read-back
  against it.
- Each core's table comes from the build, so no probe is sent.
- The transfer machine has no read phases, and it skips a core with
  nothing to send.
- A watchdog in the sys tick catches frames standing still for 0.5 s while
  a transfer is in flight. It drains whatever the cores still offer the
  host, restores channel 1 and the frame interrupt, shuts the loader off
  until a reboot and shows `DSP STOPPED`. Restoring a core that is truly
  stuck (park it and upload its payload again, as RAM boot does) is the
  next step if this is not enough.
- `modwerk_dsp_report()` (runtime.h) gives a hardware run the loader's
  state in 34 words.

**Second run** (base `f1ef80ee…`, the same day): the same freeze. The first
packet to core 0 timed out (errors 1, accepted 0, rejected 0, the pick
refused), the next job stayed pending, and the frame counter stood at
266,023 for at least 30 minutes. The watchdog had no visible effect. No host
read was involved, so either delivery of the packet, the receiver's HCR
write, or the rest of the receiver stops core 0.

**Probe bases** (`e35fa6de`, `--dsp-loader --dev`, nothing installed) split
these up. Each sends one PROBE packet per core on the development call
`modwerk_dsp_probe(core)`:
- `--dsp-probe A`: the hook runs, but the receiver returns before reading
  the packet. Only delivery is tested, and every probe should time out.
- `--dsp-probe B`: the receiver checks the packet and answers with the HCR
  write, but does nothing else.
- No flag: the whole receiver.

Report version 2 adds the watchdog's tick count (word 15) and the probes
sent, answered and timed out (16-18). If the tick count stops while frames
stand still, ev_tick stopped with the audio and the watchdog never ran.

**Probe A on the unit** (`e35fa6de`, RAM boot, blank project): one probe to
core 0, and in a fresh boot one to core 1, each stopped the frame engine
within a second. The sequencer froze and USB audio stopped. The watchdog ran
(its ticks kept climbing), caught the stall, took 2 words back and shut the
loader off, but frames did not return. So delivery alone stops both cores;
the receiver is not involved.

**Not the cause: an early state-7 visit.** Stock can visit state 7 while
its last transfer still runs, and a packet started then would collide with
it. The state-7 entry now waits for channel 0 to be idle (TCD0 `DONE`, no
`ACTIVE`, no `START`) and counts early visits (report version 3, word 28).
On the unit (`2e321d7b`) the count stayed 0 and probe A still froze. The
same freeze came with Octabam USB AUDIO IN's exact state-7 entry
(`--dsp-hook usbin`). So our extra channel-1 steps are not the cause either.

**Next split** (`--dsp-hook`, each the guarded entry plus one change, with
probe A): `pretend` builds the packet and runs its job, but writes nothing
to eDMA or the host port. `noflags` delivers but never reads the host
flags. `long` sends 96 halfwords, USB AUDIO IN AB's length; the destination
is already USB AUDIO IN's (X:$6320). A transfer without its host command,
or a host command without its transfer, is not built: either leaves the
host port out of step with stock's next push by construction.
Report version 4 (42 words) adds where stock's frame chain stands after a
freeze: the transfer machine's state, the frame interrupt's busy flag,
INTC0's pending and mask registers, the EPORT pin levels and edge flags with
the DSP select, eDMA's interrupt and error bits, both channels' CSR and
eDMA's error status. All are read without side effects.

**Cause, measured on the unit.** `pretend` (no transfer) kept frames
running. `long` froze, and report version 4 showed eDMA channel 0 in error
with `ES = 0x80000080`: a source address error. Channel 0 keeps stock's
ATTR, which reads the source in 16-byte bursts, and our packet buffer
`dl_tx` sat at an address ≡ 4 (mod 16). The channel stopped at its start,
so its completion never came, state 7 never unmasked the frame interrupt,
and core 0 waited at P:$97 with its frame word unread (the 2 drained
words). USB AUDIO IN's buffer is 32-byte aligned. `ot_emu` does not check
alignment, so it never showed this.

**Fix** (`--dsp-loader`): `dl_tx` and `dl_rx` are 16-byte aligned (rows of
128 and 64 bytes stay aligned), and the build refuses a base where they are
not. TCD0's ATTR stays stock's, as USB AUDIO IN's does: stock never rewrites
it and relies on it for every push. If eDMA refuses one of our transfers
anyway, the sys tick acts at its next run, not after half a second. It hands
the core the words its host command promised, clears the channel's error,
takes back the frame words, unmasks the frame interrupt, shuts the loader
off and shows `DSP STOPPED`. Report version 5 (44 words) counts those errors
and keeps the last `ES`.

On the unit (`16ccd150`) core 0 then delivered and answered: a PROBE to core
0 timed out with frames running and no eDMA error; the receiver answered a
PROBE through the host flags; and an E-Verb upload to a core-0 track loaded
four of its packets before one was rejected, the track kept its effect and
the unit stayed healthy. Two things remained: core 1 still froze on delivery
(no eDMA error, so the DSP never took the words and the channel waited on the
host handshake), and the upload's fifth packet failed a receiver check.

For the stall, the sys-tick recovery now cancels a transfer that eDMA never
finished (TCD0 not `DONE`, no error) through the eDMA cancel bit, so the
channel and host port come back and frames resume as `DSP STOPPED` rather
than freezing. `--dsp-probe W` sends one word per upload packet, so the count
of packets accepted before a reject is the exact index of the first word the
DSP read back wrong.

**On the unit with the fix** (aligned builds, blank project): core 0 now
takes packets with frames running. A1x's probe to core 0 timed out as built,
with frames counting and no eDMA error. B1x's receiver answered both probes
(the HF2 toggle flipped each time). C1x's E-Verb pick on T5 kept frames and
audio running while the upload failed safely at its fifth packet: the
receiver's read-back check refused it, the pick was refused and T5 kept
DELAY. Still open: core 1 stops frames on its first packet, with no eDMA
error this time (A1x's probe 1; most likely the shared host port switching
back to core 0 mid transfer), and the P-write mismatch on core 0.

Later builds corrected that reading. PEEK (`ecc78e0f`) showed the program
words stick, so the fifth packet is refused before anything is written, not
by the read-back. `dsp2-AB2` (`98cad787`, identity `cd198f81…`, flash-safety
check passed, RAM-booted on a blank project):

- Core 0, E-Verb picked on T5: refused at the fifth packet again, frames and
  audio running. The receiver's record is `$020003`, count 24, offset 136: the
  bounds-or-opcode branch, for a WRITE whose recorded opcode, count and offset
  are all in range (offset + count 160 of the 2245-word table). The checksum
  passed and nothing overran (`pin7` equal to frames, no straddles), so the
  torn-packet theory is out. The receiver masks each word with `and #$ffff`
  and then compares the whole accumulator, and `and` leaves A2 stale
  (Octabam's trap): a word with bit 23 set would be recorded in range and fail
  the compare. Unconfirmed.
- Core 1 through the new path (its packet right after stock's state-2 push to
  core 1): `probe 1` froze the unit as before (frames stopped at 38862 in
  state 7, both TCD CSRs `DONE`, no eDMA error, one stall, two words drained,
  the probe timed out), with `core1Sent` 0: the loader had not sent core 1 a
  packet. Arming the job, not delivering it, stops the frames.
- Rebinding on both cores (item D) is still unverified: the emulator runner
  started node in the wrong directory, and its rerun lacked the package mount.
  (It passed in the emulator on 11 October: Milestone 3, first steps.)

What arming a core-1 job did at state 7: the packet builder and every frame
of a pending job read the core's host flags by switching the DSP select
byte to it and back. For core 0 that is a no-op; for core 1 it is the only
thing AB2 did to core 1 before the freeze.

**Both cores on the unit** (`dsp2-AB3`, `35b48eb4`, identity `afb310d1…`,
flash-safety check passed, RAM-booted on a blank project, 10 October 2026).
Two changes: core 1's flags are read at state 3's entry, where stock's
state 2 left it selected, so the loader never switches cores; the receiver
rewrites the header words masked to 16 bits before its compares. In the
emulator E-Verb on T1, T2 and T5 loaded word for word on both cores (68
packets each, none refused). On the unit:

- Probes: core 0 and core 1 each answered, with frames running and no errors.
- E-Verb picked on T5 (core 0): 68 upload packets accepted in under a second,
  none refused, the pick completed, 1,588 words resident; the screen showed
  E-Verb with its own page (TILT, PRE, REV, EDCY, ESIZ).
- E-Verb picked on T1 (core 1): the same, `core1Sent` 69; both cores then
  held their copy.
- PLAY afterwards: the sequencer moved, frames kept counting, no stalls.

Not yet shown: E-Verb's sound on the unit (the blank project plays nothing),
removing it again on hardware, the stock effects coming back, and timing.

### Windows without a driver (10 October 2026)

The base reports USB 2.10 from its own copy of the device descriptor (one
pointer site at `0x4001d82e`; stock's copy sits in the protected range) and
answers BOS and the Microsoft OS 2.0 descriptor set from `ep0.c`: a WinUSB
compatible ID and the interface GUID `{4DEA1B9D-6B51-400A-93C9-5CFFC5DF8CF1}`
for the vendor interface. Both requests reach the base through stock's
unknown-request tail. In the emulator both speeds answer all four new
checks. On the owner's MKII, `usbtest8` (base `268ac050…`, built from
`ed66143c`, flash-safety check passed) was started over RAM boot: the Mac
read USB 2.10, the 33-byte BOS and the 178-byte descriptor set exactly as
built, the module lifecycle passed, and USB disk mode still mounted on the
Mac. Not shown: Windows itself binding WinUSB (no Windows PC yet). A PC that
already saw the unit as USB 2.00 may keep that cached.

### RAM boot for base development (10 October 2026)

So the owner flashes only bases worth keeping, a base can now run another
base from RAM: `npm run device -- boot BUILD_DIR`
([README](../sdk/machines/octatrack/elekloader/README.md#ram-boot-development-bases)).
The owner approved porting REMIX SWITCH's boot chain for this (modules keep
loading without a reboot). Nothing writes flash; a power cycle boots the
flashed base. The DSP park is REMIX SWITCH's source instruction for
instruction (its `jmp $fab` bridge placeholder resolved to the tail pin
`$06`, as its build does).

In the emulator with `usbtest7` (base `805902ba…`, built from `c315c4bb`,
flash-safety check passed; REMIX SWITCH's `ot_emu` with `--preload`):

- Arm: a 1,193,284-byte image (`usbtest7` with only its identity digest
  changed, `f35efefd…`) staged over USB read back byte for byte from the
  stage; the mailbox held its length, hash and check word; the reset path
  ran OS UPGRADE's quiesce and the park and reached the soft reset (`RCR`).
- Boot: the base booted with that stage and NOR's version preloaded came up
  as `f35efefd…` (USB, IDENTIFY and the controller working).
- Refused, flashed base `805902ba…` running instead: one flipped byte in
  the staged image; NOR's bootstrap version differing from the image's.
- The vendor USB check and the module lifecycle still pass with module
  packages staged in the boot stage.

The emulator could not show the DSP park and the next OS's DSP upload into
parked cores (`ot_emu --dsp` dies with a bus error at start-up on this Mac,
stock included). The gate's status is not readable after the boot (the new
base clears the stage).

On the owner's MKII the same day, with `usbtest7` flashed (`.bin`
`4da03d7e…`): `npm run device -- boot` sent the same proof image, and
10 seconds after the command started the unit answered IDENTIFY as
`f35efefd…`, its tick counter restarted, with no flash write. The owner
then reported that everything worked (asked to check the screen, sound on
tracks of both DSP cores, sequencing and the card): the park, the quiesce
from the engine task and the DSP upload into parked cores held on one run. The return to the flashed base after a power cycle was not observed (the unit was left running the RAM image).

### Reference: Octabam's REMIX SWITCH

Sam's open [Octabam PR #655](https://github.com/sambanks/octabam/pull/655)
(head `879cecb`, 10 October 2026; from sanderlegit's #542) switches the unit
to a whole OS image from the card: it loads the image into a stage in SDRAM,
parks both DSP cores and soft-resets into it, without writing the flash.
That is a reboot, so it does not meet the no-reboot goal; the owner chose
on 10 October 2026 to use it as a reference, not as Modwerk's mechanism for
modules. Its boot chain is ported (not vendored) for development bases only:
see RAM boot above. Its README marks what was measured on an MKII on
29 September 2026 and what was not (endurance, caches, MKI).

| Technique in REMIX SWITCH | What it informs here |
| --- | --- |
| DSP park: host command `$0F` on stock's unused vector `P:$1E`, a handler in the run of dead vectors from `P:$20` that stops DMA 0–5 and both ESAI ports, then a boot-ROM-style loader (count, address, words, jump) | Reloading DSP code on both cores without a chip reset, for activation. Its measured traps: clear HPCR bit 7 or every host echo reads `0x010101` and the stock record sender silently abandons the upload; drain stale words from each core's host receive register first. |
| `verify_dspvectors.py` audits on every build that those vectors are self-jumps no armed DMA, ESAI or interrupt can reach | Code in dead vectors is safe only under that audit. Any P allocation that uses them needs the same check. |
| Stage at the top of the platform reserve, `0x49200000`–`0x49495de0` (uncached), which stock never touches and which survives a soft reset | A ledger entry and a staging candidate, not free memory: the reserve is shared with every platform runtime. |
| Before running new ColdFire code: caches off, I-cache and branch cache invalidated, the bootstrap's exit `CACR` (`0x0008c000`) restored | Activating relocated ColdFire code needs explicit cache invalidation; the open cache-handling item above. |
| The card scan saves and restores the stock browser's name pool and cache around its own listing | Needed if packages are ever read from the card. |
| Soft reset (`RCR` `SOFTRST`) after parking the DSPs; the unit's own panel handshake first | Not the routine path for modules. Ported for RAM boot of development bases (above). |

## Several modules on the device: design (10 October 2026)

**Target (owner, 10 October 2026).** Modules live on the unit. Module FX
appear in the stock FX1/FX2 choosers and module machines in the machine
chooser, beside the stock ones. Picking one on a track loads its code if it
fits, and code nothing uses any more is freed. A module that does not fit is
refused at selection, with the reason on the screen, and the track keeps
what it had. Part changes and FX changes stay seamless during playback. The
computer is needed only to install packages (card or USB), never to switch.
RAM boot stays a base-development tool: it restarts the unit.

**Target architecture (owner-approved, 10 October 2026).**

1. *The limit is what is selected, not what is installed.* Each DSP core's
   P/X/Y memory is a cache. The installed library lives in ColdFire memory
   or on the card and can be any size; only the FX and machines the current
   bank's Parts select are resident on a core. "Full" means the current
   selection does not fit, never that too many modules are installed.
2. *Every FX is the same kind of thing, stock included.* Once the loader is
   proven on the unit with the pilot (E-Verb), stock effects load on
   demand through the same path (about 5,395 free P words per core instead
   of SPATIALIZER's 261): one code path for all FX. Until then, modules live
   in harvested space.
3. *One shared DSP library per core.* Common routines (filters, delay lines,
   interpolation) are resident once per core and shared by every module
   through the standard module form, so each module's own code stays small.
   Shared code stays unchanged while anything resident uses it, and counts
   once per core in the ledger.

Also decided: one standard module form that existing modules are refactored
to; admission at selection over the union of the bank's Parts, so a Part
change only flips dispatch at a frame boundary; placement by track (tracks
1-4 on core 1, 5-8 on core 0).

### What we reuse

| Piece | Where | What it gives the design |
| --- | --- | --- |
| Elekloader's static linker (`link.py check`) | pinned kit `3acac10` | Composition rules: one owner per byte (sites and claimed bytes), named claims, `requires`/`conflicts`, hook tables ordered by (`order`, id), RAM budget, DSP areas freed by a harvest claim. Run at install time against the base; the device re-checks the byte rule itself. No run-time loading exists upstream. |
| `verify_static.py` | this branch | Proof that a package placed at an address equals Elekloader's static link there. Kept for every package. |
| core-ot 0.3's reserve | Elekloader | The base's `.bss`, and so the module pool, lives in arena pages taken from sample memory at boot. |
| dspbus-ot | Elekloader | The chooser lists rebuilt (0x400d6b20, 0x400d7bbc, six `lea`s), the id-to-row tables, the per-effect dispatch words on payload A (init X:0x215+id, process X:0x235+id; unused ids at the null stubs P:0x7c8/0x7c9). |
| DSP dynamic loading | `sdk/octabam/platform/dsp-dynload*`, `tools/experimental/dsp_dynload` | A frame-head receiver on both cores (A P:0x8e, B P:0x76) fed by the frame DMA (64-halfword packets, at most 24 words per write, read-back sums), a first-fit P allocator that shares code per core, prepare / per-core acknowledgement / commit / retire, BIND, UNBIND and BYPASS at the frame head, publication guards on the FX choosers, manual and queued Part changes, LOAD PROJECT and PASTE/RELOAD/RESET, and every stock effect loaded on demand. Emulator evidence only; gaps below. |
| REMIX SWITCH | Octabam PR #655 | Listing files on the card while saving and restoring the stock browser's name pool. |
| Runtime loader | `sdk/runtime/loader` | Relocation and placement on the device, stock-code sites behind a paused-task scan, the upload transaction. |

### Resources, per core where it applies

| Resource | Capacity and evidence | Admission rule |
| --- | --- | --- |
| ColdFire pool | 768 KiB in the base's `.bss` since S58 (12 October 2026, 128 modules; 256 KiB, 43 of the arena's 14,602 pages, before), a static reservation: growing it at run time needs the OS page allocator audited | One extent per module (record, sites, code, data, bss); first fit; reclaimed when no position, transaction or paused task reaches it. Built (milestone 1). |
| DSP P | Stock's effect block is 6,158 words per core. With every stock effect on demand, 414 shared words stay resident and the receiver takes 349, leaving an arena of 5,395 words (build sizes, Octabam). Payload A's P is otherwise full: Elekloader frees only SPATIALIZER's 261 words. | First fit in the core's arena; one copy of a package's code and tables per core, shared by its instances. |
| DSP X | One 256-word r7 block per instance, of which `$00`–`$83` (132 words) are usable; `$84+` hung the unit (Octabam `AGENTS.md`). X:0x20–0xff is stock scratch. | A package declares its state words; more than 132 is refused. |
| DSP Y | Stock gives every slot its own block through X:0x255: FX1 3K words at 0x1000/0x1c00/0x2800/0x3400, FX2 16K at 0x4000 and 0x8000, then the shared half (A: T7/T8 at 0x30000/0x34000, B: T3/T4 at 0x38000/0x3c000). Stock owns 0x30000–0x30047 and 0x38000–0x3800f inside T7's and T3's blocks (the Air Chorus collision). | The declared buffer, alignment and modulo needs must fit the slot's block, minus stock's owned words on T3/T7. A dynamic Y allocator gains nothing until the 16K program map is measured (Octabam). |
| Shared RAM | 0x030000–0x03ffff is one physical store in both cores' P/X/Y views | One ledger across both cores; Elekloader's linker does not check it. |
| DSP cycles | 16-sample frames; the clock is 4,532 instructions per sample (199.9 MHz / 44.1 kHz, measured on a board). Of the arithmetic 4,535 cycles per sample, our code may spend 3,120 (hardware, triangulated from three sweeps; stock takes about 1,415 by subtraction). Stock SPRING REV, one instance split 4: 314.0 executed instructions per sample in the emulator, the same on both cores; no modeled-cycle or hardware figure. | Per core and per Part: the sum of the declared worst cases of the active instances, plus the switch frame (the outgoing effect's sub-block and the incoming init run in one frame), within the budget. A declaration names its kind (hardware, modeled cycles or executed instructions); executed instructions from a few renders are not worst-case bounds. |

Module footprints recorded so far (P words / X / Y / cost): Air Chorus 795 /
132 / 16,312 / 732 modeled; E-Verb 1,588 / 132 / 16,369 / 468 modeled;
MiniVerb 532 / – / 16K / 411 modeled; TapeHead 422 / 31 / – / 295 modeled;
Analog BD 997 + 35 helper / 3,776 / – / 268–410 executed. None has a hardware
cost. Octabam's dynload catalogue declares 0 cycles for every entry and its
allowance is 0, so cycle admission exists there only as an interface.

### Admission and switching

- **When.** At selection: a chooser pick, a Part edit, a project or bank
  load. Admission covers the union over the bank's four Parts (memory) and
  each Part's own cost (cycles), so a Part change only flips dispatch, at a
  frame boundary like stock, and never loads code at the musical moment.
  The sequencer callback never allocates, reads the card or transfers code
  (dsp-dynload's rule); the UI and engine tasks do, in bounded chunks.
- **Refusal.** Before anything changes, with a reason the unit shows
  (not enough DSP memory on tracks 1–4, no cycles left on tracks 5–8, a
  conflicting module, ...). The live set and the track's selection stay.
- **Coexistence.** One owner per byte, enforced at install by the linker and
  on the device by the loader. Seams many modules want (chooser rows,
  dispatch words, Part routes) belong to the base, which modules describe
  themselves to, as core-ot's bus and machine-pages do; modules never patch
  them. Hooks run in position order; a key or encoder taken by one is not
  seen by later ones.
- **Smoothness.** New code goes into memory nothing dispatches yet, in
  chunks (ColdFire in the engine task; DSP at most 24 words a frame). The
  flip is one short step: ColdFire sites and hooks with interrupts masked,
  DSP dispatch words at the frame head. Old code stays until retired:
  ColdFire after the paused-task scan, DSP after the core acknowledges
  UNBIND.
- **The bar is stock's own switch.** Read from the payloads and the
  emulator: when a slot's effect id changes, stock runs the outgoing
  effect's first sub-block, then the new effect's init and its second
  sub-block in the same frame, with fresh state and no crossfade. A queued
  Part change re-applies a track's FX only when that track's source byte in
  the new Part is 4 (port measurement; hardware not measured). Neither has
  been listened to on hardware yet; the owner's main-out recording around
  scripted switches is the measurement.

### One module form for FX and machines

The owner is open to refactoring the catalogue for this (10 October 2026),
so the loader does not grow to cover every static patching pattern. A
dynamic FX or machine is one package:

- **Relocatable code**: ColdFire code and data (the runtime loader's
  relocations) and DSP code and tables per payload (`.dsp.A`/`.dsp.B`,
  `dsp24` relocations, Elekloader's format), placed by the device.
- **Declared needs**: ColdFire bytes; per core P words, X state words
  (at most 132), Y buffer words with alignment and modulo; worst-case
  cycles per instance and per frame, with the evidence kind.
- **Standard entry points** instead of stock-site patches: DSP init and
  process (stock's dispatch contract: init preserves r1, process works on
  the r7 block), parameter metadata and a parameter-change handler, the
  chooser row it fills (name, FX1/FX2/machine) and the dispatch id the base
  gives it. The base owns the chooser lists, the dispatch words and the
  Part routes.
- **A reason for every remaining stock site.** The device keeps the
  one-owner-per-byte check for those; everything else is plain accounting,
  and cross-compatibility becomes a property of the form instead of a check
  per pair.

A port that must sound like its static version keeps a `verify_static.py`
style proof: its relocated DSP code at two or more origins equals the
static assembly, and renders match sample for sample.

**Pilot: E-Verb** (user1303836, 0.1.0-experimental). CHARACTER was the
first choice, but Sam Banks' modules (Spectrum, Modulation, Character) and
Air Chorus are paused in today's catalogue (`src/catalog/availability.ts`),
so nobody uses them (owner, 10 October 2026). E-Verb is enabled, the
newest catalogue FX, and has reported MKII qualification as a static
module, so the owner can compare it on the unit with what he knows. It is
also the harder case: 1,588 P words, the whole 132-word r7 block, and the
16K FX2 delay buffer it reads from its base in init, so the pilot covers
buffers and FX2 where a buffer-free insert would not. Its relocatable
package and four-origin proofs already exist (`src/engine/assets/dsp-packages.json`).
Its routines (halfband filters, allpass and delay lines) are the first
candidates for the shared library; splitting them out means changing its
generator and re-proving its audio, so the pilot ships it whole.

### Projects across module changes (owner, 10 October 2026)

A project stores, per Part and track, each FX slot's effect id (one byte,
FX1 and FX2 for T1–T8 at the head of the Part) and its knob values, and each
track's machine type. Stock keeps those bytes whatever the effect is; a
module reads its knobs from them. Modules can disappear (an update, another
card, another unit) and change version, and old projects must keep loading:

- **Ids: handles, not fixed numbers** (owner, 11 October 2026). The DSP
  dispatch table has 32 effect ids. Stock uses 0 (NONE), 4, 5, 8, 12, 13,
  16–22, 24 and 28, and its choosers can store nothing else, so a stock
  project never holds another id; those keep their meaning for good. The
  other 13 whose stock dispatch is the null stub (6, 7, 9, 10, 11, 14, 15, 23,
  26, 27, 29, 30, 31) are not given to modules for good: each is a handle
  that one project assigns. A module is known by its identity: the package's
  module id (the first four bytes of the SHA-256 of its name, as today), its
  name and its parameter-layout number. Picking a module gives it a free
  handle in that project. A map file in the project's folder, written with
  the project, names the module behind each handle, so the project carries
  its own assignments to another card or unit. The base owns the handles, the
  chooser rows, the parameter pages, dispatch, memory and cycles; a module
  only describes itself (name, pages, slots, cost, code), so modules cannot
  collide and a new one needs neither an id nor a base rebuild. The limit is
  13 different module effects per project, with no limit on the catalogue.
  Machines work the same way through the track's machine-type byte.
  - **Old projects.** A project without a map file reads each handle as
    today's catalogue assignment (E-Verb 27, MINIVERB 23 and so on): a
    module's package keeps that number as its preferred handle. Projects
    from static builds and from bases before the map open as they did.
  - **Versions.** The map records each module's parameter-layout number. A
    module that changes what its stored knob values mean raises it, and the
    unit converts them (when the module carries a conversion) or says so,
    instead of burning a new id.
  - **A module that replaces a stock effect in place** (Sidechain Compressor
    over COMPRESSOR, 24) does not fit this form; in the dynamic form it is a
    module with a handle of its own.
- **Missing modules: reported and caught** (owner, 11 October 2026). A track
  naming a module that is not installed runs stock's null stub, dry, never
  another module and never a crash; its stored knob values stay untouched.
  With the map, the unit names what is missing (for example `MISSING:
  E-VERB`) when the project loads, and the vendor interface reports the
  missing identities so the site can offer to install them. Installing the
  module makes the manager look again and park those slots until their
  code is bound, so the effect starts from its init with the project's values
  (emulator, below). On stock 1.40C, or a base without the loader, every
  unused id has stock's NONE descriptor in both FX tables and dispatches to
  the null stub, so such a slot shows and runs as NONE and keeps its byte
  until edited (read from the stock tables, not yet run).
- **Built (11 October 2026).** Packages carry the module's name and layout
  number (ABI 6, `cb9e9f37`); the loader takes a module's effect id as its
  preferred handle and the base gives the one it gets (`b0ab0b3a`). The map
  (`fxmap.c`, `fxmap.s`, `51d1d6d2`) lives in battery RAM at `0x100fe000` (1
  KiB, checksummed; nothing else uses it) and rides in `project.work` as
  `#MODWERK_FX=<handle>:<module id>:<layout>:<name>` lines, one per handle the
  project names in any bank. The base hooks stock's project loader's head
  (`0x400866e2`), the loop's next line, where every line ends whoever skipped
  it (`0x40088224`), the writer after PATTERN_CHANGE_AUTO_SILENCE_TRACKS
  (`0x400888c8`) and the end of the engine's project load (`0x4008540e`). The
  first three sit beside the seams PLAY MODES and SCALE QUANTIZER patch (until
  11 October the map took PLAY MODES' own, which would have refused PLAY MODES
  on this base; see "Old projects on the new base" below). A loaded project naming an installed module at
  another handle, or another module at one it holds, rebinds in two steps: the
  module lets go (its slots run dry while the manager retires its code), then
  takes its handle once the manager is idle.
  - Host test (`test_dsp.c`): lines in and out, legacy defaults, a failed load
    changes nothing, handles follow the map, the two-step rebind.
  - Emulator: E-Verb on both cores; an old project naming E-Verb without lines
    runs its slots dry and reports it (`module-set`); installing the ABI 6
    package restores both slots from init (`module-restored`).
  - On the unit (`dsp3-M2`, base `be9dd505…`, flash-safety check passed): the
    project still named E-Verb, not installed: its id ran dry and the unit
    reported it. Installing it restored T2; picking it on T6 loaded it on core 0.
    PROJECT > SYNC TO CARD wrote one `#MODWERK_FX` line, and PROJECT > CHANGE to
    the same project read it back (map generation 2), with E-Verb still bound
    and no errors. After a RAM boot (modules gone, battery RAM kept) the map was
    still there and E-Verb's slots ran dry and were reported.
  - Missing modules, reported (`dsp3-M6`, 11 October 2026): the unit says
    `MISSING E-VERB` when a module goes missing and again whenever a track
    running it is selected, because at boot the first report lands behind
    stock's LOADING FILES bar. Stock's popup slot (`0x460d175c`) reads open
    (`0x21`) long after the bar is gone, so it cannot tell when to say it. The
    popup sizes its box for capitals only (`MISSING E-Verb` showed as `MISSING
    E-V`), so the name is upper-cased; it stays about 1.5 s (`0xa0`). The
    vendor interface answers MISSING (`0xC1`, bRequest 14, wLength 316): "MWM",
    a count, then per handle its number, layout, module id and name, for
    every module the project names in any bank that nothing installed answers
    for. On the unit: `[{handle: 27, layout: 1, module: 873d83cc, name:
    E-Verb}]` (`npm run device -- missing`). From S56 (12 October 2026) wValue is the first entry and a reply holds
    at most 13, so a host asks on while pages come back full; page 0 is the reply from before (fxids.h).
  - **Chooser rows and FX pages at runtime** (`dsp3-R1`, base `f58b9ecf…`, 11
    October 2026). A package now carries its page as a recipe (ABI 6 flag 1, the
    module image's head; `build.py` from the catalogue's descriptor and menu
    recipes through `scripts/octatrack-module-page.mjs`): the stock donor
    descriptor's address and SHA-256, the integer and text patches, the
    inherited enable bits and each formatter's code, with its module-relative
    relocations (for the loader) and descriptor-relative fixups (for the base).
    No stock bytes. When the module registers, `fxpage.c` checks the donor
    against its hash in the running firmware, builds the 0x192-byte descriptor
    in base RAM, gives it the module's handle as its effect id, fixes up the
    formatters and lists it: the choosers read the base's own lists (the build
    points stock's six references at them), and FX1_IDS, FX2_IDS, FX1_ID2POS and
    ID2POS name each module id's descriptor and row. The base no longer composes
    module rows into the image; `octatrack-base-choosers.mjs` is gone. A recipe
    that reaches past its image or names the wrong donor is refused. The stock
    effects' code is stored three bytes a word and unpacked at the first tick:
    the image had passed the 1.25 MiB a RAM boot takes.
    - Host test `test_fxpage.c`; the loader's host test covers the flag.
    - On the unit: FX2 ended at DARK REV with E-Verb missing; installing it
      added an `E-Verb` row after DARK REV; picking it loaded it on core 0 with
      its own pages (TILT PRE REV EDCY ESIZ; SIZE DCY ABSB DPTH SPD MIX), and its
      REV formatter, module code, showed `OFF` and `ON`. With no track running it,
      removing it freed core 0 and took the row away.
  - **E-Verb's sound on the unit** (`dsp3-R2`, 11 October 2026). A clap from the
    card on T1 (core 1, steps 1 and 9) and T5 (core 0, steps 5 and 13), main out
    recorded over USB audio for 8 s, E-Verb on both FX2 slots against NONE: after
    each of the 16 hits the level 200 ms later was -13.9 dB with E-Verb and
    -41.2 dB dry, 400 ms later -37.4 dB against silence. Both cores reverberate.
    Set up and run entirely from the Mac (`npm run device -- do`, `ui`).
  - **Old projects on the new base** (owner, 11 October 2026: a user who moves
    to the new base and opens old projects must find them working). Checked:
    - A stock 1.40C project and one saved with E-Verb before the map open as on
      stock (`old_projects.py` stock-fx, module-set, module-restored; emulator).
      Projects without map lines read today's catalogue assignments, which
      cover every FX id a released build used (main's chooser metadata has
      only these; Shimmer's 30 never shipped).
    - The map's seams moved off PLAY MODES' (`build_core.py`'s
      `catalogue_overlaps` now fails the build when any base site meets the
      stock bytes a catalogue module patches or keeps; USB AUDIO OUT and MIDI
      SCENES are the listed exceptions). A project naming E-Verb at handle 9,
      which no default names, by its line beside PLAY MODES' and SCALE
      QUANTIZER's lines bound E-Verb there once installed (`module-lines`,
      emulator), and SYNC TO CARD wrote the line back (`save`, emulator).
    - A handle the project uses for a module neither its map nor the catalogue
      names is no longer handed to another module (it would have played the
      other module with the unknown one's knob values; `test_dsp.c`).
    - On the unit (`dsp3-R5`, base `404dd11a…`): SYNC TO CARD wrote the line
      and PROJECT > CHANGE to the same project read it back (map generation
      10), E-Verb bound on T1 and T5 throughout, nothing missing, no errors.
      `dsp3-R4` before it crashed at SYNC TO CARD (`VEC:04`, `ADDR:400888CC`):
      its writer detour returned two bytes into its own jump. Recovered by a
      power cycle and SYNC TO CARD from R3; the build now refuses any base
      jump into the middle of a patched site (hardware traps).
    - Still not seamless: CHARACTER, TAPE ECHO, EUCLID and SIDECHAIN
      COMPRESSOR have no package for this base, so their tracks run dry and
      are named; SIDECHAIN replacing COMPRESSOR in place needs the owner's
      decision. A module's own project lines (PLAY MODES, SCALE QUANTIZER)
      are dropped by a save while the module is not installed, so the
      migration should install the user's modules before projects are saved.
      A new base refuses the saved module set (another configuration hash), so
      the site reinstalls after a base update. Octabam firmware's projects are
      not checked.
  - **TAPE ECHO, EUCLID and SIDECHAIN COMPRESSOR** (owner, 11 October 2026:
    port these three; sambanks modules such as CHARACTER are not packaged for
    Modwerk; SIDECHAIN replaces COMPRESSOR in place; a new base refusing the
    saved set is fine). Elekloader's converter refuses hybrid modules, so
    `build.py --octabam MODULE` assembles a module's own units from its
    manifest, links them after its page recipe, turns its jmp/jsr detours into
    stock-code sites (stock hashes checked) and adds its DSP code: one package.
    Their ColdFire code names their effect id (`TE_ID` 15, `EU_ID` 29), so the
    package pins it (ABI 6 flag 2): the base gives that id or refuses, and never
    moves it. The image limit is now 128 KiB (Tape Echo's tone table alone is
    86 KiB); a replacement holds old and new at once in the 256 KiB pool.
    - TAPE ECHO (111,400 bytes, 17 relocations, 2 sites, a 5-word DSP stub):
      emulator `pick` and `beside` passed (base `e4f30366…`). On the unit (same
      base): installed and accepted, picked on T1 and T5 from its own chooser
      row, the clap pattern recorded over USB: after each clap, repeats about
      every 140 ms at -24, -30 and -38 dB against -53 dB dry, on both cores
      (TIME 64 FREE, feedback 64, its defaults). Frames ran, no errors.
    - EUCLID (7,940 bytes, 10 relocations, 3 sites, 395 DSP words; FX1 and FX2
      as in the catalogue; 143 executed instructions a sample, its README's
      2,276 per 16-sample block): its page needs the shared wide dial, so the
      base now owns Octabam's wide-dial hook (`0x40047a3c`, `fxpage.s`) with a
      runtime table that a listed page fills from its recipe (a formatter's
      wide maximum rides in the entry's spare byte); its mode names (TYPE, OUT)
      come from the page's mode formatters. Emulator `pick` and `beside` passed
      (base `06672460…`). On the unit: picked on T1 and T5, its page read FREQ
      RES DEPTH / DEC STEPS PULSE (DEC: OUT is ENV), STEPS stepped 16 -> 18 by
      two values; the clap pattern came out -8, -8, -18, -18 dB per bar against
      a flat -15 dB dry: its sequencer gates the filter in time on both cores.
    - The base image: the startup animation (`ea0192fc`) and this left a
      DSP-loader development base 3.5 KB over the 1.25 MiB a RAM boot takes.
      `selection.c`'s 6 KB paste buffer now sits in .bss, which the core clears
      at boot; 2,804 bytes are left.
    - SIDECHAIN next. It needs DSP code resident on both cores while it is
      installed (its tap publishes every track's audio every block, for
      cross-core keys), two-word sites in stock's dispatcher on each core, a
      site in COMPRESSOR's own code (the base's RAM copy of the stock
      package), Y $7f0-$9ff on both cores and, for cross-core keys, the last
      $202 words of each core's half of the shared window (the tail of local
      track 3's FX2 buffer), and a page that replaces COMPRESSOR's in its row.
  - **DSP memory inventory** (emulator, base `7c044b2f…`, 11 October 2026):
    two runs with `--dsp-dirty` and different seeds, stock effects on every
    track and slot (`stock-fx`), E-Verb picked on T1 and T5, all of X and Y
    dumped at the end; a word the two runs left different was never written.
    - Untouched in runs of 64 words or more, per core: X $2840-$3f7f (A) /
      $3fff (B), $5840-$600a, $7a92-$7fff (A) / $803f (B), $8340-$857f (A
      only); Y $795-$fff and $1800-$1bff and $325c-$3fff (A), $7a5-$5377 (B),
      $7ded-$7fff (B). Above X $8d98 / $8858 and Y $c000 up to $30bff the
      emulator's flat memory is untouched too; whether the chip has RAM there
      is not checked.
    - Sidechain's Y $7f0-$9ff is free on both cores.
    - The shared window is FX2 delay buffers: each core has four 16K FX2
      blocks (`buffers.c`: Y $4000 and $8000, and $30000 and $34000 on core 0,
      $38000 and $3c000 on core 1), and this base hands them to whichever slots
      read a buffer. Stock itself writes only its per-frame staging
      ($30000-$30047) and core 1's mailbox ($38000-$3800f) there (Octabam's
      `dsp_ranges.py`). With all four Parts run (`parts`), the untouched words
      left in the window were pieces of buffers the run did not fill, so there
      is no free shared memory to move Sidechain's region to.
    - Sidechain's region is the last $202 words of block $30000 (core 0) and
      $38000 (core 1). Stock effects reach at most +$3DA2 of a block (its
      author's measurement), so they fit beside it; E-Verb, MINIVERB and AIR
      CHORUS use the whole block (E-Verb clears 128 x 128 words). With the
      buffer allocator treating that block as 15,870 words while Sidechain is
      installed and giving the whole-block modules the other three first, a
      module is refused only when it would be the fourth whole-block user on
      one core's FX2 at once.
  - **Status page and live meters** (owner, 11 October 2026: CPU load, each DSP core and the memories,
    read from a distance and over USB for development without opening anything). `status.c`, base
    `fb639d29…` (S11), on the unit:
    - CUE + PROJ opens it as a dialog over the screen, stock's style (frame, title, rule; NO or CUE + PROJ
      closes it, and while it shows it takes every key and encoder, so the screen behind is as it was):
      bars for the ColdFire and each DSP core with a peak tick (the core's window, the CPU's last four
      seconds), then each core's DSP budget as admission books it (since 14 October 2026: DSP FULL comes from it,
      not from the measured load), each core's code arena and the module pool. FUNC + NO was the first pick: stock's disarm-all (owner). CUE held while PROJ
      is pressed otherwise just opens PROJECT. `npm run device -- stats` reads the same figures from the
      report (version 11, 78 words) whether or not the page is open.
    - PROJ > SYSTEM > MODWERK (owner: a menu entry that also teaches the shortcut) opens a short dialog
      first: what it shows and "hold CUE, press PROJ" to open it anywhere, YES on to the status, NO back
      to the menu. SYSTEM's descriptor stays where it is (stock compares its address to block PROJECT and
      SYSTEM while `0x80000088` is set); its count goes from 6 to 7 and its rows pointer to the base's copy
      of the six stock rows plus MODWERK (base `3fe99d6b…`, S12, on the unit: the row, the dialog, the
      status, and NO back to the list with the row still selected). RAM-boot room: 1,576 bytes.
    - **Superseded by PROJ > MODWERK (owner, 12 October 2026: Modwerk's items in a category of their own, as
      Octabam's BRAIN; and "load per module").** SYSTEM is stock again. MODWERK is a fifth root category: the root
      window is five rows tall and stock fills four, so `build_core.py` copies the four stock root rows, appends
      MODWERK (its icon, one long per column with the stock categories' shared second plane, and a list
      descriptor shipped initialised to seven visible rows) and sets the root count to 5 (Octabam's MAINMENU.md
      sections 1-5). Its rows: LOAD (the status page), MODULE LOAD (new: each installed module, what its instances
      cost on each core as a share of that core's DSP budget (of the frame until 14 October 2026), from its own cycle figure, `~` when that is 7/4 of an emulator
      claim; the cores' meters see only their sum), MISSING (the missing-modules page, also when nothing is
      missing) and SELF TEST. Drawn and driven in `ot_emu --mkii` on S55 (12 October 2026: the category, its
      icon, the list, LOAD, MODULE LOAD with no modules, MISSING, SELF TEST); not yet on the unit, and MODULE
      LOAD with modules installed is not seen yet.
    - ColdFire: main's idle spin (`0x4001fc96`, `status.s`) adds up each pass nothing broke, in counts of
      DTIM3, which runs free over 32 bits at about 132 MHz (47,893 counts a 362.8 µs frame). Stopped, near-
      blank project: 40%.
    - DSP: core 1 now has a meter too. Its wait for core 0 (P:$57) is a counted one in the receiver
      (`c1wait`, X:$2840, free on core 1 in the inventory); its frame hook publishes the window as core
      0's does. Calibrated with 1,000 cycles a frame on each core (`--dsp-burn`, negative for core 1): core
      0 50.0 fewer passes (20.0 cycles a pass), core 1 69.1 (14.5). Same project: core 0 42%, core 1 32%.
      The page reads each core's least, most and summed idle passes by PEEK, 24 bits a tick (72 a core).
    - Costs: nothing while hidden but the idle spin's counting (idle time) and a PEEK a tick; the page draws
      only while open. A development base with it has 2,864 bytes of RAM-boot room left.
    - One RAM boot of S6 failed (the unit off USB until a power cycle); the next boot of the same image
      worked, after S5 had booted twice. The earlier one-in-six RAM boot failure without USB had a fix.
    - Reading the meters all the time broke picks in the emulator (T5's E-Verb refused): the PEEK reader took
      whatever job was in a core's channel as its answer and released it, the manager's included, and the
      manager refused a transaction whose command found the channel busy. Now the reader touches only its
      own job and pauses while the manager publishes, and a busy channel makes the manager wait a tick. The
      emulator's pick, beside and queue checks pass again (base `fb639d29…`, S11). ot_emu parks main at its
      stock spin after a bench call, so the idle detour takes only main's last init call and leaves the spin.
    - A base build takes about 10 s; an emulator check 5 to 15 minutes (both DSP cores emulated).
  - **Measured loads for the site** (owner, 11 October 2026): the module pages
    show each module's DSP and CPU impact from its manifest, mostly estimated.
    Measure each module on the unit with the load meter, typical (defaults, a
    normal pattern) and worst (dearest settings, trig splits), on both cores
    (core 1's meter is not built yet), and publish both through a pull
    request on main, where the live catalogue comes from.
  - Not yet: rebinding on the unit, the site using MISSING, the other modules'
    pages on the unit (Spectrum and Tape Echo carry formatter units with
    fixups), and EUCLID's shared wide dial.
- **What a project uses.** `modwerk_dsp_used()` reports the module effects
  the current bank names (what runs, and all four Parts, working and saved)
  as one bit per id, for an update to warn before it removes one. Other
  banks are on the card; reading them belongs to the card work.
- **Stored knob values.** They are stored raw in the Part, with no version
  beside them; the map's parameter-layout number (above) is what tells an
  older layout from a newer one.
- **Old projects and stock effects.** Stock effects keep their ids, code and
  parameters. Once they load on demand, the ledger admits the bank's stock
  effects first and modules only in what remains, so a module is refused
  and a stock effect never is: four tracks and two slots give at most eight
  distinct effects per core, and the eight largest stock effects need about
  4,700 words of the 5,395-word arena. Their cycle costs have to be measured
  before the cycle side can make the same promise. In the pilot base,
  PLATE, SPRING and DARK REV are harvested, so an old project's tracks with
  them run dry there: a pilot-only limit, lifted by stock effects on demand.
- **Regression.** A stock 1.40C project with stock effects on every track
  and slot across its Parts, and one saved with an earlier module set,
  must load in the emulator and on the unit with the same effects and
  values as before (planned with milestone 3).

### Milestones

1. **Several ColdFire modules at once** (built, below).
2. **DSP code on demand in the Elekloader base, with the pilot** (built,
   below).
3. **The routes and old projects**: the publication guards for every writer
   of the live FX arrays (Octabam's audit lists the ones still open),
   preloading the union of a bank's Parts, queueing a pick that meets a busy
   manager, the parameter-layout number, stock effects on demand with the
   stock-first ledger, and the old-project regression.
4. **Packages on the card, timing on the unit**: card listing, chooser rows
   from package names, read-only DSP and ColdFire timing in DIAG, and a
   development-only USB command that replays a chooser pick or a Part change
   for scripted hardware runs.

### Milestone 1: several ColdFire modules at once (10 October 2026)

Package ABI 4 adds a module id (ABI 3 packages are module 0, so existing
tools keep working). Up to 32 modules are live, each at its own dispatch
position with its own pool extent. A package that patches a byte another
live module patches, a 33rd module or one the pool cannot fit is refused
before anything changes, and the reason is kept. Memory of a replaced or
removed module is reclaimed once no paused task holds an address inside it
([loader README](../sdk/runtime/loader/README.md#several-modules-at-once)).

- Host: the loader test covers reclamation (64 replacements of a 32 KiB
  module in a 256 KiB pool; a paused task inside a retired module, or
  unknown task state, keeps it), two modules with their own sites, a
  conflict refused with nothing changed, a module moving its own site,
  removal keeping the other, genuine memory exhaustion and a full table.
- Emulator, private base `8c96b9c3…` rebuilt from `68a6f9c0` (flash-safety
  check passed; the same runs passed on `e91856e9…` before the rebase): the
  browser client's lifecycle, the bus-reset and quiet-host cases, then two
  test modules live at once, a third claiming bytes one of them holds
  refused with both still running, one removed and the bytes then claimed.
  PREVIEW VOL, RECORDER LOOP FIX and PLAYMODES, converted by Elekloader and
  each proved equal to its static link, were then live together; a copy of
  PREVIEW VOL under another id was refused; removing RECORDER LOOP FIX put
  its 8 sites back while the other two stayed patched; it was loaded again
  and replaced by itself; removing all three restored every site. Checked
  from RAM dumps at the end of four emulator runs. Emulator evidence only.

The emulator's DSP model runs when Docker gives the container enough shared
memory (`docker run --shm-size=128m`; each DSP core maps a 52 MiB
`/dev/shm` file and the default 64 MiB cap ended the second core with a bus
error), or natively on macOS (Apple clang, cmake). On stock it boots both
cores and runs the uploaded payloads; per-frame figures there are executed
instructions (`--dsp-stopwatch`, `OT_DSP_FRAMETRACE=1`), not modeled cycles
or hardware timing.

### Milestone 2: DSP effects on demand, E-Verb as the pilot (10 October 2026)

`build_core.py --dsp-loader` builds Octabam's DSP dynamic loading into the
base, unchanged but for three seams (`DSP_EDITS`): its frame-head receiver
on both cores, its transport on the frame DMA, its allocator and manager,
and its guards on the stock FX1/FX2 selectors and the manual Part change.
Module packages fill its catalog instead of the build (`dsp.c`):

- **Where the code goes.** The receiver (340 words) and a 2,384-word table
  (64 saved dispatch entries and a 2,320-word arena) take the program words
  of PLATE, SPRING and DARK REV on each core, which leave the FX2 chooser
  and dispatch to stock's null stub, as Modwerk's loader-free builds do
  when module code needs room. `dsp_loader.py` checks that the three are
  one run, that no remaining effect calls into it and that the frame head
  is the instruction the receiver replays; dry slots use stock's own null
  stub, so the receiver carries no stock words.
- **The module form, first cut** (package ABI 5): relocatable DSP words and
  relocations, init and process entries, the effect id, its slots, its
  state words, the delay-buffer words it reads and its worst-case cycles
  per sample with their kind (executed, modeled, hardware).
  `build.py --dsp` makes one from a package Modwerk's builder already
  proved and checks those proofs again. The chooser rows come from
  Modwerk's own composer (`scripts/octatrack-base-choosers.mjs`).
- **Admission.** On install: a module id the stock dispatch leaves free,
  code that fits each core's arena, at most 132 state words, a buffer that
  fits the slot's block (3K FX1, 16K FX2) and a known cycle figure within
  the allowance. On a pick: the allocator places the code once per core
  and charges each instance's cycles against 2,808 per sample and core
  (3,120 less the 10% margin); a pick that does not fit is refused before
  anything is written, with `DSP MEMORY FULL`, `DSP FULL` (cycles; `DSP OVERLOAD` before 11 October 2026) or
  `DSP LOAD FAILED` on the screen, and the track keeps its effect. Removing
  or replacing a module whose effect a track runs is refused.
- **Scripted picks.** `modwerk_dsp_pick(slot, track, row)` queues an FX1 or
  FX2 pick or a manual Part change that the sys task's tick replays through
  the stock selectors and their guards, as the panel would. The emulator
  check calls it through the bench; a development USB request for hardware
  runs still has to be wired in `ep0.c`.

Emulator (`ot_emu --dsp`, Docker `--shm-size=128m`), private base
`ae541549…` (`--dsp-loader --dev`, flash-safety check passed; the same runs
passed on `11905c0c…` before the rebase), a private copy of the owner's
Template Live project on the card, driven by
`scripts/verify-octatrack-dsp-loader.mjs`:

- E-Verb installed over USB, then picked on FX2 of T1 and of T5 through
  the stock FX2 selector (scripted picks): each core received its 1,588
  words in 67 checked 24-word writes, holds them word for word as the
  package relocated to its
  arena, and dispatches effect 27 to them; core 1 ran its process entry
  every frame afterwards (a PC watch). No transport errors.
- Removal refused while T1 ran E-Verb; after FILTER was picked there the
  module was removed, the code retired and core 1 dispatched effect 27 to
  the null stub again.
- A package declaring the most cycles a module may (491 with the stock
  reserve; 1,500 before it): T1 admitted, T2 (the same core) refused with
  the message and left as it was. A 1,500-cycle package is now refused on
  install.
- T1's FX2 set to E-Verb in every Part and in the live effects before it
  was installed, as a saved project would: the slot ran dry, the unit
  showed `MODULE MISSING`, `modwerk_dsp_used()` reported effect 27; once
  E-Verb was installed, the slot was parked, its code bound, and T1 ran
  E-Verb again from its init.

These are executed-instruction emulator runs: no audio was compared, and
no timing. Found on the way: the runtime loader allowed stock-code patches
past the bootloader copy, where the DSP payloads' RAM holds the current
bank once a project loads (the bank pointer reads 0x400e21e0); it now
stops at the bootloader copy.

After the first hardware run (`7c33cdf2`):

- **Stock first.** Every slot without a module is charged the dearest
  stock effect: DJ EQ, 330.75 executed instructions per sample at its worst
  trigger split (`stock_dsp_worst.py`, all 13 effects, both cores, the
  emulator; not hardware timing). A module is charged at least that much.
  Eight stock slots therefore always fit a core, and a stock pick never adds
  to what was admitted, so a module is refused and a stock effect never is.
  One instance may declare at most 2,808 − 7 × 331 = 491. E-Verb's 382 fits,
  and four E-Verbs fit on one core. The overlap charge is gone: in the
  switch frame the outgoing effect runs its first sub-block, then the
  incoming one runs its init and second sub-block, so no instance runs
  twice.
- **Queued picks.** A pick made while the manager runs its own transaction
  (a few ticks after any change of the live effects) now waits its turn
  instead of being refused.
- **Harvested reverbs are not silent.** A track with PLATE, SPRING or DARK
  REV shows `FX NOT IN BASE` and opens the FX2 chooser on NONE. Before, it
  opened on its old row, which is now E-Verb's or past the end; that is why
  E-Verb was highlighted on the unit.

Still open:

- No publication guards for queued pattern changes, project loads or Part
  edits (Octabam's `publication.c`). The manager's observer loads what those
  routes publish and keeps the slot dry until then.
- Octabam's frame-DMA hook (0x40004bc0) is the one USB Audio In uses.

### Giving back PLATE, SPRING and DARK REV

In the pilot base those three take the loader's code room. A track with one
runs dry and says so, never silently, but an old project does not sound as
it did. Two ways back:

1. **Stock effects on demand** (target architecture, point 2). Harvest each
   core's whole effect block (6,158 words) and keep the three shared routines
   resident (414 words). Load every stock effect, the reverbs included,
   through the same receiver, from the user's own firmware: the packages are
   built at base build time with the relocation recipes Modwerk's builder
   already has (`src/engine/assets/stock-dsp-metadata.json`, used by its
   disabled `DSP_LOADER` path). The arena is about 5,395 words per core. The
   eight largest distinct stock effects a core can run at once need about
   4,700, so a stock-only Part always fits, with memory reserved stock-first
   like cycles. The reverbs keep their stock Y blocks.
2. **Another code area.** None exists without cost. Core 0's program memory
   is full past the effect block (32 words above P:$1FDF). Core 1 has about
   600 words above P:$1D9F that stock does not load (not audited), too few
   for the receiver and a module. The 16K program map would add 8K words per
   core, but it takes half of the second FX2 Y block, which breaks old
   projects with four buffered FX2 effects on one core, and it is unmeasured
   on hardware.

The plan is 1, after the pilot passes on the unit. The stock-effect
old-project regression must then pass with no harvested effect left.

**Built: every stock effect on demand** (`df8c7d97`, 10–11 October 2026).
`--dsp-loader` now takes each core's whole effect block. The three shared
routines go to the block start (414 words, where Modwerk's static builder
puts them), then the receiver, then the arena: 5,258 words a core, 5,194 of
them code room after the 64 saved dispatch entries. Every stock effect is a
package recovered at build time from the user's firmware with the metadata's
recipes. Each is checked against the recipe's source and adjusted hashes and
against one relocation proof, and its dispatch is the null stub until bound.
Whether an effect's init reads its Y buffer base is read from its code with
the dsp56300 disassembler, as Octabam does, so the buffer manager reserves
blocks for SPATIALIZER, FLANGER, CHORUS, COMB FILTER and the three reverbs.
All stock chooser rows are back. Octabam's DSP DYNLOAD STOCK was the
reference for the layout; the code is Modwerk's.

- Emulator: the old-project regression (`old_projects.py`, stock project
  with stock effects on every track and slot) passes. All 16 banks' Part
  records match stock, and every running stock effect is bound in its core's
  arena from boot: seven on core 1 (3,112 words) and six on core 0 (2,760),
  with DELAY resident, as stock. PLATE and DARK REV were picked on T1 and T5
  (`verify-octatrack-dsp-loader.mjs stock`), and E-Verb beside them on both
  cores (`pick`). No transport errors.
- On the unit (`dsp3-S2`, base `a4766038…`, flash-safety check passed,
  RAM-booted, the blank project): FILTER loaded on both cores by itself at
  boot (441 words, 20 packets each). PLATE REV picked on T1 and DARK REV on
  T5 loaded (core 1 1,035 words, core 0 1,508), each with its own page on
  screen. Then E-Verb was installed and picked on T2: core 1 held FILTER,
  PLATE and E-Verb (2,623 words). The sequencer ran and there were no errors
  or refusals throughout. The project still named E-Verb from the AB3 session
  on T1 and T5 before it was installed; the unit said it was missing once.
- Not yet: the sound of loaded stock effects against stock (a null test on the
  main out), the time from pick to sound, and a full stock project on the unit.

**DSP load meter, core 0** (`128c1bca` and the core-0 burn after it). Stock's
own main loop on core 0 (P:$4b–$53) polls DMA 2 for the next half buffer and
counts its idle iterations in b; the frame code stores the count at X:$3f81
(P:$92). The receiver runs at the frame head before that store, so it keeps
each 1,024-frame window's least, most, summed and missed (no idle) counts in
program memory. `npm run device -- meter 0` reads the last window back with
PEEK. Calibrated on the unit with `--dsp-burn` (core 0 spends N more cycles a
frame in a DO loop of `nop`s), on the same project, stopped:

| Base | Burn | Idle iterations (least / mean / most) | Missed |
| --- | --- | --- | --- |
| `dsp3-S3` | none | 1,890 / 1,920.7 / 1,922 | 0 |
| `dsp3-C1` | 1,000 cycles | 1,841 / 1,870.2 / 1,872 | 0 |
| `dsp3-C2` | 2,000 cycles | 1,790 / 1,820.3 / 1,822 | 0 |

So one idle iteration is 20.0 cycles on the chip (19 by the instruction
table; the peripheral read costs one more). Frames run at about 2,759 a
second: 16 samples at 44.1 kHz. With the board's measured clock (4,532 cycles
a sample, 72,520 a frame), that project leaves core 0 about 38,400 cycles a
frame idle (2,400 a sample) and keeps it busy for about 34,100 (2,130 a
sample, 47%): stock's own work, FILTER on T5–T8 and DARK REV on T5. The idle
count covers only the main loop's wait; the frame's own waits for the host
(P:$97) and DMA (P:$a3) count as busy, so this is conservative. Core 1 keeps
no idle count (it waits on a flag from core 0 at P:$57 and P:$8d); measuring
it needs a counting wait patched in there. Not yet: playback, busy projects,
distributions beyond least/mean/most, and core 1.

A first calibration build burned with `rep` on both cores (`dsp3-B2`,
2,000 cycles a frame): the unit hung at its Elektron logo after the RAM boot
and needed a power cycle. The emulator ran the same build without trouble.
Either core 1 had no room for 2,000 more cycles, or `rep`, which holds off
interrupts while it repeats, starved the DMA interrupts; not separated. The
burn is now core 0 only and interruptible.

**More module FX on demand** (11 October 2026). These modules have chooser
rows after E-Verb's and load as packages the same way (recipes in the
[elekloader README](../sdk/machines/octatrack/elekloader/README.md#dsp-effects-on-demand)).
Each package declares the module's own figures, per instance:

| Module (id) | Words | Slots | Cycles per sample (kind, source) | r7 block | Y buffer |
| --- | --- | --- | --- | --- | --- |
| MINIVERB (23) | 532 | FX2 | 411, modeled: its static sample-loop bound; executed peak 23,360 per core and block for four (TESTING.md) | $00–$3F | 16K |
| TAPEHEAD (31) | 422 | FX1, FX2 | 295, modeled: `cycle_count.py`, every setting; executed worst 18,000 per core and block for four (TESTING.md) | $00–$35 | none |
| AIR CHORUS (30) | 795 | FX2 | 395, executed: 394.6 net worst, all splits, E-Verb's method (evidence/stock-comparison.json); its static bound, 732 modeled, is over the 491 a module may declare | $00–$83 | 16K |
| SPECTRUM (10) | 1,391 | FX1 | 262, modeled: pricer words per sample in ISO, its dearest mode (README) | $00–$77 | none |
| MODULATION (11) | 1,575 | FX1 | 354, modeled: pricer words per sample in its LINE loop (README); four instances beside a reverb overran on hardware (image 88) before that optimization, not retested since | $00–$6F | 2K of the 3K FX1 block |

Emulator, private base `d47307e8…` with ABI 6 packages
(`verify-octatrack-dsp-loader.mjs beside:MODULE`): each module installed over
USB and picked on T1 and T5 (TAPEHEAD on FX2 of T1 and FX1 of T5; SPECTRUM
and MODULATION on FX1), then PLATE REV on T2 and DARK REV on T6. Each core
held the module word for word beside its reverb, dispatched its effect to it
and took every packet, none rejected; no transport errors or refusals. E-Verb's
`pick` still passes. Not yet on the unit.

| Module | Resident words (core 1 / core 0) | Packets taken (core 1 / core 0) |
| --- | --- | --- |
| MINIVERB | 1,126 / 1,599 | 71 / 91 |
| TAPEHEAD | 1,016 / 1,489 | 66 / 86 |
| AIR CHORUS | 1,389 / 1,862 | 82 / 102 |
| SPECTRUM | 1,985 / 2,458 | 106 / 126 |
| MODULATION | 2,169 / 2,642 | 114 / 134 |

AIR CHORUS's 256-word sine table goes into the arena with its code: the loader
places a package in one block per core, which its four contiguous placement
proofs cover (`build.py` checks them again), so its split form is not needed.
SPECTRUM's SHPE formatter, like every module's parameter pages, is built into
the base by the chooser composer, not carried by the package. SPECTRUM declares no buffer,
so none is reserved for it; its init reads its slot's entry only to tell FX1
from FX2, and an FX1 entry only ever holds an FX1 base (`buffers.c`).

EUCLID (29) is not ported: its sequencer is ColdFire code (`control.c`,
`hooks.s`) that three stock-code detours call (0x4000d562 after the scene and
LFO writes, 0x4009c3d4 and 0x4009c4d4 at PLAY). A runtime package takes
stock-code sites only from an Elekloader-converted `.elemod`, which `build.py`
refuses beside `--dsp`, and C sources beside `--dsp` get only the tick, draw,
key and encoder hooks. Without that part its filter would run unsequenced.

**Memory policy (owner decision).** The allocator admits the effects a target
actually selects. Room goes to effects in use only: what no slot runs is
freed. A stock pick can therefore be refused when modules hold the room. The
largest stock-only selection a core can run (about 4,700 words) always fits
on its own. Stock-first for memory, like cycles, would need modules to fit
beside the worst stock set, which leaves about 500 words for modules; this
base does not do that.

### Milestone 3, first steps: waiting picks and the union of Parts (11 October 2026)

**Waiting picks.** Before, a pick that met another slot's transaction was
never refused but dropped: the second pick rolled the first one back, and
moving to another track or the chooser cursor cancelled a waiting pick at
the next tick (`selection.c` compared the panel's current track and cursor
with the pick's). Now an FX pick that meets another slot's transaction
waits, the latest per slot (FX1 and FX2 of T1-T8), and is replayed through
the stock setter and its guard once the manager is idle, with its own track
and chooser row set for the call and the panel's put back afterwards. A pick
on the slot whose transaction runs replaces it, as before. A bank or Part
change drops the picks still waiting, since they edited the Part that was
active. The track keeps its effect until its pick is admitted, and nothing
writes stock's FX arrays before (`selection.c` edits in `build_core.py`).

**The union of a bank's Parts.** Every transaction also holds the modules
the current bank's four Parts name, per core, and the manager's observer
starts one when that set changes: a project or bank load, a Part edit by any
route, a module installed or removed. Memory is admitted over the union,
cycles over the target, which is one Part. A pick naming a module no Part
holds yet must fit beside all of them, or it is refused before anything
changes; anything else that does not fit (a bank that never fitted) falls
back to loading what runs. Stock effects still load only as a target
selects them, so for modules this replaces the memory policy above: a module
any of the bank's Parts names keeps its room. A Part change within the
preloaded set needs no DSP job, so it is ready inside its guard and runs in
the same tick, as on stock; queued Part changes, which no guard covers yet,
find their modules bound. No project-load hook is needed: the observer sees
the Parts change.

Emulator (`ot_emu --frame --dsp`), private base `964e631c…` (`--dsp-loader
--dev`, stock effects on demand, 5,127 words of code room a core, module
handles and the per-project map), the Template Live copy, `scripts/verify-octatrack-dsp-loader.mjs`:

- `queue`: E-Verb picked on FX2 of T1, then on the next three ticks E-Verb on
  T5, E-Verb on T6 and FILTER on T6, while T1's upload ran. Three picks
  waited and none was dropped or refused (requested 3, completed 3): T1 and
  T5 run E-Verb, both cores hold it word for word, T6 runs FILTER, and its
  E-Verb pick never reached the manager. The same run on `dsp2-AB3` dropped
  three of the four picks (requested 4, cancelled 3): only FILTER on T6
  landed, and nothing was loaded.
- `union`: E-Verb and three more modules installed (Air Chorus, Modulation
  and Spectrum packages as test fixtures). Part 2 set to Part 1's effects
  with E-Verb on T5's FX2, by a poke (an unguarded route, as a paste or a
  project load would be): core 0 loaded E-Verb while T5 still ran Part 1. The
  Part change to Part 2 then sent no packet to either core, and T5 ran
  E-Verb. Part 1, now inactive, set to the three modules on T1, T3 and T4:
  core 1 loaded them (3,761 words). E-Verb picked on T2 was then refused with
  `DSP MEMORY FULL` (3,761 + 1,588 words in 5,127), though nothing live held
  the other modules; T2 kept its effect and core 1 still dispatches E-Verb
  to the null stub.
- Old projects (item D, `old_projects.py` module-restored): a project naming
  E-Verb on T2 (core 1) and T6 (core 0) in every Part, with E-Verb installed
  once the unit had said it was missing: both slots bound and started from
  their init, the Part records of all 16 banks and the live effects as on
  stock, every running stock effect loaded and bound, no transport errors.
  It passed on `dsp2-AB3` too. The earlier failures were the scratch
  runner's: it mounted a deleted worktree and glued the package's directory
  and path together, so nothing was installed.
- Regressions on the same base: `pick`, `remove` and `missing` passed
  (`cycles` and `stock` too on `b776d374…`, one commit range earlier).

Limits: the stock setter runs with a waiting pick's track in the
current-track byte for the length of the call, so another task reading that
byte meanwhile sees the waiting pick's track; the saved Part copies (RELOAD)
are not in the union; a pick or Part change into a set that fits only after
code is retired is refused, because the allocator never overwrites live
code, and the union keeps more code live; and in `ot_emu` an install right
after another timed out at ENTER unless a bench command came between (on
`dsp2-AB3` too; not understood). No hardware run yet.

### Crash recovery (11 October 2026)

An exception used to stop the unit on stock's exception screen until a power cycle. Now the base
takes the error vectors (access and address errors, illegal and unsupported instructions,
privilege and format errors; `crash.c`, `crash.s`). It writes a record to battery RAM at
`0x100ff800` (vector, PC, SR, the registers, the stack pointer and eight longs above the frame)
and restarts through `boot.s`'s soft reset: DSPs parked, panel and USB reset, nothing armed, so
the flashed base boots as after a power cycle. A base that finds a new record shows "CRASH
RECOVERED" once, 4 s after its start. `npm run device -- do crash` decodes the record;
`crashtest` (development bases) executes an illegal instruction on the next tick.

On the owner's MKII (S16c, `fff2d6f1…`): the deliberate crash was recorded (vector 4 at its PC),
the unit left USB 1 s later and was back 5 s after that on the flashed base, with no power cycle.
A RAM boot afterwards showed the message once. With the vectors installed, S16c ran two minutes
twice without a problem. After the first test the unit once went off USB after the message and
needed a power cycle; that did not happen again.

Limits: a fault inside the handler (a stack pointer that is itself bad) still halts. Projects
come back as the card has them, as after a power cycle. Hosts can read the record only on
development bases so far; the support report should carry it.

### DSP stalls (11 October 2026, found and fixed in S29)

**What happened.** Frames stopped several times on the owner's MKII. The DSP watchdog (`dsp.c`) said DSP STOPPED and shut the loader off. Only a power cycle brought the unit back: a RAM boot from a stalled DSP hangs at the logo, because a hung core does not park.

**The cause.** The runtime loader held off the DSP frame interrupt too long. `switch_to()` and `reclaim()` masked every interrupt while they:
- scanned paused task stacks;
- rewrote stock-code sites;
- switched the DSP effect and built its chooser page.

That took up to about 760 µs on an install and 70–200 µs on a removal. When such a span covered core 0's frame word, core 0 stopped for good.

**The measurement.** Development request 20 masks for a chosen time from the sys tick:
- 100, 150 and 200 µs, 25 times each while playing, left frames running;
- 300 µs stopped them within the first few masks.

The stall record's host ISR showed core 0 not waiting for the host (RXDF clear). The frame interrupt is level 5 and the eDMA frame transfer level 6 (Octabam's KERNEL.md).

**How it showed up.** Install and remove one module in a loop while playing: Euclid stalled at cycles 7, 7 and 10, E-Verb at about 12. So did the S19 qualification, during its cleanup.

**The fix (S29):**
- The loader takes a new machine lock, `modwerk_machine_lock()`. On the Octatrack it is level 4: no task switch, no USB, no storage interrupt, while the frame chain runs.
- It masks fully only to read and write the stock-code bytes and invalidate the code caches.
- The longest fully masked span is now 3,219 DTCN3 counts (24 µs).
- The loader's host test enforces the split: code bytes only masked, stack scans and the DSP switch only locked.

**The check.** 20 Euclid and 20 E-Verb install/remove cycles while playing ran without a stall. At the old rate, about one in ten, that would happen by chance about 1.5% of the time.

The full qualification on S29 then passed with no failures, with a 1-minute soak and no crash test (a crash restart boots the flashed base, which can't be read). Results:
- **Six modules:** each alone on both cores, then all at once, with the second heavy module refused on each core; peaks 68% and 59%.
- **Knob sweeps** on every placed module.
- **Part switches:** 12 while playing.
- **Bank change:** a queued change into another bank and back.
- **Masking:** 924 fully masked spans, the longest 3,219 counts (24 µs).
- **No new stall**, and the Part reloaded byte for byte.

**Tools from the hunt:**
- the stall record (battery RAM `0x100ff900`: why, the loader's report, both packet headers, the live FX, the host ISR; the `stall` and `stalltest` steps);
- `modwerk_masked_max`/`_last`/`_spans` in `runtime.c` (full-mask spans, outermost only, in DTCN3 counts);
- `storm1` (a PEEK re-sent from the frame interrupt: 242,538 packets in 82 s, no stall, so the PEEK always in flight was no clue);
- `mask:N` (request 20).

**Ruled out on the way:**
- the receiver's HCR read-modify-write (stock writes core 0's HCR once, at boot);
- Euclid's frame-interrupt site (E-Verb, with no sites, stalled too).

**Still open:**
- **The S19 restart.** After that stall the unit came back on S19 itself, with no crash record and no power cycle. What restarted it is unknown.
- **The other masked spans.** `dsp.c`'s `recover()` and `boot.c` still mask fully. Both are rare paths, but any span past about 200 µs at level 5 or above stops the DSPs.

### Part switching on the unit (11 October 2026)

First hardware run of the union of Parts, on the owner's MKII. Project LIVE/Dev12, bank A. T1 played a
looped bass sample, and the Parts were switched while playing.

- **Before** (S12, `3fe99d6b…`): modules stayed resident, but stock effects did not. Part 1 has
  COMPRESSOR on T1's FX1 and Part 2 does not, so every switch into Part 1 uploaded COMPRESSOR again
  (9 packets to core 1, 180 words) and every switch out unloaded it.
- **Now** (S13, `bc4e97ae…`): stock effects the bank's Parts name are held too, while they fit
  (`build_core.py`, the manager's `parts()`). If they don't fit, the transaction retries holding the
  modules only, as before. Four switches sent no packet to either core, and each core's code stayed
  at 1,236 and 2,209 words.
- **Sound**: the level dips after a switch the same way whether Part 2's T1 switches to stock
  SPRING REV or to E-Verb (2 ms windows, compared with the same spot a pattern cycle earlier). The
  two Parts differ in more than their effects, and a module adds nothing measurable beyond stock's
  hard switch.
- **Loading at a pick**: E-Verb picked on T5, where core 0 held none of its 1,588 words (68
  packets), ran 117 ms after YES. Picks that upload nothing took the same, and that time is mostly
  the 80 ms key hold, so the upload itself is under about 40 ms.
- **A pattern queued from another bank** (S15, `f9d300a0…`): the union now also holds the Part
  the queued pattern will play. Stock keeps the queued bank and pattern at `0x800065bf`/`c0`, equal
  to the current ones when nothing waits; a pattern's Part is the byte at bank + pattern × 0x8ed8 +
  0x8e57 (upstream Octabam's PARTS.md). With A01 playing, queuing B01 (E-Verb on T5 there) loaded
  E-Verb onto core 0 at once (68 packets, 1,236 → 2,824 words). At the switch each core took one
  packet, a small command for the outgoing bank.
- **TRIG 1 release** (fixed in `eb66b16f`): the status dialog's key handler swallowed every TRIG 1
  release, so a bank change to pattern 1 never landed. Found while setting up this test.

### Keeping the module set across power cycles (built, 11 October 2026)

The owner decided yes. `modset.c` keeps the accepted set in RAM, each package
exactly as the host staged it (`boot.c` hands it over at prepare and at
ACCEPT; a removal drops the module). The engine task writes it, behind the
logger's gate and with the logger's stock file calls, to `/MODWERK0.SET` and
`/MODWERK1.SET` in turn ("MWST", version, generation, count, length, the
base's configuration hash, a SHA-256 over the packages), reading each write
back whole; a failed save is retried ten seconds later. Three seconds after a
boot, once the gate is open, the newest whole set this base wrote is installed
through the runtime loader as a USB install would be. Holding FUNC skips it;
another base's set or a damaged file installs nothing, and a damaged newer
file falls back to the older one. Host test `test_modset.c` (pretend card).

On the unit (`dsp3-R3`, base `bda75ad3…`): no set at the first boot; installing
E-Verb saved generation 1 with one module; a RAM boot of the same base (RAM
gone, card kept) restored it, E-Verb loaded on both cores where Dev12 names it,
and MISSING reported nothing. Not yet: a real power cycle into a flashed base
that has this (the flashed `usbtest9` predates it), the FUNC skip on the unit,
and what the site offers when the base changed (the set is then refused).

When the base changed (24 October 2026), the site syncs the set again: the self-test record says `saved` 4 (another
base's set) and nothing is installed, so `PutBackModules` opens the usual review, self-test and Keep for the modules
this browser last read from the unit under another base (`modulesToPutBack`). The base can't load another base's set
itself, because base-bound packages (module_packages.py "base") are linked to the base that saved them. Beta
diagnostics from 20–24 October showed every base update leaving testers' units empty until then.

The plan it follows:

- **What is kept.** The accepted set, the packages exactly as the host staged
  them, back to back behind a header: format version, the base's
  configuration hash, count, and each package's length and SHA-256.
- **Writing.** The engine task writes it after the host's ACCEPT and after a
  removal, behind the logger's card gates (not while playing or recording,
  not in USB disk mode). Two fixed-size files are written in turn with a
  generation number and the newest complete one wins, so a power loss
  mid-write keeps the previous set; nothing is deleted or renamed, as with the
  logger's files.
- **Booting.** Once the engine task is idle after boot, the base reads the
  newest file and installs each package through the runtime loader with the
  same checks as a USB install. Order does not matter: a project that names
  a module before it is installed runs those slots dry, then the manager
  binds them and they start from their init (`missing` and item D above).
  With per-project handles, the project's map file then names the effects.
  DSP code still loads only when a Part names it, so boot grows by reading a
  few kilobytes per module.
- **Refusals.** Another base's hash (a base update, another unit's card), a
  bad package or a refused admission: the unit boots without modules, says so
  once, and the host installs again. A key held at boot skips the file, so a
  module that breaks booting cannot lock the unit out; removing the card does
  the same.
- **Checks.** A host test of the file format and its refusals; in the
  emulator, install over USB, read the file back from the card image, then
  boot `ot_emu` from that card without USB and require the module live and
  the project restored (`old_projects.py` module-restored); on the unit, a
  power cycle with the owner.
- **For the owner.** Whether it is on by default, one set per card or per
  project, and what the website offers when the base on the unit changed.

### Decisions for the owner

- A short fade on a module switch, or exactly stock's hard switch with fresh
  state. A fade costs cycles in the switch frame and needs the old and new
  instances at once.
- Interim, until the owner decides: 2,808 cycles per sample and core
  (3,120 less 10%), each slot without a module charged the dearest stock
  effect (331 executed instructions, emulator); modeled or executed figures
  admit in development bases only; the 256 KiB ColdFire pool stays.
- Decided (target architecture above): stock effects load on demand after
  the pilot passes on the unit, and the union of a bank's Parts is preloaded.
- Whether the selected module set persists across a power cycle (read from
  the card at boot); a plan is above.
- Decided (11 October 2026): preloading the modules a bank's Parts name may
  refuse a pick sooner (the owner accepts it), and installed modules survive a
  power cycle (read from the card at boot; to build).
- Decided (11 October 2026): effect ids are per-project handles named by a
  map file in each project's folder; today's assignments are the default for
  projects without one; missing modules are reported by name and run dry.
- Whether a module that replaces a stock effect in place (Sidechain
  Compressor) is ported with its own id, which changes what old projects
  with COMPRESSOR hear back to stock.

## Plan: the site on the Elekloader core, and Octabam retired (owner, 11 October 2026)

The base already builds on the Elekloader core. The site and CI do not: `scripts/build-module-packages.py`
(run by `pages.yml` and `module-pr.yml`) compiles every module through Octabam's remix registry,
`tools/build` and `platform/*`, and the browser composer (`src/engine/compose-os.ts`) builds a whole OS image
from that output. One source hash covers `sdk/octabam/{modules,platform,tools,dsp,licenses}`, and about 30
Octabam files are byte-pinned by tests. So nothing under `sdk/octabam/` can go until the site no longer
needs it. The order (owner: yes to all three):

1. **Packages from source, without firmware, on the Elekloader path.**
   - **DSP effects.** Assembled with Elekloader's `dsp_assemble`, into the package form `build.py --dsp` reads.
     MINIVERB 0.2.0 already rebuilds byte for byte this way (11 October 2026).
   - **FX page recipes.** Generated by the new builder, so `descriptor-recipes.json` and `menu-recipes.json`
     no longer come from Octabam. The donor descriptors stay named by address and SHA-256; no stock bytes.
   - **ColdFire modules** (Tape Echo, EUCLID, the hooks). `build.py --octabam` copies the stock bytes at
     each patch site into the package, so it needs the OS and cannot run in CI. Loader ABI 7 carries their
     SHA-256 instead, and the base checks it against running memory before patching.
   - Elekloader's module loader insists on three Octabam files (`tools/remix/__init__.py`, `schema.py`,
     `stock_guard.py`). They stay, or move beside the module sources.
2. **The site builds the base and loads modules over USB.**
   - `buildBase`: the user's stock OS in, the base out. This is `build_core.py` through Elekloader's browser
     kit (`vendor/elekloader/kit`); the base install dialog has the seam. Built (12 October 2026): the firmware
     worker fills the committed, stock-free package from the user's file and the kit links it, byte for byte
     `build_core.py`'s `.bin` ([the base in the browser](../sdk/machines/octatrack/elekloader/README.md#the-base-in-the-browser)).
   - `prepareUpdate`: the module set's packages from step 1.
   - `stressTest`: the self-test (plan below).
   - The public path becomes "install the base once, then sync module sets". It replaces the whole-OS
     composer. A downloadable `.bin` of the base stays for users without WebUSB.
3. **Narrow the fingerprint, rebuild once, then delete.**
   - The source hash covers only what the new path reads. The packages are rebuilt and re-imported once,
     with the Analog BD proofs regenerated (they need the stock OS, so locally).
   - The pins and doc-coupled tests are updated.
   - Then the old Octabam parts go in one commit: `tools/remix` beyond the three files, most of `tools/build`
     and `tools/verify`, `tools/harness` but `dsp_host`, `tools/experimental/dsp_dynload`,
     `platform/dsp-dynload{,-stock,-stock-b}`, the Makefile and its scripts, the per-module Octabam scripts,
     and the remixer docs.
   - Kept:
     - the emulator sources and its three probes;
     - `dsp_host`, the dsp56300 patch and `vendor.sh`;
     - the useful hardware and capture tools (`usb_probe.py`, `rec.swift`, `ot_project.py`, `emu_card.py`,
       `lcd_view.py`, `usb_host.py`);
     - the DSP loader (`platform/dsp-dynload-transport`), `platform/usb-midi`, the module sources, the
       licences, and `sdk/octabam/AGENTS.md`.
   - The emulator itself is built from the upstream checkout (`npm run upstream:tools -- --update`, then
     `make setup && make emu-cf` there).
4. **Qualification and release.** The owner's hardware runs, then the public switch.

Sizes, roughly: step 1 a few days (ABI 7 and the recipe generator are the work); step 2 the largest (the
browser base build); step 3 a day once 1 and 2 hold. Until step 2 ships, main's site keeps the composer, and
this branch stays out of main.

Emulator update (11 October 2026): upstream Octabam main `67e5ea3` builds natively on the Mac (`make setup &&
make emu-cf`, about 40 s, no Docker). It boots our base: Sam's REMIX SWITCH work, which the old pin needed, is
on main now. It also recognises the base's idle detour by itself. The `pick` scenario passes on it
(`~/.cache/modwerk-octatrack/emu/run-native.sh`, 3 min 51 s).

## Plan: a stress test after every module-set sync (owner, 11 October 2026)

The site already has a step for this: Load onto Octatrack stages the set as a trial, then keeps
or undoes it. A stress test fills that step, and the same results make the bug report.

**On a user's unit** (a production base; no remote keys or RAM reads; the project is never
changed). A SELFTEST vendor request, sent while the trial runs with the transport stopped. The
base runs the test itself and answers with a result record:

1. **Integrity.** Each module's image hash, its hooks and stock-code sites in place, and its DSP
   code on each core read back by PEEK and compared with the package.
2. **Each DSP module, alone.** Bound to a live FX slot for a few seconds (the live array only,
   never the Part, and put back exactly), with silence in: no refusal, no DSP stall, no crash,
   and its mean and peak load from the status meters. That is the module's real cost on this
   unit.
3. **Everything at once.** As many installed effects as the admission ledger accepts, on both
   cores, for about 30 s: the peak must stay below 90% of a frame, with no missed frames and no
   errors. This checks the ledger against the real chip.
4. **Persistence.** The saved set reads back from the card and matches.
5. **Nothing broke.** The crash record count, loader rejections and errors are unchanged.

The site then keeps the set if every check passes. If one fails, it undoes the set, shows which
check failed, and offers the report.

**On the unit itself** (owner, 11 October 2026): the same self-test from PROJ > SYSTEM > MODWERK
(a TEST choice beside the status page). It runs with the transport stopped and shows each check
as passed or failed on a page in the status dialog's style, keeping the record for the next host
that connects. A unit can then be checked without a computer, and a user can run it before
reporting a problem.

**The diagnostic bundle** (attached to a bug report, after a failed test or on request): base
identity, the module set's hashes, the loader report, the status words, the self-test results
and the crash record. No project data. The privacy text has to say so.

**Before each release, on our unit**, a qualification run over the development session
(`device.mjs serve`), scripted from the steps used by hand on 11 October 2026:
- install the set;
- picks on both cores;
- Part switches while playing;
- a queued pattern change into another bank;
- parameter sweeps;
- a deliberate crash and its recovery;
- a 30-minute soak with a meter log;
- a power cycle by the owner.

It reports the same records, so a hardware run and a user's self-test compare directly.

**Order**: the qualification script first (all its tools exist), then SELFTEST in the base, then
the site's step (development builds only, behind `USB_LINK`).

**Built (S34, 11 October 2026): PROJ > SYSTEM > MODWERK TEST.** The same also runs as development request 21 and the session's `selftest` step. It needs no samples, and takes about 3 s for every eight DSP modules.

It runs these steps in order:
1. **Playback.** It presses PLAY; everything below runs with the pattern playing. Each placed effect's knobs are swept in its track's live lane (the bytes locks and LFOs write), so the effects run moving. The Part is never touched.
2. **Modules.** Every installed module's stock-code sites still hold.
3. **Together.** The DSP modules in batches of one per track, each placed as soon as the one before runs bound. One the ledger refuses (its core is full) goes first into the next batch; one refused in an empty batch fails. Each batch runs until both cores' meters have a fresh window (only the peak word is read during the test): no core and not the CPU past 90%, frames running.
4. **Stress.** The last batch is cleared and placed again twice.
5. **Restore.** The tracks get back their effects and lanes, and it presses STOP. NO stops the test at any point and restores the same way.

The page shows each check, the CPU, T1-4 and T5-8 load bars (with a 90% tick) and a progress bar.

On S34 with six modules it passed in 7 s: all six ran, peaks CPU 54%, T1-4 67%, T5-8 57%. The lanes came back byte for byte.

**A trap it uncovered.** The SYSTEM rows' actions can be reached by a YES in an FX chooser with the menu closed. So they now act only while PROJ's menu is open (its input layer `0x400cbf2c`), and they close the menu on the next tick.

**Not built yet:** the PEEK read-back of DSP code against the package, the persistence check, and the site's step after a sync.

### Beta candidate qualification (owner's MKII, 12 October 2026)

Images (private, `~/Downloads/modwerk-usb-test/`, each with `SHA256SUMS.txt`, `BUILD.txt`; every `.bin` passed
`check_flash_safety.py`):
- **Development twin** `beta1-dev/` (`build_core.py --dev --dsp-loader`, 128 ids, source `d3f13a60`), base `113f2954…`,
  MAIN `04535dbe…`: RAM boots only, for driving and qualification.
- **Tester image** `beta-9a86d7e1/` = `Modwerk-octatrack-beta3.bin` (`npm run octatrack:base` at `c9146e66`, main merged in:
  NEW/BETA startup art, INVENTORY, the MISSING fix), `.bin` `9a86d7e1…` (641,216 bytes), MAIN `a20a1005…`, base
  `dc1d7a39…`. Rebuilt from the committed package and equal to `build_core.py --dsp-loader`'s `.bin`. Earlier candidates
  (`beta1`, `beta2`, `beta-browser-*`) are superseded (`SUPERSEDED.txt`).

The unit was found on the flashed `usbtest9`, not on S63 as left (cause unknown). Getting the twin onto it:
- Three RAM boots in the client's 4,095-byte frames failed while staging.
- One with 4,148-byte frames staged and armed, then hung at the logo until a power cycle.
- After the power cycle, one boot with `--chunk 4096` came back in 15 s.
- See [traps](OCTATRACK_HARDWARE_TRAPS.md) for both.

The battery RAM still held an older stall record. It said frames stopped 41 s after a boot, with nothing installed, the
card's set refused as another base's, and T5 FX2 on DELAY. The S63 run had since put id 32 there, so that record
predates today.

**Qualification, `scripts/octatrack-qualify.py --soak 1800`** on the twin, LIVE/MODWERK-TEST bank C (every working Part
equal to its saved one), 16:55-17:36. Passed, no failures.
- **Packages:** E-Verb, Mini Verb, TapeHead, Air Chorus, Spectrum, Modulation, Euclid and Tape Echo (the
  `~/.cache/modwerk-octatrack/pkgs` builds of 11 October).
- **Each alone on T1 and T5:** picks ran 113-128 ms after YES. The highest core peak was 56.8 % (Air Chorus on T5,
  core 0); the base load is 35 % on core 1 and 42 % on core 0.
- **All at once, playing:** E-Verb, Mini Verb, Spectrum, Euclid and Tape Echo placed. The cycle ledger refused
  TapeHead, Air Chorus and Modulation once each core was full. Peaks: T1-4 62.5 %, T5-8 47.7 %, CPU 56.9 %.
- **Knob sweeps** on every placed module, 12 Part switches (each running its own effects), and a queued bank change
  and back.
- **Soak:** 180 meter windows over 35 minutes. CPU up to 65.7 %, T1-4 mean 65.0 % (peak 66.2 %), T5-8 mean 46.2 %
  (peak 47.1 %).
- **Afterwards:** no loader rejection, error or rollback, no new crash or stall record, the Part back as saved, every
  module removed.

The `-both` Spectrum and Modulation packages list on FX2, where their code runs a dry pass (FX1 only, by design;
`spectrum.asm`). So a second run without the soak took the FX1 packages, with the site's beta packages from
`public/octatrack-modules/` (everb 0.1.1, miniverb 0.2.1, tapehead 0.1.2, airwindows-chorus 0.1.2) plus Euclid and
Tape Echo. It passed with no failures; all at once peaked at T1-4 64.7 % and T5-8 71.5 %.

**What the runs found:**
- **The chooser names Spectrum and Modulation "Spectrum79" and "Modulation79"**, their catalogue names, so the
  script now picks by the chooser's name.
- **A track without trigs keeps the other bank's effect after a playing bank change**, until its next trig. TapeHead
  then still ran on T2, and its removal was refused as in use, which is correct. The script now switches Parts there
  and back.
- **MISSING MODULES reopened right after NO or YES**, when modules went missing while it showed: a base bug, fixed in
  `5ad35d5a` (status.c, `test_status.c`). It was seen twice on the twin, which is built without the fix.

**Crash test:** at 17:43:01, on bank A pattern 1 with the transport stopped, `crashtest` was sent. By about 17:43:05
the unit was back on the flashed `usbtest9` without a power cycle. The record (crash 3) can be read on the next
development boot, after the owner's power cycle.

**The tester image on the unit:** after the owner's power cycle (on the flashed `usbtest9`, idle, DIAG clean), one RAM
boot of `beta-9a86d7e1` with `--chunk 4096` came back in 14 s (17:50:20-17:50:34). Then only vendor requests, on bank C
pattern 1 (the owner selected it and checked the screen):
- **IDENTIFY and HELLO:** base `dc1d7a39…`, upload state normal.
- **DIAG:** ticks advanced 180 in 3 s (60 Hz), no refusals, no abandoned stages.
- **INVENTORY:** empty. The card's set was the twin's, so this base refused it as another base's (self-test record:
  saved 4).
- **MISSING:** E-Verb, Euclid, Air Chorus and TapeHead, which banks A and B name. The MISSING MODULES page was open;
  one NO closed it and it stayed closed (the owner, at the unit): the fix, on the unit.
- **`scripts/verify-octatrack-module-sets.mjs --hardware --selftest`** (the site's OctatrackLink with
  `public/octatrack-modules`), 18:08:30-18:08:39, passed:
  - load and keep everb + miniverb with the self-test as the stress test: 2 changes, 7.2 s;
  - undo miniverb + tapehead + airwindows-chorus: 3 changes, 1.0 s, back to everb + miniverb;
  - load and keep the same set: 3 changes, 0.2 s;
  - load and keep the empty set: 3 changes, 0.4 s.
  INVENTORY matched after every step.
- **The self-test record afterwards:** passed, 2/2 modules intact and ran, peaks T1-4 41.0 %, T5-8 55.9 %, CPU 44.3 %,
  longest frame 433 us, card set saved and read back (the empty set). DIAG: 100 vendor frames, 5 refused as busy and
  retried, no abandoned stages. INVENTORY empty at the end.

The crash record of the crash test is still unread: the tester image has no development requests.

**Flashed (12 October 2026, 18:11).** The owner then flashed `Modwerk-octatrack-beta3.bin`, so the unit's flashed base
is now the tester image. Over USB with vendor requests only, the agent installed and kept E-Verb + Mini Verb with the
self-test, and the card set was saved (2 of 2). Then three boots:
- a power cycle restored the set (edge case 16, MODULES LOADED);
- FUNC held at boot skipped it (edge case 15, MODULES SKIPPED, nothing installed);
- the next normal power cycle restored it again.

Details and the deferred popup issue are in
[OCTATRACK_MODULE_EDGE_CASES.md](OCTATRACK_MODULE_EDGE_CASES.md#results-on-the-owners-mkii-12-october-2026). Since
the flash, a crash restart or power cycle returns to `dc1d7a39…`. It has the S43 tick, so it should RAM-boot with the
default frames; that has not been tried.

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
- USB Audio migration (20 October 2026): the beta base already exposes the
  twenty-channel output, but the catalogue module and its six card layouts
  still have no USB module-set lifecycle. A marker package would misrepresent
  removal: audio would remain enabled in the base. Geometry changes need a
  base-owned settings transaction and host re-enumeration, with exact
  review/trial/self-test/Keep/Undo and recovery across that disconnect.
  Upstream's unified `usb` module reads its six settings from an early CS1
  block at the next boot ([`56e43e53`](https://github.com/sambanks/octabam/commit/56e43e53dd4c6d594f60ce8d3f95f7859fc736d3),
  TRACKS/MAIN/CUE/MASTER/IN/MIDI); that is
  a reference design, not hot switching or a completed Modwerk port. Keep
  settings ownership in the shared base and qualify the supported layouts,
  MIDI, mass storage and rollback before admitting the catalogue selection.
- Migration preparation on 21 October: the private base builder now covers
  all six output layouts, including post-fader TRACKS. Its named stock-data
  recipe removes the 256-word gain curve from the package and reconstructs
  32-bit ColdFire data from the verified local OS, independently of the
  catalogue card module. These are separate per-layout images, not one
  switchable all-profile base. This is build preparation, not a settings lifecycle
  or a physical post-fader result. `InventoryTarget` currently carries module
  IDs and removed stock FX, not `usbAudio`: migration must carry and compare
  the validated device profile too, so unchanged module IDs cannot hide a
  layout change. Outbox output assignments remain host routing, not device
  profile state. The base's immutable build identity, active profile and
  transaction generation must all survive review/reconnect verification;
  today a bus reset aborts an open runtime trial, so intentional
  re-enumeration needs an explicit recovery phase before this can ship.
  Bind that one-use transition to the reviewed session, base, old/new
  profiles and generation; do not suppress rollback for unrelated resets.
  Removal must report and prove audio disabled, rather than only removing
  a marker from the module inventory.
  [Six-layout reconstruction and fresh-base results](../sdk/machines/octatrack/evidence/usb-post-base-20261021.json)
  separate software POST preparation from the ordinary twenty-channel base's
  physical trial/Undo/capture. Neither qualifies settings, removal or persistence.
  [Earlier results](../sdk/machines/octatrack/evidence/usb-base-layouts-20261021.md)
  retain their original image identities.
- A private shared-ring producer experiment now links the six authored audio
  producers in one helper and matches 24 separate-native cases. With POST's
  gain history advanced for other layouts and off too, 84 mixed blocks match
  a continuously running POST reference. The missing-tracker control fails
  at the first off block. Its 123,168-byte reservation is a synthetic linker
  result, not qualified base placement. The helper contains a private stock
  curve and has no descriptor switch, transaction, catalogue admission or
  persistence. [Exact experiment scope](../sdk/machines/octatrack/evidence/usb-profile-producer-prototype-20261021.json)
  keeps those results separate from hardware and stock-free base packages.
- A later private archived recipe source-links those producers into one actual
  format-2 base. Its browser/native image matches and its unmodified native
  package passes the stock scan, including the named POST curve reconstruction.
  An internal detached-only function selects immutable descriptor templates in
  512-byte slots. It refuses a running controller or an unretired audio request;
  only the incoming host state and profile/length change under the IRQ mask.
  Descriptor shims preserve the displaced PEA's registers and condition flags.
  No descriptor or full-ring copy runs under that mask: the existing startup
  cushion excludes old ring data. Exact base `e38fca82` passes 455 frame-free
  board checks, 479 synthetic streaming checks, 875 producer comparisons and
  341 POST arithmetic/EMAC checks. Each board/stream suite covers all six
  layouts and off at both speeds; ring poison stays out of the captured packets.
  These are emulator results, without actual DSP or host class drivers. The
  checked-in builder still emits separate layouts. The archived recipe has no
  host settings command, reconnect lease/recovery, profile inventory, module
  lifecycle or persistence, and has not been booted on the unit.
  [Exact source-linked experiment scope](../sdk/machines/octatrack/evidence/usb-profile-base-prototype-20261021.json)
  records the image identities and remaining gates.
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

### Borrowed-call probes

The pinned emulator's `callAsMain` leaves C arguments on the guest stack after
a successful return. Repeated bench calls therefore drift main's stack; this
is a harness defect, not evidence of a firmware fault. Build the reviewed
[adapter](../scripts/prepare-octatrack-emulator.py) into a new private directory:

```sh
lockf -k /tmp/modwerk-check.lock python3 -B scripts/prepare-octatrack-emulator.py \
  --source /path/to/verified/octabam --output /private/new-emulator --build
```

It checks the exact upstream pin and source hash, copies committed tooling
sources outside Git, and restores the caller's stack only after a confirmed
return. Failed calls remain intact for diagnosis. Its stock-free 128-call
regression fails on the original and passes with the fix, alongside the five
existing EMAC, peripheral and ColdFire gates. The receipt binds the patch,
regression and built executable. The shared checkout, its cached binaries and
`sdk/octabam/` stay unchanged; its two hardware-tool repairs still apply as
above. These gates do not qualify a project, DSP pairing or hardware. Keep
Unix socket paths short when adding nested private probe directories.

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

### Measured on the owner's MKII (11 October 2026)

**Method.** `scripts/octatrack-measure.py` on S18:
- The status meters count idle passes: core 0's main loop and core 1's counted wait, per 1024-frame window.
- Busy = frame − passes × one pass. The frame is 72,520 cycles (16 samples); one pass is 20.0 cycles on core 0 and 14.48 on core 1.
- Each effect runs in FX2 on T1 (core 1) and T5 (core 0) against NONE, pattern playing.
- Three settings: as picked, every knob at its minimum, every knob at its maximum. The dearest of the three is shown.
- Figures are chip cycles per sample (of 4,532). Peak frames run 40–100 above.

**Stock's own work**, no effects: about 959 cycles on core 0 (it mixes) and 514 on core 1. Derived from the baseline less four FILTERs, with one pattern.

**Stock effects** (core 1 / core 0):

| Effect | Cost | Effect | Cost |
|---|---|---|---|
| DJ EQUALIZER | 342 / 330 | PLATE REV | 249 / 241 |
| LO-FI | 311 / 301 | PHASER | 242 / 234 |
| SPRING REV | 299 / 288 | EQUALIZER | 193 / 187 |
| CHORUS | 295 / 285 | FLANGER | 147 / 142 |
| FILTER | 285 / 276 | COMB FILTER | 128 / 124 |
| DARK REV | 257 / 248 | COMPRESSOR | 102 / 99 |
| SPATIALIZER | 80 / 78 | DELAY | ~0 (ColdFire) |

**Modules** (core 1), against the cycles their packages claim:

| Module | Measured | Claim (kind) | Ratio |
|---|---|---|---|
| E-Verb 0.1.0 | 663 | 382 (executed) | 1.74 |
| Air Chorus 0.1.2 | 670 | 395 (executed) | 1.70 |
| Mini Verb 0.2.0 | 665 | 411 (modeled) | 1.62 |
| Euclid 0.1.4 | 227 | 143 (executed) | 1.59 |
| TAPEHEAD 0.1.2 | 420 | 295 (modeled) | 1.42 |
| Tape Echo 0.1.2 | ~0 (ColdFire) | 4 (modeled) | – |

DJ EQUALIZER's 331 executed instructions (emulator) run as 342 cycles: stock's code runs at about one cycle per instruction. Ours runs at 1.4–1.7.
Not the loader's doing: on 14 October 2026 (dev twin of base `362fb24d`, `octatrack-measure.py`), SPRING REV and FILTER, now loaded on demand into the same arena and relocated like a module, measured 298 / 288 and 285 / 275 (dearest), as in the table. The extra cycles are in the modules' own DSP code (instruction mix, memory access or pipeline stalls the emulator does not count); not yet traced.

**The ledger since S19 (owner's choice: a 90% frame ceiling)**, all in chip cycles:
- **Allowances.** Core 0 3,120 and core 1 3,565, each 90% of the frame less stock's own work.
- **Stock slots.** Until 24 October 2026 each was charged the dearest stock effect, 342, so a stock pick was never
  refused. Since then (owner's choice, beta finding 34) each slot is charged at least the dearest stock effect its bank's
  Parts name there (this table's figures, DELAY and NONE 0), so a Part switch or a RELOAD never needs room it was not
  given. A stock pick dearer than its bank uses in that slot is refused (DSP FULL) when it would take what runs or
  another Part of the bank past the allowance. Machine voices and engines, which a bank change keeps, still book 342 a slot.
- **Modules.** A module carrying an emulator figure is charged 7/4 of it until it carries a hardware figure.
- **Effect.** With 342 a slot, one ~665-cycle module fit on core 0 beside anything stock, two on core 1. In a bank of
  FILTER and DELAY, three Mini Verbs (720 charged) fit on core 1 and two on core 0 (owner's MKII, 24 October 2026, twin of
  this base: self-test peaks 73.9 % and 68.8 %).

**Checked.** Qualification v2 on S19 with all six modules refused the second heavy module on each core and peaked at 68% (core 1) and 57% (core 0).

**Before the ledger,** units were mixed (instruction counts against a cycle allowance). It admitted three E-Verbs beside five dearest stock effects on core 0, about 4,657 cycles against 4,532.

**Not yet measured:** heavier patterns (the stress project above) may raise stock's own work.

## End-user workflow (owner, 10 October 2026)

The target for the browser flow: the site connects to the unit over WebUSB
by itself, loads new modules, the site runs automated stress and
bug checks, and failed attempts are uploaded and filed as issues
automatically. Base installs and base updates (including USB MIDI/Audio
changes) remain a card OS install.

| Step | Built (emulator only) | Still needed | Rules |
| --- | --- | --- | --- |
| 1. Connect automatically | The unit shows `MODWERK CONNECTED` for about a second at a host's first request after 10 s of quiet (`ep0.c`; on the unit, 11 October 2026). Upload mode entered by the host's ENTER while nothing plays or records; [`octatrack-link.ts`](../src/engine/elekloader/octatrack-link.ts) reopens a granted unit through `getDevices()` and the `connect` event, so the unit returning from its OS upgrade is found by itself (vitest with a pretend unit) | The site finds a unit it was granted before (`navigator.usb.getDevices()`, the `connect` event) and connects without a prompt; Chrome's device chooser appears once per site, on a click, and cannot be skipped. The unit may show that a host is linked | No mode to open on the unit (owner, 10 October 2026: the site should just connect). Writes need a stopped unit and a host the user granted the device to. IDENTIFY, HELLO and DIAG stay read-only; stock MIDI recovery is untouched |
| 2. Connect over WebUSB | `UsbVendorTransport`, the session client, a Chrome test page (`dev/octatrack-usb.html`) and, for beta testers and verified administrators (and in dev builds; `hasUsbLinkAccess`), on computers only: a site-wide link that connects by itself, its status in the sidebar and status bar with a pill while an update runs ([`OctatrackStatus`](../src/components/OctatrackStatus.tsx)), the Octatrack page (`#configuration`, [`OctatrackHub`](../src/components/OctatrackHub.tsx): your module sets beside the unit, the selected set's modules with the unit's states, the card route folded while a base is connected) and the one guided sync ([`LoadDialog`](../src/components/LoadDialog.tsx): review stays/adds/removes, playback stopped, sync, the base's self-test, then keep or undo; it can't be dismissed during the trial) and the base install dialog ([`BaseInstallDialog`](../src/components/BaseInstallDialog.tsx)), which the card opens at any time and which opens once per beta tester ([app notes](APP_DEVELOPMENT.md#octatrack-base-install-prompt)); `?preview=usb-link` and `?preview=base-install` drive them with a pretend unit | The builder's `buildBase` (base .bin from the stock OS) and `prepareUpdate` (runtime package for the configuration), the test runner's `stressTest`, the base stopping playback itself when an update starts (it refuses today); the public release (`USB_LINK`); the site in Chrome on Windows (WinUSB binds by itself and libusb uploads within its 4 KiB transfer limit, [traps](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)); the card's first hardware run | Claim only the vendor interface; a mismatched base identity is refused before any write |
| 3. Load new modules | Up to 128 runtime modules at once (32 before S58) with tick, draw, key and encoder hooks, their own data and relocations, and patches to stock code no two share ([machine-neutral loader](../sdk/runtime/loader/README.md)): load, trial, accept, replace, roll back and remove without a reboot, memory reclaimed; catalogue ColdFire modules converted by Elekloader | Data-table patches, modules that add to the core's tables, MIDI and audio-frame hooks, DSP code on demand and the DSP ledger ([design](#several-modules-on-the-device-design-10-october-2026)), a browser builder | The previous set stays live until acceptance; refusals happen before dispatch changes |
| 4. Automated stress and bug checks | DIAG counters, emulator checks, Octabam's MIDI/audio hardware tools | A test runner driven over the vendor interface: bounded transport and parameter actions on a generated test project, CPU/DSP load and audio-path counters, a trial verdict per module | Never write the user's projects. A failed check rolls back automatically; acceptance stays an explicit user action unless the owner changes that rule |
| 5. Upload failures, open issues | `OCTAMOD.LOG` format, the strict browser/Worker parser, the report API and GitHub issue mirroring with author commands | Read the logger ring and test results over USB (a bounded read command) instead of from the card; a run report bound to the exact base and module identities; automatic submission after a one-time opt-in, de-duplicated by failure signature and version into existing reports for the module's author | Show the user what is sent. Never upload firmware, stock bytes, projects, samples or audio. Reuse the existing sanitized report contract and rate limits |
| 6. Stay connected while playing (later; owner, 11 October 2026) | Nothing beyond steps 1, 2 and 5: the link reconnects by itself, and the loader report, MISSING and the logger ring are readable over USB | An opt-in in the Octatrack link's settings to leave the unit connected to an open site tab during normal use, so the site files reports by itself: DSP refusals (`DSP MEMORY FULL`), missing modules, load-meter overruns, stalled frames, watchdog and logger events. Frontend: the opt-in switch, a visible "watching" state in [`OctatrackStatus`](../src/components/OctatrackStatus.tsx), a list of what was sent, and a pause | Off by default. Read-only while the unit plays: reports and counters only, no writes. Polling stays light (the same bounded reads, at most about once a second), never touches the audio path, and stops when the tab or the cable goes. Same rules as step 5 for what is sent |

The connection must survive disconnects, dropouts, faulty cables and host USB
driver failures (owner, 10 October 2026). The unit must never wait on the
host and must end every interruption in a known, working state.

| Failure | Now | Still needed |
| --- | --- | --- |
| Unplug, bus reset, host closes the session | The controller's disconnect: staging discarded, an unaccepted trial rolled back, upload mode left | If something is playing, the rollback cannot hold transport and the trial stays live: retry it once stopped, and show it on the unit |
| Dropped, short or corrupted transfer | A short data stage or a new SETUP refuses the frame; the client retries a positively refused frame under a new sequence; the whole package's SHA-256 is checked before activation; an unconfirmed command stops the connection | Resume an interrupted upload from the last confirmed chunk instead of restarting |
| Host stops talking without a bus reset (driver or app hang, half-broken cable) | After 10 s without any request during an upload or trial, the unit handles it as unplugged. On the owner's MKII (`usbtest6`), the CLI was killed mid-trial with the cable and bridge still connected; 12 s later the unit had rolled the trial back by itself | A client keeps a long trial alive with status reads (the CLI reads DIAG every second); the site's UI must do the same |
| Device-side stalls | Replies are never a whole number of 64-byte packets (a stale zero-length packet once froze the unit), and nothing spins on the host | Keep that rule for every future request; fault-injection runs with random unplugs |
| Power loss | The accepted module set is kept on the card twice (`/MODWERK0.SET`, `/MODWERK1.SET`, `modset.c`) and installed after boot; FUNC held at boot skips it; a set another base wrote is refused | A power cycle with a flashed base that has it (RAM boots only so far) |
| A crash (the unit's exception screen; first seen 11 October 2026, `VEC:04 ADDR:400888CC`, a base bug) | Stock's exception screen until a power cycle; battery RAM keeps the project, USB is gone | Owner, 11 October 2026: restore from that state. The base takes the exception vectors, writes the vector, address and running modules to the card log, and restarts as a RAM boot does (controller stopped first); the next connection reports it, and a module named in it is not reinstalled until the user says so |

The SDK exposes the same interface for working directly on a unit, for
module authors and agents (owner, 10 October 2026): a command-line client
over the shared TypeScript client, with commands such as `identify`, `diag`,
`load <package>`, `trial`, `accept`, `rollback`, `remove` and `logs`. It
drives real hardware through a host USB backend (Node has no WebUSB; a
Node WebUSB implementation is a new dependency to review) and the emulator
through the bench socket that `scripts/verify-octatrack-vendor-client.mjs`
already uses, so the same commands work on both. It follows the
[safe-access contract](#modwerks-own-interface-for-safe-agent-access): the
base identity binding, bounded commands and no raw memory
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
emulator run). Not yet built: `logs` and a module file that names its base.

Down the road the interface should cover every supported machine. The
frames, sessions, IDENTIFY's model and capability fields, the transport's
rules, the TypeScript client and the runtime module loader and package
format are already machine-neutral; each machine
needs its own base glue, runtime ABI and transport. Where a stock USB stack
cannot carry an endpoint-free vendor interface, a machine may use another
transport (for example SysEx over USB MIDI, which the Digitakt and Digitone
stock OS already accept for updates) carrying the same frames.

### What the site's module set page needs from the base (owner, 11 October 2026)

The site now calls configurations **module sets**. The machine sits in the sidebar with a
connection dot, and its module set page also shows what is on the unit
([`UnitPanel`](../src/components/UnitPanel.tsx): each module tagged On Octatrack or Not loaded
yet, and the modules the set leaves out). The owner decided that loading a module set makes the
unit match it exactly, and that a module set also says which stock effects stay in the FX menus.
It runs on the dev preview's pretend unit until the base provides:

1. **An inventory request**: the kept set's modules (module id from each ABI 4 package, version
   if known) and the stock effects left out of the menus. Site seam:
   `readInventory: () => Promise<{ moduleIds: string[]; removedStockFx: string[] }>`, with stock
   effects named by their chooser-metadata keys (FILTER … DARK REV).
2. **Replace semantics**: a load replaces the kept set, so modules missing from it are removed.
3. **Stock effects out of the menus**: the chosen stock effects leave the FX1/FX2 menus, kept
   with the set.

The builder's `prepareUpdate(target)` receives the whole target (`{ name, moduleIds,
removedStockFx }`).

**Built for the beta (12 October 2026; emulator, not yet on the unit).**
- **Inventory:** INVENTORY, vendor request 27 (`ep0.c`, `loader.c` `modwerk_runtime_list`), lists the live modules in
  MISSING's form, 13 a page: effect id, layout, module id, name. A base needs rebuilding for it; one without it
  stalls the request, and the site then says the base can't list its modules.
- **Packages:** the site's runtime packages are built from source with no firmware (`npm run
  octatrack:module-packages`, [`module_packages.py`](../sdk/machines/octatrack/elekloader/module_packages.py)):
  E-Verb, Mini Verb, TapeHead and Air Chorus, in `public/octatrack-modules/ID/VERSION.mwrm` with
  [their manifest](../src/engine/assets/octatrack-module-packages.json). They are byte for byte the README's
  `build.py --dsp` output, have no stock-code sites or hooks, and `--stock` finds no run of the stock OS in them.
  Spectrum and Modulation build the same way but are paused in the library. Every module with ColdFire code
  (TAPE ECHO and EUCLID too) copies stock bytes into its package, so it waits for loader ABI 7.
- **Loading** ([`module-set.ts`](../src/engine/elekloader/module-set.ts), `OctatrackLink.update`): removals first,
  then installs. The base runs one transaction at a time, so every change but the last is kept as soon as it is
  in, and the last runs as the trial for the self-test and Keep or Undo. Undo, a failed self-test or a refusal
  part way rolls the trial back, then sends the undo packages of the kept changes, newest first (a removed module
  the site does not publish cannot be put back, and the notice says so). An unplug part way leaves the unit
  between the two sets; loading either again finishes it, since a load only sends the differences.
- **Not built:** stock effects out of the menus (the base keeps no such state; the site hides the stock effect
  tiles while a base is connected and sends no removals, and `prepareUpdate` refuses a set that changes them), one Keep or Undo held by the base for a whole set, and versions other than the latest.

Later, not now (owner): people may own several units of the same machine. The site connects to
the first allowed unit today. Telling units apart needs a unit identity from the base, since every
unit reports the same USB serial (`000000000001`). The sidebar would then list each unit, and a
load would name its target.

## ABI 7 side branch: emulator task initialization and package gates (12 October 2026)

This follow-up stays on `claude/octatrack-abi7`. It does not replace the qualified tester base (`dc1d7a39…`, flashed `.bin` `9a86d7e1…`) or change the runtime loader's refusal of unknown task state.

The emulator blocker was its detoured-idle recognition. `status.s` replays main's last initialization call before its idle loop; that call creates task `p1b`. The native emulator treated the entire first 128 bytes of the detour as idle, skipped the initialization, and later returned borrowed calls to the stock park. The previous run's kernel gate reported nine tasks created, ten contexts run and `p1b` absent. The loader's zero-stack refusal was correct for that emulated state.

The [private emulator adapter](../scripts/octatrack-emulator/README.md) leaves imported Octabam files exact and recognizes only Modwerk's authored idle loop, excluding its initialization. Its synthetic branch/range regression passes. With the unchanged ABI 7 development image, the kernel gate creates all ten tasks and runs all eleven contexts; Preview Vol's two sites and Repitch's fifteen sites install with consistent relocations and restore their original bytes on removal. No hardware interaction was performed. The stock RTOS gate, including its serial negative control, passes with byte-identical reports before and after the adapter.

Only six runtime packages are staged publicly on this side branch: the existing E-Verb, Mini Verb, TapeHead and Air Chorus, plus Preview Vol and Repitch 0.1.2-experimental (ABI 7). They rebuild byte for byte and pass both stock-overlap scans. Six other prepared packages remain private because their compiled payloads fail the existing strict scan:

| Package | Most nonzero bytes in a shared run | Additional gate |
| --- | ---: | --- |
| Play Modes | 13 | Matching compiled instructions need provenance review. |
| VECTOR | 20 | Matching compiled instructions and shared machine hook ownership need review. |
| Analog BD | 20 | Its native DSP engine integration is not carried by the standalone ColdFire package; shared hook ownership also needs a runtime composition path. |
| POLY8 | 512 | The largest run maps to initialized zero/255 arrays near `poly_next`; other matching instructions remain. Shared machine hook ownership and its collision with Repitch also need a runtime composition path. |
| Tape Echo | 19 | Matching compiled instructions need provenance review. |
| Euclid | 15 | Matching compiled instructions need provenance review. |

A scanner match alone does not establish copied firmware or independently authored coincidence. No scanner threshold or ownership rule was relaxed. The compiled matches map to `pm_track_length`, `st_ui_tick`, `ab_src_names`, `render_head` and `eu_publish_frame`; their further export needs source/provenance review and a stock-free package representation.

The candidate base was regenerated only on this side branch. Its browser-builder/native `.bin` parity hash is `ebec67bcbecc48a263ce16222ae3155bd88bca7962214c3aab19712fc4c8eed4` (642,412 bytes); this is a saved local script build, not an actual browser UI download or hardware result. The stock-free base package hashes to `c29a05274cbc521bce10f0e5c038e7c92168bd44ce640015bb4a0e6c67dbda02`. Bootloader-copy and declared-site guards pass. Changed base fingerprint inputs are the already prepared ABI 7 loader builder/parser/header/static verifier, module-package builder and two host test files; `runtime.c` and `status.s` are unchanged.

The browser link now retries a busy commit reported as `backend` with refusal 5 as well as a busy `rejected` stage. A discarded commit candidate must first clear the client's retained offer, then be staged again. The regression includes the real TypeScript/C wire controller, whose unchanged-publication path reports `ready` with zero received bytes. Required owner review, combined stock-FX/ABI 7 hardware requalification, exact candidate audio/flow tests and physical reboot persistence remain open before this base or these new USB packages enter the loader branch.

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


## ABI 8 format staging checkpoint (12 October 2026)

The side branch prepares a 76-byte ABI 8 header, 128 sites, 128 hash-backed
stock copies and 64 bounded authored constant fills. Copies and fills use
zero placeholders and cannot overlap relocation words or each other. The
strict stock scans remain unchanged. Source-pinned private machine adapters
compose shared chooser/page ownership without an unselected machine, move
FM tables through guarded copies, and remove the mutable global descriptor
writer. These are build/host proofs; no POLY8, VECTOR or FM group is advertised.

The read-only `MWCP` v1 capability response (vendor request 29, exact 12
bytes) reports ABI 8 and flags 7, site/copy limits 128. Table composition,
machine groups and Sidechain are disabled. The default metadata admission
refuses machine groups. Group publication still needs board admission for
working/saved Parts and SRAM mirrors, known UI roots, all remaining FM widget
consumers, and paused code/data references, followed by install/replace/Undo
and persistence evidence. The alias-aware UI scanner and Part fixtures are
not a claim of exhaustive module retirement.

The isolated native/browser-builder parity candidate hashes to
`76db5f2497f297f4442aa0a152625a1d2c6aaf9f8cb3426adc5dc46283353660`
(643,800 bytes), configuration hash
`fb5067df44eeff633c7e6ff550ea0002bf23f69c687129c26dd3873404a53341`.
Its stock-free base package hashes to
`6a1861bd85d830cafa8f3eb2b5a1925eb716dc00df9914e8fe68fe2eaf9d22fc`.
Bootloader-copy, declared-site and native `.bin`/`.syx` equality checks pass.
This was generated by the browser builder under Node, not an actual saved
browser UI download. Changed fingerprint inputs are `loader.c`, `loader.h`,
`build.py`, `verify_static.py`, Octatrack `runtime.c` and `ep0.c` relative to
the ABI 7 checkpoint. Machine adapter inputs are separately pinned by private
group recipes; their lifetime helpers are not yet linked into this base.
The qualified `9a86d7e1…` tester image and `dc1d7a39…` base remain unchanged.
No physical hardware action or qualification has occurred.

The exact candidate passes the adapted emulator's M6a kernel gate (ten tasks,
eleven contexts), the request-29 capability reply
`4d5743500108000700800080`, a private ABI 8 fixture with all 512 authored
initializer bytes reconstructed, and Preview Vol's two/Repitch's fifteen
sites installed then restored. This validates the bounded format and existing
ColdFire package lifecycle only; machine groups remain refused.
