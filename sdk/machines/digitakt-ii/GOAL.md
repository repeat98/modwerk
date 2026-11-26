# Digitakt II: the goal

What the Digitakt II's contributors are building, in what order, and how to take a piece. The [machine guide](README.md) has the technical detail. The [agent board](../../../docs/AGENT_BOARD.md) shows who is working on what right now (`npm run board -- list`).

## The goal

A Digitakt II owner opens the machine page, builds the Modwerk base in the browser from their own OS 1.17 file and installs it once. After that, they add, try and remove modules over USB without a reflash. A trial runs from RAM and a power cycle ends it. Keep saves the set. Base updates also come over USB. Any set of modules runs side by side, and the stock OS and the maker's recovery always restore the unit.

This is the Octatrack's stack on the Digitakt II ([machine recipe](../../../docs/MACHINE_RECIPE.md)). Extend the Octatrack's and the Rytm's pieces rather than designing a second set.

## Where it stands (17 November 2026)

| Piece | State | Where to look |
| --- | --- | --- |
| Base | Started. The site builds the pinned Modwerk base `8650bb8a` on core 1.1: `e88273ed` (#1571) with the kit data ended before the project archive. On `e88273ed`, project and kit data survived Save Project, a cold boot and KIT Save and Load on one unit. Downloads stay off | [base source](elekloader/README.md); #1582 adds the shared Mixer and a guarded pre-send render |
| Hooks | Core 1.1's UI hooks, frame values, key LEDs, and project and kit data, plus the base's sequencer phrase hook and project archive. The base's pitch and grid collections are not in the contract yet | [core hooks](README.md#core-hooks), [sequencer hooks](elekloader/modwerk/README.md) |
| USB link | Being scoped: SysEx over the stock USB MIDI first | [USB link](#usb-link) below |
| Loading without a reflash | Not started | [porting the runtime loader](../../runtime/loader/README.md#porting-to-another-machine) |
| Base updates over USB | Not started | [two-slot base](../../../docs/OCTATRACK_TWO_SLOT_BASE.md) |
| MCP device tools | Not started | [device tools](../../../docs/FRONTEND_MCP.md#then-test-the-connected-device) |
| Machine page | Status only. The Octatrack's unit pages (status, module sets, guided sync) are not built yet | [`OctatrackHub.tsx`](../../../src/components/OctatrackHub.tsx) is the model |
| Modules | Track Names, Mute Latch, Chord Arp and Euclidean Scale are in the library. Downloads stay off until the owner turns them on | [modules](../../digitakt-ii/modules/), open pull requests, the board |

When a piece moves, update this table, the [recipe's table](../../../docs/MACHINE_RECIPE.md#where-each-machine-stands) and `machine.json`'s `stack` in the same pull request.

## The order

1. **Finish the base.** The site builds the Modwerk base on core 1.1. It is done once its exact build has run on more than one unit and the owner turns downloads on.
2. **USB link**, in parallel with step 1 on development bases. It starts with identify, status and the unit's log (diagnostics), then adds chunked writes for module packages.
3. **Loading without a reflash.** Port the runtime loader: review, a trial in RAM, Keep, Undo.
4. **Base updates over USB.** Two slots and at most one restart. The maker's recovery (FUNC + TRIG 4, then the stock `.syx` over MIDI DIN) stays the floor.
5. **Device tools and the machine page.** Put the link behind the MCP's existing tools, then add the Octatrack's unit pages for the Digitakt II, beta-only.

Two kinds of work can happen at any time:

- **Base services that several modules will want:** a sample pool, machine registration, per-kit state in one table the base owns, SHARC DSP dispatch. Add these services directly to the machine’s cumulative base draft before releasing a module that uses them.
- **Modules.** Each one builds, installs and works as the only module chosen.

## USB link

OS 1.17 offers USB MIDI in all three USB modes (MIDI, Audio/MIDI and Overbridge), so the link starts as SysEx over it. That needs no change to the USB descriptors, which leaves Overbridge and USB audio as they are. SysEx costs 7-bit packing and USB MIDI framing. That doesn't matter for diagnostics. Look at a vendor interface again only if module uploads turn out too slow.

- **Start from the Rytm's link.** The Analog Rytm MKII already has a SysEx link over USB MIDI ([LINK.md](../analog-rytm-mkii/LINK.md)). It has a wire format, an arm row, and keys and RAM boot only in development bases. Add the Digitakt II's glue to it instead of writing a second protocol.
- **Open: a reply that never blocks.** The stock transmit path can wait indefinitely for buffer space. A link reply must not stall the UI or the sequencer when the host stops reading.
- **Leave other traffic alone.** Test that MIDI, audio and Overbridge keep working in all three USB modes while the link runs.

## Rules that matter most here

- **Only your own code.** Nothing derived from an AGPL project comes in, because its terms would bind every build. The imported core keeps its GPL-2.0-or-later licence and its provenance in `sdk/imports/`.
- **Sequencer, LFO and voice sites go through the base.** A module never patches one of these sites. It proposes a base hook first ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)).
- **What modules share belongs to the base.** That includes Mixer pages, a send bus, a sample pool and per-kit state. A kit record holds 143 bytes of kit data for all mods together.
- **SHARC code** follows the [SHARC code rules](README.md#sharc-code-rules), and only a unit run proves it.
- **No raw block writes to the +Drive** (`fw_card_write`). The preflight refuses a build that uses one.
- **Only a unit qualifies a build.** Record the image's SHA-256 and what you saw. Emulator runs are for iteration only.
- **Firmware stays on your computer.** Never commit the OS file, extracted stock code or built images.
- **Owner review.** Add base changes directly to `base/digitakt-ii-next` and update its cumulative draft. A separate link, loader port or page outside the base has its own review.

## Open questions

- **More units.** The pinned base has run on one unit so far.
- **Upstream drift.** The core 1.1 source is `0df8409`, the reviewed head of the open [elekloader#221](https://github.com/elekloader/elekloader/pull/221). When it merges, take the source again from the release and rebuild the base ([base source](elekloader/README.md)).
- **A SHARC assembler.** Modwerk's own (`src/engine/elektron/sharc-asm.ts`) builds a machine module's `.sharc` player into its package and refuses code that breaks the rules above. It knows only the instruction forms a voice player has needed so far: add a form with its test, checked against the programming reference.

## How to join

- **With a coding agent:** open the repository, run `/modwerk-start` and choose the Digitakt II. It reads this guide, checks the board and shows the open tasks. Claim your piece before you start. If someone already holds it, ask them on the board.
- **Testing on a unit:** run the exact builds from open pull requests and report on the pull request: the image's SHA-256, what you did and what you saw. Work that touches the base starts with the base's [build and recovery](README.md#build-and-recovery) steps.
- **Maintainers** review and test Digitakt II pull requests and keep this guide and the machine page current. This needs basic coding knowledge. The owner gives GitHub collaborator access after a few merged contributions.
