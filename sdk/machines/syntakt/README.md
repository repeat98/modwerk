# Syntakt

Status: **research, core started**. The OS files are understood and rebuilt, modified builds boot (public reports), and the first Modwerk core stage, a boot probe, links and verifies locally. No module can be built for this machine yet, and nothing in this guide has run on the owner's unit. Read [the research report](../../../docs/SYNTAKT_OS_RESEARCH.md) before changing anything here.

## Platform

The Syntakt uses the `elemod` platform ([platform decision](../../../docs/SYNTAKT_OS_RESEARCH.md#8-platform-decision-brief)): the same `ELE3` container and SysEx transport as the Digitakt, the main OS as section 3 at 0x40000400 staged at 0x40200000, the same guarded-site linker. What differs: the appended tail lies inside the memory the OS zeroes at reset, so the core's hook is the BSS-clear entry rather than a main-initialisation call; the machine has a second ColdFire, two FPGAs and a UI MCU whose images stay byte-identical in every build.

Supported releases (file and image hashes in `sdk/syntakt/core/stock-map.json`): 1.40 (the analysed file) and 1.42. 1.40A and 1.41 are relinked builds (research report §5.1) that match no release and are refused until analysed.

## Core interface

Interface 0.1 ([sdk/syntakt/core/interface.json](../../syntakt/core/interface.json)): no events, tables, exports or claims yet. The hook sites a later interface would use are inventoried in the report, with the UI/audio/project sites still unknown.

## Memory areas and budgets

| Area | Range | Budget | Notes |
| --- | --- | --- | --- |
| Fast SRAM tail | 0x8000733c–0x80008000 | 3,268 bytes | Proven free in both releases. Zeroed at every reset; the core writes its 16-byte signature at its start. |
| Boot stub space | appended to the main OS, up to 16 KB | 2,256 bytes of image fill exist, but the stub lives in the appended tail | Inside the BSS-clear range: valid only until the clear, which the hook runs before. |
| SDRAM for mods | none | 0 | Not proven. Candidates: 128 KB above a lowered initial stack (0x47fe0000–0x48000000, data patch at 0x400004f4) or the first 64 KB block of the OS heap. Either needs the owner's decision and a hardware stress run with every sample slot loaded. |
| In-place depack margin | — | 16,679 bytes (1.42) and 84,063 bytes (1.40) on the probe builds; 96,357 and 160,989 on the stock files | The repository packer compresses section 3 better than Elektron's, which narrows the margin. Every build is checked exactly; a tail that compresses badly consumes it. |
| Container | — | 2 MB | The in-OS upgrade receive buffer; 67,760 bytes of stored growth remain on 1.42, 204,864 on 1.40. |

## Build

```sh
node scripts/verify-syntakt-core-probe.mjs --out /tmp/syntakt-probe --firmware ~/path/Syntakt_OS1.42.syx
```

Links the boot probe into the owner's stock file, checks every stock write, verifies the container and writes the `.syx` and a JSON record locally. There is no browser build and no module build for this machine.

## Flash and recover

Flash with Elektron Transfer over USB (MIDI IN and OUT set to the Syntakt, drop the `.syx`, confirm on the unit). To recover a unit that does not boot: hold FUNC while powering on, press TRIG 4 (OS UPGRADE) and send the stock `.syx` from Transfer's legacy OS-upgrade page over MIDI DIN; USB does not work there. Public reports (Synthack-OS) describe this path; it is **not tested on the owner's unit**. Keep the stock file and a DIN interface ready before flashing any build.

## Credits

The container and transport were first documented by [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) (Marcel Bierling, MIT). [Synthack-OS](https://github.com/Angelo-politek/Synthack-OS) (MIT) published the 1.41 memory map, the decompression limit, the recovery path and the hardware observation that runtime page writes reach the memory above the BSS. The [digiemu Syntakt port](https://github.com/irpina/digiemu/pull/33) identified the MCF5441x, the second ColdFire and the section roles. Modwerk's research re-derived every address and guard from the owner's own files; no code from these projects is included.
