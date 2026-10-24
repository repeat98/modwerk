# Erica Synths LXR-02

Status: **research**. The LXR-02 has a machine page (`sdk/machines/lxr-02/`, family `erica`) and is locked for modules. Nothing here builds or ships firmware yet. The platform, base and install route below are a proposal that needs the owner's decisions.

On 23 October 2026 Erica Synths published the LXR-02's firmware and bootloader source under GPL-3.0 ([announcement](https://www.ericasynths.lv/news/post/lxropen/), [firmware](https://github.com/erica-synths/lxr-desktop-app), [bootloader](https://github.com/erica-synths/lxr-desktop-bootloader)). That makes it the first machine on Modwerk with nothing to reverse-engineer: a mod is a change to published source. Facts below are from the source at firmware commit `a43cd4f` (23 October 2026).

## What was published

- **Hardware:** STM32F765VG (Cortex-M7, 216 MHz). Flash: bootloader at 0x08000000 (32 KB, sector 0), firmware from 0x08008000 (992 KB). ITCM 16 KB (hot DSP code, already tight), DTCM 128 KB (DMA buffers, stack), RAM 384 KB at 0x20020000. Six drum voices, FX bus, 64-step sequencer, DIN and USB MIDI (a custom USB-MIDI class), SD card (FatFs R0.12c), character LCD. The panel has four endless knobs, six voice faders and a volume fader, an encoder and 16 step keys.
- **Build:** CMake 3.21+, Ninja, Python 3 and the Arm GNU Toolchain (`arm-none-eabi-gcc`; Erica tested 14.3.rel1 and 11.3.rel1). `cmake --preset release && cmake --build --preset release` writes `build/release/LXR_V2_V<version>.img`. The audio engine needs `-O3`; translation units with ITCM code build at `-O2` (`LXR_ITCM_OPT`) because current GCC overflows the ITCM at `-O3`, and GCC 15 also needs `-fno-thread-jumps`.
- **Update image:** a 16-byte header (`LXRV2IMG`, the binary's size as a little-endian u32, an 8-bit checksum `0xFF - (sum & 0xFF)`, 3 zero bytes) followed by the raw binary programmed at 0x08008000 (`cmake/tools/mkimage.py`).
- **Install and recovery:** copy the image to the SD card's top folder (the bootloader takes the first `LXR*.img`), hold the encoder while switching on. The bootloader write-protects its own sector at every boot and an update never changes it, so a failed or bad firmware is fixed by installing the official update the same way. Only the `flash_full` and `flash_bootloader` targets (ST-Link and OpenOCD) rewrite it; if that write fails, only a debug probe brings the unit back. Modwerk never uses them.
- **Version:** the source builds 1.7 (`project(VERSION 1.7)`); Erica's newest download is 1.71 ("Euclidian sequencer fix", 23 May 2025). Whether the published source includes that fix is not established yet. Ask upstream before basing on it.

## What the licence asks of a Modwerk build

GPL-3.0-only with section 7 terms ([NOTICE.md](https://github.com/erica-synths/lxr-desktop-app/blob/main/NOTICE.md)):

- **Corresponding source:** every LXR image Modwerk hands out is conveyed object code. Each download names the exact source: upstream commit, base, every module's source and the build scripts, all public, and anyone can rebuild and install it (the bootloader checks no signature).
- **Module licences:** modules link into GPL-3.0-only firmware, so a module's licence has to be compatible with it (GPL-3.0-only, or permissive: MIT, BSD, Apache-2.0). GPL-2.0-only code cannot go in.
- **Marked as modified:** the start-up screen of a modified build has to show it, and it must not pass as official firmware. Stock shows "Sonic Potions" / "LXR2 Drums V<version>" (`Core/Src/main.c`); a Modwerk build changes that text.
- **Trademarks:** "Erica Synths", "LXR" and "LXR-02" may be used only as truthful compatibility statements ("custom firmware for the Erica Synths LXR-02"), never as Modwerk's own name for a build. The update file still has to be named `LXR*.img`, or the bootloader does not find it.
- **Support:** Erica Synths does not support modified firmware, and a damaged bootloader is a paid repair. Modwerk's pages say so and send questions to Modwerk.
- **Hardware:** the hardware and its look are Erica's and not licensed. The page shows Erica's own product image, credited and without a licence, until Erica Synths confirms or objects ([machine images](MACHINE_IMAGES.md)).

## How it maps onto Modwerk

| Modwerk concept | LXR-02 | Gap |
| --- | --- | --- |
| Machine profile | `family: "erica"`, steps `source`, `boot`, `core`, `mods` | Done in this change |
| Platform (`octabam`, `elemod`) | A new `lxr` platform | Contract section in `module-contract-v3.ts`; owner decision |
| Base | A Modwerk build of the source, marked on its start-up screen, with events (audio block, voice render, FX bus insert, sequencer step, MIDI in, keys, encoder, LCD pages) and budgets | Not started |
| Module | C source against the base's SDK, GPL-3.0-compatible | Module contract |
| Build | `arm-none-eabi-gcc` does not run in the browser | CI or a build service, see below |
| Install | SD-card updater for the base; modules as files on the SD card (proposal) | Base loader |
| USB link | USB-MIDI is already there: SysEx for status, trial, Keep and Undo, like the Octatrack's link | Not started |
| Recovery | The official update from the SD card | None |
| Budgets | DSP time per audio block, ITCM 16 KB, RAM, flash 992 KB | Measure what stock leaves free |

## Proposed route

Whole images per module selection would need a native build for every combination, and every module update would rebuild the firmware. Modwerk's rules point the other way (a module never needs a base rebuild, and a machine should load modules without a reflash). So:

1. **One base per version**, built in CI from the pinned upstream commit plus Modwerk's own changes, installed once with the SD-card updater. Its source is this repository.
2. **Modules as position-independent code** that the base loads from a folder on the SD card into RAM at boot, built in CI per module version. Installing a module set means writing files to the card: no reflash, and the official update still restores everything.
3. **A USB-MIDI SysEx link** that the [runtime loader](../sdk/runtime/loader/README.md#porting-to-another-machine) and the MCP's device tools drive, for review, trial in RAM, self-test, Keep (written to the SD card) and Undo, like the Octatrack. The Cortex-M7 glue needs its own port: cleaning the data cache and invalidating the instruction cache after a load, and pausing audio DMA.

## Decisions for the owner

1. The `lxr` platform and its module contract.
2. Whether the pinned upstream source may enter CI. The rule that firmware never enters CI is about stock images; this is GPL source, and CI has to build from it to give corresponding source.
3. Modules on this machine accept only GPL-3.0-compatible licences.
4. The install route: base plus SD-loaded modules (recommended) or whole images per selection.
5. Who has a unit for the `boot` step and every later hardware result.
6. Whether to tell Erica Synths about the page (not required: the page uses the names only as compatibility statements).

## Next steps

1. **`source`:** build the source twice in separate folders with Arm GNU Toolchain 14.3.rel1 and compare the `.img` hashes. If they match, record the commit, toolchain and hash in the profile's pull request and mark `source` done. Not run yet: these build scripts are external code, and running them needs the developer's go-ahead.
2. **`boot`:** change only the start-up text, install from the SD card, check it boots and plays, then install Erica's official 1.71 update the same way and check stock is back.
3. **`core`:** the base with events and its budgets, then the platform contract, in their own owner-reviewed pull requests.
4. **`mods`:** a first module, with its source, documentation and hardware evidence.
