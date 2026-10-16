# Syntakt OS 1.40 / 1.42 research report

Static research on the two Syntakt OS files the owner keeps outside the repository, done for the Syntakt core (step 4 of [Add a machine](ADD_A_MACHINE.md)). It records what the images show, what public research adds and what stays unknown, and it ends with the integration plan the core package in `sdk/syntakt/core/` follows. Everything here is static analysis: it never proves runtime behaviour. Hardware statements come only from named public reports; nothing was run on a unit for this report.

Tags: **[OBS]** seen in the image, **[INF]** inference from what was seen, **[PUB]** public research, **[UNK]** unknown. Addresses, lengths and SHA-256 guards only; no firmware bytes, code or tables.

## 0. Inputs and tooling ledger

| Input | Identity |
| --- | --- |
| `Syntakt_OS1.42.syx` (primary) | 2,572,064 bytes, SHA-256 `ded3c59fdb909eb9e2c3307b30a486452c8fa6947b12c14e0ce35a187b7f37c1`, version field `1.42`, build id `0097`, build timestamp section `2026-09-30 11:17:25` |
| `Syntakt_OS1.40.syx` (comparison) | 2,398,240 bytes, SHA-256 `7781245917cd3b0334e85da252846c0dc81a676ec0873b735cf51d9029e88ebf`, version field `1.40`, build id `0082`, build timestamp `2026-03-03 15:33:53`. This is **1.40**, not the 1.40A file (`266a5a30…`) the machine profile lists; every 1.40A feature string is already present in it; the 1.40A file arrived later and is a relinked build of the same length, surveyed in §5.1 [OBS] |
| Main OS image 1.42 (section 3, unpacked) | 3,442,576 bytes, SHA-256 `1a9723b19fb54d0566c1f690379d2e6dfe43227f77e170ad731dd029430eb3e7` |
| Main OS image 1.40 (section 3, unpacked) | 3,344,272 bytes, SHA-256 `847b1e539e581e226df8e705dcb8913fb686d2bc96bf1bb3a155b593b2a67d77` |

**Route (A0).** REA 6.5.0 with Ghidra 12.1.4 (JDK 24) was ready, and the Ghidra installation lists `68000:BE:32:Coldfire`. Route 1 (a synthetic big-endian `EM_68K` ELF around the unpacked main image, opened through REA with `REA_GHIDRA_LANGUAGE_ID=68000:BE:32:Coldfire`) **failed at REA's target admission**: REA 6.5.0 admits ELF machines x86/x86_64/MIPS/PowerPC/ARM/ARM64/RISC-V only and refuses `EM_68K` with `file_format_rejected: unsupported ELF architecture` (seen both through the CLI and through the MCP `open_binary`). Its raw-binary route admits x86/x86_64/arm/arm64/6502 only and rejects a language override. No REA Evidence IDs exist for this work.

Route 2 was used instead: Ghidra 12.1.4 `analyzeHeadless` directly (nothing installed; the installation was already present), `BinaryLoader` raw import at each image's load address, processor `68000:BE:32:Coldfire`, default compiler spec, with two small original scripts: a pre-script that seeds the entry point, and a post-script that exports memory blocks, functions, instructions, references, defined data and symbols as JSONL for offline analysis in Python. The route was validated against the image's own structure before anything was trusted: the first longword of the image is the reset entry, the reset code sets SR, the stack pointer, the VBR and fills the 256-entry vector table at 0x40000000, EMAC instructions (`mac.l`, `msac.l`) decode (a plain 68000 spec would not decode them), and 112 of 113 absolute call targets in the second-CPU image land on function prologues at its inferred load base.

Known limits of the route: Ghidra's Coldfire spec does not decode `movec` (6 sites in the 1.42 main image, all in the reset/VBR code), so disassembly stops after each; those windows were read from a throwaway MC68020-language import of the same bytes (ISA_A boot code shares the encodings). EMAC-dense functions have undecoded holes (95 in the second-CPU image); a few words in those holes were hand-decoded. Function boundaries are approximate. Two large data tables were swallowed as code. Every claim below says which of these limits touches it.

