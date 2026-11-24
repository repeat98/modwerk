# Octatrack: USB Audio as a module (design, for owner review)

USB Audio 0.3.0-experimental uses Octatrack base 0.7.12 on OS 1.40C. [PR #1840](https://github.com/repeat98/modwerk/pull/1840) published base 0.7.11 with the built-in layouts. The new USB function and settings hooks first appear together in the 0.7.12 release candidate. Earlier references to 0.7.11 in the [unit record](verification/2026-11-20-octatrack-usb-audio-package.md) name development builds by their individual identities.

The [design decision](decisions/2026-11-20-usb-audio-is-a-module.md) explains why USB Audio became a package. The following design describes the transition from the built-in layouts.

## Through base 0.7.11

Since #756 each of the six output layouts, and USB MIDI alone (`off`), shipped as a separate base because the layout set the USB configuration descriptors. Turning on USB Audio or changing the layout required a base install. That design required the following:

- seven base identities to build, prove and publish for every base change (`base-variants.ts`,
  `octatrack-base-variants.json`, `base-binding.json`'s `variants`);
- a fixed reserve in every base, used or not: 8 KiB code, 2.5 KiB data, 96 KiB bss (`build_core.py`'s `USB_RESERVE`);
- a module the site treats apart from all others: `packagedTarget` and `setLayout` in `module-set.ts`, the Base
  line in `LoadDialog`, `countsTowardLimit` in `set-limit.ts`, the filters in `UnitPanel` and `OctatrackHub`, and
  the atomic add through `configureUsbAudio` in `useWorkspace`;
- no version of its own on the unit: an update to USB Audio is a base update.

## The target

One base, which keeps what the link and every module need: the controller, EP0, mass storage, the vendor
interface the site talks through (interface 1) and USB MIDI. USB Audio is a package in the runtime pool that
contributes the audio function. The site adds, updates and removes it like any module, and it counts toward the
module limit.

## Base side

### The function slot (prototype exists)

`base/usb-audio-module` (three commits, 12 November 2026, on a `main` of that day) adds:

| Piece | What it does |
| --- | --- |
| `ot_usb_functions` (table) | one 32-byte `struct modwerk_usb_function`: 1 to 4 interfaces from 4, endpoint 3, four descriptor blocks (full, high and the two other-speed configurations). The base checks it at admission and builds the configurations in 512-byte slots |
| `ev_usb_isr` | raised in the USB interrupt's transfer path, after USB MIDI's work: the function retires its own endpoint's completions |
| `ev_usb_bus_end` | a bus reset or the end of the session: the function goes back to alternate setting 0 |
| `ev_usb_control` | a control request nobody else answers, before stock stalls it: the function answers its class requests |
| reconnect | when the table changes, the base takes the unit off the bus, rewrites the slots and comes back |
| USB FUNCTION (request 41) | the reconnect's state for the site and `npm run device -- usb` |

Two things it found in the emulator shape the rest:

- **A reconnect must not undo the trial.** A lost USB session undoes an open load. The base therefore marks its
  own reconnect: the bus reset that follows undoes nothing, and the reconnect is over only when the host has
  reset the bus and then reached the vendor interface. A host that does not come back in time counts as unplugged.
- **The base walks these hooks' rows itself.** Through the loader's dispatch code the USB interrupt left module
  addresses on the stack at every transfer, and the loader then refused a rollback for good.

### Base and migration work

1. **The audio frame: `ev_usb_frame`** (added to the prototype on 20 November 2026, emulator only). The producer
   runs in the frame interrupt (`audio_frame_shim` at `0x4000d9a0`, one of `usb_base.py`'s `AUDIO_DETOURS`). A
   base that takes a module's function owns that site with its own shim and raises the hook there, every
   16-sample block. It is raised by the base, not declared as a stock site with `rests`: every published base
   still links USB Audio in, whose producer patches the same site, and a site has one owner. So the handler runs
   every block and must return at once while the host has not opened the stream; measure that idle cost on a
   unit. Once no base links USB Audio in, the site can become an ordinary resting site event.
2. **SET_INTERFACE and GET_INTERFACE.** The prototype leaves them as stock sites of the function's own
   (`0x4001dd04`, `0x4001d824`, and the EP0 page at `0x4001d4b2`). Decide per site: base-owned event or the package's.
3. **Memory.** The module's bss (the ring, up to 96 KiB) comes from the 768 KiB runtime pool. Check the
   controller's alignment and addressing needs for the isochronous buffers and transfer descriptors against pool
   memory, and what the largest layout leaves for a set of 24 modules.
4. **The POST layout's gain curve** (`usb_post.py`) is 256 stock words a linked base reads from the owner's own OS.
   The package takes the computed quarter sine instead (owner, 20 November 2026), the curve `usb_post.py` checks
   the stock table against and accepts within 64 of 2^23; a stem's level can differ from a linked base's by at most
   that. Not compared on a unit.
5. **Removing the reserve and the variants.** With the function in a package the base drops `USB_RESERVE`, the
   linked-in USB Audio sources and six of its seven identities. This is the base change players get, so it joins
   `base/octatrack-next` only when the module is ready to take over.

## The module

- One catalogue module, the present id `usb-audio-out-tracks-main-cue`, so sets, reports and changelogs keep working.
- Install one package. Open PROJ > MODWERK > SETTINGS, then USB AUDIO. Choose COMPUTER or OUTBOX 8, an output layout, and PRE LEVEL or POST LEVEL for the eight stems in either track layout. Main and Cue keep their existing taps.
- In OUTBOX 8, choose the source for each of four stereo USB pairs. Each pair can carry a source from the selected layout or silence. Duplicate assignments are allowed. Set up the matching physical outputs once in Elektron’s app.
- The base saves these settings through a power cycle. A change of USB format reconnects the device. Changes to sources and stem tap within the current format can keep a recording open.
- The imported producer source stays exact; the adapter inserts at guarded seams, as `base_usb_functions.py` does.

## Sync

- Adding, removing or changing the advertised channel format ends in a reconnect. The site's link already waits for a unit to come
  back after a base update; here it reads USB FUNCTION, waits for the reconnect to settle and goes on with the
  self-test, Keep or Undo on the same trial.
- An Undo, a failed self-test and a power cycle each put the earlier configuration back, with a reconnect of
  their own.
- A panel format change waits until playback stops and the card leaves USB Disk Mode.

## Site

Remove the special cases listed under Today. Each layout installs the same package. Existing sets retain their layout for migration. The module counts toward `SET_MODULE_LIMIT`: a set that holds 24 others and USB
Audio then loads and shows but is not synced until trimmed, as any set over the limit. `base-variants.ts` keeps
only what the transition needs.

## Moving the units over

Units run one of seven base identities today. The base that drops the variants is a normal base update; a unit
that ran a layout gets the module in that layout put back with its set after the update, as the sync does for
every module. A set that names a layout keeps naming it.

## Risks to measure first

- **Windows and a changed configuration.** On 13 November 2026 Windows could not open the unit as an audio device
  after a twin with another channel count had been booted, until the format was chosen again in its sound
  settings. With a module this happens on every layout change and on add and remove. Try a `bcdDevice` per
  configuration and record what Windows, macOS and Linux do.
- **Cost in the pool.** The linked-in producer costs 27 points of the frame interrupt with a recording host
  (#1517). The same code through a hook row must not cost measurably more: measure with the frame interrupt
  share, steady to 0.2 points.
- **A reconnect while the host records.** The stream ends; the DAW must be able to open it again without a
  restart of the unit.

## Steps

The packaged 0.3.0-experimental candidate passed Keep and card restoration across a physical power cycle on an Octatrack MKII. The Mac recorded 89,088 stereo frames from the restored Track 8/Master set. Steps 1 to 3 also ran in the emulator. On the Octatrack MKII, all six layouts recorded on macOS and Undo restored the
original configuration. Main + Cue passed three repeats with one USB client after two earlier rollbacks with a paired
browser open. The [hardware record](verification/2026-11-20-octatrack-usb-audio-package.md) includes the package hashes and settings measurements.

1. Bring `base/usb-audio-module` onto current `main`, add the frame event, and run its emulator verifier.
2. Build USB Audio (20 channels first) as a package against a development twin; verify in the emulator, then on a
   unit: enumerate at both speeds, record, add and remove during a trial, Undo, power cycle, the Windows case.
3. The other five layouts and the SETTINGS page.
4. The site: package selection, the reconnect in the Load dialog, the limit, the special cases out.
5. The base without reserve and variants on `base/octatrack-next`, with the transition, a draft until
   extensively tested on a unit.

## USB input (USB Audio 0.4.0)

**PROJ → MODWERK → SETTINGS → USB AUDIO → INPUTS** offers OFF, AB, CD
and ABCD for a computer host. OFF is the default. AB and CD use the same
stereo USB format and select where channels 1/2 arrive. ABCD assigns host
channels 1–4 to the four inputs. The input stream and its implicit feedback
are available at high speed. Full speed and Outbox keep their output layouts.
When a block is unavailable, the affected inputs read from the jacks.

Base 0.8.1 owns the frame-transfer interrupt. Its guarded DMA
scheduler sends a staged input block to core 0 before an FX loader packet
when both are due. The two transfers use disjoint DSP ranges. The RX hook
consumes the block marker once so a closed stream or a skipped transfer
leaves the analog input intact. The base gives USB priority on the crossbar
while a duplex configuration is selected and restores its previous values
when that configuration leaves.

USB Audio 0.4.0-experimental publishes this duplex package (`scripts/octatrack-usb-audio-release.py`).
It reports inventory kind 8. The output-only 0.3.0 package reports kind 7 and stays published as
`configurable-0.3` in the package manifest, so the site replaces it on the next sync and uses its
exact bytes for Undo. `npm run octatrack:base -- --beta --stock OS.bin --out DIR` still writes the same
package as `usb-audio-input.mwrm`. For panel automation, build a development twin with the same USB and DSP flags plus `--dev`.
Use the existing
[USB tools](../sdk/machines/octatrack/hw/README.md) to capture counters,
routing and underruns on a unit.

The pinned [OctaBam optimization](https://github.com/sambanks/octabam/commit/4b0cd42a10a01d8b63f29b11bf9d17d6706a6481)
uses SRAM staging and a single load per USB input sample. This candidate
uses that receiver and the optimized DSP loop. OctaBam also queues the
high-speed output transfer directly from a ring in USB channel order.
Modwerk's configurable producer still copies to packet buffers to supply
the selected output routing. Bryan timed the combined OctaBam changes at
about 34 to 24 µs per frame on his MKII with ABCD and Main/Cue. That is
upstream timing. Modwerk needs its own loaded-project and DMA overlap runs.

### Candidate checks

Development base `3e4fa8ce4370` and package `35f2a26cf5eb` built on
21 November 2026. The shipped 0.3.0-experimental package rebuilt
byte-for-byte. Module doctor and the catalogue compatibility check passed.

The DSP host ran OFF, AB, CD and ABCD in both frame banks over synthetic
24-bit values with dirty upper bytes. The selected inputs matched bit-for-bit,
the remaining slots kept their analog fixture values, and the marker was
consumed. The real-time Octatrack emulator loaded the package with an ABCD
and Main/Cue preset (`bdad3889b242`), enumerated both descriptor shapes,
accepted input alternate settings 1 and 0, and restored the original four
interfaces after Undo. During the streaming attempt the input counters
remained zero. The released 0.3 output-only package also returned zero
nonempty audio packets in the same emulator setup. The [MKII RAM trials](verification/2026-11-21-octatrack-usb-input.md) verified all four INPUTS modes, both recorder pairs, playback of R1 over USB and 17 min 34 s of four-channel duplex audio with Vibrato running.
