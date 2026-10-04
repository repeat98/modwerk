# Digitakt II core 1.0 — source draft

The original elekloader core-dt2 from [PR #38](https://github.com/irpina/elekloader/pull/38), by toonst, is pinned to `71a5156781838fb5ef1c3e963b3949b781043a0d`. The shared source is credited to irpina and contributors under GPL-2.0-or-later. Modwerk’s own Digitakt/Digitone cores remain frozen.

## Interface and memory

The six events are `ev_tick`, `ev_draw`, `ev_key`, `ev_enc`, `ev_settings`, and `ev_personalize`; see [interface.json](interface.json). There are no audio render events: Digitakt II audio runs on its DSP. `NO_DTIM0=1` preserves the stock timer behavior; do not use the mk1 timer setup.

DDR is `0x47F00000–0x47F40000` (262144 bytes shared by core and modules). Fast code uses SRAM `0x8000F100–0x80010000` (3840 bytes). The extra free block `0x80006E80–0x80008000` is 4480 bytes and is not added to the fast-code budget. These are upstream researched areas, not a measured Modwerk allocation. `core_fast` copies fast code on the first tick; key and encoder handlers must stay in `.run`, because input can arrive before that tick.

## Source and stock isolation

`src/` contains only authored assembly. `recipe.json` adapts the upstream manifest to local source paths and replaces every stock preimage with an address, length and SHA-256. The local preparation script reconstructs preimages from the exact owner-selected OS 1.17 file in a disposable sandbox. Neither preimages nor firmware enter the repository or CI. `loader/` holds the three exact upstream Python changes plus the full engine file pin. The local preparation script stages them over byte-identical approved baseline files and verifies every identity before importing the temporary SDK. The public browser engine remains unchanged. The import identities are in [the import record](../../imports/elekloader-pr38-digitakt-ii.json).

## Qualification

Upstream reports exact stock reconstruction, sealed output, emulator boot and a working hardware build with Perform Direct. These remain attributed reports. The actual Perform Direct capture build uses DDR `0x47F00000–0x47F00240`: 556 bytes of runtime/tables plus 20 bytes BSS (576 total), no fast SRAM, and a 620-byte flash payload including 50 bytes of boot code and alignment. [The capture record](../perform-direct/media/capture.json) binds these allocations to the build. Worst-case cycles, a passed hardware stress project, owner verification and browser/native parity for this integration remain pending. This source is outside normal build discovery and publication. No firmware/DSP/stress tests belong in `npm run check`.

## Licence

Retain [LICENSE](LICENSE) and per-file SPDX/copyright notices. Elektron’s firmware remains the owner’s local input and is not covered by the source licence.