Public research consulted [PUB]: elektron-firmware-tool (container and transport), Synthack-OS (1.41 memory map, mod area, decompression limit, recovery, and issue #4 with a hardware observation), the Synthack-OS 1.42 port, the digiemu Syntakt port (MCF5441x, second CPU, section roles).

## 1. Findings ledger

Evidence classes: *image* (bytes of the named section), *disasm* (Ghidra export of the named image), *boot window* (MC68020 import of the reset region), *public*. Search boundary says what was scanned to make a negative claim.

| # | Claim | Evidence | Class | Boundary | Confidence |
| --- | --- | --- | --- | --- | --- |
| L1 | Both files are `ELE3` SysEx containers, device byte 0x16, 128-byte data messages carrying 101 decoded bytes each | repo reader `readEle3Syx` on both files | image | whole file | certain [OBS] |
| L2 | Section roles per the table in §2 | headers, strings, disassembly of each section | image/disasm | every section | high; roles of 1, 8 are [INF] from structure |
| L3 | Main OS loads at 0x40000400; the first longword is the reset entry 0x400004e8; 0x40000410 is the PIT0/`trap #0` context-switch handler | boot window | boot window | reset chain | certain [OBS] |
| L4 | Reset: SP = 0x48000000; VBR = 0x40000000; vector table 0x40000000–0x400003ff filled with a default handler then selected vectors; SRAM 0x80000000–0x8000ffff fully written from the image (two copies, zero fill of the rest); BSS cleared 0x4033a000–0x45566490 (1.42) / 0x40322000–0x4554da50 (1.40); data cache enabled copy-back over 0x40000000–0x47ffffff through ACR0; no ACR1–3, no MMU base register written | boot window, both releases | boot window | reset chain and the three `movec` sites | certain [OBS]; cache-mode decoding of the control values is [INF] |
| L5 | Heap: one buddy allocator, 16 MB pool 0x444e48c0–0x454e48c0 (1.42) / 0x444cbe80–0x454cbe80 (1.40), descriptor in initialised data (0x402d5324 / 0x402bddf0), 20 levels of 16-byte units; allocate 0x401036d0 / 0x400f6480, free 0x401038d6 / 0x400f6686 | disasm + data words | disasm | callers of the two most-called thunks | high [OBS] |
| L6 | No immediate, absolute operand or initialised-data word reaches [0x45566490, 0x4d570000) except the initial SP and 7 halt-path stores to 0x48000000 | three scans: decoded immediates and operands; raw even-offset words with a plausible opcode before them; 4-aligned data words. Floats and ASCII filtered | disasm + raw | whole main image, both releases | high for what is decodable; undecoded EMAC holes are the gap |
| L7 | Everything used above 0x48000000 is a fixed link-time arena: audio/DSP rings 0x4d570000–0x4d608000, serial rings and USB arena to 0x4d62f080, 2 MB OS-upgrade receive buffer to 0x4d82f080, SD bounce buffers to 0x4d84f2c0, 32 MB second-CPU sample packet to 0x4f84f2c1, second-CPU firmware staging to 0x4f8af2c9, FX/delay memory 0x4fc00000–0x50000000 (index masked to exactly 4 MB). 1.40: every arena 0x20000 lower, FX window identical | disasm, hand-decoded holes for the FX DMA | disasm | immediates, operands, data words | high [OBS]; purposes of the rings are [INF] |
| L8 | CPU1 has no sample pool in SDRAM: sample slots are 64 × 512 KB on the eMMC, sample bytes are heap objects (≤ 0x80000 bytes each) serialised into the 32 MB packet for the second CPU | disasm of the sample functions (0x401133ce, 0x40112376, 0x40082334) | disasm | sample-related callers | high [OBS]; "the playing sample RAM is on CPU2" is [INF] |
| L9 | Hardware observation: with samples loaded, the OS writes about a quarter of the 4 KB pages between 0x45570000 and 0x47eff000 (Synthack-OS 1.41, diagnostic build on the author's unit, issue #4) | public | public | — | reported, not reproduced here |
| L10 | The mechanism behind L9 is not visible statically: no constant, no page-count or page-number constant, no descriptor | scans in L6 plus page-number candidates (base>>12, end>>12, counts) | disasm | whole main image | negative result; the page-based writer stays [UNK] (eDMA channel 47's buffers were not found either) |
| L11 | SRAM [0x8000733c, 0x80008000) (3,268 bytes) has no reference in either release; the only nearby immediates are bound checks against 0x8000733c, 0x80007fff and 0x80008000; its boot-time content is zero; the two odd raw words that fell in the range are instruction fragments | disasm + raw + boot window | disasm | whole main image, both releases | high [OBS] |
| L12 | SRAM [0x8000e9b0, 0x80010000) is the top of a stock audio buffer (stride constants, runs to the SRAM end); the rest of SRAM is initialised and referenced | disasm (0x40097766) | disasm | SRAM references | high [OBS] |
| L13 | Image tail fill before the SRAM-init data: [0x40339730, 0x4033a000) = 2,256 bytes (1.42), [0x40321718, 0x40322000) = 2,280 bytes (1.40); zero, unreferenced, inside the BSS-clear range | raw + disasm | disasm | whole main image | high [OBS] |
| L14 | Section 2 is the bootstrap itself (startup menu, OS receive, bootstrap upgrader), stored in host SPI flash 0x40000–0x7ffff; it reads the staged container from flash 0x80000 (table at 0x80020). Its version word is 4.00 in both releases, and it upgrades only when the staged version is higher, so no bootstrap upgrade happens between 1.40 and 1.42 | disasm of section 2 | disasm | all five section lookups in section 2 | high [OBS]; the flash geometry beyond that is [UNK] |
| L15 | Section 4 is the RAM stage that tests DRAM, stages the packed main OS at 0x40200000 and depacks it in place to 0x40000400, then jumps through the image's first longword; its stored form has an 8-byte header so its code sits at 0x80000408 | disasm of section 4 | disasm | boot flow | high [OBS] |
| L16 | Section 8 (new in 1.42) is firmware for a Cortex-M UI/USB MCU (i.MX RT image vector table at +0x1000, vector table at +0x2000, task strings); the main OS flashes it to that MCU in 101-byte frames (0x400bdfba). The bootstrap never touches it | image + disasm | disasm | section 8 and every section-8 lookup | high [OBS]; "performed after the first restart" is Elektron's note [PUB] |
| L17 | Section 7 is the second ColdFire's OS: byte-identical in both releases, load base 0x40000400, entry 0x40001070, its own 128 MB SDRAM (same numeric map), 64 MB uploaded page area 0x4004f750–0x4404f750, BSS to 0x4404f980, SP 0x48000000, render ISR on vector 96 driven by PIT0, 1,024 bytes of output per block written to the link window by its eDMA channel 47 | disasm of section 7 | disasm | whole image (95 EMAC holes) | high [OBS]; period and parameter layout [UNK] |
| L18 | Section 6 is the second CPU's first-stage loader: brings up PLL, crossbar, DDR2 and DSPI, pulls an `0xAA`/length/payload stream from CPU1 into 0x40000400 and jumps to section 7 | disasm of section 6 | disasm | whole stub | high [OBS] |
| L19 | Link window: CPU1 FlexBus CS0 at 0x10000000 (128 KB) ↔ CPU2 CS0 at 0x0; +0..+0x1af host→CPU2 parameter block every block, +0x1b0..+0x5af render output, +0x800.. init-time page staging, +8 status | disasm both sides | disasm | both link state machines | high [OBS]; that both windows are the same memory is [INF] |
| L20 | Timers: PIT0 10 ms scheduler tick (vector 205), PIT1 1 µs busy-wait (no IRQ), PIT2 8.33 ms tick (vector 207), PIT3 33/67 ms UI tick (vector 208), DTIM1 µs timeout (vector 97), DTIM3 33.3 ms tick (vector 99), DTIM0/DTIM2 read as free-running counters. No timer is unclaimed | disasm | disasm | every timer MMIO page | high [OBS]; purposes [INF] |
| L21 | eDMA channels 15, 29, 30, 34–37, 42, 47, 52, 54, 59 are programmed, identically in both releases; all others untouched | disasm | disasm | every TCD write | high [OBS] |
| L22 | Installed vectors: {0, 24, 32, 64, 66, 67, 68, 97, 99, 108, 121, 128, 134, 149, 154, 155, 156, 157, 172, 174, 180, 181, 191, 192, 205, 207, 208, 209, 221, 222, 223}; everything else keeps the default fault handler | disasm | disasm | every vector-table write by code | high [OBS]; computed-index writes would be missed |
| L23 | SysEx: after `F0 00 20 3C`, a 24-slot product registry; for product byte 0x16 stock handles ids 0x50–0x5f, 0x60–0x6f, 0x7e, 0x7f; every other id is a no-op; product bytes 1–3, 5–0xf, 0x11–0x15 are unregistered | disasm (0x40104cae) | disasm | dispatcher and tables | high [OBS]; host-tool use of free ids [UNK] |
| L24 | Parameter table: 486 rows × 52 bytes, ids up to 0x2df; CC numbers in use 3–5, 7, 9–10, 13–31, 51–57, 65, 70–93, 102–109, 111–119; 1.40→1.42 changes one row (FX-track FENR gained CC 93) | disasm + data | disasm | the table | high [OBS] |
| L25 | Cross-release: 9,477 functions in 1.42; 67 unchanged in place, 7,948 moved, 956 modified (760 of them only by relative displacements), 506 new, 102 removed; code grew 82,078 bytes | function alignment by masked hash | disasm | all functions | high; individual pairings among identical tiny functions are arbitrary |

## 2. Container and image inventory (A1)

| id | kind | dest field | 1.42 unpacked | 1.40 unpacked | same bytes? | role |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | raw | 0 | 15 | 15 | no | build timestamp ASCII [OBS] |
| 2 | packed | 0x04000000 = version word 4.00 | 30,782 | 30,782 | no (942 bytes in 13 clusters, two of them in string/table data, plus the CRC trailer) | **bootstrap**: startup menu (key/encoder test, empty/factory reset, OS upgrade), OS receive, bootstrap upgrader. 4-byte length prefix, payload at 0x80000400 (SP, entry 0x80000f0e, version, 0; code from +0x10) [OBS]. Flash home 0x40000–0x7ffff [OBS] |
| 1 | packed | 0 | 149,516 | 149,516 | yes | FPGA bitstream for the main board's FPGA (Xilinx sync word; size fits an XC3S200A-class part) [INF]; configured by the bootstrap, never by the main OS |
| 3 | packed | 0x40000400 | 3,442,576 | 3,344,272 | no | **main OS** (CPU1, MCF5441x-class ColdFire with EMAC). Staged packed at 0x40200000 by section 4 and depacked in place |
| 4 | raw-header | 0x80000400 | 32,768 (+8 header) | 32,768 | no (14,205 bytes differ) | **RAM boot stage**: DRAM test, stages and depacks the main OS, jumps to it. Code at 0x80000408 [OBS] |
| 6 | raw | 0 | 1,744 | 1,744 | yes | **second-CPU first-stage loader** (8-byte boot header + program at 0x80000000) [OBS] |
| 7 | raw | 0 | 383,760 | 383,760 | yes | **second-CPU OS** at 0x40000400, entry 0x40001070, with its own packed FPGA bitstream (XC3S50A-class [INF]) that it sends over its DSPI2 |
| 8 | packed | 0 | 159,948 | — | new in 1.42 | **UI/USB MCU firmware** (Cortex-M, i.MX RT image vector table), flashed by the main OS to the MCU's own flash at 0x60040000 [OBS]. The release note's "bootstrap is also upgraded after the first restart" matches this payload, not section 2 [INF] |

Boot chain [OBS, order partly INF]: mask ROM → bootstrap (section 2 image in host SPI flash 0x40000, runs in SRAM at 0x80000400) → section 4 (SRAM 0x80000408) → main OS (SDRAM 0x40000400). The main OS then stages section 6 and section 7 for the second CPU over DSPI3/DSPI0 and configures its link, and flashes section 8 to the UI MCU when needed.

**Untouchable regions** (every patch site must stay out of them): host SPI flash 0x40000–0x7ffff (bootstrap) and the staged container from 0x80000 (header at 0x80000, table at 0x80020); sections 1, 2, 4, 5, 6, 7, 8 in full (the builder keeps them byte-identical; only section 3 changes); the second CPU's whole address space (its SRAM is fully initialised, its vectors, its 64 MB page area, its stack top); the link window; the main OS vector table 0x40000000–0x400003ff; the SRAM-init source data 0x4033a000–0x40348b90 (1.42) / 0x40322000–0x40330b90 (1.40); the heap descriptor; the SysEx registry and handler tables.

**Main OS 1.42 layout** (1.40 in brackets):

| Range | Content |
| --- | --- |
| 0x40000000–0x400003ff | vector table (RAM, written at boot) |
| 0x40000400–0x4000040f | image header: reset entry pointer, three zero longs |
| 0x40000410–0x401c1062 [–0x401acfc4] | code with interleaved literal pools and jump tables |
| 0x401c1062–0x402d4000 [0x401acfc4–0x402bd000] | parameter tables, strings, RTTI, vtables |
| 0x402d4000–0x40339730 [0x402bd000–0x40321718] | initialised data (heap descriptor 0x402d5324 [0x402bddf0], SysEx registry 0x402d5350, framebuffer pointers) and tail data |
| 0x40339730–0x4033a000 [0x40321718–0x40322000] | zero linker fill, 2,256 [2,280] bytes, unreferenced (L13) |
| 0x4033a000–0x40348b90 [0x40322000–0x40330b90] | SRAM initialisation images (copied to 0x80000000 and 0x80008000 at reset, then zeroed as BSS) |
| 0x4033a000–0x45566490 [0x40322000–0x4554da50] | BSS, zeroed at reset; holds every task stack, the heap pool and its bookkeeping, the scheduler block (0x454e4968–0x454e49a8) |
| 0x45566490–0x48000000 [0x4554da50–] | no static reference (L6); runtime page writes reported on hardware (L9); boot/idle stack grows down from 0x48000000 |
| 0x48000000–0x4d570000 | no static reference; outside the cached window |
| 0x4d570000–0x4f8af2c9 [0x4d550000–0x4f88f2c9] | DMA and link arenas (L7) |
| 0x4f8af2c9–0x4fc00000 | no static reference |
| 0x4fc00000–0x50000000 | FX/delay memory, exactly 4 MB, cleared at init |
| 0x80000000–0x8000733c | SRAM, initialised and referenced (display DMA frame at 0x800051e0, SSI rings at 0x80000000/0x80001800, FX DMA descriptors) |
| 0x8000733c–0x80008000 | SRAM, zero at boot, unreferenced (L11) |
| 0x80008000–0x80010000 | SRAM, initialised and referenced; the top is an audio buffer (L12) |
| 0x10000000–0x1001ffff | FlexBus CS0: second-CPU link window |
| 0x00000000–0x0001ffff | FlexBus CS1: board window (board id read at 0 [PUB]) |

DRAM size and base: the OS caches 0x40000000–0x47ffffff and places arenas up to 0x50000000, so it configures nothing itself (no DDR-controller access in the main OS; the bootstrap chain does it) and uses a 256 MB window [INF]. Section 4 tests only 0x40000000–0x44000000 [OBS].

## 3. Memory ownership map and verdicts (A3)

Proof standard: *static* (no absolute reference, immediate, literal-pool entry, computed base plus offset, or table entry reaches the range in either release) **and** *allocator* (every allocator, pool, ring and DMA buffer is bounded away from it at its maximum size, and nothing clears, tests or fills it during boot or any later transition). Only **proven free** may be offered to mods.

| Range (1.42) | Range (1.40) | Size | Verdict | Static | Allocator | Cache / reset / masters |
| --- | --- | --- | --- | --- | --- | --- |
| 0x8000733c–0x80008000 | same | 3,268 B | **proven free** | no reference in either release (L11) | SRAM has no allocator; DMA rings in SRAM (channels 15, 52, 54) sit below 0x80007330; the only write is the reset zero fill, which runs before any hook | SRAM, uncached, no DMA master targets it; content is re-zeroed at every reset, so nothing may rely on persistence |
| 0x40339730–0x4033a000 | 0x40321718–0x40322000 | 2,256 / 2,280 B | **proven free for data that is written before the BSS clear and read only by code that runs before it; not free afterwards** | no reference (L13) | inside the BSS-clear range: zeroed at reset after the SRAM copy | loaded from the image; useful only as a home for the core's boot stub |
| 0x45566490–0x47ff0000 | 0x4554da50–0x47ff0000 | 44.4 MB | **not free** | no reference (L6) | the page-granular runtime writer reported on hardware (L9) is not bounded statically (L10) | cached; a runtime-derived writer and possibly eDMA channel 47 |
| 0x47ff0000–0x48000000 | same | 64 KB | **not free** | initial SP | boot/idle stack and the interrupt frames taken while idle; depth unbounded statically | cached |
| 0x48000000–0x4d570000 | 0x48000000–0x4d550000 | 85.4 MB | **probably free** | no reference | no pool constant; the L9 mechanism is unexplained, so it cannot be excluded here either | uncached by the default cache mode [INF]; where DMA buffers would be placed |
| 0x4d570000–0x4f8af2c9 | 0x4d550000–0x4f88f2c9 | 33.3 MB | **not free** | fixed arenas (L7) | — | uncached, DMA and link masters |
| 0x4f8af2c9–0x4fc00000 | 0x4f88f2c9–0x4fc00000 | 3.3 MB | **probably free** | no reference | same unknowns as above | uncached |
| 0x4fc00000–0x50000000 | same | 4 MB | **not free** | FX window | masked index proves the extent | uncached, eDMA 30/42 |
| heap pool 0x444e48c0–0x454e48c0 | 0x444cbe80–0x454cbe80 | 16 MB | **not free (allocator-managed)** | descriptor constants | handed out by the buddy allocator only | cached |
| second CPU, 0x4404f980–0x47ff0000 | same | 63 MB | **unknown** | no immediate reference | its stack/heap use was not traced | separate SDRAM |

**Headroom.** Static headroom for mods on CPU1 is the proven-free 3,268 bytes of SRAM plus the boot-time fill; nothing larger is proven. What stock does when memory is exhausted: the allocator calls a handler pointer and retries (0x401ba802) [OBS]; sample loading is capped per slot at 0x80000 bytes [OBS].

**Proposed reserved region for the core (this report's decision).** The core claims only the proven-free SRAM tail, `sram-tail` = [0x8000733c, 0x80008000), in both releases, and uses the image fill only for its one-shot boot stub. It offers **no SDRAM area to mods** until the owner decides between the two guarded candidates below and the chosen one is qualified on hardware:

- **Candidate B, SP-relocated top window.** Patch the 4-byte initial-SP immediate at 0x400004f4 (identical in both releases, guard `97f3f29734d22b764958054cf0fcce9cb81a679be081fb982af63bf246237d49`) from 0x48000000 to 0x47fe0000 and reserve [0x47fe0000, 0x48000000) (128 KB). Argument: after the patch the only stock reference to the window is gone; the stack and its interrupt frames grow down from the new top; the hardware-observed page writer reached 0x47eff000 (L9), 1 MB below. Unverified assumptions: that the page writer's limit is a constant or derives from the initial SP (so it does not rise with samples), and that eDMA channel 47 never targets the window. These cannot be checked without firmware; they need a hardware stress run with the maximum sample load.
- **Candidate A, heap block reserved at init.** Hook the allocator's first-use initialisation and take the first 64 KB block before any stock request (the Synthack-OS v0.8.1 approach, which its author tested on a unit with all samples loaded [PUB]). Argument: the block then belongs to the core and the allocator never hands it out again. Deviation: stock *allocates* it, which the design invariant forbids literally; the pool start also receives a 12-byte initialisation record [PUB], so the block must be used from +0x10. The allocator's in-block writes were not audited.

Neither candidate meets the proof standard today. The allocator/linker therefore refuses every mod that needs SDRAM (see §7).

## 4. Hook sites and stock claims (A4)

### 4.1 Patch sites

Minimum set for the boot-probe core: **one site**.

| Site | 1.42 | 1.40 | Length | SHA-256 of the displaced stock bytes | Continuation | Checks |
| --- | --- | --- | --- | --- | --- | --- |
| **P1 boot hook: BSS-clear entry** | 0x400004b2 | 0x400004b2 | 8 B (2 whole instructions: frame adjust, register save) | `02baba67a7ec7d7bdf683fa37f268620e3a694853b398205df521c64128da818` (identical in both releases) | 0x400004ba | no PC-relative operand; no branch target inside the window (the clear loop's target is 0x400004d2); the single caller is the reset chain at 0x40000542; task context with interrupts masked (SR set at reset); registers D1, A0 are set after the window, D4–D7 are saved by the displaced instructions and must be preserved by the hook; the SRAM init has already run, the BSS has not yet been cleared, so the appended image tail is still intact and SRAM is already initialised. Runs once |

Why this site: everything appended to section 3 lands inside the BSS-clear range (§2), so a core must run before the clear to move its payload out of it. The alternative Digitakt-style site, the main-init call at 0x40000568 (6 B, guards `4e51d364…` in 1.42 and `e3bbd257…` in 1.40, drifting targets), runs after the clear and is therefore unusable for a tail-loaded core on this machine. The call sites at 0x4000053e and 0x40000542 are 4-byte PC-relative calls and cannot hold an absolute call.

Optional, only if the owner selects candidate B: **P2**, the 4-byte initial-SP immediate at 0x400004f4 (guard above, identical in both releases; a data patch, no instruction boundary issue).

### 4.2 Other sites surveyed

Second CPU (section 7, identical in both releases, all guards from its image; none has PC-relative operands or inbound branch targets): the render-ISR vector install (0x40001064, 12 B, `bb282050093067d86fda3e9c00c6367a0aaac32b04b76ab30d334c715675182c`, the cleanest redirect), ISR entry 0x40000934 (8 B, `45486562829f9f68fe718dfa058709444ab563cbedb507287f1b26c9de830df6`), render stages 0x40000a34 / 0x40000a46 / 0x40000a5a / 0x40000abc (6 B each), the per-track call 0x40000a90 (6 B), post-render 0x40000ac6 (12 B), DMA start 0x40000afc (8 B). All run in interrupt context on PIT0 with a 1,024-byte output block whose period is unknown. The second CPU has no proven-free region, so these are inventory only.

Main CPU UI, audio and project sites: §4.4.

### 4.3 Stock claims a mod could collide with

| Resource | Stock use (1.42 = 1.40) | Free |
| --- | --- | --- |
| Timers | PIT0 scheduler tick, PIT1 delay loop, PIT2 8.33 ms tick, PIT3 UI tick, DTIM1 timeout, DTIM3 30 Hz tick, DTIM0/DTIM2 read as counters | none |
| eDMA channels | 15, 29, 30, 34, 35, 36, 37, 42, 47, 52, 54, 59 | 0–14, 16–28, 31–33, 38–41, 43–46, 48–51, 53, 55–58, 60–63 (never touched; a mod must program the mux, TCD and interrupt itself) |
| Interrupt vectors | the 31 listed in L22 (the default handler is a fault trap) | every other vector; INTC sources never unmasked by stock are listed in the claims inventory |
| UARTs | the two at 0xec070000 (156,250 baud) and 0xec074000 (31,250 baud, MIDI); UART0–3 at 0xfc06xxxx unreferenced | the four unused UART modules |
| USB | OTG device with four descriptor variants (VID 0x1935) | — |
| SysEx (product byte 0x16) | ids 0x50–0x5f, 0x60–0x6f, 0x7e, 0x7f | 0x00–0x0f, 0x11–0x4f, 0x70–0x77, 0x79–0x7d (no-ops in stock; use by Elektron's host tools unknown) |
| MIDI CC | 74 numbers (L24) | 0–2, 6, 8, 11–12, 32–50, 58–64, 66–69, 94–101, 110, 120–127 within this table; reserved MIDI meanings apply |
| Parameter ids | up to 0x2df in a 486-row table | gaps exist; the runtime walker was not located |
| Menu rows | built in code (0x4005ed72) from 0x54-byte items; no static row table | a row helper is the integration point |
| Storage | eMMC: project file type 1 (version ≤ 13), sound type 3 (version ≤ 7), 512-byte settings blocks (`COKI`) at two sectors and three SPI-flash slots; virtual paths `/projects`, `/soundbanks`, `/samples`, `/incoming` | a core block needs an owner-reviewed location; none proven free |

### 4.4 Main-CPU UI, audio and project sites

Surveyed in 1.42 and confirmed in 1.40 through the function alignment. No displaced window below has a PC-relative operand or an inbound branch target; every window is whole instructions. Context: the UI task has priority 6 and consumes a message queue; the DTIM3 interrupt posts a tick message every 33.3 ms; keys and encoders arrive on the panel UART (156,250 baud) through the key scanner in interrupt context and an 8.33 ms flush callback, and are delivered to the UI as queue messages. The audio block interrupt is software-pended by the SSI DMA interrupt and renders 1,024-byte blocks (half of the 2 KB SSI ring; sample rate unknown, so the block period is unknown). Inventory only: the core exposes none of these yet.

| Site | 1.42 | 1.40 | Length | Guard 1.42 | Guard 1.40 | Context |
| --- | --- | --- | --- | --- | --- | --- |
| UI tick: the call of an empty stub after each 33 ms message (the stub has exactly one caller; a 4-byte operand patch suffices) | 0x4000b47e | 0x4000b2fc | 6 | `b64e6653…f52602` | `75c63249…2fddbe` | UI task; must preserve D2–D7, A2–A6 |
| UI message received (type byte at the message pointer) | 0x4000b2de | 0x4000b15e | 6 | `64d030bc…043869` | `5f4cc79f…a34c37` (a constant differs) | UI task |
| Key delivery, callee entry (every key event) | 0x4000839e | 0x400083b6 | 8 | `9b78b677…2ddbd0` | identical | UI task; SP-relative arguments, so a hook replays the prologue and jumps back |
| Encoder delivery, callee entry | 0x400083f0 | 0x40008408 | 6 | `01e6e5f3…6efba` | identical | UI task |
| View key handler entry (after the brain's listeners) | 0x40101498 | 0x400f4248 | 8 | `3d25d06b…2e2694` | identical | UI task |
| View encoder handler entry | 0x40101370 | 0x400f4120 | 8 | `c1169487…5f98b9` | identical | UI task |
| SETTINGS menu: after the last row, before finalisation (the place to append rows) | 0x4005f176 | 0x4005d300 | 6 | `c7589861…542c74` | identical | task; the menu object and one register must survive |
| Audio block interrupt entry (render-in) | 0x4008480c | 0x4008364c | 8 | `985e8bab…bb8c65` | identical | interrupt, INTC1 source 63 (vector 191, level 5), pended by the DMA interrupt; a second engine mode has its own copy at 0x4008dd24 / 0x4008cb64 |
| Audio block interrupt exit (render-out) | 0x40084a30 | 0x40083870 | 6 | `f525ed0f…220cad` | identical | interrupt; the saved frame is about to be restored |
| SSI DMA interrupt (channel 54, vector 174) | 0x40084464 | 0x400832a4 | 8 | `33ebd8d6…063837` | identical | interrupt, level 6 |
| Periodic callback registration (the 8.33 ms service; a mod can call it instead of patching) | 0x40002de8 | 0x40002de8 | 8 | `efa23c0a…09ecf5` | identical | task |

Not found: the frame buffer and draw path (the display DMA stream on channel 15 turned out to be a 1,000-byte control stream to the FPGA configuration master, not pixels), the project load and save entries (only the transfer-header validator, 0x400b728e, with project version ≤ 13 and sound version ≤ 7), and the sequencer step. These remain **unknown**.

## 5. Cross-release diff (A2)

**Growth.** The `.syx` grew by exactly 173,824 bytes = 1,358 more 128-byte data messages. The container grew 137,104 bytes: new section 8 stored 103,416 (+103,424 padded), section 3 stored +33,672 (+33,664 padded), one more 16-byte table entry (+16), section 2's +8 absorbed by padding. Transport: 8-in-7 marker bytes 20,370 + message headers 13,580 + checksums and end bytes 2,716 + 54 more zero fill; sum 173,824 [OBS, exact]. So three quarters of the file growth is the new UI-MCU firmware, not OS code: the small notes and the large file difference are consistent.

**Section 3's +98,304 unpacked bytes** landed as: code +82,078 (function bytes +70,030, literal pools and tables +12,048); rodata +722; RTTI/type-name strings +10,680 (110 `BreakOutBox` occurrences, 0 in 1.40); Outbox 8 UI strings +1,906; rodata +130; initialised data +856; tail data +1,912; SRAM-init images unchanged (60,304 bytes, byte-identical, moved by 0x18000). BSS grew 2,624 bytes.

**Functions** (1.42): 67 unchanged in place (all before the first insertion, 0x400004b2–0x4000457e), 7,948 moved, 956 modified (760 only by relative displacements; 196 real edits, mostly struct-layout constants: project storage 12→13, settings storage v3→v4, a +0x78 field shift), 506 new, 102 removed.

**Notes to code** (confidence): Outbox 8 configuration (1.41) → 105 new functions, 23 KB, at 0x400bf000–0x400dc800 with the Outbox/CV strings and a new settings record (high). Main outputs through Outbox 8 (1.42) → modified mixer page function (0x40043320, +342 B) and new page labels (high). FUNC+UP/DOWN in the Outbox channel pages → only visible as part of the new views (low). MIDI at very low BPM (1.41) → no attributable change (unknown). Every 1.40A item is already in the 1.40 file as far as strings show; FX-track FPAN still has no CC in the parameter table in either release, while the FX-track envelope-reset row gained CC 93 between the files (medium: a table change without a matching note). Changes with no note: storage layout versions, page-label rework, about 12.6 KB of new number-formatting code.

**Bootstrap finding.** No bootstrap upgrade is carried between 1.40 and 1.42 (both 4.00, L14); the "upgraded after the first restart" payload is the UI MCU image (L16), which only the main OS writes, to a different chip. The main-OS builder must keep sections 2, 4, 6, 7 and 8 byte-identical; the patch sites stay out of all of them by construction.

**Per-release guard table** (addresses, lengths, hashes only):

| Item | 1.40 | 1.42 |
| --- | --- | --- |
| stock `.syx` | `77812459…88ebf` | `ded3c59f…37c1` |
| main image | 3,344,272 B, `847b1e53…2a67d77` | 3,442,576 B, `1a9723b1…30eb3e7` |
| P1 0x400004b2 +8 | `02baba67…8da818` | identical |
| P2 0x400004f4 +4 | `97f3f297…237d49` | identical |
| main-init call 0x40000568 +6 | `e3bbd257…97ce` | `4e51d364…1fa5a` |
| vector filler 0x40001d0a +30 | `6d6aecb3…187` | identical |
| image header 0x40000400 +16 | `973f359f…4abc` | identical |
| BSS end | 0x4554da50 | 0x45566490 |
| heap pool | 0x444cbe80–0x454cbe80 | 0x444e48c0–0x454e48c0 |
| in-place depack margin of the stock image (stage 0x40200000) | 160,989 B | 96,357 B |
| in-place depack margin of the boot-probe build (the repository's packer stores section 3 more densely, which narrows the margin) | 84,063 B | 16,679 B |
| container size / room below the 2 MB in-OS receive buffer | 1,892,288 / 204,864 B | 2,029,392 / 67,760 B |

Candidate reserved ranges unreferenced in both releases: the SRAM tail and the image fill (§3). Candidate hook sites with identical displaced bytes in both: P1, P2, the vector filler, the image header. Sites that drift: the main-init call (target), everything inside relocated code.

### 5.1 The other two releases (1.40A, 1.41): container survey only

Files received after the analysis above: `Syntakt_OS1.40A.syx` (2,398,496 bytes, SHA-256 `266a5a3022ff565bf470173147b7f3005b7da8ef80724b6271836818ac2b5828`, version field reads `.40A` because the field holds four characters, build stamp `2026-04-23 11:03:03`) and `Syntakt_OS1.41.syx` (2,571,424 bytes, SHA-256 `8e2488f462c4a5656396a895f113bcd415e9900fa8709340dccf45d4cb9ed19e`, version field `1.41`, build stamp `2026-09-08 14:39:29`). Surveyed with the repository's container reader only (section hashes, image diffs, the two guard windows); no disassembly [OBS].

| Item | 1.40 | 1.40A | 1.41 | 1.42 |
| --- | --- | --- | --- | --- |
| main OS image (section 3) | 3,344,272 B, `847b1e53…` | 3,344,272 B, `8510e477…` | 3,438,480 B, `8cf2b4b4…` | 3,442,576 B, `1a9723b1…` |
| bootstrap (2), RAM stage (4) | `c99c81ad…`, `705ea1f2…` | same as 1.40 | `9fa34a83…`, `6c162682…` | same as 1.41 |
| UI-MCU image (8) | absent | absent | 159,948 B, `6943b2f2…` | same as 1.41 |
| sections 1, 6, 7 (second CPU) | identical in all four | | | |
| P1 guard (0x400004b2, 8 B) and SP word (0x400004f4) | identical in all four (`02baba67…`, 0x48000000) | | | |

Consequences. (1) **1.40A is a different build of the same length**, not 1.40 with a data fix: 2.69 MB of the 3.34 MB image differ in 231,679 ranges, most of them 1–3 bytes with no constant word delta, which is a relink with moved code. The 1.40 stock map (protected ranges, SRAM-init source data, heap descriptor, SysEx tables) therefore does not transfer to 1.40A; binding 1.40A needs its own disassembly run. The guards refuse it today, as designed. (2) 1.41 → 1.42 is likewise a relink (2.58 MB differ) with section 3 growing 4,096 bytes; the UI-MCU image and the new bootstrap and RAM stage shipped in 1.41 and are byte-identical in 1.42, so the §5 "bootstrap finding" holds for 1.41 as well. (3) The hook site and the initial stack are stable across every shipped build of this line, which strengthens the P1 choice but proves nothing about the memory map of the two unanalysed releases. Full analysis of 1.40A or 1.41 is worth doing only if the owner wants units on those releases supported without updating to 1.42; it is a rerun of the A1–A4 pipeline per release, not new research.

## 6. What hardware can enforce (A5)

The main OS writes only CACR, ACR0 and VBR; it never writes the MMU base register, so the V4e MMU is off [OBS], and turning it on would change every stock access path (out of scope and unprovable here). ACR1 (data) and ACR2/ACR3 (instruction) are unused, but ACRs cover 16 MB-granular windows and the stock image shares its first 16 MB with its own initialised data and BSS, so no ACR can write-protect stock code or fence a sub-megabyte reserved region. **Hardware cannot enforce the invariants.** Residual risk, stated exactly: a stray pointer write by stock or by a mod cannot be ruled out statically, and the hardware-observed runtime page writer (L9) has no static bound.

Strongest enforceable mitigations: a constrained mod API (no raw addresses: mods get their regions from the linker), fail-closed linking (every stock write is a declared, guarded site; whole-instruction and PC-relative checks on every code site; overlap, protected-range and budget refusals), the in-place depack margin and container-size budgets, a stock-write checker over the produced image, and a boot-time self-check in the core (signature in the reserved SRAM tail) so a trial build can prove the hook ran before anything else is trusted.

## 7. Safety argument

Statically guaranteed, for a build the allocator/linker accepts: the output container differs from stock only in section 3; section 3 differs only at declared sites (P1, and P2 if enabled) plus an appended tail; each site's stock bytes match their guard, lie on whole instructions and contain no PC-relative operand; no site touches a protected range; the appended tail is relocated by the core before the BSS clear erases it; nothing is placed in SDRAM; the in-place depack margin stays above zero; the container stays below the 2 MB receive-buffer bound. Only guarded (argued, not proven): that stock never writes the SRAM tail after reset (no reference exists; a runtime-derived pointer is the residual), and the two SDRAM candidates. Not covered at all: runtime timing, audio, the second CPU, hardware recovery.

## 8. Platform decision brief

**Recommendation: reuse `elemod`.** Evidence: the Syntakt's container is the same `ELE3`/SysEx scheme with the main OS as section 3 at 0x40000400, staged at 0x40200000 and depacked in place exactly as the Digitakt profile describes; the repository's linker already implements guarded sites, whole-instruction and PC-relative checks, named claims, protected ranges, area placement and fail-closed refusals; the ColdFire family and the boot shape match. Differences the profile must carry: the appended tail lies inside the BSS-clear range, so the Syntakt core's boot hook is P1 (before the clear), not a main-init call; the device profile offers no SDRAM area until the owner's decision; `flashAt` is 0x80000 (observed) and the container limit is the 2 MB receive-buffer bound (inferred); the four CPUs/chips (main, second ColdFire, FPGAs, UI MCU) stay untouchable.

The owner must decide: (1) accepting a Syntakt entry in the shared `ElemodMachine`, `ELE3_DEVICES` and `LINK_DEVICES` tables (shared builder code); (2) the SDRAM mod region: candidate B (SP relocation) or A (heap block), each after a hardware stress qualification, or neither; (3) whether the 2 MB container bound is acceptable as the flash limit until the flash geometry is read from a unit; (4) whether supporting the 1.40 file is wanted, since 1.40A is the shipped build of that line and, being a relink (§5.1), needs its own analysis run before it can bind (the profile's 1.40A entry stays listed but no core release binds to it); the same applies to 1.41.

## 9. Integration plan (Stage B) and risk register

Implemented in this pull request, covering only what the evidence supports:

1. Device profile: `syntakt` in `ELE3_DEVICES` (section 3, load 0x40000400, stage 0x40200000, flash 0x80000, limit 0x280000) and `SYNTAKT_DEVICE` in `src/engine/elektron/syntakt.ts` (releases 1.40 and 1.42 with the hashes above; areas `sram-tail` only; `ddr` empty; protected ranges: the image header, the reset chain except P1 and P2, the vector filler, and per release the SRAM-init source data, the heap descriptor and the SysEx tables). The profile is deliberately not added to the shared `LINK_DEVICES` table: the shared core builder assumes the Digitakt hook shape for every registered machine, so registration is an owner-review item.
2. Stock-write checker: a firmware-free function that compares a produced image with stock and refuses any changed byte outside the declared, guard-verified sites and the appended tail, refuses overlapping or unguarded sites, refuses sites inside protected ranges and refuses a tail that the boot hook could not relocate. Negative tests for every refusal.
3. Core package `sdk/syntakt/core/`: `probe.json` (stage `boot-probe`, P1 per release), `interface.json` (no events yet; memory `sram-tail`), README with the contract and the open decisions; the original boot stub as assembled bytes with a decoder test proving instruction boundaries.
4. `sdk/machines/syntakt/machine.json`: `core` → `started`, the analysed 1.40 file added as a supported release beside 1.40A and 1.42 (hashes only; every proof above holds in 1.40 and 1.42, and a 1.40A file is refused by the guards rather than mis-patched); registry regenerated. No `sdk` block: the contract would accept one, but the repository reads an `elemod` SDK as "modules can be scaffolded and built" (scaffold and contract tests, the registry), which is false at the boot-probe stage; the budgets live in the machine guide instead.
5. `sdk/machines/syntakt/README.md`, the local evidence command `scripts/verify-syntakt-core-probe.mjs` and a `docs/VERIFICATION.md` entry with the image and build hashes, what was checked locally and what was not.

Deferred to owner review: the SDRAM region (A/B), events (§4.4), the second CPU, a settings/storage block, the USB link and runtime loader.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| The runtime page writer (L9) also reaches a region a later core offers | medium | brick-free crash at runtime (recover by reflashing stock) | offer no SDRAM until a hardware stress run with maximum samples passes on the exact build |
| 1.40A differs from the 1.40 file in the patched region | none at P1 (identical in 1.40, 1.40A, 1.41 and 1.42, §5.1); elsewhere it is a different build | build refused by guard, not a crash | guards are per release hash; a 1.40A file matches no release and is refused |
| Container exceeds what the flash or the in-OS upgrade accepts | low with the 2 MB bound | upgrade refused or, worse, a partial flash | bound enforced; the first trial build should be flashed from the startup menu over DIN with stock at hand |
| In-place depack overrun | low | hang at the logo (Synthack observed this with zero padding) | margin check on every build |
| The boot hook runs with a stale SRAM tail | none by design | — | SRAM init precedes P1 |
| Recovery path untested on the owner's unit | — | a failed boot needs the FUNC+TRIG 4 DIN path, which the owner has not exercised | trial only with the stock file, a DIN interface and Transfer's legacy mode ready |

## 10. Verification plan

Firmware-free (CI): the checker and profile tests above. Local (owner's files, results as hashes only): link the boot probe against both stock images, verify the container with the repository's verifier (margin, size, section identity) and record the output hashes in `docs/VERIFICATION.md`.

Emulator: the digiemu Syntakt port boots 1.40A to the live UI with the second CPU running [PUB]; a boot-probe build for 1.42 or 1.40A could be run there to confirm the hook executes and the OS reaches the UI, and to read the SRAM-tail signature. Not done here; the emulator does not model the FPGA, audio or persistence.

Hardware (owner; every step bound to the exact build hash, nothing below is verified):

1. Keep the stock 1.42 file, a MIDI DIN interface and Transfer's legacy OS-upgrade mode ready. The FUNC+TRIG 4 recovery path is **untested on the owner's unit**; a failed boot can only be recovered that way.
2. Flash the boot-probe build whose SHA-256 is recorded in `docs/VERIFICATION.md` with Transfer over USB.
3. First boot: the unit must reach the live UI and play a stock project; note the shown OS version string.
4. Persistence: power-cycle twice; load a project with samples; load every sample slot the unit has; play for ten minutes with Outbox 8 attached if available.
5. Recovery: flash the stock 1.42 file the same way and confirm the stock version string.
6. Report exact results; anything not performed stays unverified.
