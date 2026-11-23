# Model:Cycles base source

Modwerk's base for Model:Cycles OS 1.13 starts from core-mc 0.3 at `f20ffda`, the commit of
[Elekloader v0.11.0](https://github.com/elekloader/elekloader/releases/tag/v0.11.0). The imported `core-mc/`, the
shared `core/core.s` and `../include/model-cycles/` are byte-for-byte copies; the
[import record](../../../imports/core-mc-source-f20ffda.json) lists each file and its SHA-256. core-mc is drumkilla's,
on irpina's hook bus. Its firmware locations (0.2), `ev_boot` and the boot cache invalidation (0.3) came in through
Elekloader #192 to #194. The pinned kit's SDK has core-mc 0.1 and no Model:Cycles headers, so the headers come with the
import.

[base.json](base.json) builds from a copy of core-mc's `mod.json` ([copies](copies/core-mc/mod.json)) that differs in
the collections alone: each hook holds eight handlers instead of four, as [events.json](../events.json) records. Modwerk
adds no sources or sites yet.

The recipe checks that the base keeps every site, export, import, weak symbol, contribution, requirement and conflict
of the released `core-mc-0.3.elemod` (pinned in [`sdk/imports/elekloader-core-mc-v0.3.json`](../../../imports/elekloader-core-mc-v0.3.json)).
It leaves out the collections, whose room this base raises. To reproduce it, build with the toolchain of
`sdk/build/Dockerfile`, the kit-pinned Elekloader SDK and your local copy of the exact stock OS:

```sh
npm run machine:base -- model-cycles --stock /private/model-cycles_OS1.13.syx --out /private/mc-base
```

## Results

- Built 2026-11-23 with m68k-elf GCC 16.2.0 and binutils 2.47 against the kit at `3b31ef3`: package `dee352df…`
  (see [base-binding.json](../base-binding.json)), 76 bytes `.boot`, 180 `.run`, 16 `.bss`, 5 sites. Compared field by
  field with the release `core-mc-0.3.elemod` (`e214e171…`): equal except the collections (8 entries per hook instead
  of 4).
- Emulator, 2026-11-23: the image `101129e0…` (stock OS 1.13 with this base, nothing subscribed) boots in digiemu
  twice and plays a six-track pattern as stock does ([record](../../../../docs/verification/2026-11-23-model-cycles-base.md)).
  Not hardware evidence.
- On a unit, 2026-11-23: the same image boots after a power cycle and behaves as stock does (same record).
