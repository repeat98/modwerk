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

### Reproduce locally

Use Node 24, GNU `m68k-elf` tools and a clean Elekloader checkout at the kit's
exact commit. Supply your own original firmware. Convert selected source with
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

| Resource | Contract needed for the module-set loader |
| --- | --- |
| Private P | Reserve the kernel, transport, bus and stock shared helpers; allocate and relocate incoming code without moving or overwriting executing code. Share identical dependencies instead of including duplicate Quantizer/VECTOR implementations. |
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

## Work required before public cutover

| Area | Observed gap / next implementation |
| --- | --- |
| Mandatory infrastructure | The [private base source recipe](../sdk/machines/octatrack/elekloader/README.md) extends upstream core 0.3 with logger/startup and the unwired upload controller. Qualify its guarded stock replay, retained/I/O memory and bootstrap; integrate exact selected-module identity. Old source-specific exceptions do not qualify a different core. |
| Mute Modes | Its callable `Linked.reference` reaches an upstream converter path that expects an `(address, hash)` tuple and raises `TypeError`. Fix source conversion and rerun the independent check. |
| MIDI Scenes | Its writes inside the bootloader-copy range are refused. Port the source to a safe layout; do not weaken the protected-range rules. |
| Poly8 | Conversion emits a package, but native linking fails on unresolved dependencies. Supply explicit source dependencies and remove duplicate shared implementations. |
| DSP / FX | The converter refuses custom DSP/FX-menu modules. Extend upstream's existing DSP linker/bus with stock-free source recipes, general P/X/Y resource accounting, per-track dispatch, descriptors and choosers on both cores. Do not run the old composer behind an `.elemod`. |
| USB Audio | The internal USB MIDI dependency is a platform folder, and a descriptor write is in the protected bootloader-copy range. Make dependencies explicit and relocate descriptors using guarded references. Preserve audio/MIDI/storage compatibility. |
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

1. Add a bounded vendor USB interface alongside the existing interfaces.
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

## Agreed implementation sequence

1. Qualify the Elekloader base and stopped upload mode, preserving logger,
   startup identity and recovery. Establish bounded transport, identification
   and status before accepting writes.
2. Load, replace and remove one runtime module; verify interrupted staging and
   rollback without a reboot. Keep the previous live set until activation has
   succeeded. A host simulation does not establish this hardware milestone.
3. Extend the existing DSP SDK/bus with runtime P/X/Y allocation, instance
   ownership and coordinated acknowledgement/retirement on both cores. Refuse
   resource exhaustion before modifying live dispatch.
4. Preserve stock and legacy module identities and validate saved state before
   use. Missing modules need an explicit safe fallback with project data
   preserved. The present SPATIALIZER donor bus is not a compatible default.
5. Integrate an autonomous local hardware runner using USB MIDI, audio,
   counters and bounded diagnostics. Octabam already supplies
   `tools/hw/usb_probe.py`, `usb_counters.py`, `ot_midi.py` and test-project
   generators; its USB AUDIO IN work is separate from Modwerk's imported
   output-only stack. Reports bind exact base/module identities to observed
   results, and uploaded logs follow the existing sanitized report contract.
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
