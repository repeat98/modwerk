# Pattern Sample Locks 0.1.8 IPL-7 span analysis

**Scope.** This is a source-bound instruction/control-flow analysis, not a qualification claim or a chip-cycle measurement. Candidate package SHA-256: `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`. Native-source inventory SHA-256: `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69` (62 source files under the repository's `moduleNativeSourceSha256` rules); `unit.s` SHA-256: `837e44f48fa137444e14755d96011731c8fde29a73fa877ffc35edac3510473f`.

## Method and self-checks

A private helper (`verify_span.py`, SHA-256 `5c0b015a2a31ba049ae5cb7707be671051866ac0c42b0d86506c815d6ddf0196`) ran in the pinned offline container `sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792` (GCC 16.2.0). It compiled `translation.c` with the loader flags, assembled committed `unit.s` for MCF54455, ran `check_mcf54455`, linked both forms at origin zero and confirmed identical images: 8,748 initialized bytes, image SHA-256 `54efd2166b30b836401d02f8d0d785e12aebc5b40196deb1a9b6e4530e6f95d5`, 1,328 BSS bytes and 167 relocations.

The helper parsed the exact candidate package recipe and verified its image against the linked source outside nine declared stock-copy placeholders; it has no fill ranges. None of those placeholders overlaps `psl_write_step`, binding that function in the candidate to the linked source. Existing private stock-bound reconstruction evidence covers the copied ranges; this helper did not read stock. Helper outputs, linked objects/images, candidate package and result JSON remain outside Git; this file contains no firmware, extracted bytes, disassembly or memory dump. The result JSON is `span-analysis-3/result.json` in the same private work directory as the helper.

Reproduce by mounting the exact private candidate read-only at `/candidate/package.mwrm`, the private helper/output directory at `/out`, and the repository read-only at `/work`, then running:

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -e HOME=/tmp --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  -v "$PWD:/work:ro" \
  -v "$PRIVATE_CANDIDATE:/candidate/package.mwrm:ro" \
  -v "$PRIVATE_WORK:/out" -w /work \
  sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792 \
  python3 /out/verify_span.py
```

`PRIVATE_CANDIDATE` and `PRIVATE_WORK` are the local cache paths reported with this evidence; no firmware or stock file is mounted.

## Source-bound count

The linked function's instruction-boundary analysis includes the SR instruction that raises IPL to 7 and the SR restore. There are 15 non-loop instructions and a nine-instruction loop body, including its conditional branch. Each nonempty step passes between one and eight edits, so the module's path is `15 + 9n` instructions for `1 <= n <= 8`: 24–87 instructions, with a maximum of 87 module instructions per span. This is a count of the compiled module path; any interrupt handler that preempts it adds its own instructions and elapsed time.

`psl_commit_locked` visits 64 steps, collects edits from at most eight selected audio tracks per step, and enters the full-mask function only for nonempty steps. Thus a 512-field operation can have at most 64 spans, 5,568 module instructions across those spans (`64 × 87`) and 1,088 sample/index byte stores (`64 × (2 × 8 + 1)`). One maximum span makes eight loop iterations and writes each edit to the working and mirror fields, then updates one lock-index byte. These totals cover the short IPL-7 spans only, not the longer IPL-2 task guard or work performed by interrupt handlers.

## Interrupt and timing limits

The outer task guard raises the SR mask to at least IPL 2 (preserving a higher incoming level): level 1 scheduling is excluded while the source documents levels 3–6 for sequencer, USB, audio and DMA/UART service. Those services may run between full-mask spans. Inside IPL 7, ordinary interrupt levels 1–6 are masked; the MCF54455 manual says edge-sensitive level-7 requests remain unmasked, so a level-7 handler can preempt. Its source, vector, execution/stack bound and nesting behavior are not established here. Existing emulator scheduling evidence observed no watched handler entry during measured spans, but it used an earlier package, did not force a pending sequencer interrupt and is not hardware latency evidence.

Prior author-reported trials of the exact candidate recorded inner-span maxima of 696 and 617 DTCN3 counts (about 5.27 and 4.67 microseconds at the repository's documented 132 MHz timer scale). The candidate starts this timer interval after the mask write and stops it before the SR restore; these are sampled inner intervals, not full boundary timings or worst-case bounds. DTCN3 counts are timer ticks, not core cycles; the DMA timer source and prescaler and actual core clock require device configuration/readback.

The MCF54455 instruction timing tables assume prefetched opwords/extensions, no instruction-fetch wait, no sequence pipeline stall, aligned operands and infinite zero-wait memory. The default module path is uncached and accesses SDRAM. Exact core/PLL and bus clocks, timer configuration, SDRAM timings/refresh, arbitration under concurrent bus masters, cache state for referenced regions, live level-7 sources/handlers and complete nested task/interrupt stack bounds are unavailable here. Therefore these sources/specifications do not prove a chip-cycle upper bound or an interrupt-latency upper bound; do not convert emulator instructions or observed timer maxima into chip cycles or a universal worst case.

Specification: [NXP MCF54455 Reference Manual](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf), §§3.2.9 and 3.3.5.1 (interrupt mask and instruction timing assumptions), §§8.1/8.3.4 and Table 8-5 (clock definitions), Chapter 30 (DMA timers). Local uncached-module guidance is in `docs/OCTATRACK_HARDWARE_TRAPS.md`.
