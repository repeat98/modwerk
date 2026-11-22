# Syntakt: the goal

What the Syntakt's contributors are building, in what order, and how to take a piece. The [machine guide](README.md) and the [research report](../../../docs/SYNTAKT_OS_RESEARCH.md) have the technical detail. The [agent board](../../../docs/AGENT_BOARD.md) shows who is working on what right now (`npm run board -- list`).

## The goal

A Syntakt owner opens the machine page, builds the Modwerk base in the browser from their own OS 1.42 file and installs it once. After that, they add, try and remove modules over USB without a reflash. A trial runs from RAM and a power cycle ends it. Keep saves the set. Base updates also come over USB. Any set of modules runs side by side, and the stock OS and the maker's recovery always restore the unit.

This is the Octatrack's stack on the Syntakt ([machine recipe](../../../docs/MACHINE_RECIPE.md)). No upstream core exists for this machine, so the base grows from Modwerk's own boot probe. Extend the Octatrack's, the Digitakt's and the Rytm's pieces rather than designing a second set.

## Where it stands (16 November 2026)

| Piece | State | Where to look |
| --- | --- | --- |
| Memory for modules | In review. On OS 1.42, #1411 lowers the stack by 128 KB to free `0x47fe0000`–`0x48000000`. That build ran on a unit, also through a sample reload, and the owner chose this route. One check remains before the 128 KB counts as free: fill the whole gap at boot, load samples, play, and read it back | #1411, [memory](README.md#memory-areas-and-budgets) |
| Base | Boot probe only. It runs on a unit with OS 1.42 and keeps no code running after boot. The Syntakt is not in the shared linker table yet, so nothing builds it in the browser | [core](../../syntakt/core/README.md), [platform](../../../docs/SYNTAKT_OS_RESEARCH.md#8-platform-decision-brief) |
| Hooks | None yet. The UI tick, key and encoder delivery, a SETTINGS menu row and the audio block are located and guarded in 1.40 and 1.42. The display's draw path, project load and save, and the sequencer step are still unknown | [hook sites](../../../docs/SYNTAKT_OS_RESEARCH.md#44-main-cpu-ui-audio-and-project-sites) |
| USB link | Not started. The plan is SysEx over the stock USB MIDI | [USB link](#usb-link) below |
| Loading without a reflash | Not started | [porting the runtime loader](../../runtime/loader/README.md#porting-to-another-machine) |
| Base updates over USB | Not started | [two-slot base](../../../docs/OCTATRACK_TWO_SLOT_BASE.md) |
| MCP device tools | Not started | [device tools](../../../docs/FRONTEND_MCP.md#then-test-the-connected-device) |
| Machine page | Status only | [`OctatrackHub.tsx`](../../../src/components/OctatrackHub.tsx) is the model |
| Modules | None. The linker refuses every module until a memory area and an interface exist | — |

When a piece moves, update this table, the [recipe's table](../../../docs/MACHINE_RECIPE.md#where-each-machine-stands) and `machine.json` in the same pull request.

## The order

1. **Memory for modules.** Finish #1411's whole-gap check on 1.42. Until it passes, nothing of Modwerk's lives in SDRAM.
2. **A core that stays.** At boot, copy the core into the gap so its code keeps running after the BSS clear. Then register the Syntakt in the shared linker table (owner review: the shared builder assumes the Digitakt's hook shape) and give the interface its first events from the located sites. After that, the base builds in the browser from the owner's own OS file.
3. **USB link**, on development bases. It needs a core that stays. It starts with identify, status and the unit's log (diagnostics), then adds chunked writes for module packages.
4. **Loading without a reflash.** Port the runtime loader: review, a trial in RAM, Keep, Undo.
5. **Base updates over USB.** Two slots and at most one restart. The maker's recovery (FUNC + TRIG 4, then the stock `.syx` over MIDI DIN) stays the floor.
6. **Device tools and the machine page.** Put the link behind the MCP's existing tools, then add the Octatrack's unit pages for the Syntakt, beta-only.

Three kinds of work can happen at any time:

- **Research on the unknown sites:** the display's draw path, project load and save, the sequencer step and the audio block's sample rate. Each finding goes into the research report as addresses, lengths and guards for both releases.
- **Base services that several modules will want:** a settings or project block (no storage location is proven free yet), per-kit state in one table the base owns, and a helper for menu rows. Add these services directly to the machine’s cumulative base draft before releasing a module that uses them.
- **Modules,** once steps 1 and 2 are in. Each one builds, installs and works as the only module chosen.

## USB link

The stock OS speaks USB MIDI, so the link starts as SysEx over it. That needs no change to the USB descriptors, which leaves Overbridge and USB audio as they are. Look at another USB interface only if module uploads turn out too slow.

- **Start from the Rytm's link.** The Analog Rytm MKII already has a SysEx link over USB MIDI ([LINK.md](../analog-rytm-mkii/LINK.md)). It has a wire format and development-only keys and RAM boot. Add the Syntakt's glue to it instead of writing a second protocol.
- **Message ids.** The Syntakt's product byte is `0x16`. Stock answers `0x50`–`0x6f`, `0x7e` and `0x7f`. Ids `0x00`–`0x0f`, `0x11`–`0x4f`, `0x70`–`0x77` and `0x79`–`0x7d` do nothing in stock, but whether Elektron's host tools send them is unknown ([stock claims](../../../docs/SYNTAKT_OS_RESEARCH.md#43-stock-claims-a-mod-could-collide-with)).
- **Open: a reply that never blocks.** Find out whether the stock transmit path can wait for buffer space. A link reply must not stall the UI or the sequencer when the host stops reading.
- **Leave other traffic alone.** Test that MIDI, audio and Overbridge keep working in every USB mode while the link runs.

## Rules that matter most here

- **Only your own code.** The projects in the guide's [credits](README.md#credits) are research. Re-derive every address from your own OS files, and ask the owner before bringing in any of their code.
- **No stock bytes in the repository.** Record addresses, lengths, counts and hashes only, never stock code, not even a single instruction or its encoding.
- **Every stock write is a declared, guarded site.** The stock-write checker refuses everything else. The second ColdFire's, the FPGAs' and the UI MCU's images stay byte-identical.
- **The hardware can't fence memory.** The MMU is off and the access-control windows are 16 MB wide, so the linker is the fence. Modules get their regions from the linker, never raw addresses.
- **UI, audio and sequencer sites go through the base.** A module never patches one. It proposes a base hook first ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook)).
- **Mind the build's margins.** The in-place depack margin is 16,679 bytes on the 1.42 probe and the container may not exceed 2 MB. Every build checks both, and a depack overrun hangs the unit at the logo.
- **The flash holds the unit's calibration.** The OS upgrade checks no size, and the NOR keeps each unit's analog calibration at 0x300000; an image past 0x280000 bytes erases it for good. Only the builder's 2 MB bound protects it, so never flash a container built any other way ([flash and recover](README.md#flash-and-recover)).
- **Recovery needs MIDI DIN.** Before you flash any build, have the stock `.syx`, a MIDI DIN interface and Transfer's legacy OS-upgrade page ready ([flash and recover](README.md#flash-and-recover)). USB does not work in the startup menu.
- **Only a unit qualifies a build.** Record the image's SHA-256 and what you saw. digiemu's Syntakt port (an open upstream pull request) boots to the UI without the FPGA or the analog tracks, so it is for iteration only.
- **Firmware stays on your computer.** Never commit the OS file, extracted stock code or built images.
- **Owner review.** Add base changes directly to `base/syntakt-next` and update its cumulative draft. A separate link, loader port or page outside the base has its own review.

## Open questions

- **Is the gap free while the unit runs?** #1411's check answers it for 1.42.
- **Which releases?** The base targets 1.42. Whether the analysed 1.40 file stays supported is the owner's decision, and 1.40A and 1.41 are refused until someone analyses them ([report §5.1](../../../docs/SYNTAKT_OS_RESEARCH.md#51-the-other-two-releases-140a-141-container-survey-only)).
- **The flash limit.** The 2 MB bound is the upgrade's receive buffer and ends 512 KB below the calibration record. Reading the flash geometry from a unit would confirm nothing else sits in between.
- **Recovery from a unit that doesn't boot.** The DIN path has recovered a working unit, but not yet one that fails to boot.
- **More units.** So far the boot probe and the stack-gap build have each run on one unit.

## How to join

- **With a coding agent:** open the repository, run `/modwerk-start` and choose the Syntakt. It reads this guide, checks the board and shows the open tasks. Claim your piece before you start. If someone already holds it, ask them on the board.
- **Testing on a unit:** run the exact builds from open pull requests and report on the pull request: the image's SHA-256, what you did and what you saw. You need a MIDI DIN interface for the recovery.
- **Maintainers** review and test Syntakt pull requests and keep this guide and the machine page current. This needs basic coding knowledge. The owner gives GitHub collaborator access after a few merged contributions.
