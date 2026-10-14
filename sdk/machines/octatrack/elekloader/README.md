# Private Elekloader base source recipe

The firmware builder runs locally in TypeScript in a browser Web Worker.
[`machine-build.ts`](../../../../src/engine/elekloader/machine-build.ts) delegates
stock identification, linking, patching, resource checks, packing and output
verification to the unchanged Elekloader kit. Every machine extends that kit
with its profile, core and linkable packages. Browser users need no Python,
native compiler, local helper server or remote firmware build service.

`build_core.py` is developer-side package preparation and an independent
reference. It compiles original source into a format-2 `.elemod` with the
kit-pinned upstream SDK. It uses Elekloader's native linker to produce a
private comparison image; it never invokes the Octabam composer. The resulting
package must also pass the shared TypeScript kit's private verifier.

The prototype extends upstream core 0.3 with Modwerk's existing logger and
authored startup artwork. It preserves the logger's 8 KiB retained region
through the bootstrap's BSS clear, keeps its 512-byte I/O buffer on the
uncached alias and records a core-only configuration identity. Stock function
replays use guarded format-2 stock references recovered locally from the
owner's original firmware. Generated stock-bearing recipes, packages, maps,
images and proofs stay outside Git; the one committed package carries no
stock bytes ([the base in the browser](#the-base-in-the-browser)).

The bounded upload controller is compiled into the prototype but has no
lifecycle backend or module executor connected: its USB-reachable
controller refuses every state change (below). This prototype is
**not a flash candidate**. Native linking and Python/TypeScript byte parity
do not establish safe boot, logger retention, cache handling or hardware
behaviour. The current identity describes only the base; arbitrary module
selections still need exact identity integration before public use.

Use Node 24, the reviewed GNU `m68k-elf` toolchain, a clean Elekloader checkout
at `vendor/elekloader/kit/kit.json`'s commit (`npm run upstream:tools` keeps one
in `~/.cache/modwerk-upstream/elekloader`) and your original OT OS 1.40C.
Both output directories below must be new and outside every Git checkout:

```sh
python3 -B sdk/machines/octatrack/elekloader/test_recipe.py
python3 -B sdk/machines/octatrack/elekloader/build_core.py \
  --stock /private/OCTATRACK_OS1.40C.bin \
  --upstream /private/pinned-elekloader \
  --output /private/NEW-core-output
npm run octatrack:elekloader:verify -- \
  /private/OCTATRACK_OS1.40C.bin /private/NEW-ts-proof \
  /private/pinned-elekloader \
  /private/NEW-core-output/package/core-0.3.1-modwerk-dev.1.elemod
```

### The base in the browser

The base install dialog's **Download base .bin** builds the `--dsp-loader` base (no `--dev`) in the firmware
worker from the user's own OS 1.40C file. Format-2 copies stock bytes into sections only, as they are, so
`build_core.py` also writes `base.elemod`: its package with every stock DSP word left out (the ColdFire's
big-endian copies of the stock effects, the shared routines in the payload sites), and `base-fills.json`, each
gap as a recipe of `src/engine/assets/stock-dsp-metadata.json`. The kit refuses the package until
[`octatrack-base.ts`](../../../../src/engine/elekloader/octatrack-base.ts) has put the words back, recovered
from the user's file and checked against each recipe's hashes; then it links, packs and verifies as
`patch.build` does. [`check_stock_free.py`](check_stock_free.py) fails on any run of 16 or more stock bytes
the package ships literally (`--min 8` lists the chance ones below that: effect names, its own code).

The committed pair is `src/engine/assets/octatrack-base.elemod` and `octatrack-base-fills.json`. Any change
to what the base's source hash covers (this folder, the logger, upload, loader, DSP transport and startup
sources; their `.c`, `.h`, `.s`, `.asm`, `.py` and `.json` files) changes the base, even a file only `--dev` twins
compile (`dev.c`) or a test there (`test_recipe.py`). `octatrack-base-sources.json` lists those inputs and their hashes, and a test
(`octatrack-base.test.ts`, no firmware) fails when one changed or a file joined those folders. Rebuild and
commit it with

```sh
npm run octatrack:base -- --stock /private/OCTATRACK_OS1.40C.bin --write
```

