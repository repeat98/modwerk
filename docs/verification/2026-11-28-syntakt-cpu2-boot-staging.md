# Syntakt OS 1.42: CPU2 boot staging and private DDR

External research by Kári, recorded on 2026-11-28 from the retained MAX investigation of 2026-11-17. Related to [#1922](https://github.com/repeat98/modwerk/pull/1922). This supplies measured address/lifetime constraints, not a loader, allocator or Modwerk qualification. No implementation or stock bytes are included.

## Identity and guards

The source reports are `CPU2-ARENA-FEASIBILITY-20261117.md` and `CPU2-128K-VALIDATION.md` in the author's `tools/modular_plus/`. Input identities: official OS 1.42 SysEx SHA-256 `ded3c59fdb909eb9e2c3307b30a486452c8fa6947b12c14e0ce35a187b7f37c1`; decoded section 7 SHA-256 `daf6451cf9587c0b628e901b7bb6b25f4e2633d448c534c0c181dd35ec783bc2`, 383,760 B loaded at `0x40000400`. The section identity and these range digests were rechecked directly against that retained local input for this contribution. Hash offsets are `address - 0x40000400`; hashes are correlation guards, not permission to patch.

| CPU2 address | Bytes | SHA-256 of stock range | Purpose |
| --- | ---: | --- | --- |
| `0x400010b4` | 8 | `6756cbf3a5025d1c73312200e906c6c4c691b2f87a719aedbeda37221436cc3e` | entry call site |
| `0x40042000` | 54,720 | `2045a09290d923e58eff32a8f1e7569b2370aa82b30c055c208c1af32017155c` | borrowed zero staging |
| `0x4004f5c0` | 180 | `10b2a66888c58a54b277fe2e68fb6e87150c3cd2c537b7f6a2d84559017438c7` | zero bootstrap slot |

## Two owners, two lifetimes

All ranges are half-open in CPU2's private address space:

- **Boot input:** `[0x40042000,0x4004f5c0)`, 54,720 B of native zero-data. MAX installs through the call site at `0x400010b4`, using a bootstrap at `0x4004f5c0`. The retained emulator asserts that the *whole* staging interval is zero at PC `0x400004bc`, before displaced native initialization. This is borrowed startup storage, not a persistent arena or a hot-reload contract.
- **Runtime code+BSS:** `[0x47000000,0x47020000)`, 131,072 B. The old 65,536 B bound was a MAX project guard. Generated 32-bit BSS lengths initialized the expanded allocation without rewriting bootstrap source. Packed input size does not bound runtime state.
- **Audited native exclusions:** native initialization clears `[0x4004f6e0,0x4404f980)` (`0x40000512..0x40000546`); sample download/clear is bounded to `[0x4004f750,0x4404f750)` (64 MiB; `0x40000cda..0x40000d04`, `0x40000d7e..0x40000db2`). Sample-table rebuild/consumers (`0x40000d06..0x40000d7c`, `0x4000995e..0x400099e4`) bound indices to 0..63 and tables to `[0x4404f754,0x4404f954)`. The words at `0x4404f954/958` are PRNG state, not a growing allocation cursor. Stock CPU2 stack top is `0x48000000`, downward; the render-call harness uses an artificial `0x47f00000` stack, not a physical high-water measurement.

CPU1 has its own DDR map. [#1411](https://github.com/repeat98/modwerk/pull/1411) lowers **CPU1**'s stack via `0x400004f4` and copies an 84 B stub into CPU1 `[0x47fe0000,0x48000000)`. The later whole-gap retention test failed: BOOT L0 A0, RUN L32768 A0, with both DDR views agreeing, as retained in the research guide by [#2372](https://github.com/repeat98/modwerk/pull/2372). Neither the earlier copied-stub result nor that failed CPU1 retention test establishes CPU2 ownership. This CPU2 finding likewise gives no CPU1 reservation, shared-link-window ownership, DMA/coherence proof or Modwerk section-7 write permission.

## Retained CPU2 bounded-emulator results (17 November 2026)

| MAX probe | Initialized executable | Packed input / 54,720 B | Runtime code+BSS / 131,072 B | Arena spare |
| --- | ---: | ---: | ---: | ---: |
| FIBER + ORIGAMI | 7,152 B | 5,961 B | 81,956 B | 49,116 B |
| Mixed selection with both | 22,384 B | 18,403 B | 110,340 B (`0x4701af04` end) | 20,732 B |

These are retained MAX CPU2 emulator observations, not new execution for this Docs PR. Recorded execution covered stock CPU2 boot, four interrupts for each of 12 mapped stock engine families, sample clear/index rebuild, expanded payload/BSS initialization, lower/upper 4 KiB canaries and unused arena tail. The pair produced nonzero output through the native ISR in all eight slots with swapped assignments; the mixed probe routed all nine selected synths through all eight slots. DMA/chip responses and fast memory clear were modeled. This is bounded memory/routing evidence, not listening or silicon timing proof.

The mixed final section 7 was recorded byte-identical to the executed probe (SHA-256 `11e0d05f6ce7d4f1b46ae1d31ba58703a0230d6030fcd6e61ad95f8a405806da`); its private firmware identity is `0029f33041742f1c26bd9af52322faede908f8b06fa5ddcb2b0af351b602c6cc`. The recorded final verifier rejected runtime end `0x47020004` and contaminated staging padding. Six focused host tests passed, covering the new bound, retained reference path and packaging success/refusal. Full earlier DSP/LED suites were reused, not rerun; neither native suite nor firmware build was repeated for this Docs change.

The author retains the source/harness and results; these hashes identify the supplied reports and do not make them an independent Modwerk execution:

| Retained result | SHA-256 |
| --- | --- |
| pair `native-probe-evidence.json` | `61e070c31da0f1ff3c88c365e660b0ede5af35ccfad6553d2fdee773969d3a6e` |
| mixed `native-probe-evidence.json` | `6009e3828ef156a71cb2d4e1eae481aefee3457684b9f256881b3016ed7a7079` |
| `FINAL-VERIFICATION.json` | `aa2e9776c85a0fcfabaa78a48cee5ec7682405180fa4ccbc77a90f6d46da0070` |

Physical DDR aliasing, native stack high-water, interrupt/audio deadlines and corrupt-bank or unknown maintenance paths remain unverified. No conflicting owner was found only in the audited normal native paths and selected MAX modules. The rest of CPU2 DDR stays unknown; these measurements do not justify offering an allocator or raising Modwerk's declared memory limits.

Provenance: these are the author's MAX measurements and direct input checks, using the existing MAX/Synthack test infrastructure. No loader implementation is claimed as independent original work. No DigiKit source, adapted implementation, stock instructions, memory dump or firmware image is transferred.

## Existing verification plan (retained)

The following existing CPU1/boot-probe plan is moved unchanged from §10 at Modwerk main `a5d4c2ac8587c9abba7a94c61ad3dbf6e3e4c66e`, retaining the reviewed relocation to keep the research guide below 40 KiB. It is not tests run for this CPU2 contribution; its unperformed steps remain unverified.

Firmware-free (CI): the checker and profile tests above. Local (owner's files, results as hashes only): link the boot probe against both stock images, verify the container with the repository's verifier (margin, size, section identity) and record the output hashes in `docs/VERIFICATION.md`.

Emulator: the digiemu Syntakt port boots 1.40A to the live UI with the second CPU running [PUB]; a boot-probe build for 1.42 or 1.40A could be run there to confirm the hook executes and the OS reaches the UI, and to read the SRAM-tail signature. Not done here; the emulator does not model the FPGA, audio or persistence.

Hardware (owner; every step bound to the exact build hash, nothing below is verified):

1. Keep the stock 1.42 file, a MIDI DIN interface and Transfer's legacy OS-upgrade mode ready. The FUNC+TRIG 4 recovery path is **untested on the owner's unit**; a failed boot can only be recovered that way.
2. Flash the boot-probe build whose SHA-256 is recorded in `docs/VERIFICATION.md` with Transfer over USB.
3. First boot: the unit must reach the live UI and play a stock project; note the shown OS version string.
4. Persistence: power-cycle twice; load a project with samples; load every sample slot the unit has; play for ten minutes with Outbox 8 attached if available.
5. Recovery: flash the stock 1.42 file the same way and confirm the stock version string.
6. Report exact results; anything not performed stays unverified.
