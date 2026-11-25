# Digitone II: the goal

What the Digitone II's contributors are building, in what order, and how to take a piece. The [OS research](../../../docs/DIGITONE_II_OS_RESEARCH.md) has the addresses and unit runs. The [agent board](../../../docs/AGENT_BOARD.md) shows who is working on what (`npm run board -- list`).

## The goal

A Digitone II owner opens the machine page, builds the Modwerk base in the browser from their own OS 1.12 file and flashes it from the page over USB. After that, they add, try and remove modules over USB without a reflash, and the page reads the unit's diagnostics. A trial runs from RAM and a power cycle ends it. Keep saves the set. Base updates also come over USB. Any set of modules runs side by side, and the stock OS and the maker's recovery always restore the unit.

This is the Octatrack's stack ([machine recipe](../../../docs/MACHINE_RECIPE.md)). The Digitone II shares the Digitakt II's platform, so it extends the Digitakt II's pieces ([its goal](../digitakt-ii/GOAL.md)) and never builds a second set. Core work for the Digitone II happens here, in its Modwerk base.

## Where it stands (18 November 2026)

| Piece | State | Where to look |
| --- | --- | --- |
| Machine steps | Format, rebuild and boot done: modified OS 1.12 builds (toonst's core-dn2 0.3) booted on two units, and stock 1.12 restored them | [OS research](../../../docs/DIGITONE_II_OS_RESEARCH.md#step-3-on-a-unit) |
| Build path | Started: Modwerk's linker (`LINK_DEVICES`, `ELE3_DEVICES`) knows OS 1.12 and links core-dn2 0.3 and 0.4, alone and with elekloader's examples, to the same main OS as elekloader, byte for byte. It takes the core's DSP bridge and refuses mods with DSP code. The pinned Elekloader kit stays as it is (owner, 19 November 2026): Modwerk's builder carries the device ([`device.json`](elekloader/device.json)), which `npm run machine:base` registers with the kit's Python SDK and the site with the browser kit; both read stock 1.12 and rewrite it, sealed, byte for byte. What is left is the base itself | [`elemod.ts`](../../../src/engine/elektron/elemod.ts), [`machine-base.py`](../../../scripts/machine-base.py), [`carried-devices.ts`](../../../src/engine/elekloader/carried-devices.ts) |
| Base | Not started | the Rytm MKI's [`base.json`](../analog-rytm-mki/elekloader/base.json) is the model |
| Flashing from the site | Not started. Today the owner sends a `.syx` with Elektron Transfer | the MS-70CDR's [`ZoomBaseDialog.tsx`](../../../src/components/ZoomBaseDialog.tsx) in [`BaseDialogFrame.tsx`](../../../src/components/BaseDialogFrame.tsx) |
| USB link and diagnostics | Not started | the Rytm's [link](../analog-rytm-mkii/LINK.md), the Octatrack's [`diag.c`](../octatrack/elekloader/diag.c) and [`device-log.ts`](../../../src/engine/elekloader/device-log.ts) |
| Loading without a reflash | Not started | [porting the runtime loader](../../runtime/loader/README.md#porting-to-another-machine) |
| Base updates over USB | Not started | [two-slot base](../../../docs/OCTATRACK_TWO_SLOT_BASE.md) |
| MCP device tools, machine page | Not started; the page shows status only | [device tools](../../../docs/FRONTEND_MCP.md#then-test-the-connected-device), [`OctatrackHub.tsx`](../../../src/components/OctatrackHub.tsx) |

When a piece moves, update this table, the [recipe's table](../../../docs/MACHINE_RECIPE.md#where-each-machine-stands) and `machine.json`'s `stack` in the same pull request.

## The order

1. **The build path.** Add the Digitone II to the site's builder (`LINK_DEVICES`: OS 1.12's hashes and memory areas from the research notes) and to `npm run machine:base`. Modwerk's builder carries the device; it does not wait for an Elekloader kit to.
2. **The base.** `elekloader/base.json` names `digitakt-ii` as its `source`: the Digitakt II base's core-dt2 1.1 source and Modwerk hooks, with the Digitone II's own device, addresses and sites in `recipe`, and `copies` where a file has to differ, as the Rytm MKI's base does with the MKII's. elekloader's core-dn2 (0.4 in release v0.11.0) and toonst's fork (0.3) are the address references: GPL-2.0-or-later, credited in `sdk/imports/`. Its exact build boots on a unit, then `base-binding.json` records it.
3. **Flashing from the site.** The machine page builds the base and sends it over USB MIDI with the stock OS upgrade, the way Transfer does, in the base dialog frame. Write it once for Elektron's machines so the Digitakt II and the rest use the same flasher. Transfer stays the fallback, and the maker's recovery is the floor.
4. **The USB link and diagnostics.** SysEx over USB MIDI in the Rytm's wire format, one link for the Digitakt II and the Digitone II: the Digitakt II's is being scoped, so work it out with its holder on the board. It starts with identify, status and the unit's log, which the site reads as it reads the Octatrack's. Keys and RAM boot come in development bases only.
5. **Loading without a reflash.** Port the runtime loader: review, a trial in RAM, Keep, Undo.
6. **Base updates over USB.** Two slots and at most one restart.
7. **Device tools and the machine page.** Put the link behind the MCP's existing tools, then add the Octatrack's unit pages, beta-only.

## Rules that matter most here

- **Only your own code.** Nothing derived from an AGPL project comes in.
- **One base for the platform.** Change the Digitakt II base's shared files in a way both machines build, and run the Digitakt II's checks too.
- **Only a unit qualifies a build.** Record the image's SHA-256 and what you saw. Emulator runs are for iteration only.
- **Firmware stays on your computer.** Never commit the OS file, extracted stock code or built images.
- **Owner review.** Add base work directly to the cumulative draft from `base/digitone-ii-next`. Review other shared SDK work in its own pull request before a module uses it.

## Recovery

Hold FUNC while powering on, choose TRIG 4 (OS UPGRADE), then send the stock `.syx` over MIDI DIN; recovery mode does not use USB. A normal Transfer update with the stock file also restores the unit while it still boots.

## How to join

Open the repository with a coding agent, run `/modwerk-start` and choose the Digitone II. Claim your piece on the board before you start, and if someone holds it, ask them there.