Without `--write` it checks the committed files are what this source builds. Both runs check the package is
stock-free, that the browser's path builds a `.bin` identical to `build_core.py`'s `NOT_FLASH_CANDIDATE.bin`,
and `check_flash_safety.py`; `--out NEW-DIR` (outside Git) saves that `.bin` and its `MAIN.raw` for a RAM
boot. It uses `~/.cache/modwerk-upstream` (`--upstream`, `ELEKLOADER_DSP_ASM`) as the build above does.

### DSP effects on demand

`--dsp-loader` loads every DSP effect on demand, stock and module alike.
Module FX appear in the stock choosers beside every stock row. An effect's
code goes into a core when a track picks it and is freed when nothing uses
it, admitted against each core's arena and cycle allowance first
([design and evidence](../../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md#milestone-2-dsp-effects-on-demand-e-verb-as-the-pilot-10-october-2026)).
The base takes each core's whole stock effect block
([`dsp_loader.py`](dsp_loader.py)): the three stock routines other effects
call stay resident at its start, then the receiver, then about 5,200 words
of arena. Each stock effect is a package recovered at build time from your
firmware with Modwerk's relocation recipes and checked against their
hashes; Octabam's DSP DYNLOAD STOCK is the reference for the layout. It
needs Octabam's patched `dsp_asm` (`ELEKLOADER_DSP_ASM`), with
`dsp56kDisassemble` built beside it in the same tree (`make setup` in
`~/.cache/modwerk-upstream/octabam`, or `cmake --build` of its
`vendor/dsp56300` with the `dsp_asm` and `dsp56kDisassemble` targets), and
Node 24 for Modwerk's chooser composer ([`octatrack-base-choosers.mjs`](../../../../scripts/octatrack-base-choosers.mjs)).
The module FX with a chooser row (`MODULES` in `dsp_loader.py`) as packages. The
figures are each module's own: cycles per sample and instance with their kind
(executed worst cases for E-Verb and AIR CHORUS, static bounds, modeled, for the rest),
the extent of its r7 block and the Y words it reads:

```sh
ELEKLOADER_DSP_ASM=/path/to/dsp_asm python3 -B sdk/machines/octatrack/elekloader/build_core.py \
  --stock /private/OCTATRACK_OS1.40C.bin --upstream /private/pinned-elekloader \
  --output /private/NEW-dsp-base --dsp-loader
# The site publishes these from source (npm run octatrack:module-packages: public/octatrack-modules, the figures in
# src/engine/assets/octatrack-module-packages.json); the same commands by hand:
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:everb \
  --slots fx2 --cycles 382 --cycles-kind executed --state 132 --buffer 16384 -o /private/everb.mwrm
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:miniverb \
  --slots fx2 --cycles 411 --cycles-kind modeled --state 64 --buffer 16384 -o /private/miniverb.mwrm
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:tapehead \
  --slots both --cycles 295 --cycles-kind modeled --state 54 -o /private/tapehead.mwrm
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:airwindows-chorus \
  --slots fx2 --cycles 395 --cycles-kind executed --state 132 --buffer 16384 -o /private/airwindows-chorus.mwrm
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:spectrum \
  --slots fx1 --cycles 262 --cycles-kind modeled --state 120 -o /private/spectrum.mwrm
python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:modulation \
  --slots fx1 --cycles 354 --cycles-kind modeled --state 112 --buffer 2048 -o /private/modulation.mwrm
# TAPE ECHO runs on the ColdFire: its own units and two detours from its Octabam manifest, beside a
# five-word DSP stub, pinned to effect 15 (its C names it). Holds stock bytes: private.
python3 -B sdk/runtime/loader/build.py --octabam tapeecho --stock /private/OCTATRACK_OS1.40C.bin \
  --upstream /private/pinned-elekloader --dsp src/engine/assets/dsp-packages.json:tapeecho \
  --slots fx2 --cycles 4 --cycles-kind modeled --state 1 --pinned -o /private/tapeecho.mwrm
# EUCLID: its sequencer on the ColdFire (three detours), its filter on the DSP, pinned to 29; its page uses
# the base's shared wide dial (fxpage.s) for STEPS, PULSE and ROT.
python3 -B sdk/runtime/loader/build.py --octabam euclid --stock /private/OCTATRACK_OS1.40C.bin \
  --upstream /private/pinned-elekloader --dsp src/engine/assets/dsp-packages.json:euclid \
  --slots both --cycles 143 --cycles-kind executed --state 64 --pinned -o /private/euclid.mwrm
# Published (owner decision, 14 Oct 2026): TAPE ECHO, EUCLID and Play Modes with --standalone instead of --stock,
# from their reviewed module-adapters/standalone-recipes.json; their stock-coinciding runs become copies the base
# takes from its own running stock. npm run octatrack:module-packages builds them so.
python3 -B sdk/runtime/loader/build.py --octabam tapeecho --standalone \
  --upstream ~/.cache/modwerk-upstream/elekloader --dsp src/engine/assets/dsp-packages.json:tapeecho \
  --slots fx2 --cycles 4 --cycles-kind modeled --state 1 --pinned -o tapeecho.mwrm
```

### Runtime compatibility and the card builder

USB module sets use the on-demand arena above; the loader-free card builder
uses unlisted stock effects as code donors. Keep their compatibility decisions
separate. The card builder's Analog BD companion list and harvested P runs do
not describe the runtime arena. USB eligibility starts with the published
runtime-package manifest, then the base's actual site, state, buffer, code and
cycle admission. Installing a set does not promise that every effect can run on
every slot at once: package words stay in ColdFire memory and take DSP P space
only while a core needs the effect, but the allocator charges every active
instance, stock slots included, against its core's allowance, so a set whose
code fits can still be refused at activation. A baked card placement refusal
is not a USB on-demand incompatibility. Capacity changes with the receiver and
saved-id table: quote any figure with its build identity and see
[the migration record](../../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md) for
the measured arena and allowances. Host placement and admission tests do not
establish chip timing or hardware qualification for a new source or base.

Some native combinations rely on shared implementations that separate runtime
packages cannot inherit:

- **Analog BD's DSP source engine is a separate integration.** Its manifest
  declares the ColdFire machine/control units, while native `ab_image.py`
  supplies both DSP engines, their X tables, the source seam and the preserved
  stock helper. A `--octabam analog-bassdrum` package compiling the manifest
  units alone is not a complete port. A card-layout refusal for a large effect
  beside Analog BD (no contiguous opening on either core) is no evidence about a
  future USB pair, which first needs a reviewed runtime DSP-source, tenant,
  relocation and cycle contract.
- **Shared ColdFire sites need one runtime owner.** Analog BD, VECTOR and POLY8
  overlap at machine chooser/validator sites, and POLY8 and Repitch share a
  module-owned site. Native composition's shared-owner handling does not make two
  independently installed packages compatible: port and verify the ownership
  before offering the combination, and keep the collision checks. Paused stacks
  and registers are not the only lifetime roots: live UI layers, derived
  key/encoder callbacks and page/widget state may retain package pointers.
  Prove they retire, including cached/uncached aliases, before unpublishing or
  reclaiming an image; an unresolved root keeps admission off.
- **Hooked DSP effects need their full resource contract.** Sidechain Compressor
  needs resident cross-core taps, stock COMPRESSOR hooks and the tail of one
  FX2 buffer per core (see the measured inventory and planned restricted-buffer
  admission in the migration record). Output Matrix's stock DSP hooks likewise
  need loader support. A free effect id or a successful ColdFire link proves
  neither layout.

### Status page

`status.c` measures, all the time, the ColdFire's load (main's idle spin, timed on DTIM3, `status.s`), each
DSP core's mean and peak load (core 0's own idle count, core 1's counted wait for core 0, `dsp_receiver.asm`),
each core's code arena, the delay-buffer blocks and the module pool. CUE + PROJ shows it as a dialog of
bars (NO closes it), and so does PROJ > MODWERK > LOAD; `npm run device -- stats` prints it from the loader report on development
bases. PROJ > MODWERK is a fifth root category (Octabam's MAINMENU.md: the root window is five rows tall, stock fills
four; `build_core.py` copies the four stock rows and appends it, with its icon and list): LOAD, MODULE LOAD (each
installed module's share of each core's frame from its own cycle figure, `~` when that is 7/4 of an emulator claim:
the meters see only each core's sum), MISSING and SELF TEST. SYSTEM stays stock. A DSP core's load is its idle passes times their calibrated cycles (20.0 on core 0, 14.5 on core 1)
of a 72,520-cycle frame; recalibrate with `build_core.py --dsp-burn 1000` (core 0) or `-1000` (core 1).


**Optimising a DSP effect.** `dspbench/` compares two builds of an effect on the dsp56300 emulator core,
called with stock's convention: bit-identical output under knob automation and every split position, and the
instructions each executes. No stock image or Octabam tooling; build line in `dspbench.cpp`. Chip cycles come
from the unit's status meters, since a displacement or two-word operand costs the chip more than the emulator
counts.

Before changing anything here, read the [hardware traps](../../../../docs/OCTATRACK_HARDWARE_TRAPS.md)
found on the owner's MKII (EP0 sizes, RAM boot, key injection, eDMA alignment).

## USB vendor interface

The base owns the USB configuration responder, the unknown-request tail and
the USB ISR's transfer, bus-reset and session-end paths: Elekloader cannot
share a stock site between packages, and a descriptor change needs a base
install anyway. [`usb_base.py`](usb_base.py) generates 41-byte configurations
(stock mass storage, byte for byte USB MIDI's, plus an endpoint-free vendor
interface, class `ff/4d/01`), the two length clamps and the shims. Every
replaced or skipped stock span is hash-guarded against your firmware. USB
MIDI and USB Audio claim the same sites, so they cannot be combined with this
base yet; they have to become base features.

[`ep0.c`](ep0.c) runs the [EP0 transport](../../../runtime/upload/README.md#ep0-vendor-transport-version-1)
in the USB ISR and its controller on the engine task:

- IDENTIFY and RESULT are answered from 256-byte-aligned uncached replies.
- A SUBMIT data stage is received into a descriptor of the base's own, with
  interrupt-on-complete, and only from stock's idle EP0 state (11, no awaited
  OUT descriptor); otherwise it is refused and the host retries. Stock's
  completion loop may take the completion bit, harmlessly in that state, but
  the completion raises the interrupt again and the poll at the start of the
  transfer path finishes it from the descriptor. Nothing spins on the host.
- A complete frame sends the status stage and posts a wake-up to the engine
  queue with the kernel's `post`, which stock's own USB ISR calls. Its first
  byte is `0xFF`; the engine ignores opcodes above 45 and returns to its
  receive, where the base's idle hook services the transport before the
  logger's.
- The controller's backend is the machine-neutral
  [runtime loader](../../../runtime/loader/README.md) (package ABI 3: code,
  data, bss, relocations, tick, draw, key and encoder hooks, and patches to
  stock code, with its safety rules). This
  folder's [`runtime.c`](runtime.c) is the Octatrack's glue: trampolines
  from core-ot's `ev_tick`, `ev_draw`, `ev_key` and `ev_enc`; ENTER and
  activation only while nothing plays or records (the logger's own check);
  module code and data on the uncached alias; instruction and branch cache
  invalidation with the OS's own CACR value (guarded); the patchable range
  (the stock image's RAM copy minus the bootloader copy); and the paused-task
  scan over the kernel's eleven measured tasks. A bus reset, session end
  or 10 s without any request from the host during an upload or trial
  (`modwerk_ep0_tick` on `ev_tick`) becomes the controller's disconnect.
  [`examples/hello.c`](examples/hello.c) is Elekloader's hello-marker as a
  runtime module: a square in the screen's top-right corner, with key presses
  and encoder turns counted in DIAG's value.

`verify_vendor_usb.py` checks a build in the emulator with Octabam's USB
bench, at both speeds: configurations, IDENTIFY's exact bytes and refusals,
a HELLO through the data stage, engine and RESULT, a refused ENTER,
duplicate and short submissions, the session surviving a bus reset, and mass
storage. [`verify-octatrack-vendor-client.mjs`](../../../../scripts/verify-octatrack-vendor-client.mjs) runs the browser's `UsbVendorTransport`
and `UploadSession` against the same build: it loads, trials and accepts a
test module, replaces and rolls it back, removes it, and resets the bus
mid-staging, reading the module's effect through the bench's `call`. Decode the built MAIN with
Elekloader's `formats.parse(..., device)` and run, for example in the Docker
toolchain image that builds `ot_emu` (it has Node 24):

```sh
ot_emu --image /private/MAIN.raw --usb-host /tmp/ot-usb.sock --ms 300000 &
python3 -B sdk/machines/octatrack/elekloader/verify_vendor_usb.py /tmp/ot-usb.sock \
  --proofs /private/NEW-core-output/proofs.json
```

Restart the emulator before `node scripts/verify-octatrack-vendor-client.mjs SOCKET PROOFS_JSON`.
This is emulator protocol evidence only: no host OS driver, WebUSB claim,
cache behaviour, timing or hardware. Stock firmware fails the first check.

### Hardware run

The emulator cannot show cache behaviour, real USB timing or WebUSB claiming;
only the unit can. Whether to flash this unqualified base is the owner's call.
Keep your normal build and the stock `.syx` at hand; a base that does not boot
is recovered from the Startup Menu over DIN MIDI.

1. Build with `build_core.py` (above) and install `NOT_FLASH_CANDIDATE.syx`
   or `.bin` the way you install any test OS.
2. Leave USB disk mode, stop playback and recording, and connect USB.
3. Run `npm run dev` and open `http://localhost:5173/dev/octatrack-usb.html`
   in Chrome. **Run lifecycle** claims only the vendor interface, loads a
   test module, replaces and rolls it back, removes it, and reads each
   effect back through the base's read-only DIAG request. The slot is empty
   afterwards; **Read DIAG** shows the counters at any time. From the
   terminal instead, start `usb_bridge.py` (see its header) and run
   `npm run device -- lifecycle`; `status`, `try MODULE.mwrm [--accept]` and
   `remove` work the same way ([`scripts/device.mjs`](../../../../scripts/device.mjs)).
4. Record the page log, then play a project briefly and confirm audio,
   sequencing and the card still behave. Reinstall your normal build.

### RAM boot (development bases)

A base built with RAM boot (`usbtest7` on) runs another base without
writing flash: `npm run device -- boot BUILD_DIR` sends `BUILD_DIR/MAIN.raw`
(written by `build_core.py`), the unit restarts into it from RAM, and the
command waits until IDENTIFY reports that build's `configurationHash`. A
power cycle boots the flashed base again. Stop playback and recording first;
the restart is a reboot.

The base accepts only an OS image (entry word, at most 1.25 MiB) carrying
NOR's own bootstrap version, because an image with another version would
reprogram the bootstrap at its entry. It stages the image in its own
reserve, arms a one-shot mailbox, and half a second later quiesces as OS
UPGRADE does, parks both DSP cores and soft-resets. The gate at the OS entry
(`boot.s`) spends the mailbox, rechecks size, entry word, bootstrap version
and hash, and copies the image over `0x40000400`; anything else boots the
flashed base. Ported from Octabam's REMIX SWITCH (PR #655 at `879cecb`,
MIT); the DSP park is its source unchanged. Any host on the vendor interface
can trigger it without a confirmation on the unit: development only.

`build_ports.py` prepares independent source ports with the same pinned SDK
and its native source checker. It registers the internal USB MIDI dependency
from `platform/usb-midi` without copying it into `modules/` or changing the
imported SDK. USB Audio carries that implementation through its existing
override. The converter's guarded device-descriptor clone preserves the
protected bootloader bytes. These are static source ports; the upload
controller cannot yet execute them as runtime modules.

```sh
python3 -B sdk/machines/octatrack/elekloader/build_ports.py \
  --stock /private/OCTATRACK_OS1.40C.bin \
  --upstream /private/pinned-elekloader \
  --core /private/NEW-core-output/package/core-0.3.1-modwerk-dev.1.elemod \
  --module usb-midi --module usb-audio-out-tracks-main-cue --module cc-map \
  --output /private/NEW-source-ports
```

The private `source-proofs.json` pins the core, stock, recipe and source
inputs, and records each actual source comparison/refusal. A partially emitted
package is a failed port. The helper also refuses table insertions that the
pinned converter and its checker both handle incorrectly as appends, including
Mute Modes' PERSONALIZE row. A matching build from two implementations must
not conceal that unsupported contract.

Pass the source-checked packages and core to the TypeScript verifier above,
optionally with `--pairs` or `--combined` to compare combinations. It checks
saved full-file hashes against the independent native builder. No source
comparison or byte parity establishes boot, audio, live sampling, host or
hardware safety. Keep all generated source, packages, images and reports
outside Git and retain failures alongside later results.

The source recipe is GPL-3.0-or-later. The pinned upstream core assembly is
GPL-2.0-or-later; it is copied only into the private generated source, with
its existing notices preserved. See the repository licence inventory for
the imported source and tooling.
